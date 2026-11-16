"use client";

import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { useLive, type LiveStatus } from "@/lib/live";
import * as api from "@/lib/api";
import type { BoardSummary } from "@/lib/board";
import { useBoard, type BoardStore } from "@/lib/useBoard";
import { Avatar } from "./Avatar";
import { Board } from "./Board";
import { AskAssistant, setupRequest } from "@/lib/assistant";
import { ShowHistory } from "@/lib/workspace";
import { HistoryDialog } from "./HistoryDialog";
import { ArchiveDialog } from "./ArchiveDialog";
import { ChatSidebar, type ChatHandle } from "./ChatSidebar";
import { input } from "./LoginForm";
import { Modal } from "./Modal";

const SAVED_BOARD = "pm:board";
const purpleButton =
  "rounded-lg bg-secondary px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50";

// Remembering the open board is a convenience; storage may be unavailable (e.g. private mode).
function readSaved() {
  try {
    return localStorage.getItem(SAVED_BOARD);
  } catch {
    return null;
  }
}
/** Makes `id` the board that opens next (used by the dashboard). */
export function rememberBoard(id: string) {
  try {
    localStorage.setItem(SAVED_BOARD, id);
  } catch {}
}

function NewBoardDialog({
  onCreate,
  onClose,
}: {
  onCreate: (title: string, description: string) => Promise<void>;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [pending, setPending] = useState(false);
  return (
    <Modal title={t("boards.new")} onClose={onClose}>
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setPending(true);
          await onCreate(title.trim(), description.trim()).finally(() => setPending(false));
        }}
      >
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-gray-text">{t("boards.name")}</span>
          <input autoFocus maxLength={100} value={title} onChange={(e) => setTitle(e.target.value)} className={input} />
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-gray-text">{t("boards.description")}</span>
          <textarea
            dir="auto"
            rows={3}
            maxLength={2000}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t("boards.descriptionPlaceholder")}
            aria-describedby="board-description-hint"
            className={`${input} resize-y`}
          />
        </label>
        <p id="board-description-hint" className="-mt-1.5 text-xs text-gray-text">
          {t("boards.descriptionHint")}
        </p>
        <div className="flex gap-2">
          <button type="submit" disabled={pending || !title.trim()} className={`${purpleButton} flex-1`}>
            {t("boards.create")}
          </button>
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-gray-text hover:bg-mist">
            {t("common.cancel")}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function BoardSettingsDialog({
  store,
  username,
  onLeft,
  onRenamed,
  onClose,
}: {
  store: BoardStore;
  username: string;
  onLeft: () => void;
  onRenamed: () => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const board = store.board!;
  const owner = board.role === "owner";
  const [title, setTitle] = useState(board.title);
  const [newMember, setNewMember] = useState("");
  const [error, setError] = useState("");

  const run = async (call: () => Promise<unknown>, messages: Record<number, string> = {}) => {
    setError("");
    try {
      await call();
      return true;
    } catch (e) {
      setError((e instanceof api.ApiError && messages[e.status]) || t("common.network"));
      return false;
    }
  };

  const rename = async () => {
    if (!title.trim() || title.trim() === board.title) return;
    if (await run(() => api.renameBoard(board.id, title.trim()))) {
      store.apply({ ...store.current(), title: title.trim() });
      onRenamed();
    }
  };

  const addMember = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newMember.trim();
    const ok = await run(() => api.addMember(board.id, name), {
      404: t("boards.noUser", { name }),
      409: t("boards.alreadyMember", { name }),
    });
    if (ok) {
      setNewMember("");
      await store.reload();
    }
  };

  const removeMember = async (name: string) => {
    if (!window.confirm(t("boards.confirmRemove", { name }))) return;
    if (await run(() => api.removeMember(board.id, name))) await store.reload();
  };

  const leaveOrDelete = async () => {
    const question = owner
      ? t("boards.confirmDelete", { title: board.title })
      : t("boards.confirmLeave", { title: board.title });
    if (!window.confirm(question)) return;
    if (await run(() => (owner ? api.deleteBoard(board.id) : api.removeMember(board.id, username)))) onLeft();
  };

  return (
    <Modal title={t("boards.settings")} onClose={onClose}>
      {owner ? (
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-gray-text">{t("boards.name")}</span>
          <input
            maxLength={100}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={rename}
            onKeyDown={(e) => e.key === "Enter" && rename()}
            className={input}
          />
        </label>
      ) : (
        <p className="text-sm text-gray-text">
          {t("boards.ownerBefore")}
          <span dir="ltr">{board.members.find((m) => m.role === "owner")?.username}</span>
          {t("boards.ownerAfter")}
        </p>
      )}

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-ink">{t("boards.members")}</h3>
        <ul className="space-y-1.5">
          {board.members.map((m) => (
            <li key={m.username} className="flex items-center gap-2 rounded-lg bg-mist px-3 py-2 text-sm">
              <Avatar avatar={m.avatar} username={m.username} />
              <span dir="ltr" className="text-ink">
                {m.username}
              </span>
              <span className="text-xs text-gray-text">{m.role === "owner" ? t("common.owner") : t("common.member")}</span>
              {owner && m.role !== "owner" && (
                <button
                  type="button"
                  aria-label={t("boards.removeMember", { name: m.username })}
                  onClick={() => removeMember(m.username)}
                  className="ms-auto rounded-md px-2 py-0.5 text-xs text-gray-text hover:bg-danger-50 hover:text-danger"
                >
                  {t("common.delete")}
                </button>
              )}
            </li>
          ))}
        </ul>
        {owner && (
          <form onSubmit={addMember} className="flex gap-2">
            <input
              aria-label={t("boards.newMember")}
              placeholder={t("common.username")}
              dir="ltr"
              maxLength={32}
              value={newMember}
              onChange={(e) => setNewMember(e.target.value)}
              className={`${input} py-2`}
            />
            <button type="submit" disabled={!newMember.trim()} className={purpleButton}>
              {t("common.add")}
            </button>
          </form>
        )}
      </section>

      {error && (
        <p role="alert" className="rounded-lg bg-danger-50 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <div className="flex items-center justify-between gap-2 border-t border-line/70 pt-3">
        <button type="button" onClick={leaveOrDelete} className="rounded-lg px-3 py-2 text-sm font-medium text-danger hover:bg-danger-50">
          {owner ? t("boards.delete") : t("boards.leave")}
        </button>
        <button
          type="button"
          autoFocus
          onClick={onClose}
          className="rounded-lg border border-line px-4 py-2 text-sm font-medium text-ink transition hover:border-primary hover:text-primary"
        >
          {t("common.close")}
        </button>
      </div>
    </Modal>
  );
}

/** One board with its bar, the AI chat and the settings dialog. Keyed by board id by the parent. */
function Workspace({
  boardId,
  boards,
  username,
  chatOpen,
  onOpenChat,
  onSelect,
  onNew,
  onBoardsChanged,
  firstRequest,
}: {
  firstRequest?: string;
  boardId: string;
  boards: BoardSummary[];
  username: string;
  chatOpen: boolean;
  onOpenChat: () => void;
  onSelect: (id: string) => void;
  onNew: () => void;
  onBoardsChanged: (removed: boolean) => void;
}) {
  const { t, num } = useI18n();
  const store = useBoard(boardId);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // The history dialog: the whole board, or one card.
  const [history, setHistory] = useState<{ card?: { id: string; title: string } } | null>(null);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const members = store.board?.members.length ?? 0;
  const chat = useRef<ChatHandle>(null);
  const ask = (message: string) => {
    onOpenChat();
    chat.current?.ask(message);
  };
  // A board made from a description: ask the assistant to set it up, once.
  const asked = useRef(false);
  useEffect(() => {
    if (firstRequest && !asked.current) {
      asked.current = true;
      ask(firstRequest);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstRequest]);
  // Changes by others arrive live: reload the board (and the board list, whose titles may have changed).
  const [updates, setUpdates] = useState(0);
  const live = useLive(boardId, () => {
    store.remoteChanged();
    onBoardsChanged(false);
    setUpdates((n) => n + 1);
  });
  // Deleted, or the user was removed from it: show another board.
  useEffect(() => {
    if (store.gone) onBoardsChanged(true);
  }, [store.gone, onBoardsChanged]);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2 px-6 sm:px-10">
        <select
          aria-label={t("boards.select")}
          value={boardId}
          onChange={(e) => onSelect(e.target.value)}
          className="max-w-64 rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-semibold text-ink outline-none focus:border-primary focus:ring-4 focus:ring-primary/10"
        >
          {boards.map((b) => (
            <option key={b.id} value={b.id}>
              {b.role === "owner" ? b.title : t("boards.fromOwner", { title: b.title, owner: b.owner })}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          disabled={!store.board}
          className="flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-medium text-ink transition hover:border-primary hover:text-primary"
        >
          <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
            <circle cx="7.5" cy="7" r="2.5" />
            <path d="M2.5 16c.5-2.8 2.5-4.5 5-4.5s4.5 1.7 5 4.5M13 4.8a2.5 2.5 0 010 4.4M15 11.8c1.4.6 2.3 2 2.5 4.2" strokeLinecap="round" />
          </svg>
          {t("boards.membersAndSettings")}
          {members > 1 && (
            <span className="rounded-full bg-primary/10 px-1.5 text-xs text-primary-700">{num(members)}</span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setHistory({})}
          disabled={!store.board}
          className="flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-medium text-ink transition hover:border-primary hover:text-primary"
        >
          <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
            <path d="M3.5 10a6.5 6.5 0 106.5-6.5A6.5 6.5 0 004.8 6M3.5 3.5V6.5h3" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M10 6.5V10l2.5 1.5" strokeLinecap="round" />
          </svg>
          {t("boards.history")}
        </button>
        <button
          type="button"
          onClick={() => setArchiveOpen(true)}
          disabled={!store.board}
          className="flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-medium text-ink transition hover:border-primary hover:text-primary"
        >
          <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
            <rect x="2.5" y="3.5" width="15" height="4" rx="1" />
            <path d="M4 7.5V16h12V7.5M8 11h4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {t("archive.button")}
        </button>
        <button
          type="button"
          onClick={onNew}
          className="rounded-lg px-3 py-1.5 text-sm font-medium text-primary-700 transition hover:bg-primary-50"
        >
          {t("boards.newButton")}
        </button>
        <div className="ms-auto flex items-center gap-3">
          <p className="hidden text-xs text-gray-text xl:block">{t("boards.hint")}</p>
          <LiveBadge status={live} />
        </div>
        {/* Tells screen readers when the board changed because of someone else. */}
        <p aria-live="polite" className="sr-only">
          {updates > 0 ? t("boards.updated", { n: updates }) : ""}
        </p>
      </div>

      <div className="flex flex-1 flex-col gap-6 pb-8 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1">
          <AskAssistant value={ask}>
            <ShowHistory value={(card) => setHistory({ card })}>
              <Board store={store} />
            </ShowHistory>
          </AskAssistant>
        </div>
        {/* Hidden rather than unmounted, so the conversation survives closing the panel. */}
        <div hidden={!chatOpen} className="px-6 sm:px-10 lg:ps-0 lg:pe-6">
          <ChatSidebar ref={chat} boardId={boardId} board={store.board} onBoard={store.apply} />
        </div>
      </div>

      {archiveOpen && <ArchiveDialog boardId={boardId} onBoard={store.apply} onClose={() => setArchiveOpen(false)} />}
      {history && (
        <HistoryDialog
          boardId={boardId}
          card={history.card}
          onRestored={store.apply}
          onClose={() => setHistory(null)}
        />
      )}
      {settingsOpen && store.board && (
        <BoardSettingsDialog
          store={store}
          username={username}
          onRenamed={() => onBoardsChanged(false)}
          onLeft={() => {
            setSettingsOpen(false);
            onBoardsChanged(true);
          }}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </>
  );
}

/** Whether changes by others show up live; a dot and a word, with the details in the tooltip. */
function LiveBadge({ status }: { status: LiveStatus }) {
  const { t } = useI18n();
  const text = t(`live.${status}`);
  const title = t(`live.${status}Title`);
  return (
    <span
      title={title}
      data-testid="live-status"
      data-status={status}
      className="flex items-center gap-1.5 rounded-full bg-surface px-2.5 py-1 text-xs text-gray-text ring-1 ring-line"
    >
      <span
        aria-hidden
        className={`h-2 w-2 rounded-full ${status === "live" ? "bg-primary" : status === "offline" ? "bg-danger" : "bg-accent animate-pulse"}`}
      />
      {text}
    </span>
  );
}

export function BoardsArea({
  username,
  chatOpen,
  onOpenChat,
}: {
  username: string;
  chatOpen: boolean;
  onOpenChat: () => void;
}) {
  const { t } = useI18n();
  const [boards, setBoards] = useState<BoardSummary[] | null>(null);
  const [current, setCurrent] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [firstRequest, setFirstRequest] = useState<{ board: string; text: string } | null>(null);
  const i18n = useI18n();

  /** Shows `list` and opens `prefer`, the board saved in this browser, or the first one. */
  const show = (list: BoardSummary[], prefer?: string | null) => {
    const wanted = prefer ?? readSaved();
    const next = list.find((b) => b.id === wanted)?.id ?? list[0]?.id ?? null;
    setBoards(list);
    setCurrent(next);
    if (next) rememberBoard(next);
  };
  const load = (prefer?: string | null) => api.listBoards().then((list) => show(list, prefer));

  useEffect(() => {
    api.listBoards().then(show, () => setBoards([]));
  }, []);

  const create = async (title: string, description: string) => {
    const created = await api.createBoard(title);
    if (description) setFirstRequest({ board: created.id, text: setupRequest(description, i18n) });
    setNewOpen(false);
    await load(created.id);
  };

  if (!boards) return <p className="px-6 text-sm text-gray-text sm:px-10">{t("common.loading")}</p>;

  return (
    <>
      {current ? (
        <Workspace
          key={current}
          boardId={current}
          boards={boards}
          username={username}
          chatOpen={chatOpen}
          onOpenChat={onOpenChat}
          onSelect={(id) => {
            setCurrent(id);
            rememberBoard(id);
          }}
          onNew={() => setNewOpen(true)}
          firstRequest={firstRequest?.board === current ? firstRequest.text : undefined}
          onBoardsChanged={(removed) => load(removed ? null : current)}
        />
      ) : (
        <div className="mx-6 rounded-2xl border border-dashed border-ink/20 px-6 py-12 text-center sm:mx-10">
          <p className="text-sm text-gray-text">{t("boards.none")}</p>
          <button type="button" onClick={() => setNewOpen(true)} className={`${purpleButton} mt-4`}>
            {t("boards.createFirst")}
          </button>
        </div>
      )}
      {newOpen && <NewBoardDialog onCreate={create} onClose={() => setNewOpen(false)} />}
    </>
  );
}
