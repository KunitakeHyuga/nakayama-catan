import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { useParams } from "react-router";
import { Button, CircularProgress } from "@mui/material";
import RecordVoiceOverIcon from "@mui/icons-material/RecordVoiceOver";
import PsychologyIcon from "@mui/icons-material/Psychology";

import {
  requestNegotiationAdvice,
  type StateIndex,
} from "../utils/apiClient";
import { store } from "../store";
import type { Color, GameState } from "../utils/api.types";
import { getHumanColor } from "../utils/stateUtils";
import CollapsibleSection from "./CollapsibleSection";
import BoardSnapshot from "./BoardSnapshot";
import { RightDrawerSizingContext } from "./RightDrawer";

import "./AnalysisBox.scss";
import "./NegotiationAdviceBox.scss";
import { loadHtmlToImage } from "../utils/htmlToImageLoader";

const RESOURCE_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bwood\b/gi, "木材"],
  [/\bbrick\b/gi, "レンガ"],
  [/\bsheep\b/gi, "羊毛"],
  [/\bwheat\b/gi, "小麦"],
  [/\bore\b/gi, "鉱石"],
  [/RED/g, "赤"],
  [/BLUE/g, "青"],
  [/WHITE/g, "白"],
  [/ORANGE/g, "橙"],
];

const DEV_CARD_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bknight\b/gi, "騎士"],
  [/\bmonopoly\b/gi, "独占"],
  [/\byear of plenty\b/gi, "豊穣の年"],
  [/\broad building\b/gi, "街道建設"],
];

type HighlightRule = {
  className: string;
};

const HIGHLIGHT_MAP: Record<string, HighlightRule> = {
  赤: { className: "player-red" },
  青: { className: "player-blue" },
  白: { className: "player-white" },
  オレンジ: { className: "player-orange" },
  木材: { className: "resource-wood" },
  レンガ: { className: "resource-brick" },
  羊毛: { className: "resource-sheep" },
  小麦: { className: "resource-wheat" },
  鉱石: { className: "resource-ore" },
};

const HIGHLIGHT_PATTERN = new RegExp(
  `(${Object.keys(HIGHLIGHT_MAP).join("|")})`,
  "g"
);

function extractNegotiationSections(text: string): string {
  const adviceHeading = "## 交渉アドバイス";
  const imageHeading = "### 盤面画像の気づき";
  const loadHeading = "## 判断負荷推定";

  let workingText = text;
  const loadIndex = workingText.indexOf(loadHeading);
  if (loadIndex >= 0) {
    const afterLoad = workingText.slice(loadIndex + loadHeading.length);
    const nextSectionMatch = afterLoad.match(/\n##\s+[^\n]+/);
    const loadEnd =
      nextSectionMatch && nextSectionMatch.index !== undefined
        ? loadIndex + loadHeading.length + nextSectionMatch.index
        : workingText.length;
    workingText =
      workingText.slice(0, loadIndex).trimEnd() +
      "\n\n" +
      workingText.slice(loadEnd).trimStart();
  }

  const parts: string[] = [];

  const adviceIndex = workingText.indexOf(adviceHeading);
  if (adviceIndex >= 0) {
    const adviceContent = workingText
      .slice(adviceIndex + adviceHeading.length)
      .trim();
    if (adviceContent) {
      parts.push(`交渉アドバイス\n${adviceContent}`);
    }
  }

  const imageIndex = workingText.indexOf(imageHeading);
  if (imageIndex >= 0) {
    const imageEnd =
      adviceIndex >= 0 && adviceIndex > imageIndex
        ? adviceIndex
        : workingText.length;
    const imageContent = workingText.slice(imageIndex, imageEnd).trim();
    if (imageContent) {
      parts.unshift(imageContent);
    }
  }

  if (parts.length === 0) {
    return workingText;
  }
  return parts.join("\n\n");
}

function localizeAdviceText(text: string): string {
  let output = text.replace(/\*\*/g, "");
  output = extractNegotiationSections(output);
  [...RESOURCE_REPLACEMENTS, ...DEV_CARD_REPLACEMENTS].forEach(
    ([pattern, replacement]) => {
      output = output.replace(pattern, replacement);
    }
  );
  output = output.replace(/おすすめ交渉（上位2）/g, "おすすめの交渉");
  output = output.replace(/おすすめ交渉\(上位2\)/g, "おすすめの交渉");
  output = output.replace(/おすすめ交渉/g, "おすすめの交渉");
  output = output.replace(/^\s*1\)\s*/gm, "① ");
  output = output.replace(/^\s*2\)\s*/gm, "② ");
  return output.trim();
}

function measureAdviceWidth(adviceElement: HTMLDivElement): number | null {
  if (typeof window === "undefined") {
    return null;
  }
  const container = document.createElement("div");
  container.className = "negotiation-box";
  container.style.position = "absolute";
  container.style.left = "-9999px";
  container.style.top = "0";
  container.style.visibility = "hidden";
  container.style.pointerEvents = "none";

  const clone = adviceElement.cloneNode(true) as HTMLDivElement;
  clone.style.whiteSpace = "pre";
  clone.style.width = "max-content";
  clone.style.maxWidth = "none";
  clone.style.display = "inline-block";

  container.appendChild(clone);
  document.body.appendChild(container);

  const adviceWidth = clone.getBoundingClientRect().width;
  document.body.removeChild(container);

  const drawerContent = adviceElement.closest(".drawer-content");
  if (!drawerContent) {
    return adviceWidth;
  }
  const style = window.getComputedStyle(drawerContent);
  const paddingLeft = parseFloat(style.paddingLeft) || 0;
  const paddingRight = parseFloat(style.paddingRight) || 0;
  return adviceWidth + paddingLeft + paddingRight + 16;
}

function renderAdviceContent(advice: string) {
  if (!advice) {
    return advice;
  }
  const lines = advice.split("\n");
  return lines.map((line, lineIndex) => {
    const segments = line.split(HIGHLIGHT_PATTERN);
    const renderedSegments = segments.map((segment, segmentIndex) => {
      if (!segment) {
        return segment;
      }
      const highlight = HIGHLIGHT_MAP[segment];
      if (highlight) {
        return (
          <span
            key={`seg-${lineIndex}-${segmentIndex}`}
            className={`advice-chip ${highlight.className}`}
          >
            {segment}
          </span>
        );
      }
      return segment;
    });
    return (
      <span key={`line-${lineIndex}`}>
        {renderedSegments}
        {lineIndex < lines.length - 1 ? <br /> : null}
      </span>
    );
  });
}

type NegotiationAdviceBoxProps = {
  stateIndex: StateIndex;
  gameIdOverride?: string | null;
  gameStateOverride?: GameState | null;
  requesterColorOverride?: Color | null;
};

export default function NegotiationAdviceBox({
  stateIndex,
  gameIdOverride = null,
  gameStateOverride = null,
  requesterColorOverride = null,
}: NegotiationAdviceBoxProps) {
  const { gameId: routeGameId } = useParams();
  const { state } = useContext(store);
  const drawerSizing = useContext(RightDrawerSizingContext);
  const [advice, setAdvice] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const gameId = gameIdOverride ?? routeGameId ?? undefined;
  const currentGameState = gameStateOverride ?? state.gameState;
  const requesterColor =
    requesterColorOverride ??
    (currentGameState ? getHumanColor(currentGameState) : null);
  const boardSnapshotRef = useRef<HTMLDivElement | null>(null);
  const adviceOutputRef = useRef<HTMLDivElement | null>(null);

  const captureBoardImage = useCallback(async () => {
    if (!boardSnapshotRef.current) {
      return null;
    }
    try {
      await new Promise((resolve) => {
        requestAnimationFrame(() => resolve(undefined));
      });
      const htmlToImage = await loadHtmlToImage();
      const element = boardSnapshotRef.current;
      const backgroundColor =
        window.getComputedStyle(element).getPropertyValue("background-color") ||
        "#0b1628";
      return await htmlToImage.toJpeg(element, {
        quality: 0.95,
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor,
      });
    } catch (captureError) {
      console.warn(
        "Failed to capture board snapshot for negotiation advice:",
        captureError
      );
      return null;
    }
  }, []);

  const handleAdviceRequest = async () => {
    if (!gameId || !currentGameState) {
      return;
    }

    try {
      setLoading(true);
      setError("");
      const boardImageDataUrl = await captureBoardImage();
      if (boardImageDataUrl) {
        console.debug(
          "Negotiation advice board image captured (length):",
          boardImageDataUrl.length
        );
        console.info(
          "Negotiation advice board image data URL:",
          boardImageDataUrl
        );
      } else {
        console.debug("Negotiation advice board image capture skipped.");
      }
      const result = await requestNegotiationAdvice(
        gameId,
        stateIndex,
        boardImageDataUrl,
        requesterColor
      );
      if (boardImageDataUrl) {
        console.info("Negotiation advice request sent with board image.");
      } else {
        console.info("Negotiation advice request sent without board image.");
      }
      if (result.success && result.advice) {
        setAdvice(localizeAdviceText(result.advice));
      } else {
        setAdvice("");
        setError(result.error || "アドバイスの取得に失敗しました");
      }
    } catch (err) {
      console.error("Failed to request negotiation advice:", err);
      if (err instanceof Error) {
        setError(err.message);
      } else if (typeof err === "string") {
        setError(err);
      } else {
        setError("アドバイスの取得中に不明なエラーが発生しました");
      }
    } finally {
      setLoading(false);
    }
  };

  const buttonDisabled = loading || !gameId || !currentGameState;

  const adviceTitle = (
    <span className="analysis-title-text">
      <PsychologyIcon fontSize="small" />
      <span>交渉支援AIエージェント</span>
    </span>
  );

  useEffect(() => {
    if (!advice || !drawerSizing || !adviceOutputRef.current) {
      return;
    }
    const measuredWidth = measureAdviceWidth(adviceOutputRef.current);
    if (measuredWidth) {
      drawerSizing.requestWidth(measuredWidth);
    }
  }, [advice, drawerSizing]);

  return (
    <>
      <CollapsibleSection
        className="analysis-box negotiation-box"
        title={adviceTitle}
      >
        <div className="analysis-actions">
          <Button
            variant="contained"
            color="primary"
            onClick={handleAdviceRequest}
            disabled={buttonDisabled}
            startIcon={loading ? <CircularProgress size={20} /> : <RecordVoiceOverIcon />}
          >
            {loading ? "送信中..." : "アドバイス取得"}
          </Button>
        </div>

        {error && <div className="error-message">{error}</div>}

        {advice ? (
          <div className="advice-output" ref={adviceOutputRef}>
            {renderAdviceContent(advice)}
          </div>
        ) : (
          <p className="advice-placeholder">
            盤面と直近の行動ログをChatGPTに送り、トレードや交渉のヒントを取得します。
          </p>
        )}
      </CollapsibleSection>
      {currentGameState && (
        <div className="negotiation-board-capture" aria-hidden="true">
          <BoardSnapshot ref={boardSnapshotRef} gameState={currentGameState} />
        </div>
      )}
    </>
  );
}
