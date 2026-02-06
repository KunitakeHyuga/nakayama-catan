import os
import json
import pickle
from contextlib import contextmanager
from typing import Any, Dict, Optional
from catanatron.json import GameEncoder

from catanatron.game import Game
from catanatron.state_functions import get_state_index
from datetime import datetime
from sqlalchemy import (
    MetaData,
    Column,
    Integer,
    String,
    LargeBinary,
    Boolean,
    DateTime,
    JSON,
    BigInteger,
    create_engine,
)
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.ext.mutable import MutableList
from sqlalchemy.orm import Session
from flask_sqlalchemy import SQLAlchemy
from flask import abort

# Using approach from: https://stackoverflow.com/questions/41004540/using-sqlalchemy-models-in-and-out-of-flask/41014157
metadata = MetaData()
Base = declarative_base(metadata=metadata)


class GameState(Base):
    __tablename__ = "game_states"

    id = Column(Integer, primary_key=True)
    uuid = Column(String(64), nullable=False)
    state_index = Column(Integer, nullable=False)
    state = Column(String, nullable=False)
    pickle_data = Column(LargeBinary, nullable=False)

    # TODO: unique uuid and state_index
    @staticmethod
    def from_game(game: Game):
        state = json.dumps(game, cls=GameEncoder)
        pickle_data = pickle.dumps(game, pickle.HIGHEST_PROTOCOL)
        return GameState(
            uuid=game.id,
            state_index=get_state_index(game.state),
            state=state,
            pickle_data=pickle_data,
        )


db = SQLAlchemy(metadata=metadata)


class GameSummary(Base):
    __tablename__ = "game_summaries"

    id = Column(Integer, primary_key=True)
    game_id = Column(String(64), unique=True, nullable=False)
    latest_state_index = Column(Integer, nullable=False)
    player_colors = Column(MutableList.as_mutable(JSON), nullable=False)
    current_color = Column(String(16), nullable=True)
    winning_color = Column(String(16), nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class GameEvent(Base):
    __tablename__ = "game_events"

    id = Column(Integer, primary_key=True)
    game_id = Column(String(64), nullable=False, index=True)
    state_index = Column(Integer, nullable=True)
    event_type = Column(String(64), nullable=False)
    payload = Column(JSON, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow, index=True)


class PvpRoomState(Base):
    __tablename__ = "pvp_room_state"

    id = Column(Integer, primary_key=True)
    room_id = Column(String(64), unique=True, nullable=False)
    room_name = Column(String(128), nullable=False, default="Room")
    seats = Column(MutableList.as_mutable(JSON), nullable=False)
    started = Column(Boolean, nullable=False, default=False)
    game_id = Column(String(64), nullable=True)
    state_index = Column(Integer, nullable=True)
    board_seed = Column(BigInteger, nullable=True)
    updated_at = Column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)


@contextmanager
def database_session():
    """Can use like:
    with database_session() as session:
        game_states = session.query(GameState).all()
    """
    database_url = os.environ.get(
        "DATABASE_URL",
        "postgresql://catanatron:victorypoint@127.0.0.1:5432/catanatron_db",
    )
    engine = create_engine(database_url)
    session = Session(engine)
    try:
        yield session
    finally:
        session.expunge_all()
        session.close()


def _upsert_game_summary(game: Game, session):
    summary = session.query(GameSummary).filter_by(game_id=game.id).first()
    player_colors = [color.value for color in game.state.colors]
    current_color = game.state.current_color()
    winning_color = game.winning_color()
    latest_state_index = get_state_index(game.state)
    if summary is None:
        summary = GameSummary(
            game_id=game.id,
            latest_state_index=latest_state_index,
            player_colors=player_colors,
            current_color=current_color.value if current_color else None,
            winning_color=winning_color.value if winning_color else None,
        )
        session.add(summary)
    else:
        summary.latest_state_index = latest_state_index
        summary.player_colors = player_colors
        summary.current_color = current_color.value if current_color else None
        summary.winning_color = winning_color.value if winning_color else None
        summary.updated_at = datetime.utcnow()


def upsert_game_state(game: Game, session_param=None):
    game_state = GameState.from_game(game)
    session = session_param or db.session
    session.add(game_state)
    _upsert_game_summary(game, session)
    session.commit()
    return game_state


def get_game_state(game_id, state_index=None) -> Game | None:
    """
    Returns the game from database.
    """
    if state_index is None:
        result = (
            db.session.query(GameState)
            .filter_by(uuid=game_id)
            .order_by(GameState.state_index.desc())
            .first()
        )
        if result is None:
            abort(404)
    else:
        result = (
            db.session.query(GameState)
            .filter_by(uuid=game_id, state_index=state_index)
            .first()
        )
        if result is None:
            abort(404)
    db.session.commit()
    game = pickle.loads(result.pickle_data)  # type: ignore
    return game


def delete_game(game_id: str) -> bool:
    """Remove stored states and summary for a game id."""
    deleted_states = (
        db.session.query(GameState)
        .filter_by(uuid=game_id)
        .delete(synchronize_session=False)
    )
    deleted_summary = (
        db.session.query(GameSummary)
        .filter_by(game_id=game_id)
        .delete(synchronize_session=False)
    )
    deleted_events = (
        db.session.query(GameEvent)
        .filter_by(game_id=game_id)
        .delete(synchronize_session=False)
    )
    if deleted_states == 0 and deleted_summary == 0 and deleted_events == 0:
        db.session.rollback()
        return False
    db.session.commit()
    return True


def log_game_event(
    game_id: str,
    event_type: str,
    state_index: Optional[int] = None,
    payload: Optional[Dict[str, Any]] = None,
):
    event = GameEvent(
        game_id=game_id,
        state_index=state_index,
        event_type=event_type,
        payload=payload,
        created_at=datetime.utcnow(),
    )
    db.session.add(event)
    db.session.commit()
    return event


def list_game_events(game_id: str, event_type: str | None = None):
    query = db.session.query(GameEvent).filter_by(game_id=game_id)
    if event_type:
        query = query.filter_by(event_type=event_type)
    return query.order_by(GameEvent.created_at.asc()).all()
