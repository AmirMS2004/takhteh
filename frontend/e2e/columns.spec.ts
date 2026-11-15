import { expect, test, type Locator, type Page } from "@playwright/test";
import { column, freshBoard } from "./helpers";

const columnTitles = (page: Page) => page.getByTestId(/^column-/).locator("header button[title]").allTextContents();

async function drag(page: Page, source: Locator, target: Locator) {
  const s = (await source.boundingBox())!;
  const t = (await target.boundingBox())!;
  await page.mouse.move(s.x + s.width / 2, s.y + s.height / 2);
  await page.mouse.down();
  await page.mouse.move(s.x + s.width / 2 - 10, s.y + s.height / 2, { steps: 5 });
  await page.mouse.move(t.x + t.width / 2, t.y + t.height / 2, { steps: 25 });
  await page.waitForTimeout(150);
  await page.mouse.up();
}

async function reloadAfterSave(page: Page) {
  await page.waitForLoadState("networkidle");
  await page.reload();
  await expect(page.locator("li h3").first()).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  page.on("dialog", (dialog) => dialog.accept());
  await freshBoard(page);
});

test("adds a column at the end and keeps it after reload", async ({ page }) => {
  await page.getByRole("button", { name: "+ ستون تازه" }).click();
  await page.getByLabel("نام ستون تازه").fill("آرشیو");
  await page.getByLabel("نام ستون تازه").press("Enter");
  await expect(page.getByTestId(/^column-/)).toHaveCount(6);

  await reloadAfterSave(page);
  expect(await columnTitles(page)).toEqual(["ایده‌ها", "برای انجام", "در حال انجام", "بازبینی", "انجام‌شده", "آرشیو"]);
});

test("deletes a column with its cards and keeps that after reload", async ({ page }) => {
  await column(page, "doing").getByRole("button", { name: "حذف ستون در حال انجام" }).click();
  await expect(page.getByTestId(/^column-/)).toHaveCount(4);

  await reloadAfterSave(page);
  expect(await columnTitles(page)).toEqual(["ایده‌ها", "برای انجام", "بازبینی", "انجام‌شده"]);
  await expect(page.getByText("پیاده‌سازی API کاربران")).toHaveCount(0);
  await expect(page.locator("li h3")).toHaveCount(8);
});

test("drags a column to a new place and keeps the order after reload", async ({ page }) => {
  await drag(page, page.getByRole("button", { name: "جابه‌جایی ستون بازبینی" }), column(page, "backlog"));
  const expected = ["بازبینی", "ایده‌ها", "برای انجام", "در حال انجام", "انجام‌شده"];
  await expect.poll(() => columnTitles(page)).toEqual(expected);

  await reloadAfterSave(page);
  expect(await columnTitles(page)).toEqual(expected);
  // Cards moved with their column.
  await expect(column(page, "backlog").getByText("بازنویسی متن‌های راهنما")).toBeVisible();
});
