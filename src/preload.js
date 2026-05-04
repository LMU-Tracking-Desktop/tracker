const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  onTrackerLog: (callback) => {
    const listener = (_e, line) => callback(line);
    ipcRenderer.on("tracker-log", listener);
    return () => ipcRenderer.removeListener("tracker-log", listener);
  },
  getLogBuffer: () => ipcRenderer.invoke("tracker-log-buffer"),
  getStats7d: () => ipcRenderer.invoke("stats.last7days"),
  listTracks: () => ipcRenderer.invoke("tracks.list"),
  listCars: () => ipcRenderer.invoke("cars.list"),
  getLastTrack: () => ipcRenderer.invoke("home.lastTrack"),
  getHomeData: (trackId) => ipcRenderer.invoke("home.data", trackId),
  listSessions: (filter) => ipcRenderer.invoke("sessions.list", filter),
  getSessionDetail: (sessionId) =>
    ipcRenderer.invoke("sessions.detail", sessionId),
  getLapTelemetry: (lapId) => ipcRenderer.invoke("laps.telemetry", lapId),
  getTopLapsByTrack: (filter) =>
    ipcRenderer.invoke("laps.topByTrack", filter),
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
});
