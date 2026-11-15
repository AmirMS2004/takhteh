<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# فرانت‌اند

دموی برد کانبان فارسی (RTL) با Next.js 16، React 19، Tailwind 4 و dnd-kit. با `output: "export"` به‌صورت ایستا در `out/` ساخته می‌شود و FastAPI آن را از `/` ارائه می‌کند (در Docker). برد از API بک‌اند خوانده و هر تغییر فوراً ذخیره می‌شود.

## فایل‌ها

- `src/app/layout.tsx` — ریشه HTML با `lang="fa" dir="rtl"` و فونت Vazirmatn.
- `src/app/page.tsx` — صفحه اصلی: با `GET /api/auth/me` وضعیت ورود را می‌خواند؛ فرم ورود یا `Workspace` (برد و پنل چت کنار هم، با نام کاربر، دکمه نمایش/پنهان کردن دستیار و دکمه خروج) را نشان می‌دهد. پنل چت با ویژگی `hidden` پنهان می‌شود، نه حذف، تا گفت‌وگو باقی بماند.
- `src/components/BoardsArea.tsx` — فهرست بردها و برد باز (آخرین برد در `localStorage` با کلید `pm:board` به خاطر سپرده می‌شود؛ خواندن و نوشتن در try/catch)، نوار برد (انتخاب برد، «اعضا و تنظیمات»، «+ برد تازه»)، پنجره برد تازه، پنجره تنظیمات (تغییر نام، اعضا، حذف برد برای مالک یا خروج برای عضو) و `Workspace` (برد و چت) که با `key` برابر شناسه برد ساخته می‌شود تا هر برد store و گفت‌وگوی خودش را داشته باشد. اگر کاربر بردی نداشته باشد، حالت خالی با دکمه «ساخت اولین برد» نشان داده می‌شود.
- `src/components/Modal.tsx` — پوسته مشترک پنجره‌ها (بسته شدن با Escape و کلیک بیرون).
- `src/lib/useBoard.ts` — `useBoard(boardId)`؛ state برد: بارگذاری از سرور، `apply` (به‌روزرسانی state و یک ref هم‌زمان برای handlerهای کشیدن)، `persist` (در صورت شکست ذخیره، بازخوانی از سرور و نمایش `notice` بالای برد). برد و چت هر دو از همین store استفاده می‌کنند.
- `src/components/ChatSidebar.tsx` — پنل گفت‌وگو با هوش مصنوعی: پیشنهادهای شروع، پیام‌ها، نشانگر «در حال پاسخ…»، ارسال با Enter (Shift+Enter خط جدید). تاریخچه در state کامپوننت است و با هر پیام فقط ۲۰ پیام آخر فرستاده می‌شود (نوبت‌های ناموفق نه؛ سقف بک‌اند ۵۰ پیام است). اگر `applied > 0` باشد، برد برگشتی جایگزین برد صفحه می‌شود.
- `src/lib/api.ts` — فراخوانی‌های API (ورود و خروج، `getBoard`، `renameColumn`، `createCard`، `updateCard`، `moveCard`، `deleteCard`، `chat`) و `ApiError`. هر پاسخ 401 (جز مسیرهای `/api/auth/`) رویداد `pm:unauthorized` را می‌فرستد و صفحه به فرم ورود برمی‌گردد.
- `src/components/LoginForm.tsx` — فرم ورود و ثبت‌نام (با لینک جابه‌جایی بین دو حالت)؛ قواعد نام کاربری و رمز پیش از ارسال بررسی می‌شوند (`signupProblem`).
- `src/components/ChangePasswordDialog.tsx` — پنجره تغییر رمز که از دکمه «تغییر رمز» در سرصفحه باز می‌شود؛ با Escape، کلیک بیرون یا «انصراف» بسته می‌شود.
- `src/app/globals.css` — Tailwind و رنگ‌های پروژه (`accent`، `primary`، `secondary`، `navy`، `gray-text`).
- `src/lib/board.ts` — نوع‌ها (`Card`، `Column`، `BoardLabel`، `BoardState`)، توابع خالص تغییر برد (`renameColumn`، `addCard`، `updateCard`، `deleteCard`، `moveCard`، `findColumn`، `addLabel`، `updateLabel`، `removeLabel`) و `initialBoard` که فقط در آزمون‌ها استفاده می‌شود.
- `src/components/Board.tsx` — نمایش برد از `useBoard` (prop به نام `store`) و ذخیره هر تغییر. تغییرات ابتدا در صفحه اعمال می‌شوند و اگر ذخیره شکست بخورد، برد از سرور دوباره خوانده می‌شود. کارت جدید پس از پاسخ سرور (با شناسه سرور) اضافه می‌شود. در کشیدن و رها کردن، فقط هنگام رها کردن یک درخواست `move` با ستون و اندیس نهایی فرستاده می‌شود؛ handlerها برد را از `store.current()` می‌خوانند تا هیچ‌وقت نسخه قدیمی را نبینند، و لغو کشیدن برد را به حالت پیش از کشیدن برمی‌گرداند.
- `src/components/ColumnView.tsx` — یک ستون: دستگیره جابه‌جایی (دکمه جدا، تا کلیک روی عنوان همچنان تغییر نام بدهد)، تغییر نام درون‌خطی (Enter ذخیره، Escape لغو)، دکمه حذف ستون (با تأییدی که تعداد کارت‌ها را می‌گوید)، شمارنده کارت‌ها و فرم افزودن کارت؛ همچنین `AddColumn` (ستون تازه در انتهای برد) و `ColumnPreview` (پیش‌نمایش هنگام کشیدن). ستون با `useSortable` هم قابل جابه‌جایی است و هم مقصد رها کردن کارت‌ها. در `Board.tsx` وقتی ستونی کشیده می‌شود، برخورد فقط با ستون‌ها بررسی می‌شود و منطق کارت‌ها اجرا نمی‌شود؛ هنگام رها کردن یک درخواست `move` ستون فرستاده می‌شود.
- `src/lib/cardDetails.ts` — نام فارسی و رنگ اولویت‌ها و رنگ‌های برچسب (`LABEL_COLORS`، `colorOf`، `labelTitle`)، `today()` و `formatDue()` (نمایش سررسید با تقویم شمسی).
- `src/lib/filter.ts` — جست‌وجو و فیلتر سمت کاربر: `matches` (متن در عنوان، جزئیات، مسئول و نام برچسب‌ها؛ برچسب‌ها با «یکی از»؛ اولویت؛ سررسید گذشته / تا ۷ روز / بدون سررسید) و `normalize` (ی/ک عربی، نیم‌فاصله، حروف کوچک).
- `src/components/FilterBar.tsx` — نوار جست‌وجو و فیلتر بالای برد؛ Escape جست‌وجو را پاک می‌کند؛ تعداد «n کارت از m» و «پاک کردن فیلترها» وقتی فیلتر فعال است. در `Board.tsx` کارت‌های نامطابق پنهان می‌شوند و تا وقتی فیلتر فعال است کشیدن متوقف است (`dragDisabled`)، چون با کارت‌های پنهان، جای رها کردن به ترتیب واقعی قابل تبدیل نیست.
- `src/components/LabelsDialog.tsx` — مدیریت برچسب‌های برد (افزودن، نام، رنگ، حذف با تأیید)؛ از دکمه «برچسب‌ها» بالای برد یا «مدیریت برچسب‌ها» در فرم کارت باز می‌شود. نام با Enter یا خروج از فیلد ذخیره می‌شود.
- `src/components/CardItem.tsx` — `CardView` (ظاهر کارت: برچسب‌ها (بانام به‌صورت قرص رنگی با متن، بی‌نام به‌صورت نوار رنگ)، و تراشه‌های اولویت، سررسید (قرمز اگر گذشته باشد) و مسئول؛ دکمه‌های ویرایش و حذف؛ در صفحه لمسی همیشه دیده می‌شوند؛ حذف با تأیید `window.confirm`)، `CardEditForm` (ویرایش درون‌خطی همه فیلدها، از جمله سررسید، اولویت، مسئول (فهرست اعضای برد) و روشن/خاموش کردن برچسب‌های برد) و `CardItem` (پوشش sortable؛ هنگام ویرایش، کشیدن غیرفعال است).

## آزمون‌ها

- `npm test` — Vitest با jsdom: `src/lib/board.test.ts`، `src/components/Board.test.tsx`، `src/components/ChatSidebar.test.tsx`، `src/components/Accounts.test.tsx`، `src/components/Labels.test.tsx`، `src/components/Filter.test.tsx`، `src/components/Boards.test.tsx`، `src/components/Columns.test.tsx`، `src/lib/filter.test.ts` و `src/app/page.test.tsx`. `fakeApi` چند برد دارد (`state.boards`) و `state.board` همان `board-1` است. `src/test/fakeApi.ts` یک نسخه درون‌حافظه‌ای از بک‌اند است که `fetch` را جایگزین می‌کند؛ پاسخ دستیار با گزینه `chat` قابل تعریف است.
- `npm run test:e2e` — Playwright (`e2e/board.spec.ts`، `e2e/auth.spec.ts`، `e2e/accounts.spec.ts`، `e2e/boards.spec.ts`، `e2e/columns.spec.ts`، `e2e/chat.spec.ts`؛ در آزمون چت، `/api/ai/chat` در مرورگر جایگزین می‌شود تا به مدل واقعی وابسته نباشد). `e2e/global-setup.ts` ایمیج را می‌سازد و یک کانتینر جداگانه `pm-kanban-e2e` روی پورت 8001 بدون volume اجرا می‌کند و در پایان حذفش می‌کند، پس برد واقعی روی پورت 8000 دست نمی‌خورد. آزمون‌ها پشت‌سرهم اجرا می‌شوند و `freshBoard` در `e2e/helpers.ts` پیش از هر آزمون همه بردهای کاربر را حذف و یک برد تازه (ستون‌ها و برچسب‌های پیش‌فرض) با کارت‌های نمونه از طریق API می‌سازد. فقط Docker Desktop باید روشن باشد.
- `npm run dev` — درخواست‌های `/api` را به کانتینر روی پورت 8000 می‌فرستد (rewrite فقط در حالت توسعه).

## نکات

- سرستون سه دکمه دارد (جابه‌جایی، عنوان، حذف) که نامشان عنوان ستون را در بر دارد؛ در آزمون‌ها دکمه عنوان با `exact: true` پیدا شود.
- `data-testid`های `column-<id>` و `card-<id>` در آزمون‌ها استفاده می‌شوند؛ حفظ شوند. شناسه‌های سرور `col-N` و `card-N` هستند.
- کارت‌ها عنصر `li` هستند ولی dnd-kit به آن‌ها `role="button"` می‌دهد؛ در آزمون‌ها با تگ `li` پیدا شوند، نه با نقش listitem. ستون خالی یک `li` راهنما دارد؛ برای شمردن کارت‌ها از `li h3` استفاده شود.
- آزمون‌های e2e در viewport به عرض ۱۶۰۰ اجرا می‌شوند تا ستون‌های مبدأ و مقصد کشیدن کنار پنل چت دیده شوند.
- در Vitest، `window.confirm` پیاده‌سازی نشده است؛ آزمون‌های حذف آن را با `vi.spyOn` جایگزین می‌کنند.
- وقتی کشیدن یک کارت غیرفعال است (ویرایش یا فیلتر)، ویژگی‌های sortable روی `li` گذاشته نمی‌شوند؛ وگرنه `aria-disabled` دکمه‌های داخل کارت را هم غیرفعال نشان می‌دهد.
- `cacheComponents` و `partialPrefetching` با خروجی ایستا سازگار نیستند؛ اضافه نشوند.
