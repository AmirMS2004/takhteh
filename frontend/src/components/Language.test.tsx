import { afterEach, describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describeActivity, describeChange } from "@/lib/describe";
import { LANG_KEY, makeI18n } from "@/lib/i18n";
import { fakeApi } from "@/test/fakeApi";
import Home from "@/app/page";

const html = document.documentElement;

afterEach(() => {
  html.lang = "fa";
  html.dir = "rtl";
  localStorage.clear();
});

describe("choosing the language", () => {
  it("switches the whole page to English and saves the choice to the account", async () => {
    const api = fakeApi();
    const user = userEvent.setup();
    render(<Home />);
    await screen.findByTestId("column-backlog");
    expect(html).toHaveAttribute("dir", "rtl");

    await user.click(screen.getByRole("button", { name: "EN (English)" }));
    expect(html).toHaveAttribute("dir", "ltr");
    expect(html).toHaveAttribute("lang", "en");
    expect(localStorage.getItem(LANG_KEY)).toBe("en");
    expect(screen.getByRole("heading", { name: "Takhteh" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+ New board" })).toBeInTheDocument();
    expect(within(screen.getByTestId("column-backlog")).getByTestId("card-count")).toHaveTextContent("3");
    expect(api.state.profiles.user.language).toBe("en");

    await user.click(screen.getByRole("button", { name: "فا (فارسی)" }));
    expect(html).toHaveAttribute("dir", "rtl");
    expect(screen.getByRole("heading", { name: "تخته" })).toBeInTheDocument();
    expect(within(screen.getByTestId("column-backlog")).getByTestId("card-count")).toHaveTextContent("۳");
    expect(api.state.profiles.user.language).toBe("fa");
  });

  it("opens in the account's language", async () => {
    const api = fakeApi();
    api.state.profiles.user = { language: "en" };
    render(<Home />);
    await screen.findByTestId("column-backlog");
    expect(html).toHaveAttribute("dir", "ltr");
    expect(screen.getByRole("complementary", { name: "AI assistant" })).toBeInTheDocument();
  });

  it("can be chosen on the sign-in page, and a new account starts in it", async () => {
    const api = fakeApi({ loggedIn: false });
    const user = userEvent.setup();
    render(<Home />);
    await user.click(await screen.findByRole("button", { name: "EN (English)" }));
    expect(screen.getByRole("heading", { name: "Sign in to Takhteh" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Sign up" }));
    await user.type(screen.getByLabelText("Username"), "alice");
    await user.type(screen.getByLabelText("Password"), "secret123");
    await user.type(screen.getByLabelText("Repeat password"), "secret123");
    await user.click(screen.getByRole("button", { name: "Create account" }));
    expect(await screen.findByRole("heading", { name: "Takhteh" })).toBeInTheDocument();
    expect(api.state.profiles.alice.language).toBe("en");
  });

  it("shows sign-in errors in the chosen language", async () => {
    fakeApi({ loggedIn: false });
    const user = userEvent.setup();
    render(<Home />);
    await user.click(await screen.findByRole("button", { name: "EN (English)" }));
    await user.type(screen.getByLabelText("Username"), "user");
    await user.type(screen.getByLabelText("Password"), "wrong-password");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Wrong username or password.");
  });
});

describe("server data in either language", () => {
  const fa = makeI18n("fa");
  const en = makeI18n("en");

  it("words the assistant's proposed changes", () => {
    const create = {
      type: "create_card",
      params: { title: "Docs", column: "To do", priority: "high", labels: [{ name: "", color: "red" }] },
    };
    expect(describeChange(create, en)).toBe("New card “Docs” in “To do” (High priority, red label)");
    expect(describeChange(create, fa)).toBe("کارت تازه «Docs» در «To do» (اولویت بالا، برچسب قرمز)");
    expect(describeChange({ type: "delete_column", params: { column: "Review", count: 2 } }, en)).toBe(
      "Delete the column “Review” with 2 cards",
    );
    expect(describeChange({ type: "delete_column", params: { column: "Review", count: 1 } }, en)).toBe(
      "Delete the column “Review” with 1 card",
    );
    expect(makeI18n("en").t("dash.counts", { members: 1, cards: 3, mine: 0 })).toBe("1 member · 3 cards · 0 assigned to me");
    expect(describeChange({ type: "move_card", params: { card: "A", column: "Done", top: true } }, en)).toBe(
      "Move “A” to “Done” (top of the column)",
    );
  });

  it("words history entries, and keeps older entries' Persian text", () => {
    const move = { action: "move_card", params: { card: "A", from: "To do", to: "Done" }, summary: "متن فارسی" };
    expect(describeActivity(move, en)).toBe("moved the card “A” from “To do” to “Done”");
    expect(describeActivity(move, fa)).toBe("کارت «A» را از «To do» به «Done» برد");
    const edit = { action: "update_card", params: { card: "A", fields: ["title", "priority"], title: "B" }, summary: "" };
    expect(describeActivity(edit, en)).toBe("edited the card “A”: title, priority (new title “B”)");
    expect(describeActivity({ action: "delete_column", params: { column: "X", count: 1 }, summary: "" }, fa)).toBe(
      "ستون «X» را با ۱ کارت حذف کرد",
    );
    expect(describeActivity({ action: "create_card", params: null, summary: "متن قدیمی" }, en)).toBe("متن قدیمی");
  });
});
