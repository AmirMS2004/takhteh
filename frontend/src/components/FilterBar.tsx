"use client";

import type { BoardLabel, Priority } from "@/lib/board";
import { PRIORITIES, colorOf, labelTitle } from "@/lib/cardDetails";
import { emptyFilter, isActive, type DueFilter, type Filter } from "@/lib/filter";

const control =
  "rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-navy outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10";

type Props = {
  filter: Filter;
  onChange: (filter: Filter) => void;
  labels: BoardLabel[];
  shown: number;
  total: number;
};

export function FilterBar({ filter, onChange, labels, shown, total }: Props) {
  const set = (changes: Partial<Filter>) => onChange({ ...filter, ...changes });
  const toggleLabel = (id: string) =>
    set({ labels: filter.labels.includes(id) ? filter.labels.filter((l) => l !== id) : [...filter.labels, id] });

  return (
    <div role="search" className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
      <div className="relative">
        <svg
          viewBox="0 0 20 20"
          className="pointer-events-none absolute top-1/2 right-2.5 h-4 w-4 -translate-y-1/2 text-gray-text"
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
          aria-label="جست‌وجوی کارت‌ها"
          placeholder="جست‌وجو در کارت‌ها…"
          value={filter.query}
          onChange={(e) => set({ query: e.target.value })}
          onKeyDown={(e) => e.key === "Escape" && set({ query: "" })}
          className={`${control} w-56 pr-8`}
        />
      </div>

      <div className="flex items-center gap-1" role="group" aria-label="فیلتر برچسب">
        {labels.map((l) => {
          const on = filter.labels.includes(l.id);
          return (
            <button
              key={l.id}
              type="button"
              aria-pressed={on}
              aria-label={`فیلتر ${labelTitle(l)}`}
              title={labelTitle(l)}
              onClick={() => toggleLabel(l.id)}
              className={`flex h-6 min-w-6 items-center rounded px-1.5 text-[11px] font-semibold transition ${colorOf(l.color).pill} ${
                on ? "ring-2 ring-navy ring-offset-1" : "opacity-35 hover:opacity-70"
              }`}
            >
              {l.name}
            </button>
          );
        })}
      </div>

      <select
        aria-label="فیلتر اولویت"
        value={filter.priority ?? ""}
        onChange={(e) => set({ priority: (e.target.value || null) as Priority | null })}
        className={control}
      >
        <option value="">همه اولویت‌ها</option>
        {PRIORITIES.map((p) => (
          <option key={p.value} value={p.value}>
            {p.name}
          </option>
        ))}
      </select>

      <select
        aria-label="فیلتر سررسید"
        value={filter.due ?? ""}
        onChange={(e) => set({ due: (e.target.value || null) as DueFilter | null })}
        className={control}
      >
        <option value="">همه سررسیدها</option>
        <option value="overdue">سررسید گذشته</option>
        <option value="week">تا ۷ روز آینده</option>
        <option value="none">بدون سررسید</option>
      </select>

      {isActive(filter) && (
        <>
          <span role="status" className="text-sm text-gray-text">
            {shown.toLocaleString("fa-IR")} کارت از {total.toLocaleString("fa-IR")}
          </span>
          <button
            type="button"
            onClick={() => onChange(emptyFilter)}
            className="rounded-lg px-2.5 py-1.5 text-sm font-medium text-primary hover:bg-sky-50"
          >
            پاک کردن فیلترها
          </button>
        </>
      )}
    </div>
  );
}
