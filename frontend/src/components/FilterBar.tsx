"use client";

import type { BoardLabel, Priority } from "@/lib/board";
import { PRIORITIES, colorOf, labelTitle, priorityName } from "@/lib/cardDetails";
import { emptyFilter, isActive, type DueFilter, type Filter } from "@/lib/filter";
import { useI18n } from "@/lib/i18n";

const control =
  "rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm text-ink outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10";

type Props = {
  filter: Filter;
  onChange: (filter: Filter) => void;
  labels: BoardLabel[];
  shown: number;
  total: number;
};

export function FilterBar({ filter, onChange, labels, shown, total }: Props) {
  const i18n = useI18n();
  const { t } = i18n;
  const set = (changes: Partial<Filter>) => onChange({ ...filter, ...changes });
  const toggleLabel = (id: string) =>
    set({ labels: filter.labels.includes(id) ? filter.labels.filter((l) => l !== id) : [...filter.labels, id] });

  return (
    <div role="search" className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
      <div className="relative">
        <svg
          viewBox="0 0 20 20"
          className="pointer-events-none absolute top-1/2 start-2.5 h-4 w-4 -translate-y-1/2 text-gray-text"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          aria-hidden
        >
          <circle cx="9" cy="9" r="5.5" />
          <path d="M13 13l4 4" strokeLinecap="round" />
        </svg>
        <input
          type="search"
          aria-label={t("filter.search")}
          placeholder={t("filter.searchPlaceholder")}
          value={filter.query}
          onChange={(e) => set({ query: e.target.value })}
          onKeyDown={(e) => e.key === "Escape" && set({ query: "" })}
          className={`${control} w-56 ps-8`}
        />
      </div>

      <div className="flex items-center gap-1" role="group" aria-label={t("filter.labels")}>
        {labels.map((l) => {
          const on = filter.labels.includes(l.id);
          return (
            <button
              key={l.id}
              type="button"
              aria-pressed={on}
              aria-label={t("filter.label", { label: labelTitle(l, i18n) })}
              title={labelTitle(l, i18n)}
              onClick={() => toggleLabel(l.id)}
              className={`flex h-6 min-w-6 items-center rounded px-1.5 text-[11px] font-semibold transition ${colorOf(l.color).pill} ${
                on ? "ring-2 ring-white ring-offset-2 ring-offset-bar" : "opacity-60 hover:opacity-90"
              }`}
            >
              {l.name}
            </button>
          );
        })}
      </div>

      <select
        aria-label={t("filter.priority")}
        value={filter.priority ?? ""}
        onChange={(e) => set({ priority: (e.target.value || null) as Priority | null })}
        className={control}
      >
        <option value="">{t("filter.allPriorities")}</option>
        {PRIORITIES.map((p) => (
          <option key={p.value} value={p.value}>
            {priorityName(p.value, i18n)}
          </option>
        ))}
      </select>

      <select
        aria-label={t("filter.due")}
        value={filter.due ?? ""}
        onChange={(e) => set({ due: (e.target.value || null) as DueFilter | null })}
        className={control}
      >
        <option value="">{t("filter.allDue")}</option>
        <option value="overdue">{t("filter.overdue")}</option>
        <option value="week">{t("filter.week")}</option>
        <option value="none">{t("filter.noDue")}</option>
      </select>

      {isActive(filter) && (
        <>
          <span role="status" className="text-sm text-white/75">
            {t("filter.shown", { shown, total })}
          </span>
          <button
            type="button"
            onClick={() => onChange(emptyFilter)}
            className="rounded-lg px-2.5 py-1.5 text-sm font-medium text-white hover:bg-white/10"
          >
            {t("filter.clear")}
          </button>
        </>
      )}
    </div>
  );
}
