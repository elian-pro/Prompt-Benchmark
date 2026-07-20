/**
 * Pure helpers for Smart Paste (Sprint 15): naming and threshold clamping.
 * Framework-agnostic and side-effect-free so both the composer UI and the
 * Settings card can share the exact same rules, and so they're easy to test.
 */

export const SMART_PASTE_THRESHOLD_MIN = 200;
export const SMART_PASTE_THRESHOLD_MAX = 10000;

const PASTE_NAME_RE = /^Texto pegado (\d+)\.txt$/;

/**
 * The next "Texto pegado N.txt" filename, given every filename already used
 * in this conversation (sent messages' attachments + the pending ones still
 * in the composer). Numbers are never reused, even if an earlier pasted
 * attachment was later removed, per the spec's "incrementando por cada
 * pegado dentro de la misma conversación".
 */
export function nextPasteName(existingFilenames: string[]): string {
  let max = 0;
  for (const name of existingFilenames) {
    const match = name.match(PASTE_NAME_RE);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `Texto pegado ${max + 1}.txt`;
}

/** Clamps a threshold to the allowed [200, 10000] range. */
export function clampThreshold(value: number): number {
  return Math.min(SMART_PASTE_THRESHOLD_MAX, Math.max(SMART_PASTE_THRESHOLD_MIN, value));
}
