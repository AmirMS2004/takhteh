"use client";

import { useEffect, useState } from "react";
import * as api from "@/lib/api";
import type { BoardState } from "@/lib/board";
import { timeAgo } from "@/lib/time";
import { Avatar } from "./Avatar";
import { Modal } from "./Modal";

/** The board's activity log (or one card's), newest first, with "restore" on deletions. */
export function HistoryDialog({
  boardId,
  card,
  onRestored,
  onClose,
}: {
  boardId: string;
  card?: { id: string; title: string };
  onRestored: (board: BoardState) => void;
  onClose: () => void;
}) {
  const [deleted, setDeleted] = useState(false);
  const [entries, setEntries] = useState<api.ActivityEntry[] | null>(null);
  const [error, setError] = useState("");

  const load = () =>
    api.getActivity(boardId, { card: card?.id, deleted }).then(setEntries, () => {
      setEntries([]);
      setError("تاریخچه بارگذاری نشد. دوباره تلاش کنید.");
    });
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deleted]);

  const restore = async (entry: api.ActivityEntry) => {
    setError("");
    try {
      onRestored(await api.restoreActivity(boardId, entry.id));
      await load();
    } catch {
      setError("بازگرداندن ممکن نشد. دوباره تلاش کنید.");
    }
  };

  const tab = (on: boolean) =>
    `rounded-lg px-3 py-1.5 text-sm font-medium transition ${on ? "bg-primary text-white" : "text-gray-text hover:bg-mist hover:text-ink"}`;

  return (
    <Modal title={card ? `تاریخچه «${card.title}»` : "تاریخچه تخته"} onClose={onClose}>
      {!card && (
        <div role="group" aria-label="نمایش" className="flex gap-1">
          <button type="button" aria-pressed={!deleted} onClick={() => setDeleted(false)} className={tab(!deleted)}>
            همه تغییرات
          </button>
          <button type="button" aria-pressed={deleted} onClick={() => setDeleted(true)} className={tab(deleted)}>
            حذف‌شده‌ها
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="rounded-lg bg-danger-50 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}
      {!entries ? (
        <p className="text-sm text-gray-text">در حال بارگذاری…</p>
      ) : entries.length === 0 ? (
        <p className="rounded-xl bg-mist px-4 py-6 text-center text-sm text-gray-text">
          {deleted ? "چیزی برای بازگرداندن نیست." : "هنوز تغییری ثبت نشده است."}
        </p>
      ) : (
        <ul className="space-y-1.5" aria-label="تغییرات">
          {entries.map((e) => (
            <li key={e.id} className="flex items-start gap-2.5 rounded-xl bg-mist px-3 py-2.5 text-sm">
              <Avatar avatar={e.avatar} username={e.user ?? "?"} size={28} />
              <div className="min-w-0 flex-1">
                <p className="leading-6 text-ink">
                  <span dir="ltr" className="font-semibold">
                    {e.user ?? "کاربر حذف‌شده"}
                  </span>{" "}
                  {e.summary}
                </p>
                <p className="mt-0.5 flex items-center gap-2 text-xs text-gray-text">
                  {timeAgo(e.created_at)}
                  {e.via === "assistant" && (
                    <span className="rounded-full bg-accent-50 px-1.5 text-accent-700">با دستیار</span>
                  )}
                </p>
              </div>
              {e.restorable && (
                <button
                  type="button"
                  onClick={() => restore(e)}
                  className="shrink-0 rounded-lg px-2.5 py-1 text-xs font-medium text-primary transition hover:bg-primary-50"
                >
                  بازگرداندن
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="flex justify-end border-t border-line pt-3">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-line px-4 py-2 text-sm font-medium text-ink transition hover:border-primary hover:text-primary"
        >
          بستن
        </button>
      </div>
    </Modal>
  );
}
