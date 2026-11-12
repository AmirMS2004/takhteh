<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# فرانت‌اند

دموی برد کانبان فارسی (RTL) با Next.js 16، React 19، Tailwind 4 و dnd-kit. با `output: "export"` به‌صورت ایستا در `out/` ساخته می‌شود و FastAPI آن را از `/` ارائه می‌کند (در Docker). داده‌ها فعلاً در state حافظه نگه‌داری می‌شوند.

## فایل‌ها

- `src/app/layout.tsx` — ریشه HTML با `lang="fa" dir="rtl"` و فونت Vazirmatn.
- `src/app/page.tsx` — صفحه اصلی: با `GET /api/auth/me` وضعیت ورود را می‌خواند؛ فرم ورود یا برد (با نام کاربر و دکمه خروج) را نشان می‌دهد.
- `src/lib/api.ts` — فراخوانی‌های API (`getMe`، `login`، `logout`) و `ApiError`.
- `src/components/LoginForm.tsx` — فرم ورود با پیام خطای فارسی.
- `src/app/globals.css` — Tailwind و رنگ‌های پروژه (`accent`، `primary`، `secondary`، `navy`، `gray-text`).
- `src/lib/board.ts` — نوع‌ها (`Card`، `Column`، `BoardState`)، توابع خالص تغییر برد (`renameColumn`، `addCard`، `updateCard`، `deleteCard`، `moveCard`، `findColumn`) و داده دموی `initialBoard` با پنج ستون.
- `src/components/Board.tsx` — نگه‌داری state برد و منطق کشیدن و رها کردن (`DndContext`، تشخیص برخورد سفارشی، جابه‌جایی بین ستون‌ها در `onDragOver` و مرتب‌سازی داخل ستون در `onDragEnd`).
- `src/components/ColumnView.tsx` — یک ستون: تغییر نام درون‌خطی (Enter ذخیره، Escape لغو)، شمارنده کارت‌ها، فرم افزودن کارت.
- `src/components/CardItem.tsx` — `CardView` (ظاهر کارت، دکمه‌های ویرایش و حذف)، `CardEditForm` (ویرایش درون‌خطی) و `CardItem` (پوشش sortable؛ هنگام ویرایش، کشیدن غیرفعال است).

## آزمون‌ها

- `npm test` — Vitest با jsdom: `src/lib/board.test.ts`، `src/components/Board.test.tsx` و `src/app/page.test.tsx` (ورود و خروج با `fetch` ساختگی).
- `npm run test:e2e` — Playwright (`e2e/board.spec.ts`، `e2e/auth.spec.ts`) روی کانتینر در `http://localhost:8000`؛ ابتدا `scripts/start.*` را اجرا کن. آدرس دیگر با `BASE_URL`.
- `npm run dev` — درخواست‌های `/api` را به کانتینر روی پورت 8000 می‌فرستد (rewrite فقط در حالت توسعه).

## نکات

- `data-testid`های `column-<id>` و `card-<id>` در آزمون‌ها استفاده می‌شوند؛ حفظ شوند.
- `cacheComponents` و `partialPrefetching` با خروجی ایستا سازگار نیستند؛ اضافه نشوند.
