# Sprint 5 — Visual polish

> **Status: ✅ complete (closed 2026-06-24).** Archived. This was the final
> planned sprint — the roadmap is now complete (see `docs/ROADMAP.md`
> "Future" for next steps). This file is kept for reference.

**Goal**: Apply the full Zebra design system across the app and add the polish
intentionally deferred through Sprints 1–4: theming, badges, safer destructive
actions, and the empty/loading/responsive/animation states that earlier
sprints skipped (they explicitly punted visual niceties to here).

This is the final planned sprint. It is cross-cutting: instead of new product
surfaces, it refines the four existing sections (Library, Editor, Creator,
Adversarial Lab) and Settings.

**Out of scope**: new features or behavior changes. If a polish item reveals a
functional bug, fix it, but don't expand scope.

> Source: `docs/ROADMAP.md` (Sprint 5) and `docs/DESIGN-SYSTEM.md`. The scope
> below is the contract; the ticket-by-ticket breakdown is **to be planned**
> (see "Tickets") before implementation starts.

---

## Includes

- **Full Zebra design system** applied per `docs/DESIGN-SYSTEM.md` (colors,
  typography, spacing, component patterns) — replacing any ad-hoc inline styles
  accumulated in earlier sprints.
- **Dark/light mode toggle**.
- **Badges**: `NEW` and `NEW VERSION`. (Note: a `NEW` badge already exists in
  `components/library/ClientCard.tsx`, derived from `created_at <= 15 days`, and
  `NEW VERSION` from `latest_version_created_at <= 5 days` — planning should
  audit what's already implemented and finish the rest rather than redo it.)
- **Two-step delete with typed-confirmation** for destructive actions (audit
  the existing `DeleteClientModal` first).
- **Empty states** and **loading states** across all sections.
- **Mobile responsive** layout.
- **Animation polish** (transitions, micro-interactions).

## Definition of done

- The app visually matches the Zebra design system; no leftover ad-hoc styling.
- Theme toggle works and persists.
- Badges, empty states, loading states, and destructive-action confirmations
  are consistent across Library, Editor, Creator, Adversarial Lab and Settings.
- The app is usable on mobile widths.

## Decisions (locked at planning, 2026-06-23)

These resolve the open questions. Build against them.

1. **Audit before building — this is a finishing sprint.** Most of the design
   system already exists. As of planning:
   - `app/globals.css` already defines **both** dark and light token sets on
     `body[data-theme="dark|light"]`, plus button/card/input/modal/toggle/badge
     primitives. Earlier sprints did not accumulate much ad-hoc styling.
   - Badges (`components/ui/Badge.tsx` + `.badge-*` CSS) already exist for
     `new` / `new-version` / `legacy`.
   - The two-step typed-confirmation delete already exists end-to-end in
     `components/library/DeleteClientModal.tsx`.
   So each ticket starts by auditing what's shipped and only fills the gaps.

2. **Theme: no new dependency.** Keep the existing CSS-variables +
   `body[data-theme]` mechanism. Persist the choice in `localStorage`
   (`zebra-theme`), default `dark`. Avoid the flash-of-wrong-theme with a tiny
   blocking inline script in `app/layout.tsx`'s `<head>` that reads
   `localStorage` and sets `data-theme` before first paint. A small client
   `ThemeToggle` component flips the attribute and writes `localStorage`. **No
   React context provider, no `next-themes`** — that would be a new dependency
   (rule 3) and the attribute approach already works app-wide via CSS vars.

3. **Inline-style extraction: minimal.** The only repeated inline styles are
   `style={{ color: "var(--accent|danger)" }}` on modal icons. Extract those
   into utility classes (`.icon-accent`, `.icon-danger`); leave genuinely
   one-off positional styles inline. Do not churn working CSS.

4. **Mobile responsive: mostly CSS, one structural exception.** Section grids
   and two-column chat/detail layouts already collapse via existing
   breakpoints. The pass is per-section verification + padding/stacking tweaks.
   The one component needing real work is the header nav (`.app-nav`): five
   tracked links overflow narrow widths — handle with horizontal scroll/wrap or
   a compact treatment. No data-model or component-structure changes beyond nav.

5. **Slice by concern, not by section** (per the sprint contract), bottom-up:
   tokens/theme → shared components (badges, destructive modals) → states
   (empty, loading) → responsive → animation → wrap-up.

---

## Tickets

Branch `sprint-5/ticket-X-short-name`; one logical change per commit
(Conventional Commits). Each ticket opens with a short audit, then fills gaps.

### S5-T1 — Design-system audit + token/style consolidation

`app/globals.css`, modal components.

**Tasks**:
- Sweep all `app/**` and `components/**` for ad-hoc inline styles and values
  that should be tokens; list findings in the commit body.
- Extract the repeated modal-icon colors into `.icon-accent` / `.icon-danger`
  utilities; replace the inline `style={{ color: … }}` usages.
- Reconcile any stray hex values (e.g. severity reds `#f87171`/`#fbbf24` in
  report CSS) against the design-system tokens; promote to tokens if reused.

**Done when**: no unjustified inline styling remains; colors resolve to tokens;
no visual regression in dark mode.

**Commits**: 1-2.

---

### S5-T2 — Dark/light theme toggle + persistence

`app/layout.tsx`, `components/ui/ThemeToggle.tsx`.

**Tasks**:
- Add the no-flash inline script in `<head>` that applies `data-theme` from
  `localStorage` (`zebra-theme`, default `dark`) before paint.
- Build `ThemeToggle` (client) using `IconMoon`/`IconSun`, placed in the header;
  flips `body[data-theme]` and persists.
- Verify every section reads correctly in light mode (the tokens already exist).

**Done when**: toggling switches theme instantly, persists across reloads, and
no flash occurs on load.

**Commits**: 1-2.

---

### S5-T3 — Badges: audit + finish coverage

`components/ui/Badge.tsx`, Library + version views.

**Tasks**:
- Audit where `NEW` (`created_at` ≤ 15 days) and `NEW VERSION`
  (`latest_version_created_at` ≤ 5 days) are already rendered (ClientCard) and
  where they're missing (e.g. version list in `app/library/[id]`).
- Apply `LEGACY` tag to non-production/old versions per the design system.
- Ensure consistent shape/placement across all surfaces.

**Done when**: badges render consistently wherever the rules apply, with no
duplicated derivation logic.

**Commits**: 1-2.

---

### S5-T4 — Two-step destructive confirmations everywhere

Generalize `DeleteClientModal` → shared modal; apply to other destructive
actions.

**Tasks**:
- Audit destructive actions: client delete (done), version delete, chat/editor
  & creator session delete, run delete, provider delete.
- Extract the reusable two-step (soft warning → typed confirmation) modal into
  a shared component; keep client delete behavior identical.
- Wire the remaining destructive actions through it (typed confirmation only
  where loss is irreversible; a single confirm step is fine for lighter cases —
  document the choice per action).

**Done when**: every destructive action routes through the consistent
confirmation pattern; nothing deletes on a single unguarded click.

**Commits**: 2-3.

---

### S5-T5 — Empty states across all sections

Library, Editor, Creator, Adversarial, Settings.

**Tasks**:
- Replace placeholder `.empty-hint`/ad-hoc "no hay…" text with a consistent
  empty-state pattern (centered label in `--muted` + action button), per
  `docs/DESIGN-SYSTEM.md` §Empty states.
- Cover: empty Library, no sessions (Editor/Creator), no runs (Adversarial),
  no providers/roles (Settings).

**Done when**: every list/section has a designed empty state with the relevant
primary action. All copy in Spanish.

**Commits**: 2.

---

### S5-T6 — Loading states / skeletons

All sections + chat/streaming surfaces.

**Tasks**:
- Add skeleton cards (pulsing `--surface`, per design-system spec) for
  Library/session/run lists while data loads.
- Add inline loading affordances for chat send / run execution / version save.

**Done when**: no section flashes blank or janks on first load; skeletons match
the design system.

**Commits**: 2.

---

### S5-T7 — Mobile responsive pass

`app/globals.css`, `app/layout.tsx` (nav).

**Tasks**:
- Verify each section at ≤600px; fix padding/stacking via existing breakpoints.
- Rework the header nav for narrow widths (scroll/wrap or compact), the one
  structural change.
- Confirm modals, chat layouts, and detail grids are usable on mobile.

**Done when**: the app is fully usable at mobile widths with no overflow or
clipped controls.

**Commits**: 2-3.

---

### S5-T8 — Animation polish

Cross-cutting micro-interactions.

**Tasks**:
- Modal/toast enter-exit transitions; button/card hover refinements; nav-tab
  underline transition; streaming "typing" cursor in chat.
- Respect `prefers-reduced-motion`.

**Done when**: interactions feel polished and consistent; nothing animates
under reduced-motion.

**Commits**: 1-2.

---

### S5-T9 — Sprint close + roadmap wrap-up

Docs only.

**Tasks**:
- Mark `docs/ROADMAP.md` Sprint 5 ✅ and note the roadmap is complete.
- Update the "Active sprint" line in `CLAUDE.md` to reflect no Sprint 6;
  point to `docs/ROADMAP.md` "Future (not in current scope)".
- Archive this file as `docs/SPRINT-5-archive.md`.

**Done when**: docs reflect a closed roadmap and the archive exists.

**Commits**: 1.

---

This is the last sprint in the current roadmap. When Sprint 5 is done (S5-T9),
there is no Sprint 6 to point to — the roadmap's "Future" section lists what
comes next.
