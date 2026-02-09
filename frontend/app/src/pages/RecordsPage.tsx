import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { GridLoader } from "react-spinners";
import type { AxiosError } from "axios";

import "./RecordsPage.scss";
import BoardSnapshot from "../components/BoardSnapshot";
import PlayerStateBox from "../components/PlayerStateBox";
import type { GameState } from "../utils/api.types";
import {
  deleteGame,
  getGameEvents,
  getState,
  listGames,
  type GameEvent,
  type GameRecordSummary,
} from "../utils/apiClient";
import { playerKey } from "../utils/stateUtils";
import { humanizeActionRecord } from "../utils/promptUtils";
import { colorLabel } from "../utils/i18n";
import {
  getLocalRecords,
  type LocalRecord,
  removeLocalRecord,
} from "../utils/localRecords";
import { calculateNegotiationStats } from "../utils/negotiationStats";
import { loadHtmlToImage } from "../utils/htmlToImageLoader";
import { getRecordPlayerNames } from "../utils/recordPlayerNames";

const dateTimeFormatter = new Intl.DateTimeFormat("ja-JP", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

const ACTION_TYPE_LABELS: Record<string, string> = {
  ROLL: "ダイス",
  DISCARD: "資源を捨てる",
  BUY_DEVELOPMENT_CARD: "開発カード購入",
  BUILD_SETTLEMENT: "開拓地建設",
  BUILD_CITY: "都市建設",
  BUILD_ROAD: "街道建設",
  PLAY_KNIGHT_CARD: "騎士カード",
  PLAY_ROAD_BUILDING: "街道建設カード",
  PLAY_MONOPOLY: "独占カード",
  PLAY_YEAR_OF_PLENTY: "豊穣の年カード",
  MOVE_ROBBER: "盗賊移動",
  MARITIME_TRADE: "海上交易",
  OFFER_TRADE: "交渉提案",
  ACCEPT_TRADE: "交渉承諾",
  REJECT_TRADE: "交渉拒否",
  CONFIRM_TRADE: "交渉成立",
  CANCEL_TRADE: "交渉取り下げ",
  END_TURN: "ターン終了",
};

type EnrichedRecord = GameRecordSummary & { updated_at_ms: number };

function isValidGameId(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }
  const trimmed = value.trim();
  return (
    trimmed.length > 0 &&
    trimmed !== "undefined" &&
    trimmed !== "null"
  );
}

function enrichRemote(records: GameRecordSummary[]): EnrichedRecord[] {
  const baseTime = Date.now();
  return records.map((record, index) => ({
    ...record,
    updated_at_ms: record.updated_at
      ? Date.parse(record.updated_at)
      : baseTime - index,
  }));
}

function mergeRecords(
  remote: GameRecordSummary[],
  local: LocalRecord[]
): GameRecordSummary[] {
  const mergedMap = new Map<string, EnrichedRecord>();
  enrichRemote(remote).forEach((record) => {
    mergedMap.set(record.game_id, record);
  });
  local.forEach((record) => {
    const existing = mergedMap.get(record.game_id);
    if (!existing || record.state_index >= existing.state_index) {
      const mergedRecord: EnrichedRecord = {
        ...record,
        turns_completed:
          record.turns_completed ??
          existing?.turns_completed ??
          null,
      };
      mergedMap.set(record.game_id, mergedRecord);
    }
  });
  return Array.from(mergedMap.values())
    .filter((record) => isValidGameId(record.game_id))
    .map((record) => {
      const updatedAtMs =
        record.updated_at_ms ??
        (record.updated_at
          ? Date.parse(record.updated_at)
          : 0);
      return {
        ...record,
        updated_at_ms: updatedAtMs,
        updated_at: record.updated_at ?? (updatedAtMs ? new Date(updatedAtMs).toISOString() : undefined),
      };
    })
    .sort((a, b) => (b.updated_at_ms || 0) - (a.updated_at_ms || 0));
}

export default function RecordsPage() {
  const { gameId: paramsGameId } = useParams();
  const navigate = useNavigate();

  const [games, setGames] = useState<GameRecordSummary[]>([]);
  const [selectedGameId, setSelectedGameId] = useState<string | null>(
    paramsGameId ?? null
  );
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [gameEvents, setGameEvents] = useState<GameEvent[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localAvailable, setLocalAvailable] = useState<boolean>(false);
  const [deletePending, setDeletePending] = useState(false);
  const [boardImagePending, setBoardImagePending] = useState(false);
  const boardSnapshotRef = useRef<HTMLDivElement | null>(null);

  const loadGames = useCallback(async () => {
    const localRecords = getLocalRecords();
    setLocalAvailable(localRecords.length > 0);
    let remoteRecords: GameRecordSummary[] = [];
    try {
      setListLoading(true);
      setError(null);
      remoteRecords = await listGames();
    } catch (err) {
      console.error(err);
      setError("対戦記録の一覧を取得できませんでした。");
    } finally {
      setListLoading(false);
    }
    const combined = mergeRecords(remoteRecords, localRecords);
    setGames(combined);
    if (!paramsGameId && combined.length > 0 && !selectedGameId) {
      const [first] = combined;
      if (isValidGameId(first.game_id)) {
        setSelectedGameId(first.game_id);
        navigate(`/records/${first.game_id}`, { replace: true });
      }
    }
  }, [navigate, paramsGameId, selectedGameId]);

  useEffect(() => {
    loadGames();
  }, [loadGames]);

  useEffect(() => {
    if (isValidGameId(paramsGameId)) {
      setSelectedGameId(paramsGameId);
    } else {
      setSelectedGameId(null);
    }
  }, [paramsGameId]);

  useEffect(() => {
    const fetchRecord = async () => {
      if (!selectedGameId) {
        setGameState(null);
        setGameEvents([]);
        return;
      }
      try {
        setDetailLoading(true);
        setError(null);
        const statePromise = getState(selectedGameId, "latest");
        const eventsPromise: Promise<GameEvent[]> = getGameEvents(
          selectedGameId
        ).catch((eventsError) => {
          console.error(eventsError);
          return [];
        });
        const [latestState, events] = await Promise.all([
          statePromise,
          eventsPromise,
        ]);
        setGameState(latestState);
        setGameEvents(events);
      } catch (err) {
        console.error(err);
        setError("対戦記録の詳細を取得できませんでした。");
        setGameState(null);
        setGameEvents([]);
      } finally {
        setDetailLoading(false);
      }
    };
    fetchRecord();
  }, [selectedGameId]);

  const handleSelectGame = (gameId: string) => {
    if (!isValidGameId(gameId)) {
      setError("不正なゲームIDです。");
      return;
    }
    setSelectedGameId(gameId);
    navigate(`/records/${gameId}`);
  };

  const selectedSummary = useMemo(
    () => games.find((game) => game.game_id === selectedGameId),
    [games, selectedGameId]
  );
  const selectedPlayerNames = useMemo(
    () => getRecordPlayerNames(selectedGameId),
    [selectedGameId]
  );

  const formatRecordDate = useCallback(
    (record?: GameRecordSummary | null) => {
      if (!record) {
        return "日時不明";
      }
      const timestamp = record.updated_at
        ? Date.parse(record.updated_at)
        : record.updated_at_ms;
      if (!timestamp || Number.isNaN(timestamp)) {
        return "日時不明";
      }
      return dateTimeFormatter.format(new Date(timestamp));
    },
    []
  );

  const winningLabel = useMemo(() => {
    if (!selectedSummary) {
      return "ゲームを選択してください";
    }
    if (!selectedSummary.winning_color) {
      return "進行中";
    }
    return `${colorLabel(selectedSummary.winning_color)}`;
  }, [selectedSummary]);

  const negotiationStats = useMemo(() => {
    if (!gameState) {
      return [];
    }
    return calculateNegotiationStats(gameState, gameEvents);
  }, [gameState, gameEvents]);

  const formatPercent = (value: number | null): string => {
    if (value === null || Number.isNaN(value)) {
      return "—";
    }
    return `${Math.round(value * 100)}%`;
  };

  const formatDuration = (value: number | null): string => {
    if (value === null) {
      return "—";
    }
    const seconds = value / 1000;
    if (seconds >= 10) {
      return `${seconds.toFixed(0)}秒`;
    }
    return `${seconds.toFixed(1)}秒`;
  };

  const turnSummaryValue = useMemo(() => {
    if (!gameState) {
      return "—";
    }
    const finishedTurns = gameState.action_records.filter(
      (record) => record[0][1] === "END_TURN"
    ).length;
    return `${finishedTurns}（${gameState.state_index}）`;
  }, [gameState]);

  const downloadLogCsv = useCallback(() => {
    if (!gameState || gameState.action_records.length === 0) {
      return;
    }
    const escapeCsv = (value: string | number) => {
      const stringValue = String(value ?? "");
      return `"${stringValue.replace(/"/g, '""')}"`;
    };
    let actualTurn = 0;
    const rows = gameState.action_records.map((record, index) => {
      const action = record[0];
      if (action[1] === "ROLL") {
        actualTurn += 1;
      }
      const turnNumber = index + 1;
      const actorColor = colorLabel(action[0]);
      const actionLabel = ACTION_TYPE_LABELS[action[1]] ?? action[1];
      const detail = humanizeActionRecord(gameState, record);
      return [turnNumber, actorColor, actionLabel, detail, actualTurn];
    });
    const header = ["ターン数", "色", "行動", "詳細", "実ターン数"];
    const csvContent = [header, ...rows]
      .map((cols) => cols.map(escapeCsv).join(","))
      .join("\r\n");
    const csv = "\uFEFF" + csvContent;
    const blob = new Blob([csv], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const filename = selectedGameId
      ? `game-${selectedGameId}-log.csv`
      : "game-log.csv";
    link.href = url;
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [gameState, selectedGameId]);

  const downloadBoardJpeg = useCallback(async () => {
    if (!gameState || !boardSnapshotRef.current) {
      return;
    }
    try {
      setBoardImagePending(true);
      const element = boardSnapshotRef.current;
      const backgroundColor =
        window.getComputedStyle(element).getPropertyValue("background-color") ||
        "#0b1628";
      const htmlToImage = await loadHtmlToImage();
      const dataUrl = await htmlToImage.toJpeg(element, {
        quality: 0.95,
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor,
      });
      const filename = selectedGameId
        ? `game-${selectedGameId}-board.jpeg`
        : "catan-board.jpeg";
      const link = document.createElement("a");
      link.href = dataUrl;
      link.setAttribute("download", filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error(err);
      setError("盤面画像をダウンロードできませんでした。");
    } finally {
      setBoardImagePending(false);
    }
  }, [gameState, selectedGameId]);

  const handleDeleteSelectedGame = useCallback(async () => {
    if (!selectedGameId) {
      return;
    }
    const confirmed = window.confirm("選択中の試合結果を削除しますか？");
    if (!confirmed) {
      return;
    }
    setDeletePending(true);
    setError(null);
    try {
      try {
        await deleteGame(selectedGameId);
      } catch (err) {
        const axiosError = err as AxiosError;
        if (axiosError?.response?.status !== 404) {
          throw err;
        }
      }
      removeLocalRecord(selectedGameId);
      setSelectedGameId(null);
      setGameState(null);
      navigate("/records", { replace: true });
      await loadGames();
    } catch (err) {
      console.error(err);
      setError("試合結果を削除できませんでした。");
    } finally {
      setDeletePending(false);
    }
  }, [selectedGameId, loadGames, navigate]);

  return (
    <main className="records-page">
      <div className="records-header">
        <h1 className="logo">対戦記録</h1>
        <div className="records-header-actions">
          <button
            className="delete-record-btn"
            onClick={handleDeleteSelectedGame}
            disabled={!selectedGameId || deletePending}
          >
            {deletePending ? "削除中..." : "試合結果を消す"}
          </button>
          <button className="records-home-btn" onClick={() => navigate("/")}>
            ホームに戻る
          </button>
        </div>
      </div>
      {error && <div className="records-error">{error}</div>}
      <div className="records-layout">
        <aside className="records-list">
          <div className="records-list-header">対戦一覧</div>
          {listLoading && (
            <GridLoader
              className="loader"
              color="#ffffff"
              size={40}
            />
          )}
          {!listLoading && games.length === 0 && (
            <div className="records-empty">まだ対戦記録がありません。</div>
          )}
          {!listLoading && games.length > 0 && (
            <div className="records-items">
              {games.map((game) => (
                <button
                  key={game.game_id}
                  className={`record-item ${
                    selectedGameId === game.game_id ? "selected" : ""
                  }`}
                  onClick={() => handleSelectGame(game.game_id)}
                >
                  <div className="game-id-row">
                    <div className="game-id">{game.game_id}</div>
                    <div className="game-date">{formatRecordDate(game)}</div>
                  </div>
                  <div className="game-meta">
                    <span>
                      勝者:{" "}
                      {game.winning_color
                        ? colorLabel(game.winning_color)
                        : "進行中"}
                    </span>
                    <span>
                      ターン{" "}
                      {game.turns_completed != null
                        ? `${game.turns_completed}（${game.state_index}）`
                        : game.state_index}
                    </span>
                    <span>
                      プレイヤー数:{" "}
                      {game.player_colors?.length
                        ? `${game.player_colors.length}人`
                        : "不明"}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </aside>
        <section className="records-detail">
          {detailLoading && (
            <GridLoader
              className="loader"
              color="#ffffff"
              size={60}
            />
          )}
          {!detailLoading && gameState && (
            <>
              <section className="records-detail-body">
                <div className="records-main">
                  <section className="records-board">
                    <div className="section-header">
                      <h2>最終盤面</h2>
                      <button
                        className="jpeg-button"
                        onClick={downloadBoardJpeg}
                        disabled={boardImagePending}
                      >
                        {boardImagePending ? "作成中..." : "JPEGダウンロード"}
                      </button>
                    </div>
                    <BoardSnapshot ref={boardSnapshotRef} gameState={gameState} />
                  </section>
                  <section className="records-players">
                    <h2>所持・利用カード</h2>
                    <div className="players-grid">
                      {gameState.colors.map((color) => (
                        <PlayerStateBox
                          key={color}
                          color={color}
                          playerState={gameState.player_state}
                          playerKey={playerKey(gameState, color)}
                          playerName={selectedPlayerNames?.[color] ?? null}
                          showFullDevelopmentCards
                        />
                      ))}
                    </div>
                  </section>
                </div>
                <aside className="records-log-panel">
                  <section className="records-summary compact">
                    <div>
                      <span className="summary-label">ゲームID:</span>
                      <span className="summary-value">{selectedGameId}</span>
                    </div>
                    <div>
                      <span className="summary-label">勝者:</span>
                      <span className="summary-value">{winningLabel}</span>
                    </div>
                    <div>
                      <span className="summary-label">試合日:</span>
                      <span className="summary-value">
                        {formatRecordDate(selectedSummary)}
                      </span>
                    </div>
                    <div>
                      <span className="summary-label">ターン数:</span>
                      <span className="summary-value">
                        {turnSummaryValue}
                      </span>
                    </div>
                    <div>
                      <span className="summary-label">プレイヤー数:</span>
                      <span className="summary-value">
                        {gameState.colors.length}人
                      </span>
                    </div>
                  </section>
                  <section className="records-analytics">
                    <h2>交渉データ</h2>
                    {negotiationStats.length === 0 ? (
                      <p className="analytics-note">
                        交渉ログがないため、集計できません。
                      </p>
                    ) : (
                      <div className="analytics-player-list">
                        {negotiationStats.map((stats) => (
                          <div
                            key={stats.playerColor}
                            className="analytics-player"
                          >
                            <h3 className="analytics-player-title">
                              {colorLabel(stats.playerColor)}
                            </h3>
                            <div className="analytics-grid">
                              <div className="analytics-item">
                                <span className="analytics-label">
                                  交渉提案回数
                                </span>
                                <span className="analytics-value">
                                  {stats.offerCount}回（成立{" "}
                                  {stats.successCount}回）
                                </span>
                              </div>
                              <div className="analytics-item">
                                <span className="analytics-label">
                                  交渉成立率
                                </span>
                                <span className="analytics-value">
                                  {formatPercent(stats.successRate)}
                                </span>
                              </div>
                              <div className="analytics-item">
                                <span className="analytics-label">
                                  交渉に使った時間
                                </span>
                                <span className="analytics-value">
                                  {stats.timestampsAvailable ? (
                                    stats.totalDurationMs !== null ? (
                                      <>
                                        {formatDuration(
                                          stats.totalDurationMs
                                        )}
                                        {stats.averageDurationMs !==
                                          null && (
                                          <span className="analytics-subtext">
                                            （平均{" "}
                                            {formatDuration(
                                              stats.averageDurationMs
                                            )}
                                            ）
                                          </span>
                                        )}
                                      </>
                                    ) : (
                                      "記録なし"
                                    )
                                  ) : (
                                    "未計測"
                                  )}
                                </span>
                              </div>
                              <div className="analytics-item">
                                <span className="analytics-label">
                                  AIアドバイス利用
                                </span>
                                <span className="analytics-value">
                                  {stats.adviceRequestCount}回
                                  {stats.adviceRequestCount > 0 && (
                                    <span className="analytics-subtext">
                                      （
                                      {formatPercent(
                                        stats.adviceFollowRate
                                      )}
                                      が提案に直結）
                                    </span>
                                  )}
                                </span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                  <section className="records-log">
                    <div className="section-header">
                      <h2>行動ログ</h2>
                      <button
                        className="csv-button"
                        onClick={downloadLogCsv}
                        disabled={
                          !gameState || gameState.action_records.length === 0
                        }
                      >
                        CSVダウンロード
                      </button>
                    </div>
                    <div className="log-entries">
                      {gameState.action_records
                        .slice()
                        .reverse()
                        .map((record, index) => (
                          <div
                            key={`${record[0][0]}-${index}`}
                            className={`log-entry ${record[0][0]} foreground`}
                          >
                            {humanizeActionRecord(gameState, record)}
                          </div>
                        ))}
                    </div>
                  </section>
                </aside>
              </section>
            </>
          )}
          {!detailLoading && !gameState && (
            <div className="records-placeholder">
              {games.length === 0
                ? "対戦記録が存在しません。"
                : "左の一覧からゲームを選択してください。"}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
