import { expect, test, type Locator, type Page } from "@playwright/test";
import { card, column, freshBoard } from "./helpers";
import { restartContainer } from "./container";

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

/** Reloads once the last write has reached the server. */
async function reloadAfterSave(page: Page) {
  await page.waitForLoadState("networkidle");
  await page.reload();
  await expect(page.getByTestId(/^column-/)).toHaveCount(5);
}

test.beforeEach(async ({ page }) => {
  page.on("dialog", (dialog) => dialog.accept()); // confirm card deletion
  await freshBoard(page);
});

test("loads five columns from the server with no console errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.reload();
  await expect(page.getByTestId(/^column-/)).toHaveCount(5);
  expect(await titles(column(page, "backlog"))).toEqual(["پژوهش رقبا", "حالت تاریک", "اعلان‌های ایمیلی"]);
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  expect(errors).toEqual([]);
});

test("renames a column, cancels with Escape, and keeps the name after reload", async ({ page }) => {
  const col = column(page, "doing");
  await col.getByRole("button", { name: "در حال انجام", exact: true }).click();
  await page.getByLabel("نام ستون").fill("در جریان");
  await page.keyboard.press("Enter");
  await expect(col.getByRole("button", { name: "در جریان", exact: true })).toBeVisible();

  await col.getByRole("button", { name: "در جریان", exact: true }).click();
  await page.getByLabel("نام ستون").fill("نه");
  await page.keyboard.press("Escape");
  await expect(col.getByRole("button", { name: "در جریان", exact: true })).toBeVisible();

  await reloadAfterSave(page);
  await expect(column(page, "doing").getByRole("button", { name: "در جریان", exact: true })).toBeVisible();
});

test("adds a card and deletes it, both persisted", async ({ page }) => {
  const col = column(page, "review");
  await col.getByRole("button", { name: /افزودن کارت/ }).click();
  await col.getByLabel("عنوان کارت").fill("آزمون یکپارچه");
  await col.getByLabel("جزئیات کارت").fill("ساخته‌شده با Playwright");
  await col.getByRole("button", { name: "ثبت کارت" }).click();
  await expect(col.getByText("آزمون یکپارچه")).toBeVisible();
  await expect(col.getByTestId("card-count")).toHaveText("۲");

  await reloadAfterSave(page);
  await expect(column(page, "review").getByText("ساخته‌شده با Playwright")).toBeVisible();

  const added = card(page, "آزمون یکپارچه");
  await added.hover();
  await added.getByRole("button", { name: "حذف آزمون یکپارچه" }).click();
  await expect(column(page, "review").getByText("آزمون یکپارچه")).toHaveCount(0);

  await reloadAfterSave(page);
  await expect(column(page, "review").getByText("آزمون یکپارچه")).toHaveCount(0);
  await expect(column(page, "review").getByTestId("card-count")).toHaveText("۱");
});

test("edits a card and keeps the edit after reload", async ({ page }) => {
  const target = card(page, "طراحی صفحه ورود");
  await target.hover();
  await target.getByRole("button", { name: "ویرایش طراحی صفحه ورود" }).click();
  // The form replaces the card's heading, so `target` no longer matches; use the column.
  const form = column(page, "todo");
  await form.getByLabel("ویرایش عنوان").fill("طراحی ورود و ثبت‌نام");
  await form.getByLabel("ویرایش جزئیات").fill("نسخه موبایل هم اضافه شود.");
  await form.getByRole("button", { name: "ذخیره" }).click();
  await expect(column(page, "todo").getByText("طراحی ورود و ثبت‌نام")).toBeVisible();

  await reloadAfterSave(page);
  const col = column(page, "todo");
  await expect(col.getByText("طراحی ورود و ثبت‌نام")).toBeVisible();
  await expect(col.getByText("نسخه موبایل هم اضافه شود.")).toBeVisible();
  await expect(col.getByText("طراحی صفحه ورود")).toHaveCount(0);
});

test("sets card details and keeps them after reload", async ({ page }) => {
  const target = card(page, "تعریف شاخص‌ها");
  await target.hover();
  await target.getByRole("button", { name: "ویرایش تعریف شاخص‌ها" }).click();
  const form = column(page, "todo");
  await form.getByLabel("سررسید").fill("2099-03-21");
  await form.getByLabel("اولویت").selectOption("medium");
  await form.getByLabel("مسئول").selectOption("user");
  await form.getByRole("button", { name: "برچسب بنفش" }).click();
  await form.getByRole("button", { name: "ذخیره" }).click();

  await reloadAfterSave(page);
  const saved = card(page, "تعریف شاخص‌ها");
  await expect(saved.getByText("اولویت متوسط")).toBeVisible();
  await expect(saved.getByTitle("مسئول")).toHaveText(/user/);
  await expect(saved.getByTitle("برچسب بنفش")).toBeVisible();
  await expect(saved.getByTitle("سررسید")).toContainText("فروردین");
});

test("adds a card with all its details and keeps them after reload", async ({ page }) => {
  const col = column(page, "review");
  await col.getByRole("button", { name: /افزودن کارت/ }).click();
  await col.getByLabel("عنوان کارت").fill("کارت کامل");
  await col.getByLabel("جزئیات کارت").fill("با همه جزئیات");
  await col.getByLabel("سررسید").fill("2099-03-21");
  await col.getByLabel("اولویت").selectOption("high");
  await col.getByLabel("مسئول").selectOption("user");
  await col.getByRole("button", { name: "برچسب سبز" }).click();
  await col.getByRole("button", { name: "ثبت کارت" }).click();
  await expect(card(page, "کارت کامل")).toBeVisible();

  await reloadAfterSave(page);
  const saved = card(page, "کارت کامل");
  await expect(saved.getByText("اولویت بالا")).toBeVisible();
  await expect(saved.getByTitle("مسئول")).toHaveText(/user/);
  await expect(saved.getByTitle("برچسب سبز")).toBeVisible();
  await expect(saved.getByTitle("سررسید")).toContainText("فروردین");
});

test("names a label, puts it on a card, and keeps both after reload", async ({ page }) => {
  await page.getByRole("button", { name: "برچسب‌ها", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "برچسب‌های برد" });
  await dialog.getByLabel("نام برچسب قرمز").fill("فوری");
  await dialog.getByLabel("نام برچسب قرمز").press("Enter");
  await dialog.getByRole("button", { name: "بستن" }).click();

  const target = card(page, "طراحی صفحه ورود");
  await target.hover();
  await target.getByRole("button", { name: "ویرایش طراحی صفحه ورود" }).click();
  const form = column(page, "todo");
  await form.getByRole("button", { name: "برچسب فوری" }).click();
  await form.getByRole("button", { name: "برچسب سبز" }).click();
  await form.getByRole("button", { name: "ذخیره" }).click();

  await reloadAfterSave(page);
  const saved = card(page, "طراحی صفحه ورود");
  await expect(saved.getByText("فوری")).toBeVisible();
  await expect(saved.getByTitle("برچسب سبز")).toBeVisible();
});

test("searches cards and pauses dragging while filtered", async ({ page }) => {
  await page.getByRole("searchbox", { name: "جست‌وجوی کارت‌ها" }).fill("بازنویسی");
  await expect(page.locator("li h3")).toHaveText(["بازنویسی متن‌های راهنما"]);
  await expect(page.getByRole("search")).toContainText("۱ کارت از ۱۰");

  // Dragging is paused: the card stays where it was.
  await drag(page, card(page, "بازنویسی متن‌های راهنما"), column(page, "done").locator("ul"));
  await expect(column(page, "review").getByText("بازنویسی متن‌های راهنما")).toBeVisible();

  await page.getByRole("button", { name: "پاک کردن فیلترها" }).click();
  await expect(page.locator("li h3")).toHaveCount(10);
});

test("cancels adding a card", async ({ page }) => {
  const col = column(page, "todo");
  await col.getByRole("button", { name: /افزودن کارت/ }).click();
  await col.getByLabel("عنوان کارت").fill("موقت");
  await col.getByRole("button", { name: "انصراف" }).click();
  await expect(col.getByText("موقت")).toHaveCount(0);
  await expect(col.getByRole("button", { name: /افزودن کارت/ })).toBeVisible();
});

test("drags a card to another column and keeps it there after reload", async ({ page }) => {
  await drag(page, card(page, "پژوهش رقبا"), column(page, "review").locator("li").first());
  await expect(column(page, "review").getByText("پژوهش رقبا")).toBeVisible();
  await expect(column(page, "backlog").getByText("پژوهش رقبا")).toHaveCount(0);

  await reloadAfterSave(page);
  expect(await titles(column(page, "review"))).toContain("پژوهش رقبا");
  expect(await titles(column(page, "review"))).toHaveLength(2);
  expect(await titles(column(page, "backlog"))).toEqual(["حالت تاریک", "اعلان‌های ایمیلی"]);
});

test("drags a card into an empty column and keeps it there after reload", async ({ page }) => {
  const review = column(page, "review");
  await review.locator("li").first().hover();
  await review.locator("li").getByRole("button", { name: /^حذف/ }).click();
  await expect(review.locator("li h3")).toHaveCount(0);
  await expect(review.getByText(/کارتی نیست/)).toBeVisible();
  await drag(page, card(page, "پیاده‌سازی API کاربران"), review.locator("ul"));
  expect(await titles(review)).toEqual(["پیاده‌سازی API کاربران"]);

  await reloadAfterSave(page);
  expect(await titles(column(page, "review"))).toEqual(["پیاده‌سازی API کاربران"]);
  expect(await titles(column(page, "doing"))).toEqual(["بهبود سرعت بارگذاری"]);
});

test("reorders cards within a column and keeps the order after reload", async ({ page }) => {
  await drag(page, card(page, "پژوهش رقبا"), card(page, "اعلان‌های ایمیلی"), 20);
  const expected = ["حالت تاریک", "اعلان‌های ایمیلی", "پژوهش رقبا"];
  expect(await titles(column(page, "backlog"))).toEqual(expected);

  await reloadAfterSave(page);
  expect(await titles(column(page, "backlog"))).toEqual(expected);
});

test("keeps changes after the container restarts", async ({ page }) => {
  const col = column(page, "done");
  await col.getByRole("button", { name: "انجام‌شده", exact: true }).click();
  await page.getByLabel("نام ستون").fill("تحویل‌شده");
  await page.keyboard.press("Enter");
  await page.waitForLoadState("networkidle");

  await restartContainer();
  // The session key is kept with the data, so the user stays signed in across the restart.
  await page.reload();
  await expect(column(page, "done").getByRole("button", { name: "تحویل‌شده", exact: true })).toBeVisible();
});
