import { describe, expect, it } from "vitest";
import type { BoardLabel, Card } from "./board";
import { emptyFilter, isActive, matches, normalize, type Filter } from "./filter";

const TODAY = "2026-11-15";
const labels: BoardLabel[] = [
  { id: "l1", name: "فوری", color: "red" },
  { id: "l2", name: "", color: "green" },
];
const card: Card = {
  id: "c1",
  title: "اعلان‌های ایمیلی",
  details: "طرح اولیه برای یادآوری",
  assignee: "سارا",
  priority: "high",
  due_date: "2026-11-20",
  labels: ["l1"],
};
const f = (changes: Partial<Filter>): Filter => ({ ...emptyFilter, ...changes });
const match = (changes: Partial<Filter>, c: Card = card) => matches(c, f(changes), labels, TODAY);

describe("normalize", () => {
  it("treats Arabic yeh/kaf as Persian and ignores half-spaces and case", () => {
    expect(normalize("كتابي")).toBe("کتابی");
    expect(normalize("اعلان‌ها")).toBe("اعلانها");
    expect(normalize("API")).toBe("api");
  });
});

describe("matches", () => {
  it("matches everything with an empty filter", () => {
    expect(isActive(emptyFilter)).toBe(false);
    expect(match({})).toBe(true);
  });

  it.each([
    ["اعلانها", true], // no half-space
    ["ايميلي", true], // Arabic letters
    ["یادآوری", true], // details
    ["سارا", true], // assignee
    ["فوری", true], // label name
    ["  ", true], // blank query is ignored
    ["پروفایل", false],
  ])("search %s -> %s", (query, expected) => {
    expect(match({ query })).toBe(expected);
  });

  it("filters by any selected label", () => {
    expect(match({ labels: ["l2", "l1"] })).toBe(true);
    expect(match({ labels: ["l2"] })).toBe(false);
    expect(match({ labels: ["l1"] }, { ...card, labels: undefined })).toBe(false);
  });

  it("filters by priority", () => {
    expect(match({ priority: "high" })).toBe(true);
    expect(match({ priority: "low" })).toBe(false);
  });

  it.each([
    ["2026-11-14", "overdue", true],
    ["2026-11-15", "overdue", false],
    ["2026-11-15", "week", true],
    ["2026-11-22", "week", true],
    ["2026-11-23", "week", false],
    ["2026-11-14", "week", false],
  ] as const)("due %s with filter %s -> %s", (due_date, due, expected) => {
    expect(match({ due }, { ...card, due_date })).toBe(expected);
  });

  it("due 'none' keeps only cards without a date", () => {
    expect(match({ due: "none" })).toBe(false);
    expect(match({ due: "none" }, { ...card, due_date: null })).toBe(true);
    expect(match({ due: "overdue" }, { ...card, due_date: null })).toBe(false);
  });

  it("combines filters with AND", () => {
    expect(match({ query: "سارا", priority: "high", labels: ["l1"] })).toBe(true);
    expect(match({ query: "سارا", priority: "low" })).toBe(false);
    expect(isActive(f({ due: "week" }))).toBe(true);
  });
});
