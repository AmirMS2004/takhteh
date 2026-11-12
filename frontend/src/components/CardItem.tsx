"use client";

import { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Card } from "@/lib/board";

type Props = {
  card: Card;
  onDelete?: (id: string) => void;
  onEdit?: () => void;
  overlay?: boolean;
};

const iconButton =
  "rounded-md p-1 text-gray-text opacity-0 transition focus-visible:opacity-100 group-hover:opacity-100";

export function CardView({ card, onDelete, onEdit, overlay }: Props) {
  return (
    <div
      className={`group relative rounded-xl border border-slate-200/80 bg-white p-4 shadow-[0_1px_2px_rgba(3,33,71,0.06)] transition-shadow hover:shadow-[0_8px_24px_-12px_rgba(3,33,71,0.35)] ${
        overlay ? "rotate-2 cursor-grabbing shadow-[0_18px_40px_-12px_rgba(3,33,71,0.45)] ring-2 ring-primary/40" : "cursor-grab"
      }`}
    >
      <span className="absolute inset-y-3 right-0 w-1 rounded-l-full bg-accent opacity-0 transition-opacity group-hover:opacity-100" />
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
              onClick={() => onDelete(card.id)}
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
      {card.details && <p className="mt-1.5 text-[13px] leading-6 text-gray-text">{card.details}</p>}
    </div>
  );
}

function CardEditForm({
  card,
  onSave,
  onCancel,
}: {
  card: Card;
  onSave: (title: string, details: string) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(card.title);
  const [details, setDetails] = useState(card.details);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (title.trim()) onSave(title.trim(), details.trim());
      }}
      onKeyDown={(e) => e.key === "Escape" && onCancel()}
      className="space-y-2 rounded-xl border border-primary/40 bg-white p-3 shadow-sm"
    >
      <input
        autoFocus
        aria-label="ویرایش عنوان"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-navy outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10"
      />
      <textarea
        aria-label="ویرایش جزئیات"
        rows={3}
        value={details}
        onChange={(e) => setDetails(e.target.value)}
        className="w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm text-navy outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10"
      />
      <div className="flex gap-2">
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
  onUpdate: (title: string, details: string) => void;
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
      className={isDragging ? "opacity-40" : ""}
      // While editing, skip the sortable role/aria-disabled so the form isn't nested in a disabled button.
      {...(editing ? {} : attributes)}
      {...listeners}
    >
      {editing ? (
        <CardEditForm
          card={card}
          onSave={(title, details) => {
            onUpdate(title, details);
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
