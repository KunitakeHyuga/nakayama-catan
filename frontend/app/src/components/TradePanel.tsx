import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Button } from "@mui/material";
import HandshakeIcon from "@mui/icons-material/Handshake";
import { useSnackbar } from "notistack";

import ACTIONS from "../actions";
import { store } from "../store";
import {
  type GameAction,
  type GameState,
  type ResourceCard,
  type ResourceCounts,
  type OfferTradeAction,
  type AcceptTradeAction,
  type RejectTradeAction,
  type ConfirmTradeAction,
  type CancelTradeAction,
  type TradeSummary,
  type Color,
} from "../utils/api.types";
import { getHumanColor, playerKey } from "../utils/stateUtils";
import { colorLabel, resourceLabel } from "../utils/i18n";
import { dispatchSnackbar } from "./Snackbar";
import CollapsibleSection from "./CollapsibleSection";

import "./TradePanel.scss";

const RESOURCE_ORDER: ResourceCard[] = [
  "WOOD",
  "BRICK",
  "SHEEP",
  "WHEAT",
  "ORE",
];

const createEmptyCounts = (): ResourceCounts => [0, 0, 0, 0, 0];

type TradePanelProps = {
  actionExecutor?: (action?: GameAction) => Promise<GameState>;
  playerColorOverride?: Color | null;
  children?: ReactNode;
};

function formatCounts(counts: ResourceCounts): string {
  const labels = counts
    .map((count, index) =>
      count > 0 ? `${resourceLabel(RESOURCE_ORDER[index])}×${count}` : null
    )
    .filter(Boolean);
  return labels.length > 0 ? labels.join(" + ") : "なし";
}

type AcceptanceStatus = "waiting" | "accepted" | "rejected";
type AcceptanceStatusMap = Partial<Record<Color, AcceptanceStatus>>;

function TradeSummaryView({
  trade,
  acceptanceStatus,
  viewerColor,
}: {
  trade: TradeSummary;
  acceptanceStatus: AcceptanceStatusMap;
  viewerColor: Color | null;
}) {
  const isOfferer = viewerColor === trade.offerer_color;
  const offerLabel = viewerColor
    ? isOfferer
      ? "あなたが渡す"
      : "相手が渡す"
    : "渡す";
  const requestLabel = viewerColor
    ? isOfferer
      ? "あなたが受け取る"
      : "あなたが渡す"
    : "受け取る";
  return (
    <div className="trade-status-card">
      <div className="trade-summary-line">
        <span className="trade-summary-offerer">
          {colorLabel(trade.offerer_color)}の提案
        </span>
        <span className="trade-summary-details">
          <span className="trade-summary-label">{offerLabel}</span>
          <span className="trade-summary-value">{formatCounts(trade.offer)}</span>
          <span className="trade-summary-sep">→</span>
          <span className="trade-summary-label">{requestLabel}</span>
          <span className="trade-summary-value">{formatCounts(trade.request)}</span>
        </span>
      </div>
      <div className="trade-acceptances">
        {trade.acceptees.length === 0 ? (
          <span className="trade-acceptance waiting">回答待ち</span>
        ) : (
          trade.acceptees.map(({ color }) => {
            const typedColor = color as Color;
            const status = acceptanceStatus[typedColor] ?? "waiting";
            const statusLabel =
              status === "accepted"
                ? "承諾"
                : status === "rejected"
                ? "拒否"
                : "回答待ち";
            return (
              <span
                key={color}
                className={`trade-acceptance ${
                  status === "accepted"
                    ? "accepted"
                    : status === "rejected"
                    ? "rejected"
                    : "waiting"
                }`}
              >
                {colorLabel(color)}: {statusLabel}
              </span>
            );
          })
        )}
      </div>
    </div>
  );
}

export default function TradePanel({
  actionExecutor,
  playerColorOverride = null,
  children,
}: TradePanelProps) {
  const { state, dispatch } = useContext(store);
  const { enqueueSnackbar, closeSnackbar } = useSnackbar();
  const [offer, setOffer] = useState<ResourceCounts>(() => createEmptyCounts());
  const [request, setRequest] = useState<ResourceCounts>(() =>
    createEmptyCounts()
  );
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  const gameState = state.gameState;
  const humanColor =
    gameState && playerColorOverride
      ? playerColorOverride
      : gameState
      ? (() => {
          const humanColors = gameState.colors.filter(
            (color) => !gameState.bot_colors.includes(color)
          );
          if (humanColors.length === 1) {
            return humanColors[0];
          }
          return gameState.current_color;
        })()
      : null;

  const availableCounts = useMemo<ResourceCounts>(() => {
    if (!gameState || !humanColor) {
      return createEmptyCounts();
    }
    const key = playerKey(gameState, humanColor);
    return RESOURCE_ORDER.map(
      (resource) => gameState.player_state[`${key}_${resource}_IN_HAND`] ?? 0
    ) as ResourceCounts;
  }, [gameState, humanColor]);

  useEffect(() => {
    setOffer((prev) =>
      prev.map((count, index) =>
        Math.min(count, availableCounts[index])
      ) as ResourceCounts
    );
  }, [availableCounts]);

  const submitAction = useCallback(
    async (action: GameAction, options?: { resetForm?: boolean }) => {
      if (!actionExecutor) {
        return;
      }
      try {
        setPendingAction(action[1]);
        const updatedState = await actionExecutor(action);
        dispatch({ type: ACTIONS.SET_GAME_STATE, data: updatedState });
        dispatchSnackbar(enqueueSnackbar, closeSnackbar, updatedState);
        if (options?.resetForm) {
          setOffer(createEmptyCounts());
          setRequest(createEmptyCounts());
        }
      } catch (error) {
        console.error("交渉アクションの送信に失敗しました:", error);
        enqueueSnackbar("交渉アクションの送信に失敗しました。", {
          variant: "error",
        });
      } finally {
        setPendingAction(null);
      }
    },
    [actionExecutor, dispatch, enqueueSnackbar, closeSnackbar]
  );

  const tradeTitle = (
    <span className="trade-panel-heading">
      <span className="trade-title-icon">
        <HandshakeIcon fontSize="small" />
      </span>
      <span className="trade-title-text">交渉</span>
    </span>
  );

  if (!gameState) {
    return (
      <CollapsibleSection className="analysis-box trade-panel" title={tradeTitle}>
        <p className="trade-placeholder">ゲーム情報を読み込み中です。</p>
      </CollapsibleSection>
    );
  }

  if (!humanColor) {
    return (
      <CollapsibleSection className="analysis-box trade-panel" title={tradeTitle}>
        <p className="trade-placeholder">人間プレイヤーが参加していません。</p>
      </CollapsibleSection>
    );
  }

  const humanKey = playerKey(gameState, humanColor);
  const hasRolled = Boolean(gameState.player_state[`${humanKey}_HAS_ROLLED`]);
  const isPlayersTurn =
    gameState.current_color === humanColor &&
    gameState.current_prompt === "PLAY_TURN";
  const tradeActive = Boolean(gameState.trade);
  const gameFinished = Boolean(gameState.winning_color);

  const offerTotal = offer.reduce((sum, count) => sum + count, 0);
  const requestTotal = request.reduce((sum, count) => sum + count, 0);

  let validationError: string | null = null;
  const insufficientIndex = offer.findIndex(
    (count, index) => count > availableCounts[index]
  );
  if (insufficientIndex >= 0) {
    validationError = `${resourceLabel(
      RESOURCE_ORDER[insufficientIndex]
    )}が足りません`;
  } else if (
    offer.some((count, index) => count > 0 && request[index] > 0)
  ) {
    validationError = "同じ資源を同時に渡すことはできません";
  } else if (offerTotal === 0) {
    validationError = "最低1枚は差し出してください";
  } else if (requestTotal === 0) {
    validationError = "最低1枚は要求してください";
  }

  const handleAdjust =
    (
      setter: React.Dispatch<React.SetStateAction<ResourceCounts>>,
      limit?: (index: number) => number
    ) =>
    (index: number, delta: number) => {
      setter((prev) => {
        const next = [...prev] as ResourceCounts;
        const upperBound =
          typeof limit === "function" ? limit(index) : Number.POSITIVE_INFINITY;
        next[index] = Math.max(
          0,
          Math.min(upperBound, next[index] + delta)
        );
        return next;
      });
    };

  const incrementOffer = handleAdjust(
    setOffer,
    (index) => availableCounts[index]
  );
  const decrementOffer = handleAdjust(setOffer);
  const incrementRequest = handleAdjust(setRequest);
  const decrementRequest = handleAdjust(setRequest);

  const resetForm = () => {
    setOffer(createEmptyCounts());
    setRequest(createEmptyCounts());
  };

  const handleProposeTrade = () => {
    if (!humanColor) {
      return;
    }
    const payload = [...offer, ...request] as OfferTradeAction[2];
    const action: OfferTradeAction = [
      humanColor,
      "OFFER_TRADE",
      payload,
    ];
    submitAction(action, { resetForm: true });
  };

  const awaitingResponse =
    gameState.current_prompt === "DECIDE_TRADE" && Boolean(humanColor);
  const decidingPartner =
    gameState.current_prompt === "DECIDE_ACCEPTEES" &&
    gameState.current_color === humanColor;

  const acceptAction = awaitingResponse
    ? (gameState.current_playable_actions.find(
        (action) => action[1] === "ACCEPT_TRADE" && action[0] === humanColor
      ) as AcceptTradeAction | undefined)
    : undefined;
  const rejectAction = awaitingResponse
    ? (gameState.current_playable_actions.find(
        (action) => action[1] === "REJECT_TRADE" && action[0] === humanColor
      ) as RejectTradeAction | undefined)
    : undefined;
  const confirmActions = decidingPartner
    ? (gameState.current_playable_actions.filter(
        (action) => action[1] === "CONFIRM_TRADE"
      ) as ConfirmTradeAction[])
    : [];
  const currentTrade = gameState.trade ?? null;
  const offererIndex =
    currentTrade && gameState.colors.length > 0
      ? gameState.colors.indexOf(currentTrade.offerer_color as Color)
      : -1;
  const tradeVector =
    currentTrade && offererIndex >= 0
      ? ([
          ...currentTrade.offer,
          ...currentTrade.request,
          offererIndex,
        ] as AcceptTradeAction[2])
      : null;
  const canAffordRequest =
    currentTrade &&
    availableCounts.length === currentTrade.request.length &&
    currentTrade.request.every(
      (count, index) => count <= (availableCounts[index] ?? 0)
    );
  const rawAcceptees = currentTrade?.acceptees ?? [];
  const tradeParticipantColors =
    currentTrade && gameState.colors.length > 0
      ? (gameState.colors.filter(
          (color) => color !== currentTrade.offerer_color
        ) as Color[])
      : [];
  const normalizedAcceptees =
    currentTrade && tradeParticipantColors.length > 0
      ? tradeParticipantColors.map((color) => {
          const match = rawAcceptees.find((entry) => entry.color === color);
          return {
            color,
            accepted: match?.accepted ?? false,
            responded: match?.responded ?? false,
          };
        })
      : rawAcceptees;
  const displayAcceptees =
    normalizedAcceptees.length < rawAcceptees.length
      ? [
          ...normalizedAcceptees,
          ...rawAcceptees.filter(
            (entry) =>
              !normalizedAcceptees.some((item) => item.color === entry.color)
          ),
        ]
      : normalizedAcceptees;
  const tradeForDisplay = currentTrade
    ? { ...currentTrade, acceptees: displayAcceptees }
    : null;
  const isTradeOfferer =
    currentTrade && humanColor
      ? currentTrade.offerer_color === humanColor
      : false;
  const responderStatus = tradeForDisplay?.acceptees.find(
    (entry) => entry.color === humanColor
  );
  const canRespondNow =
    awaitingResponse && !isTradeOfferer
      ? !responderStatus || !responderStatus.responded
      : false;
  const fallbackAcceptAction =
    canRespondNow && humanColor && tradeVector && canAffordRequest
      ? ([humanColor, "ACCEPT_TRADE", tradeVector] as AcceptTradeAction)
      : undefined;
  const fallbackRejectAction =
    canRespondNow && humanColor && tradeVector
      ? ([humanColor, "REJECT_TRADE", tradeVector] as RejectTradeAction)
      : undefined;
  const canProposeTrade =
    isPlayersTurn &&
    hasRolled &&
    !gameFinished &&
    (!tradeActive || isTradeOfferer);
  const proposeDisabledReason = !isPlayersTurn
    ? "あなたの番になるまで交渉は提案できません。"
    : !hasRolled
    ? "ダイスを振るまでは交渉できません。"
    : tradeActive && !isTradeOfferer
    ? "現在処理中の交渉が終わるまでお待ちください。"
    : gameFinished
    ? "ゲームが終了しています。"
    : null;
  const canSubmitProposal =
    canProposeTrade &&
    !validationError &&
    pendingAction === null &&
    offerTotal > 0 &&
    requestTotal > 0;
  const withdrawAction: CancelTradeAction | undefined =
    tradeActive && isTradeOfferer && humanColor
      ? [humanColor, "CANCEL_TRADE", null]
      : undefined;
  const acceptedColors = displayAcceptees
    .filter(({ accepted }) => accepted)
    .map(({ color }) => color as Color);
  const hasAcceptedPartners = acceptedColors.length > 0;
  const noAcceptanceYet = !hasAcceptedPartners;
  const rejectedColors = displayAcceptees
    .filter(({ accepted, responded }) => Boolean(responded) && !accepted)
    .map(({ color }) => color as Color);
  const waitingColors = displayAcceptees
    .filter(({ responded }) => !responded)
    .map(({ color }) => color as Color);
  const hasRejectedPlayers = rejectedColors.length > 0;
  const mustCancelDueToRejections =
    hasRejectedPlayers && waitingColors.length === 0 && !hasAcceptedPartners;
  const currentResponderColor =
    currentTrade &&
    gameState.current_prompt === "DECIDE_TRADE" &&
    !isTradeOfferer
      ? null
      : currentTrade && gameState.current_prompt === "DECIDE_TRADE"
      ? gameState.current_color
      : null;

  const acceptanceStatus: AcceptanceStatusMap = {};
  acceptedColors.forEach((color) => {
    acceptanceStatus[color as Color] = "accepted";
  });
  rejectedColors.forEach((color) => {
    acceptanceStatus[color as Color] = "rejected";
  });
  displayAcceptees.forEach(({ color }) => {
    const typedColor = color as Color;
    if (!acceptanceStatus[typedColor]) {
      acceptanceStatus[typedColor] = "waiting";
    }
  });

  return (
    <CollapsibleSection className="analysis-box trade-panel" title={tradeTitle}>
      <div className="trade-sticky">
        {currentTrade ? (
          <>
            <TradeSummaryView
              trade={tradeForDisplay ?? currentTrade}
              acceptanceStatus={acceptanceStatus}
              viewerColor={humanColor}
            />
            {isTradeOfferer && (
              <div className="trade-status-note">
                {hasAcceptedPartners ? (
                  <p>
                    {acceptedColors
                      .map((color) => colorLabel(color as Color))
                      .join("・")}
                    が交渉に応じています。全員の回答が終わると、成立させる相手を選べます。
                  </p>
                ) : (
                  <p>
                    まだ誰も交渉に応じていません。各プレイヤーの回答を待っています。
                  </p>
                )}
                {waitingColors.length > 0 && (
                  <p className="waiting-note">
                    {waitingColors
                      .map((color) => colorLabel(color as Color))
                      .join("・")}
                    の回答を待っています。
                  </p>
                )}
              </div>
            )}
          </>
        ) : (
          <p className="trade-placeholder">現在提案中の交渉はありません。</p>
        )}

        {canRespondNow &&
          (acceptAction ||
            rejectAction ||
            fallbackAcceptAction ||
            fallbackRejectAction) && (
          <div className="trade-response">
            <p>この交渉提案に応じますか？</p>
            <div className="trade-response-buttons">
              <Button
                variant="contained"
                color="primary"
                disabled={
                  !(acceptAction || fallbackAcceptAction) ||
                  pendingAction !== null
                }
                onClick={() => {
                  const action = acceptAction ?? fallbackAcceptAction;
                  if (action) {
                    submitAction(action);
                  }
                }}
              >
                受け入れる
              </Button>
              <Button
                variant="outlined"
                color="inherit"
                disabled={
                  !(rejectAction || fallbackRejectAction) ||
                  pendingAction !== null
                }
                onClick={() => {
                  const action = rejectAction ?? fallbackRejectAction;
                  if (action) {
                    submitAction(action);
                  }
                }}
              >
                断る
              </Button>
            </div>
          </div>
        )}

        {decidingPartner && (
          <div className="trade-response">
            <p>
              {hasAcceptedPartners
                ? `${acceptedColors
                    .map((color) => colorLabel(color as Color))
                    .join("・")} が交渉に応じました。成立させる相手を選ぶか、交渉を取り下げてください。`
                : "成立させる相手を選んでください。"}
            </p>
            <div className="trade-response-buttons">
              {confirmActions.map((action) => {
                const target = action[2][10] as Color;
                return (
                  <Button
                    key={String(target)}
                    variant="contained"
                    color="primary"
                    disabled={pendingAction !== null || !hasAcceptedPartners}
                    onClick={() => submitAction(action)}
                  >
                    {colorLabel(target)}と成立
                  </Button>
                );
              })}
              {withdrawAction && (
                <Button
                  variant="outlined"
                  color="inherit"
                  disabled={pendingAction !== null}
                  onClick={() => submitAction(withdrawAction)}
                >
                  交渉を取り下げる
                </Button>
              )}
            </div>
            {mustCancelDueToRejections && (
              <p className="trade-reject-note">
                {rejectedColors.map((color) => colorLabel(color)).join("・")}
                が交渉を断ったため、成立はできません。交渉を取り下げてください。
              </p>
            )}
          </div>
        )}

        {withdrawAction && !decidingPartner && (
          <div className="trade-response">
            <p>
              {noAcceptanceYet
                ? "まだ誰も交渉に応じていません。交渉を取り下げますか？"
                : hasAcceptedPartners
                ? `${acceptedColors
                    .map((color) => colorLabel(color as Color))
                    .join("・")} が交渉に応じています。今すぐ交渉を取り下げることもできます。`
                : "交渉を取り下げますか？"}
            </p>
            {rejectedColors.length > 0 && (
              <p className="trade-reject-note">
                {rejectedColors.map((color) => colorLabel(color)).join("・")}
                が交渉を断りました。
              </p>
            )}
            <div className="trade-response-buttons">
              <Button
                variant="outlined"
                color="inherit"
                disabled={pendingAction !== null}
                onClick={() => submitAction(withdrawAction)}
              >
                交渉を取り下げる
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className="trade-form">
        <h4>新しい交渉を提案</h4>
        {proposeDisabledReason && (
          <p className="trade-hint">{proposeDisabledReason}</p>
        )}
        <div className="trade-grid">
          <div className="trade-grid-head">
            <span>資源</span>
            <span>渡す</span>
            <span>受け取る</span>
            <span>所持</span>
          </div>
          {RESOURCE_ORDER.map((resource, index) => (
            <div className="trade-row" key={resource}>
              <span className="resource-name">{resourceLabel(resource)}</span>
              <div className="trade-counter">
                <button
                  type="button"
                  onClick={() => decrementOffer(index, -1)}
                  aria-label="decrease offer"
                >
                  −
                </button>
                <span>{offer[index]}</span>
                <button
                  type="button"
                  onClick={() => incrementOffer(index, 1)}
                  aria-label="increase offer"
                  disabled={offer[index] >= availableCounts[index]}
                >
                  ＋
                </button>
              </div>
              <div className="trade-counter">
                <button
                  type="button"
                  onClick={() => decrementRequest(index, -1)}
                  aria-label="decrease request"
                >
                  −
                </button>
                <span>{request[index]}</span>
                <button
                  type="button"
                  onClick={() => incrementRequest(index, 1)}
                  aria-label="increase request"
                >
                  ＋
                </button>
              </div>
              <span className="resource-available">
                {availableCounts[index]}
              </span>
            </div>
          ))}
        </div>
        {validationError && (
          <div className="trade-error">{validationError}</div>
        )}
        <div className="trade-actions">
          <Button
            variant="text"
            color="inherit"
            onClick={resetForm}
            disabled={pendingAction !== null || (offerTotal === 0 && requestTotal === 0)}
          >
            リセット
          </Button>
          <Button
            variant="contained"
            color="primary"
            disabled={!canSubmitProposal}
            onClick={handleProposeTrade}
          >
            {pendingAction === "OFFER_TRADE" ? "送信中..." : "交渉を提案"}
          </Button>
        </div>
      </div>
      {children}
    </CollapsibleSection>
  );
}
