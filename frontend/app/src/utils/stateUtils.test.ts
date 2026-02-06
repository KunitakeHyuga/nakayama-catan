import { describe, test, expect } from "vitest";
import { getHumanColor, isPlayersTurn, playerKey } from "./stateUtils";
import { type GameState } from "./api.types";

describe("isPlayersTurn", () => {
  test("isTrue", () => {
    const gameState: Partial<GameState> = {
      bot_colors: ["BLUE"],
      colors: ["BLUE", "RED"],
      current_color: "RED",
    };
    expect(isPlayersTurn(gameState as GameState)).toBeTruthy();
  });
  test("isFalse", () => {
    const gameState: Partial<GameState> = {
      bot_colors: ["BLUE"],
      colors: ["BLUE", "RED"],
      current_color: "BLUE",
    };
    expect(isPlayersTurn(gameState as GameState)).toBeFalsy();
  });
  test("respects player color override", () => {
    const gameState: Partial<GameState> = {
      bot_colors: [],
      colors: ["BLUE", "RED"],
      current_color: "RED",
    };
    expect(isPlayersTurn(gameState as GameState, "BLUE")).toBeFalsy();
    expect(isPlayersTurn(gameState as GameState, "RED")).toBeTruthy();
  });
});

describe("playerKey", () => {
  test("valid color", () => {
    const gameState: Partial<GameState> = {
      bot_colors: ["BLUE"],
      colors: ["BLUE", "RED"],
      current_color: "BLUE",
    };
    expect(playerKey(gameState as GameState, "RED")).toBe("P1");
  });
  test("bot color", () => {
    const gameState: Partial<GameState> = {
      bot_colors: ["BLUE"],
      colors: ["BLUE", "RED"],
      current_color: "BLUE",
    };
    expect(playerKey(gameState as GameState, "BLUE")).toBe("P0");
  });
});

describe("getHumanColor", () => {
  test("single human", () => {
    const gameState: Partial<GameState> = {
      bot_colors: ["BLUE"],
      colors: ["BLUE", "RED"],
      current_color: "BLUE",
    };
    expect(getHumanColor(gameState as GameState)).toBe("RED");
  });
  test("only bots", () => {
    const gameState: Partial<GameState> = {
      bot_colors: ["BLUE", "RED"],
      colors: ["BLUE", "RED"],
      current_color: "BLUE",
    };
    expect(getHumanColor(gameState as GameState)).toBeUndefined();
  });
});
