"use client";

import { useEffect, useRef, useState } from "react";

type State = "top" | "hidden" | "visible";

/**
 * Scroll-aware header:
 *  - "top"     — na samej górze strony, tło opacity 0 (fully transparent)
 *  - "hidden"  — chowa się przy przewijaniu w dół (translateY -100%)
 *  - "visible" — pokazuje się przy przewijaniu w górę, tło opacity 50%
 *
 * `bgClassName` dostaje klasy odpowiedzialne za kolor/blur/border —
 * opacity warstwy tła jest sterowane inline style.
 */
export default function ScrollHeader({
  bgClassName = "",
  children,
}: {
  bgClassName?: string;
  children: React.ReactNode;
}) {
  const [state, setState] = useState<State>("top");
  const lastY = useRef(0);

  useEffect(() => {
    lastY.current = window.scrollY;
    if (window.scrollY < 10) setState("top");

    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const y = window.scrollY;
        const dy = y - lastY.current;
        if (y < 10) {
          setState("top");
        } else if (dy > 4) {
          setState("hidden");
        } else if (dy < -4) {
          setState("visible");
        }
        lastY.current = y;
        ticking = false;
      });
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const bgOpacity = state === "top" ? 0 : state === "visible" ? 0.5 : 0;
  const translate = state === "hidden" ? "translateY(-100%)" : "translateY(0)";

  return (
    <header
      className="group sticky top-0 z-50 transition-transform duration-300 ease-out"
      style={{ transform: translate }}
      data-scroll-state={state}
    >
      <div
        aria-hidden
        className={`absolute inset-0 pointer-events-none transition-opacity duration-500 ease-out ${bgClassName}`}
        style={{ opacity: bgOpacity }}
      />
      <div className="relative">{children}</div>
    </header>
  );
}
