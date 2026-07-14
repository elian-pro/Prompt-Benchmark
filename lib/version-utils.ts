/** Pure helpers for version numbers (no DB access). See docs/ARCHITECTURE.md. */

export type BumpType = "major" | "minor" | "imported";

export function parseVersion(v: string): { major: number; minor: number } {
  const m = /^v(\d+)\.(\d+)$/.exec(v.trim());
  if (!m) return { major: 1, minor: 0 };
  return { major: Number(m[1]), minor: Number(m[2]) };
}

/**
 * Computes the next version number from the latest one.
 * - minor: vX.Y → vX.(Y+1); at .9 it rolls over to the next integer
 *   (v2.9 → v3.0), so the minor part never goes past one digit.
 * - major: vX.Y → v(X+1).0
 * - imported: returns the explicit override (required).
 */
export function computeNextNumber(
  latest: string | null,
  bumpType: BumpType,
  override?: string,
): string {
  if (bumpType === "imported") {
    if (!override) throw new Error("Una versión importada requiere version_number.");
    return override;
  }
  const { major, minor } = parseVersion(latest ?? "v1.0");
  if (bumpType === "major" || minor >= 9) return `v${major + 1}.0`;
  return `v${major}.${minor + 1}`;
}

// A line DEDICATED to declaring the version in the OLD style ("Versión: 1.4",
// "Version 1.4", with or without the colon). We no longer keep this line; the
// version now lives in the title's `vX.Y` token and a closing footer, so any
// such line is stripped on sync.
const VERSION_DECL_LINE = /^[ \t]*Versi[oó]n[ \t]*:?[ \t]*v?\d+\.\d+[ \t]*$/i;

// A closing footer heading, e.g. "# FIN DEL PROMPT ... v1.4". Matched so it can
// be regenerated in sync with the version rather than left to drift.
const FOOTER_LINE = /^[ \t]*#+[ \t]+FIN DEL\b/i;

// A heading line with content (the title is the first one that isn't a footer).
const HEADING_LINE = /^[ \t]*#+[ \t]+\S/;

// A "vMAJOR.MINOR" token inside a title, e.g. the "v1.4" in "... COCO IA v1.4".
const VERSION_TOKEN = /v\d+\.\d+/g;

/** Replaces the last `vX.Y` token in a heading, or appends one if absent. */
function withVersionToken(line: string, ver: string): string {
  const matches = [...line.matchAll(VERSION_TOKEN)];
  if (matches.length === 0) return `${line.replace(/[ \t]+$/, "")} ${ver}`;
  const last = matches[matches.length - 1];
  return line.slice(0, last.index) + ver + line.slice(last.index! + last[0].length);
}

/**
 * Keeps a prompt's own text identifiable by version, deterministically (via
 * string ops, never the model). Given the DB version number being saved, it:
 *
 * 1. Rewrites the `vX.Y` token in the title (the first heading) to match, or
 *    appends ` vX.Y` if the title has no version token yet.
 * 2. Removes any old-style dedicated "Versión: X.Y" declaration line.
 * 3. Regenerates a closing footer that mirrors the title with a "FIN DEL "
 *    prefix, e.g. "# FIN DEL PROMPT ... v1.4", as the last line.
 *
 * So "# PROMPT CONVERSACIONAL - COCO IA v1.4" + a matching footer replace the
 * former "Versión: 1.4" line. Idempotent: re-running yields the same text.
 *
 * Fallback: a prompt with no heading at all gets a bare "vX.Y" line at the top
 * and no footer (nothing to derive one from). This is a corner case; real
 * prompts always open with a `# ` title.
 */
export function syncVersionMarkers(content: string, versionNumber: string): string {
  const { major, minor } = parseVersion(versionNumber);
  const ver = `v${major}.${minor}`;

  // Drop old declaration lines and any existing footer (regenerated below).
  let lines = content
    .split("\n")
    .filter((l) => !VERSION_DECL_LINE.test(l) && !FOOTER_LINE.test(l));

  // Tidy the edges the removals may have left behind, without touching
  // intentional spacing between inner blocks.
  while (lines.length && lines[0].trim() === "") lines.shift();
  while (lines.length && lines[lines.length - 1].trim() === "") lines.pop();

  const titleIdx = lines.findIndex((l) => HEADING_LINE.test(l));
  if (titleIdx === -1) {
    return [ver, "", ...lines].join("\n");
  }

  const syncedTitle = withVersionToken(lines[titleIdx], ver);
  lines[titleIdx] = syncedTitle;

  const footer = syncedTitle.replace(/^([ \t]*#+[ \t]+)/, "$1FIN DEL ");
  return [...lines, "", footer].join("\n");
}
