"use client";

import { useEffect, useRef } from "react";

/**
 * Dotted canvas background with a cursor spotlight: faint dots everywhere, and
 * a brighter (accent) dot layer revealed only within a radius around the
 * pointer via a radial mask. The pointer position is fed in through CSS custom
 * properties updated on a rAF tick. Sits behind the page (z-index -1) and is
 * disabled under prefers-reduced-motion. Used on the Editor/Creator landings.
 */
export function DotGrid() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let raf = 0;
    let x = 0;
    let y = 0;

    const apply = () => {
      raf = 0;
      el.style.setProperty("--mx", `${x}px`);
      el.style.setProperty("--my", `${y}px`);
    };
    const onMove = (e: MouseEvent) => {
      x = e.clientX;
      y = e.clientY;
      if (!raf) raf = requestAnimationFrame(apply);
    };

    window.addEventListener("mousemove", onMove, { passive: true });
    return () => {
      window.removeEventListener("mousemove", onMove);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return <div ref={ref} className="dot-grid" aria-hidden="true" />;
}
