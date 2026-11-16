"""Live updates. Each open board keeps a WebSocket to /api/boards/{id}/live; after a request changes a
board, every client on it gets {"type": "board_changed", "board": id, "origin": client id} and reloads.
The origin (the X-Client-Id header of the request) lets the client that made the change ignore it.
Clients live in this process's memory, which fits the single uvicorn process of the app."""

from fastapi import APIRouter, Request, WebSocket, WebSocketDisconnect

from app import board_service as service
from app import changes, db


class Hub:
    def __init__(self) -> None:
        self.clients: dict[int, set[WebSocket]] = {}
        # Per user, for "you have new notifications".
        self.users: dict[int, set[WebSocket]] = {}

    def join(self, board_id: int, ws: WebSocket) -> None:
        self.clients.setdefault(board_id, set()).add(ws)

    def leave(self, board_id: int, ws: WebSocket) -> None:
        self.clients.get(board_id, set()).discard(ws)

    async def publish(self, board_ids: set[int], origin: str | None) -> None:
        for board_id in board_ids:
            event = {"type": "board_changed", "board": service.board_key(board_id), "origin": origin}
            for ws in list(self.clients.get(board_id, ())):
                try:
                    await ws.send_json(event)
                except Exception:  # the client went away; its own handler cleans up
                    self.leave(board_id, ws)

    async def publish_users(self, user_ids: set[int]) -> None:
        for user_id in user_ids:
            for ws in list(self.users.get(user_id, ())):
                try:
                    await ws.send_json({"type": "notifications"})
                except Exception:
                    self.users.get(user_id, set()).discard(ws)


hub = Hub()


async def track_changes(request: Request):
    """Router dependency: collects the boards a request changes and, if it succeeds, tells their clients."""
    changed, notified = changes.collect()
    yield
    if changed:
        await hub.publish(changed, request.headers.get("x-client-id"))
    if notified:
        await hub.publish_users(notified)


router = APIRouter()


@router.websocket("/api/notifications/live")
async def notifications_live(websocket: WebSocket) -> None:
    """Tells the signed-in user's tabs when they have new notifications."""
    user_id = websocket.session.get("user_id")
    if user_id is None:
        await websocket.close(code=1008)
        return
    await websocket.accept()
    hub.users.setdefault(user_id, set()).add(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        hub.users.get(user_id, set()).discard(websocket)


@router.websocket("/api/boards/{board}/live")
async def live(websocket: WebSocket, board: str) -> None:
    user_id = websocket.session.get("user_id")
    try:
        if user_id is None:
            raise service.NotFound(board)
        with db.connect() as conn:
            board_id = service.member_board(conn, user_id, board)
    except service.NotFound:
        await websocket.close(code=1008)  # not signed in, or not on this board
        return
    await websocket.accept()
    hub.join(board_id, websocket)
    try:
        while True:
            await websocket.receive_text()  # clients send nothing; this waits for the disconnect
    except WebSocketDisconnect:
        pass
    finally:
        hub.leave(board_id, websocket)
