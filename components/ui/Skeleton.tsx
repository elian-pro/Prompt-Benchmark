/**
 * Skeleton loading placeholders (docs/DESIGN-SYSTEM.md §Loading states):
 * pulsing surfaces that mirror the real layout so lists don't flash blank.
 */

/** Card-grid skeleton for the Library. */
export function SkeletonCards({ count = 6 }: { count?: number }) {
  return (
    <div className="client-grid" aria-hidden>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="skeleton-card">
          <div className="skeleton-bar" style={{ width: "55%" }} />
          <div className="skeleton-bar" style={{ width: "35%", height: 10 }} />
          <div
            className="skeleton-bar tall"
            style={{ width: "40%", marginTop: "auto" }}
          />
        </div>
      ))}
    </div>
  );
}

/** Row-list skeleton for session / run / provider lists. */
export function SkeletonRows({ count = 4 }: { count?: number }) {
  return (
    <div className="skeleton-list" aria-hidden>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="skeleton-row">
          <div className="skeleton-stack" style={{ flex: 1 }}>
            <div className="skeleton-bar" style={{ width: "28%" }} />
            <div className="skeleton-bar" style={{ width: "52%", height: 10 }} />
          </div>
          <div
            className="skeleton-bar"
            style={{ width: 64, height: 18, borderRadius: 100 }}
          />
        </div>
      ))}
    </div>
  );
}
