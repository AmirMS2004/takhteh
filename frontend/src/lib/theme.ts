"use client";

import { useState } from "react";
import { THEME_KEY } from "./headScripts";

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
