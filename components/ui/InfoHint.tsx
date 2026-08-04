"use client";

import { IconInfoCircle } from "@tabler/icons-react";

/**
 * Small "i" icon that reveals an explanatory tooltip on hover / focus.
 * Keyboard accessible: the wrapper is focusable and exposes the text via
 * aria-label so the hint is reachable without a pointer.
 *
 * The tooltip opens upward by default, which is right for a hint sitting in a
 * form or a card. Use `placement="bottom"` when the icon lives near the top of
 * the page (a header): there is nothing above it, so the tooltip would open off
 * screen. The bottom variant also anchors to the right edge, since a hint that
 * high up is usually in a corner.
 */
export function InfoHint({
  text,
  placement = "top",
}: {
  text: string;
  placement?: "top" | "bottom";
}) {
  return (
    <span className="info-hint" tabIndex={0} role="note" aria-label={text}>
      <IconInfoCircle size={13} stroke={1.5} />
      <span className={`info-hint-tip info-hint-${placement}`} role="tooltip">
        {text}
      </span>
    </span>
  );
}
