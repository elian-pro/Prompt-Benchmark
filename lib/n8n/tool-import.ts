/**
 * Turning a copied n8n tool node into a client tool.
 *
 * In n8n you select the HTTP Request Tool node, press copy, and the clipboard
 * holds its JSON. Everything the Library form asks for is already in there,
 * including the client's key in the headers, which is the field nobody wants
 * to retype. So the form can be filled by pasting instead of by hand.
 *
 * The parsing is deliberately forgiving and its result is never saved
 * directly: it fills the form, the user looks at it, and then saves. A lenient
 * parser nobody checks is worse than typing.
 */
import type { ToolParam } from "../providers/types";

export type ImportedTool = {
  name: string;
  description: string;
  url: string;
  headers: Record<string, string>;
  params: ToolParam[];
  bodyTemplate: Record<string, unknown>;
};

/** `$fromAI('nombre', 'descripción', 'tipo')`, single or double quoted. */
const FROM_AI = /\$fromAI\(\s*(['"])(.*?)\1\s*(?:,\s*(['"])([\s\S]*?)\3\s*)?(?:,\s*(['"])(\w+)\5)?/;
/** One `"clave": valor` per line, which is how n8n writes a jsonBody. */
const BODY_LINE = /^\s*"([^"]+)"\s*:\s*(.+?),?\s*$/;

function paramType(line: string, declared: string | undefined): ToolParam["type"] {
  if (declared === "number" || declared === "boolean") return declared;
  // `Number($fromAI(...))` says number even when the third argument is absent.
  if (/\bNumber\s*\(/.test(line)) return "number";
  return "string";
}

/**
 * Splits an n8n jsonBody into the arguments the model fills in and the fixed
 * fields. The text is not valid JSON (it carries `{{ }}` expressions), so it
 * is read line by line, which is how these bodies are always written.
 */
export function parseJsonBody(raw: string): {
  params: ToolParam[];
  bodyTemplate: Record<string, unknown>;
} {
  const params: ToolParam[] = [];
  const bodyTemplate: Record<string, unknown> = {};
  // Drop the leading '=' that marks the whole field as an n8n expression.
  for (const line of raw.replace(/^=/, "").split("\n")) {
    const m = BODY_LINE.exec(line);
    if (!m) continue;
    const [, key, rawValue] = m;
    const ai = FROM_AI.exec(rawValue);
    if (ai) {
      params.push({
        // The n8n side names the argument for itself ('searchTerm'); what the
        // endpoint expects is the JSON key, so that is the parameter's name.
        name: key,
        description: ai[4] ?? "",
        type: paramType(rawValue, ai[6]),
        // `|| null` is how the node says "leave it out when unknown", which is
        // exactly what an optional parameter means here.
        ...(/\|\|\s*null/.test(rawValue) ? { required: false } : {}),
      });
      continue;
    }
    if (rawValue.includes("{{")) continue; // an expression we cannot read
    try {
      bodyTemplate[key] = JSON.parse(rawValue);
    } catch {
      bodyTemplate[key] = rawValue.replace(/^"|"$/g, "");
    }
  }
  return { params, bodyTemplate };
}

function toTool(node: any): ImportedTool | null {
  const p = node?.parameters;
  if (!p?.url) return null;
  const headers: Record<string, string> = {};
  for (const h of p.headerParameters?.parameters ?? []) {
    // Content-Type is added by the executor; carrying it over is noise.
    if (!h?.name || h.name.toLowerCase() === "content-type") continue;
    headers[h.name] = String(h.value ?? "");
  }
  const { params, bodyTemplate } = parseJsonBody(String(p.jsonBody ?? ""));
  return {
    // n8n allows spaces in a node name; the model's function name does not.
    name: String(node.name ?? "").trim().replace(/\s+/g, "_"),
    description: String(p.toolDescription ?? "").trim(),
    url: String(p.url).replace(/^=/, "").trim(),
    headers,
    params,
    bodyTemplate,
  };
}

/**
 * Reads whatever n8n put on the clipboard: a single node, the `{nodes: [...]}`
 * wrapper a copy produces, or a whole exported workflow. Returns every HTTP
 * tool node it finds, in order.
 */
export function parseToolNodes(json: string): ImportedTool[] {
  let data: any;
  try {
    data = JSON.parse(json);
  } catch {
    throw new Error("Eso no es JSON. Copia el nodo en n8n y pégalo aquí.");
  }
  const nodes: any[] = Array.isArray(data)
    ? data
    : Array.isArray(data?.nodes)
      ? data.nodes
      : [data];
  const tools = nodes
    .filter((n) => String(n?.type ?? "").toLowerCase().includes("httprequesttool"))
    .map(toTool)
    .filter((t): t is ImportedTool => t !== null);
  if (tools.length === 0) {
    throw new Error(
      "No encontré ninguna herramienta HTTP en ese JSON. Copia el nodo de tipo HTTP Request Tool.",
    );
  }
  return tools;
}
