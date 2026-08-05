"use client";

import { usePathname } from "next/navigation";
import {
  IconLibrary,
  IconPencil,
  IconSparkles,
  IconFlask,
  IconSettings,
  IconLogout,
} from "@tabler/icons-react";

import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { NotificationsBell } from "@/components/layout/NotificationsBell";

/**
 * The Studio chrome. Split out of the root layout so it can be absent, not just
 * hidden, on the routes a client opens.
 *
 * Hiding it with CSS was not enough once `/prueba` existed: the watchers inside
 * it keep polling authenticated endpoints, which for a visitor with no session
 * is a redirect to /login every few seconds. Returning null stops the work
 * rather than covering it up, and every future header widget inherits that for
 * free.
 */
const NAV_ITEMS = [
  { label: "Editor", href: "/editor", Icon: IconPencil },
  { label: "Creator", href: "/creator", Icon: IconSparkles },
  { label: "Lab", href: "/lab", Icon: IconFlask },
  { label: "Biblioteca", href: "/library", Icon: IconLibrary },
  { label: "Settings", href: "/settings", Icon: IconSettings },
];

/** Route prefixes that are not the Studio. Keep in sync with the public
 *  prefixes excluded in `middleware.ts`. */
const PUBLIC_PREFIXES = ["/prueba"];

export function AppHeader() {
  const pathname = usePathname();
  if (PUBLIC_PREFIXES.some((prefix) => pathname?.startsWith(prefix))) return null;

  return (
    <header className="app-header">
      <span className="pill-logo">Zebra · Prompt Studio</span>
      <div className="header-right">
        <nav className="app-nav">
          {NAV_ITEMS.map(({ label, href, Icon }) => (
            <a key={href} href={href}>
              <Icon className="nav-icon" size={14} stroke={1.5} />
              {label}
            </a>
          ))}
        </nav>
        <NotificationsBell />
        <ThemeToggle />
        <form action="/api/auth/logout" method="post" className="logout-form">
          <button
            type="submit"
            className="btn btn-ghost btn-sm logout-btn"
            title="Cerrar sesión"
            aria-label="Cerrar sesión"
          >
            <IconLogout size={14} stroke={1.5} />
          </button>
        </form>
      </div>
    </header>
  );
}
