import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { fakeApi } from "@/test/fakeApi";
import Home from "@/app/page";

async function openDashboard(prepare?: (api: ReturnType<typeof fakeApi>) => void) {
  localStorage.clear();
  const api = fakeApi();
  prepare?.(api);
  const user = userEvent.setup();
  render(<Home />);
  await screen.findByTestId("column-backlog");
  await user.click(screen.getByRole("button", { name: /داشبورد من/ }));
  await screen.findByRole("heading", { name: "تخته‌های من" });
  return { api, user };
}

const profileSection = () => screen.getByRole("region", { name: /user|امیر/ });
const boardsSection = () => screen.getByRole("region", { name: "تخته‌های من" });
const save = () => screen.getByRole("button", { name: "ذخیره تغییرات" });

describe("dashboard", () => {
  it("lists the boards the user is on with their role and counts", async () => {
    await openDashboard((api) => {
      const b = api.state.board;
      const first = Object.keys(b.cards)[0];
      b.cards[first] = { ...b.cards[first], assignee: "user" };
      api.state.boards["board-2"] = {
        ...structuredClone(b),
        id: "board-2",
        title: "مشترک",
        role: "member",
        members: [
          { username: "bob", role: "owner" },
          { username: "user", role: "member" },
        ],
        cards: {},
      };
    });
    const items = within(boardsSection()).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("تخته پروژه");
    expect(items[0]).toHaveTextContent("مالک");
    expect(items[0]).toHaveTextContent("۱ کارت با مسئولیت من");
    expect(items[1]).toHaveTextContent("عضو");
    expect(items[1]).toHaveTextContent("مالک: bob");
    expect(items[1]).toHaveTextContent("۲ عضو · ۰ کارت");
  });

  it("opens a board from the list", async () => {
    const { api, user } = await openDashboard((api) => {
      api.state.boards["board-2"] = { ...structuredClone(api.state.board), id: "board-2", title: "دوم", cards: {} };
      api.state.boards["board-2"].columns.forEach((c) => (c.cardIds = []));
    });
    await user.click(screen.getByRole("button", { name: "باز کردن دوم" }));
    expect(await screen.findByRole("option", { name: "دوم", selected: true })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "تخته" })).toBeInTheDocument();
    expect(api.state.loggedIn).toBe(true);
  });

  it("saves name, email and picture, and shows them in the header", async () => {
    const { api, user } = await openDashboard();
    expect(save()).toBeDisabled();
    await user.type(screen.getByLabelText("نام"), "امیر");
    await user.type(screen.getByLabelText("ایمیل"), "amir@example.com");
    await user.click(screen.getByRole("button", { name: "عکس ۳" }));
    expect(screen.getByRole("button", { name: "عکس ۳" })).toHaveAttribute("aria-pressed", "true");
    await user.click(save());

    expect(await screen.findByRole("status")).toHaveTextContent("تغییرات ذخیره شد.");
    expect(api.state.profiles.user).toMatchObject({ name: "امیر", email: "amir@example.com", avatar: 3 });
    const body = api.calls().find((c) => c.route === "PATCH /api/auth/profile")!.body;
    expect(body).toEqual({ name: "امیر", email: "amir@example.com", avatar: 3 }); // only changed fields
    expect(screen.getByRole("button", { name: /داشبورد من/ })).toHaveTextContent("امیر");
    expect(within(profileSection()).getByRole("heading", { name: "امیر" })).toBeInTheDocument();
  });

  it("changes the username", async () => {
    const { api, user } = await openDashboard();
    const field = screen.getByLabelText("نام کاربری");
    await user.clear(field);
    await user.type(field, "Amir_1");
    await user.click(save());
    expect(await screen.findByRole("status")).toBeInTheDocument();
    expect(api.state.username).toBe("amir_1");
    expect(screen.getByRole("button", { name: "داشبورد من (amir_1)" })).toBeInTheDocument();
  });

  it("reports a taken username", async () => {
    const { user } = await openDashboard((api) => (api.state.users.bob = "secret123"));
    const field = screen.getByLabelText("نام کاربری");
    await user.clear(field);
    await user.type(field, "bob");
    await user.click(save());
    expect(await screen.findByRole("alert")).toHaveTextContent("نام کاربری «bob» گرفته شده است.");
  });

  it.each([
    ["نام کاربری", "a b", "۳ تا ۳۲ حرف"],
    ["ایمیل", "not-an-email", "ایمیل معتبر نیست."],
  ])("checks %s before sending", async (label, value, message) => {
    const { api, user } = await openDashboard();
    const field = screen.getByLabelText(label);
    await user.clear(field);
    await user.type(field, value);
    await user.click(save());
    expect(screen.getByRole("alert")).toHaveTextContent(message);
    expect(api.calls().some((c) => c.route === "PATCH /api/auth/profile")).toBe(false);
  });

  it("goes back to the board", async () => {
    const { user } = await openDashboard();
    await user.click(screen.getByRole("button", { name: "بازگشت به تخته" }));
    expect(await screen.findByTestId("column-backlog")).toBeInTheDocument();
  });
});
