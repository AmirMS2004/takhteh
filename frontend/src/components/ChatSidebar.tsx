"use client";

import { useEffect, useRef, useState } from "react";
import { ApiError, chatStream, clearHistory, getHistory, type ChatMessage } from "@/lib/api";
import type { BoardState } from "@/lib/board";

type Message = ChatMessage & { error?: boolean; note?: string };

const SUGGESTIONS = [
  "یک کارت برای نوشتن مستندات API در ستون «برای انجام» بساز.",
  "کارت «پژوهش رقبا» را به «در حال انجام» ببر.",
  "چه کارهایی در حال انجام است؟",
];

function failureText(error: unknown) {
  if (error instanceof ApiError && error.status === 429)
    return "سهمیه روزانه مدل رایگان هوش مصنوعی تمام شده است. بعداً دوباره تلاش کنید.";
  if (error instanceof ApiError && error.status === 503) return "دستیار هوش مصنوعی فعلاً در دسترس نیست. کمی بعد دوباره تلاش کنید.";
  if (error instanceof ApiError && error.status === 502) return "پاسخ دستیار نامعتبر بود. دوباره تلاش کنید.";
  return "ارتباط با دستیار برقرار نشد. دوباره تلاش کنید.";
}

export function ChatSidebar({ boardId, onBoard }: { boardId: string; onBoard: (board: BoardState) => void }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  // The reply as it streams in; shown in place of the waiting indicator.
  const [streaming, setStreaming] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  // The conversation is stored on the server (per user and board); show it when the board opens.
  useEffect(() => {
    // If a message was sent before the history arrived, keep what is on screen.
    getHistory(boardId).then((history) => setMessages((m) => (m.length ? m : history)), () => {});
  }, [boardId]);

  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages, pending, streaming]);

  const send = async (text: string) => {
    const message = text.trim();
    if (!message || pending) return;
    setMessages((m) => [...m, { role: "user", content: message }]);
    setInput("");
    setPending(true);
    try {
      const res = await chatStream(boardId, message, (text) => setStreaming((s) => s + text));
      if (res.applied > 0) onBoard(res.board);
      setMessages((m) => [
        ...m,
        { role: "assistant", content: res.reply, note: res.error ? "تغییرات اعمال نشد؛ دوباره و دقیق‌تر درخواست کنید." : undefined },
      ]);
    } catch (e) {
      // A failed turn is shown as failed; the server did not store it.
      setMessages((m) => [
        ...m.slice(0, -1),
        { ...m[m.length - 1], error: true },
        { role: "assistant", content: failureText(e), error: true },
      ]);
    } finally {
      setPending(false);
      setStreaming("");
    }
  };

  return (
    <aside
      aria-label="دستیار هوش مصنوعی"
      className="flex h-[32rem] w-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_18px_40px_-28px_rgba(3,33,71,0.35)] lg:sticky lg:top-6 lg:h-[calc(100vh-3rem)] lg:w-80 lg:shrink-0"
    >
      <header className="border-b border-slate-100 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="h-5 w-1 rounded-full bg-accent" />
          <h2 className="font-bold text-navy">دستیار هوش مصنوعی</h2>
          {messages.length > 0 && (
            <button
              type="button"
              disabled={pending}
              onClick={async () => {
                if (!window.confirm("گفت‌وگوی این برد پاک شود و از نو شروع کنید؟")) return;
                await clearHistory(boardId);
                setMessages([]);
              }}
              className="mr-auto rounded-md px-2 py-1 text-xs font-medium text-primary transition hover:bg-sky-50 disabled:opacity-50"
            >
              گفت‌وگوی تازه
            </button>
          )}
        </div>
        <p className="mt-1 text-xs text-gray-text">کارت بسازید، ویرایش کنید یا جابه‌جا کنید.</p>
      </header>

      <div ref={listRef} data-testid="chat-messages" className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.length === 0 && (
          <div className="space-y-2">
            <p className="text-sm text-gray-text">برای شروع، یکی از این‌ها را امتحان کنید:</p>
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => send(s)}
                className="block w-full rounded-xl border border-slate-200 px-3 py-2 text-right text-sm text-primary transition hover:border-primary hover:bg-sky-50"
              >
                {s}
              </button>
            ))}
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "flex justify-start" : "flex justify-end"}>
            <div
              data-role={m.role}
              className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm leading-6 ${
                m.role === "user"
                  ? "rounded-br-md bg-primary text-white"
                  : m.error
                    ? "rounded-bl-md bg-red-50 text-red-700"
                    : "rounded-bl-md bg-slate-100 text-navy"
              }`}
            >
              {m.content}
              {m.note && <p className="mt-1.5 text-xs text-red-700">{m.note}</p>}
            </div>
          </div>
        ))}
        {pending && (
          <div className="flex justify-end">
            {streaming ? (
              <div
                aria-live="polite"
                data-role="assistant"
                className="max-w-[85%] rounded-2xl rounded-bl-md bg-slate-100 px-3.5 py-2.5 text-sm leading-6 whitespace-pre-wrap text-navy"
              >
                {streaming}
                <span className="mr-0.5 inline-block h-4 w-1.5 animate-pulse rounded-sm bg-primary/60 align-middle" aria-hidden />
              </div>
            ) : (
              <div role="status" className="rounded-2xl rounded-bl-md bg-slate-100 px-3.5 py-2.5 text-sm text-gray-text">
                در حال پاسخ…
              </div>
            )}
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="flex items-end gap-2 border-t border-slate-100 p-3"
      >
        <textarea
          aria-label="پیام به دستیار"
          placeholder="پیام خود را بنویسید…"
          rows={2}
          maxLength={4000}
          value={input}
          disabled={pending}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
          className="flex-1 resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm text-navy outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10 disabled:bg-slate-50"
        />
        <button
          type="submit"
          disabled={pending || !input.trim()}
          className="rounded-xl bg-secondary px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
        >
          ارسال
        </button>
      </form>
    </aside>
  );
}
