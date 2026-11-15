import datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends
from pydantic import AfterValidator, BaseModel, Field, PlainSerializer, StringConstraints, model_validator

from app import board_service as service
from app import db
from app.auth import User, current_user

Title = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
Details = Annotated[str, StringConstraints(strip_whitespace=True, max_length=5000)]
Priority = Literal["low", "medium", "high"]
LabelColor = Literal["red", "orange", "yellow", "green", "blue", "purple"]
LabelName = Annotated[str, StringConstraints(strip_whitespace=True, max_length=30)]
# Validated as a date, dumped (and stored) as "YYYY-MM-DD" text.
DueDate = Annotated[datetime.date, PlainSerializer(lambda d: d.isoformat(), return_type=str)]
BoardTitle = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]
# The username of a board member; empty means "nobody".
Assignee = Annotated[
    str, StringConstraints(strip_whitespace=True, max_length=32), AfterValidator(lambda s: s or None)
]


class CardFields(BaseModel):
    """Optional card details; null clears a field. `labels` lists label ids from the same board."""

    due_date: DueDate | None = None
    priority: Priority | None = None
    assignee: Assignee | None = None
    labels: list[str] | None = Field(default=None, max_length=20)


router = APIRouter(prefix="/api")
CurrentUser = Annotated[User, Depends(current_user)]


class ColumnUpdate(BaseModel):
    title: Title


class CardCreate(CardFields):
    column_id: str
    title: Title
    details: Details = ""


class CardUpdate(CardFields):
    title: Title | None = None
    details: Details | None = None

    @model_validator(mode="after")
    def not_null(self):
        for field in ("title", "labels"):
            if field in self.model_fields_set and getattr(self, field) is None:
                raise ValueError(f"{field} cannot be null")
        return self


class LabelCreate(BaseModel):
    name: LabelName = ""
    color: LabelColor


class LabelUpdate(BaseModel):
    name: LabelName | None = None
    color: LabelColor | None = None


class CardMove(BaseModel):
    column_id: str
    index: int = Field(ge=0)


class BoardBody(BaseModel):
    title: BoardTitle


class MemberAdd(BaseModel):
    username: str


@router.get("/boards")
def list_boards(user: CurrentUser) -> list[dict]:
    with db.connect() as conn:
        return service.list_boards(conn, user.id)


@router.post("/boards", status_code=201)
def create_board(body: BoardBody, user: CurrentUser) -> dict:
    with db.connect() as conn:
        return service.create_board(conn, user.id, body.title)


@router.get("/boards/{board_id}")
def get_board(board_id: str, user: CurrentUser) -> dict:
    with db.connect() as conn:
        return service.get_board(conn, user.id, board_id)


@router.patch("/boards/{board_id}")
def rename_board(board_id: str, body: BoardBody, user: CurrentUser) -> dict[str, bool]:
    with db.connect() as conn:
        service.rename_board(conn, user.id, board_id, body.title)
    return {"ok": True}


@router.delete("/boards/{board_id}")
def delete_board(board_id: str, user: CurrentUser) -> dict[str, bool]:
    with db.connect() as conn:
        service.delete_board(conn, user.id, board_id)
    return {"ok": True}


@router.post("/boards/{board_id}/members", status_code=201)
def add_member(board_id: str, body: MemberAdd, user: CurrentUser) -> dict[str, bool]:
    with db.connect() as conn:
        service.add_member(conn, user.id, board_id, body.username)
    return {"ok": True}


@router.delete("/boards/{board_id}/members/{username}")
def remove_member(board_id: str, username: str, user: CurrentUser) -> dict[str, bool]:
    with db.connect() as conn:
        service.remove_member(conn, user.id, board_id, username)
    return {"ok": True}


@router.patch("/columns/{column_id}")
def rename_column(column_id: str, body: ColumnUpdate, user: CurrentUser) -> dict[str, bool]:
    with db.connect() as conn:
        service.rename_column(conn, user.id, column_id, body.title)
    return {"ok": True}


@router.post("/cards", status_code=201)
def create_card(body: CardCreate, user: CurrentUser) -> dict:
    with db.connect() as conn:
        fields = body.model_dump(exclude={"column_id"}, exclude_none=True)
        return service.create_card(conn, user.id, body.column_id, fields)


@router.patch("/cards/{card_id}")
def update_card(card_id: str, body: CardUpdate, user: CurrentUser) -> dict:
    with db.connect() as conn:
        # Only the fields sent in the request change.
        return service.update_card(conn, user.id, card_id, body.model_dump(exclude_unset=True))


@router.post("/cards/{card_id}/move")
def move_card(card_id: str, body: CardMove, user: CurrentUser) -> dict[str, bool]:
    with db.connect() as conn:
        service.move_card(conn, user.id, card_id, body.column_id, body.index)
    return {"ok": True}


@router.delete("/cards/{card_id}")
def delete_card(card_id: str, user: CurrentUser) -> dict[str, bool]:
    with db.connect() as conn:
        service.delete_card(conn, user.id, card_id)
    return {"ok": True}


@router.post("/boards/{board_id}/labels", status_code=201)
def create_label(board_id: str, body: LabelCreate, user: CurrentUser) -> dict:
    with db.connect() as conn:
        return service.create_label(conn, user.id, board_id, body.name, body.color)


@router.patch("/labels/{label_id}")
def update_label(label_id: str, body: LabelUpdate, user: CurrentUser) -> dict:
    with db.connect() as conn:
        return service.update_label(conn, user.id, label_id, body.model_dump(exclude_none=True))


@router.delete("/labels/{label_id}")
def delete_label(label_id: str, user: CurrentUser) -> dict[str, bool]:
    with db.connect() as conn:
        service.delete_label(conn, user.id, label_id)
    return {"ok": True}

