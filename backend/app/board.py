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
Label = Literal["red", "orange", "yellow", "green", "blue", "purple"]
# Validated as a date, dumped (and stored) as "YYYY-MM-DD" text.
DueDate = Annotated[datetime.date, PlainSerializer(lambda d: d.isoformat(), return_type=str)]
# An empty assignee means "nobody".
Assignee = Annotated[
    str, StringConstraints(strip_whitespace=True, max_length=50), AfterValidator(lambda s: s or None)
]


class CardFields(BaseModel):
    """Optional card details; null clears a field."""

    due_date: DueDate | None = None
    priority: Priority | None = None
    label: Label | None = None
    assignee: Assignee | None = None

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
    def title_not_null(self):
        if "title" in self.model_fields_set and self.title is None:
            raise ValueError("title cannot be null")
        return self


class CardMove(BaseModel):
    column_id: str
    index: int = Field(ge=0)


@router.get("/board")
def get_board(user: CurrentUser) -> dict:
    with db.connect() as conn:
        return service.get_board(conn, user.id)


@router.patch("/columns/{column_id}")
def rename_column(column_id: str, body: ColumnUpdate, user: CurrentUser) -> dict[str, bool]:
    with db.connect() as conn:
        service.rename_column(conn, user.id, column_id, body.title)
    return {"ok": True}


@router.post("/cards", status_code=201)
def create_card(body: CardCreate, user: CurrentUser) -> dict:
    with db.connect() as conn:
        return service.create_card(conn, user.id, body.column_id, body.model_dump(exclude={"column_id"}))


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
