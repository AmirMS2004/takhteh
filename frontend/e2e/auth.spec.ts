import { expect, test } from "@playwright/test";
import { login, loginAndWaitForBoard } from "./helpers";

const loginHeading = { name: "ورود به تخته" };

test("shows the login form before the board", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", loginHeading)).toBeVisible();
  await expect(page.getByTestId(/^column-/)).toHaveCount(0);
});

test("rejects wrong credentials", async ({ page }) => {
  await login(page, "user", "wrong");
  // Filter by text: Next.js also renders an empty role="alert" route announcer.
  await expect(page.getByRole("alert").filter({ hasText: "نام کاربری یا رمز عبور نادرست است." })).toBeVisible();
  await expect(page.getByTestId(/^column-/)).toHaveCount(0);
});

test("signs in, stays signed in after reload, and signs out", async ({ page }) => {
  await loginAndWaitForBoard(page);
  await expect(page.getByTestId(/^column-/)).toHaveCount(5);

  await page.reload();
  await expect(page.getByRole("heading", { name: "تخته", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "خروج" }).click();
  await expect(page.getByRole("heading", loginHeading)).toBeVisible();

  await page.reload();
  await expect(page.getByRole("heading", loginHeading)).toBeVisible();
});

test("protects the session API", async ({ request }) => {
  expect((await request.get("/api/auth/me")).status()).toBe(401);
});
