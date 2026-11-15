"""Board reads and writes, always scoped to one user. Shared by the REST routes and the AI."""

import sqlite3


class NotFound(Exception):
    pass


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


# Card columns an update may change; the API and the AI validate their values.
# A card's labels are set separately through the "labels" key (a list of label keys).
EDITABLE = ("title", "details", "due_date", "priority", "assignee")


def _card_dict(row: sqlite3.Row, labels: list[int]) -> dict:
    return {"id": card_key(row["id"])} | {field: row[field] for field in EDITABLE} | {
        "labels": [label_key(i) for i in labels]
    }


def _card_labels(conn: sqlite3.Connection, card_id: int) -> list[int]:
    rows = conn.execute("SELECT label_id FROM card_labels WHERE card_id = ? ORDER BY label_id", (card_id,))
    return [row[0] for row in rows]


def _load_card(conn: sqlite3.Connection, card_id: int) -> dict:
    row = conn.execute("SELECT * FROM cards WHERE id = ?", (card_id,)).fetchone()
    return _card_dict(row, _card_labels(conn, card_id))


def _owned_label(conn: sqlite3.Connection, user_id: int, key: str) -> int:
    label_id = parse_key(key, "label")
    row = conn.execute(
        "SELECT l.id FROM labels l JOIN boards b ON b.id = l.board_id WHERE l.id = ? AND b.user_id = ?",
        (label_id, user_id),
    ).fetchone()
    if not row:
        raise NotFound(key)
    return label_id


def _set_labels(conn: sqlite3.Connection, user_id: int, card_id: int, keys: list[str]) -> None:
    label_ids = {_owned_label(conn, user_id, key) for key in keys}
    conn.execute("DELETE FROM card_labels WHERE card_id = ?", (card_id,))
    conn.executemany("INSERT INTO card_labels (card_id, label_id) VALUES (?, ?)", [(card_id, i) for i in label_ids])


def _label_dict(row: sqlite3.Row) -> dict:
    return {"id": label_key(row["id"]), "name": row["name"], "color": row["color"]}


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
    labels = conn.execute("SELECT * FROM labels WHERE board_id = ? ORDER BY id", (board_id,)).fetchall()
    card_labels: dict[int, list[int]] = {}
    for card_id, label_id in conn.execute(
        "SELECT cl.card_id, cl.label_id FROM card_labels cl JOIN labels l ON l.id = cl.label_id"
        " WHERE l.board_id = ? ORDER BY cl.label_id",
        (board_id,),
    ):
        card_labels.setdefault(card_id, []).append(label_id)
    return {
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


def rename_column(conn: sqlite3.Connection, user_id: int, column: str, title: str) -> None:
    column_id = _owned_column(conn, user_id, column)
    conn.execute("UPDATE columns SET title = ? WHERE id = ?", (title, column_id))


def create_card(conn: sqlite3.Connection, user_id: int, column: str, fields: dict) -> dict:
    """`fields` holds title, any other EDITABLE values and optionally "labels"."""
    column_id = _owned_column(conn, user_id, column)
    position = len(_card_ids(conn, column_id))
    values = {"details": ""} | {k: v for k, v in fields.items() if k in EDITABLE}
    names = ", ".join(values)
    card_id = conn.execute(
        f"INSERT INTO cards (column_id, position, {names}) VALUES (?, ?{', ?' * len(values)})",
        (column_id, position, *values.values()),
    ).lastrowid
    if "labels" in fields:
        _set_labels(conn, user_id, card_id, fields["labels"])
    return _load_card(conn, card_id)


def update_card(conn: sqlite3.Connection, user_id: int, card: str, changes: dict) -> dict:
    """Sets the given EDITABLE fields (None clears an optional one); "labels" replaces the card's labels."""
    row = _owned_card(conn, user_id, card)
    columns = {k: v for k, v in changes.items() if k in EDITABLE}
    if columns:
        assignments = ", ".join(f"{k} = ?" for k in columns)
        conn.execute(f"UPDATE cards SET {assignments} WHERE id = ?", (*columns.values(), row["id"]))
    if "labels" in changes:
        _set_labels(conn, user_id, row["id"], changes["labels"])
    return _load_card(conn, row["id"])


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


def create_label(conn: sqlite3.Connection, user_id: int, name: str, color: str) -> dict:
    label_id = conn.execute(
        "INSERT INTO labels (board_id, name, color) VALUES (?, ?, ?)", (_board_id(conn, user_id), name, color)
    ).lastrowid
    return _label_dict(conn.execute("SELECT * FROM labels WHERE id = ?", (label_id,)).fetchone())


def update_label(conn: sqlite3.Connection, user_id: int, label: str, changes: dict) -> dict:
    label_id = _owned_label(conn, user_id, label)
    for field in ("name", "color"):
        if field in changes:
            conn.execute(f"UPDATE labels SET {field} = ? WHERE id = ?", (changes[field], label_id))
    return _label_dict(conn.execute("SELECT * FROM labels WHERE id = ?", (label_id,)).fetchone())


def delete_label(conn: sqlite3.Connection, user_id: int, label: str) -> None:
    """Also removes the label from every card (ON DELETE CASCADE)."""
    conn.execute("DELETE FROM labels WHERE id = ?", (_owned_label(conn, user_id, label),))

