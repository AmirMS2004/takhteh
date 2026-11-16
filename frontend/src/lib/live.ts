"use client";

import { useEffect, useRef, useState } from "react";

/** Identifies this tab in requests (X-Client-Id), so it can ignore announcements of its own changes. */
export const CLIENT_ID =
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Math.random()).slice(2);

export type LiveStatus = "connecting" | "live" | "offline";

/**
 * Keeps a WebSocket to `path` and calls `onMessage` with each event. Reconnects with backoff; after a
 * reconnect it calls `onReconnect`, since events may have been missed while offline.
 */
function useSocket(path: string, onMessage: (event: { type: string; origin?: string }) => void, onReconnect: () => void) {
  const [status, setStatus] = useState<LiveStatus>("connecting");
  const handlers = useRef({ onMessage, onReconnect });
  useEffect(() => {
    handlers.current = { onMessage, onReconnect };
  });

  useEffect(() => {
    if (typeof WebSocket === "undefined") return;
    let ws: WebSocket | null = null;
    let stopped = false;
    let attempts = 0;
    let retry: ReturnType<typeof setTimeout> | undefined;

    const connect = () => {
      const scheme = location.protocol === "https:" ? "wss" : "ws";
      ws = new WebSocket(`${scheme}://${location.host}${path}`);
      ws.onopen = () => {
        if (attempts > 0) handlers.current.onReconnect();
        attempts = 0;
        setStatus("live");
      };
      ws.onmessage = (e) => {
        try {
          handlers.current.onMessage(JSON.parse(e.data));
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
  }, [path]);

  return status;
}

/** Calls `onRemoteChange` when someone else (another user or another tab) changes the board. */
export function useLive(boardId: string, onRemoteChange: () => void): LiveStatus {
  return useSocket(
    `/api/boards/${boardId}/live`,
    (event) => {
      if (event.type === "board_changed" && event.origin !== CLIENT_ID) onRemoteChange();
    },
    onRemoteChange,
  );
}

/** Calls `onNew` when the signed-in user may have new notifications. */
export function useNotificationsLive(onNew: () => void) {
  useSocket("/api/notifications/live", (event) => event.type === "notifications" && onNew(), onNew);
}
