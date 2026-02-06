import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  Typography,
  Divider,
} from "@mui/material";
import axios from "axios";

import ZoomableBoard from "./ZoomableBoard";
import ActionsToolbar from "./ActionsToolbar";
import TurnIndicator from "../components/TurnIndicator";
import RollingDiceOverlay from "../components/RollingDiceOverlay";
import DiceDisplay from "../components/DiceDisplay";
import BuildCostGuide from "../components/BuildCostGuide";
import LeftDrawer from "../components/LeftDrawer";
import RightDrawer from "../components/RightDrawer";
import { store } from "../store";
import ACTIONS from "../actions";
import { dispatchSnackbar, snackbarActions } from "../components/Snackbar";
import useRollDisplay from "../hooks/useRollDisplay";
import { colorLabel } from "../utils/i18n";
import useSoundEffects from "../hooks/useSoundEffects";
import { resumeAudioContext } from "../utils/audioManager";
import { saveRecordPlayerNames } from "../utils/recordPlayerNames";
import {
  getPvpRoomStatus,
  joinPvpRoom,
  type PvpRoom,
  leavePvpRoom,
  startPvpRoom,
  postPvpAction,
  getPvpGameState,
  type PvpJoinResponse,
  refreshPvpRoomBoard,
} from "../utils/apiClient";
import type { Color, GameAction, GameState } from "../utils/api.types";
import { useSnackbar } from "notistack";
import TradePanel from "../components/TradePanel";
import NegotiationAdviceBox from "../components/NegotiationAdviceBox";
import RoomBoardPreview from "../components/RoomBoardPreview";

import "./PvpRoomPage.scss";

const TOKEN_PREFIX = "pvp_room_token";
const NAME_PREFIX = "pvp_room_username";
const COLOR_PREFIX = "pvp_room_color";
const POLL_INTERVAL_MS = 2000;

const buildStorageKey = (prefix: string, roomId: string) =>
  `${prefix}_${roomId}`;

export default function PvpRoomPage() {
  const params = useParams<{ roomId: string }>();
  const roomId = params.roomId;
  const navigate = useNavigate();
  const { state, dispatch } = useContext(store);
  const { enqueueSnackbar, closeSnackbar } = useSnackbar();

  if (!roomId) {
    navigate("/pvp", { replace: true });
    return null;
  }

  const [roomStatus, setRoomStatus] = useState<PvpRoom | null>(null);
  const [token, setToken] = useState<string | null>(() =>
    typeof window !== "undefined"
      ? window.localStorage.getItem(buildStorageKey(TOKEN_PREFIX, roomId))
      : null
  );
  const [userName, setUserName] = useState<string>(() =>
    typeof window !== "undefined"
      ? window.localStorage.getItem(buildStorageKey(NAME_PREFIX, roomId)) ?? ""
      : ""
  );
  const parseSeatColor = (value: string | null): Color | null => {
    if (!value) {
      return null;
    }
    const normalized = value.toUpperCase();
    if (
      normalized === "RED" ||
      normalized === "BLUE" ||
      normalized === "WHITE" ||
      normalized === "ORANGE"
    ) {
      return normalized as Color;
    }
    return null;
  };
  const [seatColor, setSeatColor] = useState<Color | null>(() =>
    typeof window !== "undefined"
      ? parseSeatColor(
          window.localStorage.getItem(buildStorageKey(COLOR_PREFIX, roomId))
        )
      : null
  );
  const [joinDialogOpen, setJoinDialogOpen] = useState(!token);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [isJoining, setIsJoining] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [lastError, setLastError] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [isRefreshingBoard, setIsRefreshingBoard] = useState(false);
  const {
    displayRoll,
    overlayRoll,
    overlayVisible,
    finalizeOverlay,
  } = useRollDisplay(state.gameState);
  const rollForHighlight = overlayRoll ?? displayRoll;
  const highlightedRollNumber = rollForHighlight
    ? rollForHighlight[0] + rollForHighlight[1]
    : null;
  useSoundEffects(state.gameState, soundEnabled);

  const toggleSound = useCallback(() => {
    setSoundEnabled((prev) => {
      const next = !prev;
      if (next) {
        resumeAudioContext();
      }
      return next;
    });
  }, []);

  const saveSession = useCallback(
    (info: { token: string; user_name: string; seat_color: Color | null }) => {
      if (typeof window === "undefined") {
        return;
      }
      window.localStorage.setItem(
        buildStorageKey(TOKEN_PREFIX, roomId),
        info.token
      );
      window.localStorage.setItem(
        buildStorageKey(NAME_PREFIX, roomId),
        info.user_name
      );
      if (info.seat_color) {
        window.localStorage.setItem(
          buildStorageKey(COLOR_PREFIX, roomId),
          info.seat_color
        );
      } else {
        window.localStorage.removeItem(buildStorageKey(COLOR_PREFIX, roomId));
      }
    },
    [roomId]
  );

  const clearSession = useCallback(() => {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(buildStorageKey(TOKEN_PREFIX, roomId));
      window.localStorage.removeItem(buildStorageKey(NAME_PREFIX, roomId));
      window.localStorage.removeItem(buildStorageKey(COLOR_PREFIX, roomId));
    }
    setToken(null);
    setSeatColor(null);
    setJoinDialogOpen(true);
  }, [roomId]);

  const syncSeatColor = useCallback(
    (room: PvpRoom, maybeToken: string | null) => {
      if (!maybeToken) {
        return;
      }
      const seat = room.seats.find((seat) => seat.is_you);
      if (seat) {
        setSeatColor(seat.color as Color);
        if (typeof window !== "undefined") {
          window.localStorage.setItem(
            buildStorageKey(COLOR_PREFIX, roomId),
            seat.color
          );
        }
      } else {
        setSeatColor(null);
        if (typeof window !== "undefined") {
          window.localStorage.removeItem(buildStorageKey(COLOR_PREFIX, roomId));
        }
      }
    },
    [roomId]
  );

  const fetchStatus = useCallback(async () => {
    try {
      const status = await getPvpRoomStatus(roomId, token);
      setRoomStatus(status);
      syncSeatColor(status, token);
      if (status.game_id && token) {
        const latest = await getPvpGameState(roomId, token, "latest");
        dispatch({ type: ACTIONS.SET_GAME_STATE, data: latest });
      } else {
        dispatch({ type: ACTIONS.SET_GAME_STATE, data: null });
      }
      setFetchError(null);
    } catch (error: any) {
      console.error("Failed to fetch room status:", error);
      if (axios.isAxiosError(error) && error.response?.status === 401) {
        clearSession();
        setFetchError("セッションが無効になりました。再度参加してください。");
        return;
      }
      setFetchError("ルーム情報の取得に失敗しました。");
    }
  }, [roomId, token, dispatch, clearSession, syncSeatColor]);

  useEffect(() => {
    fetchStatus();
    const timer = window.setInterval(fetchStatus, POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [fetchStatus]);

  const handleJoin = useCallback(async () => {
    if (!userName.trim()) {
      setJoinError("ユーザー名を入力してください。");
      return;
    }
    setIsJoining(true);
    setJoinError(null);
    try {
      const response: PvpJoinResponse = await joinPvpRoom(
        roomId,
        userName.trim()
      );
      saveSession(response);
      setToken(response.token);
      setSeatColor(response.seat_color);
      setJoinDialogOpen(false);
      setLastError(null);
      setRoomStatus(response.room);
      dispatch({ type: ACTIONS.SET_GAME_STATE, data: null });
    } catch (error: any) {
      console.error("Failed to join room:", error);
      if (axios.isAxiosError(error) && error.response?.data?.description) {
        setJoinError(error.response.data.description);
      } else {
        setJoinError("参加に失敗しました。もう一度お試しください。");
      }
    } finally {
      setIsJoining(false);
    }
  }, [roomId, userName, saveSession, dispatch]);

  const handleLeave = useCallback(async () => {
    if (!token) {
      navigate("/pvp");
      return;
    }
    try {
      await leavePvpRoom(roomId, token);
    } catch (error) {
      console.error("Failed to leave room:", error);
    } finally {
      clearSession();
      dispatch({ type: ACTIONS.SET_GAME_STATE, data: null });
      navigate("/pvp");
    }
  }, [token, roomId, clearSession, navigate, dispatch]);

  const handleStartGame = useCallback(async () => {
    if (!token) {
      return;
    }
    setIsStarting(true);
    try {
      await startPvpRoom(roomId, token);
      await fetchStatus();
    } catch (error: any) {
      console.error("Failed to start game:", error);
      if (axios.isAxiosError(error) && error.response?.data?.description) {
        setLastError(error.response.data.description);
      } else {
        setLastError("ゲーム開始に失敗しました。");
      }
    } finally {
      setIsStarting(false);
    }
  }, [roomId, token, fetchStatus]);

  const handleRefreshBoard = useCallback(async () => {
    if (!token) {
      return;
    }
    setIsRefreshingBoard(true);
    try {
      const updatedRoom = await refreshPvpRoomBoard(roomId, token);
      setRoomStatus(updatedRoom);
      enqueueSnackbar("盤面を更新しました。", { variant: "success" });
    } catch (error: any) {
      console.error("Failed to refresh board:", error);
      if (axios.isAxiosError(error) && error.response?.data?.description) {
        setLastError(error.response.data.description);
      } else {
        setLastError("盤面の更新に失敗しました。");
      }
    } finally {
      setIsRefreshingBoard(false);
    }
  }, [roomId, token, enqueueSnackbar]);

  const submitAction = useCallback(
    async (action?: GameAction): Promise<GameState> => {
      if (!token) {
        throw new Error("トークンがありません。");
      }
      if (!state.gameState) {
        throw new Error("ゲーム状態がありません。");
      }
      if (!seatColor) {
        enqueueSnackbar("観戦者は操作できません。", {
          action: snackbarActions(closeSnackbar),
          onClick: () => closeSnackbar(),
        });
        return state.gameState;
      }
      try {
        const updated = await postPvpAction(
          roomId,
          token,
          action,
          state.gameState.state_index
        );
        dispatch({ type: ACTIONS.SET_GAME_STATE, data: updated });
        dispatchSnackbar(enqueueSnackbar, closeSnackbar, updated);
        return updated;
      } catch (error: any) {
        console.error("アクション送信に失敗しました:", error);
        if (axios.isAxiosError(error) && error.response?.status === 409) {
          await fetchStatus();
        }
        return state.gameState;
      }
    },
    [
      token,
      state.gameState,
      seatColor,
      dispatch,
      enqueueSnackbar,
      closeSnackbar,
      fetchStatus,
      roomId,
    ]
  );

  const isMyTurn =
    Boolean(state.gameState) &&
    Boolean(seatColor) &&
    state.gameState?.current_color === seatColor;

  const roomSeats = roomStatus?.seats ?? [];
  const filledSeatCount = roomSeats.filter((seat) => seat.user_name).length;
  const canStartGame = filledSeatCount >= 2;

  const playerNames = useMemo(() => {
    const mapping: Partial<Record<Color, string | null>> = {};
    roomSeats.forEach((seat) => {
      mapping[seat.color as Color] = seat.user_name;
    });
    return mapping;
  }, [roomSeats]);

  useEffect(() => {
    if (!roomStatus?.game_id) {
      return;
    }
    saveRecordPlayerNames(roomStatus.game_id, playerNames);
  }, [roomStatus?.game_id, playerNames]);

  const waitingMessage = useMemo(() => {
    if (!roomStatus) {
      return "ルーム情報を読み込み中です…";
    }
    if (!roomStatus.started) {
      if (filledSeatCount < 2) {
        return "ゲーム開始には2人以上のプレイヤーが必要です。";
      }
      return "ホストがゲームを開始するまでお待ちください。";
    }
    if (seatColor && !isMyTurn && state.gameState) {
      return `現在は${colorLabel(
        state.gameState.current_color
      )}のターンです。`;
    }
    return "";
  }, [roomStatus, seatColor, isMyTurn, state.gameState, filledSeatCount]);

  const turnLabel = state.gameState
    ? `${colorLabel(state.gameState.current_color)}${
        seatColor && state.gameState.current_color === seatColor ? "（あなた）" : ""
      }`
    : undefined;
  const turnPillClass = state.gameState
    ? `turn-pill-${state.gameState.current_color.toLowerCase()}`
    : undefined;

  const joinDialog = (
    <Dialog
      open={joinDialogOpen}
      fullWidth
      maxWidth="xs"
      PaperProps={{ className: "join-dialog-paper" }}
    >
      <DialogTitle>ルームに参加</DialogTitle>
      <DialogContent>
        <p className="join-dialog-note">
          ※ユーザーネームは全角漢字フルネーム，姓名の間はスペースありにしてください．
        </p>
        <TextField
          autoFocus
          fullWidth
          value={userName}
          onChange={(event) => setUserName(event.target.value)}
          label="ユーザー名"
          placeholder="例）國武 飛冴"
        />
        {joinError && <p className="error-text">{joinError}</p>}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleLeave}>ロビーに戻る</Button>
        <Button onClick={handleJoin} disabled={isJoining || !userName.trim()}>
          {isJoining ? "参加中..." : "参加する"}
        </Button>
      </DialogActions>
    </Dialog>
  );

  if (!roomStatus) {
    return (
      <main className="pvp-room-page">
        {joinDialog}
        {fetchError && <div className="error-text">{fetchError}</div>}
        <div className="waiting-message">ルーム情報を取得しています…</div>
      </main>
    );
  }

  const hasSession = Boolean(token);
  const isSpectator = hasSession && seatColor == null;
  const isHost = roomSeats.find((seat) => seat.is_you)?.color === "RED";
  const showRoomPanel = !roomStatus.started;
  const showLiveGame =
    hasSession && roomStatus.started && Boolean(state.gameState);

  return (
    <main className={`pvp-room-page ${showLiveGame ? "game-active" : ""}`}>
      {joinDialog}

      {showRoomPanel && (
        <section className="room-status-panel">
          <div className="room-info-header">
            <Typography variant="h4" component="h1" className="room-name">
              {roomStatus.room_name}
            </Typography>
            <div className="room-header-actions">
              <Button variant="outlined" onClick={() => navigate("/pvp")}>
                ロビーに戻る
              </Button>
              <Button variant="outlined" color="secondary" onClick={handleLeave}>
                退出
              </Button>
            </div>
          </div>
          <div className="room-actions">
            <Typography variant="h6">座席</Typography>
            <div className="room-seats">
              {roomSeats.map((seat) => (
                <div
                  key={seat.color}
                  className={`seat-card ${seat.is_you ? "seat-card-active" : ""}`}
                >
                  <div className="seat-color">{colorLabel(seat.color as Color)}</div>
                  <div className="seat-name">
                    {seat.user_name ?? "空席"}
                    {seat.is_you && "（あなた）"}
                  </div>
                </div>
              ))}
            </div>
            <RoomBoardPreview
              preview={roomStatus.board_preview}
              canShuffle={Boolean(isHost)}
              refreshing={isRefreshingBoard}
              onShuffle={isHost ? handleRefreshBoard : undefined}
            />
            <div className="room-buttons">
              {lastError && <div className="error-text">{lastError}</div>}
              <Button variant="contained" onClick={fetchStatus}>
                最新情報
              </Button>
              {isHost && (
                <Button
                  variant="contained"
                  color="secondary"
                  onClick={handleStartGame}
                  disabled={!hasSession || isStarting || !canStartGame}
                >
                  {isStarting ? "開始中..." : "ゲーム開始"}
                </Button>
              )}
            </div>
            {waitingMessage && (
              <div className="room-message">{waitingMessage}</div>
            )}
          </div>
        </section>
      )}

      {showLiveGame ? (
        <div className="pvp-live-game">
          <h1 className="logo">Catanatron</h1>
          <div className="sound-toggle">
            <Button
              variant={soundEnabled ? "contained" : "outlined"}
              color="secondary"
              onClick={toggleSound}
              size="small"
            >
              {soundEnabled ? "サウンドON" : "サウンドOFF"}
            </Button>
          </div>
          <TurnIndicator
            gameState={state.gameState}
            playerColorOverride={seatColor}
          />
          <RollingDiceOverlay
            roll={overlayRoll}
            visible={overlayVisible}
            currentTurnLabel={turnLabel}
            currentColorClass={turnPillClass}
            onComplete={finalizeOverlay}
          />
          <ZoomableBoard
            replayMode={false}
            gameIdOverride={roomStatus.game_id ?? undefined}
            actionExecutor={submitAction}
            actionsDisabled={!isMyTurn || isSpectator}
            playerColorOverride={seatColor}
            highlightedRollNumber={highlightedRollNumber}
          />
          {!isSpectator && (
            <div className="pvp-actions-floating">
              <ActionsToolbar
                isBotThinking={false}
                replayMode={false}
                gameIdOverride={roomStatus.game_id ?? undefined}
                actionExecutor={submitAction}
                actionsDisabled={!isMyTurn || isSpectator}
                playerColorOverride={seatColor}
                showResources={false}
              />
            </div>
          )}
          <LeftDrawer playerNames={playerNames} viewerColor={seatColor} />
          <RightDrawer>
            <div className="drawer-room-info">
              <Typography variant="h6" className="drawer-room-name">
                {roomStatus.room_name}
              </Typography>
              <Button
                variant="outlined"
                onClick={() => navigate("/pvp")}
                fullWidth
              >
                ロビーに戻る
              </Button>
            </div>
            <Divider />
            {!isSpectator && (
              <>
                <TradePanel
                  actionExecutor={submitAction}
                  playerColorOverride={seatColor}
                >
                  {roomStatus.game_id && (
                    <>
                      <Divider />
                      <NegotiationAdviceBox
                        stateIndex={"latest"}
                        gameIdOverride={roomStatus.game_id}
                        gameStateOverride={state.gameState ?? null}
                        requesterColorOverride={seatColor}
                      />
                    </>
                  )}
                </TradePanel>
                <Divider />
              </>
            )}
            <DiceDisplay roll={displayRoll} />
            <Divider />
            <BuildCostGuide />
            <Divider />
            <Button variant="outlined" onClick={handleLeave} fullWidth>
              退出
            </Button>
          </RightDrawer>
        </div>
      ) : !hasSession ? (
        <div className="waiting-message">
          参加していません。参加ボタンから入室してください。
        </div>
      ) : roomStatus.started ? (
        <div className="waiting-message">ゲーム情報を読み込み中です…</div>
      ) : (
        <div className="waiting-message">
          ホストがゲームを開始するまでお待ちください。
        </div>
      )}
    </main>
  );
}
