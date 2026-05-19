const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  onTrackerLog: (callback) => {
    const listener = (_e, line) => callback(line);
    ipcRenderer.on("tracker-log", listener);
    return () => ipcRenderer.removeListener("tracker-log", listener);
  },
  getLogBuffer: () => ipcRenderer.invoke("tracker-log-buffer"),
  getLmuStatus: () => ipcRenderer.invoke("lmu.status"),
  onLmuStatusChange: (callback) => {
    const listener = (_e, payload) => callback(payload);
    ipcRenderer.on("lmu-status", listener);
    return () => ipcRenderer.removeListener("lmu-status", listener);
  },
  getStats7d: () => ipcRenderer.invoke("stats.last7days"),
  listTracks: () => ipcRenderer.invoke("tracks.list"),
  listTracksSummary: () => ipcRenderer.invoke("tracks.summary"),
  listCars: () => ipcRenderer.invoke("cars.list"),
  getLastTrack: () => ipcRenderer.invoke("home.lastTrack"),
  getHomeData: (trackId) => ipcRenderer.invoke("home.data", trackId),
  listSessions: (filter) => ipcRenderer.invoke("sessions.list", filter),
  getSessionDetail: (sessionId) =>
    ipcRenderer.invoke("sessions.detail", sessionId),
  getLapTelemetry: (lapId) => ipcRenderer.invoke("laps.telemetry", lapId),
  getTopLapsByTrack: (filter) =>
    ipcRenderer.invoke("laps.topByTrack", filter),
  getBestSectorsForTrack: (filter) =>
    ipcRenderer.invoke("tracks.bestSectors", filter),
  exportLap: (lapId) => ipcRenderer.invoke("laps.export", lapId),
  createImport: (payload) => ipcRenderer.invoke("imports.create", payload),
  listImportsForTrack: (filter) =>
    ipcRenderer.invoke("imports.listForTrack", filter),
  getImportTelemetry: (id) => ipcRenderer.invoke("imports.telemetry", id),
  deleteImport: (id) => ipcRenderer.invoke("imports.delete", id),
  deleteSession: (id) => ipcRenderer.invoke("sessions.delete", id),
  deleteLap: (id) => ipcRenderer.invoke("laps.delete", id),
  getFilterOptions: (ctx) => ipcRenderer.invoke("filters.options", ctx),
  getListagem: (filter) => ipcRenderer.invoke("listagem.data", filter),
  getDashboard: (filter) => ipcRenderer.invoke("dashboard.data", filter),
  confirm: (opts) => ipcRenderer.invoke("ui.confirm", opts),
  getConfig: () => ipcRenderer.invoke("config.get"),
  setConfig: (partial) => ipcRenderer.invoke("config.set", partial),
  getAppVersion: () => ipcRenderer.invoke("app.version"),
  getAutoStart: () => ipcRenderer.invoke("app.getAutoStart"),
  setAutoStart: (enabled) => ipcRenderer.invoke("app.setAutoStart", enabled),

  // ── Overlay ─────────────────────────────────────────────
  // App principal (Sidebar + tela /overlays): controle e config.
  setOverlayEnabled: (enabled) =>
    ipcRenderer.invoke("overlay.setEnabled", enabled),
  setOverlayEdit: (edit) => ipcRenderer.invoke("overlay.setEdit", edit),
  getOverlayState: () => ipcRenderer.invoke("overlay.getState"),
  getOverlayWidgets: () => ipcRenderer.invoke("overlay.getWidgets"),
  setOverlayWidget: (id, partial) =>
    ipcRenderer.invoke("overlay.setWidget", { id, partial }),

  // Renderer da overlay window (rota #/overlay).
  onOverlayTick: (cb) => {
    const listener = (_e, payload) => cb(payload);
    ipcRenderer.on("overlay-tick", listener);
    return () => ipcRenderer.removeListener("overlay-tick", listener);
  },
  onOverlayMode: (cb) => {
    const listener = (_e, payload) => cb(payload);
    ipcRenderer.on("overlay-mode", listener);
    return () => ipcRenderer.removeListener("overlay-mode", listener);
  },
  onOverlayWidgets: (cb) => {
    const listener = (_e, payload) => cb(payload);
    ipcRenderer.on("overlay-widgets", listener);
    return () => ipcRenderer.removeListener("overlay-widgets", listener);
  },
  onOverlayRef: (cb) => {
    const listener = (_e, payload) => cb(payload);
    ipcRenderer.on("overlay-ref", listener);
    return () => ipcRenderer.removeListener("overlay-ref", listener);
  },
});
