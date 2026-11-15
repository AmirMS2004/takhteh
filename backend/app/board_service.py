"""Board reads and writes, always scoped to one user. Shared by the REST routes and the AI."""

import sqlite3


class NotFound(Exception):
    pass


def column_key(column_id: int) -> str:
    return f"col-{column_id}"


def card_key(card_id: int) -> str:
    return f"card-{card_id}"


def parse_key(key: str, prefix: str) -> int:
    """Turns "col-3" into 3; anything malformed is treated as not found."""
    head, _, tail = key.partition("-")
    if head != prefix or not tail.isdigit():
        raise NotFound(key)
    return int(tail)


def _board_id(conn: sqlite3.Connection, user_id: int) -> int:
    row = conn.execute("SELECT id FROM boards WHERE user_id = ?", (user_id,)).fetchone()
    if not row:
        raise NotFound("board")
    return row["id"]


def _owned_column(conn: sqlite3.Connection, user_id: int, key: str) -> int:
    column_id = parse_key(key, "col")
    row = conn.execute(
        "SELECT c.id FROM columns c JOIN boards b ON b.id = c.board_id WHERE c.id = ? AND b.user_id = ?",
        (column_id, user_id),
    ).fetchone()
    if not row:
        raise NotFound(key)
    return column_id


def _owned_card(conn: sqlite3.Connection, user_id: int, key: str) -> sqlite3.Row:
    card_id = parse_key(key, "card")
    row = conn.execute(
        "SELECT k.* FROM cards k JOIN columns c ON c.id = k.column_id JOIN boards b ON b.id = c.board_id"
        " WHERE k.id = ? AND b.user_id = ?",
        (card_id, user_id),
    ).fetchone()
    if not row:
        raise NotFound(key)
    return row


def _card_ids(conn: sqlite3.Connection, column_id: int) -> list[int]:
    rows = conn.execute("SELECT id FROM cards WHERE column_id = ? ORDER BY position", (column_id,))
    return [row["id"] for row in rows]


def _write_order(conn: sqlite3.Connection, column_id: int, card_ids: list[int]) -> None:
    conn.executemany(
        "UPDATE cards SET column_id = ?, position = ? WHERE id = ?",
        [(column_id, i, card_id) for i, card_id in enumerate(card_ids)],
    )


# Fields a card update may change; the API and the AI validate their values.
EDITABLE = ("title", "details", "due_date", "priority", "label", "assignee")


def _card_dict(row: sqlite3.Row) -> dict:
    return {"id": card_key(row["id"])} | {field: row[field] for field in EDITABLE}


def get_board(conn: sqlite3.Connection, user_id: int) -> dict:
    """Returns the board in the frontend BoardState shape."""
    board_id = _board_id(conn, user_id)
    columns = conn.execute(
        "SELECT id, title FROM columns WHERE board_id = ? ORDER BY position", (board_id,)
    ).fetchall()
    cards = conn.execute(
        "SELECT k.* FROM cards k JOIN columns c ON c.id = k.column_id"
        " WHERE c.board_id = ? ORDER BY k.column_id, k.position",
        (board_id,),
    ).fetchall()
    return {
        "columns": [
            {
                "id": column_key(col["id"]),
                "title": col["title"],
                "cardIds": [card_key(k["id"]) for k in cards if k["column_id"] == col["id"]],
            }
            for col in columns
        ],
        "cards": {card_key(k["id"]): _card_dict(k) for k in cards},
    }


def rename_column(conn: sqlite3.Connection, user_id: int, column: str, title: str) -> None:
    column_id = _owned_column(conn, user_id, column)
    conn.execute("UPDATE columns SET title = ? WHERE id = ?", (title, column_id))


def create_card(conn: sqlite3.Connection, user_id: int, column: str, fields: dict) -> dict:
    """`fields` holds title and any other EDITABLE values."""
    column_id = _owned_column(conn, user_id, column)
    position = len(_card_ids(conn, column_id))
    values = {"details": ""} | {k: v for k, v in fields.items() if k in EDITABLE}
    names = ", ".join(values)
    card_id = conn.execute(
        f"INSERT INTO cards (column_id, position, {names}) VALUES (?, ?{', ?' * len(values)})",
        (column_id, position, *values.values()),
    ).lastrowid
    return _card_dict(conn.execute("SELECT * FROM cards WHERE id = ?", (card_id,)).fetchone())


def update_card(conn: sqlite3.Connection, user_id: int, card: str, changes: dict) -> dict:
    """Sets the given EDITABLE fields; None clears an optional field."""
    row = _owned_card(conn, user_id, card)
    changes = {k: v for k, v in changes.items() if k in EDITABLE}
    if changes:
        assignments = ", ".join(f"{k} = ?" for k in changes)
        conn.execute(f"UPDATE cards SET {assignments} WHERE id = ?", (*changes.values(), row["id"]))
    return _card_dict(conn.execute("SELECT * FROM cards WHERE id = ?", (row["id"],)).fetchone())


def move_card(conn: sqlite3.Connection, user_id: int, card: str, column: str, index: int) -> None:
    """Moves the card to `index` in the target column (clamped to the end) and renumbers both columns."""
    row = _owned_card(conn, user_id, card)
    target = _owned_column(conn, user_id, column)
    source = row["column_id"]

    ids = [i for i in _card_ids(conn, target) if i != row["id"]]
    ids.insert(min(max(index, 0), len(ids)), row["id"])
    _write_order(conn, target, ids)
    if source != target:
        _write_order(conn, source, _card_ids(conn, source))


def delete_card(conn: sqlite3.Connection, user_id: int, card: str) -> None:
    row = _owned_card(conn, user_id, card)
    conn.execute("DELETE FROM cards WHERE id = ?", (row["id"],))
    _write_order(conn, row["column_id"], _card_ids(conn, row["column_id"]))
