import datetime
import json
import re
import sqlite3
from collections.abc import Iterator
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, ValidationError

from app import ai, changes, db, live
from app import board_service as service
from app.auth import User, current_user
from app.board import Assignee, DueDate, LabelColor, Priority

router = APIRouter(prefix="/api/ai", dependencies=[Depends(live.track_changes)])

SYSTEM_PROMPT = """You are the assistant inside a kanban project-management app. The user sees their board and \
talks to you in a sidebar.

The current board is given below as JSON: "title"; "columns" in display order, each with "id", "title" and \
"cardIds" (top to bottom); "cards" keyed by card id, each with "title", "details", "due_date" ("YYYY-MM-DD"), \
"priority" ("low", "medium" or "high"), "assignee" (the username of a board member), "labels" (a list of \
label ids) and "done" (ticked as done), the first three possibly null; "labels", each with "id", "name" (may be empty) and "color" \
(red, orange, yellow, green, blue or purple); and "members", each with "username" and "role" (owner or member).

You can do anything on this board that the user can, by returning operations:
- create_card: column_id, title, details (use "" when there are no details), and optionally due_date, priority, assignee, labels
- update_card: card_id, and any of title, details, due_date, priority, assignee, done (true ticks the card as done, false reopens it) to change (null keeps the current value); "labels" replaces the card's whole label list (null keeps it), so include labels it should keep
- move_card: card_id, column_id, index (0 is the top of the column; null puts it at the bottom)
- delete_card: card_id
- create_column: title, and optionally index (its place among the columns; null puts it at the end)
- rename_column: column_id, title
- move_column: column_id, index (0 is the first column)
- delete_column: column_id (deletes its cards too; a board keeps at least one column)
- create_label: name (may be ""), color
- update_label: label_id, and name and/or color to change
- delete_label: label_id (removes it from every card)
- rename_board: title (only the board owner can)
- add_member: username of an existing account (only the owner can)
- remove_member: username (only the owner can; the owner cannot be removed, and you never remove the user you are talking to)
To use a column or label created earlier in the same reply, write "new:" followed by its exact title or name \
as its id, e.g. "new:Testing". Set every field an operation does not use to null. Only use ids that exist on \
the board. Deleting the whole board is not possible here; the user does that in the board settings.

To break a card into smaller tasks, propose create_card operations: usually 3 to 7 cards with short, \
concrete titles that together cover the original, in the original card's column unless the user says \
otherwise, keeping its assignee, due date and labels when they still fit. Keep the original card unless the \
user asks to replace it.

For a summary or weekly report, use the "facts" below, which the app computed (a week is the last 7 days, \
and cards in the board's last column or ticked as done count as done): what was done this week, what is new, what is in progress, \
what is overdue or due soon, the open work per member, and one or two suggestions on what to focus on. \
Return no operations for a report. Write it entirely in the user's language; do not copy the English \
keys of the facts.

Write the reply as plain text without Markdown symbols such as ** or #; use short lines, and "- " for lists.

Only return operations when the user asks for a change; otherwise return an empty list. Operations are \
applied in order, all or none. They are not applied right away: the user sees them as a proposal and applies \
or rejects it, so the board below may not include changes you proposed earlier. Always write a short "reply" \
for the user, in the user's language (usually Persian), answering their question or describing the changes \
you propose; never say a change is done, because it is not applied until the user confirms it (for example \
"I suggest creating ..." rather than "I created ...").

The user's interface language is {language}: write the reply in it, unless the user writes to you in \
another language.

Today is {today}.
"""

NULLABLE_STRING = {"type": ["string", "null"]}
OPERATION_TYPES = [
    "create_card", "update_card", "move_card", "delete_card",
    "create_column", "rename_column", "move_column", "delete_column",
    "create_label", "update_label", "delete_label",
    "rename_board", "add_member", "remove_member",
]
OPERATION_FIELDS = [
    "type", "card_id", "column_id", "label_id", "title", "details", "index",
    "due_date", "priority", "assignee", "labels", "done", "name", "color", "username",
]

RESPONSE_FORMAT = {
    "type": "json_schema",
    "json_schema": {
        "name": "board_assistant_reply",
        "strict": True,
        "schema": {
            "type": "object",
            "additionalProperties": False,
            "required": ["reply", "operations"],
            "properties": {
                "reply": {"type": "string"},
                "operations": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "additionalProperties": False,
                        "required": OPERATION_FIELDS,
                        "properties": {
                            "type": {"type": "string", "enum": OPERATION_TYPES},
                            "card_id": NULLABLE_STRING,
                            "column_id": NULLABLE_STRING,
                            "label_id": NULLABLE_STRING,
                            "title": NULLABLE_STRING,
                            "details": NULLABLE_STRING,
                            "index": {"type": ["integer", "null"]},
                            "due_date": NULLABLE_STRING,
                            "priority": {"type": ["string", "null"], "enum": ["low", "medium", "high", None]},
                            "assignee": NULLABLE_STRING,
                            "labels": {"type": ["array", "null"], "items": {"type": "string"}},
                            "done": {"type": ["boolean", "null"]},
                            "name": NULLABLE_STRING,
                            "color": {
                                "type": ["string", "null"],
                                "enum": ["red", "orange", "yellow", "green", "blue", "purple", None],
                            },
                            "username": NULLABLE_STRING,
                        },
                    },
                },
            },
        },
    },
}


class InvalidOperation(Exception):
    pass


class Operation(BaseModel):
    type: Literal[
        "create_card", "update_card", "move_card", "delete_card",
        "create_column", "rename_column", "move_column", "delete_column",
        "create_label", "update_label", "delete_label",
        "rename_board", "add_member", "remove_member",
    ]
    card_id: str | None = None
    column_id: str | None = None
    label_id: str | None = None
    title: str | None = None
    details: str | None = None
    index: int | None = None
    due_date: DueDate | None = None
    priority: Priority | None = None
    assignee: Assignee | None = None
    labels: list[str] | None = None
    done: bool | None = None
    name: str | None = None
    color: LabelColor | None = None
    username: str | None = None


DETAIL_FIELDS = ("due_date", "priority", "assignee", "labels", "done")
# Errors that mean "this change does not fit the board (any more)".
CHANGE_ERRORS = (InvalidOperation, service.NotFound, service.Forbidden, service.Conflict)


class AssistantReply(BaseModel):
    reply: str
    operations: list[Operation]


def _require(value: str | None, field: str, op: Operation, max_length: int = 200) -> str:
    if value is None or not value.strip():
        raise InvalidOperation(f"{op.type} needs {field}")
    if len(value.strip()) > max_length:
        raise InvalidOperation(f"{op.type}: {field} is longer than {max_length} characters")
    return value.strip()


class Applier:
    """Applies operations to one board; every id must belong to it. Columns and labels created by earlier
    operations can be referred to as "new:<title or name>"."""

    def __init__(self, conn: sqlite3.Connection, user_id: int, board_id: int):
        self.conn, self.user_id, self.board_id = conn, user_id, board_id
        self.refs: dict[str, str] = {}

    def _ref(self, key: str) -> str:
        return self.refs.get(key, key)

    def column(self, key: str | None, op: Operation) -> str:
        key = self._ref(_require(key, "column_id", op))
        service._column(self.conn, self.user_id, key, self.board_id)
        return key

    def card(self, key: str | None, op: Operation) -> str:
        key = _require(key, "card_id", op)
        service._card(self.conn, self.user_id, key, self.board_id)
        return key

    def label(self, key: str | None, op: Operation) -> str:
        key = self._ref(_require(key, "label_id", op))
        service._label(self.conn, self.user_id, key, self.board_id)
        return key

    def details(self, op: Operation) -> dict:
        # The model cannot clear a detail field: null always means "leave as is".
        dumped = op.model_dump()
        fields = {f: dumped[f] for f in DETAIL_FIELDS if dumped[f] is not None}
        if "labels" in fields:
            fields["labels"] = [self._ref(key) for key in fields["labels"]]
        return fields

    def apply(self, op: Operation) -> None:
        conn, user, board = self.conn, self.user_id, self.board_id
        board_key = service.board_key(board)
        if op.type == "create_card":
            fields = {"title": _require(op.title, "title", op), "details": (op.details or "").strip()} | self.details(op)
            service.create_card(conn, user, self.column(op.column_id, op), fields, board)
        elif op.type == "update_card":
            changes = self.details(op)
            if op.title is not None:
                changes["title"] = _require(op.title, "title", op)
            if op.details is not None:
                changes["details"] = op.details.strip()
            service.update_card(conn, user, self.card(op.card_id, op), changes, board)
        elif op.type == "move_card":
            index = op.index if op.index is not None else 10**9  # null means "at the bottom"
            if index < 0:
                raise InvalidOperation("move_card index cannot be negative")
            service.move_card(conn, user, self.card(op.card_id, op), self.column(op.column_id, op), index, board)
        elif op.type == "delete_card":
            service.delete_card(conn, user, self.card(op.card_id, op))
        elif op.type == "create_column":
            title = _require(op.title, "title", op)
            created = service.create_column(conn, user, board_key, title)
            self.refs[f"new:{title}"] = created["id"]
            if op.index is not None:
                service.move_column(conn, user, created["id"], max(op.index, 0))
        elif op.type == "rename_column":
            service.rename_column(conn, user, self.column(op.column_id, op), _require(op.title, "title", op))
        elif op.type == "move_column":
            if op.index is None or op.index < 0:
                raise InvalidOperation("move_column needs an index of 0 or more")
            service.move_column(conn, user, self.column(op.column_id, op), op.index)
        elif op.type == "delete_column":
            service.delete_column(conn, user, self.column(op.column_id, op))
        elif op.type == "create_label":
            if op.color is None:
                raise InvalidOperation("create_label needs color")
            name = (op.name or "").strip()
            if len(name) > 30:
                raise InvalidOperation("create_label: name is longer than 30 characters")
            created = service.create_label(conn, user, board_key, name, op.color)
            self.refs[f"new:{name}"] = created["id"]
        elif op.type == "update_label":
            changes = {}
            if op.name is not None:
                if len(op.name.strip()) > 30:
                    raise InvalidOperation("update_label: name is longer than 30 characters")
                changes["name"] = op.name.strip()
            if op.color is not None:
                changes["color"] = op.color
            service.update_label(conn, user, self.label(op.label_id, op), changes)
        elif op.type == "delete_label":
            service.delete_label(conn, user, self.label(op.label_id, op))
        elif op.type == "rename_board":
            service.rename_board(conn, user, board_key, _require(op.title, "title", op, 100))
        elif op.type == "add_member":
            service.add_member(conn, user, board_key, _require(op.username, "username", op, 32))
        else:  # remove_member
            username = _require(op.username, "username", op, 32).lower()
            me = conn.execute("SELECT username FROM users WHERE id = ?", (user,)).fetchone()["username"]
            if username == me:
                raise InvalidOperation("the assistant does not remove the user it is talking to")
            service.remove_member(conn, user, board_key, username)

    def apply_all(self, operations: list[Operation]) -> None:
        for op in operations:
            self.apply(op)


LANGUAGE_NAMES = {"fa": "Persian", "en": "English"}
PRIORITY_NAMES = {"low": "پایین", "medium": "متوسط", "high": "بالا"}
FA_DIGITS = str.maketrans("0123456789", "۰۱۲۳۴۵۶۷۸۹")
COLOR_NAMES = {"red": "قرمز", "orange": "نارنجی", "yellow": "زرد", "green": "سبز", "blue": "آبی", "purple": "بنفش"}


def describe_item(op: Operation, board: dict) -> dict:
    """One proposed change as {"type", "params"} with the names on the board as it is now; the client
    words it in the user's language (see `describe` for the Persian sentence)."""
    columns = {c["id"]: c["title"] for c in board["columns"]}
    labels = {label["id"]: {"name": label["name"], "color": label["color"]} for label in board["labels"]}

    def column(key: str | None) -> str | None:
        if key and key.startswith("new:"):
            return key[4:]
        return columns.get(key, key)

    def card(key: str | None) -> str | None:
        return board["cards"][key]["title"] if key in board["cards"] else key

    def label(key: str) -> dict:
        if key.startswith("new:"):
            return {"name": key[4:], "color": None}
        return labels.get(key, {"name": key, "color": None})

    def details() -> dict:
        found = {
            "due_date": op.due_date.isoformat() if op.due_date else None,
            "priority": op.priority,
            "assignee": op.assignee,
            "labels": [label(k) for k in op.labels] if op.labels is not None else None,
            "done": op.done,
        }
        return {k: v for k, v in found.items() if v is not None}

    t = op.type
    params: dict = {}
    if t == "create_card":
        params = {"title": op.title, "column": column(op.column_id)} | details()
    elif t == "update_card":
        params = {"card": card(op.card_id)} | details()
        if op.title is not None:
            params["title"] = op.title
        if op.details is not None:
            params["details"] = True
    elif t == "move_card":
        params = {"card": card(op.card_id), "column": column(op.column_id), "top": op.index == 0}
    elif t == "delete_card":
        params = {"card": card(op.card_id)}
    elif t == "create_column":
        params = {"title": op.title}
    elif t == "rename_column":
        params = {"column": column(op.column_id), "title": op.title}
    elif t == "move_column":
        params = {"column": column(op.column_id), "position": (op.index or 0) + 1}
    elif t == "delete_column":
        cards = len(next((c["cardIds"] for c in board["columns"] if c["id"] == op.column_id), []))
        params = {"column": column(op.column_id), "count": cards}
    elif t == "create_label":
        params = {"label": {"name": op.name or "", "color": op.color}}
    elif t == "update_label":
        params = {"label": label(op.label_id or "")}
        if op.name is not None:
            params["name"] = op.name
        if op.color:
            params["color"] = op.color
    elif t == "delete_label":
        params = {"label": label(op.label_id or "")}
    elif t == "rename_board":
        params = {"title": op.title}
    else:  # add_member, remove_member
        params = {"member": op.username}
    return {"type": t, "params": params}


def describe(op: Operation, board: dict) -> str:
    """One proposed change in Persian, with the names on the board as it is now."""
    columns = {c["id"]: c for c in board["columns"]}
    labels = {label["id"]: label for label in board["labels"]}

    def column(key: str | None) -> str:
        if key and key.startswith("new:"):
            return f"«{key[4:]}»"
        return f"«{columns[key]['title']}»" if key in columns else f"«{key}»"

    def card(key: str | None) -> str:
        return f"«{board['cards'][key]['title']}»" if key in board["cards"] else f"«{key}»"

    def label(key: str) -> str:
        if key.startswith("new:"):
            return f"برچسب {key[4:]}"
        found = labels.get(key)
        if not found:
            return key
        return f"برچسب {found['name']}" if found["name"] else f"برچسب {COLOR_NAMES[found['color']]}"

    def details() -> list[str]:
        parts = []
        if op.due_date:
            parts.append(f"سررسید {op.due_date.isoformat().translate(FA_DIGITS)}")
        if op.priority:
            parts.append(f"اولویت {PRIORITY_NAMES[op.priority]}")
        if op.assignee:
            parts.append(f"مسئول {op.assignee}")
        if op.labels is not None:
            parts.append("، ".join(label(key) for key in op.labels) if op.labels else "بدون برچسب")
        if op.done is not None:
            parts.append("انجام‌شده" if op.done else "باز")
        return parts

    t = op.type
    if t == "create_card":
        extra = details()
        return f"کارت تازه «{op.title}» در {column(op.column_id)}" + (f" ({'، '.join(extra)})" if extra else "")
    if t == "update_card":
        parts = ([f"عنوان «{op.title}»"] if op.title is not None else []) + (
            ["توضیحات تازه"] if op.details is not None else []
        ) + details()
        return f"ویرایش {card(op.card_id)}: {'، '.join(parts)}"
    if t == "move_card":
        return f"انتقال {card(op.card_id)} به {column(op.column_id)}" + (" (بالای ستون)" if op.index == 0 else "")
    if t == "delete_card":
        return f"حذف کارت {card(op.card_id)}"
    if t == "create_column":
        return f"ستون تازه «{op.title}»"
    if t == "rename_column":
        return f"تغییر نام ستون {column(op.column_id)} به «{op.title}»"
    if t == "move_column":
        return f"جابه‌جایی ستون {column(op.column_id)} به جایگاه {str((op.index or 0) + 1).translate(FA_DIGITS)}"
    if t == "delete_column":
        count = len(columns[op.column_id]["cardIds"]) if op.column_id in columns else 0
        return f"حذف ستون {column(op.column_id)}" + (f" با {str(count).translate(FA_DIGITS)} کارت" if count else "")
    if t == "create_label":
        name = f"«{op.name}» " if op.name else ""
        return f"برچسب تازه {name}{COLOR_NAMES.get(op.color or '', '')}".strip()
    if t == "update_label":
        parts = ([f"نام «{op.name}»"] if op.name is not None else []) + (
            [f"رنگ {COLOR_NAMES[op.color]}"] if op.color else []
        )
        return f"ویرایش {label(op.label_id or '')}: {'، '.join(parts)}"
    if t == "delete_label":
        return f"حذف {label(op.label_id or '')}"
    if t == "rename_board":
        return f"تغییر نام تخته به «{op.title}»"
    if t == "add_member":
        return f"افزودن {op.username} به اعضای تخته"
    return f"حذف {op.username} از اعضای تخته"


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class ChatRequest(BaseModel):
    board_id: str
    message: str = Field(min_length=1, max_length=4000)


# How many stored messages of the conversation the model sees.
MAX_HISTORY = 20
# How many the chat panel loads.
MAX_SHOWN = 200


def _history(conn: sqlite3.Connection, board_id: int, user_id: int, limit: int) -> list[dict]:
    """The user's latest conversation on the board, oldest first."""
    rows = conn.execute(
        "SELECT role, content FROM chat_messages WHERE board_id = ? AND user_id = ? ORDER BY id DESC LIMIT ?",
        (board_id, user_id, limit),
    ).fetchall()
    return [{"role": r["role"], "content": r["content"]} for r in reversed(rows)]


def partial_reply(raw: str) -> str:
    """The text of the "reply" field decoded so far from a JSON reply that is still being written.
    Empty until the field starts; stops at an escape sequence that is not complete yet."""
    start = re.search(r'"reply"\s*:\s*"', raw)
    if not start:
        return ""
    out, i = [], start.end()
    while i < len(raw):
        c = raw[i]
        if c == '"':
            break
        if c == "\\":
            if i + 1 >= len(raw):
                break
            e = raw[i + 1]
            if e == "u":
                if i + 6 > len(raw):
                    break
                out.append(chr(int(raw[i + 2 : i + 6], 16)))
                i += 6
                continue
            out.append(ESCAPES.get(e, e))
            i += 2
            continue
        out.append(c)
        i += 1
    return "".join(out)


ESCAPES = {"n": "\n", "t": "\t", "r": "\r", "b": "\b", "f": "\f"}


def board_facts(conn: sqlite3.Connection, board_id: int, today: datetime.date) -> dict:
    """Numbers and lists for summaries, so the model does not have to count or compare dates."""
    columns = conn.execute(
        "SELECT id, title FROM columns WHERE board_id = ? ORDER BY position", (board_id,)
    ).fetchall()
    cards = conn.execute(
        "SELECT k.title, k.column_id, k.due_date, k.created_at, k.moved_at, k.done_at, u.username AS assignee"
        " FROM cards k JOIN columns c ON c.id = k.column_id LEFT JOIN users u ON u.id = k.assignee_id"
        " WHERE c.board_id = ? ORDER BY c.position, k.position",
        (board_id,),
    ).fetchall()
    week_ago = (today - datetime.timedelta(days=7)).isoformat()
    soon = (today + datetime.timedelta(days=7)).isoformat()
    done = columns[-1]["id"] if columns else None
    finished = [c for c in cards if c["column_id"] == done or c["done_at"]]
    open_cards = [c for c in cards if c not in finished]
    workload: dict[str, int] = {}
    for c in open_cards:
        workload[c["assignee"] or "(unassigned)"] = workload.get(c["assignee"] or "(unassigned)", 0) + 1

    def titles(rows) -> list[str]:
        return [r["title"] for r in rows]

    return {
        "cards_per_column": {col["title"]: sum(c["column_id"] == col["id"] for c in cards) for col in columns},
        "done_column": columns[-1]["title"] if columns else None,
        "done_this_week": titles(c for c in finished if (c["done_at"] or c["moved_at"] or "") >= week_ago),
        "created_this_week": titles(c for c in cards if (c["created_at"] or "") >= week_ago),
        "overdue": titles(c for c in open_cards if c["due_date"] and c["due_date"] < today.isoformat()),
        "due_in_next_7_days": titles(
            c for c in open_cards if c["due_date"] and today.isoformat() <= c["due_date"] <= soon
        ),
        "open_cards_per_assignee": workload,
    }


def _prepare(body: ChatRequest, user: User) -> tuple[list[dict], int]:
    """The messages for the model, and the board the chat is pinned to (404 if not a member)."""
    with db.connect() as conn:
        board = service.get_board(conn, user.id, body.board_id)
        board_id = service.member_board(conn, user.id, body.board_id)
        history = _history(conn, board_id, user.id, MAX_HISTORY)
        today = datetime.date.today()
        facts = board_facts(conn, board_id, today)
        language = conn.execute("SELECT language FROM users WHERE id = ?", (user.id,)).fetchone()["language"]
    messages = [
        {
            "role": "system",
            "content": SYSTEM_PROMPT.format(today=today.isoformat(), language=LANGUAGE_NAMES[language])
            + "Current board:\n"
            + json.dumps(board, ensure_ascii=False)
            + "\nFacts for summaries:\n"
            + json.dumps(facts, ensure_ascii=False),
        },
        *history,
        {"role": "user", "content": body.message},
    ]
    return messages, board_id


def _check_operations(user_id: int, board_id: int, operations: list[Operation]) -> str | None:
    """Applies the operations and rolls them back: None if they all work, otherwise the reason."""
    try:
        with changes.quiet(), db.connect() as conn:
            Applier(conn, user_id, board_id).apply_all(operations)
            conn.rollback()
    except CHANGE_ERRORS as e:
        return f"Changes cannot be applied: {e}"
    return None


def _finish(raw: str, body: ChatRequest, user: User, board_id: int) -> dict:
    """Validates the model's JSON and its operations, which are stored with the reply as a proposal (not
    applied): the user applies or rejects it later by the message id."""
    try:
        result = AssistantReply.model_validate_json(raw)
    except ValidationError as e:
        raise HTTPException(status_code=502, detail="AI returned an invalid response") from e

    error = _check_operations(user.id, board_id, result.operations) if result.operations else None
    proposal = None
    if result.operations and not error:
        with db.connect() as conn:
            board = service.get_board(conn, user.id, service.board_key(board_id))
        proposal = {
            "operations": [op.model_dump(mode="json") for op in result.operations],
            "changes": [describe(op, board) for op in result.operations],
            "items": [describe_item(op, board) for op in result.operations],
            "status": "pending",
        }

    with db.connect() as conn:
        # Only completed turns are stored, so failed ones never reach the model as history.
        conn.execute(
            "INSERT INTO chat_messages (board_id, user_id, role, content) VALUES (?, ?, 'user', ?)",
            (board_id, user.id, body.message),
        )
        message_id = conn.execute(
            "INSERT INTO chat_messages (board_id, user_id, role, content, proposal) VALUES (?, ?, 'assistant', ?, ?)",
            (board_id, user.id, result.reply, json.dumps(proposal, ensure_ascii=False) if proposal else None),
        ).lastrowid
    return {
        "reply": result.reply,
        "message_id": message_key(message_id),
        "proposal": _shown_proposal(proposal),
        "error": error,
    }


def message_key(message_id: int) -> str:
    return f"msg-{message_id}"


def _shown_proposal(proposal: dict | None) -> dict | None:
    """What the chat panel sees of a proposal: the changes in words and where it stands."""
    if not proposal:
        return None
    # Proposals stored before items existed only have the Persian sentences.
    return {"changes": proposal["changes"], "items": proposal.get("items"), "status": proposal["status"]}


def _proposal(conn: sqlite3.Connection, user: User, key: str) -> tuple[int, int, dict]:
    """(message id, board id, proposal) of the user's own message on a board they are on; 404 otherwise."""
    message_id = service.parse_key(key, "msg")
    row = conn.execute(
        "SELECT board_id, proposal FROM chat_messages WHERE id = ? AND user_id = ? AND proposal IS NOT NULL",
        (message_id, user.id),
    ).fetchone()
    if not row:
        raise service.NotFound(key)
    service.member_board(conn, user.id, service.board_key(row["board_id"]))
    return message_id, row["board_id"], json.loads(row["proposal"])


def _save(conn: sqlite3.Connection, message_id: int, proposal: dict) -> None:
    conn.execute(
        "UPDATE chat_messages SET proposal = ? WHERE id = ?", (json.dumps(proposal, ensure_ascii=False), message_id)
    )


def _status_conflict(proposal: dict, wanted: str) -> None:
    if proposal["status"] != wanted:
        raise HTTPException(status_code=409, detail=f"The proposal is {proposal['status']}")


@router.post("/proposals/{key}/apply")
def apply_proposal(key: str, user: Annotated[User, Depends(current_user)]) -> dict:
    """Applies a pending proposal, all or none (409 if the board has changed so that it no longer fits).
    The board as it was is kept for undo."""
    with db.connect() as conn:
        message_id, board_id, proposal = _proposal(conn, user, key)
        _status_conflict(proposal, "pending")
        before = service.snapshot(conn, board_id)
        try:
            with changes.by_assistant():
                Applier(conn, user.id, board_id).apply_all([Operation(**op) for op in proposal["operations"]])
        except CHANGE_ERRORS as e:
            raise HTTPException(status_code=409, detail=f"Changes cannot be applied: {e}") from None
        proposal |= {"status": "applied", "before": before, "after": service.fingerprint(service.snapshot(conn, board_id))}
        _save(conn, message_id, proposal)
        return {"board": service.get_board(conn, user.id, service.board_key(board_id))}


@router.post("/proposals/{key}/reject")
def reject_proposal(key: str, user: Annotated[User, Depends(current_user)]) -> dict:
    with db.connect() as conn:
        message_id, _, proposal = _proposal(conn, user, key)
        _status_conflict(proposal, "pending")
        _save(conn, message_id, proposal | {"status": "rejected"})
    return {"ok": True}


@router.post("/proposals/{key}/undo")
def undo_proposal(key: str, user: Annotated[User, Depends(current_user)]) -> dict:
    """Puts the board back as it was before the user's latest applied proposal on it. 409 if this is not
    that proposal, or if the board has changed since (undo would discard those changes)."""
    with db.connect() as conn:
        message_id, board_id, proposal = _proposal(conn, user, key)
        _status_conflict(proposal, "applied")
        latest = conn.execute(
            "SELECT id FROM chat_messages WHERE board_id = ? AND user_id = ?"
            " AND json_extract(proposal, '$.status') = 'applied' ORDER BY id DESC LIMIT 1",
            (board_id, user.id),
        ).fetchone()
        if latest["id"] != message_id:
            raise HTTPException(status_code=409, detail="Only the latest applied change can be undone")
        if service.fingerprint(service.snapshot(conn, board_id)) != proposal["after"]:
            raise HTTPException(status_code=409, detail="The board has changed since")
        try:
            service.restore_snapshot(conn, board_id, proposal["before"], user.id)
        except sqlite3.IntegrityError:
            raise HTTPException(status_code=409, detail="The board cannot be put back") from None
        _save(conn, message_id, {k: v for k, v in proposal.items() if k not in ("before", "after")} | {"status": "undone"})
        return {"board": service.get_board(conn, user.id, service.board_key(board_id))}


@router.get("/history/{board_id}")
def get_history(board_id: str, user: Annotated[User, Depends(current_user)]) -> list[dict]:
    """The user's conversation on the board for the chat panel (latest MAX_SHOWN messages, oldest first),
    with each reply's proposal."""
    with db.connect() as conn:
        rows = conn.execute(
            "SELECT id, role, content, proposal FROM chat_messages WHERE board_id = ? AND user_id = ?"
            " ORDER BY id DESC LIMIT ?",
            (service.member_board(conn, user.id, board_id), user.id, MAX_SHOWN),
        ).fetchall()
    return [
        {
            "id": message_key(r["id"]),
            "role": r["role"],
            "content": r["content"],
            "proposal": _shown_proposal(json.loads(r["proposal"]) if r["proposal"] else None),
        }
        for r in reversed(rows)
    ]


@router.delete("/history/{board_id}")
def clear_history(board_id: str, user: Annotated[User, Depends(current_user)]) -> dict[str, bool]:
    with db.connect() as conn:
        conn.execute(
            "DELETE FROM chat_messages WHERE board_id = ? AND user_id = ?",
            (service.member_board(conn, user.id, board_id), user.id),
        )
    return {"ok": True}


@router.post("/chat")
def chat(body: ChatRequest, user: Annotated[User, Depends(current_user)]) -> dict:
    messages, board_id = _prepare(body, user)
    return _finish(ai.chat(messages, response_format=RESPONSE_FORMAT), body, user, board_id)


@router.post("/chat/stream")
def chat_stream(body: ChatRequest, user: Annotated[User, Depends(current_user)]) -> StreamingResponse:
    """Same as /chat, as NDJSON: {"type": "delta", "text"} lines while the reply is written, then one
    {"type": "done", ...result} line, or {"type": "error", "status", "detail"} if it fails midway."""
    messages, board_id = _prepare(body, user)  # access errors happen before the stream starts

    def line(event: dict) -> str:
        return json.dumps(event, ensure_ascii=False) + "\n"

    def events() -> Iterator[str]:
        raw, sent = "", ""
        try:
            for piece in ai.stream_chat(messages, response_format=RESPONSE_FORMAT):
                raw += piece
                reply = partial_reply(raw)
                if len(reply) > len(sent):
                    yield line({"type": "delta", "text": reply[len(sent) :]})
                    sent = reply
            yield line({"type": "done"} | _finish(raw, body, user, board_id))
        except ai.AIUnavailable as e:
            yield line({"type": "error", "status": 429 if isinstance(e, ai.AIRateLimited) else 503, "detail": str(e)})
        except HTTPException as e:
            yield line({"type": "error", "status": e.status_code, "detail": e.detail})

    return StreamingResponse(events(), media_type="application/x-ndjson")
