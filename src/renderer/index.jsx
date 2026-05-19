import React from "react";
import { createRoot } from "react-dom/client";
import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import App from "./App.jsx";
import ConfirmProvider from "./components/ConfirmProvider.jsx";
import Home from "./routes/Home.jsx";
import Pistas from "./routes/Pistas.jsx";
import Logs from "./routes/Logs.jsx";
import Sessoes from "./routes/Sessoes.jsx";
import SessionDetail from "./routes/SessionDetail.jsx";
import Listagem from "./routes/Listagem.jsx";
import Dashboard from "./routes/Dashboard.jsx";
import Settings from "./routes/Settings.jsx";
import Replay from "./routes/Replay.jsx";
import Telemetria from "./routes/Telemetria.jsx";
import Overlay from "./routes/Overlay.jsx";
import Overlays from "./routes/Overlays.jsx";
import "./styles/globals.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ConfirmProvider>
    <HashRouter>
      <Routes>
        {/* Replay em rota standalone (sem Sidebar/layout) pra minimizar DOM */}
        <Route path="/replay/:lapId" element={<Replay />} />
        {/* Overlay in-game — janela transparente separada usa esta rota */}
        <Route path="/overlay" element={<Overlay />} />
        <Route element={<App />}>
          <Route index element={<Home />} />
          <Route path="/pistas" element={<Pistas />} />
          <Route path="/listagem" element={<Listagem />} />
          <Route path="/sessoes" element={<Sessoes />} />
          <Route path="/sessoes/:sessionId" element={<SessionDetail />} />
          <Route
            path="/sessoes/:sessionId/telemetria"
            element={<Telemetria />}
          />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/overlays" element={<Overlays />} />
          <Route path="/logs" element={<Logs />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </HashRouter>
    </ConfirmProvider>
  </React.StrictMode>
);
