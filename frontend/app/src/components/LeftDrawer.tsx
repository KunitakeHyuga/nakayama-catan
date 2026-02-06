import React, { useCallback, useContext, useEffect, useRef, useState } from "react";
import cn from "classnames";
import SwipeableDrawer from "@mui/material/SwipeableDrawer";
import Divider from "@mui/material/Divider";
import Drawer from "@mui/material/Drawer";
import HistoryIcon from "@mui/icons-material/History";

import Hidden from "./Hidden";
import PlayerStateBox from "./PlayerStateBox";
import { humanizeActionRecord } from "../utils/promptUtils";
import { store } from "../store";
import ACTIONS from "../actions";
import { playerKey } from "../utils/stateUtils";
import { type Color, type GameState } from "../utils/api.types";
import { isTabOrShift, type InteractionEvent } from "../utils/events";
import CollapsibleSection from "./CollapsibleSection";

import "./LeftDrawer.scss";

type DrawerContentProps = {
  gameState: GameState;
  playerNames?: Partial<Record<Color, string | null>>;
  viewerColor?: Color | null;
};

function DrawerContent({ gameState, playerNames, viewerColor }: DrawerContentProps) {
  const playerState = gameState.player_state;
  const playerKeysByColor = new Map<Color, string>();
  gameState.colors.forEach((color) => {
    playerKeysByColor.set(color, playerKey(gameState, color));
  });
  const prevRecordCountRef = useRef(gameState.action_records.length);
  const [highlightCount, setHighlightCount] = useState(0);
  const highlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const prevCount = prevRecordCountRef.current;
    const currentCount = gameState.action_records.length;
    if (currentCount > prevCount) {
      setHighlightCount(currentCount - prevCount);
      if (highlightTimeoutRef.current) {
        clearTimeout(highlightTimeoutRef.current);
      }
      highlightTimeoutRef.current = setTimeout(() => {
        setHighlightCount(0);
        highlightTimeoutRef.current = null;
      }, 3200);
    } else if (currentCount < prevCount) {
      setHighlightCount(0);
    }
    prevRecordCountRef.current = currentCount;
  }, [gameState.action_records.length]);

  useEffect(() => {
    return () => {
      if (highlightTimeoutRef.current) {
        clearTimeout(highlightTimeoutRef.current);
      }
    };
  }, []);

  const armyLeaders = new Set<Color>(
    gameState.colors.filter((color) => {
      const key = playerKeysByColor.get(color)!;
      return Boolean(playerState[`${key}_HAS_ARMY`]);
    })
  );
  const roadLeaders = new Set<Color>(
    gameState.colors.filter((color) => {
      const key = playerKeysByColor.get(color)!;
      return Boolean(playerState[`${key}_HAS_ROAD`]);
    })
  );
  const publicVpsByColor = new Map<Color, number>();
  let maxPublicVps = -Infinity;
  gameState.colors.forEach((color) => {
    const key = playerKeysByColor.get(color)!;
    const vps = playerState[`${key}_VICTORY_POINTS`];
    publicVpsByColor.set(color, vps);
    if (vps > maxPublicVps) {
      maxPublicVps = vps;
    }
  });
  const victoryLeaders = new Set<Color>(
    gameState.colors.filter(
      (color) => publicVpsByColor.get(color)! === maxPublicVps
    )
  );

  const playerSections = gameState.colors.map((color) => {
    const key = playerKey(gameState, color);
    const showFullDetails =
      viewerColor !== null && viewerColor !== undefined && color === viewerColor;
    return (
      <React.Fragment key={color}>
        <PlayerStateBox
          playerState={gameState.player_state}
          playerKey={key}
          color={color}
          playerName={playerNames?.[color] ?? null}
          showFullDevelopmentCards={showFullDetails}
          isArmyLeader={armyLeaders.has(color)}
          isRoadLeader={roadLeaders.has(color)}
          isVictoryLeader={victoryLeaders.has(color)}
        />
        <Divider />
      </React.Fragment>
    );
  });

  return (
    <>
      {playerSections}
      <CollapsibleSection
        className="log-section"
        title={
          <span className="log-title">
            <HistoryIcon fontSize="small" />
            <span>行動履歴</span>
          </span>
        }
      >
        <div className="log">
          {gameState.action_records
            .slice()
            .reverse()
            .map((actionRecord, index) => {
              const isHighlighted = highlightCount > 0 && index < highlightCount;
              return (
                <div
                  key={`${actionRecord[0][0]}-${index}`}
                  className={cn("action foreground", actionRecord[0][0], {
                    "log-highlight": isHighlighted,
                  })}
                >
                  {humanizeActionRecord(gameState, actionRecord)}
                </div>
              );
            })}
        </div>
      </CollapsibleSection>
    </>
  );
}

type LeftDrawerProps = {
  playerNames?: Partial<Record<Color, string | null>>;
  viewerColor?: Color | null;
};

export default function LeftDrawer(props: LeftDrawerProps = {}) {
  const { playerNames, viewerColor = null } = props;
  const { state, dispatch } = useContext(store);
  const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

  const openLeftDrawer = useCallback(
    (event: InteractionEvent) => {
      if (isTabOrShift(event)) {
        return;
      }

      dispatch({ type: ACTIONS.SET_LEFT_DRAWER_OPENED, data: true });
    },
    [dispatch]
  );
  const closeLeftDrawer = useCallback(
    (event: InteractionEvent) => {
      if (isTabOrShift(event)) {
        return;
      }

      dispatch({ type: ACTIONS.SET_LEFT_DRAWER_OPENED, data: false });
    },
    [dispatch]
  );

  return (
    <>
      <Hidden breakpoint={{ size: "md", direction: "up" }} implementation="js">
        <SwipeableDrawer
          className="left-drawer"
          anchor="left"
          open={state.isLeftDrawerOpen}
          onClose={closeLeftDrawer}
          onOpen={openLeftDrawer}
          disableBackdropTransition={!iOS}
          disableDiscovery={iOS}
          onKeyDown={closeLeftDrawer}
        >
          <DrawerContent
            gameState={state.gameState as GameState}
            playerNames={playerNames}
            viewerColor={viewerColor}
          />
        </SwipeableDrawer>
      </Hidden>
      <Hidden
        breakpoint={{ size: "sm", direction: "down" }}
        implementation="css"
      >
        <Drawer className="left-drawer" anchor="left" variant="permanent" open>
          <DrawerContent
            gameState={state.gameState as GameState}
            playerNames={playerNames}
            viewerColor={viewerColor}
          />
        </Drawer>
      </Hidden>
    </>
  );
}
