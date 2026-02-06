import type { Color, GameState } from "../utils/api.types";
import { colorLabel } from "../utils/i18n";
import { getHumanColor } from "../utils/stateUtils";

import "./TurnIndicator.scss";

type Props = {
  gameState: GameState | null;
  playerColorOverride?: Color | null;
};

export default function TurnIndicator({ gameState, playerColorOverride }: Props) {
  if (!gameState) {
    return null;
  }
  const humanColor =
    playerColorOverride ?? getHumanColor(gameState);
  const label = `${colorLabel(gameState.current_color)}${
    humanColor && humanColor === gameState.current_color ? "（あなた）" : ""
  }`;
  const pillClass = `turn-pill turn-pill-${gameState.current_color.toLowerCase()}`;

  return (
    <div className="turn-indicator">
      <span className="turn-label">現在の番:</span>
      <span className={pillClass}>{label}</span>
    </div>
  );
}
