from dataclasses import dataclass

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from app import db

router = APIRouter(prefix="/api/auth")


@dataclass
class User:
    id: int
    username: str


class Credentials(BaseModel):
    username: str
    password: str


def current_user(request: Request) -> User:
    user_id = request.session.get("user_id")
    if user_id is not None:
        with db.connect() as conn:
            row = conn.execute("SELECT id, username FROM users WHERE id = ?", (user_id,)).fetchone()
        if row:
            return User(row["id"], row["username"])
    raise HTTPException(status_code=401, detail="Not authenticated")


@router.post("/login")
def login(credentials: Credentials, request: Request) -> dict[str, str]:
    with db.connect() as conn:
        row = conn.execute(
            "SELECT id, password_hash FROM users WHERE username = ?", (credentials.username,)
        ).fetchone()
    if not row or not db.verify_password(credentials.password, row["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid username or password")
    request.session["user_id"] = row["id"]
    return {"username": credentials.username}


@router.post("/logout")
def logout(request: Request) -> dict[str, bool]:
    request.session.clear()
    return {"ok": True}


@router.get("/me")
def me(user: User = Depends(current_user)) -> dict[str, str]:
    return {"username": user.username}
