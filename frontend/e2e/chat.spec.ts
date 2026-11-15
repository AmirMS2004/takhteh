import { expect, test } from "@playwright/test";
import { column, freshBoard } from "./helpers";

// The model is replaced in the browser so the test is fast and deterministic; the backend
// behaviour of /api/ai/chat is covered by the backend tests (including live ones).

const panel = (page: import("@playwright/test").Page) =>
  page.getByRole("complementary", { name: "دستیار هوش مصنوعی" });

test.beforeEach(async ({ page }) => {
  await freshBoard(page);
});

type Page = import("@playwright/test").Page;

/**
 * Stands in for the model: the stream route answers with a stored-looking proposal, and applying it makes
 * the change through the real card API (the server side of proposals is covered by the backend tests).
 */
async function stubAssistant(page: Page, changes: string[], titles: string[], columnIndex: number) {
  const sent: string[] = [];
  const created: string[] = [];
  let boardId = "";
  await page.route("**/api/ai/chat/stream", async (route) => {
    const body = route.request().postDataJSON();
    sent.push(body.message);
    boardId = body.board_id;
    const reply = "پیشنهاد می‌کنم این تغییرات را بدهیم.";
    const lines = [
      { type: "delta", text: reply.slice(0, 10) },
      { type: "delta", text: reply.slice(10) },
      { type: "done", reply, message_id: "msg-e2e", proposal: { changes, status: "pending" }, error: null },
    ];
    await route.fulfill({ contentType: "application/x-ndjson", body: lines.map((l) => JSON.stringify(l)).join("\n") + "\n" });
  });
  await page.route("**/api/ai/proposals/msg-e2e/apply", async (route) => {
    const board = await (await page.request.get(`/api/boards/${boardId}`)).json();
    for (const title of titles) {
      const card = await (await page.request.post("/api/cards", { data: { column_id: board.columns[columnIndex].id, title } })).json();
      created.push(card.id);
    }
    await route.fulfill({ json: { board: await (await page.request.get(`/api/boards/${boardId}`)).json() } });
  });
  await page.route("**/api/ai/proposals/msg-e2e/undo", async (route) => {
    for (const id of created) await page.request.delete(`/api/cards/${id}`);
    await route.fulfill({ json: { board: await (await page.request.get(`/api/boards/${boardId}`)).json() } });
  });
  return sent;
}

test("the assistant's proposal is applied on confirmation and can be undone", async ({ page }) => {
  const sent = await stubAssistant(page, ["کارت تازه «کارت از دستیار» در «برای انجام»"], ["کارت از دستیار"], 1);

  await panel(page).getByLabel("پیام به دستیار").fill("یک کارت بساز");
  await page.keyboard.press("Enter");

  const proposal = panel(page).getByRole("region", { name: "تغییرات پیشنهادی" });
  await expect(proposal).toContainText("کارت تازه «کارت از دستیار» در «برای انجام»");
  await expect(column(page, "todo").getByText("کارت از دستیار")).toHaveCount(0);
  expect(sent).toEqual(["یک کارت بساز"]);

  await proposal.getByRole("button", { name: "اعمال تغییرات" }).click();
  await expect(column(page, "todo").getByText("کارت از دستیار")).toBeVisible();
  await expect(proposal.getByText("اعمال شد.")).toBeVisible();

  await proposal.getByRole("button", { name: "برگرداندن" }).click();
  await expect(proposal.getByText("برگردانده شد.")).toBeVisible();
  await expect(column(page, "todo").getByText("کارت از دستیار")).toHaveCount(0);

  await page.reload();
  await expect(column(page, "todo").locator("li h3")).toHaveCount(2);
  await expect(column(page, "todo").getByText("کارت از دستیار")).toHaveCount(0);
});

test("shows an error when the assistant is unavailable", async ({ page }) => {
  await page.route("**/api/ai/chat/stream", (route) => route.fulfill({ status: 503, json: { detail: "AI unavailable" } }));
  await panel(page).getByLabel("پیام به دستیار").fill("سلام");
  await panel(page).getByRole("button", { name: "ارسال" }).click();
  await expect(panel(page).getByText(/در دسترس نیست/)).toBeVisible();
  await expect(panel(page).getByLabel("پیام به دستیار")).toBeEnabled();
});

test("the chat panel can be hidden and shown again", async ({ page }) => {
  await expect(panel(page)).toBeVisible();
  await page.getByRole("button", { name: "بستن دستیار" }).click();
  await expect(panel(page)).toBeHidden();
  await page.getByRole("button", { name: "دستیار هوش مصنوعی" }).click();
  await expect(panel(page)).toBeVisible();
});

test("splits a card into smaller cards through the assistant", async ({ page }) => {
  const titles = ["بررسی رقیب اول", "بررسی رقیب دوم"];
  const sent = await stubAssistant(page, titles.map((t) => `کارت تازه «${t}» در «ایده‌ها»`), titles, 0);

  await page.getByRole("button", { name: "بستن دستیار" }).click();
  await column(page, "backlog").getByRole("button", { name: "تقسیم پژوهش رقبا با دستیار", exact: true }).click();
  await expect(panel(page)).toBeVisible();
  const proposal = panel(page).getByRole("region", { name: "تغییرات پیشنهادی" });
  await proposal.getByRole("button", { name: "اعمال تغییرات" }).click();

  await expect(column(page, "backlog").getByText("بررسی رقیب اول")).toBeVisible();
  await expect(column(page, "backlog").getByText("بررسی رقیب دوم")).toBeVisible();
  await expect(column(page, "backlog").getByText("پژوهش رقبا", { exact: true })).toBeVisible(); // the original stays
  expect(sent).toEqual(["کارت «پژوهش رقبا» را به چند کارت کوچک‌تر تقسیم کن."]);
});
