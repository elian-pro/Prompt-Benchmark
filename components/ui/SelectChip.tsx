"use client";

import type { ReactNode, SelectHTMLAttributes } from "react";
import { IconChevronDown } from "@tabler/icons-react";

type Props = Omit<SelectHTMLAttributes<HTMLSelectElement>, "className"> & {
  icon: ReactNode;
};

/**
 * A native <select> restyled as an obviously-clickable pill (leading icon +
 * label + chevron), matching the chip trigger Editor/Creator's client picker
 * uses (ClientChip) — a plain bottom-border <select> next to a lot of empty
 * modal whitespace read as inert placeholder text, not a control. Stays a
 * real <select> (no custom panel) so it carries none of the z-index/overflow
 * risk a floating dropdown would inside a Modal's own scroll container.
 */
export function SelectChip({ icon, value, disabled, ...rest }: Props) {
  const isSet = Boolean(value);
  return (
    <div className="select-chip">
      <select
        className={`select-chip-input${isSet ? " is-set" : ""}`}
        value={value}
        disabled={disabled}
        {...rest}
      />
      <span className="select-chip-icon">{icon}</span>
      <IconChevronDown size={13} className="select-chip-chevron" />
    </div>
  );
}
