"""Board reads and writes. Access is by board membership; owners also manage the board and its members.
Shared by the REST routes and the AI. `board_id`, where accepted, pins an operation to one board (the AI
chat uses it so the model cannot reach the user's other boards)."""

import sqlite3

from app import db


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
        "INSERT INTO cards (column_id, position, title) VALUES (?, ?, ?)", (column_id, position, fields["title"])
    ).lastrowid
    _write_card(conn, user_id, board, card_id, {"details": ""} | fields)
    return _load_card(conn, card_id)


def update_card(conn: sqlite3.Connection, user_id: int, card: str, changes: dict, board_id: int | None = None) -> dict:
    """Sets the given fields (None clears an optional one); "labels" replaces the card's labels."""
    row, board = _card(conn, user_id, card, board_id)
    _write_card(conn, user_id, board, row["id"], changes)
    return _load_card(conn, row["id"])


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


def delete_card(conn: sqlite3.Connection, user_id: int, card: str) -> None:
    row, _ = _card(conn, user_id, card)
    conn.execute("DELETE FROM cards WHERE id = ?", (row["id"],))
    _write_order(conn, row["column_id"], _card_ids(conn, row["column_id"]))


def rename_column(conn: sqlite3.Connection, user_id: int, column: str, title: str) -> None:
    column_id, _ = _column(conn, user_id, column)
    conn.execute("UPDATE columns SET title = ? WHERE id = ?", (title, column_id))


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
    return {"id": column_key(column_id), "title": title, "cardIds": []}


def delete_column(conn: sqlite3.Connection, user_id: int, column: str) -> None:
    """Deletes the column with its cards (ON DELETE CASCADE). A board keeps at least one column."""
    column_id, board_id = _column(conn, user_id, column)
    remaining = [c for c in _column_ids(conn, board_id) if c != column_id]
    if not remaining:
        raise Conflict("a board needs at least one column")
    conn.execute("DELETE FROM columns WHERE id = ?", (column_id,))
    _write_column_order(conn, remaining)


def move_column(conn: sqlite3.Connection, user_id: int, column: str, index: int) -> None:
    """Moves the column to `index` (clamped) among its board's columns."""
    column_id, board_id = _column(conn, user_id, column)
    ids = [c for c in _column_ids(conn, board_id) if c != column_id]
    ids.insert(min(max(index, 0), len(ids)), column_id)
    _write_column_order(conn, ids)


# --- labels ---


def _label_dict(row: sqlite3.Row) -> dict:
    return {"id": label_key(row["id"]), "name": row["name"], "color": row["color"]}


def create_label(conn: sqlite3.Connection, user_id: int, board: str, name: str, color: str) -> dict:
    board_id = member_board(conn, user_id, board)
    label_id = conn.execute(
        "INSERT INTO labels (board_id, name, color) VALUES (?, ?, ?)", (board_id, name, color)
    ).lastrowid
    return _label_dict(conn.execute("SELECT * FROM labels WHERE id = ?", (label_id,)).fetchone())


def update_label(conn: sqlite3.Connection, user_id: int, label: str, changes: dict) -> dict:
    label_id = _label(conn, user_id, label)
    for field in ("name", "color"):
        if field in changes:
            conn.execute(f"UPDATE labels SET {field} = ? WHERE id = ?", (changes[field], label_id))
    return _label_dict(conn.execute("SELECT * FROM labels WHERE id = ?", (label_id,)).fetchone())


def delete_label(conn: sqlite3.Connection, user_id: int, label: str) -> None:
    """Also removes the label from every card (ON DELETE CASCADE)."""
    conn.execute("DELETE FROM labels WHERE id = ?", (_label(conn, user_id, label),))


# --- boards ---


def list_boards(conn: sqlite3.Connection, user_id: int) -> list[dict]:
    rows = conn.execute(
        "SELECT b.id, b.title, m.role, u.username AS owner FROM boards b"
        " JOIN board_members m ON m.board_id = b.id AND m.user_id = ?"
        " JOIN users u ON u.id = b.owner_id ORDER BY b.id",
        (user_id,),
    )
    return [{"id": board_key(r["id"]), "title": r["title"], "role": r["role"], "owner": r["owner"]} for r in rows]


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
        "SELECT u.username, m.role FROM board_members m JOIN users u ON u.id = m.user_id"
        " WHERE m.board_id = ? ORDER BY m.role = 'owner' DESC, u.username",
        (board_id,),
    )
    return {
        "id": board_key(board_id),
        "title": info["title"],
        "role": _role(conn, user_id, board_id),
        "members": [{"username": m["username"], "role": m["role"]} for m in members],
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
    conn.execute("UPDATE boards SET title = ? WHERE id = ?", (title, _owner_board(conn, user_id, board)))


def delete_board(conn: sqlite3.Connection, user_id: int, board: str) -> None:
    """Deletes the board with its columns, cards, labels and memberships (ON DELETE CASCADE)."""
    conn.execute("DELETE FROM boards WHERE id = ?", (_owner_board(conn, user_id, board),))


def add_member(conn: sqlite3.Connection, user_id: int, board: str, username: str) -> None:
    board_id = _owner_board(conn, user_id, board)
    row = conn.execute("SELECT id FROM users WHERE username = ?", (username.strip().lower(),)).fetchone()
    if not row:
        raise NotFound(f"user {username}")
    try:
        conn.execute(
            "INSERT INTO board_members (board_id, user_id, role) VALUES (?, ?, 'member')", (board_id, row["id"])
        )
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
    # Their AI conversation on this board goes too.
    conn.execute("DELETE FROM chat_messages WHERE board_id = ? AND user_id = ?", (board_id, row["user_id"]))
    conn.execute(
        "UPDATE cards SET assignee_id = NULL WHERE assignee_id = ?"
        " AND column_id IN (SELECT id FROM columns WHERE board_id = ?)",
        (row["user_id"], board_id),
    )
