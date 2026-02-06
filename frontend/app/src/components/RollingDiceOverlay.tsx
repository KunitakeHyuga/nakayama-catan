import { useEffect, useState } from "react";
import type { RollValue } from "../hooks/useRollDisplay";

import "./RollingDiceOverlay.scss";

type RollingDiceOverlayProps = {
  roll: RollValue | null;
  visible: boolean;
  duration?: number;
  onComplete: () => void;
  currentTurnLabel?: string;
  currentColorClass?: string;
};

export default function RollingDiceOverlay({
  roll,
  visible,
  duration = 2000,
  onComplete,
  currentTurnLabel,
  currentColorClass,
}: RollingDiceOverlayProps) {
  const [showResult, setShowResult] = useState(false);

  useEffect(() => {
    if (!visible || !roll) {
      setShowResult(false);
      return;
    }
    setShowResult(false);
    const revealTimer = setTimeout(() => {
      setShowResult(true);
    }, duration - 500);
    const finalTimer = setTimeout(() => {
      onComplete();
    }, duration);
    return () => {
      clearTimeout(revealTimer);
      clearTimeout(finalTimer);
    };
  }, [visible, roll, duration, onComplete]);

  useEffect(() => {
    return () => setShowResult(false);
  }, []);

  if (!visible || !roll) {
    return null;
  }

  return (
    <div className="dice-overlay">
      <div className="overlay-content">
        <p className="overlay-message">
          {showResult ? "出目が確定しました！" : "ダイスを振っています..."}
        </p>
        {currentTurnLabel && (
          <p className="overlay-turn">
            <span
              className={`turn-pill ${currentColorClass ?? ""}`}
            >{`${currentTurnLabel}の番です`}</span>
          </p>
        )}
        <div className="overlay-dice-container">
          {roll.map((value, index) => (
            <div
              key={index}
              className={`overlay-die ${showResult ? "revealed" : "rolling"}`}
            >
              <div className="die-face">
                <span className="overlay-die-value">
                  {showResult ? value : "?"}
                </span>
                {showResult && (
                  <span className="overlay-die-pips" aria-hidden="true">
                    {value}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
