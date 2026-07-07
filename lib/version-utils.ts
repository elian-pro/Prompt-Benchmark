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

// Matches a line DEDICATED to declaring the version ("Versión: 1.4",
// "Version 1.4", with or without the colon) — never a mention embedded in a
// longer sentence (e.g. a closing "FIN DEL PROMPT ... v1.4" footer), which is
// too easy to corrupt by editing text inside prose. No `g` flag: only the
// first (canonical, top-of-file) declaration is ever rewritten.
const VERSION_LINE = /^([ \t]*Versi[oó]n[ \t]*:?[ \t]*)v?\d+\.\d+[ \t]*$/im;

/**
 * Keeps a "Versión: X.Y" declaration line inside a prompt's own text in sync
 * with the DB version number being saved — deterministically, via regex,
 * never via the model (the Editor persona is explicitly forbidden from
 * touching version text; the Studio owns versioning). Lets the team identify
 * a prompt's version just by opening the file outside the app.
 *
 * `versionNumber` is the DB's "vX.Y" form; the declaration line convention
 * omits the leading "v" ("Versión: 1.4"), matching the team's own template.
 * If no dedicated line exists yet, one is inserted — right after a leading
 * `# ` title line when the content starts with one, otherwise as the very
 * first line — so every version going forward is identifiable at a glance.
 */
export function syncVersionLine(content: string, versionNumber: string): string {
  const bare = versionNumber.replace(/^v/i, "");

  if (VERSION_LINE.test(content)) {
    return content.replace(VERSION_LINE, (_match, label: string) => `${label}${bare}`);
  }

  const versionLine = `Versión: ${bare}`;
  const lines = content.split("\n");
  if (lines[0]?.trimStart().startsWith("#")) {
    let insertAt = 1;
    if (lines[insertAt]?.trim() === "") insertAt++;
    lines.splice(insertAt, 0, versionLine, "");
    return lines.join("\n");
  }
  return `${versionLine}\n\n${content}`;
}
