import { useCallback, useEffect, useMemo, useState } from "react";
import type { Color, GameState } from "../utils/api.types";

export type RollValue = [number, number];

type RollInfo = {
  roll: RollValue | null;
  key: string | null;
  roller: Color | null;
};

function extractLatestRoll(gameState: GameState | null): RollInfo {
  if (!gameState) {
    return { roll: null, key: null, roller: null };
  }
  for (let i = gameState.action_records.length - 1; i >= 0; i--) {
    const record = gameState.action_records[i];
    if (record[0][1] === "ROLL") {
      const roll = record[1] as RollValue;
      const key = `${roll[0]}-${roll[1]}-${i}`;
      const roller = record[0][0] as Color;
      return { roll, key, roller };
    }
  }
  return { roll: null, key: null, roller: null };
}

export default function useRollDisplay(gameState: GameState | null) {
  const latest = useMemo(() => extractLatestRoll(gameState), [gameState]);
  const [displayRoll, setDisplayRoll] = useState<RollValue | null>(
    () => latest.roll
  );
  const [displayRollKey, setDisplayRollKey] = useState<string | null>(
    () => latest.key
  );
  const [overlayRoll, setOverlayRoll] = useState<RollValue | null>(null);
  const [overlayKey, setOverlayKey] = useState<string | null>(null);

  useEffect(() => {
    if (!gameState) {
      setDisplayRoll(null);
      setDisplayRollKey(null);
      setOverlayRoll(null);
      setOverlayKey(null);
      return;
    }

    if (!latest.roll || !latest.key) {
      setDisplayRoll(null);
      setDisplayRollKey(null);
      setOverlayRoll(null);
      setOverlayKey(null);
      return;
    }

    if (latest.key === displayRollKey || latest.key === overlayKey) {
      return;
    }

    const shouldAnimateRoll =
      Boolean(latest.roll) &&
      gameState &&
      latest.roller === gameState.current_color;

    if (shouldAnimateRoll) {
      setOverlayRoll(latest.roll);
      setOverlayKey(latest.key);
      return;
    }

    setDisplayRoll(latest.roll);
    setDisplayRollKey(latest.key);
    setOverlayRoll(null);
    setOverlayKey(null);
  }, [latest, displayRollKey, overlayKey, gameState]);

  const finalizeOverlay = useCallback(() => {
    if (overlayKey && overlayRoll) {
      setDisplayRoll(overlayRoll);
      setDisplayRollKey(overlayKey);
    }
    setOverlayRoll(null);
    setOverlayKey(null);
  }, [overlayKey, overlayRoll]);

  return {
    displayRoll,
    displayRollKey,
    overlayRoll,
    overlayVisible: Boolean(overlayKey && overlayRoll),
    finalizeOverlay,
  };
}
