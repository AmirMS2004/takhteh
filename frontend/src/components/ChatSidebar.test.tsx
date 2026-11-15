import { describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { addCard, moveCard, type BoardState } from "@/lib/board";
import type { Operation } from "@/lib/proposal";
import { fakeApi } from "@/test/fakeApi";
import Home from "@/app/page";

const chatPanel = () => screen.getByRole("complementary", { name: "دستیار هوش مصنوعی" });
const column = (id: string) => screen.getByTestId(`column-${id}`);
const proposalBox = () => within(chatPanel()).getByRole("region", { name: "تغییرات پیشنهادی" });

const NULLS = { card_id: null, column_id: null, title: null, details: null, index: null, due_date: null, priority: null, assignee: null, labels: null };
const op = (fields: Partial<Operation> & Pick<Operation, "type">): Operation => ({ ...NULLS, ...fields });

/** The assistant proposes a new card in "todo" and moving "c1" to the top of "done". */
const proposeChanges = (_: unknown, board: BoardState) => ({
  reply: "این تغییرات را پیشنهاد می‌کنم.",
  operations: [
    op({ type: "create_card", column_id: "todo", title: "کارت هوش مصنوعی", details: "", priority: "high" }),
    op({ type: "move_card", card_id: "c1", column_id: "done", index: 0 }),
  ],
  board: moveCard(addCard(board, "todo", { id: "ai-1", title: "کارت هوش مصنوعی", details: "" }), "c1", "done", 0),
});

async function renderHome(options?: Parameters<typeof fakeApi>[0]) {
  const api = fakeApi(options);
  render(<Home />);
  await screen.findByTestId("column-backlog");
  return { api, user: userEvent.setup() };
}

async function say(user: ReturnType<typeof userEvent.setup>, text: string) {
  await user.type(within(chatPanel()).getByLabelText("پیام به دستیار"), `${text}{Enter}`);
}

describe("ChatSidebar", () => {
  it("sends a message and shows the reply", async () => {
    const { api, user } = await renderHome();
    await say(user, "سلام");
    expect(await within(chatPanel()).findByText("پاسخ به: سلام")).toBeInTheDocument();
    expect(within(chatPanel()).getByText("سلام")).toHaveAttribute("data-role", "user");
    expect(api.calls().find((c) => c.route === "POST /api/ai/chat/stream")?.body).toEqual({ board_id: "board-1", message: "سلام" });
  });

  it("shows the stored conversation when the board opens", async () => {
    const api = fakeApi();
    api.state.chats["board-1"] = [
      { role: "user", content: "دیروز پرسیدم" },
      { role: "assistant", content: "و جواب دادم" },
    ];
    render(<Home />);
    await screen.findByTestId("column-backlog");
    expect(await within(chatPanel()).findByText("دیروز پرسیدم")).toHaveAttribute("data-role", "user");
    expect(within(chatPanel()).getByText("و جواب دادم")).toHaveAttribute("data-role", "assistant");
    expect(within(chatPanel()).queryByText(/برای شروع/)).not.toBeInTheDocument();
  });

  it("keeps the conversation after the page is opened again", async () => {
    const { api, user } = await renderHome();
    await say(user, "یادت بماند");
    await within(chatPanel()).findByText("پاسخ به: یادت بماند");
    cleanup();
    render(<Home />);
    await screen.findByTestId("column-backlog");
    expect(await within(chatPanel()).findByText("پاسخ به: یادت بماند")).toBeInTheDocument();
    expect(api.state.chats["board-1"]).toHaveLength(2);
  });

  it("starts a new conversation after confirmation", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const { api, user } = await renderHome();
    expect(within(chatPanel()).queryByRole("button", { name: "گفت‌وگوی تازه" })).not.toBeInTheDocument();
    await say(user, "سلام");
    await within(chatPanel()).findByText("پاسخ به: سلام");
    await user.click(within(chatPanel()).getByRole("button", { name: "گفت‌وگوی تازه" }));
    expect(within(chatPanel()).queryByText("پاسخ به: سلام")).not.toBeInTheDocument();
    expect(within(chatPanel()).getByText(/برای شروع/)).toBeInTheDocument();
    expect(api.state.chats["board-1"]).toBeUndefined();
  });

  it("shows proposed changes in words and leaves the board as it is", async () => {
    const { api, user } = await renderHome({ chat: proposeChanges });
    await say(user, "یک کارت بساز و پژوهش رقبا را تمام کن");
    await within(chatPanel()).findByText("این تغییرات را پیشنهاد می‌کنم.");
    const items = within(proposalBox()).getAllByRole("listitem").map((li) => li.textContent);
    expect(items).toEqual([
      "کارت تازه «کارت هوش مصنوعی» در «برای انجام» (اولویت بالا)",
      "انتقال «پژوهش رقبا» به «انجام‌شده» (بالای ستون)",
    ]);
    expect(within(column("todo")).queryByText("کارت هوش مصنوعی")).not.toBeInTheDocument();
    expect(within(column("backlog")).getByText("پژوهش رقبا")).toBeInTheDocument();
    expect(api.calls().some((c) => c.route === "POST /api/ai/apply")).toBe(false);
  });

  it("applies the changes when confirmed, and undoes them", async () => {
    const { api, user } = await renderHome({ chat: proposeChanges });
    await say(user, "یک کارت بساز و پژوهش رقبا را تمام کن");
    await user.click(await within(chatPanel()).findByRole("button", { name: "اعمال تغییرات" }));

    expect(await within(column("todo")).findByText("کارت هوش مصنوعی")).toBeInTheDocument();
    expect(within(column("done")).getByText("پژوهش رقبا")).toBeInTheDocument();
    expect(within(proposalBox()).getByRole("status")).toHaveTextContent("اعمال شد.");
    const applied = api.calls().find((c) => c.route === "POST /api/ai/apply")!;
    expect(applied.body).toEqual({ board_id: "board-1", operations: proposeChanges(null, api.state.board).operations });

    await user.click(within(proposalBox()).getByRole("button", { name: "برگرداندن" }));
    expect(await within(proposalBox()).findByText("برگردانده شد.")).toBeInTheDocument();
    expect(within(column("todo")).queryByText("کارت هوش مصنوعی")).not.toBeInTheDocument();
    expect(within(column("backlog")).getByText("پژوهش رقبا")).toBeInTheDocument();
    expect(within(proposalBox()).queryByRole("button")).not.toBeInTheDocument();
  });

  it("rejects the changes without touching the board", async () => {
    const { api, user } = await renderHome({ chat: proposeChanges });
    await say(user, "یک کارت بساز");
    await user.click(await within(chatPanel()).findByRole("button", { name: "رد کردن" }));
    expect(within(proposalBox()).getByRole("status")).toHaveTextContent("رد شد.");
    expect(within(proposalBox()).queryByRole("button")).not.toBeInTheDocument();
    expect(api.calls().some((c) => c.route === "POST /api/ai/apply")).toBe(false);
    expect(within(column("todo")).queryByText("کارت هوش مصنوعی")).not.toBeInTheDocument();
  });

  it("only the latest applied change can be undone", async () => {
    const { user } = await renderHome({
      chat: (body, board) => ({
        reply: `پیشنهاد ${body.message}`,
        operations: [op({ type: "create_card", column_id: "todo", title: body.message, details: "" })],
        board: addCard(board, "todo", { id: `ai-${body.message}`, title: body.message, details: "" }),
      }),
    });
    for (const title of ["اول", "دوم"]) {
      await say(user, title);
      await within(chatPanel()).findByText(`پیشنهاد ${title}`);
      await user.click(within(chatPanel()).getByRole("button", { name: "اعمال تغییرات" }));
      await within(column("todo")).findByText(title);
    }
    expect(within(chatPanel()).getAllByRole("button", { name: "برگرداندن" })).toHaveLength(1);
    const boxes = within(chatPanel()).getAllByRole("region", { name: "تغییرات پیشنهادی" });
    expect(within(boxes[1]).getByRole("button", { name: "برگرداندن" })).toBeInTheDocument();
  });

  it("says so when the board changed and the proposal no longer fits", async () => {
    const { user } = await renderHome({
      chat: proposeChanges,
      overrides: { "POST /api/ai/apply": { status: 409 } },
    });
    await say(user, "یک کارت بساز");
    await user.click(await within(chatPanel()).findByRole("button", { name: "اعمال تغییرات" }));
    expect(await within(proposalBox()).findByRole("alert")).toHaveTextContent("تخته از زمان این پیشنهاد تغییر کرده");
    expect(within(proposalBox()).getByRole("button", { name: "اعمال تغییرات" })).toBeEnabled();
    expect(within(column("todo")).queryByText("کارت هوش مصنوعی")).not.toBeInTheDocument();
  });

  it("shows a note and no proposal when the changes do not fit the board", async () => {
    const { user } = await renderHome({
      chat: (_, board) => ({
        reply: "انجام شد.",
        operations: [op({ type: "update_card", card_id: "card-999", title: "x" })],
        board: addCard(board, "todo", { id: "ai-1", title: "نباید دیده شود", details: "" }),
        error: "Changes cannot be applied: card-999",
      }),
    });
    await say(user, "کاری کن");
    expect(await within(chatPanel()).findByText(/با تخته جور نبود/)).toBeInTheDocument();
    expect(within(chatPanel()).queryByRole("region", { name: "تغییرات پیشنهادی" })).not.toBeInTheDocument();
    expect(screen.queryByText("نباید دیده شود")).not.toBeInTheDocument();
  });

  it("shows a waiting indicator and disables input while the reply is pending", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const { api, user } = await renderHome();
    const original = api.fetchMock.getMockImplementation()!;
    api.fetchMock.mockImplementation(async (path, init) => {
      if (path === "/api/ai/chat/stream") await gate;
      return original(path, init);
    });
    await say(user, "صبر کن");
    expect(within(chatPanel()).getByRole("status")).toHaveTextContent("در حال پاسخ");
    expect(within(chatPanel()).getByLabelText("پیام به دستیار")).toBeDisabled();
    release();
    expect(await within(chatPanel()).findByText("پاسخ به: صبر کن")).toBeInTheDocument();
    expect(within(chatPanel()).queryByRole("status")).not.toBeInTheDocument();
    expect(within(chatPanel()).getByLabelText("پیام به دستیار")).toBeEnabled();
  });

  it.each([
    [503, "در دسترس نیست"],
    [502, "پاسخ دستیار نامعتبر بود"],
    [500, "ارتباط با دستیار برقرار نشد"],
  ])("shows an error for status %i and lets the user try again", async (status, text) => {
    const { api, user } = await renderHome({ overrides: { "POST /api/ai/chat/stream": { status } } });
    await say(user, "سلام");
    expect(await within(chatPanel()).findByText(new RegExp(text))).toBeInTheDocument();
    expect(within(chatPanel()).getByLabelText("پیام به دستیار")).toBeEnabled();
    expect(api.state.chats["board-1"]).toBeUndefined(); // failed turns are not stored
  });

  it("shows the reply growing while it streams", async () => {
    let push!: (line: object) => void;
    let finish!: () => void;
    const { api, user } = await renderHome();
    const original = api.fetchMock.getMockImplementation()!;
    api.fetchMock.mockImplementation(async (path, init) => {
      if (path !== "/api/ai/chat/stream") return original(path, init);
      const body = new ReadableStream({
        start(controller) {
          const encoder = new TextEncoder();
          push = (line) => controller.enqueue(encoder.encode(JSON.stringify(line) + "\n"));
          finish = () => controller.close();
        },
      });
      return new Response(body);
    });
    await say(user, "سلام");
    push({ type: "delta", text: "در حال " });
    // The first piece is already visible (Testing Library trims the trailing space).
    expect(await within(chatPanel()).findByText("در حال")).toBeInTheDocument();
    push({ type: "delta", text: "نوشتن" });
    expect(await within(chatPanel()).findByText("در حال نوشتن")).toBeInTheDocument();
    expect(within(chatPanel()).getByLabelText("پیام به دستیار")).toBeDisabled();
    push({ type: "done", reply: "در حال نوشتن", operations: [], error: null });
    finish();
    expect(await within(chatPanel()).findByText("در حال نوشتن")).toHaveAttribute("data-role", "assistant");
    expect(within(chatPanel()).getByLabelText("پیام به دستیار")).toBeEnabled();
  });

  it("shows the daily quota message when the model is rate limited mid-stream", async () => {
    const { user } = await renderHome({ chat: () => ({ reply: "شروع", failWith: 429 }) });
    await say(user, "سلام");
    expect(await within(chatPanel()).findByText(/سهمیه روزانه مدل رایگان/)).toBeInTheDocument();
  });

  it("sends a suggestion when clicked", async () => {
    const { api, user } = await renderHome();
    await user.click(within(chatPanel()).getByRole("button", { name: /کدام کارها عقب افتاده‌اند/ }));
    expect(await within(chatPanel()).findByText(/پاسخ به: کدام کارها/)).toBeInTheDocument();
    expect(api.calls().some((c) => c.route === "POST /api/ai/chat/stream")).toBe(true);
  });

  it("suggests prompts that fit the board", async () => {
    await renderHome();
    const texts = within(chatPanel())
      .getAllByRole("button")
      .map((b) => b.textContent)
      .filter((t) => t?.endsWith(".") || t?.endsWith("؟"));
    expect(texts).toEqual([
      "یک کارت برای نوشتن مستندات در ستون «برای انجام» بساز.",
      "کارت «پژوهش رقبا» را به «برای انجام» ببر.",
      "کدام کارها عقب افتاده‌اند؟",
    ]);
  });

  it("does not suggest moving cards on a board without cards", async () => {
    const api = fakeApi();
    api.state.board.columns.forEach((c) => (c.cardIds = []));
    api.state.board.cards = {};
    render(<Home />);
    await screen.findByTestId("column-backlog");
    const panel = chatPanel();
    expect(within(panel).getByRole("button", { name: "برای شروع این پروژه چند کارت پیشنهاد بده." })).toBeInTheDocument();
    expect(within(panel).queryByRole("button", { name: /را به .* ببر/ })).not.toBeInTheDocument();
    expect(within(panel).queryByRole("button", { name: /پژوهش رقبا/ })).not.toBeInTheDocument();
  });

  it("asks for a weekly report", async () => {
    const { api, user } = await renderHome();
    await user.click(within(chatPanel()).getByRole("button", { name: "گزارش هفتگی" }));
    expect(await within(chatPanel()).findByText("پاسخ به: گزارش هفتگی این تخته را بنویس.")).toBeInTheDocument();
    const sent = api.calls().find((c) => c.route === "POST /api/ai/chat/stream")!;
    expect(sent.body).toEqual({ board_id: "board-1", message: "گزارش هفتگی این تخته را بنویس." });
  });

  it("asks the assistant to split a card, opening the chat if it was closed", async () => {
    const { api, user } = await renderHome();
    await user.click(screen.getByRole("button", { name: "بستن دستیار" }));
    expect(screen.queryByRole("complementary", { name: "دستیار هوش مصنوعی" })).not.toBeInTheDocument();

    await user.click(within(column("backlog")).getByRole("button", { name: "تقسیم پژوهش رقبا با دستیار" }));
    expect(chatPanel()).toBeVisible();
    expect(await within(chatPanel()).findByText("پاسخ به: کارت «پژوهش رقبا» را به چند کارت کوچک‌تر تقسیم کن.")).toBeInTheDocument();
    const sent = api.calls().find((c) => c.route === "POST /api/ai/chat/stream")!;
    expect(sent.body.message).toBe("کارت «پژوهش رقبا» را به چند کارت کوچک‌تر تقسیم کن.");
  });

  it("does not send empty messages; Shift+Enter adds a new line", async () => {
    const { api, user } = await renderHome();
    const input = within(chatPanel()).getByLabelText("پیام به دستیار");
    await user.type(input, "   {Enter}");
    expect(within(chatPanel()).getByRole("button", { name: "ارسال" })).toBeDisabled();
    await user.clear(input);
    await user.type(input, "خط اول{Shift>}{Enter}{/Shift}خط دوم");
    expect(input).toHaveValue("خط اول\nخط دوم");
    expect(api.calls().some((c) => c.route === "POST /api/ai/chat/stream")).toBe(false);
  });

  it("hides and shows the panel without losing the conversation", async () => {
    const { user } = await renderHome();
    await say(user, "یادت بماند");
    await within(chatPanel()).findByText("پاسخ به: یادت بماند");
    await user.click(screen.getByRole("button", { name: "بستن دستیار" }));
    expect(screen.queryByRole("complementary", { name: "دستیار هوش مصنوعی" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "دستیار هوش مصنوعی" }));
    expect(within(chatPanel()).getByText("پاسخ به: یادت بماند")).toBeInTheDocument();
  });
});
