import { useEffect, useState, useContext, useCallback, useRef } from "react";
import { Link, useParams } from "react-router-dom";
import PropTypes from "prop-types";
import { GridLoader } from "react-spinners";
import { useSnackbar } from "notistack";

import ZoomableBoard from "./ZoomableBoard";
import ActionsToolbar from "./ActionsToolbar";

import "./GameScreen.scss";
import LeftDrawer from "../components/LeftDrawer";
import RightDrawer from "../components/RightDrawer";
import { store } from "../store";
import ACTIONS from "../actions";
import { type StateIndex, getState, postAction } from "../utils/apiClient";
import { dispatchSnackbar } from "../components/Snackbar";
import { getHumanColor } from "../utils/stateUtils";
import NegotiationAdviceBox from "../components/NegotiationAdviceBox";
import { Button, Divider } from "@mui/material";
import DiceDisplay from "../components/DiceDisplay";
import useRollDisplay from "../hooks/useRollDisplay";
import RollingDiceOverlay from "../components/RollingDiceOverlay";
import { colorLabel } from "../utils/i18n";
import TurnIndicator from "../components/TurnIndicator";
import BuildCostGuide from "../components/BuildCostGuide";
import TradePanel from "../components/TradePanel";
import { upsertLocalRecord } from "../utils/localRecords";
import type { GameAction, GameState } from "../utils/api.types";
import useSoundEffects from "../hooks/useSoundEffects";
import { resumeAudioContext } from "../utils/audioManager";

const HUMAN_BOT_DELAY_MS = 4000;

function GameScreen({ replayMode }: { replayMode: boolean }) {
  const { gameId, stateIndex } = useParams();
  const { state, dispatch } = useContext(store);
  const { enqueueSnackbar, closeSnackbar } = useSnackbar();
  const [isBotThinking, setIsBotThinking] = useState(false);
  const botDelayTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const botProcessingRef = useRef(false);
  const pendingBotCheckRef = useRef(false);
  const botProcessingCancelledRef = useRef(false);
  const latestGameStateRef = useRef<GameState | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);

  // Load game state
  useEffect(() => {
    if (!gameId) {
      return;
    }

    (async () => {
      const gameState = await getState(gameId, stateIndex as StateIndex);
      dispatch({ type: ACTIONS.SET_GAME_STATE, data: gameState });
    })();
  }, [gameId, stateIndex, dispatch]);

  // Track unmount to avoid state updates on unmounted component
  const isUnmountedRef = useRef(false);
  useEffect(() => {
    return () => {
      isUnmountedRef.current = true;
      if (botDelayTimeoutRef.current) {
        clearTimeout(botDelayTimeoutRef.current);
        botDelayTimeoutRef.current = null;
      }
    };
  }, []);

  const gameState = state.gameState;
  const hasPendingBotTradeResponse = (state: GameState) =>
    state.current_prompt === "DECIDE_TRADE" &&
    Boolean(
      state.trade?.acceptees.some(
        (acceptee) =>
          state.bot_colors.includes(acceptee.color) && !acceptee.responded
      )
    );
  const isBotTurn = (state: GameState) =>
    !state.winning_color &&
    (state.bot_colors.includes(state.current_color) ||
      hasPendingBotTradeResponse(state));
  const hasHumanPlayer =
    gameState?.has_human_player ??
    (gameState
      ? gameState.colors.some(
          (color) => !gameState.bot_colors.includes(color)
        )
      : false);

  const updateBotThinking = useCallback(
    (value: boolean) => {
      if (!isUnmountedRef.current) {
        setIsBotThinking(value);
      }
    },
    []
  );

  const processBotActions = useCallback(() => {
    const startingState = latestGameStateRef.current;
    if (!startingState || replayMode || !gameId) {
      return;
    }
    if (!isBotTurn(startingState)) {
      return;
    }
    if (botProcessingRef.current) {
      pendingBotCheckRef.current = true;
      return;
    }

    botProcessingRef.current = true;
    pendingBotCheckRef.current = false;

    const wait = async (ms: number) => {
      if (ms <= 0 || botProcessingCancelledRef.current) {
        return;
      }
      await new Promise<void>((resolve) => {
        botDelayTimeoutRef.current = setTimeout(() => {
          botDelayTimeoutRef.current = null;
          resolve();
        }, ms);
      });
    };

    const run = async () => {
      let nextState: GameState | null = startingState;
      try {
        while (
          nextState &&
          !botProcessingCancelledRef.current &&
          isBotTurn(nextState)
        ) {
          const shouldDelayBeforeAction =
            hasHumanPlayer &&
            !nextState.is_initial_build_phase &&
            (nextState.current_prompt === "PLAY_TURN" ||
              nextState.current_prompt === "MOVE_ROBBER");
          updateBotThinking(shouldDelayBeforeAction);

          if (shouldDelayBeforeAction) {
            await wait(HUMAN_BOT_DELAY_MS);
            if (botProcessingCancelledRef.current) {
              break;
            }
          }

          const updatedState = await postAction(gameId);

          if (botProcessingCancelledRef.current) {
            break;
          }

          dispatch({ type: ACTIONS.SET_GAME_STATE, data: updatedState });
          if (getHumanColor(updatedState)) {
            dispatchSnackbar(enqueueSnackbar, closeSnackbar, updatedState);
          }

          nextState = updatedState;
          latestGameStateRef.current = updatedState;
        }
      } catch (error) {
        console.error("Failed to process bot action", error);
      } finally {
        if (botDelayTimeoutRef.current) {
          clearTimeout(botDelayTimeoutRef.current);
          botDelayTimeoutRef.current = null;
        }
        updateBotThinking(false);
        botProcessingRef.current = false;

        if (
          !botProcessingCancelledRef.current &&
          pendingBotCheckRef.current
        ) {
          pendingBotCheckRef.current = false;
          processBotActions();
        }
      }
    };

    run();
  }, [
    closeSnackbar,
    dispatch,
    dispatchSnackbar,
    enqueueSnackbar,
    gameId,
    hasHumanPlayer,
    replayMode,
    updateBotThinking,
  ]);

  useEffect(() => {
    latestGameStateRef.current = state.gameState;
    if (!state.gameState || replayMode || !gameId) {
      updateBotThinking(false);
      return;
    }
    processBotActions();
  }, [state.gameState, processBotActions, replayMode, gameId, updateBotThinking]);

  useEffect(() => {
    botProcessingCancelledRef.current = false;
    return () => {
      botProcessingCancelledRef.current = true;
      if (botDelayTimeoutRef.current) {
        clearTimeout(botDelayTimeoutRef.current);
        botDelayTimeoutRef.current = null;
      }
      botProcessingRef.current = false;
      pendingBotCheckRef.current = false;
    };
  }, [gameId]);

  const { displayRoll, overlayRoll, overlayVisible, finalizeOverlay } =
    useRollDisplay(state.gameState);
  const rollForHighlight = overlayRoll ?? displayRoll;
  const highlightedRollNumber = rollForHighlight
    ? rollForHighlight[0] + rollForHighlight[1]
    : null;
  useSoundEffects(state.gameState, soundEnabled);

  useEffect(() => {
    const resume = () => {
      resumeAudioContext();
    };
    window.addEventListener("pointerdown", resume, { once: true });
    return () => window.removeEventListener("pointerdown", resume);
  }, []);

  useEffect(() => {
    if (!gameId || !state.gameState || replayMode) {
      return;
    }
    upsertLocalRecord(gameId, state.gameState);
  }, [gameId, state.gameState, replayMode]);

  const executePlayerAction = useCallback(
    async (action?: GameAction) => {
      if (!gameId) {
        throw new Error("gameId が必要です");
      }
      return postAction(gameId, action);
    },
    [gameId]
  );

  const humanColor = state.gameState ? getHumanColor(state.gameState) : null;
  const turnLabel = state.gameState
    ? `${colorLabel(state.gameState.current_color)}${
        humanColor && humanColor === state.gameState.current_color
          ? "（あなた）"
          : ""
      }`
    : undefined;
  const turnPillClass = state.gameState
    ? `turn-pill-${state.gameState.current_color.toLowerCase()}`
    : undefined;
  const toggleSound = useCallback(() => {
    setSoundEnabled((prev) => {
      const next = !prev;
      if (next) {
        resumeAudioContext();
      }
      return next;
    });
  }, []);

  if (!state.gameState) {
    return (
      <main className="loading-screen">
        <div className="loading-card">
          <GridLoader color="#ffffff" size={80} />
          <p>ロード中です。少々お待ちください…</p>
        </div>
      </main>
    );
  }

  return (
    <main>
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
      <TurnIndicator gameState={state.gameState} />
      <RollingDiceOverlay
        roll={overlayRoll}
        visible={overlayVisible}
        currentTurnLabel={turnLabel}
        currentColorClass={turnPillClass}
        onComplete={finalizeOverlay}
      />
      <ZoomableBoard
        replayMode={replayMode}
        actionExecutor={executePlayerAction}
        highlightedRollNumber={highlightedRollNumber}
      />
      <div className="game-actions-floating">
        <ActionsToolbar
          isBotThinking={isBotThinking}
          replayMode={replayMode}
          actionExecutor={executePlayerAction}
          showResources={false}
        />
      </div>
      {state.gameState.winning_color && (
        <div className="game-end-actions">
          <Button
            component={Link}
            to="/"
            variant="contained"
            color="secondary"
          >
            ホームに戻る
          </Button>
        </div>
      )}
      <LeftDrawer viewerColor={humanColor ?? null} />
      <RightDrawer>
        <TradePanel actionExecutor={executePlayerAction}>
          <Divider />
          <NegotiationAdviceBox stateIndex={"latest"} />
        </TradePanel>
        <Divider />
        <DiceDisplay roll={displayRoll} />
        <Divider />
        <BuildCostGuide />
      </RightDrawer>
    </main>
  );
}

GameScreen.propTypes = {
  /**
   * Injected by the documentation to work in an iframe.
   * You won't need it on your project.
   */
  window: PropTypes.func,
};

export default GameScreen;
