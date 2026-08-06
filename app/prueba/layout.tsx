import { JetBrains_Mono } from "next/font/google";

import "./zebra-ds.css";

/**
 * The client's page, and only it, runs on the Zebra design system.
 *
 * Two things are scoped here rather than in the root layout: the `.zebra-ds`
 * wrapper, which is what every rule in zebra-ds.css hangs off, and JetBrains
 * Mono, which is downloaded on this route and nowhere else. The Studio keeps
 * its own tokens until the system is rolled out section by section, on
 * purpose: this page is the one a client sees.
 *
 * Dark is fixed here, not read from storage. The theme toggle lives in the
 * Studio's header, which does not render on this route, so there is nothing to
 * follow and nothing for a visitor to change.
 */
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  // Eyebrows and labels only: medium for the label itself, regular as fallback.
  weight: ["400", "500"],
  variable: "--font-mono",
  display: "swap",
});

export default function PruebaLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`zebra-ds ${jetbrainsMono.variable}`} data-ds-theme="dark">
      {children}
    </div>
  );
}
