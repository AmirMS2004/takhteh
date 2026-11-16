"use client";

import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import * as api from "@/lib/api";
import { ApiError, chatStream, clearHistory, getHistory, type ChatMessage } from "@/lib/api";
import { weeklyReport } from "@/lib/assistant";
import type { BoardState } from "@/lib/board";
import { describeChange } from "@/lib/describe";
import { useI18n, type I18n, type Key } from "@/lib/i18n";
import type { Proposal } from "@/lib/proposal";

/** A message on screen; `busy` and `problem` belong to its proposal while the user acts on it. */
type Message = ChatMessage & { error?: boolean; note?: string; busy?: boolean; problem?: string };

/** Starting prompts that fit the open board: its own columns and, when it has any, its own cards. */
function suggestions(board: BoardState | null, { t }: I18n): string[] {
  if (!board || board.columns.length === 0) return [];
  const { columns, cards } = board;
  const target = columns[Math.min(1, columns.length - 1)];
  // A card that is not in the last column, to move it one column on.
  const from = columns.findIndex((c, i) => i < columns.length - 1 && c.cardIds.length > 0);
  if (from === -1 && Object.keys(cards).length === 0)
    return [t("chat.suggestStart"), t("chat.suggestCreate", { column: target.title })];
  return [
    t("chat.suggestCreate", { column: target.title }),
    ...(from === -1
      ? []
      : [t("chat.suggestMove", { card: cards[columns[from].cardIds[0]].title, column: columns[from + 1].title })]),
    t("chat.suggestOverdue"),
  ];
}

/** Lets the page send a message from elsewhere (e.g. "split this card"). */
export type ChatHandle = { ask: (message: string) => void };

function failureText(error: unknown): Key {
  if (error instanceof ApiError && error.status === 429) return "chat.quota";
  if (error instanceof ApiError && error.status === 503) return "chat.unavailable";
  if (error instanceof ApiError && error.status === 502) return "chat.invalid";
  return "chat.failed";
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
  const i18n = useI18n();
  const { t } = i18n;
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
    conflict: Key,
  ) => {
    update(i, { busy: true, problem: undefined });
    try {
      const board = await call(messages[i].id!);
      if (board) onBoard(board);
      update(i, { busy: false, proposal: { ...messages[i].proposal!, status } });
    } catch (e) {
      update(i, {
        busy: false,
        problem: t(e instanceof ApiError && e.status === 409 ? conflict : "common.network"),
      });
    }
  };
  const applyProposal = (i: number) =>
    act(i, "applied", api.applyProposal, "chat.applyConflict");
  const rejectProposal = (i: number) => act(i, "rejected", api.rejectProposal, "chat.notPending");
  const undoProposal = (i: number) => act(i, "undone", api.undoProposal, "chat.undoConflict");

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
          note: res.error ? t("chat.notProposed") : undefined,
          proposal: res.proposal,
        },
      ]);
    } catch (e) {
      // A failed turn is shown as failed; the server did not store it.
      setMessages((m) => [
        ...m.slice(0, -1),
        { ...m[m.length - 1], error: true },
        { role: "assistant", content: t(failureText(e)), error: true },
      ]);
    } finally {
      setPending(false);
      setStreaming("");
    }
  };

  useImperativeHandle(ref, () => ({ ask: send }));

  return (
    <aside
      aria-label={t("app.assistant")}
      className="flex h-[32rem] w-full flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-[0_18px_40px_-28px_rgba(3,33,71,0.35)] lg:sticky lg:top-20 lg:h-[calc(100vh-10rem)] lg:w-80 lg:shrink-0"
    >
      <header className="border-b border-line bg-lane px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="h-5 w-1 rounded-full bg-accent" />
          <h2 className="font-bold text-ink">{t("app.assistant")}</h2>
          {messages.length > 0 && (
            <button
              type="button"
              disabled={pending}
              onClick={async () => {
                if (!window.confirm(t("chat.confirmNew"))) return;
                await clearHistory(boardId);
                setMessages([]);
              }}
              className="ms-auto rounded-md px-2 py-1 text-xs font-medium text-primary transition hover:bg-primary-50 disabled:opacity-50"
            >
              {t("chat.new")}
            </button>
          )}
        </div>
        <p className="mt-1 text-xs text-gray-text">{t("chat.subtitle")}</p>
      </header>

      <div ref={listRef} data-testid="chat-messages" className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.length === 0 && (
          <div className="space-y-2">
            <p className="text-sm text-gray-text">{t("chat.tryThese")}</p>
            {suggestions(board, i18n).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => send(s)}
                className="block w-full rounded-xl border border-line px-3 py-2 text-start text-sm text-primary transition hover:border-primary hover:bg-primary-50"
              >
                {s}
              </button>
            ))}
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "flex justify-start" : "flex justify-end"}>
            <div
              dir="auto"
              data-role={m.role}
              className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm leading-6 ${
                m.role === "user"
                  ? "rounded-es-md bg-primary text-white"
                  : m.error
                    ? "rounded-ee-md bg-danger-50 text-danger"
                    : "rounded-ee-md bg-mist text-ink"
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
                dir="auto"
                aria-live="polite"
                data-role="assistant"
                className="max-w-[85%] rounded-2xl rounded-ee-md bg-mist px-3.5 py-2.5 text-sm leading-6 whitespace-pre-wrap text-ink"
              >
                {streaming}
                <span className="ms-0.5 inline-block h-4 w-1.5 animate-pulse rounded-sm bg-primary/60 align-middle" aria-hidden />
              </div>
            ) : (
              <div role="status" className="rounded-2xl rounded-ee-md bg-mist px-3.5 py-2.5 text-sm text-gray-text">
                {t("chat.replying")}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex gap-2 border-t border-line/70 px-3 pt-2.5">
        <button
          type="button"
          disabled={pending}
          onClick={() => send(weeklyReport(i18n))}
          className="rounded-full border border-accent/70 px-3 py-1 text-xs font-medium text-ink transition hover:bg-accent-50 disabled:opacity-50"
        >
          {t("chat.weeklyReport")}
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
          dir="auto"
          aria-label={t("chat.message")}
          placeholder={t("chat.placeholder")}
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
          {t("chat.send")}
        </button>
      </form>
    </aside>
  );
}

const STATUS_TEXT = { applied: "chat.applied", rejected: "chat.rejected", undone: "chat.undone" } as const;

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
  const i18n = useI18n();
  const { t } = i18n;
  const { status } = proposal;
  // Worded in the user's language; older proposals only have the Persian sentences.
  const changes = proposal.items ? proposal.items.map((item) => describeChange(item, i18n)) : proposal.changes;
  return (
    <section aria-label={t("chat.proposed")} className="mt-2.5 space-y-2 rounded-xl border border-accent/70 bg-surface p-2.5">
      <p className="text-xs font-semibold text-ink">{t("chat.proposed")}</p>
      <ul className="list-disc space-y-1 ps-4 text-xs leading-5 text-ink">
        {changes.map((c, i) => (
          <li key={i} dir="auto">
            {c}
          </li>
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
            {t("chat.apply")}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onReject}
            className="rounded-lg px-3 py-1.5 text-xs text-gray-text transition hover:bg-mist disabled:opacity-50"
          >
            {t("chat.reject")}
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2 text-xs">
          <span role="status" className={status === "rejected" ? "text-gray-text" : "font-medium text-primary-700"}>
            {busy ? t("chat.undoing") : t(STATUS_TEXT[status])}
          </span>
          {status === "applied" && canUndo && !busy && (
            <button
              type="button"
              onClick={onUndo}
              className="rounded-md px-2 py-1 font-medium text-primary transition hover:bg-primary-50"
            >
              {t("chat.undo")}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
