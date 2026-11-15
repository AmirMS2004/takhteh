import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { fakeApi } from "@/test/fakeApi";
import { useBoard } from "@/lib/useBoard";
import { Board } from "./Board";

function Harness() {
  return <Board store={useBoard()} />;
}

async function setup(prepare?: (api: ReturnType<typeof fakeApi>) => void) {
  const api = fakeApi();
  prepare?.(api);
  render(<Harness />);
  await screen.findByTestId("column-backlog");
  return { api, user: userEvent.setup() };
}

const titles = () => screen.queryAllByRole("heading", { level: 3 }).map((h) => h.textContent);
const search = () => screen.getByRole("searchbox", { name: "جست‌وجوی کارت‌ها" });

describe("search and filters", () => {
  it("search hides cards that do not match and shows a count", async () => {
    const { user } = await setup();
    expect(titles()).toHaveLength(10);
    await user.type(search(), "اعلانها"); // without the half-space
    expect(titles()).toEqual(["اعلان‌های ایمیلی"]);
    expect(screen.getByRole("search")).toHaveTextContent("۱ کارت از ۱۰");
    expect(within(screen.getByTestId("column-todo")).getByText("کارتی با این فیلتر نیست.")).toBeInTheDocument();
  });

  it("Escape and the clear button reset the filters", async () => {
    const { user } = await setup();
    await user.type(search(), "پروفایل{Escape}");
    expect(titles()).toHaveLength(10);
    await user.selectOptions(screen.getByLabelText("فیلتر اولویت"), "high");
    expect(titles()).toHaveLength(0);
    await user.click(screen.getByRole("button", { name: "پاک کردن فیلترها" }));
    expect(titles()).toHaveLength(10);
    expect(screen.getByLabelText("فیلتر اولویت")).toHaveValue("");
  });

  it("filters by label, priority and due date", async () => {
    const { user } = await setup((api) => {
      Object.assign(api.state.board.cards.c1, { labels: ["label-4"], priority: "high", due_date: "2000-01-01" });
      Object.assign(api.state.board.cards.c5, { labels: ["label-1"], priority: "low", due_date: "2099-01-01" });
    });
    await user.click(screen.getByRole("button", { name: "فیلتر برچسب قرمز" }));
    expect(titles()).toEqual(["پژوهش رقبا"]);
    await user.click(screen.getByRole("button", { name: "فیلتر برچسب سبز" }));
    expect(titles()).toEqual(["پژوهش رقبا", "تعریف شاخص‌ها"]);

    await user.selectOptions(screen.getByLabelText("فیلتر اولویت"), "low");
    expect(titles()).toEqual(["تعریف شاخص‌ها"]);

    await user.click(screen.getByRole("button", { name: "پاک کردن فیلترها" }));
    await user.selectOptions(screen.getByLabelText("فیلتر سررسید"), "overdue");
    expect(titles()).toEqual(["پژوهش رقبا"]);
    await user.selectOptions(screen.getByLabelText("فیلتر سررسید"), "none");
    expect(titles()).toHaveLength(8);
  });

  it("pauses dragging while filtering but still allows editing", async () => {
    const { api, user } = await setup();
    const card = () => screen.getByTestId("card-c2");
    expect(card()).toHaveAttribute("aria-roledescription", "sortable");

    await user.type(search(), "تاریک");
    expect(card()).not.toHaveAttribute("aria-roledescription");
    expect(screen.getByText(/کارت‌ها جابه‌جا نمی‌شوند/)).toBeInTheDocument();

    await user.click(within(card()).getByRole("button", { name: "ویرایش حالت تاریک" }));
    const title = screen.getByLabelText("ویرایش عنوان");
    await user.clear(title);
    await user.type(title, "تم تیره");
    await user.click(screen.getByRole("button", { name: "ذخیره" }));
    expect(api.state.board.cards.c2.title).toBe("تم تیره");

    await user.clear(search());
    expect(card()).toHaveAttribute("aria-roledescription", "sortable");
  });
});
