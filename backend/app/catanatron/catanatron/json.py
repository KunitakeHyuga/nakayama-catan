"""
Classes to encode/decode catanatron classes to JSON format.
"""

import json
from enum import Enum

from catanatron.models.map import Water, Port, LandTile
from catanatron.game import Game
from catanatron.models.player import Color
from catanatron.models.enums import Action, ActionType
from catanatron.state_functions import get_longest_road_length, get_state_index


def longest_roads_by_player(state):
    result = dict()
    for color in state.colors:
        result[color.value] = get_longest_road_length(state, color)
    return result


def action_from_json(data):
    color = Color[data[0]]
    action_type = ActionType[data[1]]
    if action_type == ActionType.BUILD_ROAD:
        action = Action(color, action_type, tuple(data[2]))
    elif action_type == ActionType.PLAY_YEAR_OF_PLENTY:
        resources = tuple(data[2])
        if len(resources) not in [1, 2]:
            raise ValueError("Year of Plenty action must have 1 or 2 resources")
        action = Action(color, action_type, resources)
    elif action_type == ActionType.MOVE_ROBBER:
        raw_value = data[2]
        if len(raw_value) == 2:
            coordinate, victim = raw_value
        elif len(raw_value) >= 3:
            coordinate, victim = raw_value[0], raw_value[1]
        else:
            raise ValueError("MOVE_ROBBER action requires a coordinate and victim")
        coordinate = tuple(coordinate)
        victim = Color[victim] if victim else None
        value = (coordinate, victim)
        action = Action(color, action_type, value)
    elif action_type == ActionType.MARITIME_TRADE:
        value = tuple(data[2])
        action = Action(color, action_type, value)
    elif action_type in (
        ActionType.OFFER_TRADE,
        ActionType.ACCEPT_TRADE,
        ActionType.REJECT_TRADE,
    ):
        action = Action(color, action_type, tuple(data[2]))
    elif action_type == ActionType.CONFIRM_TRADE:
        value = list(data[2])
        if len(value) >= 11 and isinstance(value[10], str):
            value[10] = Color[value[10]]
        action = Action(color, action_type, tuple(value))
    else:
        action = Action(color, action_type, data[2])
    return action


class GameEncoder(json.JSONEncoder):
    def _build_trade_state(self, state):
        if not getattr(state, "is_resolving_trade", False):
            return None
        trade_vector = getattr(state, "current_trade", ())
        if len(trade_vector) < 10:
            return None
        offer_counts = list(trade_vector[:5])
        request_counts = list(trade_vector[5:10])
        offerer_index = (
            trade_vector[10]
            if len(trade_vector) > 10 and isinstance(trade_vector[10], int)
            else state.current_turn_index
        )
        num_players = len(state.colors)
        if num_players == 0:
            return None
        offerer_index = offerer_index % num_players
        offerer_color = state.colors[offerer_index]
        trade_responses = getattr(
            state, "trade_responses", tuple(False for _ in state.colors)
        )
        acceptees = []
        raw_acceptees = getattr(state, "acceptees", ())
        for idx, color in enumerate(state.colors):
            if idx == offerer_index:
                continue
            accepted = raw_acceptees[idx] if idx < len(raw_acceptees) else False
            responded = trade_responses[idx] if idx < len(trade_responses) else False
            acceptees.append(
                {
                    "color": self.default(color),
                    "accepted": accepted,
                    "responded": responded,
                }
            )
        return {
            "offerer_color": self.default(offerer_color),
            "offer": offer_counts,
            "request": request_counts,
            "acceptees": acceptees,
        }

    def default(self, obj):
        if obj is None:
            return None
        if isinstance(obj, str):
            return obj
        if isinstance(obj, Enum):
            return obj.value
        if isinstance(obj, tuple):
            return obj
        if isinstance(obj, Game):
            nodes = {}
            edges = {}
            for coordinate, tile in obj.state.board.map.tiles.items():
                for direction, node_id in tile.nodes.items():
                    building = obj.state.board.buildings.get(node_id, None)
                    color = None if building is None else building[0]
                    building_type = None if building is None else building[1]
                    nodes[node_id] = {
                        "id": node_id,
                        "tile_coordinate": coordinate,
                        "direction": self.default(direction),
                        "building": self.default(building_type),
                        "color": self.default(color),
                    }
                for direction, edge in tile.edges.items():
                    color = obj.state.board.roads.get(edge, None)
                    edge_id = tuple(sorted(edge))
                    edges[edge_id] = {
                        "id": edge_id,
                        "tile_coordinate": coordinate,
                        "direction": self.default(direction),
                        "color": self.default(color),
                    }
            trade_state = self._build_trade_state(obj.state)
            return {
                "tiles": [
                    {"coordinate": coordinate, "tile": self.default(tile)}
                    for coordinate, tile in obj.state.board.map.tiles.items()
                ],
                "adjacent_tiles": obj.state.board.map.adjacent_tiles,
                "nodes": nodes,
                "edges": list(edges.values()),
                "action_records": [self.default(a) for a in obj.state.action_records],
                "action_timestamps": getattr(obj.state, "action_timestamps", []),
                "player_state": obj.state.player_state,
                "colors": obj.state.colors,
                "bot_colors": list(
                    map(
                        lambda p: p.color, filter(lambda p: p.is_bot, obj.state.players)
                    )
                ),
                "is_initial_build_phase": obj.state.is_initial_build_phase,
                "robber_coordinate": obj.state.board.robber_coordinate,
                "current_color": obj.state.current_color(),
                "current_prompt": obj.state.current_prompt,
                "current_playable_actions": obj.playable_actions,
                "longest_roads_by_player": longest_roads_by_player(obj.state),
                "winning_color": obj.winning_color(),
                "num_turns": getattr(obj.state, "num_turns", 0),
                "state_index": get_state_index(obj.state),
                "has_human_player": any(not player.is_bot for player in obj.state.players),
                "trade": trade_state,
            }
        if isinstance(obj, Water):
            return {"type": "WATER"}
        if isinstance(obj, Port):
            return {
                "id": obj.id,
                "type": "PORT",
                "direction": self.default(obj.direction),
                "resource": self.default(obj.resource),
            }
        if isinstance(obj, LandTile):
            if obj.resource is None:
                return {"id": obj.id, "type": "DESERT"}
            return {
                "id": obj.id,
                "type": "RESOURCE_TILE",
                "resource": self.default(obj.resource),
                "number": obj.number,
            }
        return json.JSONEncoder.default(self, obj)
