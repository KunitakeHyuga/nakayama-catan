import { isPlayersTurn } from "../utils/stateUtils";
import { type Color, type GameState } from "../utils/api.types";

import "./Prompt.scss";
import { colorLabel } from "../utils/i18n";

const PROMPT_LABELS: Record<string, string> = {
  ROLL: "あなたの番です",
  PLAY_TURN: "あなたの番です",
  DISCARD: "資源を捨ててください",
  BUILD_INITIAL_SETTLEMENT: "初期開拓地を建設してください",
  BUILD_INITIAL_ROAD: "初期街道を建設してください",
  BUILD_SETTLEMENT: "開拓地を建設してください",
  BUILD_CITY: "都市を建設してください",
  BUILD_ROAD: "街道を建設してください",
  PLAY_KNIGHT_CARD: "騎士カードを使ってください",
  PLAY_ROAD_BUILDING: "街道建設カードを使ってください",
  PLAY_MONOPOLY: "独占カードを使ってください",
  PLAY_YEAR_OF_PLENTY: "豊穣の年カードを使ってください",
  MOVE_ROBBER: "盗賊を移動してください",
  MARITIME_TRADE: "港で交易してください",
  DECIDE_TRADE: "交渉の提案に回答してください",
  DECIDE_ACCEPTEES: "誰と交渉成立させるか選んでください",
  END_TURN: "ターンを終了してください",
};

function humanizePrompt(currentPrompt: string): string {
  if (PROMPT_LABELS[currentPrompt]) {
    return PROMPT_LABELS[currentPrompt];
  }
  const prompt = currentPrompt.replaceAll("_", " ");
  return `${prompt} を実行してください`;
}

export default function Prompt({
  gameState,
  isBotThinking,
  playerColor,
}: {
  gameState: GameState;
  isBotThinking: boolean;
  playerColor?: Color | null;
}) {
  let prompt = "";
  if (isBotThinking) {
    prompt = "ボットが思考中です…";
  } else if (gameState.winning_color) {
    prompt = `ゲーム終了。${colorLabel(gameState.winning_color)}の勝ちです！`;
  } else if (isPlayersTurn(gameState, playerColor ?? undefined)) {
    prompt = humanizePrompt(gameState.current_prompt);
  }
  return <div className="prompt">{prompt}</div>;
}
