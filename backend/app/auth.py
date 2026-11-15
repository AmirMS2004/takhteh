import sqlite3
from dataclasses import dataclass
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import AfterValidator, BaseModel, Field

from app import db

router = APIRouter(prefix="/api/auth")


@dataclass
class User:
    id: int
    username: str


def normalize(username: str) -> str:
    """Usernames are case-insensitive: "User" and "user" are the same account."""
    return username.strip().lower()


Username = Annotated[str, AfterValidator(normalize)]
NewPassword = Annotated[str, Field(min_length=8, max_length=128)]


class Credentials(BaseModel):
    username: Username
    password: str


class SignUp(BaseModel):
    # Pattern is checked on the raw value; surrounding spaces are not allowed.
    username: Annotated[str, Field(pattern=r"^[A-Za-z0-9_]{3,32}$"), AfterValidator(normalize)]
    password: NewPassword


class PasswordChange(BaseModel):
    current_password: str
    new_password: NewPassword


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
            "SELECT id, username, password_hash FROM users WHERE username = ?", (credentials.username,)
        ).fetchone()
    if not row or not db.verify_password(credentials.password, row["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid username or password")
    request.session["user_id"] = row["id"]
    return {"username": row["username"]}


@router.post("/signup", status_code=201)
def signup(body: SignUp, request: Request) -> dict[str, str]:
    """Creates an account with an empty five-column board and signs the user in."""
    try:
        with db.connect() as conn:
            user_id = db.create_user(conn, body.username, body.password)
    except sqlite3.IntegrityError:
        raise HTTPException(status_code=409, detail="Username is taken") from None
    request.session["user_id"] = user_id
    return {"username": body.username}


@router.post("/password")
def change_password(body: PasswordChange, user: Annotated[User, Depends(current_user)]) -> dict[str, bool]:
    with db.connect() as conn:
        row = conn.execute("SELECT password_hash FROM users WHERE id = ?", (user.id,)).fetchone()
        if not db.verify_password(body.current_password, row["password_hash"]):
            raise HTTPException(status_code=403, detail="Current password is wrong")
        conn.execute(
            "UPDATE users SET password_hash = ? WHERE id = ?", (db.hash_password(body.new_password), user.id)
        )
    return {"ok": True}


@router.post("/logout")
def logout(request: Request) -> dict[str, bool]:
    request.session.clear()
    return {"ok": True}


@router.get("/me")
def me(user: User = Depends(current_user)) -> dict[str, str]:
    return {"username": user.username}
