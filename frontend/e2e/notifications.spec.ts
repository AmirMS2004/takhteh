import { expect, test } from "@playwright/test";
import { column, freshBoard } from "./helpers";

test("an assigned card notifies the assignee live, and the notification opens the board", async ({ page }) => {
  await freshBoard(page);
  const name = `e2e_${Date.now()}`;
  const other = await page.context().browser()!.newPage();
  // A teammate with an account, added to user's board.
  await other.request.post("/api/auth/signup", { data: { username: name, password: "secret123" } });
  const board = (await (await page.request.get("/api/boards")).json())[0];
  await page.request.post(`/api/boards/${board.id}/members`, { data: { username: name } });

  await other.goto("/"); // signing up above already signed this window in
  // Exactly the bell: "اعلان‌ها" or "اعلان‌ها (n تازه)", not the card «اعلان‌های ایمیلی».
  const bell = other.getByRole("button", { name: /^اعلان‌ها( \(.+\))?$/ });
  await expect(bell).toHaveAccessibleName("اعلان‌ها (۱ تازه)"); // added to the board

  // While the teammate is looking, user assigns them a card.
  const full = await (await page.request.get(`/api/boards/${board.id}`)).json();
  const card = full.columns[0].cardIds[0];
  await page.request.patch(`/api/cards/${card}`, { data: { assignee: name } });
  await expect(bell).toHaveAccessibleName("اعلان‌ها (۲ تازه)");

  await bell.click();
  const list = other.getByRole("region", { name: "اعلان‌ها" });
  await expect(list.getByRole("listitem").first()).toContainText("user کارت «پژوهش رقبا» را به شما سپرد");
  await list.getByRole("listitem").first().getByRole("button").click();
  await expect(other.getByRole("combobox", { name: "انتخاب تخته" }).locator("option:checked")).toContainText("تخته پروژه");
  await expect(column(other, "backlog").getByText("پژوهش رقبا")).toBeVisible();
  await other.close();
});
