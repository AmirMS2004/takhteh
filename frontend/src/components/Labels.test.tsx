import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { fakeApi } from "@/test/fakeApi";
import { useBoard } from "@/lib/useBoard";
import { Board } from "./Board";

function Harness() {
  return <Board store={useBoard("board-1")} />;
}

async function setup() {
  const api = fakeApi();
  render(<Harness />);
  await screen.findByTestId("column-backlog");
  return { api, user: userEvent.setup() };
}

const dialog = () => screen.getByRole("dialog", { name: "برچسب‌های تخته" });
const card = (id: string) => screen.getByTestId(`card-${id}`);

async function giveLabels(user: ReturnType<typeof userEvent.setup>, cardTitle: string, labels: string[]) {
  await user.click(screen.getByRole("button", { name: `ویرایش ${cardTitle}` }));
  for (const name of labels) await user.click(screen.getByRole("button", { name }));
  await user.click(screen.getByRole("button", { name: "ذخیره" }));
}

describe("labels", () => {
  it("puts several labels on a card and shows them", async () => {
    const { api, user } = await setup();
    await giveLabels(user, "حالت تاریک", ["برچسب سبز", "برچسب قرمز"]);
    expect(api.state.board.cards.c2.labels).toEqual(["label-1", "label-4"]);
    expect(within(card("c2")).getByTitle("برچسب سبز")).toBeInTheDocument();
    expect(within(card("c2")).getByTitle("برچسب قرمز")).toBeInTheDocument();
  });

  it("toggles a label off again", async () => {
    const { api, user } = await setup();
    await giveLabels(user, "حالت تاریک", ["برچسب سبز", "برچسب قرمز"]);
    await giveLabels(user, "حالت تاریک", ["برچسب سبز"]);
    expect(api.state.board.cards.c2.labels).toEqual(["label-4"]);
  });

  it("names a label in the dialog and the card shows the name", async () => {
    const { api, user } = await setup();
    await giveLabels(user, "حالت تاریک", ["برچسب قرمز"]);
    await user.click(screen.getByRole("button", { name: "برچسب‌ها" }));
    await user.type(within(dialog()).getByLabelText("نام برچسب قرمز"), "فوری{Enter}");
    expect(api.state.board.labels[3]).toEqual({ id: "label-4", name: "فوری", color: "red" });
    expect(within(card("c2")).getByText("فوری")).toBeInTheDocument();
  });

  it("changes a label's color", async () => {
    const { api, user } = await setup();
    await user.click(screen.getByRole("button", { name: "برچسب‌ها" }));
    const colors = within(dialog()).getByRole("radiogroup", { name: "رنگ برچسب سبز" });
    await user.click(within(colors).getByRole("radio", { name: "بنفش" }));
    expect(api.state.board.labels[0].color).toBe("purple");
  });

  it("adds a new label and deletes one, which also removes it from cards", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const { api, user } = await setup();
    await giveLabels(user, "حالت تاریک", ["برچسب سبز"]);
    await user.click(screen.getByRole("button", { name: "برچسب‌ها" }));

    await user.click(within(dialog()).getByRole("button", { name: "+ برچسب تازه" }));
    expect(api.state.board.labels).toHaveLength(7);
    expect(await within(dialog()).findAllByRole("radiogroup")).toHaveLength(7);

    // The new label is also an unnamed green one; the first is the original.
    await user.click(within(dialog()).getAllByRole("button", { name: "حذف برچسب سبز" })[0]);
    expect(api.state.board.labels.map((l) => l.id)).not.toContain("label-1");
    expect(within(card("c2")).queryByTitle("برچسب سبز")).not.toBeInTheDocument();
  });

  it("opens label management from the card form and closes with Escape", async () => {
    const { user } = await setup();
    await user.click(screen.getByRole("button", { name: "ویرایش حالت تاریک" }));
    await user.click(screen.getByRole("button", { name: "مدیریت برچسب‌ها" }));
    expect(dialog()).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
