import { describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { addCard, moveCard } from "@/lib/board";
import { fakeApi } from "@/test/fakeApi";
import Home from "@/app/page";

const chatPanel = () => screen.getByRole("complementary", { name: "دستیار هوش مصنوعی" });
const column = (id: string) => screen.getByTestId(`column-${id}`);

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

  it("updates the board when the assistant changes it", async () => {
    const { user } = await renderHome({
      chat: (_, board) => ({
        reply: "ساختم و جابه‌جا کردم.",
        board: moveCard(addCard(board, "todo", { id: "ai-1", title: "کارت هوش مصنوعی", details: "" }), "c1", "done", 0),
      }),
    });
    await say(user, "یک کارت بساز و پژوهش رقبا را تمام کن");
    expect(await within(column("todo")).findByText("کارت هوش مصنوعی")).toBeInTheDocument();
    expect(within(column("done")).getByText("پژوهش رقبا")).toBeInTheDocument();
    expect(within(column("backlog")).queryByText("پژوهش رقبا")).not.toBeInTheDocument();
  });

  it("keeps the board and shows a note when the changes were rejected", async () => {
    const { user } = await renderHome({
      chat: (_, board) => ({
        reply: "انجام شد.",
        board: addCard(board, "todo", { id: "ai-1", title: "نباید دیده شود", details: "" }),
        error: "Changes were not applied: card-999",
      }),
    });
    await say(user, "کاری کن");
    expect(await within(chatPanel()).findByText(/تغییرات اعمال نشد/)).toBeInTheDocument();
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
    push({ type: "done", reply: "در حال نوشتن", board: api.state.board, applied: 0, error: null });
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
    await user.click(within(chatPanel()).getByRole("button", { name: /چه کارهایی در حال انجام است/ }));
    expect(await within(chatPanel()).findByText(/پاسخ به: چه کارهایی/)).toBeInTheDocument();
    expect(api.calls().some((c) => c.route === "POST /api/ai/chat/stream")).toBe(true);
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
