"use client";

import { useId, useState, type ReactNode } from "react";
import { IconChevronDown } from "@tabler/icons-react";

/**
 * A card whose body collapses under its header (Settings navigation). The
 * header is a real <button> for the toggle; `actions` render beside it (not
 * inside), so action buttons never nest illegally within the toggle.
 */
export function CollapsibleCard({
  title,
  hint,
  actions,
  defaultOpen = false,
  children,
}: {
  title: string;
  /** Small right-aligned note in the header (e.g. a count). */
  hint?: string;
  /** Header buttons that act without toggling (e.g. "Agregar proveedor"). */
  actions?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = useId();

  return (
    <section className={`collapse-card${open ? " is-open" : ""}`}>
      <div className="collapse-head">
        <button
          type="button"
          className="collapse-toggle"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => setOpen((o) => !o)}
        >
          <IconChevronDown size={16} className="collapse-chevron" />
          <span className="collapse-title">{title}</span>
          {hint && <span className="collapse-hint">{hint}</span>}
        </button>
        {actions && <div className="collapse-actions">{actions}</div>}
      </div>
      <div id={bodyId} className="collapse-body">
        <div className="collapse-body-inner">
          <div className="collapse-content">{children}</div>
        </div>
      </div>
    </section>
  );
}
