import type { ReactNode } from "react";

export type BadgeVariant = "new" | "new-version" | "legacy";

export function Badge({
  variant,
  children,
}: {
  variant: BadgeVariant;
  children: ReactNode;
}) {
  return <span className={`badge badge-${variant}`}>{children}</span>;
}
