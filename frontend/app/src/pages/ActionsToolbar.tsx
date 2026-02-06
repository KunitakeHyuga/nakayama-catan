import React, {
  useState,
  useRef,
  useEffect,
  useContext,
  useCallback,
  useMemo,
} from "react";
import memoize from "fast-memoize";
import { Button } from "@mui/material";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import AccountBalanceIcon from "@mui/icons-material/AccountBalance";
import BuildIcon from "@mui/icons-material/Build";
import NavigateNextIcon from "@mui/icons-material/NavigateNext";
import MenuItem from "@mui/material/MenuItem";
import ClickAwayListener from "@mui/material/ClickAwayListener";
import Grow from "@mui/material/Grow";
import Paper from "@mui/material/Paper";
import Popper from "@mui/material/Popper";
import MenuList from "@mui/material/MenuList";
import SimCardIcon from "@mui/icons-material/SimCard";
import { useParams } from "react-router";

import Hidden from "../components/Hidden";
import Prompt from "../components/Prompt";
import ResourceCards from "../components/ResourceCards";
import ResourceSelector from "../components/ResourceSelector";
import { store } from "../store";
import ACTIONS from "../actions";
import type {
  GameAction,
  ResourceCard,
  MaritimeTradeAction,
  GameState,
  Color,
} from "../utils/api.types"; // Add GameState to the import, adjust path if needed
import { getHumanColor, playerKey } from "../utils/stateUtils";
import { postAction } from "../utils/apiClient";
import { humanizeTradeAction } from "../utils/promptUtils";

import "./ActionsToolbar.scss";
import { useSnackbar } from "notistack";
import { dispatchSnackbar } from "../components/Snackbar";

const RESOURCE_ORDER: ResourceCard[] = [
  "WOOD",
  "BRICK",
  "SHEEP",
  "WHEAT",
  "ORE",
];
const RESOURCE_ORDER_INDEX: Record<ResourceCard, number> =
  RESOURCE_ORDER.reduce(
    (acc, resource, index) => {
      acc[resource] = index;
      return acc;
    },
    {} as Record<ResourceCard, number>
  );

type PlayButtonsProps = {
  gameId?: string | null;
  actionExecutor?: (action?: GameAction) => Promise<GameState>;
  disableActions?: boolean;
  playerColorOverride?: Color | null;
};

function PlayButtons({
  gameId,
  actionExecutor,
  disableActions = false,
  playerColorOverride,
}: PlayButtonsProps) {
  if (!gameId && !actionExecutor) {
    console.error("ゲームIDが見つからないためアクションを送信できません。");
    return null;
  }
  const { state, dispatch } = useContext(store);
  const { enqueueSnackbar, closeSnackbar } = useSnackbar();
  const [resourceSelectorOpen, setResourceSelectorOpen] = useState(false);

  const executeAction = useCallback(
    async (action?: GameAction) => {
      if (actionExecutor) {
        return actionExecutor(action);
      }
      if (!gameId) {
        throw new Error("gameId が必要です");
      }
      return postAction(gameId, action);
    },
    [actionExecutor, gameId]
  );

  const carryOutAction = useMemo(
    () =>
      memoize((action?: GameAction) => async () => {
        if (disableActions) {
          return;
        }
        try {
          const gameState = await executeAction(action);
          dispatch({ type: ACTIONS.SET_GAME_STATE, data: gameState });
          dispatchSnackbar(enqueueSnackbar, closeSnackbar, gameState);
        } catch (error) {
          console.error("アクション送信に失敗しました:", error);
          enqueueSnackbar("アクションの送信に失敗しました。", {
            variant: "error",
          });
        }
      }),
    [dispatch, enqueueSnackbar, closeSnackbar, executeAction, disableActions]
  );

  const {
    gameState,
    isPlayingMonopoly,
    isPlayingYearOfPlenty,
    isRoadBuilding,
  } = state;
  if (gameState === null) {
    return null;
  }
  const key = playerKey(gameState, gameState.current_color);
  const isRoll =
    gameState.current_prompt === "PLAY_TURN" &&
    !gameState.player_state[`${key}_HAS_ROLLED`];
  const isDiscard = gameState.current_prompt === "DISCARD";
  const isMoveRobber = gameState.current_prompt === "MOVE_ROBBER";
  const isPlayingDevCard =
    isPlayingMonopoly || isPlayingYearOfPlenty || isRoadBuilding;
  const playableDevCardTypes = new Set(
    gameState.current_playable_actions
      .filter((action) => action[1].startsWith("PLAY"))
      .map((action) => action[1])
  );
  const humanColor = playerColorOverride ?? getHumanColor(gameState);
  const setIsPlayingMonopoly = useCallback(() => {
    dispatch({ type: ACTIONS.SET_IS_PLAYING_MONOPOLY });
  }, [dispatch]);
  const getValidYearOfPlentyOptions = useCallback(() => {
    return gameState.current_playable_actions
      .filter((action) => action[1] === "PLAY_YEAR_OF_PLENTY")
      .map((action) => action[2]);
  }, [gameState.current_playable_actions]);
  const handleResourceSelection = useCallback(
    async (selectedResources: ResourceCard | ResourceCard[]) => {
      if (disableActions) {
        return;
      }
      setResourceSelectorOpen(false);
      let action: GameAction;
      if (isPlayingMonopoly) {
        action = [
          humanColor,
          "PLAY_MONOPOLY",
          selectedResources as ResourceCard,
        ];
      } else if (isPlayingYearOfPlenty) {
        action = [
          humanColor,
          "PLAY_YEAR_OF_PLENTY",
          selectedResources as [ResourceCard] | [ResourceCard, ResourceCard],
        ];
      } else {
        console.error("無効な資源選択モードです");
        return;
      }
      try {
        const gameState = await executeAction(action);
        dispatch({ type: ACTIONS.SET_GAME_STATE, data: gameState });
        dispatchSnackbar(enqueueSnackbar, closeSnackbar, gameState);
      } catch (error) {
        console.error("資源選択アクションに失敗しました:", error);
        enqueueSnackbar("アクションの送信に失敗しました。", {
          variant: "error",
        });
      }
    },
    [
      humanColor,
      dispatch,
      enqueueSnackbar,
      closeSnackbar,
      isPlayingMonopoly,
      isPlayingYearOfPlenty,
      executeAction,
      disableActions,
    ]
  );
  const handleOpenResourceSelector = useCallback(() => {
    setResourceSelectorOpen(true);
  }, []);
  const setIsPlayingYearOfPlenty = useCallback(() => {
    dispatch({ type: ACTIONS.SET_IS_PLAYING_YEAR_OF_PLENTY });
  }, [dispatch]);
  const playRoadBuilding = useCallback(async () => {
    if (disableActions) {
      return;
    }
    const action: GameAction = [humanColor, "PLAY_ROAD_BUILDING", null];
    try {
      const gameState = await executeAction(action);
      dispatch({ type: ACTIONS.PLAY_ROAD_BUILDING });
      dispatch({ type: ACTIONS.SET_GAME_STATE, data: gameState });
      dispatchSnackbar(enqueueSnackbar, closeSnackbar, gameState);
    } catch (error) {
      console.error("街道建設カードの使用に失敗しました:", error);
      enqueueSnackbar("アクションの送信に失敗しました。", {
        variant: "error",
      });
    }
  }, [
    dispatch,
    enqueueSnackbar,
    closeSnackbar,
    humanColor,
    executeAction,
    disableActions,
  ]);
  const playKnightCard = useCallback(async () => {
    if (disableActions) {
      return;
    }
    const action: GameAction = [humanColor, "PLAY_KNIGHT_CARD", null];
    try {
      const gameState = await executeAction(action);
      dispatch({ type: ACTIONS.SET_GAME_STATE, data: gameState });
      dispatchSnackbar(enqueueSnackbar, closeSnackbar, gameState);
    } catch (error) {
      console.error("騎士カードの使用に失敗しました:", error);
      enqueueSnackbar("アクションの送信に失敗しました。", {
        variant: "error",
      });
    }
  }, [
    dispatch,
    enqueueSnackbar,
    closeSnackbar,
    humanColor,
    executeAction,
    disableActions,
  ]);
  const useItems = [
    {
      label: "騎士",
      disabled: disableActions || !playableDevCardTypes.has("PLAY_KNIGHT_CARD"),
      onClick: playKnightCard,
    },
    {
      label: "独占",
      disabled: disableActions || !playableDevCardTypes.has("PLAY_MONOPOLY"),
      onClick: setIsPlayingMonopoly,
    },
    {
      label: "収穫",
      disabled: disableActions || !playableDevCardTypes.has("PLAY_YEAR_OF_PLENTY"),
      onClick: setIsPlayingYearOfPlenty,
    },
    {
      label: "街道建設",
      disabled: disableActions || !playableDevCardTypes.has("PLAY_ROAD_BUILDING"),
      onClick: playRoadBuilding,
    },
  ];

  const buildActionTypes = new Set(
    gameState.current_playable_actions
      .filter(
        (action) => action[1].startsWith("BUY") || action[1].startsWith("BUILD")
      )
      .map((a) => a[1])
  );
  const buyDevCard = useCallback(async () => {
    if (disableActions) {
      return;
    }
    const action: GameAction = [humanColor, "BUY_DEVELOPMENT_CARD", null];
    try {
      const gameState = await executeAction(action);
      dispatch({ type: ACTIONS.SET_GAME_STATE, data: gameState });
      dispatchSnackbar(enqueueSnackbar, closeSnackbar, gameState);
    } catch (error) {
      console.error("開発カードの購入に失敗しました:", error);
      enqueueSnackbar("アクションの送信に失敗しました。", {
        variant: "error",
      });
    }
  }, [
    dispatch,
    enqueueSnackbar,
    closeSnackbar,
    humanColor,
    executeAction,
    disableActions,
  ]);
  const setIsBuildingSettlement = useCallback(() => {
    dispatch({ type: ACTIONS.SET_IS_BUILDING_SETTLEMENT });
  }, [dispatch]);
  const setIsBuildingCity = useCallback(() => {
    dispatch({ type: ACTIONS.SET_IS_BUILDING_CITY });
  }, [dispatch]);
  const toggleBuildingRoad = useCallback(() => {
    dispatch({ type: ACTIONS.TOGGLE_BUILDING_ROAD });
  }, [dispatch]);
  const buildItems = [
    {
      label: "街道",
      disabled: disableActions || !buildActionTypes.has("BUILD_ROAD"),
      onClick: toggleBuildingRoad,
    },
    {
      label: "開拓地",
      disabled: disableActions || !buildActionTypes.has("BUILD_SETTLEMENT"),
      onClick: setIsBuildingSettlement,
    },
    {
      label: "都市",
      disabled: disableActions || !buildActionTypes.has("BUILD_CITY"),
      onClick: setIsBuildingCity,
    },
    {
      label: "開発カードを購入",
      disabled: disableActions || !buildActionTypes.has("BUY_DEVELOPMENT_CARD"),
      onClick: buyDevCard,
    },
  ];

  const tradeActions = gameState.current_playable_actions.filter(
    (action) => action[1] === "MARITIME_TRADE"
  );
  const tradeItems = React.useMemo(() => {
    const getInputResource = (action: MaritimeTradeAction): ResourceCard => {
      const input = action[2]
        .slice(0, 4)
        .find((resource) => resource !== null) as ResourceCard;
      return input;
    };
    const getOutputResource = (action: MaritimeTradeAction): ResourceCard =>
      action[2][4] as ResourceCard;
    const getTradeCost = (action: MaritimeTradeAction): number =>
      action[2].slice(0, 4).filter((resource) => resource !== null).length;

    const tradeInfos = tradeActions.map((action) => {
      const maritimeAction = action as MaritimeTradeAction;
      const inputResource = getInputResource(maritimeAction);
      const outputResource = getOutputResource(maritimeAction);
      const cost = getTradeCost(maritimeAction);
      return {
        action: maritimeAction,
        label: humanizeTradeAction(maritimeAction),
        inputResource,
        outputResource,
        cost,
      };
    });

    return tradeInfos
      .sort((a, b) => {
        const inputDiff =
          RESOURCE_ORDER_INDEX[a.inputResource] -
          RESOURCE_ORDER_INDEX[b.inputResource];
        if (inputDiff !== 0) {
          return inputDiff;
        }
        if (a.cost !== b.cost) {
          return a.cost - b.cost;
        }
        const outputDiff =
          RESOURCE_ORDER_INDEX[a.outputResource] -
          RESOURCE_ORDER_INDEX[b.outputResource];
        if (outputDiff !== 0) {
          return outputDiff;
        }
        return a.label.localeCompare(b.label);
      })
      .map(({ action, label }) => ({
        label,
        disabled: disableActions,
        onClick: carryOutAction(action),
      }));
  }, [tradeActions, carryOutAction, disableActions]);

  const setIsMovingRobber = useCallback(() => {
    dispatch({ type: ACTIONS.SET_IS_MOVING_ROBBER });
  }, [dispatch]);
  const rollAction = carryOutAction([humanColor, "ROLL", null]);
  const discardAction = carryOutAction([humanColor, "DISCARD", null]);
  const proceedAction = carryOutAction();
  const endTurnAction = carryOutAction([humanColor, "END_TURN", null]);
  return (
    <>
      <OptionsButton
        disabled={
          disableActions || playableDevCardTypes.size === 0 || isPlayingDevCard
        }
        menuListId="use-menu-list"
        icon={<SimCardIcon />}
        items={useItems}
      >
        使用
      </OptionsButton>
      <OptionsButton
        disabled={
          disableActions || buildActionTypes.size === 0 || isPlayingDevCard
        }
        menuListId="build-menu-list"
        icon={<BuildIcon />}
        items={buildItems}
      >
        建設/購入
      </OptionsButton>
      <OptionsButton
        disabled={disableActions || tradeItems.length === 0 || isPlayingDevCard}
        menuListId="trade-menu-list"
        icon={<AccountBalanceIcon />}
        items={tradeItems}
      >
        交易
      </OptionsButton>
      <Button
        disabled={
          disableActions || gameState.is_initial_build_phase || isRoadBuilding
        }
        variant="contained"
        color="primary"
        startIcon={<NavigateNextIcon />}
        onClick={
          isDiscard
            ? discardAction
            : isMoveRobber
            ? setIsMovingRobber
            : isPlayingYearOfPlenty || isPlayingMonopoly
            ? handleOpenResourceSelector
            : isRoll
            ? rollAction
            : endTurnAction
        }
      >
        {isDiscard
          ? "捨てる"
          : isMoveRobber
          ? "盗賊"
          : isPlayingYearOfPlenty || isPlayingMonopoly
          ? "選択"
          : isRoll
          ? (
            <>
              ダイスを
              <br />
              振る
            </>
            )
          : "ターン終了"}
      </Button>
      <ResourceSelector
        open={resourceSelectorOpen}
        onClose={() => {
          setResourceSelectorOpen(false);
          dispatch({ type: ACTIONS.CANCEL_MONOPOLY });
          dispatch({ type: ACTIONS.CANCEL_YEAR_OF_PLENTY });
        }}
        options={getValidYearOfPlentyOptions()}
        onSelect={handleResourceSelection}
        mode={isPlayingMonopoly ? "monopoly" : "yearOfPlenty"}
      />
    </>
  );
}

type ActionsToolbarProps = {
  isBotThinking: boolean;
  replayMode: boolean;
  gameIdOverride?: string | null;
  actionExecutor?: (action?: GameAction) => Promise<GameState>;
  actionsDisabled?: boolean;
  playerColorOverride?: Color | null;
  showResources?: boolean;
};

export default function ActionsToolbar({
  isBotThinking,
  replayMode,
  gameIdOverride,
  actionExecutor,
  actionsDisabled = false,
  playerColorOverride,
  showResources = true,
}: ActionsToolbarProps) {
  const { gameId: routeGameId } = useParams();
  const effectiveGameId = gameIdOverride ?? routeGameId;
  const { state, dispatch } = useContext(store);
  const { gameState } = state;
  if (gameState === null) {
    console.error("ゲーム状態が見つかりません。");
    return null;
  }
  const openLeftDrawer = useCallback(() => {
    dispatch({
      type: ACTIONS.SET_LEFT_DRAWER_OPENED,
      data: true,
    });
  }, [dispatch]);

  const openRightDrawer = useCallback(() => {
    dispatch({
      type: ACTIONS.SET_RIGHT_DRAWER_OPENED,
      data: true,
    });
  }, [dispatch]);

  const humanColor = playerColorOverride ?? getHumanColor(gameState);
  const botsTurn = gameState.bot_colors.includes(gameState.current_color);
  const waitingForOtherPlayer =
    Boolean(playerColorOverride) && humanColor !== gameState.current_color;
  const disableAllActions =
    actionsDisabled || (playerColorOverride ? waitingForOtherPlayer : false) || botsTurn;
  const shouldShowPrompt =
    botsTurn || gameState.winning_color !== undefined || waitingForOtherPlayer;
  const canShowPlayButtons = !replayMode && !gameState.winning_color;
  return (
    <>
      {showResources && (
        <div className="state-summary">
          <Hidden breakpoint={{ size: "md", direction: "up" }}>
            <Button className="open-drawer-btn" onClick={openLeftDrawer}>
              <ChevronLeftIcon />
            </Button>
          </Hidden>
          {humanColor && (
            <ResourceCards
              playerState={gameState.player_state}
              playerKey={playerKey(gameState, humanColor)}
              wrapDevCards={false}
            />
          )}
          <Hidden breakpoint={{ size: "lg", direction: "up" }}>
            <Button
              className="open-drawer-btn"
              onClick={openRightDrawer}
              style={{ marginLeft: "auto" }}
            >
              <ChevronRightIcon />
            </Button>
          </Hidden>
        </div>
      )}
      <div className="actions-toolbar">
        {canShowPlayButtons && (
          <PlayButtons
            gameId={effectiveGameId}
            actionExecutor={actionExecutor}
            disableActions={disableAllActions}
            playerColorOverride={playerColorOverride ?? humanColor}
          />
        )}
        {shouldShowPrompt && (
          <Prompt
            gameState={gameState}
            isBotThinking={isBotThinking}
            playerColor={playerColorOverride ?? humanColor}
          />
        )}
        {/* <Button
          disabled={disabled}
          className="confirm-btn"
          variant="contained"
          color="primary"
          onClick={onTick}
        >
          Ok
        </Button> */}

        {/* <Button onClick={zoomIn}>Zoom In</Button>
      <Button onClick={zoomOut}>Zoom Out</Button> */}
      </div>
    </>
  );
}

type OptionItem = {
  label: string;
  disabled: boolean;
  onClick: (event: MouseEvent | TouchEvent) => void;
};

type OptionsButtonProps = {
  menuListId: string;
  icon: any;
  children: React.ReactNode;
  items: OptionItem[];
  disabled: boolean;
};

function OptionsButton({
  menuListId,
  icon,
  children,
  items,
  disabled,
}: OptionsButtonProps) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLAnchorElement>(null);

  const handleToggle = () => {
    setOpen((prevOpen) => !prevOpen);
  };
  const handleClose =
    (onClick?: (event: MouseEvent | TouchEvent) => void) =>
    (event: MouseEvent | TouchEvent) => {
      if (
        anchorRef.current &&
        anchorRef.current.contains(event.target as Node)
      ) {
        return;
      }

      onClick && onClick(event);
      setOpen(false);
    };
  function handleListKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Tab") {
      event.preventDefault();
      setOpen(false);
    }
  }
  // return focus to the button when we transitioned from !open -> open
  const prevOpen = useRef(open);
  useEffect(() => {
    if (prevOpen.current === true && open === false) {
      anchorRef.current && anchorRef.current.focus();
    }

    prevOpen.current = open;
  }, [open]);

  return (
    <React.Fragment>
      <Button
        className="action-button"
        disabled={disabled}
        ref={anchorRef}
        href="#"
        aria-controls={open ? menuListId : undefined}
        aria-haspopup="true"
        variant="contained"
        color="secondary"
        startIcon={icon}
        onClick={handleToggle}
      >
        {children}
      </Button>
      <Popper
        className="action-popover"
        open={open}
        anchorEl={anchorRef.current}
        role={undefined}
        transition
        disablePortal
      >
        {({ TransitionProps, placement }) => (
          <Grow
            {...TransitionProps}
            style={{
              transformOrigin:
                placement === "bottom" ? "center top" : "center bottom",
            }}
          >
            <Paper>
              <ClickAwayListener onClickAway={handleClose()}>
                <MenuList
                  autoFocusItem={open}
                  id={menuListId}
                  onKeyDown={handleListKeyDown}
                >
                  {items.map((item) => (
                    <MenuItem
                      key={item.label}
                      onClick={
                        handleClose(
                          item.onClick
                        ) as unknown as React.MouseEventHandler
                      }
                      disabled={item.disabled}
                    >
                      {item.label}
                    </MenuItem>
                  ))}
                </MenuList>
              </ClickAwayListener>
            </Paper>
          </Grow>
        )}
      </Popper>
    </React.Fragment>
  );
}
