"use client";

import { useState } from "react";

export const THEME_KEY = "pm:theme";

/**
 * Runs in <head> before the page paints, so a dark theme never flashes light: the saved choice, or the
 * system setting when there is none.
 */
export const themeScript = `try{var t=localStorage.getItem("${THEME_KEY}");if(t==="dark"||(t!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches))document.documentElement.classList.add("dark")}catch(e){}`;

/** The current theme (set on <html> by themeScript) and a toggle that remembers the choice. */
export function useTheme() {
  const [dark, setDark] = useState(() => typeof document !== "undefined" && document.documentElement.classList.contains("dark"));
  const toggle = () => {
    const next = !dark;
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem(THEME_KEY, next ? "dark" : "light");
    } catch {}
    setDark(next);
  };
  return { dark, toggle };
}
