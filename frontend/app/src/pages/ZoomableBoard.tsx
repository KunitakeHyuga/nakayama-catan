import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import memoize from "fast-memoize";
import { useMediaQuery, useTheme } from "@mui/material";

import useWindowSize from "../utils/useWindowSize";

import "./Board.scss";
import { store } from "../store";
import { isPlayersTurn } from "../utils/stateUtils";
import { postAction } from "../utils/apiClient";
import type { CatanState } from "../store";
import { useParams } from "react-router";
import ACTIONS from "../actions";
import Board from "./Board";
import type { Color, GameAction, TileCoordinate, GameState, MoveRobberAction } from "../utils/api.types";

/**
 * Returns object representing actions to be taken if click on node.
 * @returns {3 => ["BLUE", "BUILD_CITY", 3], ...}
 */
function buildNodeActions(state: CatanState, playerColor?: Color | null) {
  if (!state.gameState)
    throw new Error("ゲーム状態の準備が整っていません。");

  if (!isPlayersTurn(state.gameState, playerColor ?? undefined)) {
    return {};
  }

  const nodeActions: Record<number, GameAction> = {};
  const buildInitialSettlementActions = state.gameState.is_initial_build_phase
    ? state.gameState.current_playable_actions.filter(
        (action) => action[1] === "BUILD_SETTLEMENT"
      )
    : [];
  const inInitialBuildPhase = state.gameState.is_initial_build_phase;
  if (inInitialBuildPhase) {
    buildInitialSettlementActions.forEach((action) => {
      nodeActions[action[2]] = action;
    });
  } else if (state.isBuildingSettlement) {
    state.gameState.current_playable_actions
      .filter((action) => action[1] === "BUILD_SETTLEMENT")
      .forEach((action) => {
        nodeActions[action[2]] = action;
      });
  } else if (state.isBuildingCity) {
    state.gameState.current_playable_actions
      .filter((action) => action[1] === "BUILD_CITY")
      .forEach((action) => {
        nodeActions[action[2]] = action;
      });
  }
  return nodeActions;
}

function buildEdgeActions(state: CatanState, playerColor?: Color | null) {
  if (!state.gameState)
    throw new Error("ゲーム状態の準備が整っていません。");
  if (!isPlayersTurn(state.gameState, playerColor ?? undefined)) {
    return {};
  }

  const edgeActions: Record<`${number},${number}`, GameAction> = {};
  const buildInitialRoadActions = state.gameState.is_initial_build_phase
    ? state.gameState.current_playable_actions.filter(
        (action) => action[1] === "BUILD_ROAD"
      )
    : [];
  const inInitialBuildPhase = state.gameState.is_initial_build_phase;
  if (inInitialBuildPhase) {
    buildInitialRoadActions.forEach((action) => {
      edgeActions[`${action[2][0]},${action[2][1]}`] = action;
      console.log(Object.keys(edgeActions), action);
    });
  } else if (state.isBuildingRoad || state.isRoadBuilding) {
    state.gameState.current_playable_actions
      .filter((action) => action[1] === "BUILD_ROAD")
      .forEach((action) => {
        edgeActions[`${action[2][0]},${action[2][1]}`] = action;
      });
  }
  return edgeActions;
}

type ZoomableBoardProps = {
  replayMode: boolean;
  gameIdOverride?: string | null;
  actionExecutor?: (action: GameAction) => Promise<GameState>;
  actionsDisabled?: boolean;
  playerColorOverride?: Color | null;
  highlightedRollNumber?: number | null;
};

export default function ZoomableBoard({
  replayMode,
  gameIdOverride,
  actionExecutor,
  actionsDisabled = false,
  playerColorOverride,
  highlightedRollNumber = null,
}: ZoomableBoardProps) {
  const { gameId } = useParams();
  const effectiveGameId = gameIdOverride ?? gameId;
  const { state, dispatch } = useContext(store);
  const { width, height } = useWindowSize();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.up("md"));
  const [show, setShow] = useState(false);
  const [recentNodeId, setRecentNodeId] = useState<number | null>(null);
  const [recentEdgeId, setRecentEdgeId] = useState<string | null>(null);
  const [recentRobberCoordinate, setRecentRobberCoordinate] = useState<TileCoordinate | null>(null);
  const highlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gameState = state.gameState;
  if (!gameState)
    throw new Error("ゲーム状態の準備が整っていません。");
  if (!effectiveGameId && !actionExecutor)
    throw new Error("ゲームIDが見つからないためアクションを送信できません。");

  const executeAction = useCallback(
    async (action: GameAction) => {
      if (actionsDisabled) {
        return state.gameState as GameState;
      }
      if (actionExecutor) {
        return actionExecutor(action);
      }
      if (!effectiveGameId) {
        throw new Error("gameId が必要です");
      }
      return postAction(effectiveGameId, action);
    },
    [actionExecutor, effectiveGameId, actionsDisabled, state.gameState]
  );

  // TODO: Move these up to GameScreen and let Zoomable be presentational component
  // https://stackoverflow.com/questions/61255053/react-usecallback-with-parameter
  const buildOnNodeClick = useMemo(
    () =>
      memoize((id, action) => async () => {
        console.log("ノードをクリックしました:", id, action);
        if (!action) {
          return;
        }
        try {
          const updatedGameState = await executeAction(action);
          dispatch({ type: ACTIONS.SET_GAME_STATE, data: updatedGameState });
        } catch (error) {
          console.error("ノードアクションに失敗しました:", error);
        }
      }),
    [dispatch, executeAction]
  );
  const buildOnEdgeClick = useMemo(
    () =>
      memoize((id, action) => async () => {
        console.log("エッジをクリックしました:", id, action);
        if (!action) {
          return;
        }
        try {
          const updatedGameState = await executeAction(action);
          dispatch({ type: ACTIONS.SET_GAME_STATE, data: updatedGameState });
        } catch (error) {
          console.error("街道アクションに失敗しました:", error);
        }
      }),
    [dispatch, executeAction]
  );
  const handleTileClick = useCallback(
    async (coordinate: TileCoordinate) => {
      console.log("タイルをクリックしました:", coordinate);
      if (!state.isMovingRobber) {
        return;
      }
      // Find the "MOVE_ROBBER" action in current_playable_actions that
      // corresponds to the tile coordinate selected by the user
      const matchingAction = gameState.current_playable_actions.find(
        ([, action_type, [action_coordinate, ,]]) =>
          action_type === "MOVE_ROBBER" &&
          action_coordinate.every(
            (val: number, index: number) => val === coordinate[index]
          )
      );
      if (!matchingAction) {
        return;
      }
      try {
        const updatedGameState = await executeAction(matchingAction);
        dispatch({ type: ACTIONS.SET_GAME_STATE, data: updatedGameState });
      } catch (error) {
        console.error("盗賊アクションに失敗しました:", error);
      }
    },
    [
      dispatch,
      executeAction,
      gameState.current_playable_actions,
      state.isMovingRobber,
    ]
  );

  const nodeActions = replayMode
    ? {}
    : buildNodeActions(state, playerColorOverride);
  const edgeActions = replayMode
    ? {}
    : buildEdgeActions(state, playerColorOverride);

  useEffect(() => {
    if (!gameState || replayMode) {
      return;
    }
    const { action_records: records } = gameState;
    if (!records || records.length === 0) {
      return;
    }
    const latest = records[records.length - 1][0];
    let nextNode: number | null = null;
    let nextEdge: string | null = null;
    let nextRobberCoordinate: TileCoordinate | null = null;
    if (latest[1] === "BUILD_SETTLEMENT" || latest[1] === "BUILD_CITY") {
      nextNode = latest[2] as number;
    } else if (latest[1] === "BUILD_ROAD") {
      const edge = latest[2] as [number, number];
      nextEdge = `${edge[0]},${edge[1]}`;
    } else if (latest[1] === "MOVE_ROBBER") {
      const moveAction = latest as MoveRobberAction;
      nextRobberCoordinate = moveAction[2][0];
    }
    if (!nextNode && !nextEdge && !nextRobberCoordinate) {
      return;
    }
    setRecentNodeId(nextNode);
    setRecentEdgeId(nextEdge);
    setRecentRobberCoordinate(nextRobberCoordinate);
    if (highlightTimeoutRef.current) {
      clearTimeout(highlightTimeoutRef.current);
    }
    highlightTimeoutRef.current = setTimeout(() => {
      setRecentNodeId(null);
      setRecentEdgeId(null);
      setRecentRobberCoordinate(null);
      highlightTimeoutRef.current = null;
    }, 3200);
  }, [gameState, replayMode]);

  useEffect(() => {
    return () => {
      if (highlightTimeoutRef.current) {
        clearTimeout(highlightTimeoutRef.current);
        highlightTimeoutRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    setTimeout(() => {
      setShow(true);
    }, 300);
  }, []);

  if (!width || !height) return;

  return (
    <TransformWrapper>
      <div className="board-container">
        <TransformComponent>
          <Board
            width={width}
            height={height}
            buildOnNodeClick={buildOnNodeClick}
            buildOnEdgeClick={buildOnEdgeClick}
            handleTileClick={handleTileClick}
            nodeActions={nodeActions}
            edgeActions={edgeActions}
            replayMode={replayMode}
            show={show}
            gameState={gameState}
            isMobile={isMobile}
            isMovingRobber={state.isMovingRobber}
            recentNodeId={recentNodeId}
            recentEdgeId={recentEdgeId}
            recentRobberCoordinate={recentRobberCoordinate}
            highlightedRollNumber={highlightedRollNumber}
          />
        </TransformComponent>
      </div>
    </TransformWrapper>
  );
}
