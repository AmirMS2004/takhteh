"use client";

import { useState } from "react";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { BoardLabel, Card, Column, Member } from "@/lib/board";
import { CardEditForm, CardItem, type CardChanges } from "./CardItem";

type Props = {
  column: Column;
  cards: Card[];
  onRename: (title: string) => void;
  onAdd: (fields: CardChanges) => void;
  onDelete: (cardId: string) => void;
  onUpdate: (cardId: string, changes: CardChanges) => void;
  labels: BoardLabel[];
  members: Member[];
  onManageLabels: () => void;
  onDeleteColumn: () => void;
  filtering?: boolean;
};

function ColumnTitle({ title, onRename }: { title: string; onRename: (t: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(title);

  const save = () => {
    if (value.trim() && value.trim() !== title) onRename(value.trim());
    else setValue(title);
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        autoFocus
        aria-label="نام ستون"
        maxLength={200}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") {
            setValue(title);
            setEditing(false);
          }
        }}
        className="w-full rounded-md border border-primary/50 bg-white px-2 py-1 text-base font-bold text-navy outline-none ring-4 ring-primary/10"
      />
    );
  }
  return (
    <button
      type="button"
      title="برای تغییر نام کلیک کنید"
      onClick={() => {
        setValue(title);
        setEditing(true);
      }}
      className="truncate rounded-md px-2 py-1 text-right text-base font-bold text-navy transition hover:bg-white/70"
    >
      {title}
    </button>
  );
}

const EMPTY_CARD: Card = { id: "", title: "", details: "" };

function AddCardForm({
  onAdd,
  labels,
  members,
  onManageLabels,
}: Pick<Props, "onAdd" | "labels" | "members" | "onManageLabels">) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-navy/20 py-2.5 text-sm font-medium text-gray-text transition hover:border-primary hover:bg-white hover:text-primary"
      >
        <span className="text-lg leading-none">+</span>
        افزودن کارت
      </button>
    );
  }
  return (
    <CardEditForm
      card={EMPTY_CARD}
      isNew
      labels={labels}
      members={members}
      onManageLabels={onManageLabels}
      onSave={(fields) => {
        onAdd(fields);
        setOpen(false);
      }}
      onCancel={() => setOpen(false)}
    />
  );
}

export function ColumnView({
  column,
  cards,
  onRename,
  onAdd,
  onDelete,
  onUpdate,
  labels,
  members,
  onManageLabels,
  onDeleteColumn,
  filtering = false,
}: Props) {
  // The column is sortable (columns can be reordered) and also the drop target for cards.
  const { setNodeRef, setActivatorNodeRef, attributes, listeners, transform, transition, isDragging, isOver } =
    useSortable({ id: column.id, data: { type: "column" } });
  const total = column.cardIds.length;

  return (
    <section
      ref={setNodeRef}
      data-testid={`column-${column.id}`}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`group/column flex w-64 shrink-0 flex-col rounded-2xl border bg-mist/70 backdrop-blur transition-colors ${
        isOver ? "border-primary/40 bg-primary-50/80" : "border-line"
      } ${isDragging ? "opacity-40" : ""}`}
    >
      <header className="flex items-center justify-between gap-1 px-3 pt-3 pb-2">
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          aria-label={`جابه‌جایی ستون ${column.title}`}
          className="shrink-0 cursor-grab rounded-md p-1 text-gray-text transition hover:bg-white/70 hover:text-navy active:cursor-grabbing"
        >
          <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor" aria-hidden>
            <circle cx="7" cy="5" r="1.4" />
            <circle cx="13" cy="5" r="1.4" />
            <circle cx="7" cy="10" r="1.4" />
            <circle cx="13" cy="10" r="1.4" />
            <circle cx="7" cy="15" r="1.4" />
            <circle cx="13" cy="15" r="1.4" />
          </svg>
        </button>
        <div className="min-w-0 flex-1">
          <ColumnTitle title={column.title} onRename={onRename} />
        </div>
        <button
          type="button"
          aria-label={`حذف ستون ${column.title}`}
          onClick={() => {
            const question = total
              ? `ستون «${column.title}» با ${total.toLocaleString("fa-IR")} کارتش حذف شود؟ این کار برگشت‌پذیر نیست.`
              : `ستون «${column.title}» حذف شود؟`;
            if (window.confirm(question)) onDeleteColumn();
          }}
          className="shrink-0 rounded-md p-1 text-gray-text opacity-0 transition group-hover/column:opacity-100 group-focus-within/column:opacity-100 hover:bg-danger-50 hover:text-danger focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
        >
          <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
            <path d="M4 6h12M8 6V4h4v2M6 6l.8 10h6.4L14 6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <span
          data-testid="card-count"
          className="min-w-7 rounded-full bg-white px-2 py-0.5 text-center text-xs font-semibold text-navy/70 ring-1 ring-line"
        >
          {cards.length.toLocaleString("fa-IR")}
        </span>
      </header>
      <SortableContext items={column.cardIds} strategy={verticalListSortingStrategy}>
        <ul className="flex min-h-24 flex-1 flex-col gap-2.5 px-3 pb-3">
          {cards.length === 0 && (
            <li className="grid flex-1 place-items-center rounded-xl border border-dashed border-navy/20 px-3 py-6 text-center text-xs text-gray-text">
              {filtering ? "کارتی با این فیلتر نیست." : "کارتی نیست؛ کارت را اینجا رها کنید."}
            </li>
          )}
          {cards.map((card) => (
            <CardItem
              key={card.id}
              card={card}
              onDelete={onDelete}
              onUpdate={(changes) => onUpdate(card.id, changes)}
              labels={labels}
              members={members}
              onManageLabels={onManageLabels}
              dragDisabled={filtering}
            />
          ))}
        </ul>
      </SortableContext>
      <div className="px-3 pb-3">
        <AddCardForm onAdd={onAdd} labels={labels} members={members} onManageLabels={onManageLabels} />
      </div>
    </section>
  );
}

/** What follows the pointer while a column is dragged. */
export function ColumnPreview({ title, count }: { title: string; count: number }) {
  return (
    <div className="w-64 rotate-2 rounded-2xl border border-primary/40 bg-mist shadow-[0_18px_40px_-12px_rgba(3,33,71,0.45)]">
      <div className="flex items-center justify-between px-5 py-4">
        <span className="font-bold text-navy">{title}</span>
        <span className="text-xs text-primary">{count.toLocaleString("fa-IR")} کارت</span>
      </div>
    </div>
  );
}

/** A ghost column at the end of the board for adding a column. */
export function AddColumn({ onAdd }: { onAdd: (title: string) => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const close = () => {
    setOpen(false);
    setTitle("");
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="h-12 w-64 shrink-0 rounded-2xl border border-dashed border-navy/20 text-sm font-medium text-gray-text transition hover:border-primary hover:bg-white hover:text-primary"
      >
        + ستون تازه
      </button>
    );
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!title.trim()) return;
        onAdd(title.trim());
        close();
      }}
      onKeyDown={(e) => e.key === "Escape" && close()}
      className="w-64 shrink-0 space-y-2 self-start rounded-2xl border border-line bg-white p-3 shadow-sm"
    >
      <input
        autoFocus
        aria-label="نام ستون تازه"
        placeholder="نام ستون"
        maxLength={200}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="w-full rounded-lg border border-line px-3 py-2 text-sm text-navy outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10"
      />
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={!title.trim()}
          className="rounded-lg bg-secondary px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
        >
          افزودن ستون
        </button>
        <button type="button" onClick={close} className="rounded-lg px-3 py-2 text-sm text-gray-text transition hover:bg-mist">
          انصراف
        </button>
      </div>
    </form>
  );
}

