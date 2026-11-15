import { expect, test, type Page } from "@playwright/test";
import { card, column, freshBoard, login } from "./helpers";

// Two separate browser windows (own cookies and tabs) on the same board: a change in one shows up in the
// other without reloading it.

async function secondWindow(page: Page) {
  const other = await page.context().browser()!.newPage();
  await login(other);
  await expect(column(other, "backlog").getByText("پژوهش رقبا")).toBeVisible();
  await expect(other.getByTestId("live-status")).toHaveAttribute("data-status", "live");
  return other;
}

test.beforeEach(async ({ page }) => {
  await freshBoard(page);
  await expect(page.getByTestId("live-status")).toHaveAttribute("data-status", "live");
});

test("a card added in one window appears in the other", async ({ page }) => {
  const other = await secondWindow(page);
  await column(page, "todo").getByRole("button", { name: /افزودن کارت/ }).click();
  await column(page, "todo").getByLabel("عنوان کارت").fill("از پنجره اول");
  await column(page, "todo").getByRole("button", { name: "ثبت کارت" }).click();
  await expect(column(other, "todo").getByText("از پنجره اول")).toBeVisible();
  await other.close();
});

test("renames, moves and deletes show up live", async ({ page }) => {
  page.on("dialog", (dialog) => dialog.accept());
  const other = await secondWindow(page);

  await column(page, "backlog").getByRole("button", { name: "ایده‌ها", exact: true }).click();
  await page.keyboard.press("Control+A");
  await page.keyboard.type("صف ایده");
  await page.keyboard.press("Enter");
  await expect(column(other, "backlog").getByRole("button", { name: "صف ایده", exact: true })).toBeVisible();

  const target = card(page, "حالت تاریک");
  await target.hover();
  await target.getByRole("button", { name: "حذف حالت تاریک" }).click();
  await expect(card(other, "حالت تاریک")).toHaveCount(0);

  // A change made through the API (as another client would) also arrives.
  const board = await (await page.request.get("/api/boards")).json();
  await page.request.patch(`/api/boards/${board[0].id}`, { data: { title: "نام تازه" } });
  await expect(other.getByRole("combobox", { name: "انتخاب تخته" }).locator("option:checked")).toHaveText("نام تازه");
  await other.close();
});
