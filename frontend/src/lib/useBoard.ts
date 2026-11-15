"use client";

import { useEffect, useRef, useState } from "react";
import * as api from "./api";
import type { BoardState } from "./board";

/**
 * Board state loaded from the server. Every change goes through `apply`, which also updates a ref
 * synchronously so drag handlers never read a stale render.
 */
export function useBoard() {
  const [board, setBoard] = useState<BoardState | null>(null);
  const [failed, setFailed] = useState(false);
  const ref = useRef<BoardState | null>(null);

  const apply = (next: BoardState) => {
    ref.current = next;
    setBoard(next);
  };

  // The server is the source of truth: after any failed write, reload what it has.
  const reload = () =>
    api.getBoard().then(
      (b) => {
        apply(b);
        setFailed(false);
      },
      () => setFailed(true),
    );

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    board,
    failed,
    apply,
    current: () => ref.current!,
    persist: (call: Promise<unknown>) => call.catch(reload),
  };
}

export type BoardStore = ReturnType<typeof useBoard>;
