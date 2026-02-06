import type { Color } from "./api.types";

const STORAGE_KEY = "catanatron:record-player-names";

type PlayerNameMap = Partial<Record<Color, string | null>>;
type StoredMap = Record<string, PlayerNameMap>;

function normalizeNames(names: PlayerNameMap): PlayerNameMap {
  const normalized: PlayerNameMap = {};
  Object.entries(names).forEach(([color, name]) => {
    if (typeof name === "string") {
      const trimmed = name.trim();
      normalized[color as Color] = trimmed.length > 0 ? trimmed : null;
    } else {
      normalized[color as Color] = null;
    }
  });
  return normalized;
}

function loadMap(): StoredMap {
  if (typeof window === "undefined") {
    return {};
  }
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return {};
  }
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      return parsed as StoredMap;
    }
  } catch (error) {
    console.error("Failed to parse record player names", error);
  }
  return {};
}

export function saveRecordPlayerNames(
  gameId: string,
  names: PlayerNameMap
) {
  if (typeof window === "undefined") {
    return;
  }
  const normalized = normalizeNames(names);
  const hasAny = Object.values(normalized).some((value) => Boolean(value));
  if (!hasAny) {
    return;
  }
  const current = loadMap();
  current[gameId] = { ...(current[gameId] ?? {}), ...normalized };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
}

export function getRecordPlayerNames(
  gameId?: string | null
): PlayerNameMap | null {
  if (!gameId || typeof window === "undefined") {
    return null;
  }
  const current = loadMap();
  return current[gameId] ?? null;
}
