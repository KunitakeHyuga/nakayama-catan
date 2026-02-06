import json
import logging
import traceback
from typing import List

from flask import Response, Blueprint, jsonify, abort, request
from sqlalchemy import func

from catanatron.web.models import (
    upsert_game_state,
    get_game_state,
    GameState,
    GameSummary,
    db,
    delete_game,
    list_game_events,
    log_game_event,
)
from catanatron.json import GameEncoder, action_from_json
from catanatron.models.player import Color, Player, RandomPlayer
from catanatron.game import Game
from catanatron.models.enums import Action, ActionPrompt, ActionType
from catanatron.models.actions import generate_playable_actions
from catanatron.players.value import ValueFunctionPlayer
from catanatron.players.minimax import AlphaBetaPlayer
from catanatron.web.mcts_analysis import GameAnalyzer
from catanatron.web.negotiation import (
    request_negotiation_advice,
    NegotiationAdviceError,
    NegotiationAdviceUnavailableError,
)
from catanatron.web.pvp_room import (
    PVP_TOKEN_HEADER,
    create_room,
    get_room_status,
    get_room_game,
    join_room,
    leave_room,
    list_rooms,
    peek_session,
    require_session,
    refresh_room_board,
    start_room,
    submit_action,
)

bp = Blueprint("api", __name__, url_prefix="/api")


def player_factory(player_key):
    if player_key[0] == "CATANATRON":
        return AlphaBetaPlayer(player_key[1], 2, True)
    elif player_key[0] == "RANDOM":
        return RandomPlayer(player_key[1])
    elif player_key[0] == "HUMAN":
        return ValueFunctionPlayer(player_key[1], is_bot=False)
    else:
        raise ValueError("Invalid player key")


@bp.route("/games", methods=("POST",))
def post_game_endpoint():
    """Create a new game with the provided player configuration.
    ---
    tags:
      - games
    consumes:
      - application/json
    parameters:
      - in: body
        name: players
        schema:
          type: object
          properties:
            players:
              type: array
              items:
                type: string
          required:
            - players
    responses:
      200:
        description: Returns the created game ID
    """
    if not request.is_json or request.json is None or "players" not in request.json:
        abort(400, description="Missing or invalid JSON body: 'players' key required")
    player_keys = request.json["players"]
    players = list(map(player_factory, zip(player_keys, Color)))

    game = Game(players=players)
    upsert_game_state(game)
    return jsonify({"game_id": game.id})


@bp.route("/games/<string:game_id>", methods=("DELETE",))
def delete_game_endpoint(game_id):
    """Delete a game by ID.
    ---
    tags:
      - games
    parameters:
      - in: path
        name: game_id
        required: true
        schema:
          type: string
    responses:
      200:
        description: Game deleted
      404:
        description: Game not found
    """
    deleted = delete_game(game_id)
    if not deleted:
        abort(404, description="Resource not found")
    return jsonify({"deleted": True, "game_id": game_id})


@bp.route("/games", methods=("GET",))
def list_games_endpoint():
    """List recent games.
    ---
    tags:
      - games
    responses:
      200:
        description: Recent games
    """
    summaries = (
        db.session.query(GameSummary)
        .order_by(GameSummary.updated_at.desc())
        .limit(200)
        .all()
    )
    payload = []
    for summary in summaries:
        turns_completed = None
        try:
            game = get_game_state(summary.game_id, summary.latest_state_index)
            turns_completed = sum(
                1
                for record in getattr(game.state, "action_records", [])
                if record.action.action_type == ActionType.END_TURN
            )
        except Exception as exc:
            logging.warning(
                "Failed to compute turn count for %s: %s", summary.game_id, exc
            )
        payload.append(
            {
                "game_id": summary.game_id,
                "state_index": summary.latest_state_index,
                "winning_color": summary.winning_color,
                "current_color": summary.current_color,
                "player_colors": summary.player_colors,
                "turns_completed": turns_completed,
                "updated_at": summary.updated_at.isoformat()
                if summary.updated_at
                else None,
            }
        )
    if not payload:
        legacy = (
            db.session.query(
                GameState.uuid,
                func.max(GameState.state_index).label("state_index"),
            )
            .group_by(GameState.uuid)
            .order_by(func.max(GameState.state_index).desc())
            .limit(200)
            .all()
        )
        for uuid, state_index in legacy:
            game = get_game_state(uuid, state_index)
            current_color = game.state.current_color()
            winning_color = game.winning_color()
            turns_completed = sum(
                1
                for record in getattr(game.state, "action_records", [])
                if record.action.action_type == ActionType.END_TURN
            )
            payload.append(
                {
                    "game_id": uuid,
                    "state_index": state_index,
                    "winning_color": winning_color.value if winning_color else None,
                    "current_color": current_color.value if current_color else None,
                    "player_colors": [color.value for color in game.state.colors],
                    "turns_completed": turns_completed,
                    "updated_at": None,
                }
            )
    return jsonify({"games": payload})


@bp.route("/games/<string:game_id>/states/<string:state_index>", methods=("GET",))
def get_game_endpoint(game_id, state_index):
    """Get a specific game state.
    ---
    tags:
      - games
    parameters:
      - in: path
        name: game_id
        required: true
        schema:
          type: string
      - in: path
        name: state_index
        required: true
        schema:
          type: string
    responses:
      200:
        description: Game state payload
      404:
        description: Not found
    """
    parsed_state_index = _parse_state_index(state_index)
    game = get_game_state(game_id, parsed_state_index)
    if game is None:
        abort(404, description="Resource not found")

    payload = json.dumps(game, cls=GameEncoder)
    return Response(
        response=payload,
        status=200,
        mimetype="application/json",
    )


@bp.route("/games/<string:game_id>/events", methods=("GET",))
def list_game_events_endpoint(game_id):
    """List events for a game.
    ---
    tags:
      - games
    parameters:
      - in: path
        name: game_id
        required: true
        schema:
          type: string
      - in: query
        name: event_type
        schema:
          type: string
    responses:
      200:
        description: Events for the game
    """
    event_type = request.args.get("event_type")
    events = list_game_events(game_id, event_type)
    payload = []
    for event in events:
        payload.append(
            {
                "event_id": event.id,
                "game_id": event.game_id,
                "event_type": event.event_type,
                "state_index": event.state_index,
                "created_at": event.created_at.isoformat()
                if event.created_at
                else None,
                "payload": event.payload,
            }
        )
    return jsonify({"events": payload})


@bp.route("/games/<string:game_id>/actions", methods=["POST"])
def post_action_endpoint(game_id):
    """Submit an action for a game.
    ---
    tags:
      - games
    parameters:
      - in: path
        name: game_id
        required: true
        schema:
          type: string
    consumes:
      - application/json
    responses:
      200:
        description: Updated game state
      404:
        description: Game not found
    """
    game = get_game_state(game_id)
    if game is None:
        abort(404, description="Resource not found")

    if game.winning_color() is not None:
        return Response(
            response=json.dumps(game, cls=GameEncoder),
            status=200,
            mimetype="application/json",
        )

    body_is_empty = (not request.data) or request.json is None or request.json == {}
    if not body_is_empty:
        action = action_from_json(request.json)
        try:
            game.execute(action)
        except ValueError as exc:
            logging.warning("Invalid action for game %s: %s", game_id, exc)
            abort(400, description=str(exc))
        upsert_game_state(game)
    else:
        if game.state.current_player().is_bot:
            game.play_tick()
            upsert_game_state(game)
        elif _process_pending_trade_bots(game):
            upsert_game_state(game)
        else:
            abort(
                400,
                description="Action payload required when it's a human player's turn.",
            )

    return Response(
        response=json.dumps(game, cls=GameEncoder),
        status=200,
        mimetype="application/json",
    )


def _process_pending_trade_bots(game) -> bool:
    state = game.state
    if (
        not state.is_resolving_trade
        or state.current_prompt != ActionPrompt.DECIDE_TRADE
    ):
        return False

    trade_vector = getattr(state, "current_trade", ())
    offerer_index = (
        trade_vector[10]
        if len(trade_vector) >= 11 and isinstance(trade_vector[10], int)
        else state.current_turn_index
    )
    num_players = len(state.colors)
    if num_players <= 1:
        return False
    offerer_index = offerer_index % num_players

    responses = list(
        getattr(state, "trade_responses", tuple(False for _ in state.colors))
    )
    if len(responses) < num_players:
        responses.extend([False] * (num_players - len(responses)))

    processed = False
    for idx, color in enumerate(state.colors):
        if idx == offerer_index or responses[idx]:
            continue
        player = state.players[idx]
        if not player.is_bot:
            continue
        if state.current_prompt != ActionPrompt.DECIDE_TRADE:
            break
        state.current_player_index = idx
        game.playable_actions = generate_playable_actions(state)
        try:
            action = player.decide(game, game.playable_actions)
        except Exception as exc:
            logging.warning("Bot trade response failed: %s", exc)
            action = Action(color, ActionType.REJECT_TRADE, state.current_trade)
        if action.action_type not in (
            ActionType.ACCEPT_TRADE,
            ActionType.REJECT_TRADE,
        ):
            action = Action(color, ActionType.REJECT_TRADE, state.current_trade)
        try:
            game.execute(action)
        except ValueError as exc:
            logging.warning("Invalid bot trade response: %s", exc)
            fallback = Action(color, ActionType.REJECT_TRADE, state.current_trade)
            game.execute(fallback, validate_action=False)
        processed = True
        responses = list(
            getattr(state, "trade_responses", tuple(False for _ in state.colors))
        )
        if len(responses) < num_players:
            responses.extend([False] * (num_players - len(responses)))
        if state.current_prompt != ActionPrompt.DECIDE_TRADE:
            break

    return processed


@bp.route("/stress-test", methods=["GET"])
def stress_test_endpoint():
    """Run a stress test game tick.
    ---
    tags:
      - diagnostics
    responses:
      200:
        description: Returns a sample game state after one tick
    """
    players = [
        AlphaBetaPlayer(Color.RED, 2, True),
        AlphaBetaPlayer(Color.BLUE, 2, True),
        AlphaBetaPlayer(Color.ORANGE, 2, True),
        AlphaBetaPlayer(Color.WHITE, 2, True),
    ]
    game = Game(players=players)
    game.play_tick()
    return Response(
        response=json.dumps(game, cls=GameEncoder),
        status=200,
        mimetype="application/json",
    )


@bp.route(
    "/games/<string:game_id>/states/<string:state_index>/mcts-analysis", methods=["GET"]
)
def mcts_analysis_endpoint(game_id, state_index):
    """Get MCTS analysis for specific game state.
    ---
    tags:
      - analysis
    parameters:
      - in: path
        name: game_id
        required: true
        schema:
          type: string
      - in: path
        name: state_index
        required: true
        schema:
          type: string
    responses:
      200:
        description: Success with win probabilities
      404:
        description: Game state not found
    """
    logging.info(f"ゲーム {game_id} の状態 {state_index} に対する MCTS 解析リクエストを受信しました")

    # Convert 'latest' to None for consistency with get_game_state
    parsed_state_index = _parse_state_index(state_index)
    try:
        game = get_game_state(game_id, parsed_state_index)
        if game is None:
            logging.error(
                f"ゲームまたは状態が見つかりません: {game_id}/{state_index}"
            )  # Use original state_index for logging
            abort(404, description="Game state not found")

        analyzer = GameAnalyzer(num_simulations=100)
        probabilities = analyzer.analyze_win_probabilities(game)

        logging.info(f"MCTS 解析に成功。勝率: {probabilities}")
        return Response(
            response=json.dumps(
                {
                    "success": True,
                    "probabilities": probabilities,
                    "state_index": (
                        parsed_state_index
                        if parsed_state_index is not None
                        else len(game.state.action_records)
                    ),
                }
            ),
            status=200,
            mimetype="application/json",
        )

    except Exception as e:
        logging.error(f"MCTS 解析エンドポイントでエラー: {str(e)}")
        logging.error(traceback.format_exc())
        return Response(
            response=json.dumps(
                {"success": False, "error": str(e), "trace": traceback.format_exc()}
            ),
            status=500,
            mimetype="application/json",
        )


@bp.route(
    "/games/<string:game_id>/states/<string:state_index>/negotiation-advice",
    methods=["POST"],
)
def negotiation_advice_endpoint(game_id, state_index):
    """Request negotiation advice from the configured LLM.
    ---
    tags:
      - negotiation
    parameters:
      - in: path
        name: game_id
        required: true
        schema:
          type: string
      - in: path
        name: state_index
        required: true
        schema:
          type: string
    consumes:
      - application/json
    responses:
      200:
        description: Advice payload
      404:
        description: Game state not found
      5XX:
        description: Advice provider error
    """
    parsed_state_index = _parse_state_index(state_index)
    try:
        game = get_game_state(game_id, parsed_state_index)
    except Exception as e:
        logging.error("Failed to load game state for negotiation advice: %s", e)
        abort(404, description="Game state not found")

    if game is None:
        abort(404, description="Game state not found")

    try:
        resolved_state_index = (
            parsed_state_index
            if parsed_state_index is not None
            else len(game.state.action_records)
        )
        players = list(getattr(game.state, "players", []))
        player_by_color = {player.color: player for player in players}
        human_colors = [
            player.color.value for player in players if not player.is_bot
        ]
        current_color = game.state.current_color()
        requester_color = None
        if current_color:
            current_player = player_by_color.get(current_color)
            if current_player and not current_player.is_bot:
                requester_color = current_color.value
        request_payload = request.json if request.is_json else None
        requested_color = None
        if request_payload:
            color_candidate = request_payload.get("requester_color")
            if isinstance(color_candidate, str) and color_candidate.strip():
                requested_color = color_candidate.strip()
        if requested_color:
            allowed_colors = {color.value for color in game.state.colors}
            if requested_color in allowed_colors:
                requester_color = requested_color
        if requester_color is None and len(human_colors) == 1:
            requester_color = human_colors[0]
        board_image_data_url = None
        if request_payload:
            image_candidate = request_payload.get("board_image")
            if isinstance(image_candidate, str) and image_candidate.strip():
                board_image_data_url = image_candidate
        event_payload = {
            "requester_color": requester_color,
            "human_colors": human_colors,
            "current_color": current_color.value if current_color else None,
        }
        if board_image_data_url:
            event_payload["board_image_attached"] = True
        log_game_event(
            game_id,
            "NEGOTIATION_ADVICE_REQUEST",
            state_index=resolved_state_index,
            payload=event_payload,
        )
        payload = request_negotiation_advice(
            game,
            board_image_data_url,
            requester_color,
        )
        return jsonify({"success": True, **payload})
    except NegotiationAdviceUnavailableError as exp:
        logging.warning("Negotiation advice unavailable: %s", exp)
        return (
            jsonify({"success": False, "error": str(exp)}),
            503,
        )
    except NegotiationAdviceError as exc:
        logging.error("Negotiation advice failed: %s", exc)
        logging.error(traceback.format_exc())
        return (
            jsonify({"success": False, "error": str(exc)}),
            500,
        )


@bp.route("/pvp/rooms", methods=["GET"])
def list_pvp_rooms_endpoint():
    """List available PvP rooms.
    ---
    tags:
      - pvp
    responses:
      200:
        description: Rooms list
    """
    rooms = list_rooms()
    return jsonify({"rooms": rooms})


@bp.route("/pvp/rooms", methods=["POST"])
def create_pvp_room_endpoint():
    """Create a PvP room.
    ---
    tags:
      - pvp
    consumes:
      - application/json
    responses:
      201:
        description: Room created
    """
    room_name = None
    if request.is_json and request.json is not None:
        room_name = request.json.get("room_name")
    room = create_room(room_name)
    return jsonify(room), 201


@bp.route("/pvp/rooms/<string:room_id>/status", methods=["GET"])
def get_pvp_room_status(room_id):
    """Get PvP room status."""
    token = request.headers.get(PVP_TOKEN_HEADER)
    status = get_room_status(room_id, token)
    return jsonify(status)


@bp.route("/pvp/rooms/<string:room_id>/join", methods=["POST"])
def join_pvp_room(room_id):
    """Join a PvP room."""
    if not request.is_json or request.json is None or "user_name" not in request.json:
        abort(400, description="user_name を指定してください。")
    payload = join_room(room_id, request.json["user_name"])
    return jsonify(payload)


@bp.route("/pvp/rooms/<string:room_id>/leave", methods=["POST"])
def leave_pvp_room(room_id):
    """Leave a PvP room."""
    session = require_session(request.headers.get(PVP_TOKEN_HEADER), room_id)
    room = leave_room(session)
    return jsonify({"room": room})


@bp.route("/pvp/rooms/<string:room_id>/start", methods=["POST"])
def start_pvp_room(room_id):
    """Start a PvP room game."""
    session = require_session(request.headers.get(PVP_TOKEN_HEADER), room_id)
    result = start_room(session)
    return jsonify(result)


@bp.route("/pvp/rooms/<string:room_id>/board", methods=["POST"])
def refresh_pvp_room_board(room_id):
    """Refresh PvP room board."""
    session = require_session(request.headers.get(PVP_TOKEN_HEADER), room_id)
    room = refresh_room_board(session)
    return jsonify({"room": room})


@bp.route("/pvp/rooms/<string:room_id>/game", methods=["GET"])
def get_pvp_room_game(room_id):
    """Get PvP room game state."""
    session = require_session(request.headers.get(PVP_TOKEN_HEADER), room_id)
    requested_state = request.args.get("state", "latest")
    parsed_state_index = _parse_state_index(requested_state)
    game = get_room_game(session, parsed_state_index)
    payload = json.dumps(game, cls=GameEncoder)
    return Response(response=payload, status=200, mimetype="application/json")


@bp.route("/pvp/rooms/<string:room_id>/action", methods=["POST"])
def post_pvp_action(room_id):
    """Submit an action within a PvP room."""
    session = require_session(request.headers.get(PVP_TOKEN_HEADER), room_id)
    if not request.is_json or request.json is None:
        abort(400, description="JSON body が必要です。")
    action_payload = request.json.get("action")
    expected_state_index = request.json.get("expected_state_index")
    game = submit_action(session, action_payload, expected_state_index)
    payload = json.dumps(game, cls=GameEncoder)
    return Response(response=payload, status=200, mimetype="application/json")


def _parse_state_index(state_index_str: str):
    """Helper function to parse and validate state_index."""
    if state_index_str == "latest":
        return None
    try:
        return int(state_index_str)
    except ValueError:
        abort(
            400,
            description="Invalid state_index format. state_index must be an integer or 'latest'.",
        )


# ===== Debugging Routes
# @app.route(
#     "/games/<string:game_id>/players/<int:player_index>/features", methods=["GET"]
# )
# def get_game_feature_vector(game_id, player_index):
#     game = get_game_state(game_id)
#     if game is None:
#         abort(404, description="Resource not found")

#     return create_sample(game, game.state.colors[player_index])


# @app.route("/games/<string:game_id>/value-function", methods=["GET"])
# def get_game_value_function(game_id):
#     game = get_game_state(game_id)
#     if game is None:
#         abort(404, description="Resource not found")

#     # model = tf.keras.models.load_model("data/models/mcts-rep-a")
#     model2 = tf.keras.models.load_model("data/models/mcts-rep-b")
#     feature_ordering = get_feature_ordering()
#     indices = [feature_ordering.index(f) for f in NUMERIC_FEATURES]
#     data = {}
#     for color in game.state.colors:
#         sample = create_sample_vector(game, color)
#         # scores = model.call(tf.convert_to_tensor([sample]))

#         inputs1 = [create_board_tensor(game, color)]
#         inputs2 = [[float(sample[i]) for i in indices]]
#         scores2 = model2.call(
#             [tf.convert_to_tensor(inputs1), tf.convert_to_tensor(inputs2)]
#         )
#         data[color.value] = float(scores2.numpy()[0][0])

#     return data
