/**
 * Whether a client arriving at a demo link sees the instructions, and in which
 * form.
 *
 * The browser expires nothing on its own, so the "same visit" window is
 * measured here: what is stored is when they were last active, and half an
 * hour of silence ends the visit. Pure so the four cases can be checked
 * without a DOM.
 */
export const VISIT_MS = 30 * 60 * 1000;

export type GateState = {
  /** Skip the instructions: they were here a moment ago. */
  started: boolean;
  /** Reveal the points one at a time. Only ever true for someone who has
   *  never opened this link. */
  stepped: boolean;
};

export function gateStateFor(stored: string | null, now: number): GateState {
  const at = stored === null ? null : Number(stored);
  // Never seen: the full first-visit walkthrough.
  if (at === null || Number.isNaN(at)) return { started: false, stepped: true };
  // Still the same visit: they read it minutes ago, do not lecture them.
  if (now - at < VISIT_MS) return { started: true, stepped: false };
  // Back after a while: the whole card at once, one button. Older versions
  // stored "1", which lands here, which is the right place for it.
  return { started: false, stepped: false };
}
