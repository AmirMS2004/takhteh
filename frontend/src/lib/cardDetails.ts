import type { LabelColor, Priority } from "./board";
import type { I18n, Key } from "./i18n";

/** Priority chips on the brand palette: high in the functional red, medium in the accent tint. */
export const PRIORITIES: { value: Priority; chip: string }[] = [
  { value: "high", chip: "bg-danger-50 text-danger" },
  { value: "medium", chip: "bg-accent-50 text-accent-700" },
  { value: "low", chip: "bg-mist text-ink/70" },
];

/** "High priority" (or just "High" with `short`), in the user's language. */
export const priorityName = (priority: Priority, { t }: I18n, short = false) =>
  t(`${short ? "priorityShort" : "priority"}.${priority}` as Key);

/**
 * Label colors (names come from the dictionary, `color.<value>`); `pill` is used for named labels on cards. Yellow, blue and purple are the
 * brand colors; green, orange and red are the brand's label hues (globals.css).
 */
export const LABEL_COLORS: { value: LabelColor; swatch: string; pill: string }[] = [
  { value: "green", swatch: "bg-label-green", pill: "bg-label-green text-white" },
  { value: "yellow", swatch: "bg-accent", pill: "bg-accent text-navy" },
  { value: "orange", swatch: "bg-label-orange", pill: "bg-label-orange text-white" },
  { value: "red", swatch: "bg-label-red", pill: "bg-label-red text-white" },
  { value: "purple", swatch: "bg-secondary", pill: "bg-secondary text-white" },
  { value: "blue", swatch: "bg-primary", pill: "bg-primary text-white" },
];

export const colorOf = (color: LabelColor) => LABEL_COLORS.find((c) => c.value === color)!;

/** How a label is described to screen readers and in tooltips: "برچسب قرمز" / "red label". */
export const labelTitle = (label: { name: string; color: LabelColor }, { t }: I18n) =>
  t("label.title", { name: label.name || t(`color.${label.color}` as Key) });

/** Today's date in the user's time zone as "YYYY-MM-DD". */
export const today = () => new Date().toLocaleDateString("en-CA");

/** "2026-12-01" -> "۱۰ آذر" (Persian calendar) or "Dec 1", with the year only when it is not this year. */
export function formatDue(date: string, { lang, locale }: I18n) {
  const d = new Date(`${date}T00:00:00`);
  const sameYear = date.slice(0, 4) === today().slice(0, 4);
  const month = lang === "fa" ? "long" : "short";
  return d.toLocaleDateString(locale, { day: "numeric", month, ...(sameYear ? {} : { year: "numeric" }) });
}
