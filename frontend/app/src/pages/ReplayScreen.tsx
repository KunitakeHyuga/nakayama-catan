import { useEffect, useContext, useState } from "react";
import { useParams } from "react-router-dom";
import { GridLoader } from "react-spinners";

import ZoomableBoard from "./ZoomableBoard";

import "./ReplayScreen.scss";
import LeftDrawer from "../components/LeftDrawer";
import RightDrawer from "../components/RightDrawer";
import { store } from "../store";
import ACTIONS from "../actions";
import { getState } from "../utils/apiClient";
import { Divider } from "@mui/material";
import ReplayBox from "../components/ReplayBox";
import DiceDisplay from "../components/DiceDisplay";
import useRollDisplay from "../hooks/useRollDisplay";
import RollingDiceOverlay from "../components/RollingDiceOverlay";
import { colorLabel } from "../utils/i18n";
import TurnIndicator from "../components/TurnIndicator";

function ReplayScreen() {
  const { gameId } = useParams();
  const { state, dispatch } = useContext(store);
  const [latestStateIndex, setLatestStateIndex] = useState<number>(0);
  const [stateIndex, setStateIndex] = useState<number>(0);
  const { displayRoll, overlayRoll, overlayVisible, finalizeOverlay } =
    useRollDisplay(state.gameState);
  const rollForHighlight = overlayRoll ?? displayRoll;
  const highlightedRollNumber = rollForHighlight
    ? rollForHighlight[0] + rollForHighlight[1]
    : null;

  const handlePrevState = () => setStateIndex((prev) => Math.max(prev - 1, 0));
  const handleNextState = () => setStateIndex((prev) => Math.min(prev + 1, latestStateIndex));

  useEffect(() => {
    if (!gameId) return;

    (async () => {
      const latestState = await getState(gameId, "latest");
      dispatch({ type: ACTIONS.SET_GAME_STATE, data: latestState });
      setLatestStateIndex(latestState.state_index);
    })();
  }, [gameId, dispatch]);

  useEffect(() => {
    if (!gameId) {
      return;
    }

    (async () => {
      const gameState = await getState(gameId, stateIndex);
      dispatch({ type: ACTIONS.SET_GAME_STATE, data: gameState });
    })();
  }, [gameId, stateIndex, dispatch]);

  const turnLabel = state.gameState
    ? colorLabel(state.gameState.current_color)
    : undefined;
  const turnPillClass = state.gameState
    ? `turn-pill-${state.gameState.current_color.toLowerCase()}`
    : undefined;

  if (!state.gameState) {
    return (
      <main>
        <GridLoader
          className="loader"
          color="#000000"
          size={100}
        />
      </main>
    );
  }

  return (
    <main>
      <h1 className="logo">Catanatron</h1>
      <TurnIndicator gameState={state.gameState} />
      <RollingDiceOverlay
        roll={overlayRoll}
        visible={overlayVisible}
        currentTurnLabel={turnLabel}
        currentColorClass={turnPillClass}
        onComplete={finalizeOverlay}
      />
      <ZoomableBoard replayMode={true} highlightedRollNumber={highlightedRollNumber} />
      <LeftDrawer />
      <RightDrawer>
        <DiceDisplay roll={displayRoll} />
        <Divider />
        <ReplayBox
          stateIndex={stateIndex}
          latestStateIndex={latestStateIndex}
          onNextMove={handleNextState}
          onPrevMove={handlePrevState}
          onSeekMove={(index) => setStateIndex(index)}
        />
      </RightDrawer>
    </main>
  );
}

export default ReplayScreen;
