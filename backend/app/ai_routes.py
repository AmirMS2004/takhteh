import datetime
import json
import re
import sqlite3
from collections.abc import Iterator
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, ValidationError

from app import ai, db
from app import board_service as service
from app.auth import User, current_user
from app.board import Assignee, DueDate, Priority

router = APIRouter(prefix="/api/ai")

SYSTEM_PROMPT = """You are the assistant inside a kanban project-management app. The user sees their board and \
talks to you in a sidebar.

The current board is given below as JSON: "columns" in display order, each with "id", "title" and "cardIds" \
(top to bottom), and "cards" keyed by card id, each with "title", "details", "due_date" ("YYYY-MM-DD"), "priority" ("low", "medium" or "high"), "assignee" (the username of a board member) and "labels" (a list of label ids); the first three may be null. \
The board's labels are in "labels", each with "id", "name" (may be empty) and "color". The board's members are in \
"members"; only their usernames can be an assignee.

You can change the board by returning operations:
- create_card: column_id, title, details (use "" when there are no details), and optionally due_date, priority, assignee, labels
- update_card: card_id, and any of title, details, due_date, priority, assignee to change (null keeps the current value); "labels" replaces the card's whole label list (null keeps it), so include labels it should keep
- move_card: card_id, column_id, index (0 is the top of the column; null puts it at the bottom)
Only use label ids from the board's "labels"; you cannot create, rename or delete labels.
Set every field an operation does not use to null. Only use ids that exist on the board. Columns cannot be \
created, renamed or deleted, and cards cannot be deleted; if asked, say so.

To break a card into smaller tasks, propose create_card operations: usually 3 to 7 cards with short, \
concrete titles that together cover the original, in the original card's column unless the user says \
otherwise, keeping its assignee, due date and labels when they still fit. The original card stays; say so.

For a summary or weekly report, use the "facts" below, which the app computed (a week is the last 7 days \
and the board's last column counts as done): what was done this week, what is new, what is in progress, \
what is overdue or due soon, the open work per member, and one or two suggestions on what to focus on. \
Return no operations for a report. Write it entirely in the user's language; do not copy the English \
keys of the facts.

Write the reply as plain text without Markdown symbols such as ** or #; use short lines, and "- " for lists.

Only return operations when the user asks for a change; otherwise return an empty list. Operations are \
applied in order. They are not applied right away: the user sees them as a proposal and applies or rejects \
it, so the board below may not include changes you proposed earlier. Always write a short "reply" for the \
user, in the user's language (usually Persian), answering their question or describing the changes you \
propose; never say a change is done, because it is not applied until the user confirms it (for example \
"I suggest creating ..." rather than "I created ...").

Today is {today}.
"""

NULLABLE_STRING = {"type": ["string", "null"]}

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
                        "required": [
                            "type", "card_id", "column_id", "title", "details", "index",
                            "due_date", "priority", "assignee", "labels",
                        ],
                        "properties": {
                            "type": {"type": "string", "enum": ["create_card", "update_card", "move_card"]},
                            "card_id": NULLABLE_STRING,
                            "column_id": NULLABLE_STRING,
                            "title": NULLABLE_STRING,
                            "details": NULLABLE_STRING,
                            "index": {"type": ["integer", "null"]},
                            "due_date": NULLABLE_STRING,
                            "priority": {"type": ["string", "null"], "enum": ["low", "medium", "high", None]},
                            "assignee": NULLABLE_STRING,
                            "labels": {"type": ["array", "null"], "items": {"type": "string"}},
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
    type: Literal["create_card", "update_card", "move_card"]
    card_id: str | None = None
    column_id: str | None = None
    title: str | None = None
    details: str | None = None
    index: int | None = None
    due_date: DueDate | None = None
    priority: Priority | None = None
    assignee: Assignee | None = None
    labels: list[str] | None = None


DETAIL_FIELDS = ("due_date", "priority", "assignee", "labels")


class AssistantReply(BaseModel):
    reply: str
    operations: list[Operation]


class ApplyRequest(BaseModel):
    board_id: str
    operations: list[Operation] = Field(min_length=1, max_length=50)


class CardFields(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    details: str = Field(max_length=10000)
    due_date: DueDate | None
    priority: Priority | None
    assignee: str | None
    labels: list[str]


class Undo(BaseModel):
    """What a change replaced: the cards it created, the earlier fields of the cards it changed and the
    earlier card order of the columns it touched."""

    created: list[str]
    cards: dict[str, CardFields]
    columns: dict[str, list[str]]


class UndoRequest(BaseModel):
    board_id: str
    undo: Undo


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


def _require(value: str | None, field: str, op: Operation) -> str:
    if value is None or not value.strip():
        raise InvalidOperation(f"{op.type} needs {field}")
    return value.strip()


def apply_operation(conn: sqlite3.Connection, user_id: int, board_id: int, op: Operation) -> None:
    """Applies one operation; every id must belong to `board_id`."""
    # The model cannot clear a detail field: null always means "leave as is".
    dumped = op.model_dump()
    details = {f: dumped[f] for f in DETAIL_FIELDS if dumped[f] is not None}
    if op.type == "create_card":
        fields = {"title": _require(op.title, "title", op), "details": (op.details or "").strip()} | details
        service.create_card(conn, user_id, _require(op.column_id, "column_id", op), fields, board_id)
    elif op.type == "update_card":
        changes = dict(details)
        if op.title is not None:
            changes["title"] = _require(op.title, "title", op)
        if op.details is not None:
            changes["details"] = op.details.strip()
        service.update_card(conn, user_id, _require(op.card_id, "card_id", op), changes, board_id)
    else:
        index = op.index if op.index is not None else 10**9  # null means "at the bottom"
        if index < 0:
            raise InvalidOperation("move_card index cannot be negative")
        service.move_card(
            conn,
            user_id,
            _require(op.card_id, "card_id", op),
            _require(op.column_id, "column_id", op),
            index,
            board_id,
        )


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
        "SELECT k.title, k.column_id, k.due_date, k.created_at, k.moved_at, u.username AS assignee"
        " FROM cards k JOIN columns c ON c.id = k.column_id LEFT JOIN users u ON u.id = k.assignee_id"
        " WHERE c.board_id = ? ORDER BY c.position, k.position",
        (board_id,),
    ).fetchall()
    week_ago = (today - datetime.timedelta(days=7)).isoformat()
    soon = (today + datetime.timedelta(days=7)).isoformat()
    done = columns[-1]["id"] if columns else None
    open_cards = [c for c in cards if c["column_id"] != done]
    workload: dict[str, int] = {}
    for c in open_cards:
        workload[c["assignee"] or "(unassigned)"] = workload.get(c["assignee"] or "(unassigned)", 0) + 1

    def titles(rows) -> list[str]:
        return [r["title"] for r in rows]

    return {
        "cards_per_column": {col["title"]: sum(c["column_id"] == col["id"] for c in cards) for col in columns},
        "done_column": columns[-1]["title"] if columns else None,
        "done_this_week": titles(c for c in cards if c["column_id"] == done and (c["moved_at"] or "") >= week_ago),
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
    messages = [
        {
            "role": "system",
            "content": SYSTEM_PROMPT.format(today=today.isoformat())
            + "Current board:\n"
            + json.dumps(board, ensure_ascii=False)
            + "\nFacts for summaries:\n"
            + json.dumps(facts, ensure_ascii=False),
        },
        *history,
        {"role": "user", "content": body.message},
    ]
    return messages, board_id


def _apply_all(conn: sqlite3.Connection, user_id: int, board_id: int, operations: list[Operation]) -> None:
    for op in operations:
        apply_operation(conn, user_id, board_id, op)


def _check_operations(user_id: int, board_id: int, operations: list[Operation]) -> str | None:
    """Applies the operations and rolls them back: None if they all work, otherwise the reason."""
    try:
        with db.connect() as conn:
            _apply_all(conn, user_id, board_id, operations)
            conn.rollback()
    except (InvalidOperation, service.NotFound) as e:
        return f"Changes cannot be applied: {e}"
    return None


def _finish(raw: str, body: ChatRequest, user: User, board_id: int) -> dict:
    """Validates the model's JSON and its operations, which are returned as a proposal, not applied."""
    try:
        result = AssistantReply.model_validate_json(raw)
    except ValidationError as e:
        raise HTTPException(status_code=502, detail="AI returned an invalid response") from e

    error = _check_operations(user.id, board_id, result.operations) if result.operations else None

    with db.connect() as conn:
        # Only completed turns are stored, so failed ones never reach the model as history.
        conn.executemany(
            "INSERT INTO chat_messages (board_id, user_id, role, content) VALUES (?, ?, ?, ?)",
            [(board_id, user.id, "user", body.message), (board_id, user.id, "assistant", result.reply)],
        )
    return {
        "reply": result.reply,
        "operations": [] if error else [op.model_dump(mode="json") for op in result.operations],
        "error": error,
    }


CARD_FIELDS = ("title", "details", "due_date", "priority", "assignee", "labels")


def _undo_for(before: dict, after: dict, operations: list[Operation]) -> Undo:
    """The undo for a change, from the board before and after it."""
    created = [key for key in after["cards"] if key not in before["cards"]]
    changed = {op.card_id for op in operations if op.card_id in before["cards"]}
    touched = set(created) | changed
    after_order = {col["id"]: col["cardIds"] for col in after["columns"]}
    columns = {
        col["id"]: col["cardIds"]
        for col in before["columns"]
        if touched & (set(col["cardIds"]) | set(after_order[col["id"]]))
    }
    return Undo(
        created=created,
        cards={key: CardFields(**{f: before["cards"][key][f] for f in CARD_FIELDS}) for key in changed},
        columns=columns,
    )


@router.post("/apply")
def apply(body: ApplyRequest, user: Annotated[User, Depends(current_user)]) -> dict:
    """Applies a proposal from the chat, all or none; 409 if the board has changed so that it no longer
    fits. Returns the board and the undo for this change."""
    with db.connect() as conn:
        board_id = service.member_board(conn, user.id, body.board_id)
        before = service.get_board(conn, user.id, body.board_id)
    try:
        with db.connect() as conn:
            _apply_all(conn, user.id, board_id, body.operations)
            after = service.get_board(conn, user.id, body.board_id)
    except (InvalidOperation, service.NotFound) as e:
        raise HTTPException(status_code=409, detail=f"Changes cannot be applied: {e}") from None
    return {"board": after, "undo": _undo_for(before, after, body.operations).model_dump(mode="json")}


@router.post("/undo")
def undo(body: UndoRequest, user: Annotated[User, Depends(current_user)]) -> dict:
    """Puts back what an applied proposal changed (see Undo)."""
    with db.connect() as conn:
        board_id = service.member_board(conn, user.id, body.board_id)
        cards = {key: fields.model_dump() for key, fields in body.undo.cards.items()}
        try:
            service.restore_cards(conn, user.id, board_id, body.undo.created, cards, body.undo.columns)
        except service.NotFound as e:
            raise HTTPException(status_code=409, detail=f"Cannot undo: {e}") from None
        return service.get_board(conn, user.id, body.board_id)


@router.get("/history/{board_id}")
def get_history(board_id: str, user: Annotated[User, Depends(current_user)]) -> list[dict]:
    with db.connect() as conn:
        return _history(conn, service.member_board(conn, user.id, board_id), user.id, MAX_SHOWN)


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
