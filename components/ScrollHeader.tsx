"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "@/i18n-config";

type State = "top" | "hidden" | "visible";

/**
 * Scroll-aware header with two modes:
 *
 * Default (non-homepage):
 *  - "top"     — at top of page, background transparent
 *  - "hidden"  — hides on scroll down (translateY -100%)
 *  - "visible" — shows on scroll up, background semi-opaque
 *
 * Hero mode (homepage, pathname === "/"):
 *  - Hidden (translateY -100%) until scroll passes 2/3 of viewport height
 *  - Appears (translateY 0, full bg) once threshold is crossed
 *  - Uses data-scroll-state="hero-visible" so logo/navlinks stay visible
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
  const pathname = usePathname();
  const isHeroPage = pathname === "/";

  useEffect(() => {
    if (isHeroPage) {
      const check = () => {
        const threshold = window.innerHeight * (2 / 3);
        setState(window.scrollY >= threshold ? "visible" : "top");
      };
      check();
      window.addEventListener("scroll", check, { passive: true });
      return () => window.removeEventListener("scroll", check);
    }

    // Default behaviour (all other pages)
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
  }, [isHeroPage]);

  // Hero mode: completely hidden below threshold, fully visible above it.
  // Non-hero mode: original translate + bg opacity logic.
  const isHidden = isHeroPage ? state === "top" : state === "hidden";
  const bgOpacity = isHeroPage
    ? (state === "visible" ? 1 : 0)
    : (state === "top" ? 0 : state === "visible" ? 0.5 : 0);

  // "hero-visible" intentionally does NOT match the existing Tailwind selectors
  // group-data-[scroll-state=visible]:opacity-0 in GlobalShell, so logo + navlinks
  // remain fully visible when the hero nav appears.
  const dataState = isHeroPage
    ? (state === "visible" ? "hero-visible" : "hero-hidden")
    : state;

  return (
    <header
      className="group sticky top-0 z-50 transition-transform duration-300 ease-out"
      style={{ transform: isHidden ? "translateY(-100%)" : "translateY(0)" }}
      data-scroll-state={dataState}
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
