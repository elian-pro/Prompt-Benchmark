import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { AppHeader } from "@/components/layout/AppHeader";
import "./globals.css";

// Runs synchronously before paint to apply the persisted theme, avoiding a
// flash of the default (dark) theme when the user prefers light. Keep in sync
// with the localStorage key used by ThemeToggle ("zebra-theme").
const NO_FLASH_THEME_SCRIPT = `(function(){try{var t=localStorage.getItem('zebra-theme');if(t==='light'||t==='dark'){document.body.dataset.theme=t;}}catch(e){}})();`;

// Mostly two weights per docs/DESIGN-SYSTEM.md; 700 is loaded only for the
// emphasized team name in the Editor/Creator welcome greeting.
const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "ZEBRA · Prompt Studio",
  description: "Herramienta interna del equipo de paid media de Zebra.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className={inter.className}>
      <body data-theme="dark" suppressHydrationWarning>
        <script dangerouslySetInnerHTML={{ __html: NO_FLASH_THEME_SCRIPT }} />
        <div className="app-shell">
          <AppHeader />
          <main>{children}</main>
        </div>
      </body>
    </html>
  );
}
