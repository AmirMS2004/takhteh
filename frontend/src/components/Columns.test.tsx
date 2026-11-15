import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { fakeApi } from "@/test/fakeApi";
import { useBoard } from "@/lib/useBoard";
import { Board } from "./Board";

function Harness() {
  return <Board store={useBoard("board-1")} />;
}

async function setup(overrides?: Parameters<typeof fakeApi>[0]) {
  const api = fakeApi(overrides);
  render(<Harness />);
  await screen.findByTestId("column-backlog");
  return { api, user: userEvent.setup() };
}

const columnTitles = () => screen.getAllByTestId(/^column-/).map((c) => within(c).getAllByRole("button")[1].textContent);

describe("columns", () => {
  it("adds a column at the end", async () => {
    const { api, user } = await setup();
    await user.click(screen.getByRole("button", { name: "+ ستون تازه" }));
    await user.type(screen.getByLabelText("نام ستون تازه"), "  آرشیو  {Enter}");
    expect(await screen.findByTestId("column-col-new-1")).toBeInTheDocument();
    expect(columnTitles().at(-1)).toBe("آرشیو");
    expect(api.state.board.columns.map((c) => c.title).at(-1)).toBe("آرشیو");
    expect(screen.getByRole("button", { name: "+ ستون تازه" })).toBeInTheDocument();
  });

  it("cancels adding with Escape", async () => {
    const { api, user } = await setup();
    await user.click(screen.getByRole("button", { name: "+ ستون تازه" }));
    await user.type(screen.getByLabelText("نام ستون تازه"), "x{Escape}");
    expect(screen.queryByLabelText("نام ستون تازه")).not.toBeInTheDocument();
    expect(api.state.board.columns).toHaveLength(5);
  });

  it("deletes a column with its cards after confirmation that names the card count", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const { api, user } = await setup();
    await user.click(screen.getByRole("button", { name: "حذف ستون ایده‌ها" }));
    expect(confirm.mock.calls[0][0]).toContain("۳ کارتش");
    expect(screen.queryByTestId("column-backlog")).not.toBeInTheDocument();
    expect(screen.queryByText("پژوهش رقبا")).not.toBeInTheDocument();
    expect(api.state.board.columns.map((c) => c.id)).not.toContain("backlog");
    expect(api.state.board.cards.c1).toBeUndefined();
  });

  it("keeps the column when deletion is not confirmed", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const { api, user } = await setup();
    await user.click(screen.getByRole("button", { name: "حذف ستون ایده‌ها" }));
    expect(screen.getByTestId("column-backlog")).toBeInTheDocument();
    expect(api.state.board.columns).toHaveLength(5);
  });

  it("restores the column and explains when deleting fails", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const { user } = await setup({ overrides: { "DELETE /api/columns/backlog": { status: 409 } } });
    await user.click(screen.getByRole("button", { name: "حذف ستون ایده‌ها" }));
    expect(await screen.findByTestId("column-backlog")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("ذخیره تغییر ناموفق بود");
  });

  it("each column has a drag handle", async () => {
    await setup();
    const handle = screen.getByRole("button", { name: "جابه‌جایی ستون ایده‌ها" });
    expect(handle).toHaveAttribute("aria-roledescription", "sortable");
  });
});
