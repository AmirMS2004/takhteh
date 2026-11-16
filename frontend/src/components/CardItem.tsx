"use client";

import { useContext, useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { BoardLabel, Card, Member, Priority } from "@/lib/board";
import { AskAssistant, splitRequest } from "@/lib/assistant";
import { OpenCard, ShowHistory } from "@/lib/workspace";
import { PRIORITIES, colorOf, formatDue, labelTitle, priorityName, today } from "@/lib/cardDetails";
import { useI18n } from "@/lib/i18n";

type Props = {
  card: Card;
  labels: BoardLabel[];
  onDelete?: (id: string) => void;
  onEdit?: () => void;
  onToggleDone?: () => void;
  overlay?: boolean;
};

export type CardChanges = Omit<Card, "id">;

// Shown on hover or keyboard focus; always shown on touch screens, which have no hover.
const iconButton =
  "rounded-md p-1 text-gray-text opacity-0 transition focus-visible:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100";
const field =
  "w-full rounded-lg border border-line px-3 py-2 text-sm text-ink outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10";

function CardMeta({ card }: { card: Card }) {
  const i18n = useI18n();
  const { t, num } = i18n;
  const priority = PRIORITIES.find((p) => p.value === card.priority);
  const overdue = !!card.due_date && !card.done && card.due_date < today();
  const items = card.checklist ?? [];
  const checked = items.filter((i) => i.done).length;
  if (!priority && !card.due_date && !card.assignee && !items.length && !card.comments) return null;
  return (
    <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-[11px] font-medium">
      {items.length > 0 && (
        <span
          title={t("checklist.title")}
          className={`flex items-center gap-1 rounded-full px-2 py-0.5 ${
            checked === items.length ? "bg-label-green text-white" : "bg-mist text-ink/80"
          }`}
        >
          <svg viewBox="0 0 20 20" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
            <rect x="3" y="3" width="14" height="14" rx="3" />
            <path d="M6.5 10l2.5 2.5 4.5-5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {t("checklist.progress", { done: checked, total: items.length })}
        </span>
      )}
      {!!card.comments && (
        <span title={t("comments.title")} className="flex items-center gap-1 rounded-full bg-mist px-2 py-0.5 text-ink/80">
          <svg viewBox="0 0 20 20" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M4 5h12v8H8l-4 3V5z" strokeLinejoin="round" />
          </svg>
          <span className="sr-only">{t("comments.title")}:</span> {num(card.comments)}
        </span>
      )}
      {priority && <span className={`rounded-full px-2 py-0.5 ${priority.chip}`}>{priorityName(priority.value, i18n)}</span>}
      {card.due_date && (
        <span
          title={card.done ? t("card.dueDone") : overdue ? t("card.overdue") : t("card.due")}
          className={`flex items-center gap-1 rounded-full px-2 py-0.5 ${
            card.done ? "bg-mist text-gray-text line-through" : overdue ? "bg-danger text-white" : "bg-primary-50 text-primary-700"
          }`}
        >
          <svg viewBox="0 0 20 20" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <rect x="3" y="4.5" width="14" height="12" rx="2" />
            <path d="M3 8.5h14M7 3v3M13 3v3" strokeLinecap="round" />
          </svg>
          {formatDue(card.due_date, i18n)}
        </span>
      )}
      {card.assignee && (
        <span className="ms-auto flex items-center gap-1 text-gray-text" title={t("card.assignee")}>
          <span className="grid h-5 w-5 place-items-center rounded-full bg-navy text-[10px] font-bold text-white" aria-hidden>
            {card.assignee[0]}
          </span>
          {card.assignee}
        </span>
      )}
    </div>
  );
}

/** The card's labels in board order: named ones as pills, unnamed ones as short color strips. */
function CardLabels({ card, labels }: { card: Card; labels: BoardLabel[] }) {
  const i18n = useI18n();
  const own = labels.filter((l) => card.labels?.includes(l.id));
  if (own.length === 0) return null;
  return (
    <div className="mb-2 flex flex-wrap items-center gap-1">
      {own.map((l) =>
        l.name ? (
          <span key={l.id} title={labelTitle(l, i18n)} className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${colorOf(l.color).pill}`}>
            {l.name}
          </span>
        ) : (
          <span key={l.id} title={labelTitle(l, i18n)} className={`h-1.5 w-8 rounded-full ${colorOf(l.color).swatch}`} />
        ),
      )}
    </div>
  );
}

export function CardView({ card, labels, onDelete, onEdit, onToggleDone, overlay }: Props) {
  const ask = useContext(AskAssistant);
  const open = useContext(OpenCard);
  const i18n = useI18n();
  const { t } = i18n;
  return (
    <div
      data-done={card.done || undefined}
      className={`group relative rounded-xl border border-line bg-surface p-4 shadow-[0_1px_2px_rgba(3,33,71,0.06)] transition-shadow hover:shadow-[0_8px_24px_-12px_rgba(3,33,71,0.35)] ${
        overlay ? "rotate-2 cursor-grabbing shadow-[0_18px_40px_-12px_rgba(3,33,71,0.45)] ring-2 ring-primary/40" : "cursor-grab"
      }`}
    >
      <span className="absolute inset-y-3 start-0 w-1 rounded-e-full bg-accent opacity-0 transition-opacity group-hover:opacity-100" />
      <CardLabels card={card} labels={labels} />
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2">
          {(onToggleDone || overlay) && (
            <button
              type="button"
              role="checkbox"
              aria-checked={!!card.done}
              aria-label={t("card.done", { title: card.title })}
              title={card.done ? t("card.markOpen") : t("card.markDone")}
              onClick={onToggleDone}
              onPointerDown={(e) => e.stopPropagation()}
              className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md border-2 transition ${
                card.done
                  ? "border-label-green bg-label-green text-white"
                  : "border-line text-transparent hover:border-label-green hover:text-label-green"
              }`}
            >
              <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.6" aria-hidden>
                <path d="M4.5 10.5l3.5 3.5 7.5-8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}
          <h3
            dir="auto"
            className={`text-[15px] font-semibold leading-6 ${card.done ? "text-gray-text line-through" : "text-ink"}`}
          >
            {card.title}
          </h3>
        </div>
        <div className="-mt-1 -me-1 flex shrink-0">
          {ask && !overlay && (
            <button
              type="button"
              aria-label={t("card.split", { title: card.title })}
              title={t("card.splitTitle")}
              onClick={() => ask(splitRequest(card.title, i18n))}
              onPointerDown={(e) => e.stopPropagation()}
              className={`${iconButton} hover:bg-accent-50 hover:text-ink`}
            >
              <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M4 10h5m0 0l7-5M9 10l7 5M14 5h2v2M14 15h2v-2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}
          {open && !overlay && (
            <button
              type="button"
              aria-label={t("card.open", { title: card.title })}
              title={t("card.openTitle")}
              onClick={() => open(card.id)}
              onPointerDown={(e) => e.stopPropagation()}
              className={`${iconButton} hover:bg-primary-50 hover:text-primary-700`}
            >
              <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                <rect x="3.5" y="3.5" width="13" height="13" rx="2.5" />
                <path d="M7 8h6M7 11h6M7 14h3" strokeLinecap="round" />
              </svg>
            </button>
          )}
          {onEdit && (
            <button
              type="button"
              aria-label={t("card.edit", { title: card.title })}
              onClick={onEdit}
              onPointerDown={(e) => e.stopPropagation()}
              className={`${iconButton} hover:bg-primary-50 hover:text-primary`}
            >
              <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M13.5 3.5l3 3L7 16H4v-3l9.5-9.5z" strokeLinejoin="round" />
              </svg>
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              aria-label={t("card.delete", { title: card.title })}
              onClick={() => window.confirm(t("card.confirmDelete", { title: card.title })) && onDelete(card.id)}
              onPointerDown={(e) => e.stopPropagation()}
              className={`${iconButton} hover:bg-danger-50 hover:text-danger`}
            >
              <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" />
              </svg>
            </button>
          )}
        </div>
      </div>
      {card.details && <p dir="auto" className="mt-1.5 line-clamp-3 text-[13px] leading-6 text-gray-text">{card.details}</p>}
      <CardMeta card={card} />
    </div>
  );
}

/** The card form: edits a card, or with `isNew` fills in a new one (all fields at once). */
export function CardEditForm({
  card,
  isNew = false,
  labels,
  members,
  onSave,
  onCancel,
  onManageLabels,
}: {
  card: Card;
  isNew?: boolean;
  labels: BoardLabel[];
  members: Member[];
  onSave: (changes: CardChanges) => void;
  onCancel: () => void;
  onManageLabels: () => void;
}) {
  const [title, setTitle] = useState(card.title);
  const [details, setDetails] = useState(card.details);
  const [dueDate, setDueDate] = useState(card.due_date ?? "");
  const [priority, setPriority] = useState<Priority | "">(card.priority ?? "");
  const [selected, setSelected] = useState<string[]>(card.labels ?? []);
  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const [assignee, setAssignee] = useState(card.assignee ?? "");
  const showHistory = useContext(ShowHistory);
  const i18n = useI18n();
  const { t } = i18n;

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
          labels: labels.filter((l) => selected.includes(l.id)).map((l) => l.id),
          assignee: assignee || null,
        });
      }}
      onKeyDown={(e) => e.key === "Escape" && onCancel()}
      className="space-y-2 rounded-xl border border-primary/40 bg-surface p-3 shadow-sm"
    >
      <input
        autoFocus
        dir="auto"
        aria-label={isNew ? t("card.title") : t("card.editTitle")}
        placeholder={isNew ? t("card.title") : undefined}
        maxLength={200}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className={field}
      />
      <textarea
        dir="auto"
        aria-label={isNew ? t("card.details") : t("card.editDetails")}
        placeholder={isNew ? t("card.detailsPlaceholder") : undefined}
        rows={3}
        maxLength={5000}
        value={details}
        onChange={(e) => setDetails(e.target.value)}
        className={`${field} resize-none`}
      />
      <div className="grid grid-cols-2 gap-2">
        <label className="space-y-1">
          <span className="text-xs text-gray-text">{t("card.due")}</span>
          <input type="date" dir="ltr" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={`${field} px-2`} />
        </label>
        <label className="space-y-1">
          <span className="text-xs text-gray-text">{t("card.priority")}</span>
          <select value={priority} onChange={(e) => setPriority(e.target.value as Priority | "")} className={`${field} px-2`}>
            <option value="">{t("card.none")}</option>
            {PRIORITIES.map((p) => (
              <option key={p.value} value={p.value}>
                {priorityName(p.value, i18n, true)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="block space-y-1">
        <span className="text-xs text-gray-text">{t("card.assignee")}</span>
        <select dir="ltr" value={assignee} onChange={(e) => setAssignee(e.target.value)} className={`${field} px-2`}>
          <option value="">{t("card.noAssignee")}</option>
          {members.map((m) => (
            <option key={m.username} value={m.username}>
              {m.username}
            </option>
          ))}
        </select>
      </label>
      <fieldset className="space-y-1">
        <legend className="flex w-full items-center justify-between text-xs text-gray-text">
          {t("card.labels")}
          <button type="button" onClick={onManageLabels} className="font-medium text-primary-700 hover:underline">
            {t("card.manageLabels")}
          </button>
        </legend>
        <div className="flex flex-wrap gap-1.5">
          {labels.map((l) => {
            const on = selected.includes(l.id);
            return (
              <button
                key={l.id}
                type="button"
                aria-label={labelTitle(l, i18n)}
                aria-pressed={on}
                onClick={() => toggle(l.id)}
                className={`flex h-6 min-w-8 items-center rounded px-2 text-[11px] font-semibold transition ${colorOf(l.color).pill} ${
                  on ? "ring-2 ring-ink ring-offset-1 ring-offset-surface" : "opacity-40 hover:opacity-70"
                }`}
              >
                {l.name}
              </button>
            );
          })}
        </div>
      </fieldset>
      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={!title.trim()}
          className="rounded-lg bg-secondary px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isNew ? t("card.add") : t("common.save")}
        </button>
        {!isNew && showHistory && (
          <button
            type="button"
            onClick={() => showHistory({ id: card.id, title: card.title })}
            className="ms-auto rounded-lg px-3 py-2 text-sm text-primary-700 transition hover:bg-primary-50"
          >
            {t("card.history")}
          </button>
        )}
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg px-3 py-2 text-sm text-gray-text transition hover:bg-mist"
        >
          {t("common.cancel")}
        </button>
      </div>
    </form>
  );
}

export function CardItem({
  card,
  labels,
  members,
  onDelete,
  onUpdate,
  onManageLabels,
  dragDisabled = false,
}: {
  card: Card;
  labels: BoardLabel[];
  members: Member[];
  onDelete: (id: string) => void;
  onUpdate: (changes: Partial<CardChanges>) => void;
  onManageLabels: () => void;
  dragDisabled?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const { t } = useI18n();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.id,
    disabled: editing || dragDisabled,
    attributes: { role: "listitem", roleDescription: t("dnd.card") },
  });
  return (
    <li
      ref={setNodeRef}
      data-testid={`card-${card.id}`}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ${isDragging ? "opacity-40" : ""}`}
      // When dragging is off, skip the sortable role/aria-disabled: otherwise the card's own buttons
      // (and the edit form) would sit inside a "disabled button".
      {...(editing || dragDisabled ? {} : attributes)}
      {...listeners}
    >
      {editing ? (
        <CardEditForm
          card={card}
          labels={labels}
          members={members}
          onManageLabels={onManageLabels}
          onSave={(changes) => {
            onUpdate(changes);
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <CardView
          card={card}
          labels={labels}
          onDelete={onDelete}
          onEdit={() => setEditing(true)}
          onToggleDone={() => onUpdate({ done: !card.done })}
        />
      )}
    </li>
  );
}
