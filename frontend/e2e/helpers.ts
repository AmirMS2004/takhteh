import { expect, type Page } from "@playwright/test";

const SEED: [string, [string, string][]][] = [
  ["ایده‌ها", [
    ["پژوهش رقبا", "بررسی سه محصول رقیب و جمع‌بندی نقاط قوت و ضعف."],
    ["حالت تاریک", "ارزیابی نیاز کاربران به نسخه تیره رابط کاربری."],
    ["اعلان‌های ایمیلی", "طرح اولیه برای یادآوری کارهای عقب‌افتاده."],
  ]],
  ["برای انجام", [
    ["طراحی صفحه ورود", "وایرفریم و نسخه نهایی در فیگما."],
    ["تعریف شاخص‌ها", "مشخص کردن KPIهای فصل آینده با تیم محصول."],
  ]],
  ["در حال انجام", [
    ["پیاده‌سازی API کاربران", "سرویس‌های ثبت‌نام و ویرایش پروفایل."],
    ["بهبود سرعت بارگذاری", "کاهش حجم بسته‌ها و بهینه‌سازی تصاویر."],
  ]],
  ["بازبینی", [["بازنویسی متن‌های راهنما", "یکدست کردن لحن و اصطلاحات در کل محصول."]]],
  ["انجام‌شده", [
    ["راه‌اندازی مخزن", "ساختار پروژه، قواعد کدنویسی و CI."],
    ["جلسه شروع پروژه", "هم‌راستایی اهداف و زمان‌بندی با ذی‌نفعان."],
  ]],
];

export async function login(page: Page, username = "user", password = "password") {
  await page.goto("/");
  await page.getByLabel("نام کاربری").fill(username);
  await page.getByLabel("رمز عبور").fill(password);
  await page.getByRole("button", { name: "ورود" }).click();
}

export async function loginAndWaitForBoard(page: Page) {
  await login(page);
  await expect(page.getByRole("heading", { name: "تخته پروژه", exact: true })).toBeVisible();
  await expect(page.getByTestId(/^column-/)).toHaveCount(5);
}

/** Restores the signed-in user's board to the seed data through the normal API. */
export async function resetBoard(page: Page) {
  const api = page.request;
  const board = await (await api.get("/api/board")).json();
  for (const id of Object.keys(board.cards)) expect((await api.delete(`/api/cards/${id}`)).ok()).toBe(true);
  for (const [i, [title, cards]] of SEED.entries()) {
    const columnId = board.columns[i].id;
    expect((await api.patch(`/api/columns/${columnId}`, { data: { title } })).ok()).toBe(true);
    for (const [cardTitle, details] of cards) {
      expect((await api.post("/api/cards", { data: { column_id: columnId, title: cardTitle, details } })).ok()).toBe(true);
    }
  }
}

/** Signs in, resets the board to the seed data, and shows it. */
export async function freshBoard(page: Page) {
  await login(page);
  await expect(page.getByRole("heading", { name: "تخته پروژه", exact: true })).toBeVisible();
  await resetBoard(page);
  await page.reload();
  await expect(page.getByTestId(/^column-/)).toHaveCount(5);
}

const COLUMN_INDEX = { backlog: 0, todo: 1, doing: 2, review: 3, done: 4 } as const;

export const column = (page: Page, name: keyof typeof COLUMN_INDEX) =>
  page.getByTestId(/^column-/).nth(COLUMN_INDEX[name]);

// Cards are <li> elements, but dnd-kit gives them role="button", so match the tag, not the role.
export const card = (page: Page, title: string) =>
  page.locator("li").filter({ has: page.getByRole("heading", { name: title, exact: true }) });
