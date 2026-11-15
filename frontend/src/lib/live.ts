"use client";

import { useEffect, useRef, useState } from "react";

/** Identifies this tab in requests (X-Client-Id), so it can ignore announcements of its own changes. */
export const CLIENT_ID =
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Math.random()).slice(2);

export type LiveStatus = "connecting" | "live" | "offline";

/**
 * Keeps a WebSocket to the board's live channel and calls `onRemoteChange` when someone else (another
 * user or another tab) changes the board. Reconnects with backoff; after a reconnect it calls
 * `onRemoteChange` once, since changes may have been missed while offline.
 */
export function useLive(boardId: string, onRemoteChange: () => void): LiveStatus {
  const [status, setStatus] = useState<LiveStatus>("connecting");
  const handler = useRef(onRemoteChange);
  useEffect(() => {
    handler.current = onRemoteChange;
  });

  useEffect(() => {
    if (typeof WebSocket === "undefined") return;
    let ws: WebSocket | null = null;
    let stopped = false;
    let attempts = 0;
    let retry: ReturnType<typeof setTimeout> | undefined;

    const connect = () => {
      const scheme = location.protocol === "https:" ? "wss" : "ws";
      ws = new WebSocket(`${scheme}://${location.host}/api/boards/${boardId}/live`);
      ws.onopen = () => {
        if (attempts > 0) handler.current();
        attempts = 0;
        setStatus("live");
      };
      ws.onmessage = (e) => {
        try {
          const event = JSON.parse(e.data);
          if (event.type === "board_changed" && event.origin !== CLIENT_ID) handler.current();
        } catch {}
      };
      ws.onclose = () => {
        if (stopped) return;
        setStatus("offline");
        attempts += 1;
        retry = setTimeout(connect, Math.min(1000 * 2 ** attempts, 15000));
      };
    };
    connect();
    return () => {
      stopped = true;
      clearTimeout(retry);
      ws?.close();
    };
  }, [boardId]);

  return status;
}
