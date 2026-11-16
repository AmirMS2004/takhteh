"""The board's activity log (written by board_service.log) and restoring what a deletion removed."""

import json
import sqlite3
from typing import Annotated

from fastapi import APIRouter, Depends

from app import board_service as service
from app import db, live
from app.auth import User, current_user
from app.changes import touch

router = APIRouter(prefix="/api", dependencies=[Depends(live.track_changes)])
CurrentUser = Annotated[User, Depends(current_user)]

MAX_ENTRIES = 200


def entry_key(entry_id: int) -> str:
    return f"act-{entry_id}"


def list_activity(
    conn: sqlite3.Connection, user_id: int, board: str, card: str | None = None, deleted: bool = False
) -> list[dict]:
    """Newest first. `card` keeps one card's entries; `deleted` keeps deletions that can still be restored."""
    board_id = service.member_board(conn, user_id, board)
    where, args = ["a.board_id = ?"], [board_id]
    if card:
        where.append("a.card_id = ?")
        args.append(service.parse_key(card, "card"))
    if deleted:
        where.append("a.data IS NOT NULL AND a.restored = 0")
    rows = conn.execute(
        "SELECT a.*, u.username, u.avatar FROM activity a LEFT JOIN users u ON u.id = a.user_id"
        f" WHERE {' AND '.join(where)} ORDER BY a.id DESC LIMIT ?",
        (*args, MAX_ENTRIES),
    )
    return [
        {
            "id": entry_key(r["id"]),
            "user": r["username"],
            "avatar": r["avatar"] or 0,
            "action": r["action"],
            "summary": r["summary"],
            "params": json.loads(r["params"]) if r["params"] else None,
            "via": r["via"],
            "created_at": r["created_at"],
            "restorable": r["data"] is not None and not r["restored"],
        }
        for r in rows
    ]


def _insert(conn: sqlite3.Connection, table: str, row: dict) -> int:
    """Inserts the row, keeping its id when that id is still free."""
    row = dict(row)
    if conn.execute(f"SELECT 1 FROM {table} WHERE id = ?", (row["id"],)).fetchone():
        del row["id"]
    names = ", ".join(row)
    return conn.execute(
        f"INSERT INTO {table} ({names}) VALUES ({', '.join('?' * len(row))})", tuple(row.values())
    ).lastrowid


def _restore_cards(conn: sqlite3.Connection, board_id: int, data: dict, column_id: int) -> dict[int, int]:
    """Puts the kept cards into `column_id` with their labels (those still on the board) and assignees (if
    still members). Returns old id -> new id."""
    ids = {}
    for card in data["cards"]:
        assignee = card["assignee_id"]
        if assignee and not conn.execute(
            "SELECT 1 FROM board_members WHERE board_id = ? AND user_id = ?", (board_id, assignee)
        ).fetchone():
            assignee = None
        ids[card["id"]] = _insert(conn, "cards", card | {"column_id": column_id, "assignee_id": assignee})
    for link in data["card_labels"]:
        if conn.execute("SELECT 1 FROM labels WHERE id = ? AND board_id = ?", (link["label_id"], board_id)).fetchone():
            conn.execute(
                "INSERT OR IGNORE INTO card_labels (card_id, label_id) VALUES (?, ?)", (ids[link["card_id"]], link["label_id"])
            )
    return ids


def restore(conn: sqlite3.Connection, user_id: int, board: str, entry: str) -> None:
    """Brings back a deleted card (to its column, or the first one if that is gone), column (with its cards)
    or label (on the cards that still exist)."""
    board_id = service.member_board(conn, user_id, board)
    row = conn.execute(
        "SELECT * FROM activity WHERE id = ? AND board_id = ?", (service.parse_key(entry, "act"), board_id)
    ).fetchone()
    if not row or row["data"] is None:
        raise service.NotFound(entry)
    if row["restored"]:
        raise service.Conflict("already restored")
    data = json.loads(row["data"])
    columns = service._column_ids(conn, board_id)

    if row["action"] == "delete_card":
        card = data["cards"][0]
        target = card["column_id"] if card["column_id"] in columns else columns[0]
        new_id = _restore_cards(conn, board_id, data, target)[card["id"]]
        order = [i for i in service._card_ids(conn, target) if i != new_id]
        order.insert(min(card["position"], len(order)), new_id)
        service._write_order(conn, target, order)
        service.log(
            conn, user_id, board_id, "restore_card", f"کارت «{card['title']}» را بازگرداند", new_id,
            params={"card": card["title"]},
        )
    elif row["action"] == "delete_column":
        column = data["column"]
        new_column = _insert(conn, "columns", column | {"board_id": board_id})
        order = [c for c in columns if c != new_column]
        order.insert(min(column["position"], len(order)), new_column)
        service._write_column_order(conn, order)
        _restore_cards(conn, board_id, data, new_column)
        service.log(
            conn, user_id, board_id, "restore_column", f"ستون «{column['title']}» را بازگرداند",
            params={"column": column["title"]},
        )
    else:  # delete_label
        label = data["label"]
        new_label = _insert(conn, "labels", label | {"board_id": board_id})
        for link in data["card_labels"]:
            card_board = conn.execute(
                "SELECT c.board_id FROM cards k JOIN columns c ON c.id = k.column_id WHERE k.id = ?", (link["card_id"],)
            ).fetchone()
            if card_board and card_board["board_id"] == board_id:
                conn.execute("INSERT OR IGNORE INTO card_labels (card_id, label_id) VALUES (?, ?)", (link["card_id"], new_label))
        service.log(
            conn, user_id, board_id, "restore_label", f"برچسب «{service._label_name(label)}» را بازگرداند",
            params={"label": service.label_ref(label)},
        )

    conn.execute("UPDATE activity SET restored = 1 WHERE id = ?", (row["id"],))
    touch(board_id)


@router.get("/boards/{board_id}/activity")
def get_activity(board_id: str, user: CurrentUser, card: str | None = None, deleted: bool = False) -> list[dict]:
    with db.connect() as conn:
        return list_activity(conn, user.id, board_id, card, deleted)


@router.post("/boards/{board_id}/activity/{entry}/restore")
def restore_entry(board_id: str, entry: str, user: CurrentUser) -> dict:
    with db.connect() as conn:
        restore(conn, user.id, board_id, entry)
        return {"board": service.get_board(conn, user.id, board_id)}
