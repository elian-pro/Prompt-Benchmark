/**
 * Reading and writing the system prompt of an n8n AI Agent node.
 *
 * All client prompts live in a node of type `@n8n/n8n-nodes-langchain.agent`,
 * in `parameters.options.systemMessage`. A workflow may hold several agents,
 * so the Studio never guesses: a binding stores the chosen node's id (with the
 * name as a fallback) and we re-locate it on every operation.
 *
 * n8n expression gotcha: a parameter string that starts with `=` is an
 * EXPRESSION, and its `{{ ... }}` segments are interpolated at runtime (e.g.
 * to inject the lead's name). We must preserve that prefix on every push, and
 * surface warnings when a push would break interpolation. See
 * docs/N8N-SYNC-PLAN.md section 7.3.
 *
 * This module is pure (no network, no DB) so it can be unit-tested directly.
 */

export const AI_AGENT_TYPE = "@n8n/n8n-nodes-langchain.agent";

/** Minimal shape of an n8n node. Unknown keys are preserved by callers. */
export type N8nNode = {
  id: string;
  name: string;
  type: string;
  parameters?: Record<string, any>;
  [key: string]: unknown;
};

/** Minimal shape of an n8n workflow as returned by GET /workflows/{id}. */
export type N8nWorkflow = {
  id?: string;
  name: string;
  nodes: N8nNode[];
  connections: Record<string, unknown>;
  settings?: Record<string, unknown>;
  [key: string]: unknown;
};

export type AgentNodeSummary = {
  node_id: string;
  node_name: string;
  /** First line of the system prompt, trimmed, for the binding picker. */
  preview: string;
  /** Whether the stored systemMessage is an n8n expression (starts with `=`). */
  expression_prefix: boolean;
};

/** The system prompt as the human sees it, plus how n8n stored it. */
export type SystemMessage = {
  /** The prompt text WITHOUT the leading `=` expression marker. */
  text: string;
  /** True when the original value started with `=` (an n8n expression). */
  expression_prefix: boolean;
};

/** Warning codes for a prospective push. The UI maps these to Spanish copy. */
export type PushWarning =
  /** Current node interpolates data ({{ }}) but the new prompt does not:
   *  pushing would drop the interpolation. */
  "drops_interpolation";

const PREVIEW_MAX = 120;

export function isAgentNode(node: N8nNode): boolean {
  return node?.type === AI_AGENT_TYPE;
}

/** Detects n8n interpolation tokens (`{{ ... }}`) in a string. */
export function hasExpressionTokens(text: string): boolean {
  return /\{\{[\s\S]*?\}\}/.test(text);
}

/**
 * Reads `parameters.options.systemMessage`, splitting off the `=` expression
 * marker. Missing options / value yields an empty prompt (a freshly created
 * agent), never throws.
 */
export function readSystemMessage(node: N8nNode): SystemMessage {
  const raw = node?.parameters?.options?.systemMessage;
  if (typeof raw !== "string" || raw.length === 0) {
    return { text: "", expression_prefix: false };
  }
  if (raw.startsWith("=")) {
    return { text: raw.slice(1), expression_prefix: true };
  }
  return { text: raw, expression_prefix: false };
}

/** Builds the raw value n8n should store, re-applying the `=` marker. */
export function toRawSystemMessage(text: string, expressionPrefix: boolean): string {
  return expressionPrefix ? `=${text}` : text;
}

/**
 * Returns the raw stored systemMessage (WITH any `=` marker), or "" when
 * absent. Used for drift hashing and rollback snapshots, where we compare the
 * exact string n8n holds rather than the human-facing text.
 */
export function rawSystemMessage(node: N8nNode): string {
  const raw = node?.parameters?.options?.systemMessage;
  return typeof raw === "string" ? raw : "";
}

/**
 * Returns a deep clone of `node` with its systemMessage set to `text`,
 * preserving the expression marker per `expressionPrefix`. The original node
 * is untouched. `options` is created if the node did not have one.
 */
export function writeSystemMessage(
  node: N8nNode,
  text: string,
  expressionPrefix: boolean,
): N8nNode {
  return setRawSystemMessage(node, toRawSystemMessage(text, expressionPrefix));
}

/**
 * Returns a deep clone of `node` with its systemMessage set to the exact raw
 * string given (marker included, if any). Used for rollback: a sync event's
 * `previous_content` is already the raw value n8n held, so it's written back
 * verbatim rather than re-derived from expressionPrefix.
 */
export function setRawSystemMessage(node: N8nNode, raw: string): N8nNode {
  const clone: N8nNode = structuredClone(node);
  const params = (clone.parameters ??= {});
  const options = (params.options ??= {});
  options.systemMessage = raw;
  return clone;
}

function previewOf(text: string): string {
  const firstLine = text.replace(/^=/, "").split("\n").find((l) => l.trim().length > 0) ?? "";
  const trimmed = firstLine.trim();
  return trimmed.length > PREVIEW_MAX ? `${trimmed.slice(0, PREVIEW_MAX)}…` : trimmed;
}

/**
 * Lists every AI Agent node in a workflow, with a prompt preview. Feeds the
 * binding picker so the user can recognize the right agent when a workflow
 * has more than one.
 */
export function listAgentNodes(workflow: N8nWorkflow): AgentNodeSummary[] {
  return (workflow?.nodes ?? []).filter(isAgentNode).map((node) => {
    const sm = readSystemMessage(node);
    return {
      node_id: node.id,
      node_name: node.name,
      preview: previewOf(sm.text),
      expression_prefix: sm.expression_prefix,
    };
  });
}

export type LocateResult =
  | { ok: true; node: N8nNode; matched_by: "id" | "name" }
  | { ok: false; reason: "not_found" | "not_agent" };

/**
 * Locates the node a binding points at. Primary key is the stable node id;
 * if the workflow was rebuilt by hand (ids change, names usually survive) we
 * fall back to the node name and flag `matched_by: "name"` so the caller can
 * re-confirm and refresh the stored id. If the located node is no longer an
 * AI Agent, we refuse rather than write into the wrong node type.
 */
export function locateBoundAgent(
  workflow: N8nWorkflow,
  binding: { node_id: string; node_name?: string | null },
): LocateResult {
  const nodes = workflow?.nodes ?? [];
  let node = nodes.find((n) => n.id === binding.node_id);
  let matchedBy: "id" | "name" = "id";

  if (!node && binding.node_name) {
    node = nodes.find((n) => n.name === binding.node_name);
    matchedBy = "name";
  }
  if (!node) return { ok: false, reason: "not_found" };
  if (!isAgentNode(node)) return { ok: false, reason: "not_agent" };
  return { ok: true, node, matched_by: matchedBy };
}

/**
 * Warnings for pushing `nextText` into a field whose current raw value is
 * `currentRaw`. Pure and deterministic. See docs/N8N-SYNC-PLAN.md 7.3.
 */
export function computePushWarnings(input: {
  currentRaw: string | undefined;
  nextText: string;
}): PushWarning[] {
  const { currentRaw, nextText } = input;
  const warnings: PushWarning[] = [];

  const currentHasTokens = typeof currentRaw === "string" && hasExpressionTokens(currentRaw);
  const nextHasTokens = hasExpressionTokens(nextText);

  // A prompt legitimately carrying {{ }} in an expression field is the normal
  // case here (every client prompt uses interpolation), so it is not flagged;
  // only LOSING interpolation the node already relies on is worth a warning.
  if (currentHasTokens && !nextHasTokens) warnings.push("drops_interpolation");
  return warnings;
}
