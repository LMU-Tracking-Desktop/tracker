const {
  app,
  BrowserWindow,
  ipcMain,
  Tray,
  Menu,
  dialog,
  nativeImage,
  protocol,
  net,
} = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { pathToFileURL } = require("node:url");
const { startTracker } = require("./tracker/tracker.js");
const { createPrisma } = require("./db/client.js");
const { runMigrations } = require("./db/migrate.js");

if (require("electron-squirrel-startup")) {
  app.quit();
}

// Protocolo custom pra servir arquivos grandes de ./assets (dev) ou
// process.resourcesPath/assets (prod). Deve ser registrado ANTES de app.whenReady.
protocol.registerSchemesAsPrivileged([
  {
    scheme: "lmu-asset",
    privileges: {
      bypassCSP: true,
      supportFetchAPI: true,
      secure: true,
      standard: true,
      stream: true,
    },
  },
]);

// ── Config ──────────────────────────────────────────────

const DEFAULT_CONFIG = {
  username: "Driver",
  poll_interval_ms: 250,
  // % acima da mediana da sessao pra considerar volta como outlier
  // (so aplica em practice/quali — corrida sempre entra nos graficos)
  outlier_threshold_pct: 7,
};

function loadConfig() {
  const configPath = path.join(app.getPath("userData"), "config.json");
  try {
    if (fs.existsSync(configPath)) {
      return {
        ...DEFAULT_CONFIG,
        ...JSON.parse(fs.readFileSync(configPath, "utf-8")),
      };
    }
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify(DEFAULT_CONFIG, null, 2));
    return { ...DEFAULT_CONFIG };
  } catch (e) {
    console.error("[config] erro:", e);
    return { ...DEFAULT_CONFIG };
  }
}

// ── Log buffer + IPC ────────────────────────────────────

const LOG_BUFFER_MAX = 1000;
const logBuffer = [];
let mainWindow = null;
let tray = null;
let isQuitting = false;
let stopTracker = null;
let prisma = null;
let lastConfig = { ...DEFAULT_CONFIG };

function resolveAssetPath(relativePath) {
  const candidates = [
    path.resolve(__dirname, "../../assets", relativePath),
    path.resolve(process.resourcesPath || "", "assets", relativePath),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return candidates[0];
}

function pushLog(line) {
  logBuffer.push(line);
  if (logBuffer.length > LOG_BUFFER_MAX) logBuffer.shift();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("tracker-log", line);
  }
}

ipcMain.handle("tracker-log-buffer", () => [...logBuffer]);

// ── Stats ───────────────────────────────────────────────

ipcMain.handle("tracks.list", async () => {
  if (!prisma) {
    pushLog("[IPC] tracks.list: prisma=null");
    return [];
  }
  try {
    const tracks = await prisma.track.findMany({ orderBy: { name: "asc" } });
    pushLog(`[IPC] tracks.list: ${tracks.length} tracks`);
    return tracks;
  } catch (e) {
    pushLog(`[IPC ERRO] tracks.list: ${e.message}`);
    throw e;
  }
});

ipcMain.handle("cars.list", async () => {
  if (!prisma) return [];
  return prisma.car.findMany({ select: { name: true, imageUrl: true } });
});

ipcMain.handle("home.lastTrack", async () => {
  if (!prisma) return null;
  try {
    const session = await prisma.session.findFirst({
      orderBy: { startedAt: "desc" },
      select: { trackId: true },
    });
    pushLog(`[IPC] home.lastTrack: ${session?.trackId ?? "null"}`);
    return session?.trackId ?? null;
  } catch (e) {
    pushLog(`[IPC ERRO] home.lastTrack: ${e.message}`);
    throw e;
  }
});

ipcMain.handle("sessions.list", async (_e, filter = {}) => {
  if (!prisma) return { sessions: [], total: 0, page: 1, pageSize: 50 };
  const page = Math.max(1, filter.page || 1);
  const pageSize = filter.pageSize || 50;
  const where = {
    trackId: filter.trackId ?? undefined,
    type: filter.type ?? undefined,
  };
  const [sessions, total] = await Promise.all([
    prisma.session.findMany({
      where,
      include: {
        user: true,
        track: true,
        _count: { select: { laps: true } },
        // Tempos das voltas validas pra calcular melhor/media por sessao
        laps: {
          where: { isValid: true, lapTime: { gt: 0 } },
          select: { lapTime: true },
        },
      },
      orderBy: { startedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.session.count({ where }),
  ]);
  // Computa best/avg e remove o array gigante de laps do payload
  const sessionsWithStats = sessions.map((s) => {
    const times = s.laps.map((l) => l.lapTime);
    const bestLap = times.length > 0 ? Math.min(...times) : null;
    const avgLap =
      times.length > 0
        ? times.reduce((a, b) => a + b, 0) / times.length
        : null;
    const { laps, ...rest } = s;
    return { ...rest, bestLap, avgLap };
  });
  return { sessions: sessionsWithStats, total, page, pageSize };
});

ipcMain.handle("sessions.detail", async (_e, sessionId) => {
  if (!prisma || !sessionId) return null;
  // select explicito em vez de omit (evita possivel bug do omit no Prisma 7)
  const [session, laps] = await Promise.all([
    prisma.session.findUnique({
      where: { id: sessionId },
      include: { user: true, track: true },
    }),
    prisma.lap.findMany({
      where: { sessionId },
      orderBy: { lapNumber: "asc" },
      select: {
        id: true,
        sessionId: true,
        lapNumber: true,
        lapTime: true,
        isValid: true,
        sector1: true,
        sector2: true,
        sector3: true,
        fuelUsed: true,
        fuelRemaining: true,
        fuelCapacity: true,
        energyUsed: true,
        tyreWearAvg: true,
        position: true,
        hasTouch: true,
        createdAt: true,
        telemetryJson: true,
      },
    }),
  ]);
  if (!session) return null;
  const car = await prisma.car.findUnique({
    where: { name: session.car },
    select: { imageUrl: true },
  });
  const lapsWithFlag = laps.map((l) => {
    const { telemetryJson, ...rest } = l;
    return { ...rest, hasTelemetry: telemetryJson != null };
  });
  const numbers = lapsWithFlag.map((l) => l.lapNumber).join(",");
  pushLog(
    `[DBG] sessions.detail ${sessionId} → ${lapsWithFlag.length} laps [${numbers}]`
  );
  return { session, laps: lapsWithFlag, car };
});

// Top N voltas validas de OUTRAS sessoes na mesma pista (com telemetria).
// Usado pra popular o dropdown de "COMPARAR COM" com referencia historica.
ipcMain.handle(
  "laps.topByTrack",
  async (_e, { trackId, excludeSessionId, carClass, limit = 5 } = {}) => {
    if (!prisma || !trackId) return [];
    const laps = await prisma.lap.findMany({
      where: {
        isValid: true,
        NOT: { telemetryJson: null },
        session: {
          trackId,
          ...(excludeSessionId ? { NOT: { id: excludeSessionId } } : {}),
          ...(carClass ? { carClass } : {}),
        },
      },
      orderBy: { lapTime: "asc" },
      take: limit,
      select: {
        id: true,
        lapNumber: true,
        lapTime: true,
        sector1: true,
        sector2: true,
        sector3: true,
        createdAt: true,
        session: {
          select: {
            id: true,
            startedAt: true,
            car: true,
            carClass: true,
            type: true,
          },
        },
      },
    });
    return laps;
  }
);

// ── Export/Import de voltas (clipboard) ─────────────────

// Monta o payload JSON completo de uma volta pra copiar.
ipcMain.handle("laps.export", async (_e, lapId) => {
  if (!prisma || !lapId) return null;
  const lap = await prisma.lap.findUnique({
    where: { id: lapId },
    include: { session: { include: { user: true, track: true } } },
  });
  if (!lap) return null;
  let telemetry = null;
  if (lap.telemetryJson) {
    try {
      telemetry = JSON.parse(lap.telemetryJson);
    } catch {}
  }
  return {
    __fmt: "lmu-lap/1",
    owner: lap.session.user.name,
    track: lap.session.track.name,
    car: lap.session.car,
    carClass: lap.session.carClass,
    type: lap.session.type,
    lapNumber: lap.lapNumber,
    lapTime: lap.lapTime,
    isValid: lap.isValid,
    sector1: lap.sector1,
    sector2: lap.sector2,
    sector3: lap.sector3,
    fuelUsed: lap.fuelUsed,
    fuelRemaining: lap.fuelRemaining,
    fuelCapacity: lap.fuelCapacity,
    tyreWearAvg: lap.tyreWearAvg,
    position: lap.position,
    hasTouch: lap.hasTouch ?? false,
    telemetry,
    createdAt: lap.createdAt.toISOString(),
  };
});

// Salva uma volta importada do clipboard no banco.
// Limite: 3 voltas por (pista + classe). Se chegar a 4, descarta a mais lenta.
// Se a nova volta e mais lenta que as 3 ja existentes, rejeita.
ipcMain.handle("imports.create", async (_e, payload) => {
  if (!prisma || !payload) return { ok: false, error: "payload vazio" };
  if (payload.__fmt !== "lmu-lap/1") {
    return { ok: false, error: "formato nao reconhecido" };
  }
  const required = [
    "owner",
    "track",
    "car",
    "carClass",
    "type",
    "lapNumber",
    "lapTime",
  ];
  for (const k of required) {
    if (payload[k] == null) return { ok: false, error: `faltou campo ${k}` };
  }

  const fmtTime = (t) => {
    if (t == null || t <= 0) return "—";
    const m = Math.floor(t / 60);
    const s = (t % 60).toFixed(3).padStart(6, "0");
    return `${m}:${s}`;
  };

  const trackName = String(payload.track);
  const carClass = String(payload.carClass);
  const newTime = Number(payload.lapTime);

  try {
    const existing = await prisma.importedLap.findMany({
      where: { trackName, carClass },
      orderBy: { lapTime: "asc" },
      select: { id: true, lapTime: true, ownerName: true },
    });

    let replacedNote = null;
    if (existing.length >= 3) {
      const slowest = existing[existing.length - 1];
      if (newTime >= slowest.lapTime) {
        return {
          ok: false,
          error: `ja existem 3 voltas mais rapidas pra ${trackName} [${carClass}]. A mais lenta: ${fmtTime(slowest.lapTime)} (${slowest.ownerName})`,
        };
      }
      await prisma.importedLap.delete({ where: { id: slowest.id } });
      replacedNote = `substituiu ${fmtTime(slowest.lapTime)} (${slowest.ownerName})`;
    }

    const row = await prisma.importedLap.create({
      data: {
        ownerName: String(payload.owner),
        trackName,
        car: String(payload.car),
        carClass,
        type: String(payload.type),
        lapNumber: payload.lapNumber | 0,
        lapTime: newTime,
        isValid: !!payload.isValid,
        sector1: payload.sector1 ?? null,
        sector2: payload.sector2 ?? null,
        sector3: payload.sector3 ?? null,
        fuelUsed: Number(payload.fuelUsed ?? 0),
        fuelRemaining: Number(payload.fuelRemaining ?? 0),
        fuelCapacity: Number(payload.fuelCapacity ?? 0),
        tyreWearAvg: payload.tyreWearAvg ?? null,
        position: payload.position ?? null,
        hasTouch: !!payload.hasTouch,
        telemetryJson: payload.telemetry
          ? JSON.stringify(payload.telemetry)
          : null,
        originalCreatedAt: new Date(payload.createdAt || Date.now()),
      },
    });
    return { ok: true, id: row.id, replacedNote };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// Lista voltas importadas aplicaveis a uma pista/classe (pro dropdown de compare).
ipcMain.handle(
  "imports.listForTrack",
  async (_e, { trackName, carClass } = {}) => {
    if (!prisma || !trackName) return [];
    return prisma.importedLap.findMany({
      where: {
        trackName,
        ...(carClass ? { carClass } : {}),
      },
      orderBy: { lapTime: "asc" },
      select: {
        id: true,
        ownerName: true,
        car: true,
        carClass: true,
        type: true,
        lapTime: true,
        lapNumber: true,
        sector1: true,
        sector2: true,
        sector3: true,
        isValid: true,
        importedAt: true,
      },
    });
  }
);

ipcMain.handle("imports.telemetry", async (_e, id) => {
  if (!prisma || !id) return null;
  const row = await prisma.importedLap.findUnique({
    where: { id },
    select: { telemetryJson: true },
  });
  if (!row?.telemetryJson) return null;
  try {
    return JSON.parse(row.telemetryJson);
  } catch {
    return null;
  }
});

ipcMain.handle("imports.delete", async (_e, id) => {
  if (!prisma || !id) return false;
  try {
    await prisma.importedLap.delete({ where: { id } });
    return true;
  } catch {
    return false;
  }
});

ipcMain.handle("laps.telemetry", async (_e, lapId) => {
  if (!prisma || !lapId) return null;
  const lap = await prisma.lap.findUnique({
    where: { id: lapId },
    select: { telemetryJson: true },
  });
  if (!lap?.telemetryJson) return null;
  try {
    return JSON.parse(lap.telemetryJson);
  } catch {
    return null;
  }
});

ipcMain.handle("home.data", async (_e, trackId) => {
  if (!prisma || !trackId) return null;
  const track = await prisma.track.findUnique({ where: { id: trackId } });
  if (!track) return null;

  const validLaps = await prisma.lap.findMany({
    where: { isValid: true, session: { trackId } },
    include: { session: { include: { track: true, user: true } } },
    orderBy: { lapTime: "asc" },
  });

  const byClass = new Map();
  for (const lap of validLaps) {
    const cls = lap.session.carClass || "—";
    if (!byClass.has(cls)) byClass.set(cls, []);
    const arr = byClass.get(cls);
    if (arr.length < 3) arr.push(lap);
  }
  const topByClass = Array.from(byClass.entries()).sort(([a], [b]) =>
    a.localeCompare(b)
  );

  const aggregate = await prisma.lap.findMany({
    where: { session: { trackId } },
    select: { sessionId: true },
  });

  return {
    track,
    stats: {
      bestLap: validLaps[0]?.lapTime ?? null,
      bestLapId: validLaps[0]?.id ?? null,
      totalLaps: aggregate.length,
      sessions: new Set(aggregate.map((l) => l.sessionId)).size,
    },
    topByClass: topByClass.map(([cls, laps]) => ({ carClass: cls, laps })),
  };
});

ipcMain.handle("ui.confirm", async (_e, { title, message, detail }) => {
  const res = await dialog.showMessageBox(mainWindow, {
    type: "warning",
    buttons: ["Cancelar", "Confirmar"],
    defaultId: 1,
    cancelId: 0,
    title: title || "Confirmar",
    message: message || "Tem certeza?",
    detail: detail || "",
  });
  return res.response === 1;
});

ipcMain.handle("config.get", async () => ({ ...lastConfig }));

ipcMain.handle("app.version", async () => app.getVersion());

ipcMain.handle("config.set", async (_e, partial) => {
  const configPath = path.join(app.getPath("userData"), "config.json");
  const next = { ...lastConfig, ...partial };
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(next, null, 2));
  lastConfig = next;
  pushLog(`[CFG] atualizado: ${Object.keys(partial).join(", ")}`);
  return next;
});

ipcMain.handle("sessions.delete", async (_e, id) => {
  if (!prisma || !id) return false;
  try {
    await prisma.session.delete({ where: { id } });
    return true;
  } catch (e) {
    pushLog(`[DB ERRO] sessions.delete: ${e.message}`);
    return false;
  }
});

ipcMain.handle("laps.delete", async (_e, id) => {
  if (!prisma || !id) return false;
  try {
    await prisma.lap.delete({ where: { id } });
    return true;
  } catch (e) {
    pushLog(`[DB ERRO] laps.delete: ${e.message}`);
    return false;
  }
});

ipcMain.handle("filters.options", async (_e, { trackId } = {}) => {
  if (!prisma) return { cars: [], types: [], classes: [] };
  const where = { trackId: trackId ?? undefined };
  const [cars, types, classes] = await Promise.all([
    prisma.session.findMany({
      where,
      distinct: ["car"],
      select: { car: true },
      orderBy: { car: "asc" },
    }),
    prisma.session.findMany({
      where,
      distinct: ["type"],
      select: { type: true },
      orderBy: { type: "asc" },
    }),
    prisma.session.findMany({
      where,
      distinct: ["carClass"],
      select: { carClass: true },
      orderBy: { carClass: "asc" },
    }),
  ]);
  return {
    cars: cars.map((c) => c.car),
    types: types.map((t) => t.type),
    classes: classes.map((c) => c.carClass),
  };
});

ipcMain.handle("listagem.data", async (_e, filter = {}) => {
  if (!prisma) return { laps: [], total: 0 };
  const {
    trackId = null,
    car = null,
    type = null,
    carClass = null,
    day = null,
    sort = "createdAt",
    dir = "desc",
    page = 1,
    pageSize = 50,
  } = filter;

  const sessionFilter = {
    trackId: trackId ?? undefined,
    car: car ?? undefined,
    type: type ?? undefined,
    carClass: carClass ?? undefined,
  };

  let dateFilter = {};
  if (day && /^\d{4}-\d{2}-\d{2}$/.test(day)) {
    const start = new Date(`${day}T00:00:00-03:00`);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    dateFilter = { createdAt: { gte: start, lt: end } };
  }

  // Em sort ASC por campo numerico onde 0 = "sem dado", excluimos zeros/nulls.
  // Sem isso, voltas invalidadas (lapTime=0, sectors=0) apareceriam no topo
  // como se fossem o "menor tempo".
  const numericFieldsWithZeroAsMissing = new Set([
    "lapTime",
    "sector1",
    "sector2",
    "sector3",
    "fuelUsed",
    "tyreWearAvg",
  ]);
  const excludeZerosFilter =
    dir === "asc" && numericFieldsWithZeroAsMissing.has(sort)
      ? { [sort]: { gt: 0 } }
      : {};
  const where = { session: sessionFilter, ...dateFilter, ...excludeZerosFilter };
  const allowedSort = new Set([
    "createdAt",
    "lapTime",
    "sector1",
    "sector2",
    "sector3",
    "fuelUsed",
    "tyreWearAvg",
    "lapNumber",
  ]);
  const orderBy = allowedSort.has(sort)
    ? { [sort]: dir === "asc" ? "asc" : "desc" }
    : { createdAt: "desc" };

  const [laps, total] = await Promise.all([
    prisma.lap.findMany({
      where,
      include: { session: { include: { track: true } } },
      orderBy,
      skip: Math.max(0, (page - 1) * pageSize),
      take: pageSize,
    }),
    prisma.lap.count({ where }),
  ]);
  return { laps, total, page, pageSize };
});

ipcMain.handle("dashboard.data", async (_e, { trackId, windowDays } = {}) => {
  if (!prisma || !trackId) return null;
  const since =
    windowDays != null
      ? new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000)
      : null;
  const whereBase = {
    isValid: true,
    session: { trackId },
    ...(since ? { createdAt: { gte: since } } : {}),
  };
  const laps = await prisma.lap.findMany({
    where: whereBase,
    include: { session: true },
    orderBy: { createdAt: "asc" },
  });
  return { laps };
});

ipcMain.handle("stats.last7days", async () => {
  if (!prisma) return null;
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [sessions, laps, races, bestPosAgg] = await Promise.all([
    prisma.session.count({ where: { startedAt: { gte: since } } }),
    prisma.lap.count({ where: { session: { startedAt: { gte: since } } } }),
    prisma.session.count({
      where: { type: "race", startedAt: { gte: since } },
    }),
    prisma.lap.aggregate({
      _min: { position: true },
      where: {
        position: { not: null },
        session: { type: "race", startedAt: { gte: since } },
      },
    }),
  ]);
  return {
    sessions,
    laps,
    races,
    bestPosition: bestPosAgg._min.position ?? null,
  };
});

// ── Janela ──────────────────────────────────────────────

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    backgroundColor: "#07070a",
    icon: resolveAssetPath("logo.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
    },
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`)
    );
  }

  // Fechar o X esconde a janela (tracker continua rodando).
  // Sair de verdade so pelo menu da tray ou Ctrl+Q.
  mainWindow.on("close", (e) => {
    if (!isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
};

function createTray() {
  const iconPath = resolveAssetPath("logo.png");
  const image = nativeImage.createFromPath(iconPath);
  const trayIcon = image.isEmpty()
    ? nativeImage.createEmpty()
    : image.resize({ width: 16, height: 16 });

  tray = new Tray(trayIcon);
  tray.setToolTip("LMU Lap Tracker");
  const menu = Menu.buildFromTemplate([
    {
      label: "Abrir",
      click: () => {
        if (mainWindow) {
          if (mainWindow.isMinimized()) mainWindow.restore();
          mainWindow.show();
          mainWindow.focus();
        }
      },
    },
    { type: "separator" },
    {
      label: "Sair",
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);
  tray.setContextMenu(menu);
  tray.on("double-click", () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

// ── DB path ─────────────────────────────────────────────

function getDbPath() {
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    return path.resolve(__dirname, "../../prisma/dev.db");
  }
  return path.join(app.getPath("userData"), "data.db");
}

// ── Lifecycle ───────────────────────────────────────────

app.whenReady().then(() => {
  Menu.setApplicationMenu(null); // remove menu bar padrao (File/Edit/View/Window)

  // Handler do protocolo custom lmu-asset:// — serve arquivos de ./assets
  // Em dev: {projectRoot}/assets/. Em prod: {resources}/assets/.
  protocol.handle("lmu-asset", async (request) => {
    try {
      const url = new URL(request.url);
      // Format: "lmu-asset://asset/nome.glb" → ignora hostname, usa pathname
      const rel = decodeURIComponent(url.pathname).replace(/^\/+/, "");
      const base = app.isPackaged
        ? path.join(process.resourcesPath, "assets")
        : path.join(__dirname, "..", "..", "assets");
      const filePath = path.join(base, rel);
      if (!fs.existsSync(filePath)) {
        pushLog(`[lmu-asset] 404 ${rel} (${filePath})`);
        return new Response("Not found", { status: 404 });
      }
      return net.fetch(pathToFileURL(filePath).href);
    } catch (e) {
      pushLog(`[ERRO lmu-asset] ${e.message}`);
      return new Response("Error", { status: 500 });
    }
  });

  const cfg = loadConfig();
  lastConfig = cfg;
  const dbPath = getDbPath();
  try {
    pushLog(`[DB] ${dbPath}`);
    runMigrations(dbPath, pushLog);
    prisma = createPrisma(dbPath);
  } catch (e) {
    pushLog(`[ERRO DB] falha ao abrir banco: ${e.message}`);
  }

  createWindow();
  createTray();

  if (prisma) {
    stopTracker = startTracker({ cfg, prisma, log: pushLog });
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
    else if (mainWindow) mainWindow.show();
  });
});

app.on("before-quit", async () => {
  if (stopTracker) stopTracker();
  if (prisma) await prisma.$disconnect();
});

app.on("window-all-closed", () => {
  // Nao fecha ao fechar todas as janelas — fica na tray.
  // app.quit() so acontece quando usuario clica "Sair" na tray.
});
