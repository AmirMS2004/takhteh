import type { BoardLabel, BoardState, BoardSummary, Card, Column } from "./board";

/** Fired when the session is gone (e.g. expired) so the page can show the login form again. */
export const UNAUTHORIZED_EVENT = "pm:unauthorized";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
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

export async function getMe(): Promise<string | null> {
  try {
    return (await request<{ username: string }>("/api/auth/me")).username;
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

export function createCard(columnId: string, title: string, details: string): Promise<Card> {
  return request<Card>("/api/cards", {
    method: "POST",
    body: JSON.stringify({ column_id: columnId, title, details }),
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

export type ChatMessage = { role: "user" | "assistant"; content: string };
export type ChatResponse = { reply: string; board: BoardState; applied: number; error: string | null };

export function chat(boardId: string, message: string, history: ChatMessage[]): Promise<ChatResponse> {
  return request<ChatResponse>("/api/ai/chat", {
    method: "POST",
    body: JSON.stringify({ board_id: boardId, message, history }),
  });
}
