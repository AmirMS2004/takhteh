"use client";

import { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Card, Label, Priority } from "@/lib/board";
import { LABELS, PRIORITIES, formatDue, today } from "@/lib/cardDetails";

type Props = {
  card: Card;
  onDelete?: (id: string) => void;
  onEdit?: () => void;
  overlay?: boolean;
};

export type CardChanges = Omit<Card, "id">;

// Shown on hover or keyboard focus; always shown on touch screens, which have no hover.
const iconButton =
  "rounded-md p-1 text-gray-text opacity-0 transition focus-visible:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100";
const field =
  "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-navy outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10";

function CardMeta({ card }: { card: Card }) {
  const priority = PRIORITIES.find((p) => p.value === card.priority);
  const overdue = !!card.due_date && card.due_date < today();
  if (!priority && !card.due_date && !card.assignee) return null;
  return (
    <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-[11px] font-medium">
      {priority && <span className={`rounded-full px-2 py-0.5 ${priority.chip}`}>{priority.name}</span>}
      {card.due_date && (
        <span
          title={overdue ? "سررسید گذشته" : "سررسید"}
          className={`flex items-center gap-1 rounded-full px-2 py-0.5 ${overdue ? "bg-red-600 text-white" : "bg-sky-50 text-primary"}`}
        >
          <svg viewBox="0 0 20 20" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <rect x="3" y="4.5" width="14" height="12" rx="2" />
            <path d="M3 8.5h14M7 3v3M13 3v3" strokeLinecap="round" />
          </svg>
          {formatDue(card.due_date)}
        </span>
      )}
      {card.assignee && (
        <span className="mr-auto flex items-center gap-1 text-gray-text" title="مسئول">
          <span className="grid h-5 w-5 place-items-center rounded-full bg-navy text-[10px] font-bold text-white" aria-hidden>
            {card.assignee[0]}
          </span>
          {card.assignee}
        </span>
      )}
    </div>
  );
}

export function CardView({ card, onDelete, onEdit, overlay }: Props) {
  const label = LABELS.find((l) => l.value === card.label);
  return (
    <div
      className={`group relative rounded-xl border border-slate-200/80 bg-white p-4 shadow-[0_1px_2px_rgba(3,33,71,0.06)] transition-shadow hover:shadow-[0_8px_24px_-12px_rgba(3,33,71,0.35)] ${
        overlay ? "rotate-2 cursor-grabbing shadow-[0_18px_40px_-12px_rgba(3,33,71,0.45)] ring-2 ring-primary/40" : "cursor-grab"
      }`}
    >
      <span className="absolute inset-y-3 right-0 w-1 rounded-l-full bg-accent opacity-0 transition-opacity group-hover:opacity-100" />
      {label && <span title={`برچسب ${label.name}`} className={`mb-2 block h-1.5 w-10 rounded-full ${label.swatch}`} />}
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-[15px] font-semibold leading-6 text-navy">{card.title}</h3>
        <div className="-mt-1 -ml-1 flex shrink-0">
          {onEdit && (
            <button
              type="button"
              aria-label={`ویرایش ${card.title}`}
              onClick={onEdit}
              onPointerDown={(e) => e.stopPropagation()}
              className={`${iconButton} hover:bg-sky-50 hover:text-primary`}
            >
              <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M13.5 3.5l3 3L7 16H4v-3l9.5-9.5z" strokeLinejoin="round" />
              </svg>
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              aria-label={`حذف ${card.title}`}
              onClick={() => window.confirm(`کارت «${card.title}» حذف شود؟`) && onDelete(card.id)}
              onPointerDown={(e) => e.stopPropagation()}
              className={`${iconButton} hover:bg-red-50 hover:text-red-600`}
            >
              <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" />
              </svg>
            </button>
          )}
        </div>
      </div>
      {card.details && <p className="mt-1.5 line-clamp-3 text-[13px] leading-6 text-gray-text">{card.details}</p>}
      <CardMeta card={card} />
    </div>
  );
}

function CardEditForm({
  card,
  onSave,
  onCancel,
}: {
  card: Card;
  onSave: (changes: CardChanges) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(card.title);
  const [details, setDetails] = useState(card.details);
  const [dueDate, setDueDate] = useState(card.due_date ?? "");
  const [priority, setPriority] = useState<Priority | "">(card.priority ?? "");
  const [label, setLabel] = useState<Label | null>(card.label ?? null);
  const [assignee, setAssignee] = useState(card.assignee ?? "");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!title.trim()) return;
        onSave({
          title: title.trim(),
          details: details.trim(),
          due_date: dueDate || null,
          priority: priority || null,
          label,
          assignee: assignee.trim() || null,
        });
      }}
      onKeyDown={(e) => e.key === "Escape" && onCancel()}
      className="space-y-2 rounded-xl border border-primary/40 bg-white p-3 shadow-sm"
    >
      <input
        autoFocus
        aria-label="ویرایش عنوان"
        maxLength={200}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className={field}
      />
      <textarea
        aria-label="ویرایش جزئیات"
        rows={3}
        maxLength={5000}
        value={details}
        onChange={(e) => setDetails(e.target.value)}
        className={`${field} resize-none`}
      />
      <div className="grid grid-cols-2 gap-2">
        <label className="space-y-1">
          <span className="text-xs text-gray-text">سررسید</span>
          <input type="date" dir="ltr" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={`${field} px-2`} />
        </label>
        <label className="space-y-1">
          <span className="text-xs text-gray-text">اولویت</span>
          <select value={priority} onChange={(e) => setPriority(e.target.value as Priority | "")} className={`${field} px-2`}>
            <option value="">ندارد</option>
            {PRIORITIES.map((p) => (
              <option key={p.value} value={p.value}>
                {p.name.replace("اولویت ", "")}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="block space-y-1">
        <span className="text-xs text-gray-text">مسئول</span>
        <input maxLength={50} value={assignee} onChange={(e) => setAssignee(e.target.value)} className={field} />
      </label>
      <fieldset className="space-y-1">
        <legend className="text-xs text-gray-text">برچسب</legend>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            aria-label="بدون برچسب"
            aria-pressed={label === null}
            onClick={() => setLabel(null)}
            className={`grid h-6 w-6 place-items-center rounded-full border text-xs text-gray-text ${label === null ? "border-navy" : "border-slate-200"}`}
          >
            ×
          </button>
          {LABELS.map((l) => (
            <button
              key={l.value}
              type="button"
              aria-label={`برچسب ${l.name}`}
              aria-pressed={label === l.value}
              onClick={() => setLabel(l.value)}
              className={`h-6 w-6 rounded-full ${l.swatch} ${label === l.value ? "ring-2 ring-navy ring-offset-2" : ""}`}
            />
          ))}
        </div>
      </fieldset>
      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={!title.trim()}
          className="rounded-lg bg-secondary px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
        >
          ذخیره
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg px-3 py-2 text-sm text-gray-text transition hover:bg-slate-100"
        >
          انصراف
        </button>
      </div>
    </form>
  );
}

export function CardItem({
  card,
  onDelete,
  onUpdate,
}: {
  card: Card;
  onDelete: (id: string) => void;
  onUpdate: (changes: CardChanges) => void;
}) {
  const [editing, setEditing] = useState(false);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.id,
    disabled: editing,
  });
  return (
    <li
      ref={setNodeRef}
      data-testid={`card-${card.id}`}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ${isDragging ? "opacity-40" : ""}`}
      // While editing, skip the sortable role/aria-disabled so the form isn't nested in a disabled button.
      {...(editing ? {} : attributes)}
      {...listeners}
    >
      {editing ? (
        <CardEditForm
          card={card}
          onSave={(changes) => {
            onUpdate(changes);
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <CardView card={card} onDelete={onDelete} onEdit={() => setEditing(true)} />
      )}
    </li>
  );
}
