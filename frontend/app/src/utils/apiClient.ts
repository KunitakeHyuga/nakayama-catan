import axios from "axios";

import { API_URL } from "../configuration";
import type { BoardPreview, Color, GameAction, GameState } from "./api.types";

type Player = "HUMAN" | "RANDOM" | "CATANATRON";
export type StateIndex = number | `${number}` | "latest";
export const PVP_TOKEN_HEADER = "X-PVP-Token";

export type PvpSeat = {
  color: Color;
  user_name: string | null;
  is_you: boolean;
};

export type PvpRoom = {
  room_id: string;
  room_name: string;
  seats: PvpSeat[];
  started: boolean;
  game_id: string | null;
  state_index: number | null;
  created_at: string;
  updated_at: string;
  board_preview?: BoardPreview | null;
};

export type PvpJoinResponse = {
  token: string;
  seat_color: Color | null;
  user_name: string;
  is_spectator: boolean;
  room: PvpRoom;
};

export async function refreshPvpRoomBoard(
  roomId: string,
  token: string
): Promise<PvpRoom> {
  const response = await axios.post<{ room: PvpRoom }>(
    `${API_URL}/api/pvp/rooms/${roomId}/board`,
    {},
    buildPvpHeaders(token)
  );
  return response.data.room;
}

export async function createGame(players: Player[]) {
  const response = await axios.post(API_URL + "/api/games", { players });
  return response.data.game_id;
}

export async function deleteGame(gameId: string) {
  await axios.delete(`${API_URL}/api/games/${gameId}`);
}

export async function getState(
  gameId: string,
  stateIndex: StateIndex = "latest"
): Promise<GameState> {
  const response = await axios.get(
    `${API_URL}/api/games/${gameId}/states/${stateIndex}`
  );
  return response.data;
}

/** action=undefined means bot action */
export async function postAction(gameId: string, action?: GameAction) {
  const response = await axios.post<GameState>(
    `${API_URL}/api/games/${gameId}/actions`,
    action
  );
  return response.data;
}

export type GameRecordSummary = {
  game_id: string;
  state_index: number;
  winning_color: Color | null;
  current_color: Color;
  player_colors: Color[];
  turns_completed?: number | null;
  updated_at?: string;
  updated_at_ms?: number;
};

export async function listGames(): Promise<GameRecordSummary[]> {
  const response = await axios.get<{ games: GameRecordSummary[] }>(
    `${API_URL}/api/games`
  );
  return response.data.games;
}

export type GameEvent = {
  event_id: number;
  game_id: string;
  event_type: string;
  state_index?: number | null;
  created_at?: string | null;
  payload?: Record<string, unknown> | null;
};

export async function getGameEvents(
  gameId: string,
  eventType?: string
): Promise<GameEvent[]> {
  const params = eventType ? { event_type: eventType } : undefined;
  const response = await axios.get<{ events: GameEvent[] }>(
    `${API_URL}/api/games/${gameId}/events`,
    { params }
  );
  return response.data.events;
}

const buildPvpHeaders = (token: string) => ({
  headers: { [PVP_TOKEN_HEADER]: token },
});

export async function listPvpRooms(): Promise<PvpRoom[]> {
  const response = await axios.get<{ rooms: PvpRoom[] }>(
    `${API_URL}/api/pvp/rooms`
  );
  return response.data.rooms;
}

export async function createPvpRoom(
  roomName?: string
): Promise<PvpRoom> {
  const response = await axios.post<PvpRoom>(
    `${API_URL}/api/pvp/rooms`,
    roomName ? { room_name: roomName } : {}
  );
  return response.data;
}

export async function joinPvpRoom(
  roomId: string,
  userName: string
): Promise<PvpJoinResponse> {
  const response = await axios.post<PvpJoinResponse>(
    `${API_URL}/api/pvp/rooms/${roomId}/join`,
    { user_name: userName }
  );
  return response.data;
}

export async function leavePvpRoom(
  roomId: string,
  token: string
): Promise<PvpRoom> {
  const response = await axios.post<{ room: PvpRoom }>(
    `${API_URL}/api/pvp/rooms/${roomId}/leave`,
    {},
    buildPvpHeaders(token)
  );
  return response.data.room;
}

export async function getPvpRoomStatus(
  roomId: string,
  token?: string | null
): Promise<PvpRoom> {
  const config = token ? buildPvpHeaders(token) : {};
  const response = await axios.get<PvpRoom>(
    `${API_URL}/api/pvp/rooms/${roomId}/status`,
    config
  );
  return response.data;
}

export async function startPvpRoom(
  roomId: string,
  token: string
): Promise<{ game_id: string }> {
  const response = await axios.post<{ game_id: string }>(
    `${API_URL}/api/pvp/rooms/${roomId}/start`,
    {},
    buildPvpHeaders(token)
  );
  return response.data;
}

export async function getPvpGameState(
  roomId: string,
  token: string,
  stateIndex: StateIndex = "latest"
): Promise<GameState> {
  const response = await axios.get<GameState>(
    `${API_URL}/api/pvp/rooms/${roomId}/game`,
    {
      ...buildPvpHeaders(token),
      params: { state: stateIndex },
    }
  );
  return response.data;
}

export async function postPvpAction(
  roomId: string,
  token: string,
  action?: GameAction,
  expectedStateIndex?: number
): Promise<GameState> {
  const response = await axios.post<GameState>(
    `${API_URL}/api/pvp/rooms/${roomId}/action`,
    { action, expected_state_index: expectedStateIndex },
    buildPvpHeaders(token)
  );
  return response.data;
}

export type MCTSProbabilities = {
  [K in Color]: number;
};

export type NegotiationAdviceResult = {
  success: boolean;
  advice?: string;
  error?: string;
};

type MCTSSuccessBody = {
  success: true;
  probabilities: MCTSProbabilities;
  state_index: number;
};
type MCTSErrorBody = {
  success: false;
  error: string;
  trace: string;
};

export async function getMctsAnalysis(
  gameId: string,
  stateIndex: StateIndex = "latest"
) {
  try {
    console.log("MCTS解析の取得中:", {
      gameId,
      stateIndex,
      url: `${API_URL}/api/games/${gameId}/states/${stateIndex}/mcts-analysis`,
    });

    if (!gameId) {
      throw new Error("getMctsAnalysis に gameId が指定されていません");
    }

    const response = await axios.get<MCTSSuccessBody | MCTSErrorBody>(
      `${API_URL}/api/games/${gameId}/states/${stateIndex}/mcts-analysis`
    );

    console.log("MCTS解析のレスポンス:", response.data);
    return response.data;
  } catch (error: any) {
    // AxiosResponse<MCTSErrorBody>
    console.error("MCTS解析でエラー:", {
      message: error.message,
      status: error.response?.status,
      data: error.response?.data,
      stack: error.stack,
    });
    throw error;
  }
}

export async function requestNegotiationAdvice(
  gameId: string,
  stateIndex: StateIndex = "latest",
  boardImageDataUrl?: string | null,
  requesterColor?: Color | null
): Promise<NegotiationAdviceResult> {
  try {
    const payload: Record<string, string> =
      boardImageDataUrl && boardImageDataUrl.length > 0
        ? { board_image: boardImageDataUrl }
        : {};
    if (requesterColor) {
      payload.requester_color = requesterColor;
    }
    const response = await axios.post<NegotiationAdviceResult>(
      `${API_URL}/api/games/${gameId}/states/${stateIndex}/negotiation-advice`,
      payload
    );
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      return error.response.data as NegotiationAdviceResult;
    }
    throw error;
  }
}
