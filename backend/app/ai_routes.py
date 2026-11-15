from typing import Annotated

from fastapi import APIRouter, Depends

from app import ai
from app.auth import User, current_user

router = APIRouter(prefix="/api/ai")


@router.post("/ping")
def ping(_: Annotated[User, Depends(current_user)]) -> dict[str, str]:
    """Connectivity check: asks the model a trivial question. Replaced by /api/ai/chat in Part 9."""
    answer = ai.chat([{"role": "user", "content": "What is 2+2? Reply with only the number."}])
    return {"answer": answer}
