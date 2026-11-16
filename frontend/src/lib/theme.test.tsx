import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { fakeApi } from "@/test/fakeApi";
import Home from "@/app/page";
import { THEME_KEY, themeScript } from "./headScripts";

const html = document.documentElement;

afterEach(() => {
  html.classList.remove("dark");
  localStorage.clear();
});

describe("theme", () => {
  it("switches to dark and back, and remembers the choice", async () => {
    fakeApi();
    const user = userEvent.setup();
    render(<Home />);
    const toggle = await screen.findByRole("button", { name: "تم تاریک" });
    expect(toggle).toHaveAttribute("aria-pressed", "false");

    await user.click(toggle);
    expect(html).toHaveClass("dark");
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    expect(localStorage.getItem(THEME_KEY)).toBe("dark");

    await user.click(toggle);
    expect(html).not.toHaveClass("dark");
    expect(localStorage.getItem(THEME_KEY)).toBe("light");
  });

  it.each([
    ["dark", false, true],
    ["light", true, false],
    [null, true, true], // no choice: follow the system
    [null, false, false],
  ])("the script before paint: saved %s, system dark %s -> dark %s", (saved, systemDark, dark) => {
    if (saved) localStorage.setItem(THEME_KEY, saved);
    vi.stubGlobal("matchMedia", () => ({ matches: systemDark }));
    new Function(themeScript)();
    expect(html.classList.contains("dark")).toBe(dark);
    vi.unstubAllGlobals();
  });
});
