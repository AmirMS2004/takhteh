import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { fakeApi } from "@/test/fakeApi";
import { useBoard } from "@/lib/useBoard";
import { Board } from "./Board";

function Harness() {
  return <Board store={useBoard("board-1")} />;
}

const column = (id: string) => screen.getByTestId(`column-${id}`);

async function renderBoard(options?: Parameters<typeof fakeApi>[0]) {
  const api = fakeApi(options);
  render(<Harness />);
  await screen.findByTestId("column-backlog");
  return { api, user: userEvent.setup() };
}

describe("Board", () => {
  it("loads the board from the API", async () => {
    const { api } = await renderBoard();
    expect(screen.getAllByTestId(/^column-/)).toHaveLength(5);
    expect(within(column("backlog")).getByText("پژوهش رقبا")).toBeInTheDocument();
    expect(api.calls()).toEqual([{ route: "GET /api/boards/board-1", body: undefined }]);
  });

  it("shows an error when the board cannot be loaded", async () => {
    fakeApi({ overrides: { "GET /api/boards/board-1": { status: 500 } } });
    render(<Harness />);
    expect(await screen.findByText(/بارگذاری تخته ناموفق بود/)).toBeInTheDocument();
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
      body: {
        column_id: "review",
        title: "کارت تازه",
        details: "توضیح",
        due_date: null,
        priority: null,
        labels: [],
        assignee: null,
      },
    });
  });

  it("sets due date, priority, assignee and labels while adding a card", async () => {
    const { api, user } = await renderBoard();
    const col = column("review");
    await user.click(within(col).getByRole("button", { name: /افزودن کارت/ }));
    await user.type(within(col).getByLabelText("عنوان کارت"), "با جزئیات");
    await user.type(within(col).getByLabelText("سررسید"), "2026-12-01");
    await user.selectOptions(within(col).getByLabelText("اولویت"), "high");
    await user.selectOptions(within(col).getByLabelText("مسئول"), "user");
    await user.click(within(col).getByRole("button", { name: "برچسب قرمز" }));
    await user.click(within(col).getByRole("button", { name: "ثبت کارت" }));

    const card = await screen.findByTestId("card-new-1");
    expect(within(card).getByText("اولویت بالا")).toBeInTheDocument();
    expect(within(card).getByText("user")).toBeInTheDocument();
    const red = api.state.board.labels.find((l) => l.color === "red")!.id;
    expect(api.calls().at(-1)!.body).toMatchObject({
      title: "با جزئیات",
      due_date: "2026-12-01",
      priority: "high",
      assignee: "user",
      labels: [red],
    });
  });

  it("deletes a card after confirmation", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const { api, user } = await renderBoard();
    await user.click(screen.getByRole("button", { name: "حذف پژوهش رقبا" }));
    expect(confirm).toHaveBeenCalledWith("کارت «پژوهش رقبا» حذف شود؟");
    expect(screen.queryByText("پژوهش رقبا")).not.toBeInTheDocument();
    expect(api.state.board.cards.c1).toBeUndefined();
  });

  it("keeps the card when deletion is not confirmed", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const { api, user } = await renderBoard();
    await user.click(screen.getByRole("button", { name: "حذف پژوهش رقبا" }));
    expect(screen.getByText("پژوهش رقبا")).toBeInTheDocument();
    expect(api.calls()).toHaveLength(1);
  });

  it("does not save a column name that did not change", async () => {
    const { api, user } = await renderBoard();
    await user.click(within(column("todo")).getByRole("button", { name: "برای انجام" }));
    await user.keyboard("{Enter}");
    expect(api.calls()).toHaveLength(1);
  });

  it("shows a hint in empty columns", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const { user } = await renderBoard();
    await user.click(screen.getByRole("button", { name: "حذف بازنویسی متن‌های راهنما" }));
    expect(within(column("review")).getByText(/کارتی نیست/)).toBeInTheDocument();
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
      body: { title: "تم تیره", details: "جزئیات تازه", due_date: null, priority: null, labels: [], assignee: null },
    });
  });

  it("sets a due date, priority, label and assignee, and shows them on the card", async () => {
    const { api, user } = await renderBoard();
    await user.click(screen.getByRole("button", { name: "ویرایش حالت تاریک" }));
    const form = column("backlog");
    await user.type(within(form).getByLabelText("سررسید"), "2099-03-21");
    await user.selectOptions(within(form).getByLabelText("اولویت"), "high");
    await user.selectOptions(within(form).getByLabelText("مسئول"), "user");
    await user.click(within(form).getByRole("button", { name: "برچسب سبز" }));
    await user.click(screen.getByRole("button", { name: "ذخیره" }));

    expect(api.state.board.cards.c2).toMatchObject({
      due_date: "2099-03-21",
      priority: "high",
      labels: ["label-1"],
      assignee: "user",
    });
    const card = screen.getByTestId("card-c2");
    expect(within(card).getByText("اولویت بالا")).toBeInTheDocument();
    expect(within(card).getByTitle("مسئول")).toHaveTextContent("user");
    expect(within(card).getByTitle("برچسب سبز")).toBeInTheDocument();
    expect(within(card).getByTitle("سررسید")).toHaveTextContent(/فروردین ۱۴۷۸/);
  });

  it("marks an overdue card and clears details", async () => {
    const { api, user } = await renderBoard();
    await user.click(screen.getByRole("button", { name: "ویرایش حالت تاریک" }));
    const form = column("backlog");
    await user.type(within(form).getByLabelText("سررسید"), "2000-01-01");
    await user.selectOptions(within(form).getByLabelText("اولویت"), "low");
    await user.click(screen.getByRole("button", { name: "ذخیره" }));
    expect(within(screen.getByTestId("card-c2")).getByTitle("سررسید گذشته")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "ویرایش حالت تاریک" }));
    await user.clear(within(column("backlog")).getByLabelText("سررسید"));
    await user.selectOptions(within(column("backlog")).getByLabelText("اولویت"), "");
    await user.click(screen.getByRole("button", { name: "ذخیره" }));
    expect(api.state.board.cards.c2).toMatchObject({ due_date: null, priority: null });
    expect(within(screen.getByTestId("card-c2")).queryByText(/اولویت/)).not.toBeInTheDocument();
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

  it("reloads the server state and tells the user when a save fails", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const { user } = await renderBoard({ overrides: { "DELETE /api/cards/c1": { status: 500 } } });
    await user.click(screen.getByRole("button", { name: "حذف پژوهش رقبا" }));
    // Optimistically removed, then restored from the server after the failure.
    expect(await within(column("backlog")).findByText("پژوهش رقبا")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("ذخیره تغییر ناموفق بود");
    await user.click(screen.getByRole("button", { name: "بستن" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
