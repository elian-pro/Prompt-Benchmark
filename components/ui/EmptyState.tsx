import type { ReactNode } from "react";

type Props = {
  /** Optional decorative icon (rendered in --faint). */
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  /** Primary call-to-action, typically a <Button>. */
  action?: ReactNode;
};

/** Consistent empty-state placeholder (docs/DESIGN-SYSTEM.md §Empty states). */
export function EmptyState({ icon, title, description, action }: Props) {
  return (
    <div className="empty-state">
      {icon && <div className="empty-state-icon">{icon}</div>}
      <p className="empty-state-title">{title}</p>
      {description && <p className="empty-state-desc">{description}</p>}
      {action && <div className="empty-state-action">{action}</div>}
    </div>
  );
}
