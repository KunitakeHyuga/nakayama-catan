import type { RollValue } from "../hooks/useRollDisplay";

import "./DiceDisplay.scss";

type DiceDisplayProps = {
  roll: RollValue | null;
};

const pipMap: Record<number, string> = {
  1: "•",
  2: "• •",
  3: "• ••",
  4: "•• ••",
  5: "•• •••",
  6: "••• •••",
};

export default function DiceDisplay({ roll }: DiceDisplayProps) {
  if (!roll) {
    return null;
  }
  const [first, second] = roll;
  const total = first + second;

  const renderDie = (value: number, index: number) => (
    <div key={index} className="die">
      <span className="value">{value}</span>
      <span className="pips" aria-hidden="true">
        {pipMap[value]}
      </span>
    </div>
  );

  return (
    <section className="dice-display" aria-label="直近の出目">
      <div className="dice-info">
        <div className="dice-label">直近の出目</div>
        <div className="dice-total">合計 {total}</div>
      </div>
      <div className="dice-values">
        {renderDie(first, 0)}
        {renderDie(second, 1)}
      </div>
    </section>
  );
}
