import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { fakeApi } from "@/test/fakeApi";
import { Board } from "./Board";

const column = (id: string) => screen.getByTestId(`column-${id}`);

async function renderBoard(options?: Parameters<typeof fakeApi>[0]) {
  const api = fakeApi(options);
  render(<Board />);
  await screen.findByTestId("column-backlog");
  return { api, user: userEvent.setup() };
}

describe("Board", () => {
  it("loads the board from the API", async () => {
    const { api } = await renderBoard();
    expect(screen.getAllByTestId(/^column-/)).toHaveLength(5);
    expect(within(column("backlog")).getByText("پژوهش رقبا")).toBeInTheDocument();
    expect(api.calls()).toEqual([{ route: "GET /api/board", body: undefined }]);
  });

  it("shows an error when the board cannot be loaded", async () => {
    fakeApi({ overrides: { "GET /api/board": { status: 500 } } });
    render(<Board />);
    expect(await screen.findByText(/بارگذاری برد ناموفق بود/)).toBeInTheDocument();
  });

  it("renames a column on Enter, saves it, and ignores empty names", async () => {
    const { api, user } = await renderBoard();
    await user.click(within(column("todo")).getByRole("button", { name: "برای انجام" }));
    const input = screen.getByLabelText("نام ستون");
    await user.clear(input);
    await user.type(input, "اسپرینت{Enter}");
    expect(within(column("todo")).getByRole("button", { name: "اسپرینت" })).toBeInTheDocument();
    expect(api.state.board.columns[1].title).toBe("اسپرینت");

    await user.click(within(column("todo")).getByRole("button", { name: "اسپرینت" }));
    await user.clear(screen.getByLabelText("نام ستون"));
    await user.keyboard("{Enter}");
    expect(within(column("todo")).getByRole("button", { name: "اسپرینت" })).toBeInTheDocument();
    expect(api.calls().filter((c) => c.route.startsWith("PATCH"))).toHaveLength(1);
  });

  it("cancels rename on Escape without saving", async () => {
    const { api, user } = await renderBoard();
    await user.click(within(column("done")).getByRole("button", { name: "انجام‌شده" }));
    await user.type(screen.getByLabelText("نام ستون"), "xyz{Escape}");
    expect(within(column("done")).getByRole("button", { name: "انجام‌شده" })).toBeInTheDocument();
    expect(api.calls()).toHaveLength(1);
  });

  it("adds a card using the id returned by the server", async () => {
    const { api, user } = await renderBoard();
    const col = column("review");
    await user.click(within(col).getByRole("button", { name: /افزودن کارت/ }));
    const submit = within(col).getByRole("button", { name: "ثبت کارت" });
    expect(submit).toBeDisabled();
    await user.type(within(col).getByLabelText("عنوان کارت"), "کارت تازه");
    await user.type(within(col).getByLabelText("جزئیات کارت"), "توضیح");
    await user.click(submit);
    expect(await within(col).findByText("کارت تازه")).toBeInTheDocument();
    expect(within(col).getByText("توضیح")).toBeInTheDocument();
    expect(within(col).getByTestId("card-count")).toHaveTextContent("۲");
    expect(screen.getByTestId("card-new-1")).toBeInTheDocument();
    expect(api.calls().at(-1)).toEqual({
      route: "POST /api/cards",
      body: { column_id: "review", title: "کارت تازه", details: "توضیح" },
    });
  });

  it("deletes a card", async () => {
    const { api, user } = await renderBoard();
    await user.click(screen.getByRole("button", { name: "حذف پژوهش رقبا" }));
    expect(screen.queryByText("پژوهش رقبا")).not.toBeInTheDocument();
    expect(api.state.board.cards.c1).toBeUndefined();
  });

  it("edits a card title and details", async () => {
    const { api, user } = await renderBoard();
    await user.click(screen.getByRole("button", { name: "ویرایش حالت تاریک" }));
    const title = screen.getByLabelText("ویرایش عنوان");
    await user.clear(title);
    await user.type(title, "تم تیره");
    const details = screen.getByLabelText("ویرایش جزئیات");
    await user.clear(details);
    await user.type(details, "جزئیات تازه");
    await user.click(screen.getByRole("button", { name: "ذخیره" }));
    const col = column("backlog");
    expect(within(col).getByText("تم تیره")).toBeInTheDocument();
    expect(within(col).getByText("جزئیات تازه")).toBeInTheDocument();
    expect(screen.queryByText("حالت تاریک")).not.toBeInTheDocument();
    expect(api.calls().at(-1)).toEqual({
      route: "PATCH /api/cards/c2",
      body: { title: "تم تیره", details: "جزئیات تازه" },
    });
  });

  it("cancels editing on Escape and keeps the original card", async () => {
    const { user } = await renderBoard();
    await user.click(screen.getByRole("button", { name: "ویرایش حالت تاریک" }));
    await user.type(screen.getByLabelText("ویرایش عنوان"), "xyz{Escape}");
    expect(screen.queryByLabelText("ویرایش عنوان")).not.toBeInTheDocument();
    expect(screen.getByText("حالت تاریک")).toBeInTheDocument();
  });

  it("does not save an empty title", async () => {
    const { user } = await renderBoard();
    await user.click(screen.getByRole("button", { name: "ویرایش حالت تاریک" }));
    await user.clear(screen.getByLabelText("ویرایش عنوان"));
    expect(screen.getByRole("button", { name: "ذخیره" })).toBeDisabled();
  });

  it("reloads the server state when a save fails", async () => {
    const { user } = await renderBoard({ overrides: { "DELETE /api/cards/c1": { status: 500 } } });
    await user.click(screen.getByRole("button", { name: "حذف پژوهش رقبا" }));
    // Optimistically removed, then restored from the server after the failure.
    expect(await within(column("backlog")).findByText("پژوهش رقبا")).toBeInTheDocument();
  });
});
