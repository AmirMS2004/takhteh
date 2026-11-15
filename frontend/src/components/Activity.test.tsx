import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { fakeApi } from "@/test/fakeApi";
import { timeAgo } from "@/lib/time";
import Home from "@/app/page";

async function renderHome() {
  localStorage.clear();
  vi.spyOn(window, "confirm").mockReturnValue(true);
  const api = fakeApi();
  const user = userEvent.setup();
  render(<Home />);
  await screen.findByTestId("column-backlog");
  return { api, user };
}

const column = (id: string) => screen.getByTestId(`column-${id}`);
const history = () => screen.getByRole("dialog", { name: /^تاریخچه/ });

describe("restoring deletions", () => {
  it("offers to bring back a card right after it is deleted", async () => {
    const { user } = await renderHome();
    await user.click(within(column("backlog")).getByRole("button", { name: "حذف پژوهش رقبا" }));
    const notice = await screen.findByText("کارت «پژوهش رقبا» حذف شد.");
    expect(within(column("backlog")).queryByText("پژوهش رقبا")).not.toBeInTheDocument();
    await user.click(within(notice.parentElement!).getByRole("button", { name: "بازگرداندن" }));
    expect(await within(column("backlog")).findByText("پژوهش رقبا")).toBeInTheDocument();
    expect(screen.queryByText("کارت «پژوهش رقبا» حذف شد.")).not.toBeInTheDocument();
  });

  it("offers the same for a deleted column", async () => {
    const { user } = await renderHome();
    await user.click(within(column("review")).getByRole("button", { name: "حذف ستون بازبینی" }));
    const notice = await screen.findByText("ستون «بازبینی» حذف شد.");
    await user.click(within(notice.parentElement!).getByRole("button", { name: "بازگرداندن" }));
    expect(await screen.findByTestId("column-review")).toBeInTheDocument();
  });
});

describe("history", () => {
  it("lists the board's changes and restores from the deleted ones", async () => {
    const { user } = await renderHome();
    await user.click(within(column("backlog")).getByRole("button", { name: "حذف حالت تاریک" }));
    await screen.findByText("کارت «حالت تاریک» حذف شد.");

    await user.click(screen.getByRole("button", { name: "تاریخچه" }));
    const entries = await within(history()).findAllByRole("listitem");
    expect(entries[0]).toHaveTextContent("user کارت «حالت تاریک» را حذف کرد");

    await user.click(within(history()).getByRole("button", { name: "حذف‌شده‌ها" }));
    await user.click(await within(history()).findByRole("button", { name: "بازگرداندن" }));
    expect(await within(column("backlog")).findByText("حالت تاریک")).toBeInTheDocument();
    expect(await within(history()).findByText("چیزی برای بازگرداندن نیست.")).toBeInTheDocument();
  });

  it("shows one card's history from its edit form", async () => {
    const { api, user } = await renderHome();
    await user.click(within(column("backlog")).getByRole("button", { name: "ویرایش پژوهش رقبا" }));
    await user.click(within(column("backlog")).getByRole("button", { name: "تاریخچه کارت" }));
    expect(screen.getByRole("dialog", { name: "تاریخچه «پژوهش رقبا»" })).toBeInTheDocument();
    expect(await within(history()).findByText("هنوز تغییری ثبت نشده است.")).toBeInTheDocument();
    expect(api.calls().some((c) => c.route === "GET /api/boards/board-1/activity?card=c1")).toBe(true);
  });
});

describe("timeAgo", () => {
  const now = Date.parse("2026-11-15T12:00:00Z");
  it.each([
    ["2026-11-15 11:59:50", "همین حالا"],
    ["2026-11-15 11:55:00", "۵ دقیقه پیش"],
    ["2026-11-15 09:00:00", "۳ ساعت پیش"],
    ["2026-11-14 12:00:00", "دیروز"],
  ])("%s -> %s", (utc, text) => {
    expect(timeAgo(utc, now)).toBe(text);
  });
});
