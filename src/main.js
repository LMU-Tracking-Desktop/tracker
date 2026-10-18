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
  shell,
} = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { execFile } = require("node:child_process");
const { pathToFileURL } = require("node:url");
const { startTracker } = require("./tracker/tracker.js");
const { createPrisma } = require("./db/client.js");
const { runMigrations } = require("./db/migrate.js");
const overlay = require("./overlay/overlay.js");
const updater = require("./updater.js");
const { analyzeCorners } = require("./analysis/coach.js");

if (require("electron-squirrel-startup")) {
  app.quit();
}

// Impede multiplas instancias: se ja tem uma rodando, foca a janela existente
// e mata esta. Sem isso, dois cliques no atalho da area de trabalho abrem o
// app duas vezes (e o tracker tenta ler a shared memory em paralelo).
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      if (!mainWindow.isVisible()) mainWindow.show();
      mainWindow.focus();
    }
  });
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
let lmuConnected = false;

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

// Log tambem vai pra %APPDATA%\lmu-desktop\logs\tracker.log, pra usuario
// conseguir mandar o arquivo quando algo der errado (o buffer em memoria
// some ao fechar o app). Rotaciona em 5MB mantendo 1 arquivo antigo.
const LOG_FILE_MAX_BYTES = 5 * 1024 * 1024;
let logFilePath = null;
let logFileBytes = 0;

function getLogFilePath() {
  if (logFilePath) return logFilePath;
  try {
    const dir = path.join(app.getPath("userData"), "logs");
    fs.mkdirSync(dir, { recursive: true });
    logFilePath = path.join(dir, "tracker.log");
    logFileBytes = fs.existsSync(logFilePath) ? fs.statSync(logFilePath).size : 0;
  } catch {
    logFilePath = null;
  }
  return logFilePath;
}

function writeLogFile(line) {
  const file = getLogFilePath();
  if (!file) return;
  try {
    if (logFileBytes > LOG_FILE_MAX_BYTES) {
      fs.renameSync(file, `${file}.1`);
      logFileBytes = 0;
    }
    const stamped = `${new Date().toISOString()} ${line}\n`;
    fs.appendFileSync(file, stamped);
    logFileBytes += Buffer.byteLength(stamped);
  } catch {
    // disco cheio / sem permissao: segue so com o buffer em memoria
  }
}

ipcMain.handle("logs.openFolder", async () => {
  const file = getLogFilePath();
  if (!file) return false;
  shell.showItemInFolder(file);
  return true;
});

function pushLog(line) {
  writeLogFile(line);
  logBuffer.push(line);
  if (logBuffer.length > LOG_BUFFER_MAX) logBuffer.shift();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("tracker-log", line);
  }
}

ipcMain.handle("tracker-log-buffer", () => [...logBuffer]);

ipcMain.handle("lmu.status", () => ({ connected: lmuConnected }));

function setLmuStatus(connected) {
  if (lmuConnected === connected) return;
  lmuConnected = connected;
  pushLog(`[STATUS] LMU ${connected ? "conectado" : "desconectado"}`);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("lmu-status", { connected });
  }
}

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

// Classes de carro que ja correram numa pista, ordenadas da mais recente
// pra mais antiga. Usado pelos seletores de classe nas telas de analise.
ipcMain.handle("tracks.classes", async (_e, trackId) => {
  if (!prisma || !trackId) return [];
  try {
    const sessions = await prisma.session.findMany({
      where: { trackId },
      select: { carClass: true },
      orderBy: { startedAt: "desc" },
    });
    const seen = new Set();
    const out = [];
    for (const s of sessions) {
      const c = s.carClass;
      if (c && !seen.has(c)) {
        seen.add(c);
        out.push(c);
      }
    }
    return out;
  } catch (e) {
    pushLog(`[IPC ERRO] tracks.classes: ${e.message}`);
    return [];
  }
});

// Resumo por pista pra tela /pistas — uma linha por pista com agregados.
// Para evitar N+1, puxa sessions + laps uma vez e agrega em memoria. Como
// e um app pessoal com ate ~30 pistas e poucos milhares de voltas, e
// barato.
ipcMain.handle("tracks.summary", async () => {
  if (!prisma) return [];
  try {
    const [tracks, sessions, laps] = await Promise.all([
      prisma.track.findMany(),
      prisma.session.findMany({
        select: { id: true, trackId: true, type: true, startedAt: true },
      }),
      prisma.lap.findMany({
        select: {
          sessionId: true,
          lapNumber: true,
          lapTime: true,
          isValid: true,
          position: true,
        },
      }),
    ]);

    const sessionsByTrack = new Map();
    const sessionTypeById = new Map();
    for (const s of sessions) {
      if (!sessionsByTrack.has(s.trackId)) sessionsByTrack.set(s.trackId, []);
      sessionsByTrack.get(s.trackId).push(s);
      sessionTypeById.set(s.id, s.type);
    }
    const lapsBySessionId = new Map();
    for (const l of laps) {
      if (!lapsBySessionId.has(l.sessionId))
        lapsBySessionId.set(l.sessionId, []);
      lapsBySessionId.get(l.sessionId).push(l);
    }

    const out = tracks.map((t) => {
      const ts = sessionsByTrack.get(t.id) || [];
      let totalLaps = 0;
      let bestLap = null;
      let bestPosition = null;
      let lastDriven = null;
      const finalPositions = [];

      for (const s of ts) {
        if (!lastDriven || s.startedAt > lastDriven) lastDriven = s.startedAt;
        const sl = lapsBySessionId.get(s.id) || [];
        totalLaps += sl.length;
        const isRace = s.type === "race";
        let raceFinalPos = null;
        let raceFinalLap = -1;
        for (const l of sl) {
          if (l.isValid && (bestLap == null || l.lapTime < bestLap))
            bestLap = l.lapTime;
          if (isRace && l.position != null) {
            if (bestPosition == null || l.position < bestPosition)
              bestPosition = l.position;
            if (l.lapNumber > raceFinalLap) {
              raceFinalLap = l.lapNumber;
              raceFinalPos = l.position;
            }
          }
        }
        if (raceFinalPos != null) finalPositions.push(raceFinalPos);
      }

      const avgPosition =
        finalPositions.length > 0
          ? finalPositions.reduce((a, b) => a + b, 0) / finalPositions.length
          : null;

      return {
        id: t.id,
        name: t.name,
        imageUrl: t.imageUrl,
        sessions: ts.length,
        totalLaps,
        bestLap,
        bestPosition,
        avgPosition,
        racesCount: finalPositions.length,
        lastDriven: lastDriven ? lastDriven.toISOString() : null,
      };
    });

    return out;
  } catch (e) {
    pushLog(`[IPC ERRO] tracks.summary: ${e.message}`);
    return [];
  }
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
    carClass: filter.carClass ?? undefined,
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

  // Posicao final por sessao: posicao da volta de maior lapNumber que tenha
  // position != null. So existe em corrida/qualy.
  const sessionIds = sessions.map((s) => s.id);
  const posLaps =
    sessionIds.length > 0
      ? await prisma.lap.findMany({
          where: { sessionId: { in: sessionIds }, position: { not: null } },
          select: { sessionId: true, lapNumber: true, position: true },
          orderBy: { lapNumber: "desc" },
        })
      : [];
  const finalPosBySession = new Map();
  for (const l of posLaps) {
    if (!finalPosBySession.has(l.sessionId))
      finalPosBySession.set(l.sessionId, l.position);
  }

  // Computa best/avg e remove o array gigante de laps do payload
  const sessionsWithStats = sessions.map((s) => {
    const times = s.laps.map((l) => l.lapTime);
    const bestLap = times.length > 0 ? Math.min(...times) : null;
    const avgLap =
      times.length > 0
        ? times.reduce((a, b) => a + b, 0) / times.length
        : null;
    const { laps, ...rest } = s;
    return {
      ...rest,
      bestLap,
      avgLap,
      finalPosition: finalPosBySession.get(s.id) ?? null,
    };
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

// Metadata de uma volta isolada (sem carregar a sessao inteira). Aceita id
// normal de Lap ou id prefixado "imp:" de ImportedLap. Usado pela tela de
// analise global, que escolhe voltas de qualquer sessao/pista.
ipcMain.handle("laps.meta", async (_e, lapId) => {
  if (!prisma || !lapId) return null;
  try {
    if (typeof lapId === "string" && lapId.startsWith("imp:")) {
      const imp = await prisma.importedLap.findUnique({
        where: { id: lapId.slice(4) },
      });
      if (!imp) return null;
      return {
        id: lapId,
        kind: "import",
        lapNumber: imp.lapNumber,
        lapTime: imp.lapTime,
        isValid: imp.isValid !== false,
        sector1: imp.sector1,
        sector2: imp.sector2,
        sector3: imp.sector3,
        hasTouch: !!imp.hasTouch,
        hasTelemetry: imp.telemetryJson != null,
        trackName: imp.trackName,
        carClass: imp.carClass,
        car: imp.car,
        type: imp.type,
        owner: imp.ownerName,
        sessionId: null,
      };
    }
    const lap = await prisma.lap.findUnique({
      where: { id: lapId },
      select: {
        id: true,
        lapNumber: true,
        lapTime: true,
        isValid: true,
        sector1: true,
        sector2: true,
        sector3: true,
        hasTouch: true,
        telemetryJson: true,
        sessionId: true,
        session: {
          select: {
            type: true,
            car: true,
            carClass: true,
            startedAt: true,
            trackId: true,
            track: { select: { name: true } },
          },
        },
      },
    });
    if (!lap) return null;
    return {
      id: lap.id,
      kind: "session",
      lapNumber: lap.lapNumber,
      lapTime: lap.lapTime,
      isValid: lap.isValid,
      sector1: lap.sector1,
      sector2: lap.sector2,
      sector3: lap.sector3,
      hasTouch: !!lap.hasTouch,
      hasTelemetry: lap.telemetryJson != null,
      trackId: lap.session?.trackId ?? null,
      trackName: lap.session?.track?.name ?? null,
      carClass: lap.session?.carClass ?? null,
      car: lap.session?.car ?? null,
      type: lap.session?.type ?? null,
      sessionId: lap.sessionId,
      startedAt: lap.session?.startedAt ?? null,
    };
  } catch (e) {
    pushLog(`[IPC ERRO] laps.meta: ${e.message}`);
    return null;
  }
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

// Melhor S1/S2/S3 e melhor volta total na pista+classe, considerando TODAS as
// sessoes (inclusive a atual). Usado pra montar a "volta ideal teorica" no
// dashboard da sessao.
//
// Filtros aplicados (em ordem):
// 1. Soma dos setores ~= lapTime (tolerancia 1.5s) — corta voltas com setores
//    parciais/corrompidos.
// 2. lapTime da volta <= 1.15 * melhor lapTime consistente — uma volta que
//    levou muito mais tempo que seu PB nao e representativa, mesmo que tenha
//    setores "internamente consistentes" (ex: out-lap, spin recovery, formation
//    lap onde o S3 saiu normal mas S1+S2 inflaram).
// 3. Cada setor >= 0.75 * mediana daquele setor — pega outliers extremos.
ipcMain.handle(
  "tracks.bestSectors",
  async (_e, { trackId, carClass } = {}) => {
    if (!prisma || !trackId) return null;
    const sessionFilter = {
      trackId,
      ...(carClass ? { carClass } : {}),
    };
    const SECTOR_SUM_TOL = 1.5;
    const MAX_LAP_RATIO = 1.15; // volta-fonte <= 115% do melhor lapTime
    const MIN_SECTOR_RATIO = 0.75;
    const MIN_LAPS_FOR_MEDIAN_FILTER = 6;

    const allValid = await prisma.lap.findMany({
      where: {
        isValid: true,
        lapTime: { gt: 0 },
        sector1: { gt: 0 },
        sector2: { gt: 0 },
        sector3: { gt: 0 },
        session: sessionFilter,
      },
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
            type: true,
          },
        },
      },
    });

    // Filtro 1: soma dos setores bate com o lapTime
    const consistent = allValid.filter((l) => {
      const sum = l.sector1 + l.sector2 + l.sector3;
      return Math.abs(sum - l.lapTime) <= SECTOR_SUM_TOL;
    });

    if (consistent.length === 0) {
      return { sector1: null, sector2: null, sector3: null, bestLap: null };
    }

    // Filtro 2: volta-fonte tem que ter lapTime razoavel vs melhor real
    const bestConsistentLapTime = Math.min(
      ...consistent.map((l) => l.lapTime)
    );
    const onPace = consistent.filter(
      (l) => l.lapTime <= bestConsistentLapTime * MAX_LAP_RATIO
    );

    // Filtro 3: cada setor dentro do range razoavel (vs mediana)
    const median = (arr) => {
      if (arr.length === 0) return null;
      const sorted = [...arr].sort((a, b) => a - b);
      return sorted[Math.floor(sorted.length / 2)];
    };
    let filtered = onPace;
    if (onPace.length >= MIN_LAPS_FOR_MEDIAN_FILTER) {
      const medS1 = median(onPace.map((l) => l.sector1));
      const medS2 = median(onPace.map((l) => l.sector2));
      const medS3 = median(onPace.map((l) => l.sector3));
      filtered = onPace.filter(
        (l) =>
          l.sector1 >= medS1 * MIN_SECTOR_RATIO &&
          l.sector2 >= medS2 * MIN_SECTOR_RATIO &&
          l.sector3 >= medS3 * MIN_SECTOR_RATIO
      );
    }

    const minBy = (arr, key) =>
      arr.reduce(
        (best, l) => (best == null || l[key] < best[key] ? l : best),
        null
      );
    const s1 = minBy(filtered, "sector1");
    const s2 = minBy(filtered, "sector2");
    const s3 = minBy(filtered, "sector3");
    const full = minBy(filtered, "lapTime");

    const toRef = (lap, key) =>
      lap
        ? {
            value: lap[key],
            lapId: lap.id,
            lapNumber: lap.lapNumber,
            sessionId: lap.session.id,
            sessionStartedAt: lap.session.startedAt,
            car: lap.session.car,
            type: lap.session.type,
          }
        : null;
    return {
      sector1: toRef(s1, "sector1"),
      sector2: toRef(s2, "sector2"),
      sector3: toRef(s3, "sector3"),
      bestLap: toRef(full, "lapTime"),
    };
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

  // Melhor posicao na pista = minima posicao registrada em qualquer volta de
  // corrida. Posicao media = media das posicoes FINAIS (ultima volta de cada
  // sessao de corrida), nao da posicao a cada volta — uma volta = uma
  // amostra inflaria sessoes longas.
  const raceLapsWithPos = await prisma.lap.findMany({
    where: {
      position: { not: null },
      session: { trackId, type: "race" },
    },
    select: { position: true, lapNumber: true, sessionId: true },
    orderBy: { lapNumber: "desc" },
  });
  let bestPosition = null;
  const finalBySession = new Map();
  for (const l of raceLapsWithPos) {
    if (bestPosition == null || l.position < bestPosition) bestPosition = l.position;
    if (!finalBySession.has(l.sessionId)) finalBySession.set(l.sessionId, l.position);
  }
  const finals = Array.from(finalBySession.values());
  const avgPosition =
    finals.length > 0
      ? finals.reduce((a, b) => a + b, 0) / finals.length
      : null;

  return {
    track,
    stats: {
      bestLap: validLaps[0]?.lapTime ?? null,
      bestLapId: validLaps[0]?.id ?? null,
      totalLaps: aggregate.length,
      sessions: new Set(aggregate.map((l) => l.sessionId)).size,
      bestPosition,
      avgPosition,
      racesCount: finals.length,
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

// ── Auto-update ─────────────────────────────────────────

ipcMain.handle("update.getState", () => updater.getState());
ipcMain.handle("update.check", () => updater.check());
ipcMain.handle("update.install", () => {
  // Sem isso o handler de "close" da mainWindow cancela o fechamento
  // (manda pra tray) e o quitAndInstall nunca completa.
  isQuitting = true;
  return updater.install();
});

function onUpdateState(state) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("update-state", state);
  }
  if (state.status === "downloaded") {
    rebuildTrayMenu();
    if (tray && process.platform === "win32") {
      tray.displayBalloon({
        title: "Atualização pronta",
        content: `Versão ${state.version ?? "nova"} baixada. Reinicie pela tray ou em Settings quando quiser.`,
        iconType: "info",
      });
    }
  }
}

// Auto-start (Windows registry HKCU Run). Fonte de verdade e o estado do
// SO — nao duplicamos no config.json. Em vez de confiar so em
// setLoginItemSettings (que com Squirrel as vezes deixa a entrada "presa"
// ao desativar), tambem lemos/escrevemos o registry diretamente como
// fallback. Passamos --hidden pra app subir direto na tray no boot.
const RUN_KEY = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run";
const RUN_VALUE_NAME = "lmu-desktop";

function runRegQuery() {
  // Le a entrada do app no Run. Retorna a string completa do comando
  // (path + args) ou null se nao existir.
  return new Promise((resolve) => {
    if (process.platform !== "win32") return resolve(null);
    execFile(
      "reg",
      ["query", RUN_KEY, "/v", RUN_VALUE_NAME],
      { windowsHide: true },
      (err, stdout) => {
        if (err) return resolve(null);
        const m = stdout.match(/REG_SZ\s+(.+)/);
        resolve(m ? m[1].trim() : null);
      }
    );
  });
}

function runRegDelete() {
  return new Promise((resolve) => {
    if (process.platform !== "win32") return resolve(false);
    execFile(
      "reg",
      ["delete", RUN_KEY, "/v", RUN_VALUE_NAME, "/f"],
      { windowsHide: true },
      (err) => resolve(!err)
    );
  });
}

ipcMain.handle("app.getAutoStart", async () => {
  try {
    const s = app.getLoginItemSettings();
    // Leitura cruzada: Electron pode reportar false enquanto a entrada
    // do Squirrel ainda existe no registry. Considera ativo se qualquer
    // um detectar.
    const regEntry = await runRegQuery();
    const enabled = !!s.openAtLogin || !!regEntry;
    return { enabled, available: app.isPackaged };
  } catch (e) {
    pushLog(`[AUTOSTART ERRO] get: ${e.message}`);
    return { enabled: false, available: false };
  }
});

ipcMain.handle("app.setAutoStart", async (_e, enabled) => {
  // Em dev (electron-forge start), setLoginItemSettings registraria o
  // electron.exe do node_modules — inutil. So permite em build empacotada.
  if (!app.isPackaged) {
    pushLog(`[AUTOSTART] ignorado (dev mode)`);
    return { enabled: false, available: false };
  }
  try {
    app.setLoginItemSettings({
      openAtLogin: !!enabled,
      args: enabled ? ["--hidden"] : [],
    });
    // Fallback: ao desativar, forca delete da chave no registry. Com
    // Squirrel, setLoginItemSettings(openAtLogin:false) as vezes nao
    // remove a entrada gerenciada pelo Update.exe.
    if (!enabled) {
      const ok = await runRegDelete();
      pushLog(`[AUTOSTART] reg delete: ${ok ? "ok" : "falhou (nao existia?)"}`);
    }
    // Re-le estado real ao final
    const s = app.getLoginItemSettings();
    const regEntry = await runRegQuery();
    const finalEnabled = !!s.openAtLogin || !!regEntry;
    pushLog(
      `[AUTOSTART] ${enabled ? "ativar" : "desativar"} → estado final: ${finalEnabled ? "ATIVO" : "INATIVO"} (electron=${s.openAtLogin}, reg=${!!regEntry})`
    );
    return { enabled: finalEnabled, available: true };
  } catch (e) {
    pushLog(`[AUTOSTART ERRO] set: ${e.message}`);
    return { enabled: false, available: true };
  }
});

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

// Analise de erros: agrega varias voltas da pista em N trechos (bins) por
// distancia. Pra cada trecho devolve delta medio vs referencia, variancia,
// frequencia de ABS/TC e velocidade minima. O renderer so desenha — toda a
// agregacao pesada (parse de N telemetrias) acontece aqui.
ipcMain.handle(
  "errors.analyze",
  async (_e, { trackId, carClass, bins = 80 } = {}) => {
  if (!prisma || !trackId) return null;
  try {
    // Classes disponiveis na pista (pro seletor da tela)
    const classRows = await prisma.session.findMany({
      where: { trackId },
      select: { carClass: true },
      orderBy: { startedAt: "desc" },
    });
    const availableClasses = [];
    const seenCls = new Set();
    for (const r of classRows) {
      if (r.carClass && !seenCls.has(r.carClass)) {
        seenCls.add(r.carClass);
        availableClasses.push(r.carClass);
      }
    }

    const laps = await prisma.lap.findMany({
      where: {
        isValid: true,
        NOT: { telemetryJson: null },
        lapTime: { gt: 0 },
        session: { trackId, ...(carClass ? { carClass } : {}) },
      },
      orderBy: { lapTime: "asc" },
      take: 60,
      select: {
        id: true,
        lapTime: true,
        telemetryJson: true,
        session: {
          select: { carClass: true, track: { select: { name: true } } },
        },
      },
    });
    if (laps.length === 0) {
      return { bins: [], availableClasses, carClass: carClass ?? null, lapCount: 0 };
    }

    const ref = laps[0];
    const refClass = ref.session?.carClass ?? null;
    // So compara voltas da mesma classe do recordista (apples-to-apples).
    // Se carClass foi passado, a query ja filtrou — o filtro abaixo e no-op.
    const pool = laps
      .filter((l) => (l.session?.carClass ?? null) === refClass)
      .slice(0, 40);

    const parse = (l) => {
      try {
        const s = JSON.parse(l.telemetryJson);
        if (!Array.isArray(s) || s.length < 10) return null;
        return s.slice().sort((a, b) => a.d - b.d);
      } catch {
        return null;
      }
    };

    const refSamples = parse(ref);
    if (!refSamples) return null;
    const lapLength = refSamples[refSamples.length - 1].d;
    if (lapLength <= 0) return null;

    const N = Math.max(20, Math.min(160, bins | 0));
    const binSize = lapLength / N;

    const interp = (samples, d, key) => {
      if (d <= samples[0].d) return samples[0][key];
      const last = samples[samples.length - 1];
      if (d >= last.d) return last[key];
      let lo = 0;
      let hi = samples.length - 1;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (samples[mid].d <= d) lo = mid;
        else hi = mid;
      }
      const a = samples[lo];
      const b = samples[hi];
      const span = b.d - a.d || 1;
      return a[key] + ((d - a.d) / span) * (b[key] - a[key]);
    };

    // Referencia: tempo e posicao por trecho
    const refBinTime = new Array(N);
    const binPos = new Array(N);
    const refMinSpeed = new Array(N).fill(Infinity);
    for (let k = 0; k < N; k++) {
      const t0 = interp(refSamples, k * binSize, "t");
      const t1 = interp(refSamples, (k + 1) * binSize, "t");
      refBinTime[k] = t1 - t0;
      binPos[k] = {
        x: interp(refSamples, (k + 0.5) * binSize, "x"),
        z: interp(refSamples, (k + 0.5) * binSize, "z"),
      };
    }
    for (const s of refSamples) {
      const k = Math.min(N - 1, Math.max(0, Math.floor(s.d / binSize)));
      if (s.v != null && s.v < refMinSpeed[k]) refMinSpeed[k] = s.v;
    }

    // Agregacao sobre o pool
    const deltas = Array.from({ length: N }, () => []);
    const absCount = new Array(N).fill(0);
    const tcCount = new Array(N).fill(0);
    const sampleCount = new Array(N).fill(0);
    const minSpeedSum = new Array(N).fill(0);
    const minSpeedN = new Array(N).fill(0);

    for (const lap of pool) {
      const ls = parse(lap);
      if (!ls) continue;
      for (let k = 0; k < N; k++) {
        const t0 = interp(ls, k * binSize, "t");
        const t1 = interp(ls, (k + 1) * binSize, "t");
        if (t0 != null && t1 != null) {
          deltas[k].push(t1 - t0 - refBinTime[k]);
        }
      }
      const lapMin = new Array(N).fill(Infinity);
      for (const s of ls) {
        const k = Math.min(N - 1, Math.max(0, Math.floor(s.d / binSize)));
        sampleCount[k]++;
        if (s.abs) absCount[k]++;
        if (s.tc) tcCount[k]++;
        if (s.v != null && s.v < lapMin[k]) lapMin[k] = s.v;
      }
      for (let k = 0; k < N; k++) {
        if (isFinite(lapMin[k])) {
          minSpeedSum[k] += lapMin[k];
          minSpeedN[k]++;
        }
      }
    }

    const mean = (a) =>
      a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
    const std = (a) => {
      if (a.length < 2) return 0;
      const m = mean(a);
      return Math.sqrt(mean(a.map((x) => (x - m) ** 2)));
    };

    const out = [];
    for (let k = 0; k < N; k++) {
      out.push({
        x: binPos[k].x,
        z: binPos[k].z,
        distFrom: k * binSize,
        distTo: (k + 1) * binSize,
        avgDelta: mean(deltas[k]),
        stdDelta: std(deltas[k]),
        absFreq: sampleCount[k] ? absCount[k] / sampleCount[k] : 0,
        tcFreq: sampleCount[k] ? tcCount[k] / sampleCount[k] : 0,
        minSpeed: minSpeedN[k] ? minSpeedSum[k] / minSpeedN[k] : null,
        refMinSpeed: isFinite(refMinSpeed[k]) ? refMinSpeed[k] : null,
      });
    }

    return {
      bins: out,
      lapCount: pool.length,
      refLapTime: ref.lapTime,
      carClass: refClass,
      trackName: ref.session?.track?.name ?? null,
      availableClasses,
    };
  } catch (e) {
    pushLog(`[IPC ERRO] errors.analyze: ${e.message}`);
    return null;
  }
  }
);

// Coach por curva — ver src/analysis/coach.js. Usa as voltas mais RECENTES
// (habito atual), do mesmo carro: ponto de freada muda de carro pra carro
// mesmo dentro da classe.
ipcMain.handle("coach.analyze", async (_e, { trackId, carClass, car } = {}) => {
  if (!prisma || !trackId) return null;
  try {
    const rows = await prisma.lap.findMany({
      where: {
        isValid: true,
        lapTime: { gt: 0 },
        NOT: { telemetryJson: null },
        session: { trackId },
      },
      orderBy: { createdAt: "desc" },
      select: { session: { select: { car: true, carClass: true } } },
    });
    if (rows.length === 0) {
      return { corners: [], lapCount: 0, availableClasses: [], availableCars: [] };
    }

    // Opcoes de filtro, na ordem do mais recente
    const uniq = (arr) => [...new Set(arr.filter(Boolean))];
    const availableClasses = uniq(rows.map((r) => r.session.carClass));
    const cls = carClass && availableClasses.includes(carClass) ? carClass : availableClasses[0];
    const availableCars = uniq(
      rows.filter((r) => r.session.carClass === cls).map((r) => r.session.car)
    );
    const carName = car && availableCars.includes(car) ? car : availableCars[0];

    const laps = await prisma.lap.findMany({
      where: {
        isValid: true,
        lapTime: { gt: 0 },
        NOT: { telemetryJson: null },
        session: { trackId, carClass: cls, car: carName },
      },
      orderBy: { createdAt: "desc" },
      take: 80,
      select: { id: true, lapTime: true, telemetryJson: true },
    });

    // Mesmo corte de outlier das outras telas (Settings → Outlier threshold)
    const pctCut = lastConfig.outlier_threshold_pct ?? 7;
    const fastest = Math.min(...laps.map((l) => l.lapTime));
    const parsed = [];
    for (const l of laps) {
      if (pctCut > 0 && l.lapTime > fastest * (1 + pctCut / 100)) continue;
      try {
        const s = JSON.parse(l.telemetryJson);
        if (!Array.isArray(s)) continue;
        parsed.push({ id: l.id, lapTime: l.lapTime, samples: s.slice().sort((a, b) => a.d - b.d) });
      } catch {
        // telemetria corrompida: ignora a volta
      }
    }

    const result = analyzeCorners(parsed);
    return {
      ...result,
      carClass: cls,
      car: carName,
      availableClasses,
      availableCars,
    };
  } catch (e) {
    pushLog(`[IPC ERRO] coach.analyze: ${e.message}`);
    return null;
  }
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
  // Auto-start passa --hidden: sobe na tray sem janela visivel.
  // process.argv inclui o exe path no [0], entao verificamos todos.
  const startHidden = process.argv.includes("--hidden");

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    backgroundColor: "#07070a",
    icon: resolveAssetPath("logo.png"),
    show: !startHidden,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
    },
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
    if (!startHidden) mainWindow.webContents.openDevTools({ mode: "detach" });
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
  rebuildTrayMenu();
  tray.on("double-click", () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

function rebuildTrayMenu() {
  if (!tray) return;
  const update = updater.getState();
  const template = [
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
  ];
  if (update.status === "downloaded") {
    template.push({
      label: `Reiniciar e atualizar (v${update.version ?? "?"})`,
      click: () => {
        isQuitting = true;
        updater.install();
      },
    });
  }
  template.push(
    { type: "separator" },
    {
      label: "Sair",
      click: () => {
        isQuitting = true;
        app.quit();
      },
    }
  );
  tray.setContextMenu(Menu.buildFromTemplate(template));
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
  updater.init({ log: pushLog, onState: onUpdateState });

  // Inicializa overlay (cria a janela transparente in-game escondida).
  // Usa mesmo build do renderer via hash route #/overlay.
  overlay.init({
    prisma,
    log: pushLog,
    getConfig: () => lastConfig,
    setConfig: async (partial) => {
      const configPath = path.join(app.getPath("userData"), "config.json");
      const next = { ...lastConfig, ...partial };
      fs.mkdirSync(path.dirname(configPath), { recursive: true });
      fs.writeFileSync(configPath, JSON.stringify(next, null, 2));
      lastConfig = next;
      return next;
    },
    mainWindowEnv: {
      devUrl: typeof MAIN_WINDOW_VITE_DEV_SERVER_URL !== "undefined"
        ? MAIN_WINDOW_VITE_DEV_SERVER_URL
        : null,
      viteName: typeof MAIN_WINDOW_VITE_NAME !== "undefined"
        ? MAIN_WINDOW_VITE_NAME
        : "main_window",
    },
  });

  if (prisma) {
    stopTracker = startTracker({
      cfg,
      prisma,
      log: pushLog,
      onStatus: setLmuStatus,
      onLive: (frame) => overlay.onLive(frame),
      onLapSaved: () => overlay.onLapSaved(),
    });
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
    else if (mainWindow) mainWindow.show();
  });
});

app.on("before-quit", async () => {
  if (stopTracker) stopTracker();
  overlay.shutdown();
  if (prisma) await prisma.$disconnect();
});

app.on("window-all-closed", () => {
  // Nao fecha ao fechar todas as janelas — fica na tray.
  // app.quit() so acontece quando usuario clica "Sair" na tray.
});
