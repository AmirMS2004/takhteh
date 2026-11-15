import { expect, test } from "@playwright/test";
import { card, column, freshBoard } from "./helpers";

test.beforeEach(async ({ page }) => {
  page.on("dialog", (dialog) => dialog.accept());
  await freshBoard(page);
});

test("a deleted card comes back from the notice, and a deleted column from the history", async ({ page }) => {
  const target = card(page, "حالت تاریک");
  await target.hover();
  await target.getByRole("button", { name: "حذف حالت تاریک" }).click();
  await page.getByRole("status").filter({ hasText: "کارت «حالت تاریک» حذف شد." }).getByRole("button", { name: "بازگرداندن" }).click();
  await expect(card(page, "حالت تاریک")).toBeVisible();

  await column(page, "review").getByRole("button", { name: "حذف ستون بازبینی" }).click();
  await expect(page.getByTestId(/^column-/)).toHaveCount(4);
  await page.getByRole("button", { name: "تاریخچه" }).click();
  const history = page.getByRole("dialog", { name: "تاریخچه تخته" });
  await expect(history.getByRole("listitem").first()).toContainText("ستون «بازبینی» را با ۱ کارت حذف کرد");
  await expect(history).toContainText("کارت «حالت تاریک» را بازگرداند");
  await history.getByRole("button", { name: "حذف‌شده‌ها" }).click();
  await history.getByRole("button", { name: "بازگرداندن" }).first().click();
  await history.getByRole("button", { name: "بستن" }).click();

  await page.reload();
  await expect(page.getByTestId(/^column-/)).toHaveCount(5);
  await expect(column(page, "review").getByText("بازنویسی متن‌های راهنما")).toBeVisible();
  await expect(column(page, "backlog").getByText("حالت تاریک")).toBeVisible();
});
