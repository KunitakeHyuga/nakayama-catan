import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@mui/material";
import { GridLoader } from "react-spinners";
import { createGame } from "../utils/apiClient";

import "./HomePage.scss";

// Enum of Type of Game Mode
const GameMode = Object.freeze({
  HUMAN_VS_CATANATRON: "HUMAN_VS_CATANATRON",
  RANDOM_BOTS: "RANDOM_BOTS",
  CATANATRON_BOTS: "CATANATRON_BOTS",
});

type GameModeType = typeof GameMode[keyof typeof GameMode]

function getPlayers(gameMode: GameModeType, numPlayers: number) {
  switch (gameMode) {
    case GameMode.HUMAN_VS_CATANATRON:
      const players = ["HUMAN"];
      for (let i = 1; i < numPlayers; i++) {
        players.push("CATANATRON");
      }
      return players;
    case GameMode.RANDOM_BOTS:
      return Array(numPlayers).fill("RANDOM");
    case GameMode.CATANATRON_BOTS:
      return Array(numPlayers).fill("CATANATRON");
    default:
      throw new Error("不正なゲームモードです");
  }
}

export default function HomePage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [numPlayers, setNumPlayers] = useState(2);
  const navigate = useNavigate();

  const handleCreateGame = async (gameMode: GameModeType) => {
    setLoading(true);
    setError(null);
    try {
      const players = getPlayers(gameMode, numPlayers);
      const gameId = await createGame(players);
      navigate("/games/" + gameId);
    } catch (err) {
      console.error("ゲームの作成に失敗しました:", err);
      if (err instanceof Error) {
        setError(err.message);
      } else if (typeof err === "string") {
        setError(err);
      } else {
        setError("サーバーに接続できませんでした。API サーバーが起動しているか確認してください。");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="home-page">
      <h1 className="logo">Catanatron</h1>

      <div className="switchable">
        {!loading ? (
          <>
            {error && <div className="error-banner">{error}</div>}
            <ul>
              <li>手札は常に公開</li>
              <li>資源破棄の選択肢なし</li>
            </ul>
            <div className="player-count-selector">
              <div className="player-count-label">プレイヤー人数</div>
              <div className="player-count-buttons">
                {[2, 3, 4].map((value) => (
                  <Button
                    key={value}
                    variant="contained"
                    onClick={() => setNumPlayers(value)}
                    className={`player-count-button ${
                      numPlayers === value ? "selected" : ""
                    }`}
                  >
                    {value}人
                  </Button>
                ))}
              </div>
            </div>
            <Button
              variant="contained"
              color="primary"
              className="main-action-button"
              onClick={() => handleCreateGame(GameMode.HUMAN_VS_CATANATRON)}
            >
              Catanatron と対戦する
            </Button>
            <Button
              variant="contained"
              color="secondary"
              className="main-action-button"
              onClick={() => handleCreateGame(GameMode.RANDOM_BOTS)}
            >
              ランダムボットを観戦
            </Button>
            <Button
              variant="contained"
              color="secondary"
              className="main-action-button"
              onClick={() => handleCreateGame(GameMode.CATANATRON_BOTS)}
            >
              Catanatron 同士を観戦
            </Button>
            <Button
              variant="outlined"
              className="main-action-button"
              onClick={() => navigate("/pvp")}
            >
              PvP ルームに参加
            </Button>
            <div className="records-link">
              <Button
                variant="contained"
                className="main-action-button records-link-button"
                onClick={() => navigate("/records")}
              >
                対戦記録を見る
              </Button>
            </div>
            <div className="survey-link">
              <Button
                variant="text"
                className="survey-link-button"
                href="https://docs.google.com/forms/d/e/1FAIpQLScXQoeh9tJ6dl3wvgx1ESHj3yrhW6OK2YcUFMC2WaRYAZYexQ/formResponse"
                target="_blank"
                rel="noopener noreferrer"
              >
                対戦後アンケート
              </Button>
            </div>
          </>
        ) : (
          <GridLoader
            className="loader"
            color="#ffffff"
            size={60}
          />
        )}
      </div>
    </div>
  );
}
