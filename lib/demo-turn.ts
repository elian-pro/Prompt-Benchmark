/**
 * One turn of a demo conversation: persist what the lead said, ask the client's
 * bot, persist the reply.
 *
 * Shared by the Playground (`/api/demo-sessions/[id]/messages`) and the public
 * client demo link (`/api/prueba/[token]/messages`). They differ in who is
 * allowed to call them, not in how a turn works, and the two must not drift:
 * the whole point of a demo link is that the client sees exactly what the user
 * sees in the Playground. That includes the client's tools: a bot that cannot
 * look up the catalog answers a different question than the one in production.
 *
 * The tool steps are deliberately not persisted as messages, so the next turn
 * sees the question and the answer and nothing in between, which is what n8n's
 * Simple Memory does to the agent it runs.
 */
import { appendMessage, type DemoMessageRow, type DemoSessionDetail } from "./db/demo-sessions";
import { getRoleDefault } from "./db/role-defaults";
import { getRuntimeTools } from "./db/client-tools";
import { RoleNotConfiguredError } from "./db/runs";
import { chat, type ChatMessage } from "./providers";
import { runToolLoop } from "./client-tools";
import { asEnvelope } from "./adversarial-message";

/**
 * Debug mode's contract, injected at the API layer (n8n output-parser style):
 * the field descriptions carry the instructions, so the system prompt under
 * test is never touched. Playground-only; the demo link never turns this on.
 */
const DEBUG_RESPONSE_FORMAT = {
  type: "json_schema",
  json_schema: {
    name: "debug_envelope",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        razonamiento: {
          type: "string",
          description:
            "Escribe esto PRIMERO, antes de decidir la respuesta: qué señales viste en las palabras literales del usuario, y por qué elegiste este estado y esta respuesta y no otra alternativa.",
        },
        regla_aplicada: {
          type: "string",
          description:
            'Nombre literal de la sección o regla del prompt del sistema que aplicaste en esta respuesta, o "ninguna - respuesta libre".',
        },
        estado: {
          type: "string",
          description: "El estado de la conversación según el prompt del sistema.",
        },
        mensajes: {
          type: "array",
          items: { type: "string" },
          description: "La respuesta al usuario, un elemento por burbuja.",
        },
      },
      required: ["razonamiento", "regla_aplicada", "estado", "mensajes"],
    },
  },
} as const;

export async function runDemoTurn(
  session: DemoSessionDetail,
  content: string,
  debug = false,
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

  // The client's own tools (their Supabase RPCs), the same ones their agent
  // calls in n8n. Empty for a client with none configured, and then this is a
  // single plain call, exactly as before.
  const tools = await getRuntimeTools(session.client_id);

  const { reply, steps } = await runToolLoop(
    {
      providerId: role.provider_id,
      modelName: role.model_name,
      systemPrompt: session.prompt_snapshot,
      messages,
      temperature: role.temperature ?? undefined,
      topP: role.top_p ?? undefined,
      maxTokens: role.max_tokens ?? undefined,
      // prompt_snapshot is frozen for the session, so the whole prefix is
      // stable and every turn after the first reads the history from cache.
      cache: true,
      responseFormat: debug ? DEBUG_RESPONSE_FORMAT : undefined,
    },
    tools,
    { chat },
  );

  const botMessage = await appendMessage(session.id, {
    turnNumber: nextTurn + 1,
    round: session.current_round,
    role: "bot",
    content: reply.content,
    // Only the Playground keeps the trace: on a demo link the client has no
    // business seeing the name of an internal RPC or a slice of its response.
    toolCalls: session.link_id === null && steps.length ? steps : null,
    versionNumberSnapshot: session.version_number_snapshot,
  });

  return { humanMessage, botMessage };
}
