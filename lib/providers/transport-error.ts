/**
 * A connection to the provider that breaks mid-request surfaces as an opaque
 * one word message: "terminated" (undici, Node's fetch), "fetch failed",
 * "Connection error." (the Anthropic SDK). The real reason hides in
 * `err.cause`, which neither the operator's error log nor `err.stack` shows,
 * so the failure reaches both as a single unreadable word.
 *
 * This names the provider and unwraps the cause, leaving the original as the
 * new error's `cause`. Applied in `providers/index` so every LLM call in the
 * app gets it, not just the Editor turn that reported it.
 */
const TRANSPORT_FAILURE =
  /^(terminated|fetch failed|network error|connection error\.?|socket hang up|premature close|other side closed)$/i;

export function withTransportContext(err: unknown, providerName: string): unknown {
  if (!(err instanceof Error) || !TRANSPORT_FAILURE.test(err.message.trim())) return err;
  const cause = err.cause instanceof Error ? ` (${err.cause.message})` : "";
  return new Error(
    `Se cortó la conexión con el proveedor "${providerName}" mientras respondía${cause}. Vuelve a enviar el mensaje.`,
    { cause: err },
  );
}
