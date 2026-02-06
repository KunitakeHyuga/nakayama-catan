import cn from "classnames";

import "./PlayerStateBox.scss";
import { type Color, type PlayerState } from "../utils/api.types";
import ResourceCards from "./ResourceCards";
import DevelopmentCardTable from "./DevelopmentCardTable";
import { colorLabel } from "../utils/i18n";
import CollapsibleSection from "./CollapsibleSection";

type PlayerStateBoxProps = {
  playerState: PlayerState;
  playerKey: string;
  color: Color;
  playerName?: string | null;
  showFullDevelopmentCards?: boolean;
  isArmyLeader?: boolean;
  isRoadLeader?: boolean;
  isVictoryLeader?: boolean;
};

export default function PlayerStateBox({
  playerState,
  playerKey,
  color,
  playerName,
  showFullDevelopmentCards = false,
  isArmyLeader = false,
  isRoadLeader = false,
  isVictoryLeader = false,
}: PlayerStateBoxProps) {
  const publicVps = playerState[`${playerKey}_VICTORY_POINTS`];
  const actualVps = playerState[`${playerKey}_ACTUAL_VICTORY_POINTS`];
  const victoryPointsDisplay =
    showFullDevelopmentCards &&
    typeof actualVps === "number" &&
    actualVps !== publicVps
      ? `${publicVps} (${actualVps})`
      : publicVps;
  const colorText = colorLabel(color);
  const nameText = playerName ? `（${playerName}）` : "";
  return (
    <div className={cn("player-state-box foreground", color)}>
      <div className="player-header">
        <span className="player-name">
          <span className={`player-color-text player-color-${color.toLowerCase()}`}>
            {colorText}
          </span>
          {nameText}
        </span>
        <span className="player-label">の所持カード</span>
      </div>
      <ResourceCards
        playerState={playerState}
        playerKey={playerKey}
        maskDevelopmentCards={!showFullDevelopmentCards}
        hideDevelopmentCards={false}
      />
      <DevelopmentCardTable
        playerState={playerState}
        playerKey={playerKey}
        hideUnusedDetails={!showFullDevelopmentCards}
      />
      <div className="scores">
        <div
          className={cn("num-knights center-text", {
            bold: playerState[`${playerKey}_HAS_ARMY`],
            leader: isArmyLeader,
            [`leader-${color.toLowerCase()}`]: isArmyLeader,
          })}
          title="最大騎士力"
        >
          <span>{playerState[`${playerKey}_PLAYED_KNIGHT`]}</span>
          <small>最大騎士力</small>
        </div>
        <div
          className={cn("num-roads center-text", {
            bold: playerState[`${playerKey}_HAS_ROAD`],
            leader: isRoadLeader,
            [`leader-${color.toLowerCase()}`]: isRoadLeader,
          })}
          title="最長交易路"
        >
          {playerState[`${playerKey}_LONGEST_ROAD_LENGTH`]}
          <small>最長交易路</small>
        </div>
        <div
          className={cn("victory-points center-text", {
            bold: publicVps >= 10,
            leader: isVictoryLeader,
            [`leader-${color.toLowerCase()}`]: isVictoryLeader,
          })}
          title="公開勝利点"
        >
          {victoryPointsDisplay}
          <small>公開勝利点</small>
        </div>
      </div>
    </div>
  );
}
