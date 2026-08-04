/**
 * A small in-process rate limiter, for the one place in this app that takes
 * requests from outside the company login: the client demo link, whose
 * messages cost money on every turn.
 *
 * Two rules at once, because they stop different things. `minGapMs` stops a
 * held-down enter key and double submits. `maxPerWindow` stops someone who
 * paces themselves from burning a day of tokens.
 *
 * ponytail: state lives in memory, so the counters are per instance and reset
 * on deploy. That is correct for a single container, which is how this runs
 * today on EasyPanel. If it is ever scaled to more than one, move the hits to
 * Postgres (a table keyed by ip with a timestamp array) or Redis. The caps in
 * `demo_links` are the real backstop; this only smooths the burst.
 */

export type RateRule = {
  /** Minimum spacing between two accepted hits. */
  minGapMs: number;
  /** How many hits fit in `windowMs`. */
  maxPerWindow: number;
  windowMs: number;
};

/** What a client demo link allows per IP: a message every 3 seconds, 30 an
 *  hour. A real person testing a bot types slower than that. */
export const DEMO_MESSAGE_RULE: RateRule = {
  minGapMs: 3_000,
  maxPerWindow: 30,
  windowMs: 60 * 60 * 1_000,
};

export type RateVerdict = {
  ok: boolean;
  /** How long to wait, in ms. Zero when `ok`. Becomes the Retry-After header. */
  retryAfterMs: number;
};

/** Above this many tracked keys, evict everything already expired. Chosen so
 *  the sweep never runs in normal use and memory still cannot grow forever. */
const SWEEP_THRESHOLD = 1_000;

export function createRateLimiter(rule: RateRule) {
  const hits = new Map<string, number[]>();

  function sweep(now: number): void {
    for (const [key, times] of hits) {
      if (times.length === 0 || now - times[times.length - 1] >= rule.windowMs) {
        hits.delete(key);
      }
    }
  }

  return {
    /**
     * Records a hit for `key` and says whether it is allowed. A rejected hit
     * is not recorded, so hammering the endpoint cannot push the window out
     * and lock someone out for longer than the rule says.
     */
    check(key: string, now: number = Date.now()): RateVerdict {
      if (hits.size > SWEEP_THRESHOLD) sweep(now);

      const times = (hits.get(key) ?? []).filter((t) => now - t < rule.windowMs);

      const last = times[times.length - 1];
      if (last !== undefined && now - last < rule.minGapMs) {
        hits.set(key, times);
        return { ok: false, retryAfterMs: rule.minGapMs - (now - last) };
      }

      if (times.length >= rule.maxPerWindow) {
        hits.set(key, times);
        return { ok: false, retryAfterMs: rule.windowMs - (now - times[0]) };
      }

      times.push(now);
      hits.set(key, times);
      return { ok: true, retryAfterMs: 0 };
    },

    /** Test seam. */
    size(): number {
      return hits.size;
    },
  };
}
