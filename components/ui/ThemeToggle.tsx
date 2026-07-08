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

  const isLight = theme === "light";

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isLight}
      className="theme-switch"
      onClick={toggle}
      aria-label={isLight ? "Activar modo oscuro" : "Activar modo claro"}
      title={isLight ? "Modo oscuro" : "Modo claro"}
    >
      <IconMoon size={13} stroke={1.5} className="theme-switch-icon moon" />
      <IconSun size={13} stroke={1.5} className="theme-switch-icon sun" />
      <span className="theme-switch-knob" />
    </button>
  );
}
