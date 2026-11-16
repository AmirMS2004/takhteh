"use client";

import { useEffect, useState } from "react";
import * as api from "@/lib/api";
import type { MyCard } from "@/lib/api";
import { PRIORITIES, formatDue, priorityName, today } from "@/lib/cardDetails";
import { addDays } from "@/lib/filter";
import { useI18n, type Key } from "@/lib/i18n";

type Group = { key: Key; cards: MyCard[] };

/** The cards in groups by due date: overdue, today, the next 7 days, later and without a due date. */
function groups(cards: MyCard[], day: string): Group[] {
  const week = addDays(day, 7);
  const found: Group[] = [
    { key: "tasks.overdue", cards: cards.filter((c) => c.due_date && c.due_date < day) },
    { key: "tasks.today", cards: cards.filter((c) => c.due_date === day) },
    { key: "tasks.week", cards: cards.filter((c) => c.due_date && c.due_date > day && c.due_date <= week) },
    { key: "tasks.later", cards: cards.filter((c) => c.due_date && c.due_date > week) },
    { key: "tasks.noDue", cards: cards.filter((c) => !c.due_date) },
  ];
  return found.filter((g) => g.cards.length > 0);
}

/** Every open card assigned to the user, on all their boards. */
export function MyTasks({ onOpenBoard }: { onOpenBoard: (boardId: string) => void }) {
  const i18n = useI18n();
  const { t, num } = i18n;
  const [cards, setCards] = useState<MyCard[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    api.getMyCards().then(setCards, () => setFailed(true));
  }, []);

  const complete = async (card: MyCard) => {
    setCards((all) => all!.filter((c) => c.id !== card.id));
    await api.updateCard(card.id, { done: true }).catch(() => setFailed(true));
  };

  const day = today();
  return (
    <div className="space-y-6 px-6 pb-10 sm:px-10">
      <div className="flex items-center gap-2">
        <span className="h-6 w-1 rounded-full bg-accent" />
        <h1 className="text-2xl font-black text-ink">{t("tasks.title")}</h1>
        {cards && <span className="text-sm text-gray-text">({num(cards.length)})</span>}
      </div>
      <p className="-mt-4 text-sm text-gray-text">{t("tasks.hint")}</p>
      {failed && (
        <p role="alert" className="rounded-lg bg-danger-50 px-3 py-2 text-sm text-danger">
          {t("common.network")}
        </p>
      )}
      {!cards && !failed && <p className="text-sm text-gray-text">{t("common.loading")}</p>}
      {cards && cards.length === 0 && (
        <p className="rounded-2xl border border-dashed border-ink/20 px-6 py-10 text-center text-sm text-gray-text">
          {t("tasks.empty")}
        </p>
      )}
      {cards &&
        groups(cards, day).map((group) => (
          <section key={group.key} aria-labelledby={group.key} className="space-y-2">
            <h2
              id={group.key}
              className={`text-sm font-bold ${group.key === "tasks.overdue" ? "text-danger" : "text-ink"}`}
            >
              {t(group.key)} <span className="font-normal text-gray-text">({num(group.cards.length)})</span>
            </h2>
            <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
              {group.cards.map((card) => {
                const priority = PRIORITIES.find((p) => p.value === card.priority);
                return (
                  <li key={card.id} className="flex items-center gap-3 px-4 py-3">
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={false}
                      aria-label={t("card.done", { title: card.title })}
                      title={t("card.markDone")}
                      onClick={() => complete(card)}
                      className="grid h-5 w-5 shrink-0 place-items-center rounded-md border-2 border-line text-transparent transition hover:border-label-green hover:text-label-green"
                    >
                      <svg
                        viewBox="0 0 20 20"
                        className="h-3.5 w-3.5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.6"
                        aria-hidden
                      >
                        <path d="M4.5 10.5l3.5 3.5 7.5-8" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                    <button type="button" onClick={() => onOpenBoard(card.board)} className="min-w-0 flex-1 text-start">
                      <span dir="auto" className="block truncate text-sm font-semibold text-ink hover:text-primary-700">
                        {card.title}
                      </span>
                      <span className="block truncate text-xs text-gray-text">
                        <span dir="auto">{card.board_title}</span> · <span dir="auto">{card.column}</span>
                      </span>
                    </button>
                    {priority && (
                      <span
                        className={`hidden rounded-full px-2 py-0.5 text-[11px] font-medium sm:inline ${priority.chip}`}
                      >
                        {priorityName(priority.value, i18n)}
                      </span>
                    )}
                    {card.due_date && (
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                          card.due_date < day ? "bg-danger text-white" : "bg-primary-50 text-primary-700"
                        }`}
                      >
                        {formatDue(card.due_date, i18n)}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
    </div>
  );
}
