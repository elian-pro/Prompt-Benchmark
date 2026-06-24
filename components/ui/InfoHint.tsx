"use client";

import { IconInfoCircle } from "@tabler/icons-react";

/**
 * Small "i" icon that reveals an explanatory tooltip on hover / focus.
 * Keyboard accessible: the wrapper is focusable and exposes the text via
 * aria-label so the hint is reachable without a pointer.
 */
export function InfoHint({ text }: { text: string }) {
  return (
    <span className="info-hint" tabIndex={0} role="note" aria-label={text}>
      <IconInfoCircle size={13} stroke={1.5} />
      <span className="info-hint-tip" role="tooltip">
        {text}
      </span>
    </span>
  );
}
