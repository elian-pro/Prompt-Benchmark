# Hotfix — Creator/Editor: `TypeError: network error` on large turns

**Reported**: 2026-07-23, Creator session "Basado en Fernando Wagner".
Symptom: the error log's bug button surfaces one entry, `ENVIAR MENSAJE ·
network error · TypeError: network error`, on the turn that builds the full
prompt (session at ↑65,792 input tokens).

**Goal**: stop long Creator/Editor turns from dying mid-stream, and make sure
that if a stream ever does drop, the work generated so far is not lost.

**Scope**: the shared streaming route `app/api/chat-sessions/[id]/messages`
(Editor + Creator) and the reverse proxy in front of the app. No product
behavior or UI flow changes.

## Root cause (from the audit)

1. The `TypeError: network error` is a **transport-level, mid-stream drop**,
   not an application error. In `send` (`components/sessions/SessionChat.tsx`),
   `res.ok` is `true` and the NDJSON stream starts, then `reader.read()`
   throws the native `TypeError` when the connection is severed. An
   application-level failure would surface a Spanish message instead.

2. **The first hypothesis (a reverse-proxy timeout) was investigated on the
   VPS and ruled out.** A live inspection of the production server on
   2026-07-23 established:
   - No container crash: the `prompt_studio` container was up continuously
     (`RestartCount=0`, `OOMKilled=false`) straight through the 9:59am error.
     The `Exited (1)` containers were the prior day's redeploys, not crashes.
     `dmesg` showed no OOM kills.
   - No proxy timeout: Traefik runs with `Args=["traefik"]` (no flags), no
     `traefik.yml` static file exists, and `main.yaml` has no
     `respondingTimeouts`/`writeTimeout`. Traefik is on its defaults, so with
     the route's 15s heartbeat keeping the stream non-idle, the proxy does not
     cut it. There is no proxy duration ceiling to raise.
   - No server-side error: the app logs for the exact failure window were
     empty. Nothing from the provider, the stream, or a broken pipe.

3. **Conclusion: a transient network drop between the browser and the VPS**
   (a wifi/VPN blip, a sleeping laptop, an ISP hiccup) during a long Creator
   turn. This fits every observation: the client sees a native transport
   `TypeError`, the server records nothing, and it happened once rather than
   systematically. A server-config cause would be systematic and would leave
   a trace; neither holds.

4. Two config signals are **no-ops in this deployment** (VPS via EasyPanel,
   per `docs/ARCHITECTURE.md`) and gave a false sense that timeouts were
   handled. They are not the cause, but they mislead the next reader:
   - `export const maxDuration` on the sibling routes
     (`demo-sessions/[id]/messages` = 60, `runs/[id]/execute` = 300) is a
     **Vercel-only** directive. It does nothing under a self-hosted
     `next start`.
   - `X-Accel-Buffering: no` (route response header) is an **nginx** hint.
     EasyPanel fronts the container with **Traefik**, which ignores it.

## Decisions (locked at planning)

1. **The fix is app-side resilience, not infrastructure.** The VPS
   inspection ruled out every server-side cause, so there is nothing to
   change on the server. Make the app survive an occasional dropped stream
   instead.
2. **Do not silently delete the Vercel-only config.** It is harmless and
   would matter if the app ever moves to Vercel. Annotate it as inert on
   EasyPanel instead, so the next reader is not misled again.
3. **No em dashes** anywhere in new text, per `CLAUDE.md` rule 9. Any new
   user-facing string is in Spanish; code, comments, and this doc in English.
4. **One ticket at a time.** T2 (salvage + logging) is the fix. T3 is
   independent cleanup and can be deferred.

## Tickets

### T1 — Raise the reverse-proxy timeout (infra) ❌ NOT NEEDED

Dropped after the VPS inspection (see Root cause 2). Traefik has no timeout
to raise, and no server-side cause was found. EasyPanel also does not expose
Traefik's `respondingTimeouts` in its UI, so this was never a panel change to
begin with. Kept here for the record.

If the error ever recurs **systematically** and cuts at a **consistent**
elapsed time (for example always ~180s), reopen this: that would point back
at an idle/duration ceiling and change the conclusion.

### T2 — Salvage the partial reply on stream error + log the failure (code) 🔨

Today the assistant message is only saved after the stream completes
(`appendMessage(... role: "assistant" ...)` runs after the `for await`
loop). If the connection drops at minute two, everything generated is lost
and the user starts over. And the `catch` block calls `controller.error(err)`
without logging, which is exactly why the failure window was empty in the VPS
logs. Fix both.

- Extract the draft-extraction + persist step into one `persistTurn` helper,
  used by both the normal completion path and the salvage path (no
  duplicated logic, no double-persist: the two paths are mutually exclusive).
- In the `start`'s `catch (err)` block: `console.error` the failure with
  session id and type (so a recurrence leaves a trace), then, if `fullText`
  is non-empty, persist it via `persistTurn` before `controller.error(err)`.
  Tokens are best-effort (`tokensOut` only arrives on the provider's final
  event, so a mid-stream drop leaves it at 0).
- Client (`SessionChat.tsx` `send` catch): after `reportError`, call
  `load({ silent: true })` so the salvaged reply surfaces immediately instead
  of looking lost until a manual reload.

**Done when**: killing a stream mid-flight leaves the partial reply saved and
visible without a manual reload, and the server logs the underlying error.

### T3 — Annotate the inert Vercel/nginx config (docs + comments) ⏳

Stop the false signal that timeouts are configured in code.

- Add a short comment on the sibling routes' `export const maxDuration`
  (`demo-sessions/[id]/messages`, `runs/[id]/execute`) noting it is a
  Vercel-only directive and inert under the current EasyPanel deployment;
  the real control is the proxy timeout (T1).
- Add the same note beside the `X-Accel-Buffering: no` header in the chat
  messages route (nginx-specific, ignored by Traefik).
- Record the operative proxy-timeout requirement in
  `docs/ARCHITECTURE.md` near the deployment note, so it is not lost.

**Done when**: a reader of the routes or the architecture doc understands
that stream duration is governed by the proxy, not by `maxDuration`.

## Definition of done

- If a stream drops mid-turn, the partial reply is persisted and shows on the
  next re-sync, not lost.
- The underlying stream failure is logged server-side, so a recurrence is no
  longer invisible in the container logs.
- The Vercel-only / nginx-only config no longer reads as if it governs this
  deployment.
- No em dashes in any text touched.

## Out of scope

- Reducing Creator's output size or streaming the draft incrementally to the
  client. Worth considering later, but the timeout fix is the direct cure.
- Any change to the Anthropic adapter or token budgets.
