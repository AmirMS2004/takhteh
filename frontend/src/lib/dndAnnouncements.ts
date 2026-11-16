import type { Announcements, ScreenReaderInstructions } from "@dnd-kit/core";
import type { BoardState } from "./board";
import type { I18n } from "./i18n";

type Id = string | number;

/** What screen readers hear while a card or column is dragged with the keyboard, in the user's language. */
export function dndAccessibility(
  board: () => BoardState,
  { t }: I18n,
): { announcements: Announcements; screenReaderInstructions: ScreenReaderInstructions } {
  const columnOf = (b: BoardState, cardId: string) => b.columns.find((c) => c.cardIds.includes(cardId));

  /** The card's title and where it would land if dropped on `over` (a card, or a column for its end). */
  function cardPlace(cardId: string, over: Id) {
    const b = board();
    const overId = String(over);
    const card = b.cards[cardId]?.title ?? "";
    const column = b.columns.find((c) => c.id === overId) ?? columnOf(b, overId);
    if (!column) return null;
    const inColumn = column.cardIds.includes(cardId);
    const count = column.cardIds.length + (inColumn ? 0 : 1);
    const pos = column.id === overId ? (inColumn ? column.cardIds.indexOf(cardId) + 1 : count) : column.cardIds.indexOf(overId) + 1;
    return { card, column: column.title, pos, count };
  }

  function columnPlace(columnId: string, over: Id) {
    const columns = board().columns;
    const index = columns.findIndex((c) => c.id === String(over));
    const column = columns.find((c) => c.id === columnId);
    if (!column || index < 0) return null;
    return { column: column.title, pos: index + 1, count: columns.length };
  }

  const isColumn = (id: Id) => board().columns.some((c) => c.id === String(id));
  const name = (id: Id) =>
    isColumn(id) ? board().columns.find((c) => c.id === String(id))!.title : (board().cards[String(id)]?.title ?? "");

  /** The sentence for a card or column at `over`, or the "not over a place" one. */
  function where(kind: "pick" | "over" | "drop", id: Id, over: Id | undefined) {
    if (over === undefined) return kind === "drop" ? t("dnd.stayed", { name: name(id) }) : t("dnd.outside", { name: name(id) });
    if (isColumn(id)) {
      const place = columnPlace(String(id), over);
      return place ? t(`dnd.${kind}Column`, place) : t("dnd.outside", { name: name(id) });
    }
    const place = cardPlace(String(id), over);
    return place ? t(`dnd.${kind}Card`, place) : t("dnd.outside", { name: name(id) });
  }

  return {
    screenReaderInstructions: { draggable: t("dnd.instructions") },
    announcements: {
      onDragStart: ({ active }) => where("pick", active.id, active.id),
      // Over itself: nothing new to say (just picked up, or the card already moved there and was announced).
      onDragOver: ({ active, over }) => (over?.id === active.id ? undefined : where("over", active.id, over?.id)),
      onDragEnd: ({ active, over }) => where("drop", active.id, over?.id),
      onDragCancel: ({ active }) =>
        isColumn(active.id)
          ? t("dnd.cancelColumn", { column: name(active.id) })
          : t("dnd.cancelCard", { card: name(active.id) }),
    },
  };
}
