import type { LabelColor, Priority } from "./board";
import { formatDue, labelTitle } from "./cardDetails";
import type { I18n, Key } from "./i18n";

type LabelRef = { name: string; color: LabelColor | null };
type Params = Record<string, unknown>;

const label = (ref: LabelRef, i18n: I18n) =>
  ref.color ? labelTitle({ name: ref.name, color: ref.color }, i18n) : i18n.t("label.title", { name: ref.name });

/** A label as named in history entries: its name, or its color when it has none. */
const labelName = (ref: LabelRef, { t }: I18n) => ref.name || (ref.color ? t(`color.${ref.color}` as Key) : "");

/** The card details a proposed change sets, in words. */
function detailParts(p: Params, i18n: I18n): string[] {
  const { t } = i18n;
  const parts: string[] = [];
  if (p.due_date) parts.push(t("part.due", { date: formatDue(p.due_date as string, i18n) }));
  if (p.priority) parts.push(t(`priority.${p.priority as Priority}` as Key));
  if (p.assignee) parts.push(t("part.assignee", { name: p.assignee as string }));
  if (p.labels) {
    const labels = p.labels as LabelRef[];
    parts.push(labels.length ? labels.map((l) => label(l, i18n)).join(t("common.list")) : t("part.noLabels"));
  }
  return parts;
}

/** One change the assistant proposed ({type, params} from the server), in the user's language. */
export function describeChange(item: { type: string; params: Params }, i18n: I18n): string {
  const { t } = i18n;
  const p = item.params;
  const s = (key: string) => String(p[key] ?? "");
  switch (item.type) {
    case "create_card": {
      const extra = detailParts(p, i18n);
      return t("change.create_card", { title: s("title"), column: s("column") }) + (extra.length ? ` (${extra.join(t("common.list"))})` : "");
    }
    case "update_card": {
      const parts = [
        ...(p.title !== undefined ? [t("part.title", { title: s("title") })] : []),
        ...(p.details ? [t("part.details")] : []),
        ...detailParts(p, i18n),
      ];
      return t("change.update_card", { card: s("card"), parts: parts.join(t("common.list")) });
    }
    case "move_card":
      return t("change.move_card", { card: s("card"), column: s("column") }) + (p.top ? t("change.top") : "");
    case "delete_column":
      return p.count
        ? t("change.delete_column_cards", { column: s("column"), count: Number(p.count) })
        : t("change.delete_column", { column: s("column") });
    case "move_column":
      return t("change.move_column", { column: s("column"), position: Number(p.position) });
    case "create_label":
    case "delete_label":
      return t(`change.${item.type}` as Key, { label: label(p.label as LabelRef, i18n) });
    case "update_label": {
      const parts = [
        ...(p.name !== undefined ? [t("part.name", { name: s("name") })] : []),
        ...(p.color ? [t("part.color", { color: t(`color.${p.color as LabelColor}` as Key) })] : []),
      ];
      return t("change.update_label", { label: label(p.label as LabelRef, i18n), parts: parts.join(t("common.list")) });
    }
    default:
      // delete_card, create_column, rename_column, rename_board, add_member, remove_member
      return t(`change.${item.type}` as Key, Object.fromEntries(Object.entries(p).map(([k, v]) => [k, String(v)])));
  }
}

/** A history entry's text (after the user's name), from its action and params, in the user's language. */
export function describeActivity(entry: { action: string; params: Params | null; summary: string }, i18n: I18n): string {
  const { t } = i18n;
  const p = entry.params;
  // Entries recorded before params existed only have their Persian summary.
  if (!p) return entry.summary;
  const s = (key: string) => String(p[key] ?? "");
  switch (entry.action) {
    case "update_card": {
      const fields = (p.fields as string[]).map((f) => t(`field.${f}` as Key)).join(t("common.list"));
      return t("act.update_card", { card: s("card"), fields }) + (p.title ? t("act.newTitle", { title: s("title") }) : "");
    }
    case "delete_column":
      return p.count
        ? t("act.delete_column_cards", { column: s("column"), count: Number(p.count) })
        : t("act.delete_column", { column: s("column") });
    case "create_label":
    case "update_label":
    case "delete_label":
    case "restore_label":
      return t(`act.${entry.action}` as Key, { label: labelName(p.label as LabelRef, i18n) });
    default:
      return t(`act.${entry.action}` as Key, Object.fromEntries(Object.entries(p).map(([k, v]) => [k, String(v)])));
  }
}
