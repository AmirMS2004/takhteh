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
type ChatBody = { message: string; history: { role: string; content: string }[] };
/** Scripted assistant: returns the reply and, optionally, the board after its changes. */
type ChatScript = (body: ChatBody, board: BoardState) => { reply: string; board?: BoardState; error?: string };

/**
 * Stubs global fetch with an in-memory version of the backend, seeded with initialBoard.
 * `overrides` force a response for "METHOD /path" (e.g. to simulate errors or 401s).
 */
export function fakeApi({
  loggedIn = true,
  overrides = {} as Record<string, Override>,
  chat = ((body) => ({ reply: `پاسخ به: ${body.message}` })) as ChatScript,
} = {}) {
  const state = {
    board: structuredClone(initialBoard) as BoardState,
    loggedIn,
    nextId: 1,
    users: { user: "password" } as Record<string, string>,
    username: "user",
  };

  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

  const handle = (method: string, path: string, body: Record<string, unknown>): Response => {
    if (path === "/api/auth/me") return state.loggedIn ? json({ username: state.username }) : json({}, 401);
    if (path === "/api/auth/login") {
      const name = String(body.username).toLowerCase();
      if (state.users[name] !== body.password) return json({}, 401);
      Object.assign(state, { loggedIn: true, username: name });
      return json({ username: name });
    }
    if (path === "/api/auth/signup") {
      const name = String(body.username).toLowerCase();
      if (name in state.users) return json({}, 409);
      state.users[name] = body.password as string;
      Object.assign(state, { loggedIn: true, username: name });
      return json({ username: name }, 201);
    }
    if (path === "/api/auth/password") {
      if (!state.loggedIn) return json({}, 401);
      if (state.users[state.username] !== body.current_password) return json({}, 403);
      state.users[state.username] = body.new_password as string;
      return json({ ok: true });
    }
    if (path === "/api/auth/logout") {
      state.loggedIn = false;
      return json({ ok: true });
    }
    if (!state.loggedIn) return json({}, 401);

    const b = state.board;
    let m: RegExpMatchArray | null;
    if (method === "GET" && path === "/api/board") return json(b);
    if (method === "POST" && path === "/api/ai/chat") {
      const result = chat(body as unknown as ChatBody, b);
      if (result.board && !result.error) state.board = result.board;
      const applied = result.board && !result.error ? 1 : 0;
      return json({ reply: result.reply, board: state.board, applied, error: result.error ?? null });
    }
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
