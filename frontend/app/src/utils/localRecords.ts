import type { GameState } from "./api.types";
import type { GameRecordSummary } from "./apiClient";

const STORAGE_KEY = "catanatron:records";
const MAX_RECORDS = 100;

export type LocalRecord = GameRecordSummary & { updated_at_ms: number };

function normalizeRecord(entry: any): LocalRecord | null {
  if (!entry || typeof entry.game_id !== "string") {
    return null;
  }
  const ms =
    typeof entry.updated_at_ms === "number"
      ? entry.updated_at_ms
      : typeof entry.updated_at === "number"
      ? entry.updated_at
      : typeof entry.updated_at === "string"
      ? Date.parse(entry.updated_at)
      : 0;
  const isoString =
    typeof entry.updated_at === "string"
      ? entry.updated_at
      : ms > 0
      ? new Date(ms).toISOString()
      : undefined;
  return {
    ...entry,
    updated_at: isoString,
    updated_at_ms: ms,
  };
}

function safeParse(value: string | null): LocalRecord[] {
  if (!value) {
    return [];
  }
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed
        .map((entry) => normalizeRecord(entry))
        .filter((entry): entry is LocalRecord => Boolean(entry));
    }
    return [];
  } catch (error) {
    console.error("Failed to parse local records", error);
    return [];
  }
}

export function getLocalRecords(): LocalRecord[] {
  if (typeof window === "undefined") {
    return [];
  }
  return safeParse(window.localStorage.getItem(STORAGE_KEY));
}

function persist(records: LocalRecord[]) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

export function upsertLocalRecord(
  gameId: string,
  gameState: GameState
) {
  if (typeof window === "undefined") {
    return;
  }
  const current: LocalRecord[] = getLocalRecords();
  const withoutCurrent = current.filter((record) => record.game_id !== gameId);
  const timestamp = Date.now();
  const nextRecord: LocalRecord = {
    game_id: gameId,
    updated_at: new Date(timestamp).toISOString(),
    updated_at_ms: timestamp,
    state_index: gameState.state_index,
    winning_color: gameState.winning_color ?? null,
    current_color: gameState.current_color,
    player_colors: gameState.colors,
    turns_completed: gameState.action_records
      ? gameState.action_records.reduce(
          (sum, record) => (record[0][1] === "END_TURN" ? sum + 1 : sum),
          0
        )
      : 0,
  };
  const updated = [nextRecord, ...withoutCurrent]
    .sort((a, b) => b.updated_at_ms - a.updated_at_ms)
    .slice(0, MAX_RECORDS);
  persist(updated);
}

export function removeLocalRecord(gameId: string) {
  if (typeof window === "undefined") {
    return;
  }
  const remaining = getLocalRecords().filter(
    (record) => record.game_id !== gameId
  );
  persist(remaining);
}
