"use client";

import { useEffect, useRef, useState } from "react";
import * as api from "./api";
import type { BoardState } from "./board";
import type { Key } from "./i18n";

/**
 * Board state loaded from the server. Every change goes through `apply`, which also updates a ref
 * synchronously so drag handlers never read a stale render.
 */
export function useBoard(boardId: string) {
  const [board, setBoard] = useState<BoardState | null>(null);
  const [failed, setFailed] = useState(false);
  // A message for the user, as a dictionary key.
  const [notice, setNotice] = useState<Key | null>(null);
  const ref = useRef<BoardState | null>(null);
  // The board was deleted, or the user is no longer on it.
  const [gone, setGone] = useState(false);
  // While a drag is in progress, changes from others wait, so the board does not jump under the pointer.
  const held = useRef(false);
  const waiting = useRef(false);

  const apply = (next: BoardState) => {
    ref.current = next;
    setBoard(next);
  };

  // The server is the source of truth: after any failed write, reload what it has.
  const reload = () =>
    api.getBoard(boardId).then(
      (b) => {
        apply(b);
        setFailed(false);
      },
      (e) => (e instanceof api.ApiError && e.status === 404 ? setGone(true) : setFailed(true)),
    );

  /** Someone else changed the board: reload it now, or when the current drag ends. */
  const remoteChanged = () => {
    if (held.current) waiting.current = true;
    else reload();
  };

  // Loads once: the page keys the workspace by board id, so another board gets a fresh store.
  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    board,
    failed,
    gone,
    remoteChanged,
    hold: (on: boolean) => {
      held.current = on;
      if (!on && waiting.current) {
        waiting.current = false;
        reload();
      }
    },
    apply,
    current: () => ref.current!,
    reload,
    notice,
    dismissNotice: () => setNotice(null),
    persist: (call: Promise<unknown>) =>
      call.catch(() => {
        setNotice("board.saveFailed");
        return reload();
      }),
  };
}

export type BoardStore = ReturnType<typeof useBoard>;
