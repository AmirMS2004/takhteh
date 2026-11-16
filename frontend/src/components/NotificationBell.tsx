"use client";

import { useEffect, useRef, useState } from "react";
import { getNotifications, markNotificationsRead, type AppNotification } from "@/lib/api";
import { CARD_NOTIFICATIONS, describeNotification } from "@/lib/describe";
import { useI18n } from "@/lib/i18n";
import { useNotificationsLive } from "@/lib/live";
import { timeAgo } from "@/lib/time";
import { Avatar } from "./Avatar";

// Due-date notifications depend on the day, not on anyone's action, so look again now and then.
const REFRESH_MS = 5 * 60 * 1000;

/** The bell in the app bar: unread count, and the list of notifications, newest first. */
export function NotificationBell({ onOpenBoard }: { onOpenBoard: (boardId: string) => void }) {
  const i18n = useI18n();
  const { t, num } = i18n;
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  const load = () =>
    getNotifications().then(
      (res) => {
        setItems(res.items);
        setUnread(res.unread);
      },
      () => {},
    );
  useEffect(() => {
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => clearInterval(timer);
  }, []);
  useNotificationsLive(load);

  // Close on a click outside or Escape.
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    // Opening the list reads them; the dots stay until it is closed, so the user sees which were new.
    if (next && unread > 0) {
      setUnread(0);
      markNotificationsRead().catch(() => {});
    }
    if (!next) setItems((all) => all.map((n) => ({ ...n, read: true })));
  };

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-label={unread ? t("notif.buttonUnread", { n: unread }) : t("notif.button")}
        title={t("notif.title")}
        onClick={toggle}
        className="relative rounded-lg p-2 text-white/80 transition hover:bg-white/10 hover:text-white"
      >
        <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
          <path d="M10 3a4.5 4.5 0 00-4.5 4.5c0 4-1.5 5.5-1.5 5.5h12s-1.5-1.5-1.5-5.5A4.5 4.5 0 0010 3zM8.5 16a1.5 1.5 0 003 0" strokeLinejoin="round" />
        </svg>
        {unread > 0 && (
          <span className="absolute -top-0.5 -end-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-accent px-1 text-[10px] font-bold text-navy">
            {num(Math.min(unread, 99))}
          </span>
        )}
      </button>

      {open && (
        <section
          aria-label={t("notif.title")}
          className="absolute end-0 top-full z-40 mt-2 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-line bg-surface text-ink shadow-[0_18px_40px_-16px_rgba(3,33,71,0.45)]"
        >
          <div className="flex items-center gap-2 border-b border-line bg-lane px-4 py-3">
            <span className="h-5 w-1 rounded-full bg-accent" />
            <h2 className="font-bold">{t("notif.title")}</h2>
          </div>
          {items.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-gray-text">{t("notif.empty")}</p>
          ) : (
            <ul className="max-h-96 divide-y divide-line overflow-y-auto">
              {items.map((n) => {
                const opensBoard = n.board && n.kind !== "board_deleted" && n.kind !== "removed_from_board";
                const content = (
                  <>
                    {n.actor ? (
                      <Avatar avatar={n.actor_avatar} username={n.actor} size={28} />
                    ) : (
                      <span aria-hidden className="grid h-7 w-7 shrink-0 place-items-center rounded-[30%] bg-accent-50 text-accent-700">
                        <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                          <rect x="3" y="4.5" width="14" height="12" rx="2" />
                          <path d="M3 8.5h14M7 3v3M13 3v3" strokeLinecap="round" />
                        </svg>
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span dir="auto" className="block text-sm leading-6">
                        {describeNotification(n, i18n)}
                      </span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-gray-text">
                        {CARD_NOTIFICATIONS.includes(n.kind) && n.params.board ? (
                          <span dir="auto">{t("notif.inBoard", { board: String(n.params.board) })}</span>
                        ) : null}
                        <span>{timeAgo(n.created_at, i18n)}</span>
                        {n.via === "assistant" && (
                          <span className="rounded-full bg-accent-50 px-1.5 text-accent-700">{t("history.viaAssistant")}</span>
                        )}
                      </span>
                    </span>
                    {!n.read && <span aria-hidden className="mt-2 h-2 w-2 shrink-0 rounded-full bg-primary" />}
                  </>
                );
                return (
                  <li key={n.id} data-unread={!n.read || undefined}>
                    {opensBoard ? (
                      <button
                        type="button"
                        onClick={() => {
                          setOpen(false);
                          onOpenBoard(n.board!);
                        }}
                        className="flex w-full items-start gap-2.5 px-4 py-3 text-start transition hover:bg-mist"
                      >
                        {content}
                      </button>
                    ) : (
                      <div className="flex items-start gap-2.5 px-4 py-3">{content}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
