from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field, StringConstraints

from app import board_service as service
from app import db
from app.auth import User, current_user

Title = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
Details = Annotated[str, StringConstraints(strip_whitespace=True, max_length=5000)]

router = APIRouter(prefix="/api")
CurrentUser = Annotated[User, Depends(current_user)]


class ColumnUpdate(BaseModel):
    title: Title


class CardCreate(BaseModel):
    column_id: str
    title: Title
    details: Details = ""


class CardUpdate(BaseModel):
    title: Title | None = None
    details: Details | None = None


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
        return service.create_card(conn, user.id, body.column_id, body.title, body.details)


@router.patch("/cards/{card_id}")
def update_card(card_id: str, body: CardUpdate, user: CurrentUser) -> dict:
    with db.connect() as conn:
        return service.update_card(conn, user.id, card_id, body.title, body.details)


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
