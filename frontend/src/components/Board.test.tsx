import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Board } from "./Board";

const column = (id: string) => screen.getByTestId(`column-${id}`);

describe("Board", () => {
  it("renders five columns with dummy cards", () => {
    render(<Board />);
    expect(screen.getAllByTestId(/^column-/)).toHaveLength(5);
    expect(within(column("backlog")).getByText("پژوهش رقبا")).toBeInTheDocument();
  });

  it("renames a column on Enter and ignores empty names", async () => {
    const user = userEvent.setup();
    render(<Board />);
    await user.click(within(column("todo")).getByRole("button", { name: "برای انجام" }));
    const input = screen.getByLabelText("نام ستون");
    await user.clear(input);
    await user.type(input, "اسپرینت{Enter}");
    expect(within(column("todo")).getByRole("button", { name: "اسپرینت" })).toBeInTheDocument();

    await user.click(within(column("todo")).getByRole("button", { name: "اسپرینت" }));
    await user.clear(screen.getByLabelText("نام ستون"));
    await user.keyboard("{Enter}");
    expect(within(column("todo")).getByRole("button", { name: "اسپرینت" })).toBeInTheDocument();
  });

  it("cancels rename on Escape", async () => {
    const user = userEvent.setup();
    render(<Board />);
    await user.click(within(column("done")).getByRole("button", { name: "انجام‌شده" }));
    await user.type(screen.getByLabelText("نام ستون"), "xyz{Escape}");
    expect(within(column("done")).getByRole("button", { name: "انجام‌شده" })).toBeInTheDocument();
  });

  it("adds a card with title and details", async () => {
    const user = userEvent.setup();
    render(<Board />);
    const col = column("review");
    await user.click(within(col).getByRole("button", { name: /افزودن کارت/ }));
    const submit = within(col).getByRole("button", { name: "ثبت کارت" });
    expect(submit).toBeDisabled();
    await user.type(within(col).getByLabelText("عنوان کارت"), "کارت تازه");
    await user.type(within(col).getByLabelText("جزئیات کارت"), "توضیح");
    await user.click(submit);
    expect(within(col).getByText("کارت تازه")).toBeInTheDocument();
    expect(within(col).getByText("توضیح")).toBeInTheDocument();
    expect(within(col).getByTestId("card-count")).toHaveTextContent("۲");
  });

  it("deletes a card", async () => {
    const user = userEvent.setup();
    render(<Board />);
    await user.click(screen.getByRole("button", { name: "حذف پژوهش رقبا" }));
    expect(screen.queryByText("پژوهش رقبا")).not.toBeInTheDocument();
  });

  it("edits a card title and details", async () => {
    const user = userEvent.setup();
    render(<Board />);
    await user.click(screen.getByRole("button", { name: "ویرایش حالت تاریک" }));
    const title = screen.getByLabelText("ویرایش عنوان");
    await user.clear(title);
    await user.type(title, "تم تیره");
    const details = screen.getByLabelText("ویرایش جزئیات");
    await user.clear(details);
    await user.type(details, "جزئیات تازه");
    await user.click(screen.getByRole("button", { name: "ذخیره" }));
    const col = column("backlog");
    expect(within(col).getByText("تم تیره")).toBeInTheDocument();
    expect(within(col).getByText("جزئیات تازه")).toBeInTheDocument();
    expect(screen.queryByText("حالت تاریک")).not.toBeInTheDocument();
  });

  it("cancels editing on Escape and keeps the original card", async () => {
    const user = userEvent.setup();
    render(<Board />);
    await user.click(screen.getByRole("button", { name: "ویرایش حالت تاریک" }));
    await user.type(screen.getByLabelText("ویرایش عنوان"), "xyz{Escape}");
    expect(screen.queryByLabelText("ویرایش عنوان")).not.toBeInTheDocument();
    expect(screen.getByText("حالت تاریک")).toBeInTheDocument();
  });

  it("does not save an empty title", async () => {
    const user = userEvent.setup();
    render(<Board />);
    await user.click(screen.getByRole("button", { name: "ویرایش حالت تاریک" }));
    await user.clear(screen.getByLabelText("ویرایش عنوان"));
    expect(screen.getByRole("button", { name: "ذخیره" })).toBeDisabled();
  });
});
