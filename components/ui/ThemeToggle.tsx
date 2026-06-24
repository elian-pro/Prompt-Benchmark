"use client";

import { useEffect, useState } from "react";
import { IconMoon, IconSun } from "@tabler/icons-react";

type Theme = "dark" | "light";

// Reads the theme that the no-flash inline script (in app/layout.tsx) already
// applied to <body data-theme>, then flips it and persists to localStorage.
// No provider / no dependency — the CSS-variable token sets do the rest.
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    const current = document.body.dataset.theme;
    setTheme(current === "light" ? "light" : "dark");
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    document.body.dataset.theme = next;
    try {
      localStorage.setItem("zebra-theme", next);
    } catch {
      // Private mode / storage disabled — theme still applies for this session.
    }
    setTheme(next);
  }

  return (
    <button
      type="button"
      className="icon-btn theme-toggle"
      onClick={toggle}
      aria-label={theme === "dark" ? "Activar modo claro" : "Activar modo oscuro"}
      title={theme === "dark" ? "Modo claro" : "Modo oscuro"}
    >
      {theme === "dark" ? (
        <IconSun size={18} stroke={1.5} />
      ) : (
        <IconMoon size={18} stroke={1.5} />
      )}
    </button>
  );
}
