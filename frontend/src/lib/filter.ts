import type { BoardLabel, Card, Priority } from "./board";

export type DueFilter = "overdue" | "week" | "none";

export type Filter = {
  query: string;
  labels: string[]; // a card matches if it has any of these
  priority: Priority | null;
  due: DueFilter | null;
};

export const emptyFilter: Filter = { query: "", labels: [], priority: null, due: null };

export const isActive = (f: Filter) => !!f.query.trim() || f.labels.length > 0 || !!f.priority || !!f.due;

/** Makes Persian text comparable: Arabic yeh/kaf -> Persian, no half-spaces, lower case. */
export function normalize(text: string) {
  return text.replace(/ي/g, "ی").replace(/ك/g, "ک").replace(/‌/g, "").toLowerCase();
}

/** "YYYY-MM-DD" of the date `days` after `day`. */
export function addDays(day: string, days: number) {
  const d = new Date(`${day}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString("en-CA");
}

export function matches(card: Card, f: Filter, labels: BoardLabel[], today: string) {
  const query = normalize(f.query.trim());
  if (query) {
    const names = labels.filter((l) => card.labels?.includes(l.id)).map((l) => l.name);
    const text = normalize([card.title, card.details, card.assignee ?? "", ...names].join(" "));
    if (!text.includes(query)) return false;
  }
  if (f.labels.length > 0 && !f.labels.some((id) => card.labels?.includes(id))) return false;
  if (f.priority && card.priority !== f.priority) return false;
  if (f.due === "none" && card.due_date) return false;
  // A card that is done is no longer due.
  if (f.due === "overdue" && !(card.due_date && !card.done && card.due_date < today)) return false;
  if (f.due === "week" && !(card.due_date && !card.done && card.due_date >= today && card.due_date <= addDays(today, 7))) return false;
  return true;
}
