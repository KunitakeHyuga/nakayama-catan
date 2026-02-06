import type {
  Tile,
  PlacedTile,
  GameActionRecord,
  MaritimeTradeAction,
  BuildCityAction,
  BuildRoadAction,
  PlayYearOfPlentyAction,
  MoveRobberAction,
  ResourceCard,
  TradeOfferVector,
  ActiveTradeVector,
  TradeConfirmVector,
  Color,
} from "./api.types";
import type { GameState } from "./api.types";
import { colorLabel, resourceLabel } from "./i18n";

const RESOURCE_ORDER: ResourceCard[] = [
  "WOOD",
  "BRICK",
  "SHEEP",
  "WHEAT",
  "ORE",
];

function formatTradeBundle(counts: number[]): string {
  const entries = counts
    .map((count, index) =>
      count > 0 ? `${resourceLabel(RESOURCE_ORDER[index])}×${count}` : null
    )
    .filter(Boolean);
  return entries.length > 0 ? entries.join(" + ") : "なし";
}

function describeDomesticTrade(
  vector: TradeOfferVector | ActiveTradeVector | TradeConfirmVector
): string {
  const offer = vector.slice(0, 5) as number[];
  const request = vector.slice(5, 10) as number[];
  return `${formatTradeBundle(offer)} ⇄ ${formatTradeBundle(request)}`;
}

export function humanizeActionRecord(
  gameState: GameState,
  actionRecord: GameActionRecord
) {
  const botColors = gameState.bot_colors;
  const action = actionRecord[0];
  const actorColor = colorLabel(action[0]);
  const player =
    botColors.includes(action[0]) && botColors.length > 0
      ? `${actorColor}（ボット）`
      : actorColor;
  switch (actionRecord[0][1]) {
    case "ROLL": {
      const action = actionRecord[1] as [number, number];
      return `${player}がダイスで ${action[0] + action[1]} を出しました`;
    }
    case "DISCARD":
      return `${player}が資源を捨てました`;
    case "BUY_DEVELOPMENT_CARD":
      return `${player}が開発カードを購入しました`;
    case "BUILD_SETTLEMENT":
    case "BUILD_CITY": {
      const action = actionRecord[0] as BuildCityAction;
      const parts = action[1].split("_");
      const building = parts[parts.length - 1];
      const tileId = action[2];
      const tiles = gameState.adjacent_tiles[tileId];
      const tileString = tiles.map(getShortTileString).join("-");
      const buildingLabel = building === "CITY" ? "都市" : "開拓地";
      return `${player}が${tileString}に${buildingLabel}を建設しました`;
    }
    case "BUILD_ROAD": {
      const action = actionRecord[0] as BuildRoadAction;
      const edge = action[2];
      const a = gameState.adjacent_tiles[edge[0]].map((t) => t.id);
      const b = gameState.adjacent_tiles[edge[1]].map((t) => t.id);
      const intersection = a.filter((t) => b.includes(t));
      const tiles = intersection.map(
        (tileId) => findTileById(gameState, tileId).tile
      );
      const edgeString = tiles.map(getShortTileString).join("-");
      return `${player}が${edgeString}に街道を建設しました`;
    }
    case "PLAY_KNIGHT_CARD": {
      return `${player}が騎士カードを使用しました`;
    }
    case "PLAY_ROAD_BUILDING": {
      return `${player}が街道建設カードを使用しました`;
    }
    case "PLAY_MONOPOLY": {
      return `${player}が${resourceLabel(action[2])}を独占しました`;
    }
    case "PLAY_YEAR_OF_PLENTY": {
      const action = actionRecord[0] as PlayYearOfPlentyAction;
      const firstResource = action[2][0];
      const secondResource = action[2][1];
      if (secondResource) {
        return `${player}が豊穣の年カードを使用し、${resourceLabel(
          firstResource
        )}と${resourceLabel(secondResource)}を得ました`;
      } else {
        return `${player}が豊穣の年カードを使用し、${resourceLabel(
          firstResource
        )}を得ました`;
      }
    }
    case "MOVE_ROBBER": {
      const action = actionRecord[0] as MoveRobberAction;
      const tile = findTileByCoordinate(gameState, action[2][0]);
      const tileString = getTileString(tile);
      const robbedResource = actionRecord[1];
      const stolenResource = robbedResource
        ? `（${resourceLabel(robbedResource)}を奪取）`
        : "";
      return `${player}が${tileString}に盗賊を移動しました${stolenResource}`;
    }
    case "MARITIME_TRADE": {
      const label = humanizeTradeAction(action as MaritimeTradeAction);
      return `${player}が交易：${label}`;
    }
    case "OFFER_TRADE": {
      const label = describeDomesticTrade(action[2] as TradeOfferVector);
      return `${player}が交渉を提案（${label}）`;
    }
    case "ACCEPT_TRADE":
      return `${player}が交渉に応じました`;
    case "REJECT_TRADE":
      return `${player}が交渉を断りました`;
    case "CONFIRM_TRADE": {
      const payload = action[2] as TradeConfirmVector;
      const partner = payload[10] as Color;
      return `${player}が${colorLabel(partner)}との交渉を成立させました`;
    }
    case "CANCEL_TRADE":
      return `${player}が交渉を取り消しました`;
    case "END_TURN":
      return `${player}がターンを終了しました`;
    default:
      throw new Error(`Unknown action type: ${action[1]}`);
  }
}
export function humanizeTradeAction(action: MaritimeTradeAction): string {
  const out = action[2]
    .slice(0, 4)
    .filter((resource: unknown) => resource !== null);
  const inputResource = out[0] as ResourceCard;
  const outputResource = action[2][4] as ResourceCard;
  return `${out.length}枚の${resourceLabel(inputResource)} → ${resourceLabel(
    outputResource
  )}`;
}

export function findTileByCoordinate(gameState: GameState, coordinate: any) {
  for (const tile of Object.values(gameState.tiles)) {
    if (JSON.stringify(tile.coordinate) === JSON.stringify(coordinate)) {
      return tile;
    }
  }
  throw new Error(
    `Tile not found for coordinate: ${JSON.stringify(coordinate)}`
  );
}

export function getShortTileString(tile: Tile): string {
  if (tile.type === "RESOURCE_TILE") {
    return `${tile.number}`;
  }
  if (tile.type === "DESERT") {
    return "砂漠";
  }
  if (tile.type === "PORT") {
    return "港";
  }
  return tile.type;
}

export function getTileString(tile: PlacedTile): string {
  const tileInfo = tile.tile;
  switch (tileInfo.type) {
    case "DESERT":
      return "砂漠";
    case "RESOURCE_TILE":
      return `${tileInfo.number} の${resourceLabel(tileInfo.resource)}`;
    default:
      throw new Error("getTileString() only works on Desert or Resource tiles");
  }
}

export function findTileById(gameState: GameState, tileId: number): PlacedTile {
  return gameState.tiles[tileId];
}
