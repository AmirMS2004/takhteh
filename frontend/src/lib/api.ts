async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
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

export async function logout(): Promise<void> {
  await request("/api/auth/logout", { method: "POST" });
}
