import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { card, column, freshBoard } from "./helpers";

/** Runs axe on the page (WCAG 2.1 A and AA) and lists any violations by rule and element. */
async function violations(page: Page) {
  const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  return result.violations.flatMap((v) =>
    v.nodes.map((n) => {
      const d = n.any[0]?.data as { fgColor?: string; bgColor?: string; contrastRatio?: number } | undefined;
      const colors = d?.fgColor ? ` (${d.fgColor} on ${d.bgColor}: ${d.contrastRatio})` : "";
      return `${v.id}: ${n.target.join(" ")}${colors} ${n.html.slice(0, 90)}`;
    }),
  );
}

for (const theme of ["light", "dark"]) {
  test(`the sign-in page has no accessibility violations (${theme})`, async ({ page }) => {
    await page.addInitScript((t) => localStorage.setItem("pm:theme", t), theme);
    await page.goto("/");
    await expect(page.getByRole("button", { name: "ورود" })).toBeVisible();
    await expect(page.locator("html")).toHaveClass(theme === "dark" ? /dark/ : /^(?!.*dark)/);
    expect.soft(await violations(page)).toEqual([]);
  });
}

for (const theme of ["light", "dark"]) {
  test(`the board, its forms and dialogs have no accessibility violations (${theme})`, async ({ page }) => {
    await page.addInitScript((t) => localStorage.setItem("pm:theme", t), theme);
    await freshBoard(page);
    await expect(page.locator("html")).toHaveClass(theme === "dark" ? /dark/ : /^(?!.*dark)/);
    expect.soft(await violations(page)).toEqual([]);

    const target = card(page, "حالت تاریک");
    await target.hover();
    await target.getByRole("button", { name: "ویرایش حالت تاریک" }).click();
    expect.soft(await violations(page)).toEqual([]);
    await page.keyboard.press("Escape");

    for (const [open, dialog] of [
      ["برچسب‌ها", /برچسب/],
      ["اعضا و تنظیمات", /تنظیمات|اعضا/],
      ["تاریخچه", "تاریخچه تخته"],
    ] as const) {
      await page.getByRole("button", { name: open, exact: true }).click();
      await expect(page.getByRole("dialog", { name: dialog })).toBeVisible();
      expect.soft(await violations(page)).toEqual([]);
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toHaveCount(0);
    }

    await page.getByRole("button", { name: /^اعلان‌ها/ }).first().click();
    expect.soft(await violations(page)).toEqual([]);
    await page.keyboard.press("Escape");

    await page.getByRole("button", { name: /داشبورد/ }).click();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect.soft(await violations(page)).toEqual([]);
  });
}

test("a card can be moved with the keyboard, with each step announced in Persian", async ({ page }) => {
  await freshBoard(page);
  const live = page.locator('[id^="DndLiveRegion"]');
  await card(page, "حالت تاریک").focus();
  await page.keyboard.press("Space");
  await expect(live).toHaveText("کارت «حالت تاریک» برداشته شد. ستون «ایده‌ها»، جای ۲ از ۳.");
  // dnd-kit measures the columns in the frames after a pick-up; a person never presses an arrow sooner.
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
  // Right to left: the next column is to the left.
  await page.keyboard.press("ArrowLeft");
  await expect(live).toContainText("ستون «برای انجام»");
  await page.keyboard.press("Space");
  await expect(live).toContainText("گذاشته شد");
  await expect(column(page, "todo").getByText("حالت تاریک")).toBeVisible();

  await page.reload();
  await expect(column(page, "todo").getByText("حالت تاریک")).toBeVisible();
});
