/**
 * Minimal SQL tokenizer for showing the handover DDL in colour. Not a parser:
 * it only needs to tell apart the five things worth a different colour in a
 * read-only block, and anything it does not recognize stays plain, which is
 * why an unknown dialect degrades into grey text instead of wrong colours.
 *
 * The one invariant that matters: the tokens concatenated back are byte for
 * byte the input, so what is shown is exactly what the copy button copies.
 *
 * Pure module, no DOM, so it can be unit-tested directly.
 */
export type SqlTokenKind = "keyword" | "string" | "ident" | "number" | "comment" | "plain";

export type SqlToken = { text: string; kind: SqlTokenKind };

const KEYWORDS = new Set([
  "add", "all", "alter", "and", "as", "before", "begin", "bigint", "boolean", "by", "case",
  "column", "constraint", "create", "declare", "default", "delete", "drop", "each", "else",
  "elsif", "end", "exception", "execute", "exists", "for", "foreign", "from", "function",
  "generated", "grant", "identity", "if", "in", "index", "insert", "integer", "into", "is",
  "jsonb", "key", "language", "not", "now", "null", "on", "or", "others", "plpgsql", "primary",
  "references", "replace", "return", "returns", "row", "schema", "select", "sequences", "set",
  "table", "text", "then", "timestamptz", "to", "trigger", "unique", "update", "usage", "using",
  "values", "when", "where", "with",
]);

const TOKEN_RE =
  /(--[^\n]*|\/\*[\s\S]*?\*\/)|('(?:[^']|'')*')|("(?:[^"]|"")*")|(\b\d+\b)|([A-Za-z_][A-Za-z0-9_]*)/g;

export function tokenizeSql(sql: string): SqlToken[] {
  const tokens: SqlToken[] = [];
  let last = 0;
  for (const m of sql.matchAll(TOKEN_RE)) {
    const [text, comment, string, ident, number, word] = m;
    if (m.index > last) tokens.push({ text: sql.slice(last, m.index), kind: "plain" });
    const kind: SqlTokenKind = comment
      ? "comment"
      : string
        ? "string"
        : ident
          ? "ident"
          : number
            ? "number"
            : KEYWORDS.has(word.toLowerCase())
              ? "keyword"
              : "plain";
    tokens.push({ text, kind });
    last = m.index + text.length;
  }
  if (last < sql.length) tokens.push({ text: sql.slice(last), kind: "plain" });
  return tokens;
}
