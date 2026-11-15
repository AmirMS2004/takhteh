import { vi } from "vitest";
import {
  addCard,
  addColumn,
  addLabel,
  moveColumn,
  removeColumn,
  deleteCard,
  removeLabel,
  updateLabel,
  type LabelColor,
  initialBoard,
  moveCard,
  renameColumn,
  updateCard,
  type BoardState,
  type Card,
} from "@/lib/board";
import type { Proposal } from "@/lib/proposal";

type Override = { status: number; body?: unknown };
type ChatBody = { board_id: string; message: string };
type StoredMessage = { id: string; role: "user" | "assistant"; content: string; proposal: Proposal | null };
/**
 * Scripted assistant: returns the reply and, optionally, proposed `changes` (in words) with the `board` they
 * lead to, which applying the proposal puts in place.
 */
type ChatScript = (
  body: ChatBody,
  board: BoardState,
) => { reply: string; changes?: string[]; board?: BoardState; error?: string; failWith?: number };

/** An empty board like the backend creates: default columns and labels, no cards. */
function emptyBoard(id: string, title: string, owner: string): BoardState {
  return {
    id,
    title,
    role: "owner",
    members: [{ username: owner, role: "owner" }],
    columns: initialBoard.columns.map((c) => ({ ...c, id: `${id}-${c.id}`, cardIds: [] })),
    cards: {},
    labels: initialBoard.labels.map((l) => ({ ...l, id: `${id}-${l.id}` })),
  };
}

/**
 * Stubs global fetch with an in-memory version of the backend. "board-1" is seeded with initialBoard and is
 * also reachable as `state.board`. `overrides` force a response for "METHOD /path" (e.g. errors or 401s).
 */
export function fakeApi({
  loggedIn = true,
  overrides = {} as Record<string, Override>,
  chat = ((body) => ({ reply: `پاسخ به: ${body.message}` })) as ChatScript,
} = {}) {
  const state = {
    boards: { "board-1": structuredClone(initialBoard) as BoardState } as Record<string, BoardState>,
    get board() {
      return this.boards["board-1"];
    },
    set board(b: BoardState) {
      this.boards["board-1"] = b;
    },
    loggedIn,
    nextId: 1,
    users: { user: "password" } as Record<string, string>,
    // name, email and picture per username; missing means empty
    profiles: {} as Record<string, Partial<{ name: string; email: string; avatar: number }>>,
    chats: {} as Record<string, StoredMessage[]>, // the signed-in user's conversation per board
    // Per proposal (by message id): the board it leads to, and the board before it once applied.
    proposals: {} as Record<string, { boardId: string; after: BoardState; before?: BoardState }>,
    username: "user",
  };

  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

  /** The board holding a column, card or label id. */
  const boardOf = (id: string) =>
    Object.values(state.boards).find(
      (b) => b.columns.some((c) => c.id === id) || id in b.cards || b.labels.some((l) => l.id === id),
    )!;
  const put = (b: BoardState) => (state.boards[b.id] = b);
  const summary = (b: BoardState) => ({
    id: b.id,
    title: b.title,
    role: b.role,
    owner: b.members.find((m) => m.role === "owner")!.username,
    members: b.members.length,
    cards: Object.keys(b.cards).length,
    my_cards: Object.values(b.cards).filter((c) => c.assignee === state.username).length,
  });
  const profile = () => ({ username: state.username, name: "", email: "", avatar: 0, ...state.profiles[state.username] });

  /** Stores the turn like the backend (with any valid proposal) and returns the chat result. */
  const finish = (boardId: string, message: string, result: ReturnType<ChatScript>) => {
    const proposal: Proposal | null =
      !result.error && result.board && result.changes?.length ? { changes: result.changes, status: "pending" } : null;
    const id = `msg-${state.nextId++}`;
    if (proposal) state.proposals[id] = { boardId, after: result.board! };
    state.chats[boardId] = [
      ...(state.chats[boardId] ?? []),
      { id: `msg-${state.nextId++}`, role: "user", content: message, proposal: null },
      { id, role: "assistant", content: result.reply, proposal },
    ];
    return { reply: result.reply, message_id: id, proposal, error: result.error ?? null };
  };
  const stored = (id: string) =>
    Object.values(state.chats)
      .flat()
      .find((m) => m.id === id)!;

  const handle = (method: string, path: string, body: Record<string, unknown>): Response => {
    if (path === "/api/auth/me") return state.loggedIn ? json(profile()) : json({}, 401);
    if (path === "/api/auth/profile") {
      if (!state.loggedIn) return json({}, 401);
      const { username, ...rest } = body as Record<string, string>;
      if (username !== undefined && username !== state.username) {
        if (username in state.users) return json({}, 409);
        state.users[username] = state.users[state.username];
        delete state.users[state.username];
        state.profiles[username] = state.profiles[state.username];
        state.username = username;
      }
      state.profiles[state.username] = { ...profile(), ...rest };
      return json(profile());
    }
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

    let m: RegExpMatchArray | null;

    // --- boards and members ---
    if (method === "GET" && path === "/api/boards") return json(Object.values(state.boards).map(summary));
    if (method === "POST" && path === "/api/boards") {
      const b = put(emptyBoard(`board-new-${state.nextId++}`, body.title as string, state.username));
      return json(summary(b), 201);
    }
    if ((m = path.match(/^\/api\/boards\/([^/]+)$/))) {
      const b = state.boards[m[1]];
      if (!b) return json({}, 404);
      if (method === "GET") return json(b);
      if (method === "PATCH") put({ ...b, title: body.title as string });
      if (method === "DELETE") delete state.boards[b.id];
      return json({ ok: true });
    }
    if (method === "POST" && (m = path.match(/^\/api\/boards\/([^/]+)\/members$/))) {
      const b = state.boards[m[1]];
      const name = String(body.username).toLowerCase();
      if (!(name in state.users)) return json({}, 404);
      if (b.members.some((x) => x.username === name)) return json({}, 409);
      put({ ...b, members: [...b.members, { username: name, role: "member" }] });
      return json({ ok: true }, 201);
    }
    if (method === "DELETE" && (m = path.match(/^\/api\/boards\/([^/]+)\/members\/(.+)$/))) {
      const b = state.boards[m[1]];
      const name = decodeURIComponent(m[2]);
      if (name === state.username) delete state.boards[b.id]; // leaving: the board is gone for this user
      else {
        const cards = Object.fromEntries(
          Object.entries(b.cards).map(([k, c]) => [k, c.assignee === name ? { ...c, assignee: null } : c]),
        );
        put({ ...b, cards, members: b.members.filter((x) => x.username !== name) });
      }
      return json({ ok: true });
    }
    if (method === "POST" && (m = path.match(/^\/api\/boards\/([^/]+)\/labels$/))) {
      const label = { id: `label-new-${state.nextId++}`, name: (body.name as string) ?? "", color: body.color as LabelColor };
      put(addLabel(state.boards[m[1]], label));
      return json(label, 201);
    }

    // --- chat ---
    if ((m = path.match(/^\/api\/ai\/history\/(.+)$/))) {
      if (method === "DELETE") delete state.chats[m[1]];
      return json(method === "DELETE" ? { ok: true } : (state.chats[m[1]] ?? []));
    }
    if (method === "POST" && path === "/api/ai/chat/stream") {
      // NDJSON like the backend: the reply in three pieces, then the result (or an error event).
      const b = state.boards[body.board_id as string];
      const result = chat(body as unknown as ChatBody, b);
      const third = Math.ceil(result.reply.length / 3);
      const lines = [0, 1, 2].map((i) => ({ type: "delta", text: result.reply.slice(i * third, (i + 1) * third) }));
      if (result.failWith) {
        lines.push({ type: "error", status: result.failWith } as never);
      } else {
        lines.push({ type: "done", ...finish(b.id, body.message as string, result) } as never);
      }
      return new Response(lines.map((l) => JSON.stringify(l)).join("\n") + "\n", { status: 200 });
    }
    if (method === "POST" && path === "/api/ai/chat") {
      const b = state.boards[body.board_id as string];
      return json(finish(b.id, body.message as string, chat(body as unknown as ChatBody, b)));
    }
    if (method === "POST" && (m = path.match(/^\/api\/ai\/proposals\/(.+)\/(apply|reject|undo)$/))) {
      const [, id, action] = m;
      const message = stored(id);
      const record = state.proposals[id];
      if (!message?.proposal || !record) return json({}, 404);
      const wanted = action === "undo" ? "applied" : "pending";
      if (message.proposal.status !== wanted) return json({ detail: `The proposal is ${message.proposal.status}` }, 409);
      if (action === "reject") {
        message.proposal = { ...message.proposal, status: "rejected" };
        return json({ ok: true });
      }
      if (action === "apply") {
        record.before = state.boards[record.boardId];
        put(record.after);
        message.proposal = { ...message.proposal, status: "applied" };
      } else {
        put(record.before!);
        message.proposal = { ...message.proposal, status: "undone" };
      }
      return json({ board: state.boards[record.boardId] });
    }

    // --- labels, columns, cards (ids are unique across boards) ---
    if (method === "PATCH" && (m = path.match(/^\/api\/labels\/(.+)$/))) {
      const b = put(updateLabel(boardOf(m[1]), m[1], body));
      return json(b.labels.find((l) => l.id === m![1]));
    }
    if (method === "DELETE" && (m = path.match(/^\/api\/labels\/(.+)$/))) {
      put(removeLabel(boardOf(m[1]), m[1]));
      return json({ ok: true });
    }
    if (method === "POST" && (m = path.match(/^\/api\/boards\/([^/]+)\/columns$/))) {
      const column = { id: `col-new-${state.nextId++}`, title: body.title as string, cardIds: [] };
      put(addColumn(state.boards[m[1]], column));
      return json(column, 201);
    }
    if (method === "POST" && (m = path.match(/^\/api\/columns\/(.+)\/move$/))) {
      put(moveColumn(boardOf(m[1]), m[1], body.index as number));
      return json({ ok: true });
    }
    if (method === "DELETE" && (m = path.match(/^\/api\/columns\/(.+)$/))) {
      const b = boardOf(m[1]);
      if (b.columns.length === 1) return json({}, 409);
      put(removeColumn(b, m[1]));
      return json({ ok: true });
    }
    if (method === "PATCH" && (m = path.match(/^\/api\/columns\/(.+)$/))) {
      put(renameColumn(boardOf(m[1]), m[1], body.title as string));
      return json({ ok: true });
    }
    if (method === "POST" && path === "/api/cards") {
      const fields = { ...body };
      delete fields.column_id;
      const card = { id: `new-${state.nextId++}`, details: "", ...fields } as Card;
      put(addCard(boardOf(body.column_id as string), body.column_id as string, card));
      return json(card, 201);
    }
    if (method === "POST" && (m = path.match(/^\/api\/cards\/(.+)\/move$/))) {
      put(moveCard(boardOf(m[1]), m[1], body.column_id as string, body.index as number));
      return json({ ok: true });
    }
    if (method === "PATCH" && (m = path.match(/^\/api\/cards\/(.+)$/))) {
      const b = put(updateCard(boardOf(m[1]), m[1], body));
      return json(b.cards[m[1]]);
    }
    if (method === "DELETE" && (m = path.match(/^\/api\/cards\/(.+)$/))) {
      put(deleteCard(boardOf(m[1]), m[1]));
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
