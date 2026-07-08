/**
 * Preset client segments, shown as selectable chips when creating or importing
 * a client. Free-text custom segments are no longer offered in the UI, but the
 * `segment` column stays free-text so any value imported before this change is
 * preserved (the picker renders an unknown value as an extra chip).
 */
export const SEGMENT_OPTIONS = ["Inmo", "Foods", "Wellness"] as const;

export type Segment = (typeof SEGMENT_OPTIONS)[number];
