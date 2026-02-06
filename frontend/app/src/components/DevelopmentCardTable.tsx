import type { PlayerState } from "../utils/api.types";

const DEV_CARD_ORDER = [
  "VICTORY_POINT",
  "KNIGHT",
  "MONOPOLY",
  "YEAR_OF_PLENTY",
  "ROAD_BUILDING",
] as const;

const COLUMN_LABELS: Record<
  (typeof DEV_CARD_ORDER)[number] | "TOTAL",
  string
> = {
  TOTAL: "合計",
  VICTORY_POINT: "勝利点",
  KNIGHT: "騎士",
  MONOPOLY: "独占",
  YEAR_OF_PLENTY: "収穫",
  ROAD_BUILDING: "街道建設",
};

type DevelopmentCardTableProps = {
  playerState: PlayerState;
  playerKey: string;
  hideUnusedDetails?: boolean;
};

export default function DevelopmentCardTable({
  playerState,
  playerKey,
  hideUnusedDetails = false,
}: DevelopmentCardTableProps) {
  const playedCounts = DEV_CARD_ORDER.map(
    (card) => playerState[`${playerKey}_PLAYED_${card}`] ?? 0
  );
  const unusedCounts = DEV_CARD_ORDER.map(
    (card) => playerState[`${playerKey}_${card}_IN_HAND`] ?? 0
  );
  const totalPlayed = playedCounts.reduce((sum, value) => sum + value, 0);
  const totalUnused = unusedCounts.reduce((sum, value) => sum + value, 0);

  const formatUnusedValue = (value: number) =>
    hideUnusedDetails ? "—" : value;

  return (
    <div className="development-card-table">
      <div className="dev-table-row header">
        <span className="row-label"></span>
        <span className="value">{COLUMN_LABELS.TOTAL}</span>
        {DEV_CARD_ORDER.map((card) => (
          <span key={`header-${card}`} className="value">
            {COLUMN_LABELS[card]}
          </span>
        ))}
      </div>
      <div className="dev-table-row">
        <span className="row-label">使用済み</span>
        <span className="value">{totalPlayed}</span>
        {DEV_CARD_ORDER.map((card, index) => (
          <span key={`played-${card}`} className="value">
            {playedCounts[index]}
          </span>
        ))}
      </div>
      <div className="dev-table-row">
        <span className="row-label">未使用</span>
        <span className="value">{totalUnused}</span>
        {DEV_CARD_ORDER.map((card, index) => (
          <span key={`unused-${card}`} className="value">
            {formatUnusedValue(unusedCounts[index])}
          </span>
        ))}
      </div>
    </div>
  );
}
