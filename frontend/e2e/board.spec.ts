import { expect, test, type Locator, type Page } from "@playwright/test";
import { loginAndWaitForBoard } from "./helpers";

const column = (page: Page, id: string) => page.getByTestId(`column-${id}`);
const titles = (col: Locator) => col.locator("li h3").allTextContents();

async function drag(page: Page, source: Locator, target: Locator, offsetY = 0) {
  const s = (await source.boundingBox())!;
  const t = (await target.boundingBox())!;
  await page.mouse.move(s.x + s.width / 2, s.y + s.height / 2);
  await page.mouse.down();
  await page.mouse.move(s.x + s.width / 2 + 10, s.y + s.height / 2 + 10, { steps: 5 });
  await page.mouse.move(t.x + t.width / 2, t.y + t.height / 2 + offsetY, { steps: 20 });
  await page.waitForTimeout(150);
  await page.mouse.up();
}

test.beforeEach(async ({ page }) => {
  await loginAndWaitForBoard(page);
});

test("loads five columns with dummy data and no console errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.reload();
  await expect(page.getByTestId(/^column-/)).toHaveCount(5);
  expect(await titles(column(page, "backlog"))).toEqual([
    "پژوهش رقبا",
    "حالت تاریک",
    "اعلان‌های ایمیلی",
  ]);
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  expect(errors).toEqual([]);
});

test("renames a column with Enter and cancels with Escape", async ({ page }) => {
  const col = column(page, "doing");
  await col.getByRole("button", { name: "در حال انجام" }).click();
  await page.getByLabel("نام ستون").fill("در جریان");
  await page.keyboard.press("Enter");
  await expect(col.getByRole("button", { name: "در جریان" })).toBeVisible();

  await col.getByRole("button", { name: "در جریان" }).click();
  await page.getByLabel("نام ستون").fill("نه");
  await page.keyboard.press("Escape");
  await expect(col.getByRole("button", { name: "در جریان" })).toBeVisible();
});

test("adds and deletes a card", async ({ page }) => {
  const col = column(page, "review");
  await col.getByRole("button", { name: /افزودن کارت/ }).click();
  await col.getByLabel("عنوان کارت").fill("آزمون یکپارچه");
  await col.getByLabel("جزئیات کارت").fill("ساخته‌شده با Playwright");
  await col.getByRole("button", { name: "ثبت کارت" }).click();
  await expect(col.getByText("آزمون یکپارچه")).toBeVisible();
  await expect(col.getByTestId("card-count")).toHaveText("۲");

  const card = col.locator("li", { hasText: "آزمون یکپارچه" });
  await card.hover();
  await card.getByRole("button", { name: "حذف آزمون یکپارچه" }).click();
  await expect(col.getByText("آزمون یکپارچه")).toHaveCount(0);
  await expect(col.getByTestId("card-count")).toHaveText("۱");
});

test("edits a card", async ({ page }) => {
  const col = column(page, "todo");
  const card = page.getByTestId("card-c4");
  await card.hover();
  await card.getByRole("button", { name: "ویرایش طراحی صفحه ورود" }).click();
  await card.getByLabel("ویرایش عنوان").fill("طراحی ورود و ثبت‌نام");
  await card.getByLabel("ویرایش جزئیات").fill("نسخه موبایل هم اضافه شود.");
  await card.getByRole("button", { name: "ذخیره" }).click();
  await expect(col.getByText("طراحی ورود و ثبت‌نام")).toBeVisible();
  await expect(col.getByText("نسخه موبایل هم اضافه شود.")).toBeVisible();
  await expect(col.getByText("طراحی صفحه ورود")).toHaveCount(0);
});

test("cancels adding a card", async ({ page }) => {
  const col = column(page, "todo");
  await col.getByRole("button", { name: /افزودن کارت/ }).click();
  await col.getByLabel("عنوان کارت").fill("موقت");
  await col.getByRole("button", { name: "انصراف" }).click();
  await expect(col.getByText("موقت")).toHaveCount(0);
  await expect(col.getByRole("button", { name: /افزودن کارت/ })).toBeVisible();
});

test("drags a card to another column", async ({ page }) => {
  const card = page.getByTestId("card-c1");
  await drag(page, card, column(page, "review").locator("li").first());
  await expect(column(page, "review").getByText("پژوهش رقبا")).toBeVisible();
  await expect(column(page, "backlog").getByText("پژوهش رقبا")).toHaveCount(0);
  expect(await titles(column(page, "review"))).toHaveLength(2);
});

test("drags a card into an empty column", async ({ page }) => {
  const review = column(page, "review");
  await review.locator("li").first().hover();
  await review.getByRole("button", { name: /^حذف/ }).click();
  await expect(review.locator("li")).toHaveCount(0);
  await drag(page, page.getByTestId("card-c6"), review.locator("ul"));
  expect(await titles(review)).toEqual(["پیاده‌سازی API کاربران"]);
});

test("reorders cards within a column", async ({ page }) => {
  const backlog = column(page, "backlog");
  await drag(page, page.getByTestId("card-c1"), page.getByTestId("card-c3"), 20);
  expect(await titles(backlog)).toEqual(["حالت تاریک", "اعلان‌های ایمیلی", "پژوهش رقبا"]);
});
