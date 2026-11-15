import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { fakeApi } from "@/test/fakeApi";
import Home from "@/app/page";

async function openSignup() {
  const user = userEvent.setup();
  render(<Home />);
  await user.click(await screen.findByRole("button", { name: "ثبت‌نام کنید" }));
  return user;
}

async function fillSignup(user: ReturnType<typeof userEvent.setup>, username: string, password: string, repeat = password) {
  await user.type(screen.getByLabelText("نام کاربری"), username);
  await user.type(screen.getByLabelText("رمز عبور"), password);
  await user.type(screen.getByLabelText("تکرار رمز عبور"), repeat);
  await user.click(screen.getByRole("button", { name: "ساخت حساب" }));
}

describe("sign-up", () => {
  it("creates an account and shows the board", async () => {
    const api = fakeApi({ loggedIn: false });
    const user = await openSignup();
    expect(screen.getByRole("heading", { name: "ساخت حساب تازه" })).toBeInTheDocument();
    await fillSignup(user, "Alice", "secret123");
    expect(await screen.findByTestId("column-backlog")).toBeInTheDocument();
    expect(screen.getByText("alice")).toBeInTheDocument();
    expect(api.calls().find((c) => c.route === "POST /api/auth/signup")?.body).toEqual({
      username: "Alice",
      password: "secret123",
    });
  });

  it.each([
    ["ab", "secret123", "secret123", "نام کاربری باید"],
    ["has space", "secret123", "secret123", "نام کاربری باید"],
    ["alice", "short", "short", "دست‌کم ۸ کاراکتر"],
    ["alice", "secret123", "secret124", "تکرار رمز عبور"],
  ])("checks %s / %s before sending", async (username, password, repeat, message) => {
    const api = fakeApi({ loggedIn: false });
    const user = await openSignup();
    await fillSignup(user, username, password, repeat);
    expect(screen.getByRole("alert")).toHaveTextContent(message);
    expect(api.calls().some((c) => c.route === "POST /api/auth/signup")).toBe(false);
  });

  it("explains when the username is taken", async () => {
    fakeApi({ loggedIn: false });
    const user = await openSignup();
    await fillSignup(user, "user", "secret123");
    expect(await screen.findByRole("alert")).toHaveTextContent("این نام کاربری قبلاً ثبت شده است.");
  });

  it("switches back to login and clears the passwords", async () => {
    fakeApi({ loggedIn: false });
    const user = await openSignup();
    await user.type(screen.getByLabelText("رمز عبور"), "secret123");
    await user.click(screen.getByRole("button", { name: "وارد شوید" }));
    expect(screen.getByRole("heading", { name: "ورود به تخته پروژه" })).toBeInTheDocument();
    expect(screen.getByLabelText("رمز عبور")).toHaveValue("");
    expect(screen.queryByLabelText("تکرار رمز عبور")).not.toBeInTheDocument();
  });
});

describe("change password", () => {
  async function openDialog() {
    const api = fakeApi();
    const user = userEvent.setup();
    render(<Home />);
    await user.click(await screen.findByRole("button", { name: "تغییر رمز" }));
    return { api, user, dialog: screen.getByRole("dialog", { name: "تغییر رمز عبور" }) };
  }

  async function fill(user: ReturnType<typeof userEvent.setup>, current: string, next: string, repeat = next) {
    await user.type(screen.getByLabelText("رمز فعلی"), current);
    await user.type(screen.getByLabelText("رمز تازه"), next);
    await user.type(screen.getByLabelText("تکرار رمز تازه"), repeat);
    await user.click(screen.getByRole("button", { name: "ذخیره رمز تازه" }));
  }

  it("changes the password", async () => {
    const { api, user, dialog } = await openDialog();
    await fill(user, "password", "new-password");
    // Scoped to the dialog: dnd-kit also renders a role="status" live region.
    expect(await within(dialog).findByRole("status")).toHaveTextContent("رمز عبور تغییر کرد.");
    expect(api.state.users.user).toBe("new-password");
    await user.click(screen.getByRole("button", { name: "بستن" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("reports a wrong current password", async () => {
    const { api, user } = await openDialog();
    await fill(user, "wrong", "new-password");
    expect(await screen.findByRole("alert")).toHaveTextContent("رمز فعلی نادرست است.");
    expect(api.state.users.user).toBe("password");
  });

  it.each([
    ["short", "short", "دست‌کم ۸ کاراکتر"],
    ["new-password", "new-passw0rd", "یکسان نیست"],
  ])("checks the new password %s before sending", async (next, repeat, message) => {
    const { api, user } = await openDialog();
    await fill(user, "password", next, repeat);
    expect(screen.getByRole("alert")).toHaveTextContent(message);
    expect(api.calls().some((c) => c.route === "POST /api/auth/password")).toBe(false);
  });

  it("closes with Escape or Cancel", async () => {
    const { user } = await openDialog();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "تغییر رمز" }));
    await user.click(screen.getByRole("button", { name: "انصراف" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
