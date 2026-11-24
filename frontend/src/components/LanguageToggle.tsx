"use client";

import { useI18n, type Lang } from "@/lib/i18n";

/** Switches between Persian and English; shows the other language's short name. */
export function LanguageToggle({ onLanguage, className = "" }: { onLanguage: (lang: Lang) => void; className?: string }) {
  const { lang, t } = useI18n();
  const other: Lang = lang === "fa" ? "en" : "fa";
  return (
    <button
      type="button"
      lang={other}
      aria-label={`${t("app.otherLanguage")} (${t("app.switchLanguage")})`}
      title={t("app.switchLanguage")}
      onClick={() => onLanguage(other)}
      className={`rounded-lg px-2 py-1.5 text-xs font-bold transition ${className || "text-ink/75 hover:bg-mist hover:text-ink"}`}
    >
      {t("app.otherLanguage")}
    </button>
  );
}
