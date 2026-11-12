import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Home from "./page";

type Route = { status: number; body?: unknown };

/** Stubs fetch with responses keyed by "METHOD path" and returns the mock for call assertions. */
function mockApi(routes: Record<string, Route | Route[]>) {
  const queues = Object.fromEntries(
    Object.entries(routes).map(([k, v]) => [k, Array.isArray(v) ? [...v] : [v]]),
  );
  const fetchMock = vi.fn(async (path: string, init?: RequestInit) => {
    const key = `${init?.method ?? "GET"} ${path}`;
    const queue = queues[key];
    if (!queue) throw new Error(`Unexpected request ${key}`);
    const route = queue.length > 1 ? queue.shift()! : queue[0];
    return new Response(JSON.stringify(route.body ?? {}), { status: route.status });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

async function fillLogin(username: string, password: string) {
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText("نام کاربری"), username);
  await user.type(screen.getByLabelText("رمز عبور"), password);
  await user.click(screen.getByRole("button", { name: "ورود" }));
  return user;
}

describe("Home", () => {
  it("shows the login form when not signed in", async () => {
    mockApi({ "GET /api/auth/me": { status: 401 } });
    render(<Home />);
    expect(await screen.findByRole("heading", { name: "ورود به تخته پروژه" })).toBeInTheDocument();
    expect(screen.queryByTestId("column-backlog")).not.toBeInTheDocument();
  });

  it("shows the board directly for an existing session", async () => {
    mockApi({ "GET /api/auth/me": { status: 200, body: { username: "user" } } });
    render(<Home />);
    expect(await screen.findByRole("heading", { name: "تخته پروژه" })).toBeInTheDocument();
    expect(screen.getByTestId("column-backlog")).toBeInTheDocument();
  });

  it("signs in with valid credentials", async () => {
    const fetchMock = mockApi({
      "GET /api/auth/me": { status: 401 },
      "POST /api/auth/login": { status: 200, body: { username: "user" } },
    });
    render(<Home />);
    await fillLogin("user", "password");
    expect(await screen.findByRole("heading", { name: "تخته پروژه" })).toBeInTheDocument();
    const [, init] = fetchMock.mock.calls.find(([p]) => p === "/api/auth/login")!;
    expect(JSON.parse(init!.body as string)).toEqual({ username: "user", password: "password" });
  });

  it("shows an error for wrong credentials and stays on the form", async () => {
    mockApi({
      "GET /api/auth/me": { status: 401 },
      "POST /api/auth/login": { status: 401 },
    });
    render(<Home />);
    await fillLogin("user", "wrong");
    expect(await screen.findByRole("alert")).toHaveTextContent("نام کاربری یا رمز عبور نادرست است.");
    expect(screen.getByRole("button", { name: "ورود" })).toBeEnabled();
  });

  it("shows a connection error when the server fails", async () => {
    mockApi({
      "GET /api/auth/me": { status: 401 },
      "POST /api/auth/login": { status: 500 },
    });
    render(<Home />);
    await fillLogin("user", "password");
    expect(await screen.findByRole("alert")).toHaveTextContent("ارتباط با سرور برقرار نشد");
  });

  it("disables submit until both fields are filled", async () => {
    mockApi({ "GET /api/auth/me": { status: 401 } });
    render(<Home />);
    const user = userEvent.setup();
    const submit = await screen.findByRole("button", { name: "ورود" });
    expect(submit).toBeDisabled();
    await user.type(screen.getByLabelText("نام کاربری"), "user");
    expect(submit).toBeDisabled();
  });

  it("logs out and returns to the login form", async () => {
    const fetchMock = mockApi({
      "GET /api/auth/me": { status: 200, body: { username: "user" } },
      "POST /api/auth/logout": { status: 200, body: { ok: true } },
    });
    render(<Home />);
    await userEvent.setup().click(await screen.findByRole("button", { name: "خروج" }));
    expect(await screen.findByRole("heading", { name: "ورود به تخته پروژه" })).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([p]) => p === "/api/auth/logout")).toBe(true);
  });
});
