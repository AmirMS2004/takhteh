"""Which boards the current request changed. Board writes call `touch`; `live.track_changes` collects them
for the request and tells the boards' open clients once the request has succeeded."""

from collections.abc import Iterator
from contextlib import contextmanager
from contextvars import ContextVar

_changed: ContextVar[set[int] | None] = ContextVar("changed_boards", default=None)
_notified: ContextVar[set[int] | None] = ContextVar("notified_users", default=None)


def collect() -> tuple[set[int], set[int]]:
    """Starts collecting for the current request; returns the sets that `touch` (boards) and `notify_user`
    (users with new notifications) fill."""
    changed: set[int] = set()
    notified: set[int] = set()
    _changed.set(changed)
    _notified.set(notified)
    return changed, notified


def notify_user(user_id: int) -> None:
    notified = _notified.get()
    if notified is not None:
        notified.add(user_id)


def touch(board_id: int) -> None:
    changed = _changed.get()
    if changed is not None:
        changed.add(board_id)


_via: ContextVar[str | None] = ContextVar("changed_via", default=None)


def via() -> str | None:
    """How the current changes are being made: "assistant" for an applied proposal, otherwise None."""
    return _via.get()


@contextmanager
def by_assistant() -> Iterator[None]:
    token = _via.set("assistant")
    try:
        yield
    finally:
        _via.reset(token)


@contextmanager
def quiet() -> Iterator[None]:
    """Writes inside are not announced (e.g. the assistant's dry run, which is rolled back)."""
    token = _changed.set(None)
    users = _notified.set(None)
    try:
        yield
    finally:
        _changed.reset(token)
        _notified.reset(users)
