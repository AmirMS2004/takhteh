import { expect, type Page } from "@playwright/test";

export async function login(page: Page, username = "user", password = "password") {
  await page.goto("/");
  await page.getByLabel("نام کاربری").fill(username);
  await page.getByLabel("رمز عبور").fill(password);
  await page.getByRole("button", { name: "ورود" }).click();
}

export async function loginAndWaitForBoard(page: Page) {
  await login(page);
  await expect(page.getByRole("heading", { name: "تخته پروژه", exact: true })).toBeVisible();
}
