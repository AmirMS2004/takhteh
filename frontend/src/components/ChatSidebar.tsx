"use client";

import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import * as api from "@/lib/api";
import { ApiError, chatStream, clearHistory, getHistory, type ChatMessage } from "@/lib/api";
import { WEEKLY_REPORT } from "@/lib/assistant";
import type { BoardState } from "@/lib/board";
import type { Proposal } from "@/lib/proposal";

/** A message on screen; `busy` and `problem` belong to its proposal while the user acts on it. */
type Message = ChatMessage & { error?: boolean; note?: string; busy?: boolean; problem?: string };

/** Starting prompts that fit the open board: its own columns and, when it has any, its own cards. */
function suggestions(board: BoardState | null): string[] {
  if (!board || board.columns.length === 0) return [];
  const { columns, cards } = board;
  const target = columns[Math.min(1, columns.length - 1)];
  // A card that is not in the last column, to move it one column on.
  const from = columns.findIndex((c, i) => i < columns.length - 1 && c.cardIds.length > 0);
  if (from === -1 && Object.keys(cards).length === 0)
    return [
      "برای شروع این پروژه چند کارت پیشنهاد بده.",
      `یک کارت برای نوشتن مستندات در ستون «${target.title}» بساز.`,
    ];
  return [
    `یک کارت برای نوشتن مستندات در ستون «${target.title}» بساز.`,
    ...(from === -1 ? [] : [`کارت «${cards[columns[from].cardIds[0]].title}» را به «${columns[from + 1].title}» ببر.`]),
    "کدام کارها عقب افتاده‌اند؟",
  ];
}

/** Lets the page send a message from elsewhere (e.g. "split this card"). */
export type ChatHandle = { ask: (message: string) => void };

function failureText(error: unknown) {
  if (error instanceof ApiError && error.status === 429)
    return "سهمیه روزانه مدل رایگان هوش مصنوعی تمام شده است. بعداً دوباره تلاش کنید.";
  if (error instanceof ApiError && error.status === 503) return "دستیار هوش مصنوعی فعلاً در دسترس نیست. کمی بعد دوباره تلاش کنید.";
  if (error instanceof ApiError && error.status === 502) return "پاسخ دستیار نامعتبر بود. دوباره تلاش کنید.";
  return "ارتباط با دستیار برقرار نشد. دوباره تلاش کنید.";
}

export function ChatSidebar({
  boardId,
  board,
  onBoard,
  ref,
}: {
  boardId: string;
  board: BoardState | null;
  onBoard: (board: BoardState) => void;
  ref?: Ref<ChatHandle>;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  // The reply as it streams in; shown in place of the waiting indicator.
  const [streaming, setStreaming] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  // Only the latest applied proposal can be undone.
  const lastApplied = messages.findLastIndex((m) => m.proposal?.status === "applied");

  const update = (i: number, change: Partial<Message>) =>
    setMessages((all) => all.map((m, j) => (j === i ? { ...m, ...change } : m)));

  /** Runs an action on the proposal of message `i`; on success its status becomes `status`. */
  const act = async (
    i: number,
    status: Proposal["status"],
    call: (id: string) => Promise<BoardState | void>,
    conflict: string,
  ) => {
    update(i, { busy: true, problem: undefined });
    try {
      const board = await call(messages[i].id!);
      if (board) onBoard(board);
      update(i, { busy: false, proposal: { ...messages[i].proposal!, status } });
    } catch (e) {
      update(i, {
        busy: false,
        problem: e instanceof ApiError && e.status === 409 ? conflict : "ارتباط با سرور برقرار نشد. دوباره تلاش کنید.",
      });
    }
  };
  const applyProposal = (i: number) =>
    act(i, "applied", api.applyProposal, "تخته از زمان این پیشنهاد تغییر کرده و نمی‌توان آن را اعمال کرد. دوباره درخواست کنید.");
  const rejectProposal = (i: number) => act(i, "rejected", api.rejectProposal, "این پیشنهاد دیگر در انتظار نیست.");
  const undoProposal = (i: number) =>
    act(i, "undone", api.undoProposal, "تخته از آن زمان تغییر کرده و نمی‌توان این تغییرات را برگرداند.");

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
      setMessages((m) => [
        ...m,
        {
          id: res.message_id,
          role: "assistant",
          content: res.reply,
          note: res.error ? "این تغییرات با تخته جور نبود و پیشنهاد نشد؛ دوباره و دقیق‌تر درخواست کنید." : undefined,
          proposal: res.proposal,
        },
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

  useImperativeHandle(ref, () => ({ ask: send }));

  return (
    <aside
      aria-label="دستیار هوش مصنوعی"
      className="flex h-[32rem] w-full flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-[0_18px_40px_-28px_rgba(3,33,71,0.35)] lg:sticky lg:top-20 lg:h-[calc(100vh-10rem)] lg:w-80 lg:shrink-0"
    >
      <header className="border-b border-line bg-lane px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="h-5 w-1 rounded-full bg-accent" />
          <h2 className="font-bold text-ink">دستیار هوش مصنوعی</h2>
          {messages.length > 0 && (
            <button
              type="button"
              disabled={pending}
              onClick={async () => {
                if (!window.confirm("گفت‌وگوی این تخته پاک شود و از نو شروع کنید؟")) return;
                await clearHistory(boardId);
                setMessages([]);
              }}
              className="mr-auto rounded-md px-2 py-1 text-xs font-medium text-primary transition hover:bg-primary-50 disabled:opacity-50"
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
            {suggestions(board).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => send(s)}
                className="block w-full rounded-xl border border-line px-3 py-2 text-right text-sm text-primary transition hover:border-primary hover:bg-primary-50"
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
                    ? "rounded-bl-md bg-danger-50 text-danger"
                    : "rounded-bl-md bg-mist text-ink"
              }`}
            >
              {m.content}
              {m.note && <p className="mt-1.5 text-xs text-danger">{m.note}</p>}
              {m.proposal && (
                <ProposalBox
                  proposal={m.proposal}
                  busy={!!m.busy}
                  problem={m.problem}
                  canUndo={i === lastApplied}
                  onApply={() => applyProposal(i)}
                  onReject={() => rejectProposal(i)}
                  onUndo={() => undoProposal(i)}
                />
              )}
            </div>
          </div>
        ))}
        {pending && (
          <div className="flex justify-end">
            {streaming ? (
              <div
                aria-live="polite"
                data-role="assistant"
                className="max-w-[85%] rounded-2xl rounded-bl-md bg-mist px-3.5 py-2.5 text-sm leading-6 whitespace-pre-wrap text-ink"
              >
                {streaming}
                <span className="mr-0.5 inline-block h-4 w-1.5 animate-pulse rounded-sm bg-primary/60 align-middle" aria-hidden />
              </div>
            ) : (
              <div role="status" className="rounded-2xl rounded-bl-md bg-mist px-3.5 py-2.5 text-sm text-gray-text">
                در حال پاسخ…
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex gap-2 border-t border-line/70 px-3 pt-2.5">
        <button
          type="button"
          disabled={pending}
          onClick={() => send(WEEKLY_REPORT)}
          className="rounded-full border border-accent/70 px-3 py-1 text-xs font-medium text-ink transition hover:bg-accent-50 disabled:opacity-50"
        >
          گزارش هفتگی
        </button>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="flex items-end gap-2 p-3 pt-2"
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
          className="flex-1 resize-none rounded-xl border border-line px-3 py-2 text-sm text-ink outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10 disabled:bg-mist"
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

const STATUS_TEXT = { applied: "اعمال شد.", rejected: "رد شد.", undone: "برگردانده شد." } as const;

function ProposalBox({
  proposal,
  busy,
  problem,
  canUndo,
  onApply,
  onReject,
  onUndo,
}: {
  proposal: Proposal;
  busy: boolean;
  problem?: string;
  canUndo: boolean;
  onApply: () => void;
  onReject: () => void;
  onUndo: () => void;
}) {
  const { status, changes } = proposal;
  return (
    <section aria-label="تغییرات پیشنهادی" className="mt-2.5 space-y-2 rounded-xl border border-accent/70 bg-surface p-2.5">
      <p className="text-xs font-semibold text-ink">تغییرات پیشنهادی</p>
      <ul className="list-disc space-y-1 pr-4 text-xs leading-5 text-ink">
        {changes.map((c, i) => (
          <li key={i}>{c}</li>
        ))}
      </ul>
      {problem && (
        <p role="alert" className="text-xs text-danger">
          {problem}
        </p>
      )}
      {status === "pending" ? (
        <div className="flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onApply}
            className="rounded-lg bg-secondary px-3 py-1.5 text-xs font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
          >
            اعمال تغییرات
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onReject}
            className="rounded-lg px-3 py-1.5 text-xs text-gray-text transition hover:bg-mist disabled:opacity-50"
          >
            رد کردن
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2 text-xs">
          <span role="status" className={status === "rejected" ? "text-gray-text" : "font-medium text-primary-700"}>
            {busy ? "در حال برگرداندن…" : STATUS_TEXT[status]}
          </span>
          {status === "applied" && canUndo && !busy && (
            <button
              type="button"
              onClick={onUndo}
              className="rounded-md px-2 py-1 font-medium text-primary transition hover:bg-primary-50"
            >
              برگرداندن
            </button>
          )}
        </div>
      )}
    </section>
  );
}
