export type Priority = "low" | "medium" | "high";
export type Label = "red" | "orange" | "yellow" | "green" | "blue" | "purple";
export type Card = {
  id: string;
  title: string;
  details: string;
  due_date?: string | null; // "YYYY-MM-DD"
  priority?: Priority | null;
  label?: Label | null;
  assignee?: string | null;
};
export type Column = { id: string; title: string; cardIds: string[] };
export type BoardState = { columns: Column[]; cards: Record<string, Card> };

export function renameColumn(board: BoardState, columnId: string, title: string): BoardState {
  return {
    ...board,
    columns: board.columns.map((c) => (c.id === columnId ? { ...c, title } : c)),
  };
}

export function addCard(board: BoardState, columnId: string, card: Card): BoardState {
  return {
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

export function deleteCard(board: BoardState, cardId: string): BoardState {
  const cards = { ...board.cards };
  delete cards[cardId];
  return {
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
