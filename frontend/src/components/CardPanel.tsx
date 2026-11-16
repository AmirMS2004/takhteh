"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import * as api from "@/lib/api";
import type { CardComment } from "@/lib/api";
import type { Card, ChecklistItem, Member } from "@/lib/board";
import { useI18n } from "@/lib/i18n";
import { timeAgo } from "@/lib/time";
import { Avatar } from "./Avatar";
import { Modal } from "./Modal";

const field =
  "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10";

/** A comment's text with @mentions of board members highlighted. */
function CommentText({ body, members }: { body: string; members: Member[] }) {
  const names = new Set(members.map((m) => m.username));
  return (
    <p dir="auto" className="text-sm leading-6 whitespace-pre-wrap text-ink">
      {body.split(/(@[A-Za-z0-9_]{3,32})/).map((part, i) =>
        part.startsWith("@") && names.has(part.slice(1).toLowerCase()) ? (
          <span key={i} dir="ltr" className="rounded bg-primary-50 px-0.5 font-medium text-primary-700">
            {part}
          </span>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </p>
  );
}

function Checklist({
  items,
  onChange,
  onAdd,
}: {
  items: ChecklistItem[];
  onChange: (items: ChecklistItem[], saved: Promise<unknown>) => void;
  onAdd: (text: string) => Promise<void>;
}) {
  const { t } = useI18n();
  const [text, setText] = useState("");
  const done = items.filter((i) => i.done).length;
  return (
    <section aria-labelledby="checklist-title" className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 id="checklist-title" className="text-sm font-bold text-ink">
          {t("checklist.title")}
        </h3>
        {items.length > 0 && (
          <span className="text-xs text-gray-text">{t("checklist.progress", { done, total: items.length })}</span>
        )}
      </div>
      {items.length > 0 && (
        <div className="h-1.5 overflow-hidden rounded-full bg-mist" aria-hidden>
          <div
            className="h-full rounded-full bg-label-green transition-all"
            style={{ width: `${(done / items.length) * 100}%` }}
          />
        </div>
      )}
      <ul className="space-y-1">
        {items.map((item) => (
          <li key={item.id} className="group flex items-center gap-2 rounded-lg px-1 py-1 hover:bg-mist">
            <input
              type="checkbox"
              checked={item.done}
              aria-label={item.text}
              onChange={() =>
                onChange(
                  items.map((i) => (i.id === item.id ? { ...i, done: !i.done } : i)),
                  api.updateChecklistItem(item.id, { done: !item.done }),
                )
              }
              className="h-4 w-4 shrink-0 accent-[var(--color-label-green)]"
            />
            <span dir="auto" className={`flex-1 text-sm ${item.done ? "text-gray-text line-through" : "text-ink"}`}>
              {item.text}
            </span>
            <button
              type="button"
              aria-label={t("checklist.delete", { text: item.text })}
              onClick={() =>
                onChange(
                  items.filter((i) => i.id !== item.id),
                  api.deleteChecklistItem(item.id),
                )
              }
              className="rounded p-1 text-gray-text opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100 hover:text-danger focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
            >
              <svg
                viewBox="0 0 20 20"
                className="h-3.5 w-3.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden
              >
                <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" />
              </svg>
            </button>
          </li>
        ))}
      </ul>
      <form
        className="flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!text.trim()) return;
          const value = text.trim();
          setText("");
          await onAdd(value);
        }}
      >
        <input
          dir="auto"
          maxLength={200}
          value={text}
          onChange={(e) => setText(e.target.value)}
          aria-label={t("checklist.new")}
          placeholder={t("checklist.new")}
          className={field}
        />
        <button
          type="submit"
          disabled={!text.trim()}
          className="shrink-0 rounded-lg border border-line px-3 text-sm font-medium text-primary-700 transition hover:bg-primary-50 disabled:opacity-50"
        >
          {t("checklist.add")}
        </button>
      </form>
    </section>
  );
}

function Comments({ card, members, onCount }: { card: Card; members: Member[]; onCount: (count: number) => void }) {
  const i18n = useI18n();
  const { t } = i18n;
  const [comments, setComments] = useState<CardComment[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const box = useRef<HTMLTextAreaElement>(null);

  // Loaded when the panel opens, and again when the count changes (someone else commented).
  useEffect(() => {
    api.getComments(card.id).then(setComments, () => setFailed(true));
  }, [card.id, card.comments]);

  const mention = (username: string) => {
    setBody((b) => `${b}${b && !b.endsWith(" ") ? " " : ""}@${username} `);
    box.current?.focus();
  };

  return (
    <section aria-labelledby="comments-title" className="space-y-3">
      <h3 id="comments-title" className="text-sm font-bold text-ink">
        {t("comments.title")}
      </h3>
      {failed && (
        <p role="alert" className="text-sm text-danger">
          {t("common.network")}
        </p>
      )}
      {comments && comments.length === 0 && <p className="text-sm text-gray-text">{t("comments.empty")}</p>}
      {comments && comments.length > 0 && (
        <ul className="space-y-3">
          {comments.map((c) => (
            <li key={c.id} className="flex gap-2.5">
              <Avatar avatar={c.author_avatar} username={c.author ?? "?"} size={28} />
              <div className="min-w-0 flex-1 rounded-xl bg-mist px-3 py-2">
                <div className="flex items-center gap-2 text-xs text-gray-text">
                  <span dir="ltr" className="font-semibold text-ink">
                    {c.author ?? t("history.removedUser")}
                  </span>
                  <span>{timeAgo(c.created_at, i18n)}</span>
                  {c.mine && (
                    <button
                      type="button"
                      onClick={async () => {
                        await api.deleteComment(c.id);
                        const rest = comments.filter((x) => x.id !== c.id);
                        setComments(rest);
                        onCount(rest.length);
                      }}
                      className="ms-auto rounded px-1 text-gray-text hover:text-danger"
                    >
                      {t("comments.delete")}
                    </button>
                  )}
                </div>
                <CommentText body={c.body} members={members} />
              </div>
            </li>
          ))}
        </ul>
      )}
      <form
        className="space-y-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!body.trim() || sending) return;
          setSending(true);
          try {
            const added = await api.addComment(card.id, body.trim());
            const all = [...(comments ?? []), added];
            setComments(all);
            setBody("");
            onCount(all.length);
          } catch {
            setFailed(true);
          } finally {
            setSending(false);
          }
        }}
      >
        <textarea
          ref={box}
          dir="auto"
          rows={2}
          maxLength={2000}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          aria-label={t("comments.new")}
          placeholder={t("comments.placeholder")}
          className={`${field} resize-y`}
        />
        <div className="flex flex-wrap items-center gap-1.5">
          {members.length > 1 && <span className="text-xs text-gray-text">{t("comments.mention")}</span>}
          {members.length > 1 &&
            members.map((m) => (
              <button
                key={m.username}
                type="button"
                dir="ltr"
                onClick={() => mention(m.username)}
                className="rounded-full border border-line px-2 py-0.5 text-xs text-primary-700 transition hover:bg-primary-50"
              >
                @{m.username}
              </button>
            ))}
          <button
            type="submit"
            disabled={!body.trim() || sending}
            className="ms-auto rounded-lg bg-secondary px-4 py-1.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
          >
            {t("comments.send")}
          </button>
        </div>
      </form>
    </section>
  );
}

/** A card's checklist and comments, with archiving. */
export function CardPanel({
  card,
  members,
  onChecklist,
  onAddItem,
  onComments,
  onArchive,
  onClose,
}: {
  card: Card;
  members: Member[];
  onChecklist: (items: ChecklistItem[], saved: Promise<unknown>) => void;
  onAddItem: (text: string) => Promise<void>;
  onComments: (count: number) => void;
  onArchive: () => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  return (
    <Modal title={card.title} onClose={onClose}>
      {card.details && (
        <p dir="auto" className="-mt-2 text-sm leading-6 whitespace-pre-wrap text-gray-text">
          {card.details}
        </p>
      )}
      <Checklist items={card.checklist ?? []} onChange={onChecklist} onAdd={onAddItem} />
      <div className="border-t border-line" />
      <Comments card={card} members={members} onCount={onComments} />
      <div className="flex gap-2 border-t border-line pt-3">
        <button
          type="button"
          onClick={onArchive}
          className="rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-ink transition hover:bg-mist"
        >
          {t("archive.archiveCard")}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="ms-auto rounded-lg px-4 py-1.5 text-sm text-gray-text transition hover:bg-mist"
        >
          {t("common.close")}
        </button>
      </div>
    </Modal>
  );
}
