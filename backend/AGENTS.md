# بک‌اند

FastAPI روی Python 3.13، مدیریت پکیج با `uv`.

- `app/main.py` — اپلیکیشن FastAPI؛ مسیرهای `/api/*` و در انتها mount فایل‌های استاتیک از `static/` روی `/`. صفحه‌ها با `Cache-Control: no-cache` ارسال می‌شوند تا مرورگر پس از بازسازی، نسخه قدیمی را نشان ندهد. کلید سشن از `SESSION_SECRET` یا فایل `data/session_secret` (در نبودش ساخته می‌شود) خوانده می‌شود.
- `app/db.py` — اتصال `sqlite3` (`connect()` با commit/rollback خودکار)، ساخت جدول‌ها و seed کاربر `user` و برد دمو در `init_db()` هنگام شروع، هش رمز با scrypt، و `create_user`. مسیر فایل: `data/app.db` یا متغیر `DB_PATH`. طرح در `docs/DATABASE.md`.
- `app/board_service.py` — همه خواندن و نوشتن‌های برد، محدود به کاربر؛ شناسه‌های API به شکل `col-N` و `card-N`؛ شناسه ناموجود یا متعلق به کاربر دیگر خطای `NotFound` (پاسخ 404) می‌دهد. AI در بخش نهم هم از همین ماژول استفاده می‌کند.
- `app/board.py` — مسیرهای `GET /api/board`، `PATCH /api/columns/{id}`، `POST /api/cards`، `PATCH /api/cards/{id}`، `POST /api/cards/{id}/move`، `DELETE /api/cards/{id}`. کارت‌ها جزئیات اختیاری `due_date`، `priority`، `label` و `assignee` دارند (نوع‌های مشترک `DueDate`، `Priority`، `Label`، `Assignee` که AI هم استفاده می‌کند). در `PATCH` فقط فیلدهای فرستاده‌شده تغییر می‌کنند و `null` یک فیلد اختیاری را پاک می‌کند.
- `app/auth.py` — `POST /api/auth/login`، `POST /api/auth/signup` (حساب تازه با برد خالی پنج‌ستونی و ورود خودکار؛ نام تکراری 409)، `POST /api/auth/password` (تغییر رمز با رمز فعلی؛ رمز نادرست 403)، `POST /api/auth/logout`، `GET /api/auth/me`. نام کاربری ۳ تا ۳۲ حرف انگلیسی، عدد یا `_` است و به حروف کوچک تبدیل می‌شود (ورود به بزرگی و کوچکی حروف حساس نیست)؛ رمز دست‌کم ۸ کاراکتر و dependency به نام `current_user` برای محافظت از مسیرها. سشن در کوکی امضاشده `SessionMiddleware`؛ کلید در `app/main.py` تعیین می‌شود.
- `app/ai.py` — کلاینت OpenAI روی OpenRouter با مدل رایگان `particle-ai/particle-1:free` (قابل تغییر با `OPENROUTER_MODEL`) و تابع `chat(messages, response_format=None)`؛ با `response_format`، فقط providerهایی از OpenRouter انتخاب می‌شوند که آن را پشتیبانی کنند. نبود `OPENROUTER_API_KEY` یا خطای OpenRouter خطای `AIUnavailable` (پاسخ 503) می‌دهد. مهلت هر درخواست ۶۰ ثانیه با یک تلاش مجدد.
- `app/ai_routes.py` — `POST /api/ai/chat` با بدنه `{message, history}`: برد کاربر به‌صورت JSON در پیام سیستمی، به‌همراه تاریخچه و پیام جدید، به مدل فرستاده می‌شود. مدل با خروجی ساختاریافته `{reply, operations}` پاسخ می‌دهد. عملیات (`create_card`، `update_card`، `move_card`؛ ساخت و ویرایش می‌توانند جزئیات کارت را هم تنظیم کنند و `null` یعنی بدون تغییر) با `board_service` در یک تراکنش اعمال می‌شوند. تاریخ امروز در پیام سیستمی است تا مدل تاریخ‌های نسبی را تبدیل کند؛ اگر یکی نامعتبر باشد هیچ‌کدام اعمال نمی‌شود و `error` پر می‌شود. پاسخ: `{reply, board, applied, error}`. خروجی خراب مدل خطای 502 می‌دهد.
- `static/` — خروجی ایستای Next.js که در Docker از `frontend/out` کپی می‌شود (در git نیست؛ در اجرای محلی بدون آن، `/` خطای 404 می‌دهد).
- `tests/` — آزمون‌های pytest؛ `conftest.py` پیش از import برنامه `DB_PATH` را به یک پوشه موقت می‌برد و برای هر آزمون یک پایگاه داده موقت می‌سازد و فیکسچرهای `client` و `auth_client` (واردشده) دارد.

## اجرای آزمون‌ها

اگر `uv` به‌صورت محلی نصب نیست، داخل کانتینر uv اجرا کن (از ریشه پروژه):

```bash
docker run --rm -v "$PWD/backend:/src" -w /src -e UV_PROJECT_ENVIRONMENT=/tmp/venv ghcr.io/astral-sh/uv:python3.13-bookworm-slim uv run pytest -q
```

با `uv` محلی: `cd backend && uv run pytest`. پس از تغییر وابستگی‌ها `uv lock` اجرا شود.

آزمون‌های `live` واقعاً OpenRouter را صدا می‌زنند و به‌طور پیش‌فرض اجرا نمی‌شوند. برای اجرا، `.env` را به کانتینر بده و `-m live` بزن:

```bash
docker run --rm --env-file .env -v "$PWD/backend:/src" -w /src -e UV_PROJECT_ENVIRONMENT=/tmp/venv ghcr.io/astral-sh/uv:python3.13-bookworm-slim uv run pytest -q -m live
```
