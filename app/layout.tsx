import type { Metadata } from "next";
import { Inter } from "next/font/google";
import {
  IconLibrary,
  IconPencil,
  IconSparkles,
  IconTarget,
  IconSettings,
} from "@tabler/icons-react";
import "./globals.css";

// Two weights only, per docs/DESIGN-SYSTEM.md (never 600/700).
const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "ZEBRA · Prompt Studio",
  description: "Herramienta interna del equipo de paid media de Zebra.",
};

// Placeholder nav row — links are non-functional until their sections land
// in later tickets (Library S1-T9, Settings S1-T6, etc.).
const NAV_ITEMS = [
  { label: "Biblioteca", href: "/library", Icon: IconLibrary },
  { label: "Editor", href: "/editor", Icon: IconPencil },
  { label: "Creator", href: "/creator", Icon: IconSparkles },
  { label: "Adversarial", href: "/adversarial", Icon: IconTarget },
  { label: "Settings", href: "/settings", Icon: IconSettings },
];

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className={inter.className}>
      <body data-theme="dark">
        <div className="app-shell">
          <header className="app-header">
            <span className="pill-logo">Zebra · Prompt Studio</span>
            <nav className="app-nav">
              {NAV_ITEMS.map(({ label, href, Icon }) => (
                <a key={href} href={href}>
                  <Icon className="nav-icon" size={14} stroke={1.5} />
                  {label}
                </a>
              ))}
            </nav>
          </header>
          <main>{children}</main>
        </div>
      </body>
    </html>
  );
}
