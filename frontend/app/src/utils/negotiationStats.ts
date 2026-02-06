import type { Color, GameActionRecord, GameState } from "./api.types";
import type { GameEvent } from "./apiClient";

type TradeAttempt = {
  offerIndex: number;
  startTimestamp: number | null;
  endTimestamp: number | null;
  success: boolean | null;
  rejectsNeeded: number;
  rejects: number;
  hasAcceptance: boolean;
};

export type NegotiationStats = {
  playerColor: Color;
  offerCount: number;
  successCount: number;
  successRate: number | null;
  totalDurationMs: number | null;
  averageDurationMs: number | null;
  adviceRequestCount: number;
  adviceLedToOfferCount: number;
  adviceFollowRate: number | null;
  timestampsAvailable: boolean;
};

const NEGOTIATION_ADVICE_EVENT = "NEGOTIATION_ADVICE_REQUEST";

function resolveAttempt(attempt: TradeAttempt, success: boolean, timestamp: number | null) {
  attempt.success = success;
  attempt.endTimestamp = timestamp;
}

function extractAction(actionRecord: GameActionRecord) {
  return actionRecord[0];
}

function clampStateIndex(index: number, total: number): number {
  if (Number.isNaN(index) || index < 0) {
    return 0;
  }
  return Math.min(index, total);
}

function calculateStatsForPlayer(
  gameState: GameState,
  events: GameEvent[],
  playerColor: Color,
  fallbackAdviceColor: Color | null
): NegotiationStats {
  const timestamps = gameState.action_timestamps ?? [];
  const timestampsAvailable =
    Array.isArray(timestamps) &&
    timestamps.length === gameState.action_records.length;
  const attempts: TradeAttempt[] = [];
  let activeAttempt: TradeAttempt | null = null;

  const opponentCount = Math.max(gameState.colors.length - 1, 0);

  gameState.action_records.forEach((record, index) => {
    const action = extractAction(record);
    const [color, actionType] = action;
    const timestamp = timestampsAvailable ? timestamps[index] ?? null : null;
    if (actionType === "OFFER_TRADE" && color === playerColor) {
      if (activeAttempt && activeAttempt.success === null) {
        resolveAttempt(activeAttempt, false, timestamp);
      }
      activeAttempt = {
        offerIndex: index,
        startTimestamp: timestamp,
        endTimestamp: null,
        success: null,
        rejectsNeeded: opponentCount,
        rejects: 0,
        hasAcceptance: false,
      };
      attempts.push(activeAttempt);
      return;
    }

    if (!activeAttempt) {
      return;
    }

    if (actionType === "ACCEPT_TRADE" && color !== playerColor) {
      activeAttempt.hasAcceptance = true;
    } else if (actionType === "REJECT_TRADE" && color !== playerColor) {
      activeAttempt.rejects += 1;
      if (
        !activeAttempt.hasAcceptance &&
        activeAttempt.rejects >= activeAttempt.rejectsNeeded
      ) {
        resolveAttempt(activeAttempt, false, timestamp);
        activeAttempt = null;
      }
    } else if (actionType === "CONFIRM_TRADE" && color === playerColor) {
      resolveAttempt(activeAttempt, true, timestamp);
      activeAttempt = null;
    } else if (actionType === "CANCEL_TRADE" && color === playerColor) {
      resolveAttempt(activeAttempt, false, timestamp);
      activeAttempt = null;
    }
  });

  const offerCount = attempts.length;
  const successCount = attempts.filter((attempt) => attempt.success).length;
  const successRate =
    offerCount > 0 ? successCount / offerCount : null;

  const resolvedDurations = attempts
    .map((attempt) => {
      if (
        attempt.startTimestamp !== null &&
        attempt.endTimestamp !== null &&
        attempt.endTimestamp >= attempt.startTimestamp
      ) {
        return attempt.endTimestamp - attempt.startTimestamp;
      }
      return null;
    })
    .filter((value): value is number => value !== null);

  const totalDurationMs =
    resolvedDurations.length > 0
      ? resolvedDurations.reduce((sum, duration) => sum + duration, 0)
      : null;
  const averageDurationMs =
    resolvedDurations.length > 0 && totalDurationMs !== null
      ? totalDurationMs / resolvedDurations.length
      : null;

  const actionRecords = gameState.action_records;
  const adviceEvents = events.filter(
    (event) => event.event_type === NEGOTIATION_ADVICE_EVENT
  );
  const filteredAdvice = adviceEvents.filter((event) => {
    const payload = (event.payload ?? {}) as Record<string, unknown>;
    const requestedColor = payload["requester_color"];
    if (typeof requestedColor === "string") {
      return requestedColor === playerColor;
    }
    return fallbackAdviceColor === playerColor;
  });

  const adviceFollowUps = filteredAdvice.filter((event) => {
    if (!actionRecords.length) {
      return false;
    }
    const targetStartIndex = clampStateIndex(
      typeof event.state_index === "number"
        ? event.state_index
        : actionRecords.length,
      actionRecords.length
    );
    let turnEndIndex = actionRecords.length;
    for (let i = targetStartIndex; i < actionRecords.length; i += 1) {
      const action = extractAction(actionRecords[i]);
      if (action[0] === playerColor && action[1] === "END_TURN") {
        turnEndIndex = i;
        break;
      }
    }
    for (let i = targetStartIndex; i < turnEndIndex; i += 1) {
      const action = extractAction(actionRecords[i]);
      if (action[0] === playerColor && action[1] === "OFFER_TRADE") {
        return true;
      }
    }
    return false;
  });

  const adviceRequestCount = filteredAdvice.length;
  const adviceLedToOfferCount = adviceFollowUps.length;
  const adviceFollowRate =
    adviceRequestCount > 0
      ? adviceLedToOfferCount / adviceRequestCount
      : null;

  return {
    playerColor,
    offerCount,
    successCount,
    successRate,
    totalDurationMs,
    averageDurationMs,
    adviceRequestCount,
    adviceLedToOfferCount,
    adviceFollowRate,
    timestampsAvailable,
  };
}

export function calculateNegotiationStats(
  gameState: GameState,
  events: GameEvent[] = []
): NegotiationStats[] {
  const colors = gameState.colors ?? [];
  if (colors.length === 0) {
    return [];
  }
  const botColors = gameState.bot_colors ?? [];
  const humanColors = colors.filter((color) => !botColors.includes(color));
  const fallbackAdviceColor =
    humanColors.length === 1 ? humanColors[0] : null;
  return colors.map((color) =>
    calculateStatsForPlayer(gameState, events, color, fallbackAdviceColor)
  );
}
