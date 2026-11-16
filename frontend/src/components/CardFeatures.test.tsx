import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { fakeApi } from "@/test/fakeApi";
import Home from "@/app/page";

async function setup(prepare?: (api: ReturnType<typeof fakeApi>) => void) {
  localStorage.clear();
  const api = fakeApi();
  prepare?.(api);
  render(<Home />);
  await screen.findByTestId("column-backlog");
  return { api, user: userEvent.setup() };
}

const panel = (title: string) => screen.getByRole("dialog", { name: title });

describe("card panel", () => {
  it("adds and ticks checklist items, shown as progress on the card", async () => {
    const { api, user } = await setup();
    await user.click(screen.getByRole("button", { name: "باز کردن حالت تاریک" }));
    const dialog = panel("حالت تاریک");
    for (const text of ["نظرسنجی", "طراحی رنگ‌ها"]) {
      await user.type(within(dialog).getByLabelText("مورد تازه"), text);
      await user.click(within(dialog).getByRole("button", { name: "افزودن" }));
    }
    await user.click(await within(dialog).findByRole("checkbox", { name: "نظرسنجی" }));
    expect(within(dialog).getByText("۱ از ۲")).toBeInTheDocument();
    expect(api.state.board.cards.c2.checklist).toEqual([
      { id: expect.any(String), text: "نظرسنجی", done: true },
      { id: expect.any(String), text: "طراحی رنگ‌ها", done: false },
    ]);

    await user.click(within(dialog).getByRole("button", { name: "حذف طراحی رنگ‌ها" }));
    expect(api.state.board.cards.c2.checklist).toHaveLength(1);
    await user.click(within(dialog).getByRole("button", { name: "بستن" }));
    expect(within(screen.getByTestId("card-c2")).getByTitle("چک‌لیست", { exact: true })).toHaveTextContent("۱ از ۱");
  });

  it("posts a comment that mentions a member, and counts it on the card", async () => {
    const { api, user } = await setup((api) => {
      api.state.board.members = [
        { username: "user", role: "owner" },
        { username: "bob", role: "member" },
      ];
    });
    await user.click(screen.getByRole("button", { name: "باز کردن حالت تاریک" }));
    const dialog = panel("حالت تاریک");
    expect(await within(dialog).findByText("هنوز نظری نیست.")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "@bob" }));
    await user.type(within(dialog).getByLabelText("نظر تازه"), "لطفاً نگاه کن");
    expect(within(dialog).getByLabelText("نظر تازه")).toHaveValue("@bob لطفاً نگاه کن");
    await user.click(within(dialog).getByRole("button", { name: "ارسال" }));

    const posted = await within(within(dialog).getByRole("region", { name: "نظرها" })).findByRole("list");
    expect(within(posted).getByText("@bob")).toHaveClass("text-primary-700");
    expect(api.calls().find((c) => c.route === "POST /api/cards/c2/comments")?.body).toEqual({ body: "@bob لطفاً نگاه کن" });
    await user.click(within(dialog).getByRole("button", { name: "بستن" }));
    expect(within(screen.getByTestId("card-c2")).getByTitle("نظرها", { exact: true })).toHaveTextContent("۱");

    // The author can delete it.
    await user.click(screen.getByRole("button", { name: "باز کردن حالت تاریک" }));
    await user.click(await within(panel("حالت تاریک")).findByRole("button", { name: "حذف" }));
    expect(await within(panel("حالت تاریک")).findByText("هنوز نظری نیست.")).toBeInTheDocument();
    expect(api.state.comments.c2).toEqual([]);
  });

  it("archives a card from its panel and brings it back from the board archive", async () => {
    const { api, user } = await setup();
    await user.click(screen.getByRole("button", { name: "باز کردن حالت تاریک" }));
    await user.click(within(panel("حالت تاریک")).getByRole("button", { name: "بایگانی کارت" }));
    expect(screen.queryByTestId("card-c2")).not.toBeInTheDocument();
    expect(api.calls().at(-1)).toEqual({ route: "PATCH /api/cards/c2", body: { archived: true } });

    await user.click(screen.getByRole("button", { name: "بایگانی" }));
    const archive = screen.getByRole("dialog", { name: "بایگانی تخته" });
    expect(await within(archive).findByText("حالت تاریک")).toBeInTheDocument();
    expect(within(archive).getByText("از «ایده‌ها»")).toBeInTheDocument();
    await user.click(within(archive).getByRole("button", { name: "بازگرداندن حالت تاریک" }));
    expect(await within(archive).findByText("کارت بایگانی‌شده‌ای نیست.")).toBeInTheDocument();
    expect(await screen.findByTestId("card-c2")).toBeInTheDocument();
    expect(api.state.board.columns[0].cardIds.at(-1)).toBe("c2"); // back at the bottom of its column
  });
});

describe("my tasks", () => {
  it("lists the user's open cards by due date, ticks one done and opens a card's board", async () => {
    const { api, user } = await setup((api) => {
      Object.assign(api.state.board.cards.c1, { assignee: "user", due_date: "2000-01-01" });
      Object.assign(api.state.board.cards.c4, { assignee: "user", priority: "high" });
      Object.assign(api.state.board.cards.c9, { assignee: "user" }); // in the last column: done
    });
    await user.click(screen.getByRole("button", { name: "کارهای من" }));
    expect(await screen.findByRole("heading", { level: 1, name: "کارهای من" })).toBeInTheDocument();
    const overdue = screen.getByRole("region", { name: /سررسید گذشته/ });
    expect(within(overdue).getByText("پژوهش رقبا")).toBeInTheDocument();
    const noDue = screen.getByRole("region", { name: /بدون سررسید/ });
    expect(within(noDue).getByText("طراحی صفحه ورود")).toBeInTheDocument();
    expect(screen.queryByText("راه‌اندازی مخزن")).not.toBeInTheDocument();

    await user.click(within(overdue).getByRole("checkbox", { name: "انجام‌شده: پژوهش رقبا" }));
    expect(screen.queryByRole("region", { name: /سررسید گذشته/ })).not.toBeInTheDocument();
    expect(api.state.board.cards.c1.done).toBe(true);

    await user.click(within(noDue).getByRole("button", { name: /طراحی صفحه ورود/ }));
    expect(await screen.findByTestId("column-backlog")).toBeInTheDocument();
  });
});

describe("assistant shortcuts", () => {
  it("asks the assistant to prioritise the board", async () => {
    const { api, user } = await setup();
    await user.click(screen.getByRole("button", { name: "اولویت‌بندی" }));
    await screen.findByText(/پاسخ به: کارهای این تخته را اولویت‌بندی کن/);
    expect(api.calls().some((c) => c.route === "POST /api/ai/chat/stream")).toBe(true);
  });

  it("sends a new board's description to the assistant to set the board up", async () => {
    const { api, user } = await setup();
    await user.click(screen.getByRole("button", { name: "+ تخته تازه" }));
    const dialog = screen.getByRole("dialog", { name: "تخته تازه" });
    await user.type(within(dialog).getByLabelText("نام تخته"), "فروشگاه");
    await user.type(within(dialog).getByLabelText("توضیح پروژه (اختیاری)"), "فروشگاه اینترنتی لباس");
    await user.click(within(dialog).getByRole("button", { name: "ساخت تخته" }));

    expect(await screen.findByRole("option", { name: "فروشگاه", selected: true })).toBeInTheDocument();
    expect(await screen.findByText(/پاسخ به: این تخته را برای این پروژه بچین/)).toBeInTheDocument();
    const sent = api.calls().find((c) => c.route === "POST /api/ai/chat/stream")!.body;
    expect(sent.board_id).toBe("board-new-1");
    expect(sent.message).toContain("فروشگاه اینترنتی لباس");
  });
});
