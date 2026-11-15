import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { fakeApi } from "@/test/fakeApi";
import Home from "./page";

const loginHeading = { name: "ورود به تخته پروژه" };
const boardHeading = { name: "تخته پروژه" };

async function fillLogin(username: string, password: string) {
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText("نام کاربری"), username);
  await user.type(screen.getByLabelText("رمز عبور"), password);
  await user.click(screen.getByRole("button", { name: "ورود" }));
  return user;
}

describe("Home", () => {
  it("shows the login form when not signed in", async () => {
    fakeApi({ loggedIn: false });
    render(<Home />);
    expect(await screen.findByRole("heading", loginHeading)).toBeInTheDocument();
    expect(screen.queryByTestId("column-backlog")).not.toBeInTheDocument();
  });

  it("shows the board directly for an existing session", async () => {
    fakeApi();
    render(<Home />);
    expect(await screen.findByRole("heading", boardHeading)).toBeInTheDocument();
    expect(await screen.findByTestId("column-backlog")).toBeInTheDocument();
  });

  it("signs in with valid credentials and loads the board", async () => {
    const api = fakeApi({ loggedIn: false });
    render(<Home />);
    await fillLogin("user", "password");
    expect(await screen.findByTestId("column-backlog")).toBeInTheDocument();
    expect(api.calls().find((c) => c.route === "POST /api/auth/login")?.body).toEqual({
      username: "user",
      password: "password",
    });
  });

  it("shows an error for wrong credentials and stays on the form", async () => {
    fakeApi({ loggedIn: false });
    render(<Home />);
    await fillLogin("user", "wrong");
    expect(await screen.findByRole("alert")).toHaveTextContent("نام کاربری یا رمز عبور نادرست است.");
    expect(screen.getByRole("button", { name: "ورود" })).toBeEnabled();
  });

  it("shows a connection error when the server fails", async () => {
    fakeApi({ loggedIn: false, overrides: { "POST /api/auth/login": { status: 500 } } });
    render(<Home />);
    await fillLogin("user", "password");
    expect(await screen.findByRole("alert")).toHaveTextContent("ارتباط با سرور برقرار نشد");
  });

  it("disables submit until both fields are filled", async () => {
    fakeApi({ loggedIn: false });
    render(<Home />);
    const user = userEvent.setup();
    const submit = await screen.findByRole("button", { name: "ورود" });
    expect(submit).toBeDisabled();
    await user.type(screen.getByLabelText("نام کاربری"), "user");
    expect(submit).toBeDisabled();
  });

  it("returns to the login form when the session expires mid-use", async () => {
    const api = fakeApi();
    render(<Home />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "برای انجام" }));
    api.state.loggedIn = false; // e.g. the session cookie is no longer valid
    await user.clear(screen.getByLabelText("نام ستون"));
    await user.type(screen.getByLabelText("نام ستون"), "اسپرینت{Enter}");
    expect(await screen.findByRole("heading", loginHeading)).toBeInTheDocument();
  });

  it("logs out and returns to the login form", async () => {
    const api = fakeApi();
    render(<Home />);
    await userEvent.setup().click(await screen.findByRole("button", { name: "خروج" }));
    expect(await screen.findByRole("heading", loginHeading)).toBeInTheDocument();
    expect(api.state.loggedIn).toBe(false);
  });
});
