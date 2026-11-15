import type { LabelColor, Priority } from "./board";

export const PRIORITIES: { value: Priority; name: string; chip: string }[] = [
  { value: "high", name: "اولویت بالا", chip: "bg-red-50 text-red-700" },
  { value: "medium", name: "اولویت متوسط", chip: "bg-amber-50 text-amber-700" },
  { value: "low", name: "اولویت پایین", chip: "bg-slate-100 text-slate-600" },
];

/** Label colors with Persian names; `pill` is used for named labels on cards. */
export const LABEL_COLORS: { value: LabelColor; name: string; swatch: string; pill: string }[] = [
  { value: "green", name: "سبز", swatch: "bg-green-500", pill: "bg-green-500 text-white" },
  { value: "yellow", name: "زرد", swatch: "bg-accent", pill: "bg-accent text-navy" },
  { value: "orange", name: "نارنجی", swatch: "bg-orange-400", pill: "bg-orange-400 text-navy" },
  { value: "red", name: "قرمز", swatch: "bg-red-500", pill: "bg-red-500 text-white" },
  { value: "purple", name: "بنفش", swatch: "bg-secondary", pill: "bg-secondary text-white" },
  { value: "blue", name: "آبی", swatch: "bg-primary", pill: "bg-primary text-white" },
];

export const colorOf = (color: LabelColor) => LABEL_COLORS.find((c) => c.value === color)!;

/** How a label is described to screen readers and in tooltips. */
export const labelTitle = (label: { name: string; color: LabelColor }) =>
  label.name ? `برچسب ${label.name}` : `برچسب ${colorOf(label.color).name}`;

/** Today's date in the user's time zone as "YYYY-MM-DD". */
export const today = () => new Date().toLocaleDateString("en-CA");

/** "2026-12-01" -> "۱۰ آذر" (Persian calendar), with the year only when it is not this year. */
export function formatDue(date: string) {
  const d = new Date(`${date}T00:00:00`);
  const sameYear = date.slice(0, 4) === today().slice(0, 4);
  return d.toLocaleDateString("fa-IR", { day: "numeric", month: "long", ...(sameYear ? {} : { year: "numeric" }) });
}
