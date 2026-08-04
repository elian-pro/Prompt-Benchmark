/**
 * One turn of a demo conversation: persist what the lead said, ask the client's
 * bot, persist the reply.
 *
 * Shared by the Playground (`/api/demo-sessions/[id]/messages`) and the public
 * client demo link (`/api/prueba/[token]/messages`). They differ in who is
 * allowed to call them, not in how a turn works, and the two must not drift:
 * the whole point of a demo link is that the client sees exactly what the user
 * sees in the Playground.
 */
import { appendMessage, type DemoMessageRow, type DemoSessionDetail } from "./db/demo-sessions";
import { getRoleDefault } from "./db/role-defaults";
import { RoleNotConfiguredError } from "./db/runs";
import { chat, type ChatMessage } from "./providers";
import { asEnvelope } from "./adversarial-message";

export async function runDemoTurn(
  session: DemoSessionDetail,
  content: string,
): Promise<{ humanMessage: DemoMessageRow; botMessage: DemoMessageRow }> {
  const role = await getRoleDefault("test_bot");
  if (!role) {
    throw new RoleNotConfiguredError(
      "No hay un modelo asignado al rol Bot de prueba. Configúralo en Configuración.",
    );
  }

  // The bot's own past turns keep their raw JSON as `assistant` content (it
  // needs to see its own output shape to keep emitting it); only the display
  // layer reduces it to a readable bubble. The seeded opening message is the
  // exception: human-written plain text, wrapped here so it doesn't teach the
  // bot to answer without the envelope.
  const history: ChatMessage[] = session.messages.map((m) => ({
    role: m.role === "bot" ? "assistant" : "user",
    content: m.role === "bot" ? asEnvelope(m.content, session.prompt_snapshot) : m.content,
  }));
  const messages: ChatMessage[] = [...history, { role: "user", content }];

  const nextTurn = session.messages.length + 1;
  const humanMessage = await appendMessage(session.id, {
    turnNumber: nextTurn,
    round: session.current_round,
    role: "human",
    content,
    versionNumberSnapshot: session.version_number_snapshot,
  });

  const reply = await chat({
    providerId: role.provider_id,
    modelName: role.model_name,
    systemPrompt: session.prompt_snapshot,
    messages,
    temperature: role.temperature ?? undefined,
    topP: role.top_p ?? undefined,
    maxTokens: role.max_tokens ?? undefined,
    // prompt_snapshot is frozen for the session, so the whole prefix is stable
    // and every turn after the first reads the history from cache.
    cache: true,
  });

  const botMessage = await appendMessage(session.id, {
    turnNumber: nextTurn + 1,
    round: session.current_round,
    role: "bot",
    content: reply.content,
    versionNumberSnapshot: session.version_number_snapshot,
  });

  return { humanMessage, botMessage };
}
