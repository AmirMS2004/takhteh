import { expect, request, test } from "@playwright/test";
import { BASE_URL } from "./container";
import { card, column, freshBoard } from "./helpers";

test.beforeEach(async ({ page }) => {
  page.on("dialog", (dialog) => dialog.accept());
  await freshBoard(page);
});

const switcher = (page: import("@playwright/test").Page) => page.getByRole("combobox", { name: "انتخاب تخته" });

test("creates a second board, switches between boards, and keeps the choice after reload", async ({ page }) => {
  await page.getByRole("button", { name: "+ تخته تازه" }).click();
  await page.getByLabel("نام تخته").fill("بازاریابی");
  await page.getByRole("button", { name: "ساخت تخته" }).click();

  await expect(switcher(page)).toHaveValue(/board-/);
  await expect(switcher(page).locator("option:checked")).toHaveText("بازاریابی");
  await expect(page.locator("li h3")).toHaveCount(0);

  await page.reload();
  await expect(switcher(page).locator("option:checked")).toHaveText("بازاریابی");

  await switcher(page).selectOption({ label: "تخته پروژه" });
  await expect(page.locator("li h3")).toHaveCount(10);
});

test("shares the board with another user who can be the assignee", async ({ page }) => {
  // A second account, signed up in its own context so this page stays signed in.
  const other = await request.newContext({ baseURL: BASE_URL });
  const name = `e2e_${Date.now()}`;
  expect((await other.post("/api/auth/signup", { data: { username: name, password: "secret123" } })).ok()).toBe(true);

  await page.getByRole("button", { name: /اعضا و تنظیمات/ }).click();
  const dialog = page.getByRole("dialog", { name: "تنظیمات تخته" });
  await dialog.getByLabel("نام کاربری عضو تازه").fill(name);
  await dialog.getByRole("button", { name: "افزودن" }).click();
  await expect(dialog.getByText(name)).toBeVisible();
  await dialog.getByRole("button", { name: "بستن" }).click();

  const target = card(page, "طراحی صفحه ورود");
  await target.hover();
  await target.getByRole("button", { name: "ویرایش طراحی صفحه ورود" }).click();
  await column(page, "todo").getByLabel("مسئول").selectOption(name);
  await column(page, "todo").getByRole("button", { name: "ذخیره" }).click();
  await page.waitForLoadState("networkidle");

  // The other user sees the shared board and the card assigned to them.
  const boards = await (await other.get("/api/boards")).json();
  const shared = boards.find((b: { role: string }) => b.role === "member");
  const board = await (await other.get(`/api/boards/${shared.id}`)).json();
  const assigned = Object.values(board.cards).find((c) => (c as { assignee: string }).assignee === name);
  expect((assigned as { title: string }).title).toBe("طراحی صفحه ورود");
  await other.dispose();

  await page.reload();
  await expect(card(page, "طراحی صفحه ورود").getByTitle("مسئول")).toHaveText(new RegExp(name));
});
