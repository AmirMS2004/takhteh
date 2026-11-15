import { expect, test } from "@playwright/test";
import { column, freshBoard } from "./helpers";

// The model is replaced in the browser so the test is fast and deterministic; the backend
// behaviour of /api/ai/chat is covered by the backend tests (including live ones).

const panel = (page: import("@playwright/test").Page) =>
  page.getByRole("complementary", { name: "دستیار هوش مصنوعی" });

test.beforeEach(async ({ page }) => {
  await freshBoard(page);
});

test("the assistant's change appears on the board and survives reload", async ({ page }) => {
  const sent: unknown[] = [];
  await page.route("**/api/ai/chat/stream", async (route) => {
    const body = route.request().postDataJSON();
    sent.push(body);
    // Do what the backend would do: apply the change, then return the new board.
    const board = await (await page.request.get(`/api/boards/${body.board_id}`)).json();
    await page.request.post("/api/cards", {
      data: { column_id: board.columns[1].id, title: "کارت از دستیار", details: "ساخته در چت" },
    });
    const after = await (await page.request.get(`/api/boards/${body.board_id}`)).json();
    // The NDJSON stream the backend sends: the reply in pieces, then the result.
    const reply = "کارت را در «برای انجام» ساختم.";
    const lines = [
      { type: "delta", text: reply.slice(0, 10) },
      { type: "delta", text: reply.slice(10) },
      { type: "done", reply, board: after, applied: 1, error: null },
    ];
    await route.fulfill({
      contentType: "application/x-ndjson",
      body: lines.map((l) => JSON.stringify(l)).join("\n") + "\n",
    });
  });

  await panel(page).getByLabel("پیام به دستیار").fill("یک کارت بساز");
  await page.keyboard.press("Enter");

  await expect(panel(page).getByText("کارت را در «برای انجام» ساختم.")).toBeVisible();
  await expect(column(page, "todo").getByText("کارت از دستیار")).toBeVisible();
  expect(sent).toEqual([{ board_id: expect.stringMatching(/^board-/), message: "یک کارت بساز", history: [] }]);

  await page.reload();
  await expect(column(page, "todo").getByText("کارت از دستیار")).toBeVisible();
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
