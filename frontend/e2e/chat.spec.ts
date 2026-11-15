import { expect, test } from "@playwright/test";
import { column, freshBoard } from "./helpers";

// The model is replaced in the browser so the test is fast and deterministic; the backend
// behaviour of /api/ai/chat is covered by the backend tests (including live ones).

const panel = (page: import("@playwright/test").Page) =>
  page.getByRole("complementary", { name: "دستیار هوش مصنوعی" });

test.beforeEach(async ({ page }) => {
  await freshBoard(page);
});

const NULLS = { card_id: null, column_id: null, title: null, details: null, index: null, due_date: null, priority: null, assignee: null, labels: null };

test("the assistant's proposal is applied on confirmation, survives reload, and can be undone", async ({ page }) => {
  const sent: unknown[] = [];
  await page.route("**/api/ai/chat/stream", async (route) => {
    const body = route.request().postDataJSON();
    sent.push(body);
    const board = await (await page.request.get(`/api/boards/${body.board_id}`)).json();
    // The NDJSON stream the backend sends: the reply in pieces, then the proposal. Applying and undoing
    // go to the real backend.
    const reply = "پیشنهاد: یک کارت در «برای انجام».";
    const operations = [{ ...NULLS, type: "create_card", column_id: board.columns[1].id, title: "کارت از دستیار", details: "ساخته در چت" }];
    const lines = [
      { type: "delta", text: reply.slice(0, 10) },
      { type: "delta", text: reply.slice(10) },
      { type: "done", reply, operations, error: null },
    ];
    await route.fulfill({
      contentType: "application/x-ndjson",
      body: lines.map((l) => JSON.stringify(l)).join("\n") + "\n",
    });
  });

  await panel(page).getByLabel("پیام به دستیار").fill("یک کارت بساز");
  await page.keyboard.press("Enter");

  const proposal = panel(page).getByRole("region", { name: "تغییرات پیشنهادی" });
  await expect(proposal).toContainText("کارت تازه «کارت از دستیار» در «برای انجام»");
  await expect(column(page, "todo").getByText("کارت از دستیار")).toHaveCount(0);
  expect(sent).toEqual([{ board_id: expect.stringMatching(/^board-/), message: "یک کارت بساز" }]);

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
  const sent: string[] = [];
  await page.route("**/api/ai/chat/stream", async (route) => {
    const body = route.request().postDataJSON();
    sent.push(body.message);
    const board = await (await page.request.get(`/api/boards/${body.board_id}`)).json();
    const backlog = board.columns[0].id;
    const operations = ["بررسی رقیب اول", "بررسی رقیب دوم"].map((title) => ({ ...NULLS, type: "create_card", column_id: backlog, title, details: "" }));
    const done = { type: "done", reply: "پیشنهاد می‌کنم این دو کارت را بسازیم.", operations, error: null };
    await route.fulfill({ contentType: "application/x-ndjson", body: JSON.stringify(done) + "\n" });
  });

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
