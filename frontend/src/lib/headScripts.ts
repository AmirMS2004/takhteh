// Plain strings for the server-rendered <head>. This module must not be a client module ("use client"):
// the layout would then get client references instead of the script text.

export const THEME_KEY = "pm:theme";
export const LANG_KEY = "pm:lang";

/**
 * Runs in <head> before the page paints, so a dark theme never flashes light: the saved choice, or the
 * system setting when there is none.
 */
export const themeScript = `try{var t=localStorage.getItem("${THEME_KEY}");if(t==="dark"||(t!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches))document.documentElement.classList.add("dark")}catch(e){}`;

/** Runs in <head> before the page paints, so an English page never flashes right-to-left. */
export const langScript = `try{if(localStorage.getItem("${LANG_KEY}")==="en"){document.documentElement.lang="en";document.documentElement.dir="ltr";document.title="Takhteh"}}catch(e){}`;
