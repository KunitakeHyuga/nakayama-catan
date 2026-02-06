import { useEffect, useRef } from "react";
import type { Color, GameState, ResourceCard } from "../utils/api.types";
import { getHumanColor, playerKey } from "../utils/stateUtils";
import { playSound } from "../utils/audioManager";

const BUILD_ACTIONS = new Set(["BUILD_SETTLEMENT", "BUILD_CITY", "BUILD_ROAD"]);
const DEV_CARD_ACTIONS = new Set([
  "BUY_DEVELOPMENT_CARD",
  "PLAY_KNIGHT_CARD",
  "PLAY_ROAD_BUILDING",
  "PLAY_MONOPOLY",
  "PLAY_YEAR_OF_PLENTY",
]);

function sumResources(gameState: GameState, color: Color): number {
  const key = playerKey(gameState, color);
  const resources: ResourceCard[] = ["WOOD", "BRICK", "SHEEP", "WHEAT", "ORE"];
  return resources.reduce((sum, resource) => {
    const amount = gameState.player_state[`${key}_${resource}_IN_HAND`] ?? 0;
    return sum + amount;
  }, 0);
}

export default function useSoundEffects(
  gameState: GameState | null,
  enabled: boolean
) {
  const previousActionCountRef = useRef(0);
  const previousResourceCountRef = useRef<number | null>(null);

  useEffect(() => {
    if (!gameState) {
      previousActionCountRef.current = 0;
      previousResourceCountRef.current = null;
      return;
    }

    const currentActionCount = gameState.action_records.length;
    const previousActionCount = previousActionCountRef.current;
    if (enabled && currentActionCount > previousActionCount) {
      const newActions = gameState.action_records.slice(previousActionCount);
      newActions.forEach((actionRecord) => {
        const actionType = actionRecord?.[0]?.[1];
        if (actionType === "ROLL") {
          playSound("dice");
        } else if (actionType && BUILD_ACTIONS.has(actionType)) {
          playSound("build");
        } else if (actionType && DEV_CARD_ACTIONS.has(actionType)) {
          playSound("devCard");
        } else if (actionType === "CONFIRM_TRADE") {
          playSound("tradeSuccess");
        } else if (actionType === "CANCEL_TRADE") {
          playSound("tradeFail");
        } else if (
          actionType === "OFFER_TRADE" ||
          actionType === "MARITIME_TRADE"
        ) {
          playSound("tradeStart");
        } else if (actionType === "MOVE_ROBBER") {
          playSound("robber");
        } else if (actionType === "END_TURN") {
          playSound("turnEnd");
        }
      });
    }
    previousActionCountRef.current = currentActionCount;

    const humanColor = gameState ? getHumanColor(gameState) : null;
    if (!humanColor) {
      previousResourceCountRef.current = null;
      return;
    }
    const currentTotal = sumResources(gameState, humanColor);
    const previousTotal = previousResourceCountRef.current;
    if (enabled && previousTotal !== null && currentTotal > previousTotal) {
      playSound("resource");
    }
    previousResourceCountRef.current = currentTotal;
  }, [gameState, enabled]);
}
