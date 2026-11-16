"""In-app notifications: what others did that concerns a user (a card assigned to them, changes to their
cards, being added to or removed from a board) and their due dates. Board writes call `notify`; due-date
notifications are made when the user's notifications are read (`check_due`), once per card and date."""

import datetime
import json
import sqlite3
from typing import Annotated

from fastapi import APIRouter, Depends

from app import changes, db
from app.auth import User, current_user

router = APIRouter(prefix="/api")
MAX_SHOWN = 50


def notify(
    conn: sqlite3.Connection,
    recipient: int | None,
    actor: int,
    board_id: int,
    kind: str,
    params: dict,
    card_id: int | None = None,
) -> None:
    """Tells `recipient` about something `actor` did; nobody is told about their own actions."""
    if recipient is None or recipient == actor:
        return
    conn.execute(
        "INSERT INTO notifications (user_id, actor_id, board_id, card_id, kind, params, via) VALUES (?, ?, ?, ?, ?, ?, ?)",
        (recipient, actor, board_id, card_id, kind, json.dumps(params, ensure_ascii=False), changes.via()),
    )
    changes.notify_user(recipient)


def check_due(conn: sqlite3.Connection, user_id: int, today: datetime.date) -> None:
    """Notifies the user once about each of their cards that is due today or tomorrow (`due_soon`) and once
    when it is overdue. Cards in a board's last column count as done."""
    tomorrow = (today + datetime.timedelta(days=1)).isoformat()
    cards = conn.execute(
        "SELECT k.id, k.title, k.due_date, c.board_id, b.title AS board FROM cards k"
        " JOIN columns c ON c.id = k.column_id JOIN boards b ON b.id = c.board_id"
        " WHERE k.assignee_id = ? AND k.due_date IS NOT NULL AND k.due_date <= ?"
        " AND c.position < (SELECT MAX(position) FROM columns WHERE board_id = c.board_id)",
        (user_id, tomorrow),
    ).fetchall()
    for card in cards:
        kind = "overdue" if card["due_date"] < today.isoformat() else "due_soon"
        params = {"card": card["title"], "board": card["board"], "date": card["due_date"]}
        conn.execute(
            "INSERT OR IGNORE INTO notifications (user_id, board_id, card_id, kind, params, due_date)"
            " VALUES (?, ?, ?, ?, ?, ?)",
            (user_id, card["board_id"], card["id"], kind, json.dumps(params, ensure_ascii=False), card["due_date"]),
        )


def list_for(conn: sqlite3.Connection, user_id: int) -> dict:
    rows = conn.execute(
        "SELECT n.*, u.username AS actor, u.avatar AS actor_avatar FROM notifications n"
        " LEFT JOIN users u ON u.id = n.actor_id WHERE n.user_id = ? ORDER BY n.id DESC LIMIT ?",
        (user_id, MAX_SHOWN),
    ).fetchall()
    unread = conn.execute(
        "SELECT COUNT(*) FROM notifications WHERE user_id = ? AND read = 0", (user_id,)
    ).fetchone()[0]
    return {
        "unread": unread,
        "items": [
            {
                "id": f"note-{r['id']}",
                "kind": r["kind"],
                "params": json.loads(r["params"]),
                "actor": r["actor"],
                "actor_avatar": r["actor_avatar"] or 0,
                "via": r["via"],
                "board": f"board-{r['board_id']}" if r["board_id"] else None,
                "read": bool(r["read"]),
                "created_at": r["created_at"],
            }
            for r in rows
        ],
    }


@router.get("/notifications")
def get_notifications(user: Annotated[User, Depends(current_user)]) -> dict:
    """The user's latest notifications (newest first) and how many are unread."""
    with db.connect() as conn:
        check_due(conn, user.id, datetime.date.today())
        return list_for(conn, user.id)


@router.post("/notifications/read")
def mark_read(user: Annotated[User, Depends(current_user)]) -> dict[str, bool]:
    with db.connect() as conn:
        conn.execute("UPDATE notifications SET read = 1 WHERE user_id = ? AND read = 0", (user.id,))
    return {"ok": True}
