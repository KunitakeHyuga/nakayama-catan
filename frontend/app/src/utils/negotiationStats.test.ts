import { describe, expect, it } from "vitest";

import type { Color, GameActionRecord, GameState } from "./api.types";
import type { GameEvent } from "./apiClient";
import { calculateNegotiationStats } from "./negotiationStats";

const defaultState = (): GameState => ({
  tiles: [],
  adjacent_tiles: {},
  bot_colors: ["BLUE", "WHITE", "ORANGE"],
  colors: ["RED", "BLUE", "WHITE", "ORANGE"],
  current_color: "RED",
  winning_color: null,
  current_prompt: "PLAY_TURN",
  player_state: {},
  action_records: [],
  action_timestamps: [],
  robber_coordinate: [0, 0, 0],
  nodes: [],
  edges: [],
  current_playable_actions: [],
  is_initial_build_phase: false,
  state_index: 0,
  has_human_player: true,
  trade: null,
});

const record = (
  color: Color,
  type: string,
  value: any = null,
  result: any = null
): GameActionRecord => [[color, type as any, value] as any, result];

describe("calculateNegotiationStats", () => {
  it("returns stats for all colors even when only bots are present", () => {
    const gameState = {
      ...defaultState(),
      bot_colors: ["RED", "BLUE"],
      colors: ["RED", "BLUE"],
    };
    const stats = calculateNegotiationStats(gameState, []);
    expect(stats).toHaveLength(2);
    const redStats = stats.find((entry) => entry.playerColor === "RED");
    const blueStats = stats.find((entry) => entry.playerColor === "BLUE");
    expect(redStats?.offerCount).toBe(0);
    expect(redStats?.adviceRequestCount).toBe(0);
    expect(blueStats?.offerCount).toBe(0);
    expect(blueStats?.adviceRequestCount).toBe(0);
  });

  it("counts attempts, successes, durations, and advice follow-ups", () => {
    const action_records: GameActionRecord[] = [
      record("RED", "OFFER_TRADE"),
      record("BLUE", "REJECT_TRADE"),
      record("WHITE", "REJECT_TRADE"),
      record("ORANGE", "REJECT_TRADE"),
      record("RED", "OFFER_TRADE"),
      record("BLUE", "ACCEPT_TRADE"),
      record("RED", "CONFIRM_TRADE"),
      record("RED", "END_TURN"),
    ];
    const action_timestamps = [
      1000, 1100, 1200, 1300, 2000, 2100, 2300, 2400,
    ];
    const gameState: GameState = {
      ...defaultState(),
      action_records,
      action_timestamps,
      state_index: action_records.length,
    };
    const events: GameEvent[] = [
      {
        event_id: 1,
        game_id: "g1",
        event_type: "NEGOTIATION_ADVICE_REQUEST",
        state_index: 0,
        payload: { requester_color: "RED" },
      },
      {
        event_id: 2,
        game_id: "g1",
        event_type: "NEGOTIATION_ADVICE_REQUEST",
        state_index: 7,
        payload: { requester_color: "RED" },
      },
    ];

    const stats = calculateNegotiationStats(gameState, events);
    const redStats = stats.find((entry) => entry.playerColor === "RED");
    expect(redStats?.offerCount).toBe(2);
    expect(redStats?.successCount).toBe(1);
    expect(redStats?.successRate).toBeCloseTo(0.5);
    expect(redStats?.timestampsAvailable).toBe(true);
    expect(redStats?.totalDurationMs).toBe(600);
    expect(redStats?.averageDurationMs).toBe(300);
    expect(redStats?.adviceRequestCount).toBe(2);
    expect(redStats?.adviceLedToOfferCount).toBe(1);
    expect(redStats?.adviceFollowRate).toBeCloseTo(0.5);
  });
});
