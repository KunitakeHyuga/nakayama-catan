import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { SnackbarProvider } from "notistack";
import { createTheme, ThemeProvider } from "@mui/material/styles";
import { blue, green } from "@mui/material/colors";
import Fade from "@mui/material/Fade";

import GameScreen from "./pages/GameScreen";
import HomePage from "./pages/HomePage";
import { StateProvider } from "./store";

import "./App.scss";
import ReplayScreen from "./pages/ReplayScreen";
import RecordsPage from "./pages/RecordsPage";
import PvpLobbyPage from "./pages/PvpLobbyPage";
import PvpRoomPage from "./pages/PvpRoomPage";

const theme = createTheme({
  palette: {
    primary: {
      main: blue[900],
    },
    secondary: {
      main: green[900],
    },
  },
});

function App() {
  return (
    <ThemeProvider theme={theme}>
      <StateProvider>
        <SnackbarProvider
          classes={{ containerRoot: "snackbar-container" }}
          maxSnack={1}
          autoHideDuration={1000}
          TransitionComponent={Fade}
          TransitionProps={{ timeout: 100 }}
        >
          <Router>
            <Routes>
              <Route
                path="/games/:gameId/states/:stateIndex"
                element={<GameScreen replayMode={true} />}
              />
              <Route path="/replays/:gameId" element={<ReplayScreen />} />
              <Route
                path="/games/:gameId"
                element={<GameScreen replayMode={false} />}
              />
              <Route path="/records" element={<RecordsPage />} />
              <Route path="/records/:gameId" element={<RecordsPage />} />
              <Route path="/" element={<HomePage />} />
              <Route path="/pvp" element={<PvpLobbyPage />} />
              <Route path="/pvp/rooms/:roomId" element={<PvpRoomPage />} />
            </Routes>
          </Router>
        </SnackbarProvider>
      </StateProvider>
    </ThemeProvider>
  );
}

export default App;
