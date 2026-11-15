export type Priority = "low" | "medium" | "high";
export type LabelColor = "red" | "orange" | "yellow" | "green" | "blue" | "purple";
/** A board-level label; cards refer to labels by id. The name may be empty (color only). */
export type BoardLabel = { id: string; name: string; color: LabelColor };
export type Card = {
  id: string;
  title: string;
  details: string;
  due_date?: string | null; // "YYYY-MM-DD"
  priority?: Priority | null;
  labels?: string[];
  assignee?: string | null; // username of a board member
};
export type Column = { id: string; title: string; cardIds: string[] };
export type Role = "owner" | "member";
export type Member = { username: string; role: Role };
/** A board in the user's board list. */
export type BoardSummary = { id: string; title: string; role: Role; owner: string };
export type BoardState = {
  id: string;
  title: string;
  role: Role; // the signed-in user's role
  members: Member[];
  columns: Column[];
  cards: Record<string, Card>;
  labels: BoardLabel[];
};

export function renameColumn(board: BoardState, columnId: string, title: string): BoardState {
  return {
    ...board,
    columns: board.columns.map((c) => (c.id === columnId ? { ...c, title } : c)),
  };
}

export function addCard(board: BoardState, columnId: string, card: Card): BoardState {
  return {
    ...board,
    cards: { ...board.cards, [card.id]: card },
    columns: board.columns.map((c) =>
      c.id === columnId ? { ...c, cardIds: [...c.cardIds, card.id] } : c,
    ),
  };
}

export function updateCard(
  board: BoardState,
  cardId: string,
  changes: Partial<Omit<Card, "id">>,
): BoardState {
  const card = board.cards[cardId];
  if (!card) return board;
  return { ...board, cards: { ...board.cards, [cardId]: { ...card, ...changes } } };
}

export function addColumn(board: BoardState, column: Column): BoardState {
  return { ...board, columns: [...board.columns, column] };
}

/** Removes the column and its cards. */
export function removeColumn(board: BoardState, columnId: string): BoardState {
  const column = board.columns.find((c) => c.id === columnId);
  if (!column) return board;
  const cards = { ...board.cards };
  for (const id of column.cardIds) delete cards[id];
  return { ...board, cards, columns: board.columns.filter((c) => c.id !== columnId) };
}

/** Moves the column to `index` among the board's columns. */
export function moveColumn(board: BoardState, columnId: string, index: number): BoardState {
  const column = board.columns.find((c) => c.id === columnId);
  if (!column) return board;
  const columns = board.columns.filter((c) => c.id !== columnId);
  columns.splice(index, 0, column);
  return { ...board, columns };
}

export function addLabel(board: BoardState, label: BoardLabel): BoardState {
  return { ...board, labels: [...board.labels, label] };
}

export function updateLabel(board: BoardState, id: string, changes: Partial<Omit<BoardLabel, "id">>): BoardState {
  return { ...board, labels: board.labels.map((l) => (l.id === id ? { ...l, ...changes } : l)) };
}

/** Removes the label from the board and from every card that had it. */
export function removeLabel(board: BoardState, id: string): BoardState {
  const cards = Object.fromEntries(
    Object.entries(board.cards).map(([key, card]) => [
      key,
      card.labels?.includes(id) ? { ...card, labels: card.labels.filter((l) => l !== id) } : card,
    ]),
  );
  return { ...board, cards, labels: board.labels.filter((l) => l.id !== id) };
}

export function deleteCard(board: BoardState, cardId: string): BoardState {
  const cards = { ...board.cards };
  delete cards[cardId];
  return {
    ...board,
    cards,
    columns: board.columns.map((c) => ({ ...c, cardIds: c.cardIds.filter((id) => id !== cardId) })),
  };
}

/** Finds the column that has the given id or contains the card with the given id. */
export function findColumn(board: BoardState, id: string): Column | undefined {
  return board.columns.find((c) => c.id === id || c.cardIds.includes(id));
}

/** Removes the card from its column and inserts it into the target column at the given index. */
export function moveCard(
  board: BoardState,
  cardId: string,
  toColumnId: string,
  toIndex: number,
): BoardState {
  const columns = board.columns.map((c) => ({
    ...c,
    cardIds: c.cardIds.filter((id) => id !== cardId),
  }));
  const target = columns.find((c) => c.id === toColumnId);
  if (!target) return board;
  target.cardIds.splice(toIndex, 0, cardId);
  return { ...board, columns };
}

export const initialBoard: BoardState = {
  id: "board-1",
  title: "تخته پروژه",
  role: "owner",
  members: [{ username: "user", role: "owner" }],
  labels: (["green", "yellow", "orange", "red", "purple", "blue"] as const).map((color, i) => ({
    id: `label-${i + 1}`,
    name: "",
    color,
  })),
  columns: [
    { id: "backlog", title: "ایده‌ها", cardIds: ["c1", "c2", "c3"] },
    { id: "todo", title: "برای انجام", cardIds: ["c4", "c5"] },
    { id: "doing", title: "در حال انجام", cardIds: ["c6", "c7"] },
    { id: "review", title: "بازبینی", cardIds: ["c8"] },
    { id: "done", title: "انجام‌شده", cardIds: ["c9", "c10"] },
  ],
  cards: {
    c1: { id: "c1", title: "پژوهش رقبا", details: "بررسی سه محصول رقیب و جمع‌بندی نقاط قوت و ضعف." },
    c2: { id: "c2", title: "حالت تاریک", details: "ارزیابی نیاز کاربران به نسخه تیره رابط کاربری." },
    c3: { id: "c3", title: "اعلان‌های ایمیلی", details: "طرح اولیه برای یادآوری کارهای عقب‌افتاده." },
    c4: { id: "c4", title: "طراحی صفحه ورود", details: "وایرفریم و نسخه نهایی در فیگما." },
    c5: { id: "c5", title: "تعریف شاخص‌ها", details: "مشخص کردن KPIهای فصل آینده با تیم محصول." },
    c6: { id: "c6", title: "پیاده‌سازی API کاربران", details: "سرویس‌های ثبت‌نام و ویرایش پروفایل." },
    c7: { id: "c7", title: "بهبود سرعت بارگذاری", details: "کاهش حجم بسته‌ها و بهینه‌سازی تصاویر." },
    c8: { id: "c8", title: "بازنویسی متن‌های راهنما", details: "یکدست کردن لحن و اصطلاحات در کل محصول." },
    c9: { id: "c9", title: "راه‌اندازی مخزن", details: "ساختار پروژه، قواعد کدنویسی و CI." },
    c10: { id: "c10", title: "جلسه شروع پروژه", details: "هم‌راستایی اهداف و زمان‌بندی با ذی‌نفعان." },
  },
};
