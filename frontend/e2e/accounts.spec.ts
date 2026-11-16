import { expect, test, type Page } from "@playwright/test";
import { login } from "./helpers";

const boardHeading = { name: "تخته", exact: true };

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

  await page.getByRole("button", { name: /داشبورد من/ }).click();
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

test("edits the profile in the dashboard and keeps it after reload", async ({ page }) => {
  const username = `e2e_${Date.now()}`;
  await signUp(page, username, "first-pass");
  await expect(page.getByRole("heading", boardHeading)).toBeVisible();

  await page.getByRole("button", { name: /داشبورد من/ }).click();
  const boards = page.getByRole("region", { name: "تخته‌های من" });
  await expect(boards.getByRole("listitem")).toHaveCount(1);
  await expect(boards.getByRole("listitem")).toContainText("مالک");

  await page.getByLabel("نام", { exact: true }).fill("کاربر آزمون");
  await page.getByLabel("ایمیل").fill("e2e@example.com");
  await page.getByLabel("نام کاربری", { exact: true }).fill(`${username}_x`);
  await page.getByRole("button", { name: "عکس ۴" }).click();
  await page.getByRole("button", { name: "ذخیره تغییرات" }).click();
  await expect(page.getByRole("status").filter({ hasText: "تغییرات ذخیره شد." })).toBeVisible();

  await page.reload();
  // The button shows the name, and so does its accessible name.
  const me = page.getByRole("button", { name: "داشبورد من: کاربر آزمون" });
  await expect(me).toContainText("کاربر آزمون");
  await me.click();
  await expect(page.getByLabel("نام کاربری", { exact: true })).toHaveValue(`${username}_x`);
  await expect(page.getByLabel("ایمیل")).toHaveValue("e2e@example.com");
  await expect(page.getByRole("button", { name: "عکس ۴" })).toHaveAttribute("aria-pressed", "true");

  await boards.getByRole("button", { name: /^باز کردن/ }).click();
  await expect(page.getByRole("heading", boardHeading)).toBeVisible();
  await expect(page.getByTestId(/^column-/)).toHaveCount(5);
});
