"use client";

import { useEffect, useRef, useState } from "react";
import * as api from "./api";
import type { BoardState } from "./board";

/**
 * Board state loaded from the server. Every change goes through `apply`, which also updates a ref
 * synchronously so drag handlers never read a stale render.
 */
export function useBoard(boardId: string) {
  const [board, setBoard] = useState<BoardState | null>(null);
  const [failed, setFailed] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const ref = useRef<BoardState | null>(null);

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
      () => setFailed(true),
    );

  // Loads once: the page keys the workspace by board id, so another board gets a fresh store.
  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    board,
    failed,
    apply,
    current: () => ref.current!,
    reload,
    notice,
    dismissNotice: () => setNotice(null),
    persist: (call: Promise<unknown>) =>
      call.catch(() => {
        setNotice("ذخیره تغییر ناموفق بود؛ برد از سرور دوباره بارگذاری شد.");
        return reload();
      }),
  };
}

export type BoardStore = ReturnType<typeof useBoard>;
