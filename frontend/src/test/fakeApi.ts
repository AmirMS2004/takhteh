import { vi } from "vitest";
import {
  addCard,
  deleteCard,
  initialBoard,
  moveCard,
  renameColumn,
  updateCard,
  type BoardState,
} from "@/lib/board";

type Override = { status: number; body?: unknown };

/**
 * Stubs global fetch with an in-memory version of the backend, seeded with initialBoard.
 * `overrides` force a response for "METHOD /path" (e.g. to simulate errors or 401s).
 */
export function fakeApi({ loggedIn = true, overrides = {} as Record<string, Override> } = {}) {
  const state = { board: structuredClone(initialBoard) as BoardState, loggedIn, nextId: 1 };

  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

  const handle = (method: string, path: string, body: Record<string, unknown>): Response => {
    if (path === "/api/auth/me") return state.loggedIn ? json({ username: "user" }) : json({}, 401);
    if (path === "/api/auth/login") {
      if (body.username !== "user" || body.password !== "password") return json({}, 401);
      state.loggedIn = true;
      return json({ username: "user" });
    }
    if (path === "/api/auth/logout") {
      state.loggedIn = false;
      return json({ ok: true });
    }
    if (!state.loggedIn) return json({}, 401);

    const b = state.board;
    let m: RegExpMatchArray | null;
    if (method === "GET" && path === "/api/board") return json(b);
    if (method === "PATCH" && (m = path.match(/^\/api\/columns\/(.+)$/))) {
      state.board = renameColumn(b, m[1], body.title as string);
      return json({ ok: true });
    }
    if (method === "POST" && path === "/api/cards") {
      const card = { id: `new-${state.nextId++}`, title: body.title as string, details: body.details as string };
      state.board = addCard(b, body.column_id as string, card);
      return json(card, 201);
    }
    if (method === "POST" && (m = path.match(/^\/api\/cards\/(.+)\/move$/))) {
      state.board = moveCard(b, m[1], body.column_id as string, body.index as number);
      return json({ ok: true });
    }
    if (method === "PATCH" && (m = path.match(/^\/api\/cards\/(.+)$/))) {
      state.board = updateCard(b, m[1], body);
      return json(state.board.cards[m[1]]);
    }
    if (method === "DELETE" && (m = path.match(/^\/api\/cards\/(.+)$/))) {
      state.board = deleteCard(b, m[1]);
      return json({ ok: true });
    }
    throw new Error(`Unexpected request ${method} ${path}`);
  };

  const fetchMock = vi.fn(async (path: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const override = overrides[`${method} ${path}`];
    if (override) return json(override.body ?? {}, override.status);
    return handle(method, path, init?.body ? JSON.parse(init.body as string) : {});
  });
  vi.stubGlobal("fetch", fetchMock);

  /** Requests made so far as "METHOD path" with parsed bodies. */
  const calls = () =>
    fetchMock.mock.calls.map(([path, init]) => ({
      route: `${init?.method ?? "GET"} ${path}`,
      body: init?.body ? JSON.parse(init.body as string) : undefined,
    }));

  return { state, fetchMock, calls };
}
