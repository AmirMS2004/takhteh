"use client";

import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import { ApiError, applyChanges, chatStream, clearHistory, getHistory, undoChanges, type ChatMessage } from "@/lib/api";
import { WEEKLY_REPORT } from "@/lib/assistant";
import type { BoardState } from "@/lib/board";
import { describe, type Operation, type Undo } from "@/lib/proposal";

/** Changes the assistant proposed with a reply; the user applies or rejects them, and can undo the last. */
type Proposal = {
  operations: Operation[];
  changes: string[]; // the operations in words, as the board was when they were proposed
  status: "pending" | "busy" | "applied" | "rejected" | "undone";
  undo?: Undo;
  problem?: string;
};
type Message = ChatMessage & { error?: boolean; note?: string; proposal?: Proposal };

const SUGGESTIONS = [
  "یک کارت برای نوشتن مستندات API در ستون «برای انجام» بساز.",
  "کارت «پژوهش رقبا» را به «در حال انجام» ببر.",
  "کدام کارها عقب افتاده‌اند؟",
];

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

  const setProposal = (i: number, change: Partial<Proposal>) =>
    setMessages((all) => all.map((m, j) => (j === i ? { ...m, proposal: { ...m.proposal!, ...change } } : m)));

  const applyProposal = async (i: number) => {
    setProposal(i, { status: "busy", problem: undefined });
    try {
      const res = await applyChanges(boardId, messages[i].proposal!.operations);
      onBoard(res.board);
      setProposal(i, { status: "applied", undo: res.undo });
    } catch (e) {
      setProposal(i, {
        status: "pending",
        problem:
          e instanceof ApiError && e.status === 409
            ? "برد از زمان این پیشنهاد تغییر کرده و نمی‌توان آن را اعمال کرد. دوباره درخواست کنید."
            : "ارتباط با سرور برقرار نشد. دوباره تلاش کنید.",
      });
    }
  };

  const undoProposal = async (i: number) => {
    setProposal(i, { status: "busy", problem: undefined });
    try {
      onBoard(await undoChanges(boardId, messages[i].proposal!.undo!));
      setProposal(i, { status: "undone" });
    } catch (e) {
      setProposal(i, {
        status: "applied",
        problem:
          e instanceof ApiError && e.status === 409
            ? "برد از آن زمان تغییر کرده و نمی‌توان این تغییرات را برگرداند."
            : "ارتباط با سرور برقرار نشد. دوباره تلاش کنید.",
      });
    }
  };

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
      const proposal: Proposal | undefined =
        res.operations.length && board
          ? { operations: res.operations, changes: res.operations.map((op) => describe(op, board)), status: "pending" }
          : undefined;
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content: res.reply,
          note: res.error ? "این تغییرات با برد جور نبود و پیشنهاد نشد؛ دوباره و دقیق‌تر درخواست کنید." : undefined,
          proposal,
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
              {m.proposal && (
                <ProposalBox
                  proposal={m.proposal}
                  canUndo={i === lastApplied}
                  onApply={() => applyProposal(i)}
                  onReject={() => setProposal(i, { status: "rejected", problem: undefined })}
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

      <div className="flex gap-2 border-t border-slate-100 px-3 pt-2.5">
        <button
          type="button"
          disabled={pending}
          onClick={() => send(WEEKLY_REPORT)}
          className="rounded-full border border-accent/70 px-3 py-1 text-xs font-medium text-navy transition hover:bg-amber-50 disabled:opacity-50"
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

const STATUS_TEXT = { applied: "اعمال شد.", rejected: "رد شد.", undone: "برگردانده شد." } as const;

function ProposalBox({
  proposal,
  canUndo,
  onApply,
  onReject,
  onUndo,
}: {
  proposal: Proposal;
  canUndo: boolean;
  onApply: () => void;
  onReject: () => void;
  onUndo: () => void;
}) {
  const { status, changes, problem } = proposal;
  return (
    <section aria-label="تغییرات پیشنهادی" className="mt-2.5 space-y-2 rounded-xl border border-accent/70 bg-white p-2.5">
      <p className="text-xs font-semibold text-navy">تغییرات پیشنهادی</p>
      <ul className="list-disc space-y-1 pr-4 text-xs leading-5 text-navy">
        {changes.map((c, i) => (
          <li key={i}>{c}</li>
        ))}
      </ul>
      {problem && (
        <p role="alert" className="text-xs text-red-700">
          {problem}
        </p>
      )}
      {status === "pending" || (status === "busy" && !proposal.undo) ? (
        <div className="flex gap-2">
          <button
            type="button"
            disabled={status === "busy"}
            onClick={onApply}
            className="rounded-lg bg-secondary px-3 py-1.5 text-xs font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
          >
            اعمال تغییرات
          </button>
          <button
            type="button"
            disabled={status === "busy"}
            onClick={onReject}
            className="rounded-lg px-3 py-1.5 text-xs text-gray-text transition hover:bg-slate-100 disabled:opacity-50"
          >
            رد کردن
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2 text-xs">
          <span role="status" className={status === "rejected" ? "text-gray-text" : "font-medium text-green-700"}>
            {status === "busy" ? "در حال برگرداندن…" : STATUS_TEXT[status]}
          </span>
          {status === "applied" && canUndo && (
            <button
              type="button"
              onClick={onUndo}
              className="rounded-md px-2 py-1 font-medium text-primary transition hover:bg-sky-50"
            >
              برگرداندن
            </button>
          )}
        </div>
      )}
    </section>
  );
}
