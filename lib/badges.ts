/**
 * Shared badge-derivation rules for the Library (docs/DESIGN-SYSTEM.md §Badges).
 * Single source of truth for the recency thresholds so cards and version lists
 * stay consistent.
 */
import { daysBetween } from "./format";
import type { BumpType } from "./version-utils";

export const NEW_CLIENT_MAX_DAYS = 15;
export const NEW_VERSION_MAX_DAYS = 5;

/** NEW: a non-legacy client created within the last 15 days. */
export function isNewClient(
  createdAt: string,
  isLegacy: boolean,
  now: number = Date.now(),
): boolean {
  return !isLegacy && daysBetween(createdAt, now) <= NEW_CLIENT_MAX_DAYS;
}

/** NEW VERSION: a recent major bump (production promotion) within 5 days. */
export function isNewVersion(
  bumpType: BumpType | null,
  createdAt: string | null,
  now: number = Date.now(),
): boolean {
  return (
    bumpType === "major" &&
    createdAt !== null &&
    daysBetween(createdAt, now) <= NEW_VERSION_MAX_DAYS
  );
}
