import hashlib
import hmac
import os
import secrets
import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path

DEFAULT_DB_PATH = Path(__file__).resolve().parent.parent / "data" / "app.db"

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS boards (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS columns (
    id INTEGER PRIMARY KEY,
    board_id INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    position INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS cards (
    id INTEGER PRIMARY KEY,
    column_id INTEGER NOT NULL REFERENCES columns(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    details TEXT NOT NULL DEFAULT '',
    position INTEGER NOT NULL,
    due_date TEXT,
    priority TEXT,
    assignee TEXT
);
CREATE INDEX IF NOT EXISTS idx_cards_column ON cards(column_id, position);
CREATE TABLE IF NOT EXISTS labels (
    id INTEGER PRIMARY KEY,
    board_id INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    name TEXT NOT NULL DEFAULT '',
    color TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS card_labels (
    card_id INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    label_id INTEGER NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
    PRIMARY KEY (card_id, label_id)
);
"""

# Card fields added after the first release; init_db adds them to older databases.
CARD_DETAIL_COLUMNS = ["due_date", "priority", "assignee"]

# Like Trello, every board starts with one unnamed label per color.
LABEL_COLORS = ["green", "yellow", "orange", "red", "purple", "blue"]

DEFAULT_COLUMNS = ["ایده‌ها", "برای انجام", "در حال انجام", "بازبینی", "انجام‌شده"]

# (column index, title, details) for the demo board.
DEMO_CARDS = [
    (0, "پژوهش رقبا", "بررسی سه محصول رقیب و جمع‌بندی نقاط قوت و ضعف."),
    (0, "حالت تاریک", "ارزیابی نیاز کاربران به نسخه تیره رابط کاربری."),
    (0, "اعلان‌های ایمیلی", "طرح اولیه برای یادآوری کارهای عقب‌افتاده."),
    (1, "طراحی صفحه ورود", "وایرفریم و نسخه نهایی در فیگما."),
    (1, "تعریف شاخص‌ها", "مشخص کردن KPIهای فصل آینده با تیم محصول."),
    (2, "پیاده‌سازی API کاربران", "سرویس‌های ثبت‌نام و ویرایش پروفایل."),
    (2, "بهبود سرعت بارگذاری", "کاهش حجم بسته‌ها و بهینه‌سازی تصاویر."),
    (3, "بازنویسی متن‌های راهنما", "یکدست کردن لحن و اصطلاحات در کل محصول."),
    (4, "راه‌اندازی مخزن", "ساختار پروژه، قواعد کدنویسی و CI."),
    (4, "جلسه شروع پروژه", "هم‌راستایی اهداف و زمان‌بندی با ذی‌نفعان."),
]


def db_path() -> Path:
    return Path(os.environ.get("DB_PATH", DEFAULT_DB_PATH))


@contextmanager
def connect() -> Iterator[sqlite3.Connection]:
    """Opens a connection, commits on success, rolls back on error, always closes."""
    conn = sqlite3.connect(db_path())
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=2**14, r=8, p=1)
    return f"scrypt${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    _, salt, digest = stored.split("$")
    actual = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=2**14, r=8, p=1)
    return hmac.compare_digest(actual.hex(), digest)


def create_user(conn: sqlite3.Connection, username: str, password: str) -> int:
    """Creates a user with a board of the five default columns."""
    user_id = conn.execute(
        "INSERT INTO users (username, password_hash) VALUES (?, ?)",
        (username, hash_password(password)),
    ).lastrowid
    board_id = conn.execute(
        "INSERT INTO boards (user_id, title) VALUES (?, ?)", (user_id, "تخته پروژه")
    ).lastrowid
    conn.executemany(
        "INSERT INTO columns (board_id, title, position) VALUES (?, ?, ?)",
        [(board_id, title, i) for i, title in enumerate(DEFAULT_COLUMNS)],
    )
    add_default_labels(conn, board_id)
    return user_id


def add_default_labels(conn: sqlite3.Connection, board_id: int) -> None:
    conn.executemany("INSERT INTO labels (board_id, color) VALUES (?, ?)", [(board_id, c) for c in LABEL_COLORS])


def _migrate(conn: sqlite3.Connection) -> None:
    """Brings databases from earlier versions up to date; does nothing on a current one."""
    existing = {row["name"] for row in conn.execute("PRAGMA table_info(cards)")}
    for name in CARD_DETAIL_COLUMNS:
        if name not in existing:
            conn.execute(f"ALTER TABLE cards ADD COLUMN {name} TEXT")
    for (board_id,) in conn.execute(
        "SELECT id FROM boards WHERE id NOT IN (SELECT board_id FROM labels)"
    ).fetchall():
        add_default_labels(conn, board_id)
    if "label" in existing:
        # One color per card became board labels: link each card to its board's label of that color.
        conn.execute(
            """INSERT OR IGNORE INTO card_labels (card_id, label_id)
               SELECT k.id, (SELECT l.id FROM labels l WHERE l.board_id = c.board_id AND l.color = k.label
                             ORDER BY l.id LIMIT 1)
               FROM cards k JOIN columns c ON c.id = k.column_id
               WHERE k.label IS NOT NULL"""
        )
        conn.execute("ALTER TABLE cards DROP COLUMN label")


def init_db() -> None:
    """Creates the database file and tables if missing, and seeds the demo user on first run."""
    db_path().parent.mkdir(parents=True, exist_ok=True)
    with connect() as conn:
        conn.executescript(SCHEMA)
        _migrate(conn)
        if conn.execute("SELECT 1 FROM users LIMIT 1").fetchone():
            return
        user_id = create_user(conn, "user", "password")
        column_ids = [
            row["id"]
            for row in conn.execute(
                "SELECT c.id FROM columns c JOIN boards b ON b.id = c.board_id"
                " WHERE b.user_id = ? ORDER BY c.position",
                (user_id,),
            )
        ]
        positions: dict[int, int] = {}
        for col, title, details in DEMO_CARDS:
            conn.execute(
                "INSERT INTO cards (column_id, title, details, position) VALUES (?, ?, ?, ?)",
                (column_ids[col], title, details, positions.get(col, 0)),
            )
            positions[col] = positions.get(col, 0) + 1
