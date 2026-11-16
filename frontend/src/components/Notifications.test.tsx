import { afterEach, describe, expect, it } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AppNotification } from "@/lib/api";
import { initialBoard, type BoardState } from "@/lib/board";
import { describeNotification } from "@/lib/describe";
import { makeI18n } from "@/lib/i18n";
import { fakeApi } from "@/test/fakeApi";
import Home from "@/app/page";

const note = (fields: Partial<AppNotification>): AppNotification => ({
  id: `note-${Math.random()}`,
  kind: "assigned",
  params: { card: "پژوهش رقبا", board: "تخته پروژه" },
  actor: "bob",
  actor_avatar: 0,
  via: null,
  board: "board-1",
  read: false,
  created_at: "2026-11-16 10:00:00",
  ...fields,
});

async function renderHome(prepare?: (api: ReturnType<typeof fakeApi>) => void) {
  localStorage.clear();
  const api = fakeApi();
  prepare?.(api);
  render(<Home />);
  await screen.findByTestId("column-backlog");
  return { api, user: userEvent.setup() };
}

afterEach(() => localStorage.clear());

describe("notifications", () => {
  it("shows the unread count and lists the notifications", async () => {
    const { api, user } = await renderHome((api) => {
      api.state.notifications = [
        note({}),
        note({ kind: "overdue", actor: null, params: { card: "حالت تاریک", board: "تخته پروژه", date: "2026-11-10" } }),
        note({ kind: "added_to_board", params: { board: "بازاریابی" }, read: true }),
      ];
    });
    const bell = await screen.findByRole("button", { name: "اعلان‌ها (۲ تازه)" });
    await user.click(bell);
    const list = screen.getByRole("region", { name: "اعلان‌ها" });
    const items = within(list).getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("bob کارت «پژوهش رقبا» را به شما سپرد");
    expect(items[0]).toHaveTextContent("در «تخته پروژه»");
    expect(items[1]).toHaveTextContent("سررسید کارت «حالت تاریک» گذشته است");
    expect(items[2]).toHaveTextContent("bob شما را به تخته «بازاریابی» افزود");
    // Opening the list reads them.
    expect(api.state.notifications.every((n) => n.read)).toBe(true);
    expect(screen.getByRole("button", { name: "اعلان‌ها" })).toBeInTheDocument();
  });

  it("opens the board a notification is about", async () => {
    const second = { ...(structuredClone(initialBoard) as BoardState), id: "board-2", title: "دوم" };
    const { user } = await renderHome((api) => {
      api.state.boards["board-2"] = second;
      api.state.notifications = [note({ board: "board-2", params: { card: "پژوهش رقبا", board: "دوم" } })];
    });
    await user.click(await screen.findByRole("button", { name: "اعلان‌ها (۱ تازه)" }));
    await user.click(within(screen.getByRole("region", { name: "اعلان‌ها" })).getByRole("button"));
    expect(await screen.findByRole("option", { name: "دوم", selected: true })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "اعلان‌ها" })).not.toBeInTheDocument();
  });

  it("new notifications arrive live", async () => {
    const { api } = await renderHome();
    expect(await screen.findByRole("button", { name: "اعلان‌ها" })).toBeInTheDocument();
    api.state.notifications = [note({})];
    act(() => api.pushNotifications());
    expect(await screen.findByRole("button", { name: "اعلان‌ها (۱ تازه)" })).toBeInTheDocument();
  });

  it("says so when there are none", async () => {
    const { user } = await renderHome();
    await user.click(await screen.findByRole("button", { name: "اعلان‌ها" }));
    expect(screen.getByText("اعلانی ندارید.")).toBeInTheDocument();
  });

  it("words every kind in both languages", () => {
    const fa = makeI18n("fa");
    const en = makeI18n("en");
    const updated = note({ kind: "card_updated", params: { card: "A", board: "B", fields: ["priority", "labels"] } });
    expect(describeNotification(updated, en)).toBe("bob edited your card “A”: priority, labels");
    expect(describeNotification(updated, fa)).toBe("bob کارت شما «A» را ویرایش کرد: اولویت، برچسب‌ها");
    const moved = note({ kind: "card_moved", params: { card: "A", board: "B", from: "To do", to: "Done" } });
    expect(describeNotification(moved, en)).toBe("bob moved your card “A” from “To do” to “Done”");
    expect(describeNotification(note({ kind: "board_deleted", params: { board: "B" } }), en)).toBe(
      "bob deleted the board “B”",
    );
    expect(describeNotification(note({ kind: "due_soon", actor: null, params: { card: "A", board: "B", date: "2026-12-01" } }), en)).toMatch(
      /^The card “A” is due soon \(Dec 1(, 2026)?\)$/,
    );
  });
});
