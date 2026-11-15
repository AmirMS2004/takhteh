import type { BoardState, Priority } from "./board";
import { PRIORITIES, formatDue, labelTitle } from "./cardDetails";

/** A change the assistant proposes, as the backend returns it (unused fields are null). */
export type Operation = {
  type: "create_card" | "update_card" | "move_card";
  card_id: string | null;
  column_id: string | null;
  title: string | null;
  details: string | null;
  index: number | null;
  due_date: string | null;
  priority: Priority | null;
  assignee: string | null;
  labels: string[] | null;
};

/** What an applied proposal replaced; sent back as is to undo it. */
export type Undo = Record<string, unknown>;

/** The detail fields an operation sets, in words. */
function detailParts(op: Operation, board: BoardState) {
  const parts: string[] = [];
  if (op.due_date) parts.push(`سررسید ${formatDue(op.due_date)}`);
  if (op.priority) parts.push(PRIORITIES.find((p) => p.value === op.priority)!.name);
  if (op.assignee) parts.push(`مسئول ${op.assignee}`);
  if (op.labels) {
    const names = op.labels.map((id) => {
      const label = board.labels.find((l) => l.id === id);
      return label ? labelTitle(label) : id;
    });
    parts.push(names.length ? names.join("، ") : "بدون برچسب");
  }
  return parts;
}

/** One proposed change in Persian, using the names on the board. */
export function describe(op: Operation, board: BoardState): string {
  const column = (id: string | null) => `«${board.columns.find((c) => c.id === id)?.title ?? id}»`;
  const card = (id: string | null) => `«${(id && board.cards[id]?.title) || id}»`;
  if (op.type === "create_card") {
    const extra = detailParts(op, board);
    return `کارت تازه «${op.title}» در ${column(op.column_id)}${extra.length ? ` (${extra.join("، ")})` : ""}`;
  }
  if (op.type === "move_card")
    return `انتقال ${card(op.card_id)} به ${column(op.column_id)}${op.index === 0 ? " (بالای ستون)" : ""}`;
  const parts = [
    ...(op.title !== null ? [`عنوان «${op.title}»`] : []),
    ...(op.details !== null ? ["توضیحات تازه"] : []),
    ...detailParts(op, board),
  ];
  return `ویرایش ${card(op.card_id)}: ${parts.join("، ")}`;
}
