import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { fakeApi } from "@/test/fakeApi";
import Home from "@/app/page";

async function setup(prepare?: (api: ReturnType<typeof fakeApi>) => void) {
  localStorage.clear();
  const api = fakeApi();
  api.state.users.bob = "secret123";
  prepare?.(api);
  render(<Home />);
  await screen.findByTestId("column-backlog");
  return { api, user: userEvent.setup() };
}

const switcher = () => screen.getByRole("combobox", { name: "انتخاب تخته" });
const settings = () => screen.getByRole("dialog", { name: "تنظیمات تخته" });
const options = () => within(switcher()).getAllByRole("option").map((o) => o.textContent);

async function openSettings(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /اعضا و تنظیمات/ }));
  return settings();
}

describe("boards", () => {
  it("creates a board, switches to it, and remembers it", async () => {
    const { user } = await setup();
    await user.click(screen.getByRole("button", { name: "+ تخته تازه" }));
    await user.type(within(screen.getByRole("dialog", { name: "تخته تازه" })).getByLabelText("نام تخته"), "بازاریابی");
    await user.click(screen.getByRole("button", { name: "ساخت تخته" }));

    expect(await screen.findByRole("option", { name: "بازاریابی", selected: true })).toBeInTheDocument();
    expect(options()).toEqual(["تخته پروژه", "بازاریابی"]);
    expect(await screen.findAllByText("کارتی نیست؛ کارت را اینجا رها کنید.")).toHaveLength(5);
    expect(localStorage.getItem("pm:board")).toBe("board-new-1");

    await user.selectOptions(switcher(), "board-1");
    expect(await screen.findByText("پژوهش رقبا")).toBeInTheDocument();
    expect(localStorage.getItem("pm:board")).toBe("board-1");
  });

  it("opens the board saved in this browser", async () => {
    localStorage.clear();
    const api = fakeApi();
    api.state.boards["board-2"] = { ...structuredClone(api.state.board), id: "board-2", title: "دوم", cards: {} };
    api.state.boards["board-2"].columns = api.state.boards["board-2"].columns.map((c) => ({ ...c, id: `b2-${c.id}`, cardIds: [] }));
    localStorage.setItem("pm:board", "board-2");
    render(<Home />);
    expect(await screen.findByRole("option", { name: "دوم", selected: true })).toBeInTheDocument();
  });

  it("renames the board", async () => {
    const { api, user } = await setup();
    const dialog = await openSettings(user);
    const title = within(dialog).getByLabelText("نام تخته");
    await user.clear(title);
    await user.type(title, "محصول{Enter}");
    expect(api.state.board.title).toBe("محصول");
    expect(await screen.findByRole("option", { name: "محصول" })).toBeInTheDocument();
  });

  it("adds a member, offers them as assignee, and removes them", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const { api, user } = await setup();
    let dialog = await openSettings(user);

    await user.type(within(dialog).getByLabelText("نام کاربری عضو تازه"), "nobody");
    await user.click(within(dialog).getByRole("button", { name: "افزودن" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("کاربری با نام «nobody» نیست.");

    await user.clear(within(dialog).getByLabelText("نام کاربری عضو تازه"));
    await user.type(within(dialog).getByLabelText("نام کاربری عضو تازه"), "Bob");
    await user.click(within(dialog).getByRole("button", { name: "افزودن" }));
    expect(await within(dialog).findByText("bob")).toBeInTheDocument();
    expect(api.state.board.members.map((m) => m.username)).toEqual(["user", "bob"]);

    await user.type(within(dialog).getByLabelText("نام کاربری عضو تازه"), "bob");
    await user.click(within(dialog).getByRole("button", { name: "افزودن" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("از قبل عضو این تخته است");

    await user.click(within(dialog).getByRole("button", { name: "بستن" }));
    await user.click(screen.getByRole("button", { name: "ویرایش پژوهش رقبا" }));
    const assignee = within(screen.getByTestId("column-backlog")).getByLabelText("مسئول");
    expect(within(assignee).getAllByRole("option").map((o) => o.textContent)).toEqual(["بدون مسئول", "user", "bob"]);
    await user.click(screen.getByRole("button", { name: "انصراف" }));

    dialog = await openSettings(user);
    await user.click(within(dialog).getByRole("button", { name: "حذف bob از تخته" }));
    expect(within(dialog).queryByText("bob")).not.toBeInTheDocument();
  });

  it("deletes a board after confirmation and opens another one", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const { api, user } = await setup();
    await user.click(screen.getByRole("button", { name: "+ تخته تازه" }));
    await user.type(screen.getByLabelText("نام تخته"), "موقت");
    await user.click(screen.getByRole("button", { name: "ساخت تخته" }));
    await screen.findByRole("option", { name: "موقت", selected: true });

    const dialog = await openSettings(user);
    await user.click(within(dialog).getByRole("button", { name: "حذف تخته" }));
    expect(await screen.findByRole("option", { name: "تخته پروژه", selected: true })).toBeInTheDocument();
    expect(Object.keys(api.state.boards)).toEqual(["board-1"]);
  });

  it("lets a member leave but not manage the board", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const { api, user } = await setup((api) => {
      api.state.board = {
        ...api.state.board,
        role: "member",
        members: [
          { username: "bob", role: "owner" },
          { username: "user", role: "member" },
        ],
      };
    });
    expect(options()).toEqual(["تخته پروژه (از bob)"]);
    const dialog = await openSettings(user);
    expect(within(dialog).queryByLabelText("نام تخته")).not.toBeInTheDocument();
    expect(within(dialog).queryByLabelText("نام کاربری عضو تازه")).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: /حذف bob/ })).not.toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "خروج از تخته" }));
    expect(await screen.findByText("هنوز تخته‌ای ندارید.")).toBeInTheDocument();
    expect(api.state.boards).toEqual({});
  });

  it("shows an empty state and creates the first board", async () => {
    localStorage.clear();
    const api = fakeApi();
    api.state.boards = {};
    render(<Home />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "ساخت اولین تخته" }));
    await user.type(screen.getByLabelText("نام تخته"), "اولین");
    await user.click(screen.getByRole("button", { name: "ساخت تخته" }));
    expect(await screen.findByRole("option", { name: "اولین", selected: true })).toBeInTheDocument();
  });
});
