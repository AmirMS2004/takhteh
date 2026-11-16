import { expect, test } from "@playwright/test";
import { column, freshBoard } from "./helpers";

test.beforeEach(async ({ page }) => {
  await freshBoard(page);
});

// The language is saved to the account, so every test leaves it as the others expect it.
test.afterEach(async ({ page }) => {
  await page.request.patch("/api/auth/profile", { data: { language: "fa" } });
});

test("switches to English, keeps it after reload, and back to Persian", async ({ page }) => {
  await page.getByRole("button", { name: "English" }).click();
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  await expect(page.getByRole("heading", { name: "Takhteh", exact: true })).toBeVisible();
  await expect(column(page, "todo").getByRole("button", { name: /Add a card/ })).toBeVisible();
  // The board's own data (column titles, cards) stays as the users wrote it.
  await expect(column(page, "todo").getByText("طراحی صفحه ورود")).toBeVisible();

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  expect((await (await page.request.get("/api/auth/me")).json()).language).toBe("en");

  await page.getByRole("button", { name: "فارسی" }).click();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByRole("heading", { name: "تخته", exact: true })).toBeVisible();
});

test("history entries follow the chosen language", async ({ page }) => {
  page.on("dialog", (dialog) => dialog.accept());
  await column(page, "review").getByRole("button", { name: "حذف ستون بازبینی" }).click();
  await page.getByRole("button", { name: "English" }).click();
  await page.getByRole("button", { name: "History" }).click();
  const history = page.getByRole("dialog", { name: "Board history" });
  await expect(history.getByRole("listitem").first()).toContainText("deleted the column “بازبینی” with 1 card");
});
