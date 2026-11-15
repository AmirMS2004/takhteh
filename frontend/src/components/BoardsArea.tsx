"use client";

import { useEffect, useState } from "react";
import * as api from "@/lib/api";
import type { BoardSummary } from "@/lib/board";
import { useBoard, type BoardStore } from "@/lib/useBoard";
import { Avatar } from "./Avatar";
import { Board } from "./Board";
import { ChatSidebar } from "./ChatSidebar";
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

function NewBoardDialog({ onCreate, onClose }: { onCreate: (title: string) => Promise<void>; onClose: () => void }) {
  const [title, setTitle] = useState("");
  const [pending, setPending] = useState(false);
  return (
    <Modal title="برد تازه" onClose={onClose}>
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setPending(true);
          await onCreate(title.trim()).finally(() => setPending(false));
        }}
      >
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-gray-text">نام برد</span>
          <input autoFocus maxLength={100} value={title} onChange={(e) => setTitle(e.target.value)} className={input} />
        </label>
        <div className="flex gap-2">
          <button type="submit" disabled={pending || !title.trim()} className={`${purpleButton} flex-1`}>
            ساخت برد
          </button>
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-gray-text hover:bg-slate-100">
            انصراف
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
      setError((e instanceof api.ApiError && messages[e.status]) || "ارتباط با سرور برقرار نشد. دوباره تلاش کنید.");
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
      404: `کاربری با نام «${name}» نیست.`,
      409: `«${name}» از قبل عضو این برد است.`,
    });
    if (ok) {
      setNewMember("");
      await store.reload();
    }
  };

  const removeMember = async (name: string) => {
    if (!window.confirm(`«${name}» از این برد حذف شود؟ کارت‌هایی که مسئولش است بدون مسئول می‌شوند.`)) return;
    if (await run(() => api.removeMember(board.id, name))) await store.reload();
  };

  const leaveOrDelete = async () => {
    const question = owner
      ? `برد «${board.title}» با همه کارت‌هایش برای همه اعضا حذف شود؟ این کار برگشت‌پذیر نیست.`
      : `از برد «${board.title}» خارج می‌شوید؟`;
    if (!window.confirm(question)) return;
    if (await run(() => (owner ? api.deleteBoard(board.id) : api.removeMember(board.id, username)))) onLeft();
  };

  return (
    <Modal title="تنظیمات برد" onClose={onClose}>
      {owner ? (
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-gray-text">نام برد</span>
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
          مالک این برد <span dir="ltr">{board.members.find((m) => m.role === "owner")?.username}</span> است.
        </p>
      )}

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-navy">اعضا</h3>
        <ul className="space-y-1.5">
          {board.members.map((m) => (
            <li key={m.username} className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm">
              <Avatar avatar={m.avatar} username={m.username} />
              <span dir="ltr" className="text-navy">
                {m.username}
              </span>
              <span className="text-xs text-gray-text">{m.role === "owner" ? "مالک" : "عضو"}</span>
              {owner && m.role !== "owner" && (
                <button
                  type="button"
                  aria-label={`حذف ${m.username} از برد`}
                  onClick={() => removeMember(m.username)}
                  className="mr-auto rounded-md px-2 py-0.5 text-xs text-gray-text hover:bg-red-50 hover:text-red-600"
                >
                  حذف
                </button>
              )}
            </li>
          ))}
        </ul>
        {owner && (
          <form onSubmit={addMember} className="flex gap-2">
            <input
              aria-label="نام کاربری عضو تازه"
              placeholder="نام کاربری"
              dir="ltr"
              maxLength={32}
              value={newMember}
              onChange={(e) => setNewMember(e.target.value)}
              className={`${input} py-2`}
            />
            <button type="submit" disabled={!newMember.trim()} className={purpleButton}>
              افزودن
            </button>
          </form>
        )}
      </section>

      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
        <button type="button" onClick={leaveOrDelete} className="rounded-lg px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50">
          {owner ? "حذف برد" : "خروج از برد"}
        </button>
        <button type="button" autoFocus onClick={onClose} className={purpleButton}>
          بستن
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
  onSelect,
  onNew,
  onBoardsChanged,
}: {
  boardId: string;
  boards: BoardSummary[];
  username: string;
  chatOpen: boolean;
  onSelect: (id: string) => void;
  onNew: () => void;
  onBoardsChanged: (removed: boolean) => void;
}) {
  const store = useBoard(boardId);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const members = store.board?.members.length ?? 0;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2 px-6 sm:px-10">
        <select
          aria-label="انتخاب برد"
          value={boardId}
          onChange={(e) => onSelect(e.target.value)}
          className="max-w-64 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-navy outline-none focus:border-primary focus:ring-4 focus:ring-primary/10"
        >
          {boards.map((b) => (
            <option key={b.id} value={b.id}>
              {b.role === "owner" ? b.title : `${b.title} (از ${b.owner})`}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          disabled={!store.board}
          className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-navy transition hover:border-primary hover:text-primary"
        >
          <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
            <circle cx="7.5" cy="7" r="2.5" />
            <path d="M2.5 16c.5-2.8 2.5-4.5 5-4.5s4.5 1.7 5 4.5M13 4.8a2.5 2.5 0 010 4.4M15 11.8c1.4.6 2.3 2 2.5 4.2" strokeLinecap="round" />
          </svg>
          اعضا و تنظیمات
          {members > 1 && (
            <span className="rounded-full bg-primary/10 px-1.5 text-xs text-primary">{members.toLocaleString("fa-IR")}</span>
          )}
        </button>
        <button
          type="button"
          onClick={onNew}
          className="rounded-lg px-3 py-1.5 text-sm font-medium text-primary transition hover:bg-sky-50"
        >
          + برد تازه
        </button>
      </div>

      <div className="flex flex-1 flex-col gap-6 pb-8 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1">
          <Board store={store} />
        </div>
        {/* Hidden rather than unmounted, so the conversation survives closing the panel. */}
        <div hidden={!chatOpen} className="px-6 sm:px-10 lg:pr-0 lg:pl-6">
          <ChatSidebar boardId={boardId} board={store.board} onBoard={store.apply} />
        </div>
      </div>

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

export function BoardsArea({ username, chatOpen }: { username: string; chatOpen: boolean }) {
  const [boards, setBoards] = useState<BoardSummary[] | null>(null);
  const [current, setCurrent] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);

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

  const create = async (title: string) => {
    const created = await api.createBoard(title);
    setNewOpen(false);
    await load(created.id);
  };

  if (!boards) return <p className="px-6 text-sm text-gray-text sm:px-10">در حال بارگذاری…</p>;

  return (
    <>
      {current ? (
        <Workspace
          key={current}
          boardId={current}
          boards={boards}
          username={username}
          chatOpen={chatOpen}
          onSelect={(id) => {
            setCurrent(id);
            rememberBoard(id);
          }}
          onNew={() => setNewOpen(true)}
          onBoardsChanged={(removed) => load(removed ? null : current)}
        />
      ) : (
        <div className="mx-6 rounded-2xl border border-dashed border-slate-300 px-6 py-12 text-center sm:mx-10">
          <p className="text-sm text-gray-text">هنوز بردی ندارید.</p>
          <button type="button" onClick={() => setNewOpen(true)} className={`${purpleButton} mt-4`}>
            ساخت اولین برد
          </button>
        </div>
      )}
      {newOpen && <NewBoardDialog onCreate={create} onClose={() => setNewOpen(false)} />}
    </>
  );
}
