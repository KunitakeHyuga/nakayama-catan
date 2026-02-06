import type {
  Card,
  Color,
  DevelopmentCard,
  ResourceCard,
} from "./api.types";

export function resourceLabel(resource: ResourceCard): string {
  switch (resource) {
    case "WOOD":
      return "木材";
    case "BRICK":
      return "レンガ";
    case "SHEEP":
      return "羊毛";
    case "WHEAT":
      return "小麦";
    case "ORE":
      return "鉱石";
    default:
      return resource;
  }
}

export function developmentCardLabel(card: DevelopmentCard): string {
  switch (card) {
    case "KNIGHT":
      return "騎士";
    case "MONOPOLY":
      return "独占";
    case "YEAR_OF_PLENTY":
      return "収穫";
    case "ROAD_BUILDING":
      return "街道建設";
    default:
      return card;
  }
}

export function cardLabel(card: Card): string {
  switch (card) {
    case "VICTORY_POINT":
      return "勝利点";
    case "WOOD":
    case "BRICK":
    case "SHEEP":
    case "WHEAT":
    case "ORE":
      return resourceLabel(card);
    case "KNIGHT":
    case "MONOPOLY":
    case "YEAR_OF_PLENTY":
    case "ROAD_BUILDING":
      return developmentCardLabel(card);
    default:
      return card;
  }
}

export function colorLabel(color: Color): string {
  switch (color) {
    case "RED":
      return "赤";
    case "BLUE":
      return "青";
    case "ORANGE":
      return "オレンジ";
    case "WHITE":
      return "白";
    default:
      return color;
  }
}
