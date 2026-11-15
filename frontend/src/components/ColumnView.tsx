"use client";

import { useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { Card, Column } from "@/lib/board";
import { CardItem } from "./CardItem";

type Props = {
  column: Column;
  cards: Card[];
  onRename: (title: string) => void;
  onAdd: (title: string, details: string) => void;
  onDelete: (cardId: string) => void;
  onUpdate: (cardId: string, title: string, details: string) => void;
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

function AddCardForm({ onAdd }: { onAdd: Props["onAdd"] }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");

  const close = () => {
    setOpen(false);
    setTitle("");
    setDetails("");
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-slate-300 py-2.5 text-sm font-medium text-gray-text transition hover:border-primary hover:bg-white hover:text-primary"
      >
        <span className="text-lg leading-none">+</span>
        افزودن کارت
      </button>
    );
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!title.trim()) return;
        onAdd(title.trim(), details.trim());
        close();
      }}
      onKeyDown={(e) => e.key === "Escape" && close()}
      className="space-y-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm"
    >
      <input
        autoFocus
        placeholder="عنوان کارت"
        aria-label="عنوان کارت"
        maxLength={200}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-navy outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10"
      />
      <textarea
        placeholder="جزئیات"
        aria-label="جزئیات کارت"
        rows={3}
        maxLength={5000}
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
          ثبت کارت
        </button>
        <button
          type="button"
          onClick={close}
          className="rounded-lg px-3 py-2 text-sm text-gray-text transition hover:bg-slate-100"
        >
          انصراف
        </button>
      </div>
    </form>
  );
}

export function ColumnView({ column, cards, onRename, onAdd, onDelete, onUpdate }: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });

  return (
    <section
      ref={setNodeRef}
      data-testid={`column-${column.id}`}
      className={`flex w-64 shrink-0 flex-col rounded-2xl border bg-slate-100/70 backdrop-blur transition-colors ${
        isOver ? "border-primary/40 bg-sky-50/80" : "border-slate-200/70"
      }`}
    >
      <div className="h-1 rounded-t-2xl bg-accent" />
      <header className="flex items-center justify-between gap-2 px-3 pt-3 pb-2">
        <ColumnTitle title={column.title} onRename={onRename} />
        <span
          data-testid="card-count"
          className="min-w-7 rounded-full bg-primary/10 px-2 py-0.5 text-center text-xs font-semibold text-primary"
        >
          {cards.length.toLocaleString("fa-IR")}
        </span>
      </header>
      <SortableContext items={column.cardIds} strategy={verticalListSortingStrategy}>
        <ul className="flex min-h-24 flex-1 flex-col gap-2.5 px-3 pb-3">
          {cards.length === 0 && (
            <li className="grid flex-1 place-items-center rounded-xl border border-dashed border-slate-300 px-3 py-6 text-center text-xs text-gray-text">
              کارتی نیست؛ کارت را اینجا رها کنید.
            </li>
          )}
          {cards.map((card) => (
            <CardItem
              key={card.id}
              card={card}
              onDelete={onDelete}
              onUpdate={(title, details) => onUpdate(card.id, title, details)}
            />
          ))}
        </ul>
      </SortableContext>
      <div className="px-3 pb-3">
        <AddCardForm onAdd={onAdd} />
      </div>
    </section>
  );
}
