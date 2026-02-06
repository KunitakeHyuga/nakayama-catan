import cn from "classnames";
import { Paper } from "@mui/material";
import { useEffect, useRef, useState } from "react";
import { type PlayerState } from "../utils/api.types";
import { type Card, type ResourceCard } from "../utils/api.types";
import { cardLabel, resourceLabel } from "../utils/i18n";

// TODO - do we need to split the SCSS for this component?
import "./PlayerStateBox.scss";

const RESOURCE_CARDS: ResourceCard[] = [
  "WOOD",
  "BRICK",
  "SHEEP",
  "WHEAT",
  "ORE",
];
const DEV_CARDS: Card[] = [
  "VICTORY_POINT",
  "KNIGHT",
  "MONOPOLY",
  "YEAR_OF_PLENTY",
  "ROAD_BUILDING",
];
const DEV_TOTAL_KEY = "TOTAL_UNUSED";
type DevHighlightKey = typeof DEV_TOTAL_KEY | Card;

const makeResourceHighlightState = () =>
  RESOURCE_CARDS.reduce(
    (acc, card) => {
      acc[card] = false;
      return acc;
    },
    {} as Record<ResourceCard, boolean>
  );

const makeDevHighlightState = () =>
  [DEV_TOTAL_KEY, ...DEV_CARDS].reduce(
    (acc, key) => {
      acc[key as DevHighlightKey] = false;
      return acc;
    },
    {} as Record<DevHighlightKey, boolean>
  );

type ResourceCardsProps = {
  playerState: PlayerState;
  playerKey: string;
  wrapDevCards?: boolean;
  maskDevelopmentCards?: boolean;
  hideDevelopmentCards?: boolean;
};

export default function ResourceCards({
  playerState,
  playerKey,
  wrapDevCards = true,
  maskDevelopmentCards = false,
  hideDevelopmentCards = false,
}: ResourceCardsProps) {
  const amount = (card: Card) =>
    Number(playerState[`${playerKey}_${card}_IN_HAND`] ?? 0);
  const playedAmount = (card: Card) =>
    Number(playerState[`${playerKey}_PLAYED_${card}`] ?? 0);
  const totalDevCardsInHand = DEV_CARDS.reduce(
    (sum, card) => sum + amount(card),
    0
  );
  const [resourceHighlights, setResourceHighlights] = useState(
    makeResourceHighlightState
  );
  const [devHighlights, setDevHighlights] = useState(
    makeDevHighlightState
  );
  const resourcePrevRef = useRef<Record<ResourceCard, number>>(
    RESOURCE_CARDS.reduce((acc, card) => {
      acc[card] = amount(card);
      return acc;
    }, {} as Record<ResourceCard, number>)
  );
  const devPrevRef = useRef<Record<Card, number>>(
    DEV_CARDS.reduce((acc, card) => {
      acc[card] = amount(card);
      return acc;
    }, {} as Record<Card, number>)
  );
  const resourceTimers = useRef<
    Record<ResourceCard, ReturnType<typeof setTimeout> | null>
  >(
    RESOURCE_CARDS.reduce((acc, card) => {
      acc[card] = null;
      return acc;
    }, {} as Record<ResourceCard, ReturnType<typeof setTimeout> | null>)
  );
  const devTimers = useRef<
    Record<DevHighlightKey, ReturnType<typeof setTimeout> | null>
  >(
    [DEV_TOTAL_KEY, ...DEV_CARDS].reduce((acc, key) => {
      acc[key as DevHighlightKey] = null;
      return acc;
    }, {} as Record<DevHighlightKey, ReturnType<typeof setTimeout> | null>)
  );

  const triggerResourceHighlight = (card: ResourceCard) => {
    setResourceHighlights((prev) => ({ ...prev, [card]: true }));
    if (resourceTimers.current[card]) {
      clearTimeout(resourceTimers.current[card]!);
    }
    resourceTimers.current[card] = setTimeout(() => {
      setResourceHighlights((prev) => ({ ...prev, [card]: false }));
      resourceTimers.current[card] = null;
    }, 3200);
  };

  const triggerDevHighlight = (key: DevHighlightKey) => {
    setDevHighlights((prev) => ({ ...prev, [key]: true }));
    if (devTimers.current[key]) {
      clearTimeout(devTimers.current[key]!);
    }
    devTimers.current[key] = setTimeout(() => {
      setDevHighlights((prev) => ({ ...prev, [key]: false }));
      devTimers.current[key] = null;
    }, 3200);
  };

  useEffect(() => {
    return () => {
      RESOURCE_CARDS.forEach((card) => {
        if (resourceTimers.current[card]) {
          clearTimeout(resourceTimers.current[card]!);
          resourceTimers.current[card] = null;
        }
      });
      [DEV_TOTAL_KEY, ...DEV_CARDS].forEach((key) => {
        if (devTimers.current[key as DevHighlightKey]) {
          clearTimeout(devTimers.current[key as DevHighlightKey]!);
          devTimers.current[key as DevHighlightKey] = null;
        }
      });
    };
  }, []);

  useEffect(() => {
    const snapshot = RESOURCE_CARDS.reduce((acc, card) => {
      acc[card] = amount(card);
      return acc;
    }, {} as Record<ResourceCard, number>);
    resourcePrevRef.current = snapshot;
    RESOURCE_CARDS.forEach((card) => {
      if (resourceTimers.current[card]) {
        clearTimeout(resourceTimers.current[card]!);
        resourceTimers.current[card] = null;
      }
    });
    setResourceHighlights(makeResourceHighlightState());

    const devSnapshot = DEV_CARDS.reduce((acc, card) => {
      acc[card] = amount(card);
      return acc;
    }, {} as Record<Card, number>);
    devPrevRef.current = devSnapshot;
    [DEV_TOTAL_KEY, ...DEV_CARDS].forEach((key) => {
      const typed = key as DevHighlightKey;
      if (devTimers.current[typed]) {
        clearTimeout(devTimers.current[typed]!);
        devTimers.current[typed] = null;
      }
    });
    setDevHighlights(makeDevHighlightState());
  }, [playerKey]);

  useEffect(() => {
    RESOURCE_CARDS.forEach((card) => {
      const current = amount(card);
      const prev = resourcePrevRef.current[card];
      if (prev !== undefined && current > prev) {
        triggerResourceHighlight(card);
      }
      resourcePrevRef.current[card] = current;
    });

    DEV_CARDS.forEach((card) => {
      const current = amount(card);
      const prev = devPrevRef.current[card];
      if (prev !== undefined && current > prev) {
        triggerDevHighlight(card as DevHighlightKey);
        triggerDevHighlight(DEV_TOTAL_KEY);
      }
      devPrevRef.current[card] = current;
    });
  }, [playerState, playerKey]);

  const renderDevCards = () => (
    <>
      <div
        className={`dev-cards center-text card ${
          totalDevCardsInHand ? "has-card" : ""
        }`}
        title="未使用の発展カード"
      >
        <Paper
          className={cn("card-surface dev-card-surface", {
            "recent-gain": devHighlights[DEV_TOTAL_KEY],
          })}
        >
          <span className="card-label">未使用</span>
          <span className="card-count">{totalDevCardsInHand}</span>
        </Paper>
      </div>
      {DEV_CARDS.map((card) => (
        <div
          key={card}
          className={`dev-cards center-text card ${
            amount(card) ? "has-card" : ""
          }`}
          title={cardLabel(card)}
        >
          <Paper
            className={cn("card-surface dev-card-surface", {
              "recent-gain": devHighlights[card as DevHighlightKey],
            })}
          >
            <span className="card-label">{cardLabel(card)}</span>
            <span className="card-count">
              {maskDevelopmentCards ? playedAmount(card) : amount(card)}
            </span>
          </Paper>
        </div>
      ))}
    </>
  );
  return (
    <div
      className={cn("resource-cards", {
        "wrap-layout": wrapDevCards,
        "inline-layout": !wrapDevCards,
      })}
      title="資源カード"
    >
      {RESOURCE_CARDS.map((card) => (
        <div
          key={card}
          className={`${card.toLowerCase()}-cards resource-card center-text card ${
            amount(card) ? "has-card" : ""
          }`}
        >
          <Paper
            className={cn(
              `card-surface resource-card-surface ${card.toLowerCase()}-surface`,
              { "recent-gain": resourceHighlights[card] }
            )}
          >
            <span className="card-label">{resourceLabel(card)}</span>
            <span className="card-count">{amount(card)}</span>
          </Paper>
        </div>
      ))}
    </div>
  );
}
