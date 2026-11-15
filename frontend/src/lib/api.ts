import type { BoardLabel, BoardState, BoardSummary, Card, Column } from "./board";
import { CLIENT_ID } from "./live";
import type { Proposal } from "./proposal";

/** Fired when the session is gone (e.g. expired) so the page can show the login form again. */
export const UNAUTHORIZED_EVENT = "pm:unauthorized";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", "X-Client-Id": CLIENT_ID, ...init?.headers },
  });
  if (res.status === 401 && !path.startsWith("/api/auth/")) window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
  if (!res.ok) throw new ApiError(res.status);
  return res.json();
}

export class ApiError extends Error {
  constructor(public status: number) {
    super(`Request failed with status ${status}`);
  }
}

/** The signed-in user's account. avatar is 0 (first letter of the username) or a preset picture 1..8. */
export type Profile = { username: string; name: string; email: string; avatar: number };

export async function getMe(): Promise<Profile | null> {
  try {
    return await request<Profile>("/api/auth/me");
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) return null;
    throw e;
  }
}

export async function login(username: string, password: string): Promise<string> {
  const data = await request<{ username: string }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
  return data.username;
}

export async function signup(username: string, password: string): Promise<string> {
  const data = await request<{ username: string }>("/api/auth/signup", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
  return data.username;
}

/** Changes only the given fields; 409 means the username is taken. */
export function updateProfile(changes: Partial<Profile>): Promise<Profile> {
  return request<Profile>("/api/auth/profile", { method: "PATCH", body: JSON.stringify(changes) });
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  await request("/api/auth/password", {
    method: "POST",
    body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
  });
}

export async function logout(): Promise<void> {
  await request("/api/auth/logout", { method: "POST" });
}

export function listBoards(): Promise<BoardSummary[]> {
  return request<BoardSummary[]>("/api/boards");
}

export function getBoard(boardId: string): Promise<BoardState> {
  return request<BoardState>(`/api/boards/${boardId}`);
}

export function createBoard(title: string): Promise<BoardSummary> {
  return request<BoardSummary>("/api/boards", { method: "POST", body: JSON.stringify({ title }) });
}

export async function renameBoard(boardId: string, title: string): Promise<void> {
  await request(`/api/boards/${boardId}`, { method: "PATCH", body: JSON.stringify({ title }) });
}

export async function deleteBoard(boardId: string): Promise<void> {
  await request(`/api/boards/${boardId}`, { method: "DELETE" });
}

export async function addMember(boardId: string, username: string): Promise<void> {
  await request(`/api/boards/${boardId}/members`, { method: "POST", body: JSON.stringify({ username }) });
}

export async function removeMember(boardId: string, username: string): Promise<void> {
  await request(`/api/boards/${boardId}/members/${encodeURIComponent(username)}`, { method: "DELETE" });
}

export async function renameColumn(columnId: string, title: string): Promise<void> {
  await request(`/api/columns/${columnId}`, { method: "PATCH", body: JSON.stringify({ title }) });
}

export function createColumn(boardId: string, title: string): Promise<Column> {
  return request<Column>(`/api/boards/${boardId}/columns`, { method: "POST", body: JSON.stringify({ title }) });
}

export async function deleteColumn(columnId: string): Promise<void> {
  await request(`/api/columns/${columnId}`, { method: "DELETE" });
}

export async function moveColumn(columnId: string, index: number): Promise<void> {
  await request(`/api/columns/${columnId}/move`, { method: "POST", body: JSON.stringify({ index }) });
}

/** Creates a card with any of its fields (title is required). */
export function createCard(columnId: string, fields: Partial<Omit<Card, "id">> & { title: string }): Promise<Card> {
  return request<Card>("/api/cards", {
    method: "POST",
    body: JSON.stringify({ column_id: columnId, ...fields }),
  });
}

export async function updateCard(cardId: string, changes: Partial<Omit<Card, "id">>): Promise<void> {
  await request(`/api/cards/${cardId}`, { method: "PATCH", body: JSON.stringify(changes) });
}

export async function moveCard(cardId: string, columnId: string, index: number): Promise<void> {
  await request(`/api/cards/${cardId}/move`, {
    method: "POST",
    body: JSON.stringify({ column_id: columnId, index }),
  });
}

export async function deleteCard(cardId: string): Promise<void> {
  await request(`/api/cards/${cardId}`, { method: "DELETE" });
}

export function createLabel(boardId: string, name: string, color: BoardLabel["color"]): Promise<BoardLabel> {
  return request<BoardLabel>(`/api/boards/${boardId}/labels`, {
    method: "POST",
    body: JSON.stringify({ name, color }),
  });
}

export async function updateLabel(labelId: string, changes: Partial<Omit<BoardLabel, "id">>): Promise<void> {
  await request(`/api/labels/${labelId}`, { method: "PATCH", body: JSON.stringify(changes) });
}

export async function deleteLabel(labelId: string): Promise<void> {
  await request(`/api/labels/${labelId}`, { method: "DELETE" });
}

/** A message of the stored conversation; replies may carry a proposal. */
export type ChatMessage = { id?: string; role: "user" | "assistant"; content: string; proposal?: Proposal | null };
/** The assistant's reply (stored as `message_id`) and what it proposes; nothing is applied until `applyProposal`. */
export type ChatResponse = { reply: string; message_id: string; proposal: Proposal | null; error: string | null };

/**
 * Sends a chat message and reads the NDJSON stream: `onText` gets each piece of the reply as the model
 * writes it; the promise resolves with the final result. HTTP or mid-stream errors reject with ApiError.
 */
export async function chatStream(
  boardId: string,
  message: string,
  onText: (text: string) => void,
): Promise<ChatResponse> {
  const res = await fetch("/api/ai/chat/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ board_id: boardId, message }),
  });
  if (res.status === 401) window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
  if (!res.ok || !res.body) throw new ApiError(res.status);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const lines = buffer.split("\n");
    buffer = lines.pop()!; // a line that is not complete yet
    for (const line of lines) {
      if (!line.trim()) continue;
      const event = JSON.parse(line);
      if (event.type === "delta") onText(event.text);
      else if (event.type === "done") return event as ChatResponse;
      else throw new ApiError(event.status);
    }
    if (done) throw new ApiError(502); // the stream ended without a result
  }
}

/** The signed-in user's stored conversation on the board, oldest first. */
export function getHistory(boardId: string): Promise<ChatMessage[]> {
  return request<ChatMessage[]>(`/api/ai/history/${boardId}`);
}

export async function clearHistory(boardId: string): Promise<void> {
  await request(`/api/ai/history/${boardId}`, { method: "DELETE" });
}

/** Applies the proposal of a reply, all or none (409 if the board changed so that it no longer fits). */
export async function applyProposal(messageId: string): Promise<BoardState> {
  return (await request<{ board: BoardState }>(`/api/ai/proposals/${messageId}/apply`, { method: "POST" })).board;
}

export async function rejectProposal(messageId: string): Promise<void> {
  await request(`/api/ai/proposals/${messageId}/reject`, { method: "POST" });
}

/** Puts the board back as before the latest applied proposal (409 if the board changed since). */
export async function undoProposal(messageId: string): Promise<BoardState> {
  return (await request<{ board: BoardState }>(`/api/ai/proposals/${messageId}/undo`, { method: "POST" })).board;
}

export function chat(boardId: string, message: string): Promise<ChatResponse> {
  return request<ChatResponse>("/api/ai/chat", {
    method: "POST",
    body: JSON.stringify({ board_id: boardId, message }),
  });
}
