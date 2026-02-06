from __future__ import annotations

import json
import random
import threading
from dataclasses import dataclass
from typing import Dict, List, Optional
from uuid import uuid4

from flask import abort

from catanatron.game import Game
from catanatron.json import GameEncoder, action_from_json
from catanatron.models.map import BASE_MAP_TEMPLATE, CatanMap, initialize_tiles
from catanatron.models.player import Color, Player
from catanatron.models.enums import ActionPrompt, ActionType
from catanatron.state_functions import get_state_index
from catanatron.web.models import (
    PvpRoomState,
    db,
    get_game_state,
    upsert_game_state,
)

PVP_TOKEN_HEADER = "X-PVP-Token"
SEAT_ORDER = [Color.RED, Color.BLUE, Color.WHITE, Color.ORANGE]
MIN_PLAYERS_TO_START = 2


class PvpHumanPlayer(Player):
    """Placeholder player for PvP games. Actions come via HTTP requests."""

    def __init__(self, color: Color):
        super().__init__(color, is_bot=False)

    def decide(self, game, playable_actions):
        raise RuntimeError("PvP games expect actions from human clients.")


def _default_seats():
    return [{"color": color.value, "user_name": None} for color in SEAT_ORDER]


def _generate_board_seed() -> int:
    return random.SystemRandom().randrange(1, 2**63)


def _build_catan_map_from_seed(seed: int) -> CatanMap:
    rng = random.Random(seed)
    numbers = list(BASE_MAP_TEMPLATE.numbers)
    port_resources = list(BASE_MAP_TEMPLATE.port_resources)
    tile_resources = list(BASE_MAP_TEMPLATE.tile_resources)
    rng.shuffle(numbers)
    rng.shuffle(port_resources)
    rng.shuffle(tile_resources)
    tiles = initialize_tiles(
        BASE_MAP_TEMPLATE,
        list(numbers),
        list(port_resources),
        list(tile_resources),
    )
    return CatanMap.from_tiles(tiles)


def _build_board_preview(seed: Optional[int]) -> Optional[Dict]:
    if seed is None:
        return None
    preview_map = _build_catan_map_from_seed(seed)
    encoder = GameEncoder()
    tiles = [
        {"coordinate": coordinate, "tile": encoder.default(tile)}
        for coordinate, tile in preview_map.tiles.items()
    ]
    return {
        "seed": seed,
        "tiles": tiles,
    }


def _ensure_room(
    room_id: str,
    *,
    for_update: bool = False,
) -> PvpRoomState:
    query = db.session.query(PvpRoomState).filter_by(room_id=room_id)
    bind = db.session.get_bind()
    if for_update and bind is not None and bind.dialect.name != "sqlite":
        query = query.with_for_update()
    room = query.first()
    if room is None:
        abort(404, description="指定されたルームが見つかりません。")
    return room


def _serialize_room(room: PvpRoomState, session: Optional["SessionInfo"] = None) -> Dict:
    seats = [
        {
            "color": seat["color"],
            "user_name": seat["user_name"],
            "is_you": session is not None
            and session.room_id == room.room_id
            and seat["color"] == session.seat_color,
        }
        for seat in room.seats
    ]
    return {
        "room_id": room.room_id,
        "room_name": room.room_name,
        "seats": seats,
        "started": bool(room.started),
        "game_id": room.game_id,
        "state_index": room.state_index,
        "created_at": room.created_at.isoformat(),
        "updated_at": room.updated_at.isoformat(),
        "board_preview": _build_board_preview(room.board_seed),
    }


def list_rooms() -> List[Dict]:
    rooms = (
        db.session.query(PvpRoomState)
        .order_by(PvpRoomState.created_at.desc())
        .limit(100)
        .all()
    )
    return [_serialize_room(room) for room in rooms]


def create_room(room_name: Optional[str] = None) -> Dict:
    name = (room_name or "").strip() or "Room"
    room_id = uuid4().hex
    room = PvpRoomState(
        room_id=room_id,
        room_name=name,
        seats=_default_seats(),
        started=False,
        board_seed=_generate_board_seed(),
    )
    db.session.add(room)
    db.session.commit()
    return _serialize_room(room)


@dataclass(frozen=True)
class SessionInfo:
    token: str
    user_name: str
    room_id: str
    seat_color: Optional[str]


class _SessionStore:
    def __init__(self):
        self._lock = threading.RLock()
        self._sessions: Dict[str, SessionInfo] = {}

    def issue(
        self, user_name: str, room_id: str, seat_color: Optional[str]
    ) -> SessionInfo:
        token = uuid4().hex
        info = SessionInfo(
            token=token, user_name=user_name, room_id=room_id, seat_color=seat_color
        )
        with self._lock:
            self._sessions[token] = info
        return info

    def get(self, token: str) -> Optional[SessionInfo]:
        with self._lock:
            return self._sessions.get(token)

    def revoke(self, token: str) -> None:
        with self._lock:
            self._sessions.pop(token, None)


session_store = _SessionStore()


def join_room(room_id: str, user_name: str) -> Dict:
    if not user_name or not user_name.strip():
        abort(400, description="ユーザー名を入力してください。")
    user_name = user_name.strip()

    room = _ensure_room(room_id, for_update=True)

    seats: List[Dict[str, Optional[str]]] = json.loads(json.dumps(room.seats))

    for seat in seats:
        if seat["user_name"] == user_name:
            info = session_store.issue(user_name, room.room_id, seat["color"])
            db.session.commit()
            return {
                "token": info.token,
                "seat_color": info.seat_color,
                "user_name": info.user_name,
                "is_spectator": False,
                "room": _serialize_room(room, info),
            }

    if room.started:
        info = session_store.issue(user_name, room.room_id, None)
        db.session.commit()
        return {
            "token": info.token,
            "seat_color": info.seat_color,
            "user_name": info.user_name,
            "is_spectator": True,
            "room": _serialize_room(room, info),
        }

    for seat in seats:
        if seat["user_name"] is None:
            seat["user_name"] = user_name
            room.seats = seats
            db.session.add(room)
            db.session.commit()
            info = session_store.issue(user_name, room.room_id, seat["color"])
            return {
                "token": info.token,
                "seat_color": info.seat_color,
                "user_name": info.user_name,
                "is_spectator": False,
                "room": _serialize_room(room, info),
            }

    info = session_store.issue(user_name, room.room_id, None)
    db.session.commit()
    return {
        "token": info.token,
        "seat_color": info.seat_color,
        "user_name": info.user_name,
        "is_spectator": True,
        "room": _serialize_room(room, info),
    }


def leave_room(session: SessionInfo) -> Dict:
    room = _ensure_room(session.room_id, for_update=True)
    if room.started and session.seat_color is not None:
        abort(400, description="ゲーム進行中は退出できません。")

    if session.seat_color is not None:
        seats = json.loads(json.dumps(room.seats))
        for seat in seats:
            if seat["color"] == session.seat_color:
                seat["user_name"] = None
        room.seats = seats
        db.session.add(room)
        db.session.commit()
    session_store.revoke(session.token)
    return _serialize_room(room)


def refresh_room_board(session: SessionInfo) -> Dict:
    room = _ensure_room(session.room_id, for_update=True)
    if session.seat_color != SEAT_ORDER[0].value:
        abort(403, description="ホストのみ盤面を変更できます。")
    if room.started:
        abort(400, description="ゲーム開始後は更新できません。")
    room.board_seed = _generate_board_seed()
    db.session.add(room)
    db.session.commit()
    return _serialize_room(room, session)


def get_room_status(room_id: str, token: Optional[str]) -> Dict:
    session = peek_session(token, room_id)
    room = _ensure_room(room_id)
    return _serialize_room(room, session)


def require_session(token: Optional[str], room_id: Optional[str] = None) -> SessionInfo:
    if not token:
        abort(401, description="PvP トークンが必要です。")
    session = session_store.get(token)
    if session is None:
        abort(401, description="PvP トークンが無効です。")
    if room_id and session.room_id != room_id:
        abort(403, description="指定されたルームのトークンではありません。")
    return session


def peek_session(token: Optional[str], room_id: Optional[str] = None) -> Optional[SessionInfo]:
    if not token:
        return None
    session = session_store.get(token)
    if session is None:
        return None
    if room_id and session.room_id != room_id:
        return None
    return session


def start_room(session: SessionInfo) -> Dict:
    room = _ensure_room(session.room_id, for_update=True)
    if session.seat_color != SEAT_ORDER[0].value:
        abort(403, description="ホストのみ開始できます。")

    if room.started and room.game_id:
        return {"game_id": room.game_id}

    filled_seats = [seat for seat in room.seats if seat["user_name"] is not None]
    if len(filled_seats) < MIN_PLAYERS_TO_START:
        abort(400, description=f"{MIN_PLAYERS_TO_START}人以上のプレイヤーが必要です。")

    players = [PvpHumanPlayer(Color(seat["color"])) for seat in filled_seats]
    if room.board_seed is None:
        room.board_seed = _generate_board_seed()
    catan_map = _build_catan_map_from_seed(room.board_seed)
    game = Game(players=players, catan_map=catan_map)
    upsert_game_state(game)
    room.game_id = game.id
    room.started = True
    room.state_index = get_state_index(game.state)
    db.session.add(room)
    db.session.commit()
    return {"game_id": room.game_id}


def get_room_game(session: SessionInfo, state_index: Optional[int] = None) -> Game:
    room = _ensure_room(session.room_id)
    if room.game_id is None:
        abort(400, description="まだゲームが開始されていません。")
    return get_game_state(room.game_id, state_index)


def submit_action(
    session: SessionInfo,
    action_payload,
    expected_state_index: Optional[int],
) -> Game:
    if action_payload is None:
        abort(400, description="action フィールドが必要です。")

    room = _ensure_room(session.room_id, for_update=True)
    if not room.started or room.game_id is None:
        abort(400, description="ゲームが開始されていません。")

    if session.seat_color is None:
        abort(403, description="観戦者は操作できません。")

    game = get_game_state(room.game_id)
    parsed_action = action_from_json(action_payload)
    if parsed_action.color.value != session.seat_color:
        abort(403, description="この色では操作できません。")
    current_color = game.state.current_color().value
    if (
        parsed_action.action_type not in (ActionType.ACCEPT_TRADE, ActionType.REJECT_TRADE)
        or game.state.current_prompt != ActionPrompt.DECIDE_TRADE
    ):
        if current_color != session.seat_color:
            abort(403, description="現在の手番ではありません。")

    current_state_index = get_state_index(game.state)
    if expected_state_index is not None:
        try:
            expected_state_index = int(expected_state_index)
        except (TypeError, ValueError):
            abort(400, description="expected_state_index は整数で指定してください。")

    if expected_state_index is not None and expected_state_index != current_state_index:
        abort(409, description="状態が最新ではありません。")

    try:
        game.execute(parsed_action)
    except ValueError as exc:
        abort(400, description=str(exc))
    upsert_game_state(game)
    room.state_index = get_state_index(game.state)
    db.session.add(room)
    db.session.commit()
    return game
