/**
 * The inline formatting a bot message can carry, turned into tokens.
 *
 * Two syntaxes on purpose. WhatsApp's own (`*negrita*`, `_cursiva_`,
 * `~tachado~`, `` `mono` ``) is what a real lead sees, so a demo that ignored
 * it would look unlike production. Markdown's (`**negrita**`, `~~tachado~~`) is
 * what a model trained on markdown emits anyway, and leaving those asterisks on
 * screen reads as a glitch to the client testing.
 *
 * ponytail: no nesting. `*muy _raro_*` renders bold with the underscores
 * visible. Real bot messages are one emphasis at a time, and a real inline
 * parser is a different animal; when a client needs nesting, this is where it
 * goes.
 */
export type RichToken = {
  text: string;
  /** An http(s) link the bot wrote, so the reader can just tap it. */
  url?: string;
  bold?: boolean;
  italic?: boolean;
  strike?: boolean;
  mono?: boolean;
};

/** Ordered: a URL first, so its own `_` or `~` never reads as markup, then the
 *  two-character markers before their one-character versions, or `**x**`
 *  matches as bold("") plus stray text. */
const MARKUP = new RegExp(
  [
    "(?<u>https?:\\/\\/[^\\s<>\"']+)",
    "\\*\\*(?<b2>[^*\\n]+)\\*\\*",
    "\\*(?<b1>[^*\\n]+)\\*",
    "~~(?<s2>[^~\\n]+)~~",
    "~(?<s1>[^~\\n]+)~",
    "_(?<i>[^_\\n]+)_",
    "`(?<m>[^`\\n]+)`",
  ].join("|"),
  "g",
);

export function parseRichText(text: string): RichToken[] {
  const tokens: RichToken[] = [];
  let last = 0;
  for (const match of text.matchAll(MARKUP)) {
    const at = match.index ?? 0;
    if (at > last) tokens.push({ text: text.slice(last, at) });
    const g = match.groups ?? {};
    if (g.u !== undefined) {
      // Trailing punctuation belongs to the sentence, not to the link.
      const url = g.u.replace(/[.,;:!?)\]}]+$/, "");
      tokens.push({ text: url, url });
      last = at + url.length;
      continue;
    }
    if (g.b2 !== undefined || g.b1 !== undefined) {
      tokens.push({ text: (g.b2 ?? g.b1)!, bold: true });
    } else if (g.s2 !== undefined || g.s1 !== undefined) {
      tokens.push({ text: (g.s2 ?? g.s1)!, strike: true });
    } else if (g.i !== undefined) {
      tokens.push({ text: g.i, italic: true });
    } else if (g.m !== undefined) {
      tokens.push({ text: g.m, mono: true });
    }
    last = at + match[0].length;
  }
  if (last < text.length) tokens.push({ text: text.slice(last) });
  return tokens;
}
