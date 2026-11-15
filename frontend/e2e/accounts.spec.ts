import { expect, test, type Page } from "@playwright/test";
import { login } from "./helpers";

const boardHeading = { name: "تخته پروژه", exact: true };

async function signUp(page: Page, username: string, password: string) {
  await page.goto("/");
  await page.getByRole("button", { name: "ثبت‌نام کنید" }).click();
  await page.getByLabel("نام کاربری").fill(username);
  await page.getByLabel("رمز عبور", { exact: true }).fill(password);
  await page.getByLabel("تکرار رمز عبور").fill(password);
  await page.getByRole("button", { name: "ساخت حساب" }).click();
}

test("signs up, changes the password, and signs in with the new one", async ({ page }) => {
  const username = `e2e_${Date.now()}`;
  await signUp(page, username, "first-pass");

  // A new account gets five empty columns, not the demo cards.
  await expect(page.getByRole("heading", boardHeading)).toBeVisible();
  await expect(page.getByTestId(/^column-/)).toHaveCount(5);
  await expect(page.locator("li h3")).toHaveCount(0);

  await page.getByRole("button", { name: "تغییر رمز" }).click();
  const dialog = page.getByRole("dialog", { name: "تغییر رمز عبور" });
  await dialog.getByLabel("رمز فعلی").fill("first-pass");
  await dialog.getByLabel("رمز تازه", { exact: true }).fill("second-pass");
  await dialog.getByLabel("تکرار رمز تازه").fill("second-pass");
  await dialog.getByRole("button", { name: "ذخیره رمز تازه" }).click();
  await expect(dialog.getByText("رمز عبور تغییر کرد.")).toBeVisible();
  await dialog.getByRole("button", { name: "بستن" }).click();

  await page.getByRole("button", { name: "خروج" }).click();
  await login(page, username, "first-pass");
  await expect(page.getByRole("alert").filter({ hasText: "نادرست" })).toBeVisible();
  await login(page, username.toUpperCase(), "second-pass"); // usernames ignore case
  await expect(page.getByRole("heading", boardHeading)).toBeVisible();
});

test("does not allow a username that is taken", async ({ page }) => {
  await signUp(page, "USER", "some-password");
  await expect(page.getByRole("alert").filter({ hasText: "قبلاً ثبت شده" })).toBeVisible();
});
