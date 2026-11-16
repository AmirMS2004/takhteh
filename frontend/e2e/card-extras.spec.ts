import { expect, test } from "@playwright/test";
import { card, column, freshBoard } from "./helpers";

test.beforeEach(async ({ page }) => {
  await freshBoard(page);
});

test("a checklist and a comment that mentions a teammate, who is notified live; both kept after reload", async ({
  page,
}) => {
  const name = `e2e_${Date.now()}`;
  const other = await page.context().browser()!.newPage();
  await other.request.post("/api/auth/signup", { data: { username: name, password: "secret123" } });
  const board = (await (await page.request.get("/api/boards")).json())[0];
  await page.request.post(`/api/boards/${board.id}/members`, { data: { username: name } });
  await page.reload();
  await other.goto("/");
  const bell = other.getByRole("button", { name: /^اعلان‌ها( \(.+\))?$/ });
  await expect(bell).toHaveAccessibleName("اعلان‌ها (۱ تازه)"); // added to the board

  await card(page, "حالت تاریک").hover();
  await card(page, "حالت تاریک").getByRole("button", { name: "باز کردن حالت تاریک" }).click();
  const dialog = page.getByRole("dialog", { name: "حالت تاریک" });
  await dialog.getByLabel("مورد تازه").fill("نظرسنجی از کاربران");
  await dialog.getByRole("button", { name: "افزودن" }).click();
  await dialog.getByRole("checkbox", { name: "نظرسنجی از کاربران" }).check();
  await expect(dialog.getByText("۱ از ۱")).toBeVisible();

  await dialog.getByRole("button", { name: `@${name}` }).click();
  await dialog.getByLabel("نظر تازه").pressSequentially("لطفاً این را ببین");
  await dialog.getByRole("button", { name: "ارسال" }).click();
  await expect(dialog.getByRole("region", { name: "نظرها" }).getByRole("listitem")).toContainText("لطفاً این را ببین");
  await expect(bell).toHaveAccessibleName("اعلان‌ها (۲ تازه)");
  await bell.click();
  await expect(other.getByRole("region", { name: "اعلان‌ها" }).getByRole("listitem").first()).toContainText(
    "user در نظری روی کارت «حالت تاریک» از شما نام برد",
  );
  await other.close();

  await page.keyboard.press("Escape");
  await page.reload();
  const saved = card(page, "حالت تاریک");
  await expect(saved.getByTitle("چک‌لیست", { exact: true })).toContainText("۱ از ۱");
  await expect(saved.getByTitle("نظرها", { exact: true })).toContainText("۱");
});

test("a card is archived and brought back from the board archive, after reload too", async ({ page }) => {
  await card(page, "حالت تاریک").hover();
  await card(page, "حالت تاریک").getByRole("button", { name: "باز کردن حالت تاریک" }).click();
  await page.getByRole("dialog", { name: "حالت تاریک" }).getByRole("button", { name: "بایگانی کارت" }).click();
  await expect(column(page, "backlog").getByText("حالت تاریک")).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId(/^column-/)).toHaveCount(5);
  await expect(column(page, "backlog").getByText("حالت تاریک")).toHaveCount(0);

  await page.getByRole("button", { name: "بایگانی", exact: true }).click();
  const archive = page.getByRole("dialog", { name: "بایگانی تخته" });
  await archive.getByRole("button", { name: "بازگرداندن حالت تاریک" }).click();
  await expect(archive.getByText("کارت بایگانی‌شده‌ای نیست.")).toBeVisible();
  await expect(column(page, "backlog").getByText("حالت تاریک")).toBeVisible();
});

test("my tasks lists cards assigned to me and opens their board", async ({ page }) => {
  const board = (await (await page.request.get("/api/boards")).json())[0];
  const full = await (await page.request.get(`/api/boards/${board.id}`)).json();
  const [first, second] = full.columns[0].cardIds;
  await page.request.patch(`/api/cards/${first}`, { data: { assignee: "user", due_date: "2000-01-01" } });
  await page.request.patch(`/api/cards/${second}`, { data: { assignee: "user" } });

  await page.getByRole("button", { name: "کارهای من" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "کارهای من" })).toBeVisible();
  const overdue = page.getByRole("region", { name: /سررسید گذشته/ });
  await expect(overdue).toContainText("پژوهش رقبا");
  await overdue.getByRole("checkbox", { name: "انجام‌شده: پژوهش رقبا" }).click();
  await expect(page.getByRole("region", { name: /سررسید گذشته/ })).toHaveCount(0);

  await page.getByRole("region", { name: /بدون سررسید/ }).getByRole("button", { name: /حالت تاریک/ }).click();
  await expect(page.getByTestId(/^column-/)).toHaveCount(5);
  // Ticked done from the list: the card on the board is done too.
  await expect(card(page, "پژوهش رقبا").getByRole("checkbox", { name: "انجام‌شده: پژوهش رقبا" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
});

test("a new board's description is sent to the assistant", async ({ page }) => {
  const sent: { board_id: string; message: string }[] = [];
  // The model is stood in for; the backend side is covered by its tests (including live ones).
  await page.route("**/api/ai/chat/stream", async (route) => {
    sent.push(route.request().postDataJSON());
    const done = { type: "done", reply: "پیشنهادم این است.", message_id: "msg-0", proposal: null, error: null };
    await route.fulfill({ status: 200, contentType: "application/x-ndjson", body: JSON.stringify(done) + "\n" });
  });
  await page.getByRole("button", { name: "+ تخته تازه" }).click();
  const dialog = page.getByRole("dialog", { name: "تخته تازه" });
  await dialog.getByLabel("نام تخته").fill("فروشگاه");
  await dialog.getByLabel("توضیح پروژه (اختیاری)").fill("فروشگاه اینترنتی لباس");
  await dialog.getByRole("button", { name: "ساخت تخته" }).click();
  await expect(page.getByRole("complementary", { name: "دستیار هوش مصنوعی" })).toContainText("پیشنهادم این است.");
  expect(sent).toHaveLength(1);
  expect(sent[0].message).toContain("فروشگاه اینترنتی لباس");
  const boards = await (await page.request.get("/api/boards")).json();
  expect(sent[0].board_id).toBe(boards.find((b: { title: string }) => b.title === "فروشگاه").id);
});
