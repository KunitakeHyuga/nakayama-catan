import { useEffect, useState } from "react";
import {
  Button,
  Card,
  CardActions,
  CardContent,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  TextField,
  Typography,
} from "@mui/material";
import AddCircleOutlineIcon from "@mui/icons-material/AddCircleOutline";
import RefreshIcon from "@mui/icons-material/Refresh";
import MeetingRoomIcon from "@mui/icons-material/MeetingRoom";
import { useNavigate } from "react-router-dom";
import {
  createPvpRoom,
  listPvpRooms,
  type PvpRoom,
} from "../utils/apiClient";

import "./PvpLobbyPage.scss";

export default function PvpLobbyPage() {
  const [rooms, setRooms] = useState<PvpRoom[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newRoomName, setNewRoomName] = useState("");
  const navigate = useNavigate();

  const fetchRooms = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await listPvpRooms();
      setRooms(data);
    } catch (err) {
      console.error("Failed to load PvP rooms:", err);
      setError("ルーム一覧の取得に失敗しました。");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRooms();
  }, []);

  const handleCreateRoom = async () => {
    try {
      const room = await createPvpRoom(newRoomName);
      setCreateDialogOpen(false);
      setNewRoomName("");
      await fetchRooms();
      navigate(`/pvp/rooms/${room.room_id}`);
    } catch (err) {
      console.error("Failed to create room:", err);
      setError("ルームの作成に失敗しました。");
    }
  };

  return (
    <div className="pvp-lobby-page">
      <header className="lobby-header">
        <div>
          <Typography variant="h4" component="h1" className="logo">
            PvP ロビー
          </Typography>
          <Typography variant="body2" className="lobby-subtitle">
            ルームを選択するか、新しく作成してください。
          </Typography>
        </div>
        <div className="lobby-actions">
          <Button variant="outlined" onClick={() => navigate("/")}>
            ホームに戻る
          </Button>
          <Button
            startIcon={<RefreshIcon />}
            variant="outlined"
            onClick={fetchRooms}
            disabled={loading}
          >
            更新
          </Button>
          <Button
            startIcon={<AddCircleOutlineIcon />}
            variant="contained"
            color="secondary"
            onClick={() => setCreateDialogOpen(true)}
          >
            新しいルーム
          </Button>
        </div>
      </header>

      {error && <div className="error-banner">{error}</div>}

      <Grid container spacing={2}>
        {rooms.map((room) => {
          const occupied = room.seats.filter((seat) => seat.user_name).length;
          return (
            <Grid item xs={12} md={6} lg={4} key={room.room_id}>
              <Card className="room-card">
                <CardContent>
                  <Typography variant="h6" className="room-title">
                    {room.room_name}
                  </Typography>
                  <Typography variant="body2" className="room-id">
                    ID: {room.room_id}
                  </Typography>
                  <div className="room-occupancy">
                    {occupied} / {room.seats.length} 人
                  </div>
                  <ul className="room-seat-list">
                    {room.seats.map((seat) => (
                      <li key={seat.color}>
                        <span className={`seat-pill seat-pill-${seat.color.toLowerCase()}`}>
                          {seat.color}
                        </span>
                        <span className="seat-name">
                          {seat.user_name ?? "空席"}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {room.started && (
                    <Typography variant="caption" color="warning.main">
                      対戦中
                    </Typography>
                  )}
                </CardContent>
                <CardActions>
                  <Button
                    startIcon={<MeetingRoomIcon />}
                    variant="contained"
                    color="primary"
                    onClick={() => navigate(`/pvp/rooms/${room.room_id}`)}
                  >
                    入室
                  </Button>
                </CardActions>
              </Card>
            </Grid>
          );
        })}
        {!rooms.length && !loading && (
          <Grid item xs={12}>
            <div className="empty-state">
              現在表示できるルームがありません。新しく作成してください。
            </div>
          </Grid>
        )}
      </Grid>

      <Dialog open={createDialogOpen} onClose={() => setCreateDialogOpen(false)}>
        <DialogTitle>新しいルームを作成</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="ルーム名"
            fullWidth
            value={newRoomName}
            onChange={(event) => setNewRoomName(event.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateDialogOpen(false)}>キャンセル</Button>
          <Button
            onClick={handleCreateRoom}
            variant="contained"
            disabled={loading}
          >
            作成
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}
