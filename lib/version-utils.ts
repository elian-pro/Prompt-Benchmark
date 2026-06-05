/** Pure helpers for version numbers (no DB access). See docs/ARCHITECTURE.md. */

export type BumpType = "major" | "minor" | "imported";

export function parseVersion(v: string): { major: number; minor: number } {
  const m = /^v(\d+)\.(\d+)$/.exec(v.trim());
  if (!m) return { major: 1, minor: 0 };
  return { major: Number(m[1]), minor: Number(m[2]) };
}

/**
 * Computes the next version number from the latest one.
 * - minor: vX.Y → vX.(Y+1)
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
  return bumpType === "major" ? `v${major + 1}.0` : `v${major}.${minor + 1}`;
}
