/**
 * Overlay manager — janela transparente in-game com widgets configuraveis.
 *
 * Widgets (todos opcionais, on/off + visibilidade por tipo de sessao):
 *   - delta:    delta cumulativo grande (numero +0.234)
 *   - strip:    faixa de micro-setores (binario verde/vermelho + marcador)
 *   - trecho:   delta do ultimo micro-setor (numero pequeno)
 *   - pedals:   barras throttle/brake
 *   - trailing: grafico historico de inputs (com overlay de ref opcional)
 *   - tires:    status dos pneus por mWear (verde→amarelo→vermelho)
 *
 * Visibilidade global:
 *   - editMode forca mostrar
 *   - manuallyClosed forca esconder
 *   - inRealtime liga/desliga automaticamente quando dirigindo
 */

const { BrowserWindow, ipcMain, screen } = require("electron");
const path = require("node:path");

const BUCKETS = 30; // micro-setores por volta. ~167m em pista de 5km

// ── Widget defaults ────────────────────────────────────

const WIDGET_IDS = ["delta", "strip", "trecho", "pedals", "trailing", "tires"];

function defaultWidget(id) {
  const base = {
    enabled: true,
    sessions: { practice: true, qualy: true, race: true },
    scale: 1,
  };
  // Posicoes default em fracoes (0..1) — convertidas pra pixels no primeiro
  // load do renderer, salvas como pixels apos primeiro drag.
  switch (id) {
    case "delta":
      return { ...base, x: 0.5, y: 0.04 };
    case "strip":
      return { ...base, x: 0.5, y: 0.11 };
    case "trecho":
      return { ...base, x: 0.5, y: 0.16 };
    case "pedals":
      return { ...base, x: 0.04, y: 0.72 };
    case "trailing":
      return { ...base, x: 0.5, y: 0.78, showReference: true };
    case "tires":
      return { ...base, x: 0.88, y: 0.72 };
    default:
      return base;
  }
}

function defaultAllWidgets() {
  const out = {};
  for (const id of WIDGET_IDS) out[id] = defaultWidget(id);
  return out;
}

// Merge user config sobre defaults preservando todas as chaves esperadas.
function mergeWidgetConfig(saved) {
  const out = defaultAllWidgets();
  if (!saved) return out;
  for (const id of WIDGET_IDS) {
    const s = saved[id];
    if (!s) continue;
    out[id] = {
      ...out[id],
      ...s,
      sessions: { ...out[id].sessions, ...(s.sessions || {}) },
    };
  }
  return out;
}

// Normaliza sessionType do tracker pros 3 buckets de visibilidade.
function normSession(t) {
  if (t === "race") return "race";
  if (t === "qualifying") return "qualy";
  return "practice"; // testday, warmup, practice
}

// ── Estado ─────────────────────────────────────────────

let overlayWindow = null;
let prisma = null;
let pushLog = (s) => console.log(s);
let getCfg = () => ({});
let setCfg = async () => {};
let mainEnv = { devUrl: null, viteName: null };

const state = {
  // Referencia carregada
  refTrack: null,
  refCarClass: null,
  refLap: null, // { samples: [{d,t,th,br,...}...], lapTime, source }
  refBuckets: null,
  loadingRef: false,

  // Volta atual
  totalLaps: -1,
  bucketEntries: new Array(BUCKETS + 1).fill(null),
  bucketDeltas: new Array(BUCKETS).fill(null),
  lastBucketIdx: -1,
  microDelta: null,

  // Visibilidade
  inRealtime: false,
  editMode: false,
  visible: false,
  manuallyClosed: false,
};

// ── Helpers ────────────────────────────────────────────

function interpFromSamples(samples, d) {
  if (!samples || samples.length === 0) return null;
  if (d <= samples[0].d) return samples[0].t;
  const last = samples[samples.length - 1];
  if (d >= last.d) return last.t;
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
  return a.t + ((d - a.d) / span) * (b.t - a.t);
}

function buildRefBuckets(samples, count) {
  if (!samples || samples.length < 5) return null;
  const lapLength = samples[samples.length - 1].d;
  if (lapLength <= 0) return null;
  const size = lapLength / count;
  const boundaryTimes = new Array(count + 1);
  for (let k = 0; k <= count; k++) {
    boundaryTimes[k] = interpFromSamples(samples, k * size);
  }
  return { count, size, lapLength, boundaryTimes };
}

async function loadRefLap(trackName, carClass) {
  if (!prisma || !trackName || !carClass) return null;

  // So voltas proprias (mesma pista + classe). Ignora importedLap — comparar
  // com volta de outra pessoa nao e o que o usuario quer no overlay live.
  const ownLap = await prisma.lap.findFirst({
    where: {
      isValid: true,
      NOT: { telemetryJson: null },
      session: { track: { name: trackName }, carClass },
    },
    orderBy: { lapTime: "asc" },
    select: {
      lapTime: true,
      telemetryJson: true,
      session: { select: { user: { select: { name: true } } } },
    },
  });

  if (!ownLap) return null;
  let samples;
  try {
    samples = JSON.parse(ownLap.telemetryJson);
  } catch {
    return null;
  }
  if (!Array.isArray(samples) || samples.length < 5) return null;
  samples.sort((a, b) => a.d - b.d);
  return {
    samples,
    lapTime: ownLap.lapTime,
    source: "self",
    owner: ownLap.session?.user?.name || "voce",
  };
}

async function refreshRefIfNeeded(track, carClass) {
  if (!track || !carClass) return;
  if (track === state.refTrack && carClass === state.refCarClass && state.refLap)
    return;
  const changed =
    track !== state.refTrack || carClass !== state.refCarClass;
  state.refTrack = track;
  state.refCarClass = carClass;
  if (changed) {
    // Troca de pista/classe: invalida refLap antiga imediatamente. Sem isso,
    // reloadRef so substitui se a nova for mais rapida que a anterior — o
    // que compara tempos de pistas diferentes e mantem a refLap errada.
    state.refLap = null;
    state.refBuckets = null;
    resetCurrentLap();
    sendRefSamples();
  }
  await reloadRef("track/class change");
}

// Re-query no banco e troca refLap se achar mais rapida. Chamado quando muda
// pista/classe E tambem apos cada volta salva (pra atualizar live quando o
// usuario faz uma volta melhor que a referencia atual).
async function reloadRef(reason) {
  if (state.loadingRef) return;
  if (!state.refTrack || !state.refCarClass) return;
  state.loadingRef = true;
  const requestedTrack = state.refTrack;
  const requestedClass = state.refCarClass;
  pushLog(
    `[OVERLAY] carregando refLap (${requestedTrack} | ${requestedClass})... [${reason}]`
  );
  try {
    const ref = await loadRefLap(requestedTrack, requestedClass);
    // Sessao mudou enquanto o query rodava — descarta resultado
    if (
      requestedTrack !== state.refTrack ||
      requestedClass !== state.refCarClass
    ) {
      return;
    }
    const prevTime = state.refLap?.lapTime ?? Infinity;
    const newTime = ref?.lapTime ?? Infinity;
    // So substitui se a nova e mais rapida (ou se nao tinha referencia antes)
    if (!state.refLap || newTime < prevTime) {
      state.refLap = ref;
      state.refBuckets = ref ? buildRefBuckets(ref.samples, BUCKETS) : null;
      if (ref) {
        const m = Math.floor(ref.lapTime / 60);
        const s = (ref.lapTime % 60).toFixed(3).padStart(6, "0");
        pushLog(
          `[OVERLAY] refLap atualizada: ${m}:${s}, ${ref.samples.length} samples`
        );
        sendRefSamples();
      } else {
        pushLog(`[OVERLAY] sem refLap`);
        sendRefSamples();
      }
    } else {
      pushLog(
        `[OVERLAY] refLap mantida (atual ${prevTime.toFixed(3)}s <= candidata ${newTime.toFixed(3)}s)`
      );
    }
  } catch (e) {
    pushLog(`[OVERLAY ERRO] reloadRef: ${e.message}`);
  } finally {
    state.loadingRef = false;
  }
}

function sendRefSamples() {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  // Envia samples completos (com th, br, d) pra widget Trailing usar como
  // overlay de referencia. Pode ser ~1000 entries × ~30 bytes.
  try {
    overlayWindow.webContents.send("overlay-ref", {
      samples: state.refLap?.samples || null,
      lapTime: state.refLap?.lapTime ?? null,
      source: state.refLap?.source ?? null,
      owner: state.refLap?.owner ?? null,
    });
  } catch {}
}

function resetCurrentLap() {
  state.bucketEntries = new Array(BUCKETS + 1).fill(null);
  state.bucketDeltas = new Array(BUCKETS).fill(null);
  state.lastBucketIdx = -1;
  state.microDelta = null;
}

function processFrame(frame) {
  if (frame.totalLaps !== state.totalLaps) {
    state.totalLaps = frame.totalLaps;
    resetCurrentLap();
  }

  let cumulativeDelta = null;
  let microDelta = state.microDelta;

  if (state.refLap && state.refBuckets) {
    const refT = interpFromSamples(state.refLap.samples, frame.lapDist);
    if (refT != null && frame.lapTime > 0) {
      cumulativeDelta = frame.lapTime - refT;
    }
    const { size, count, boundaryTimes } = state.refBuckets;
    const bucketIdx = Math.min(Math.floor(frame.lapDist / size), count - 1);
    if (bucketIdx > state.lastBucketIdx && frame.lapTime > 0) {
      for (let k = state.lastBucketIdx + 1; k <= bucketIdx; k++) {
        state.bucketEntries[k] = frame.lapTime;
        if (k > 0 && state.bucketEntries[k - 1] != null) {
          const currTime = state.bucketEntries[k] - state.bucketEntries[k - 1];
          const refTime = boundaryTimes[k] - boundaryTimes[k - 1];
          state.bucketDeltas[k - 1] = currTime - refTime;
          microDelta = currTime - refTime;
        }
      }
      state.lastBucketIdx = bucketIdx;
      state.microDelta = microDelta;
    }
  }

  return {
    throttle: frame.throttle,
    brake: frame.brake,
    speed: frame.speed,
    gear: frame.gear,
    lapDist: frame.lapDist,
    lapTime: frame.lapTime,
    inRealtime: frame.inRealtime,
    sessionType: normSession(frame.sessionType),
    tireWear: frame.tireWear || [0, 0, 0, 0],
    absActive: !!frame.absActive,
    tcActive: !!frame.tcActive,
    delta: cumulativeDelta,
    microDelta,
    buckets: state.refBuckets ? state.bucketDeltas.slice() : null,
    bucketCount: BUCKETS,
    bucketProgress:
      state.refBuckets && state.refBuckets.lapLength > 0
        ? Math.min(1, frame.lapDist / state.refBuckets.lapLength)
        : 0,
    hasRef: !!state.refLap,
    refLapTime: state.refLap?.lapTime ?? null,
  };
}

// ── Janela ─────────────────────────────────────────────

// Janela viva = existe, nao destruida, e webContents nao morreu (renderer
// crash deixa o BrowserWindow vivo mas o conteudo morto — sem este check
// applyVisibility/setEdit silenciosamente nao fazem nada).
function isWindowAlive() {
  if (!overlayWindow || overlayWindow.isDestroyed()) return false;
  const wc = overlayWindow.webContents;
  if (!wc || wc.isDestroyed?.() || wc.isCrashed?.()) return false;
  return true;
}

// Recria a janela se nao estiver viva. Chamar antes de qualquer operacao
// que precise mostrar/ativar o overlay.
function ensureOverlayWindow() {
  if (isWindowAlive()) return overlayWindow;
  if (overlayWindow) {
    try { overlayWindow.destroy(); } catch {}
    overlayWindow = null;
    state.visible = false;
  }
  return createOverlayWindow();
}

function applyVisibility() {
  const shouldShow =
    !state.manuallyClosed && (state.editMode || state.inRealtime);
  if (shouldShow) {
    ensureOverlayWindow();
    if (!isWindowAlive()) return;
    if (!state.visible) {
      overlayWindow.showInactive();
      state.visible = true;
    }
  } else {
    if (!isWindowAlive()) return;
    if (state.visible) {
      overlayWindow.hide();
      state.visible = false;
    }
  }
}

function applyClickThrough() {
  if (!isWindowAlive()) return;
  if (state.editMode) {
    overlayWindow.setIgnoreMouseEvents(false);
  } else {
    overlayWindow.setIgnoreMouseEvents(true, { forward: true });
  }
}

function createOverlayWindow() {
  if (overlayWindow && !overlayWindow.isDestroyed()) return overlayWindow;

  const display = screen.getPrimaryDisplay();
  const { x, y, width, height } = display.bounds;

  overlayWindow = new BrowserWindow({
    x,
    y,
    width,
    height,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    hasShadow: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    focusable: false,
    show: false,
    alwaysOnTop: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
    },
  });
  overlayWindow.setAlwaysOnTop(true, "screen-saver");
  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  if (mainEnv.devUrl) {
    overlayWindow.loadURL(mainEnv.devUrl + "#/overlay");
  } else {
    overlayWindow.loadFile(
      path.join(__dirname, "..", "renderer", mainEnv.viteName, "index.html"),
      { hash: "/overlay" }
    );
  }

  // Quando renderer terminar de carregar, manda refSamples atual (se ja tem).
  overlayWindow.webContents.once("did-finish-load", () => {
    if (state.refLap) sendRefSamples();
  });

  overlayWindow.on("closed", () => {
    overlayWindow = null;
    state.visible = false;
  });

  // Renderer crash (GPU/JS): a janela continua tecnicamente viva mas o
  // conteudo morre. Sem este handler, a referencia fica zombie e o usuario
  // nao consegue mais ligar o overlay sem reiniciar o app.
  overlayWindow.webContents.on("render-process-gone", (_e, details) => {
    pushLog(
      `[OVERLAY] renderer morto (${details?.reason || "?"}). Recriando janela.`
    );
    try { overlayWindow?.destroy(); } catch {}
    overlayWindow = null;
    state.visible = false;
    // So recria se algo deveria estar mostrando. Senao espera proximo evento.
    if (!state.manuallyClosed && (state.editMode || state.inRealtime)) {
      ensureOverlayWindow();
      applyVisibility();
    }
  });

  applyClickThrough();
  return overlayWindow;
}

// ── API publica ────────────────────────────────────────

function onLive(frame) {
  const active = frame.inRealtime === true;
  if (active !== state.inRealtime) {
    state.inRealtime = active;
    applyVisibility();
  }
  // Sem partida ativa (saiu do jogo ou da sessao): so atualiza visibilidade
  // e sai. Nao processa frame, nao toca refLap.
  if (!active) return;
  refreshRefIfNeeded(frame.track, frame.carClass);

  const payload = processFrame(frame);
  if (!overlayWindow || overlayWindow.isDestroyed() || !state.visible) return;
  try {
    overlayWindow.webContents.send("overlay-tick", payload);
  } catch {}
}

function getWidgets() {
  const cfg = getCfg() || {};
  return mergeWidgetConfig(cfg.overlay?.widgets);
}

async function setWidget(id, partial) {
  if (!WIDGET_IDS.includes(id)) return null;
  const cfg = getCfg() || {};
  const current = mergeWidgetConfig(cfg.overlay?.widgets);
  const next = {
    ...current,
    [id]: {
      ...current[id],
      ...partial,
      sessions: {
        ...current[id].sessions,
        ...(partial.sessions || {}),
      },
    },
  };
  const overlay = { ...(cfg.overlay || {}), widgets: next };
  await setCfg({ overlay });
  // Notifica renderer pra reaplicar
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    try {
      overlayWindow.webContents.send("overlay-widgets", next);
    } catch {}
  }
  return next[id];
}

function setEditMode(bool) {
  state.editMode = !!bool;
  // Garante janela viva ANTES de aplicar — se renderer crashou, o usuario
  // clicando em "configurar" tem que recuperar o overlay.
  if (state.editMode) ensureOverlayWindow();
  applyClickThrough();
  applyVisibility();
  if (isWindowAlive()) {
    try {
      overlayWindow.webContents.send("overlay-mode", { edit: state.editMode });
    } catch {}
  }
}

function setManuallyClosed(bool) {
  state.manuallyClosed = !!bool;
  if (state.manuallyClosed) state.editMode = false;
  applyClickThrough();
  applyVisibility();
}

function init({ prisma: p, log, getConfig, setConfig, mainWindowEnv }) {
  prisma = p;
  pushLog = log || pushLog;
  getCfg = getConfig || getCfg;
  setCfg = setConfig || setCfg;
  mainEnv = mainWindowEnv || mainEnv;

  ipcMain.handle("overlay.getWidgets", () => getWidgets());
  ipcMain.handle("overlay.setWidget", (_e, { id, partial }) =>
    setWidget(id, partial)
  );
  ipcMain.handle("overlay.setEdit", (_e, b) => {
    setEditMode(b);
    return state.editMode;
  });
  ipcMain.handle("overlay.setEnabled", (_e, enabled) => {
    setManuallyClosed(!enabled);
    if (enabled) ensureOverlayWindow();
    return !state.manuallyClosed;
  });
  ipcMain.handle("overlay.getState", () => ({
    enabled: !state.manuallyClosed,
    edit: state.editMode,
    visible: state.visible,
    hasRef: !!state.refLap,
    refLapTime: state.refLap?.lapTime ?? null,
    refSource: state.refLap?.source ?? null,
    refOwner: state.refLap?.owner ?? null,
  }));

  createOverlayWindow();
}

function shutdown() {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.destroy();
  }
  overlayWindow = null;
}

// Chamado pelo tracker apos saveLap. Re-query no banco — se a volta recem
// salva for mais rapida que a referencia atual, atualiza ao vivo.
function onLapSaved() {
  // Pequeno delay pra dar tempo do prisma efetivar o write
  setTimeout(() => reloadRef("lap saved"), 200);
}

module.exports = { init, onLive, onLapSaved, shutdown, WIDGET_IDS };
