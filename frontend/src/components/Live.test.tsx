import { describe, expect, it } from "vitest";
import { act, render, renderHook, screen, waitFor, within } from "@testing-library/react";
import { addCard, initialBoard, type BoardState } from "@/lib/board";
import { CLIENT_ID } from "@/lib/live";
import { useBoard } from "@/lib/useBoard";
import { fakeApi } from "@/test/fakeApi";
import Home from "@/app/page";

async function renderHome() {
  localStorage.clear();
  const api = fakeApi();
  render(<Home />);
  await screen.findByTestId("column-backlog");
  return api;
}

const boardLoads = (api: ReturnType<typeof fakeApi>) => api.calls().filter((c) => c.route === "GET /api/boards/board-1").length;

describe("live updates", () => {
  it("connects to the open board's live channel and says so", async () => {
    const api = await renderHome();
    expect(api.sockets().map((ws) => ws.url)).toEqual(["ws://localhost:3000/api/boards/board-1/live"]);
    await waitFor(() => expect(screen.getByTestId("live-status")).toHaveTextContent("هم‌گام"));
  });

  it("shows a change made by someone else without a reload", async () => {
    const api = await renderHome();
    api.state.board = addCard(api.state.board, "todo", { id: "remote-1", title: "از هم‌تیمی", details: "" });
    act(() => api.announce("board-1"));
    expect(await within(screen.getByTestId("column-todo")).findByText("از هم‌تیمی")).toBeInTheDocument();
    expect(screen.getByText(/تخته با تغییرات دیگران به‌روز شد/)).toBeInTheDocument();
  });

  it("ignores the announcement of its own change", async () => {
    const api = await renderHome();
    const before = boardLoads(api);
    act(() => api.announce("board-1", CLIENT_ID));
    await new Promise((r) => setTimeout(r, 20));
    expect(boardLoads(api)).toBe(before);
  });

  it("moves to another board when the open one is deleted by its owner", async () => {
    const api = await renderHome();
    api.state.boards["board-2"] = { ...(structuredClone(initialBoard) as BoardState), id: "board-2", title: "دیگری" };
    delete api.state.boards["board-1"];
    act(() => api.announce("board-1"));
    expect(await screen.findByRole("option", { name: "دیگری", selected: true })).toBeInTheDocument();
  });

  it("shows when the live connection is lost", async () => {
    const api = await renderHome();
    await waitFor(() => expect(screen.getByTestId("live-status")).toHaveAttribute("data-status", "live"));
    act(() => api.disconnect());
    expect(screen.getByTestId("live-status")).toHaveAttribute("data-status", "offline");
    expect(screen.getByTestId("live-status")).toHaveTextContent("قطع");
  });
});

describe("useBoard while dragging", () => {
  it("waits for the drag to end before reloading for someone else's change", async () => {
    const api = fakeApi();
    const { result } = renderHook(() => useBoard("board-1"));
    await waitFor(() => expect(result.current.board).not.toBeNull());
    const before = boardLoads(api);

    act(() => result.current.hold(true));
    act(() => result.current.remoteChanged());
    expect(boardLoads(api)).toBe(before);

    act(() => result.current.hold(false));
    expect(boardLoads(api)).toBe(before + 1);
  });
});
