import json
import sqlite3
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, ValidationError

from app import ai, db
from app import board_service as service
from app.auth import User, current_user

router = APIRouter(prefix="/api/ai")

SYSTEM_PROMPT = """You are the assistant inside a kanban project-management app. The user sees their board and \
talks to you in a sidebar.

The current board is given below as JSON: "columns" in display order, each with "id", "title" and "cardIds" \
(top to bottom), and "cards" keyed by card id, each with "title" and "details".

You can change the board by returning operations:
- create_card: column_id, title, details (use "" when there are no details)
- update_card: card_id, and the new title and/or details (null keeps the current value)
- move_card: card_id, column_id, index (0 is the top of the column; null puts it at the bottom)
Set every field an operation does not use to null. Only use ids that exist on the board. Columns cannot be \
created, renamed or deleted, and cards cannot be deleted; if asked, say so.

Only return operations when the user asks for a change; otherwise return an empty list. Operations are \
applied in order. Always write a short "reply" for the user, in the user's language (usually Persian), \
describing what you did or answering their question.

Current board:
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
                        "required": ["type", "card_id", "column_id", "title", "details", "index"],
                        "properties": {
                            "type": {"type": "string", "enum": ["create_card", "update_card", "move_card"]},
                            "card_id": NULLABLE_STRING,
                            "column_id": NULLABLE_STRING,
                            "title": NULLABLE_STRING,
                            "details": NULLABLE_STRING,
                            "index": {"type": ["integer", "null"]},
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
    if op.type == "create_card":
        title = _require(op.title, "title", op)
        service.create_card(conn, user_id, _require(op.column_id, "column_id", op), title, (op.details or "").strip())
    elif op.type == "update_card":
        title = op.title.strip() if op.title is not None else None
        if title == "":
            raise InvalidOperation("update_card title cannot be empty")
        details = op.details.strip() if op.details is not None else None
        service.update_card(conn, user_id, _require(op.card_id, "card_id", op), title, details)
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
        {"role": "system", "content": SYSTEM_PROMPT + json.dumps(board, ensure_ascii=False)},
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
