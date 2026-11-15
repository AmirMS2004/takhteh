"""Board reads and writes. Access is by board membership; owners also manage the board and its members.
Shared by the REST routes and the AI. `board_id`, where accepted, pins an operation to one board (the AI
chat uses it so the model cannot reach the user's other boards)."""

import hashlib
import json
import sqlite3

from app import db
from app import changes as change_context
from app.changes import touch


class NotFound(Exception):
    pass


class Forbidden(Exception):
    pass


class Conflict(Exception):
    pass


def board_key(board_id: int) -> str:
    return f"board-{board_id}"


def column_key(column_id: int) -> str:
    return f"col-{column_id}"


def card_key(card_id: int) -> str:
    return f"card-{card_id}"


def label_key(label_id: int) -> str:
    return f"label-{label_id}"


def parse_key(key: str, prefix: str) -> int:
    """Turns "col-3" into 3; anything malformed is treated as not found."""
    head, _, tail = key.partition("-")
    if head != prefix or not tail.isdigit():
        raise NotFound(key)
    return int(tail)


# --- access ---


def _role(conn: sqlite3.Connection, user_id: int, board_id: int) -> str:
    """The user's role on the board; non-members get NotFound so boards they cannot see do not exist."""
    row = conn.execute(
        "SELECT role FROM board_members WHERE board_id = ? AND user_id = ?", (board_id, user_id)
    ).fetchone()
    if not row:
        raise NotFound(board_key(board_id))
    return row["role"]


def member_board(conn: sqlite3.Connection, user_id: int, key: str) -> int:
    board_id = parse_key(key, "board")
    _role(conn, user_id, board_id)
    return board_id


def _owner_board(conn: sqlite3.Connection, user_id: int, key: str) -> int:
    board_id = parse_key(key, "board")
    if _role(conn, user_id, board_id) != "owner":
        raise Forbidden("only the board owner can do this")
    return board_id


def _check(conn: sqlite3.Connection, user_id: int, key: str, found_board: int | None, board_id: int | None) -> int:
    if found_board is None or (board_id is not None and found_board != board_id):
        raise NotFound(key)
    _role(conn, user_id, found_board)
    return found_board


def _column(conn: sqlite3.Connection, user_id: int, key: str, board_id: int | None = None) -> tuple[int, int]:
    """(column id, its board id) for a column the user can access."""
    column_id = parse_key(key, "col")
    row = conn.execute("SELECT board_id FROM columns WHERE id = ?", (column_id,)).fetchone()
    return column_id, _check(conn, user_id, key, row and row["board_id"], board_id)


def _card(conn: sqlite3.Connection, user_id: int, key: str, board_id: int | None = None) -> tuple[sqlite3.Row, int]:
    card_id = parse_key(key, "card")
    row = conn.execute(
        "SELECT k.*, c.board_id FROM cards k JOIN columns c ON c.id = k.column_id WHERE k.id = ?", (card_id,)
    ).fetchone()
    return row, _check(conn, user_id, key, row and row["board_id"], board_id)


def _label(conn: sqlite3.Connection, user_id: int, key: str, board_id: int | None = None) -> int:
    label_id = parse_key(key, "label")
    row = conn.execute("SELECT board_id FROM labels WHERE id = ?", (label_id,)).fetchone()
    _check(conn, user_id, key, row and row["board_id"], board_id)
    return label_id


# --- activity log ---

FIELD_NAMES = {
    "title": "عنوان",
    "details": "توضیحات",
    "due_date": "سررسید",
    "priority": "اولویت",
    "assignee": "مسئول",
    "labels": "برچسب‌ها",
}
FA_DIGITS = str.maketrans("0123456789", "۰۱۲۳۴۵۶۷۸۹")
COLOR_NAMES = {"red": "قرمز", "orange": "نارنجی", "yellow": "زرد", "green": "سبز", "blue": "آبی", "purple": "بنفش"}


def log(
    conn: sqlite3.Connection,
    user_id: int,
    board_id: int,
    action: str,
    summary: str,
    card_id: int | None = None,
    data: dict | None = None,
) -> int:
    """Records a change in the board's activity log; `data` keeps what a deletion removed, for restoring."""
    return conn.execute(
        "INSERT INTO activity (board_id, user_id, action, summary, card_id, via, data) VALUES (?, ?, ?, ?, ?, ?, ?)",
        (
            board_id,
            user_id,
            action,
            summary,
            card_id,
            change_context.via(),
            json.dumps(data, ensure_ascii=False) if data is not None else None,
        ),
    ).lastrowid


def _column_title(conn: sqlite3.Connection, column_id: int) -> str:
    return conn.execute("SELECT title FROM columns WHERE id = ?", (column_id,)).fetchone()["title"]


def _label_name(row: sqlite3.Row | dict) -> str:
    return row["name"] or COLOR_NAMES.get(row["color"], row["color"])


def _username(conn: sqlite3.Connection, user_id: int) -> str:
    return conn.execute("SELECT username FROM users WHERE id = ?", (user_id,)).fetchone()["username"]


def _card_rows(conn: sqlite3.Connection, where: str, args: tuple) -> dict:
    """Card rows and their label links, as kept in the log for restoring."""
    cards = [dict(r) for r in conn.execute(f"SELECT * FROM cards WHERE {where} ORDER BY position", args)]
    ids = [c["id"] for c in cards]
    links = [
        dict(r)
        for r in conn.execute(
            f"SELECT * FROM card_labels WHERE card_id IN ({', '.join('?' * len(ids))})", tuple(ids)
        )
    ] if ids else []
    return {"cards": cards, "card_labels": links}


# --- cards ---


def _card_ids(conn: sqlite3.Connection, column_id: int) -> list[int]:
    rows = conn.execute("SELECT id FROM cards WHERE column_id = ? ORDER BY position", (column_id,))
    return [row["id"] for row in rows]


def _write_order(conn: sqlite3.Connection, column_id: int, card_ids: list[int]) -> None:
    conn.executemany(
        "UPDATE cards SET column_id = ?, position = ? WHERE id = ?",
        [(column_id, i, card_id) for i, card_id in enumerate(card_ids)],
    )


# Card columns an update may change; the API and the AI validate their values. "labels" (label keys) and
# "assignee" (a member's username) are handled separately.
EDITABLE = ("title", "details", "due_date", "priority")

CARD_SELECT = "SELECT k.*, u.username AS assignee FROM cards k LEFT JOIN users u ON u.id = k.assignee_id"


def _card_dict(row: sqlite3.Row, labels: list[int]) -> dict:
    return (
        {"id": card_key(row["id"])}
        | {field: row[field] for field in EDITABLE}
        | {"assignee": row["assignee"], "labels": [label_key(i) for i in labels]}
    )


def _load_card(conn: sqlite3.Connection, card_id: int) -> dict:
    row = conn.execute(f"{CARD_SELECT} WHERE k.id = ?", (card_id,)).fetchone()
    labels = conn.execute("SELECT label_id FROM card_labels WHERE card_id = ? ORDER BY label_id", (card_id,))
    return _card_dict(row, [r[0] for r in labels])


def _set_labels(conn: sqlite3.Connection, user_id: int, board_id: int, card_id: int, keys: list[str]) -> None:
    """Labels must come from the card's own board."""
    label_ids = {_label(conn, user_id, key, board_id) for key in keys}
    conn.execute("DELETE FROM card_labels WHERE card_id = ?", (card_id,))
    conn.executemany("INSERT INTO card_labels (card_id, label_id) VALUES (?, ?)", [(card_id, i) for i in label_ids])


def _assignee_id(conn: sqlite3.Connection, board_id: int, username: str | None) -> int | None:
    """None clears the assignee; otherwise the username must be a member of the board."""
    if username is None:
        return None
    row = conn.execute(
        "SELECT u.id FROM users u JOIN board_members m ON m.user_id = u.id WHERE m.board_id = ? AND u.username = ?",
        (board_id, username.strip().lower()),
    ).fetchone()
    if not row:
        raise NotFound(f"member {username}")
    return row["id"]


def _write_card(conn: sqlite3.Connection, user_id: int, board_id: int, card_id: int, changes: dict) -> None:
    columns = {k: v for k, v in changes.items() if k in EDITABLE}
    if "assignee" in changes:
        columns["assignee_id"] = _assignee_id(conn, board_id, changes["assignee"])
    if columns:
        assignments = ", ".join(f"{k} = ?" for k in columns)
        conn.execute(f"UPDATE cards SET {assignments} WHERE id = ?", (*columns.values(), card_id))
    if "labels" in changes:
        _set_labels(conn, user_id, board_id, card_id, changes["labels"])


def create_card(conn: sqlite3.Connection, user_id: int, column: str, fields: dict, board_id: int | None = None) -> dict:
    """`fields` holds title and optionally details, due_date, priority, assignee and labels."""
    column_id, board = _column(conn, user_id, column, board_id)
    position = len(_card_ids(conn, column_id))
    card_id = conn.execute(
        "INSERT INTO cards (column_id, position, title, created_at, moved_at)"
        " VALUES (?, ?, ?, datetime('now'), datetime('now'))",
        (column_id, position, fields["title"]),
    ).lastrowid
    _write_card(conn, user_id, board, card_id, {"details": ""} | fields)
    log(conn, user_id, board, "create_card", f"کارت «{fields['title']}» را در «{_column_title(conn, column_id)}» ساخت", card_id)
    touch(board)
    return _load_card(conn, card_id)


def update_card(conn: sqlite3.Connection, user_id: int, card: str, changes: dict, board_id: int | None = None) -> dict:
    """Sets the given fields (None clears an optional one); "labels" replaces the card's labels."""
    row, board = _card(conn, user_id, card, board_id)
    before = _load_card(conn, row["id"])
    _write_card(conn, user_id, board, row["id"], changes)
    after = _load_card(conn, row["id"])
    changed = [FIELD_NAMES[f] for f in FIELD_NAMES if before[f] != after[f]]
    if changed:
        what = f"کارت «{after['title']}» را ویرایش کرد: {'، '.join(changed)}"
        if before["title"] != after["title"]:
            what = f"کارت «{before['title']}» را ویرایش کرد: {'، '.join(changed)} (عنوان تازه «{after['title']}»)"
        log(conn, user_id, board, "update_card", what, row["id"])
    touch(board)
    return after


def move_card(
    conn: sqlite3.Connection, user_id: int, card: str, column: str, index: int, board_id: int | None = None
) -> None:
    """Moves the card to `index` in a column of the same board (clamped to the end) and renumbers both."""
    row, board = _card(conn, user_id, card, board_id)
    target, _ = _column(conn, user_id, column, board)
    source = row["column_id"]
    ids = [i for i in _card_ids(conn, target) if i != row["id"]]
    ids.insert(min(max(index, 0), len(ids)), row["id"])
    _write_order(conn, target, ids)
    if source != target:
        _write_order(conn, source, _card_ids(conn, source))
        conn.execute("UPDATE cards SET moved_at = datetime('now') WHERE id = ?", (row["id"],))
        log(
            conn, user_id, board, "move_card",
            f"کارت «{row['title']}» را از «{_column_title(conn, source)}» به «{_column_title(conn, target)}» برد",
            row["id"],
        )
    touch(board)


def delete_card(conn: sqlite3.Connection, user_id: int, card: str) -> int:
    """Deletes the card; returns the id of the log entry that can restore it."""
    row, board = _card(conn, user_id, card)
    kept = _card_rows(conn, "id = ?", (row["id"],))
    entry = log(
        conn, user_id, board, "delete_card",
        f"کارت «{row['title']}» را از «{_column_title(conn, row['column_id'])}» حذف کرد",
        row["id"], kept,
    )
    conn.execute("DELETE FROM cards WHERE id = ?", (row["id"],))
    touch(board)
    _write_order(conn, row["column_id"], _card_ids(conn, row["column_id"]))
    return entry


# --- snapshots (undo of the assistant's changes) ---

_SNAPSHOT_TABLES = {
    "columns": "SELECT * FROM columns WHERE board_id = ? ORDER BY id",
    "cards": "SELECT k.* FROM cards k JOIN columns c ON c.id = k.column_id WHERE c.board_id = ? ORDER BY k.id",
    "labels": "SELECT * FROM labels WHERE board_id = ? ORDER BY id",
    "card_labels": "SELECT cl.* FROM card_labels cl JOIN labels l ON l.id = cl.label_id WHERE l.board_id = ?"
    " ORDER BY cl.card_id, cl.label_id",
    "members": "SELECT * FROM board_members WHERE board_id = ? ORDER BY user_id",
}


def snapshot(conn: sqlite3.Connection, board_id: int) -> dict:
    """Every row of the board (title, columns, cards, labels, card labels, members), to put back later."""
    snap = {"title": conn.execute("SELECT title FROM boards WHERE id = ?", (board_id,)).fetchone()["title"]}
    for name, query in _SNAPSHOT_TABLES.items():
        snap[name] = [dict(row) for row in conn.execute(query, (board_id,))]
    return snap


def fingerprint(snap: dict) -> str:
    return hashlib.sha256(json.dumps(snap, sort_keys=True, ensure_ascii=False).encode()).hexdigest()


def restore_snapshot(conn: sqlite3.Connection, board_id: int, snap: dict, user_id: int) -> None:
    """Puts the board back exactly as in `snap`, keeping ids. Members who left are added back if their
    account still exists; members added since are removed (never the owner)."""

    def insert(table: str, rows: list[dict]) -> None:
        for row in rows:
            names = ", ".join(row)
            conn.execute(f"INSERT INTO {table} ({names}) VALUES ({', '.join('?' * len(row))})", tuple(row.values()))

    conn.execute("UPDATE boards SET title = ? WHERE id = ?", (snap["title"], board_id))
    # Cards and their labels go with their columns, card labels with their labels (ON DELETE CASCADE).
    conn.execute("DELETE FROM columns WHERE board_id = ?", (board_id,))
    conn.execute("DELETE FROM labels WHERE board_id = ?", (board_id,))
    insert("labels", snap["labels"])
    insert("columns", snap["columns"])
    insert("cards", snap["cards"])
    insert("card_labels", snap["card_labels"])
    wanted = {m["user_id"] for m in snap["members"]}
    conn.execute(
        f"DELETE FROM board_members WHERE board_id = ? AND role != 'owner'"
        f" AND user_id NOT IN ({', '.join('?' * len(wanted))})",
        (board_id, *wanted),
    )
    for m in snap["members"]:
        conn.execute(
            "INSERT OR IGNORE INTO board_members (board_id, user_id, role)"
            " SELECT ?, ?, ? WHERE EXISTS (SELECT 1 FROM users WHERE id = ?)",
            (board_id, m["user_id"], m["role"], m["user_id"]),
        )
    log(conn, user_id, board_id, "undo_assistant", "تغییرات دستیار را برگرداند")
    touch(board_id)


def rename_column(conn: sqlite3.Connection, user_id: int, column: str, title: str) -> None:
    column_id, board_id = _column(conn, user_id, column)
    old = _column_title(conn, column_id)
    conn.execute("UPDATE columns SET title = ? WHERE id = ?", (title, column_id))
    if old != title:
        log(conn, user_id, board_id, "rename_column", f"نام ستون «{old}» را به «{title}» تغییر داد")
    touch(board_id)


def _column_ids(conn: sqlite3.Connection, board_id: int) -> list[int]:
    rows = conn.execute("SELECT id FROM columns WHERE board_id = ? ORDER BY position", (board_id,))
    return [row["id"] for row in rows]


def _write_column_order(conn: sqlite3.Connection, column_ids: list[int]) -> None:
    conn.executemany("UPDATE columns SET position = ? WHERE id = ?", [(i, c) for i, c in enumerate(column_ids)])


def create_column(conn: sqlite3.Connection, user_id: int, board: str, title: str) -> dict:
    """Adds a column at the end of the board."""
    board_id = member_board(conn, user_id, board)
    column_id = conn.execute(
        "INSERT INTO columns (board_id, title, position) VALUES (?, ?, ?)",
        (board_id, title, len(_column_ids(conn, board_id))),
    ).lastrowid
    log(conn, user_id, board_id, "create_column", f"ستون «{title}» را ساخت")
    touch(board_id)
    return {"id": column_key(column_id), "title": title, "cardIds": []}


def delete_column(conn: sqlite3.Connection, user_id: int, column: str) -> int:
    """Deletes the column with its cards (ON DELETE CASCADE). A board keeps at least one column. Returns the
    id of the log entry that can restore it."""
    column_id, board_id = _column(conn, user_id, column)
    remaining = [c for c in _column_ids(conn, board_id) if c != column_id]
    if not remaining:
        raise Conflict("a board needs at least one column")
    col = dict(conn.execute("SELECT * FROM columns WHERE id = ?", (column_id,)).fetchone())
    kept = {"column": col} | _card_rows(conn, "column_id = ?", (column_id,))
    count = len(kept["cards"])
    entry = log(
        conn, user_id, board_id, "delete_column",
        f"ستون «{col['title']}» را" + (f" با {str(count).translate(FA_DIGITS)} کارت" if count else "") + " حذف کرد",
        data=kept,
    )
    conn.execute("DELETE FROM columns WHERE id = ?", (column_id,))
    _write_column_order(conn, remaining)
    touch(board_id)
    return entry


def move_column(conn: sqlite3.Connection, user_id: int, column: str, index: int) -> None:
    """Moves the column to `index` (clamped) among its board's columns."""
    column_id, board_id = _column(conn, user_id, column)
    ids = [c for c in _column_ids(conn, board_id) if c != column_id]
    before = _column_ids(conn, board_id)
    ids.insert(min(max(index, 0), len(ids)), column_id)
    _write_column_order(conn, ids)
    if ids != before:
        log(conn, user_id, board_id, "move_column", f"ستون «{_column_title(conn, column_id)}» را جابه‌جا کرد")
    touch(board_id)


# --- labels ---


def _touch_label(conn: sqlite3.Connection, label_id: int) -> None:
    touch(conn.execute("SELECT board_id FROM labels WHERE id = ?", (label_id,)).fetchone()["board_id"])


def _label_dict(row: sqlite3.Row) -> dict:
    return {"id": label_key(row["id"]), "name": row["name"], "color": row["color"]}


def create_label(conn: sqlite3.Connection, user_id: int, board: str, name: str, color: str) -> dict:
    board_id = member_board(conn, user_id, board)
    label_id = conn.execute(
        "INSERT INTO labels (board_id, name, color) VALUES (?, ?, ?)", (board_id, name, color)
    ).lastrowid
    log(conn, user_id, board_id, "create_label", f"برچسب «{_label_name({'name': name, 'color': color})}» را ساخت")
    touch(board_id)
    return _label_dict(conn.execute("SELECT * FROM labels WHERE id = ?", (label_id,)).fetchone())


def update_label(conn: sqlite3.Connection, user_id: int, label: str, changes: dict) -> dict:
    label_id = _label(conn, user_id, label)
    _touch_label(conn, label_id)
    before = conn.execute("SELECT * FROM labels WHERE id = ?", (label_id,)).fetchone()
    for field in ("name", "color"):
        if field in changes:
            conn.execute(f"UPDATE labels SET {field} = ? WHERE id = ?", (changes[field], label_id))
    after = conn.execute("SELECT * FROM labels WHERE id = ?", (label_id,)).fetchone()
    if dict(before) != dict(after):
        log(conn, user_id, after["board_id"], "update_label", f"برچسب «{_label_name(before)}» را ویرایش کرد")
    return _label_dict(conn.execute("SELECT * FROM labels WHERE id = ?", (label_id,)).fetchone())


def delete_label(conn: sqlite3.Connection, user_id: int, label: str) -> int:
    """Also removes the label from every card (ON DELETE CASCADE)."""
    label_id = _label(conn, user_id, label)
    _touch_label(conn, label_id)
    row = dict(conn.execute("SELECT * FROM labels WHERE id = ?", (label_id,)).fetchone())
    links = [dict(r) for r in conn.execute("SELECT * FROM card_labels WHERE label_id = ?", (label_id,))]
    entry = log(
        conn, user_id, row["board_id"], "delete_label", f"برچسب «{_label_name(row)}» را حذف کرد",
        data={"label": row, "card_labels": links},
    )
    conn.execute("DELETE FROM labels WHERE id = ?", (label_id,))
    return entry


# --- boards ---


def list_boards(conn: sqlite3.Connection, user_id: int) -> list[dict]:
    rows = conn.execute(
        "SELECT b.id, b.title, m.role, u.username AS owner,"
        " (SELECT COUNT(*) FROM board_members WHERE board_id = b.id) AS members,"
        " (SELECT COUNT(*) FROM cards k JOIN columns c ON c.id = k.column_id WHERE c.board_id = b.id) AS cards,"
        " (SELECT COUNT(*) FROM cards k JOIN columns c ON c.id = k.column_id"
        "  WHERE c.board_id = b.id AND k.assignee_id = m.user_id) AS my_cards"
        " FROM boards b"
        " JOIN board_members m ON m.board_id = b.id AND m.user_id = ?"
        " JOIN users u ON u.id = b.owner_id ORDER BY b.id",
        (user_id,),
    )
    return [dict(r) | {"id": board_key(r["id"])} for r in rows]


def create_board(conn: sqlite3.Connection, user_id: int, title: str) -> dict:
    board_id = db.create_board(conn, user_id, title)
    return next(b for b in list_boards(conn, user_id) if b["id"] == board_key(board_id))


def get_board(conn: sqlite3.Connection, user_id: int, board: str) -> dict:
    """The board in the frontend BoardState shape, with its members and the caller's role."""
    board_id = member_board(conn, user_id, board)
    info = conn.execute("SELECT title FROM boards WHERE id = ?", (board_id,)).fetchone()
    columns = conn.execute(
        "SELECT id, title FROM columns WHERE board_id = ? ORDER BY position", (board_id,)
    ).fetchall()
    cards = conn.execute(
        f"{CARD_SELECT} JOIN columns c ON c.id = k.column_id WHERE c.board_id = ? ORDER BY k.column_id, k.position",
        (board_id,),
    ).fetchall()
    labels = conn.execute("SELECT * FROM labels WHERE board_id = ? ORDER BY id", (board_id,)).fetchall()
    card_labels: dict[int, list[int]] = {}
    for card_id, label_id in conn.execute(
        "SELECT cl.card_id, cl.label_id FROM card_labels cl JOIN labels l ON l.id = cl.label_id"
        " WHERE l.board_id = ? ORDER BY cl.label_id",
        (board_id,),
    ):
        card_labels.setdefault(card_id, []).append(label_id)
    members = conn.execute(
        "SELECT u.username, u.avatar, m.role FROM board_members m JOIN users u ON u.id = m.user_id"
        " WHERE m.board_id = ? ORDER BY m.role = 'owner' DESC, u.username",
        (board_id,),
    )
    return {
        "id": board_key(board_id),
        "title": info["title"],
        "role": _role(conn, user_id, board_id),
        "members": [{"username": m["username"], "role": m["role"], "avatar": m["avatar"]} for m in members],
        "columns": [
            {
                "id": column_key(col["id"]),
                "title": col["title"],
                "cardIds": [card_key(k["id"]) for k in cards if k["column_id"] == col["id"]],
            }
            for col in columns
        ],
        "cards": {card_key(k["id"]): _card_dict(k, card_labels.get(k["id"], [])) for k in cards},
        "labels": [_label_dict(label) for label in labels],
    }


def rename_board(conn: sqlite3.Connection, user_id: int, board: str, title: str) -> None:
    board_id = _owner_board(conn, user_id, board)
    old = conn.execute("SELECT title FROM boards WHERE id = ?", (board_id,)).fetchone()["title"]
    conn.execute("UPDATE boards SET title = ? WHERE id = ?", (title, board_id))
    if old != title:
        log(conn, user_id, board_id, "rename_board", f"نام تخته را از «{old}» به «{title}» تغییر داد")
    touch(board_id)


def delete_board(conn: sqlite3.Connection, user_id: int, board: str) -> None:
    """Deletes the board with its columns, cards, labels and memberships (ON DELETE CASCADE)."""
    board_id = _owner_board(conn, user_id, board)
    conn.execute("DELETE FROM boards WHERE id = ?", (board_id,))
    touch(board_id)  # its clients reload and find it gone


def add_member(conn: sqlite3.Connection, user_id: int, board: str, username: str) -> None:
    board_id = _owner_board(conn, user_id, board)
    row = conn.execute("SELECT id FROM users WHERE username = ?", (username.strip().lower(),)).fetchone()
    if not row:
        raise NotFound(f"user {username}")
    try:
        conn.execute(
            "INSERT INTO board_members (board_id, user_id, role) VALUES (?, ?, 'member')", (board_id, row["id"])
        )
        log(conn, user_id, board_id, "add_member", f"{username.strip().lower()} را به اعضا افزود")
        touch(board_id)
    except sqlite3.IntegrityError:
        raise Conflict(f"{username} is already a member") from None


def remove_member(conn: sqlite3.Connection, user_id: int, board: str, username: str) -> None:
    """The owner removes members; a member may remove themselves (leave). The owner cannot leave."""
    board_id = member_board(conn, user_id, board)
    row = conn.execute(
        "SELECT m.user_id, m.role FROM board_members m JOIN users u ON u.id = m.user_id"
        " WHERE m.board_id = ? AND u.username = ?",
        (board_id, username.strip().lower()),
    ).fetchone()
    if not row:
        raise NotFound(f"member {username}")
    if row["role"] == "owner":
        raise Forbidden("the owner cannot leave; delete the board instead")
    if row["user_id"] != user_id and _role(conn, user_id, board_id) != "owner":
        raise Forbidden("only the board owner can remove other members")
    conn.execute("DELETE FROM board_members WHERE board_id = ? AND user_id = ?", (board_id, row["user_id"]))
    name = username.strip().lower()
    log(conn, user_id, board_id, "remove_member", "از تخته بیرون رفت" if row["user_id"] == user_id else f"{name} را از اعضا حذف کرد")
    touch(board_id)
    # Their AI conversation on this board goes too.
    conn.execute("DELETE FROM chat_messages WHERE board_id = ? AND user_id = ?", (board_id, row["user_id"]))
    conn.execute(
        "UPDATE cards SET assignee_id = NULL WHERE assignee_id = ?"
        " AND column_id IN (SELECT id FROM columns WHERE board_id = ?)",
        (row["user_id"], board_id),
    )
