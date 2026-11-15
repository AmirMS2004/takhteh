import type { Label, Priority } from "./board";

export const PRIORITIES: { value: Priority; name: string; chip: string }[] = [
  { value: "high", name: "اولویت بالا", chip: "bg-red-50 text-red-700" },
  { value: "medium", name: "اولویت متوسط", chip: "bg-amber-50 text-amber-700" },
  { value: "low", name: "اولویت پایین", chip: "bg-slate-100 text-slate-600" },
];

export const LABELS: { value: Label; name: string; swatch: string }[] = [
  { value: "red", name: "قرمز", swatch: "bg-red-500" },
  { value: "orange", name: "نارنجی", swatch: "bg-orange-400" },
  { value: "yellow", name: "زرد", swatch: "bg-accent" },
  { value: "green", name: "سبز", swatch: "bg-green-500" },
  { value: "blue", name: "آبی", swatch: "bg-primary" },
  { value: "purple", name: "بنفش", swatch: "bg-secondary" },
];

/** Today's date in the user's time zone as "YYYY-MM-DD". */
export const today = () => new Date().toLocaleDateString("en-CA");

/** "2026-12-01" -> "۱۰ آذر" (Persian calendar), with the year only when it is not this year. */
export function formatDue(date: string) {
  const d = new Date(`${date}T00:00:00`);
  const sameYear = date.slice(0, 4) === today().slice(0, 4);
  return d.toLocaleDateString("fa-IR", { day: "numeric", month: "long", ...(sameYear ? {} : { year: "numeric" }) });
}
