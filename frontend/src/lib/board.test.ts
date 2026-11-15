import { describe, expect, it } from "vitest";
import {
  addCard,
  deleteCard,
  findColumn,
  initialBoard,
  moveCard,
  addLabel,
  removeLabel,
  renameColumn,
  updateCard,
  updateLabel,
  type BoardState,
} from "./board";

const board: BoardState = {
  columns: [
    { id: "a", title: "A", cardIds: ["1", "2", "3"] },
    { id: "b", title: "B", cardIds: ["4"] },
    { id: "c", title: "C", cardIds: [] },
  ],
  cards: {
    "1": { id: "1", title: "one", details: "" },
    "2": { id: "2", title: "two", details: "" },
    "3": { id: "3", title: "three", details: "" },
    "4": { id: "4", title: "four", details: "", labels: ["l1", "l2"] },
  },
  labels: [
    { id: "l1", name: "باگ", color: "red" },
    { id: "l2", name: "", color: "green" },
  ],
};

const ids = (b: BoardState) => b.columns.map((c) => c.cardIds);

describe("initialBoard", () => {
  it("has exactly five columns and every card id resolves to a card", () => {
    expect(initialBoard.columns).toHaveLength(5);
    for (const col of initialBoard.columns) {
      expect(col.cardIds.length).toBeGreaterThan(0);
      for (const id of col.cardIds) expect(initialBoard.cards[id]).toBeDefined();
    }
  });
});

describe("renameColumn", () => {
  it("renames only the target column without mutating input", () => {
    const next = renameColumn(board, "b", "New");
    expect(next.columns.map((c) => c.title)).toEqual(["A", "New", "C"]);
    expect(board.columns[1].title).toBe("B");
  });
});

describe("addCard", () => {
  it("appends the card to the target column", () => {
    const next = addCard(board, "c", { id: "5", title: "five", details: "d" });
    expect(next.columns[2].cardIds).toEqual(["5"]);
    expect(next.cards["5"]).toEqual({ id: "5", title: "five", details: "d" });
    expect(board.cards["5"]).toBeUndefined();
  });
});

describe("updateCard", () => {
  it("changes only the given fields without mutating input", () => {
    const next = updateCard(board, "2", { title: "TWO" });
    expect(next.cards["2"]).toEqual({ id: "2", title: "TWO", details: "" });
    expect(next.columns).toBe(board.columns);
    expect(board.cards["2"].title).toBe("two");
  });

  it("returns the same board for an unknown card", () => {
    expect(updateCard(board, "missing", { title: "x" })).toBe(board);
  });
});

describe("deleteCard", () => {
  it("removes the card from its column and the card map", () => {
    const next = deleteCard(board, "2");
    expect(ids(next)).toEqual([["1", "3"], ["4"], []]);
    expect(next.cards["2"]).toBeUndefined();
    expect(board.cards["2"]).toBeDefined();
  });
});

describe("findColumn", () => {
  it("finds by column id or by contained card id", () => {
    expect(findColumn(board, "b")?.id).toBe("b");
    expect(findColumn(board, "3")?.id).toBe("a");
    expect(findColumn(board, "missing")).toBeUndefined();
  });
});

describe("moveCard", () => {
  it("reorders downward within a column", () => {
    expect(ids(moveCard(board, "1", "a", 2))[0]).toEqual(["2", "3", "1"]);
  });

  it("reorders upward within a column", () => {
    expect(ids(moveCard(board, "3", "a", 0))[0]).toEqual(["3", "1", "2"]);
  });

  it("moves between columns at a given index", () => {
    expect(ids(moveCard(board, "2", "b", 0))).toEqual([["1", "3"], ["2", "4"], []]);
  });

  it("moves into an empty column", () => {
    expect(ids(moveCard(board, "4", "c", 0))).toEqual([["1", "2", "3"], [], ["4"]]);
  });

  it("returns the same board for an unknown column", () => {
    expect(moveCard(board, "1", "zzz", 0)).toBe(board);
  });

  it("does not mutate the input", () => {
    moveCard(board, "1", "b", 1);
    expect(ids(board)).toEqual([["1", "2", "3"], ["4"], []]);
  });
});

describe("labels", () => {
  it("adding or deleting a card keeps the board labels", () => {
    expect(addCard(board, "a", { id: "9", title: "x", details: "" }).labels).toBe(board.labels);
    expect(deleteCard(board, "1").labels).toBe(board.labels);
  });

  it("adds and updates a label", () => {
    const added = addLabel(board, { id: "l3", name: "طراحی", color: "blue" });
    expect(added.labels.map((l) => l.id)).toEqual(["l1", "l2", "l3"]);
    const renamed = updateLabel(added, "l1", { name: "خطا" });
    expect(renamed.labels[0]).toEqual({ id: "l1", name: "خطا", color: "red" });
    expect(board.labels[0].name).toBe("باگ");
  });

  it("removing a label also takes it off every card", () => {
    const next = removeLabel(board, "l1");
    expect(next.labels.map((l) => l.id)).toEqual(["l2"]);
    expect(next.cards["4"].labels).toEqual(["l2"]);
    expect(next.cards["1"]).toBe(board.cards["1"]);
  });
});
