import { describe, expect, it } from "vitest";
import type { Active, Over } from "@dnd-kit/core";
import { initialBoard as board } from "./board";
import { dndAccessibility } from "./dndAnnouncements";
import { makeI18n } from "./i18n";

const active = (id: string) => ({ id }) as Active;
const over = (id: string) => ({ id }) as Over;

describe("drag and drop announcements", () => {
  const { announcements, screenReaderInstructions } = dndAccessibility(() => board, makeI18n("fa"));

  it("say where a card is, would go and went, in Persian digits", () => {
    expect(announcements.onDragStart({ active: active("c2") })).toBe("کارت «حالت تاریک» برداشته شد. ستون «ایده‌ها»، جای ۲ از ۳.");
    expect(announcements.onDragOver({ active: active("c2"), over: over("c5") })).toBe(
      "کارت «حالت تاریک»: ستون «برای انجام»، جای ۲ از ۳.",
    );
    expect(announcements.onDragOver({ active: active("c2"), over: over("review") })).toBe(
      "کارت «حالت تاریک»: ستون «بازبینی»، جای ۲ از ۲.",
    );
    expect(announcements.onDragEnd({ active: active("c2"), over: over("c4") })).toBe(
      "کارت «حالت تاریک» در ستون «برای انجام»، جای ۱ از ۳ گذاشته شد.",
    );
    expect(announcements.onDragOver({ active: active("c2"), over: over("c2") })).toBeUndefined();
    expect(announcements.onDragOver({ active: active("c2"), over: null })).toBe("«حالت تاریک» روی جای معتبری نیست.");
    expect(announcements.onDragEnd({ active: active("c2"), over: null })).toBe("«حالت تاریک» گذاشته نشد و سر جای قبلی ماند.");
    expect(announcements.onDragCancel({ active: active("c2"), over: null })).toBe(
      "جابه‌جایی کارت «حالت تاریک» لغو شد و سر جای قبلی ماند.",
    );
  });

  it("say where a column is", () => {
    expect(announcements.onDragStart({ active: active("todo") })).toBe("ستون «برای انجام» برداشته شد. جای ۲ از ۵.");
    expect(announcements.onDragEnd({ active: active("todo"), over: over("done") })).toBe(
      "ستون «برای انجام» در جای ۵ از ۵ گذاشته شد.",
    );
  });

  it("speak English when the interface is English", () => {
    const en = dndAccessibility(() => board, makeI18n("en"));
    expect(en.screenReaderInstructions.draggable).toMatch(/^To pick up, press Space or Enter/);
    expect(en.announcements.onDragStart({ active: active("c2") })).toBe(
      "Picked up the card “حالت تاریک”. Column “ایده‌ها”, position 2 of 3.",
    );
    expect(screenReaderInstructions.draggable).toMatch(/^برای برداشتن/);
  });
});
