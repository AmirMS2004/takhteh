# بک‌اند

FastAPI روی Python 3.13، مدیریت پکیج با `uv`.

- `app/main.py` — اپلیکیشن FastAPI؛ مسیرهای `/api/*` و در انتها mount فایل‌های استاتیک از `static/` روی `/`.
- `app/db.py` — اتصال `sqlite3` (`connect()` با commit/rollback خودکار)، ساخت جدول‌ها و seed کاربر `user` و برد دمو در `init_db()` هنگام شروع، هش رمز با scrypt، و `create_user`. مسیر فایل: `data/app.db` یا متغیر `DB_PATH`. طرح در `docs/DATABASE.md`.
- `app/board_service.py` — همه خواندن و نوشتن‌های برد، محدود به کاربر؛ شناسه‌های API به شکل `col-N` و `card-N`؛ شناسه ناموجود یا متعلق به کاربر دیگر خطای `NotFound` (پاسخ 404) می‌دهد. AI در بخش نهم هم از همین ماژول استفاده می‌کند.
- `app/board.py` — مسیرهای `GET /api/board`، `PATCH /api/columns/{id}`، `POST /api/cards`، `PATCH /api/cards/{id}`، `POST /api/cards/{id}/move`، `DELETE /api/cards/{id}`.
- `app/auth.py` — `POST /api/auth/login`، `POST /api/auth/logout`، `GET /api/auth/me` و dependency به نام `current_user` برای محافظت از مسیرها. سشن در کوکی امضاشده `SessionMiddleware`؛ کلید از `SESSION_SECRET` (در نبودش تصادفی و با هر راه‌اندازی مجدد، کاربران خارج می‌شوند).
- `static/` — خروجی ایستای Next.js که در Docker از `frontend/out` کپی می‌شود (در git نیست؛ در اجرای محلی بدون آن، `/` خطای 404 می‌دهد).
- `tests/` — آزمون‌های pytest؛ `conftest.py` برای هر آزمون یک پایگاه داده موقت می‌سازد و فیکسچرهای `client` و `auth_client` (واردشده) دارد.

## اجرای آزمون‌ها

اگر `uv` به‌صورت محلی نصب نیست، داخل کانتینر uv اجرا کن (از ریشه پروژه):

```bash
docker run --rm -v "$PWD/backend:/src" -w /src -e UV_PROJECT_ENVIRONMENT=/tmp/venv ghcr.io/astral-sh/uv:python3.13-bookworm-slim uv run pytest -q
```

با `uv` محلی: `cd backend && uv run pytest`. پس از تغییر وابستگی‌ها `uv lock` اجرا شود.
