import datetime
import json
import sqlite3
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, ValidationError

from app import ai, db
from app import board_service as service
from app.auth import User, current_user
from app.board import Assignee, DueDate, Priority

router = APIRouter(prefix="/api/ai")

SYSTEM_PROMPT = """You are the assistant inside a kanban project-management app. The user sees their board and \
talks to you in a sidebar.

The current board is given below as JSON: "columns" in display order, each with "id", "title" and "cardIds" \
(top to bottom), and "cards" keyed by card id, each with "title", "details", "due_date" ("YYYY-MM-DD"), "priority" ("low", "medium" or "high"), "assignee" (a person's name) and "labels" (a list of label ids); the first three may be null. The board's labels are in "labels", each with "id", "name" (may be empty) and "color".

You can change the board by returning operations:
- create_card: column_id, title, details (use "" when there are no details), and optionally due_date, priority, assignee, labels
- update_card: card_id, and any of title, details, due_date, priority, assignee to change (null keeps the current value); "labels" replaces the card's whole label list (null keeps it), so include labels it should keep
- move_card: card_id, column_id, index (0 is the top of the column; null puts it at the bottom)
Only use label ids from the board's "labels"; you cannot create, rename or delete labels.
Set every field an operation does not use to null. Only use ids that exist on the board. Columns cannot be \
created, renamed or deleted, and cards cannot be deleted; if asked, say so.

Only return operations when the user asks for a change; otherwise return an empty list. Operations are \
applied in order. Always write a short "reply" for the user, in the user's language (usually Persian), \
describing what you did or answering their question.

Today is {today}. Current board:
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


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    history: list[ChatMessage] = Field(default=[], max_length=50)


def _require(value: str | None, field: str, op: Operation) -> str:
    if value is None or not value.strip():
        raise InvalidOperation(f"{op.type} needs {field}")
    return value.strip()


def apply_operation(conn: sqlite3.Connection, user_id: int, op: Operation) -> None:
    # The model cannot clear a detail field: null always means "leave as is".
    dumped = op.model_dump()
    details = {f: dumped[f] for f in DETAIL_FIELDS if dumped[f] is not None}
    if op.type == "create_card":
        fields = {"title": _require(op.title, "title", op), "details": (op.details or "").strip()} | details
        service.create_card(conn, user_id, _require(op.column_id, "column_id", op), fields)
    elif op.type == "update_card":
        changes = dict(details)
        if op.title is not None:
            changes["title"] = _require(op.title, "title", op)
        if op.details is not None:
            changes["details"] = op.details.strip()
        service.update_card(conn, user_id, _require(op.card_id, "card_id", op), changes)
    else:
        index = op.index if op.index is not None else 10**9  # null means "at the bottom"
        if index < 0:
            raise InvalidOperation("move_card index cannot be negative")
        service.move_card(
            conn, user_id, _require(op.card_id, "card_id", op), _require(op.column_id, "column_id", op), index
        )


@router.post("/chat")
def chat(body: ChatRequest, user: Annotated[User, Depends(current_user)]) -> dict:
    with db.connect() as conn:
        board = service.get_board(conn, user.id)

    messages = [
        {
            "role": "system",
            "content": SYSTEM_PROMPT.format(today=datetime.date.today().isoformat())
            + json.dumps(board, ensure_ascii=False),
        },
        *[m.model_dump() for m in body.history],
        {"role": "user", "content": body.message},
    ]
    raw = ai.chat(messages, response_format=RESPONSE_FORMAT)
    try:
        result = AssistantReply.model_validate_json(raw)
    except ValidationError as e:
        raise HTTPException(status_code=502, detail="AI returned an invalid response") from e

    # All operations succeed together or none are applied.
    error = None
    try:
        with db.connect() as conn:
            for op in result.operations:
                apply_operation(conn, user.id, op)
    except (InvalidOperation, service.NotFound) as e:
        error = f"Changes were not applied: {e}"

    with db.connect() as conn:
        board = service.get_board(conn, user.id)
    return {
        "reply": result.reply,
        "board": board,
        "applied": 0 if error else len(result.operations),
        "error": error,
    }
