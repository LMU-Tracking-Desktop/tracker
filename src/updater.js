/**
 * Auto-update via Squirrel.Windows + update.electronjs.org.
 *
 * O servico update.electronjs.org le os releases publicos do GitHub e serve
 * o arquivo RELEASES + .nupkg pro autoUpdater nativo do Electron. Basta
 * publicar um release com tag vX.Y.Z contendo Setup.exe, .nupkg e RELEASES
 * (o workflow .github/workflows/release.yml faz isso ao dar push da tag).
 *
 * Fluxo: checa 30s apos abrir e depois a cada hora → baixa em background →
 * avisa a UI/tray. Nunca reinicia sozinho: o app fica na tray durante a
 * corrida, entao o usuario decide quando reiniciar.
 */

const { app, autoUpdater } = require("electron");

const REPO = "LMU-Tracking-Desktop/tracker";
const FIRST_CHECK_DELAY_MS = 30 * 1000;
const CHECK_INTERVAL_MS = 60 * 60 * 1000;

// status: disabled | idle | checking | downloading | downloaded | uptodate | error
let state = { status: "idle", version: null, error: null, checkedAt: null };
let onStateChange = () => {};
let log = () => {};
let started = false;

function setState(partial) {
  state = { ...state, ...partial };
  try {
    onStateChange(state);
  } catch {
    // listener da UI nao pode derrubar o updater
  }
}

function getState() {
  return state;
}

function check() {
  if (!started) return false;
  if (state.status === "checking" || state.status === "downloading") return true;
  if (state.status === "downloaded") return true;
  try {
    autoUpdater.checkForUpdates();
    return true;
  } catch (e) {
    setState({ status: "error", error: e.message });
    return false;
  }
}

function install() {
  if (state.status !== "downloaded") return false;
  log("[UPDATE] reiniciando pra instalar atualizacao");
  autoUpdater.quitAndInstall();
  return true;
}

function init({ log: logFn, onState }) {
  if (logFn) log = logFn;
  if (onState) onStateChange = onState;

  // So funciona em build instalada pelo Squirrel (Windows). Em dev
  // (electron-forge start) o Update.exe nao existe.
  if (!app.isPackaged || process.platform !== "win32") {
    state = { ...state, status: "disabled" };
    return;
  }
  // Na primeira execucao apos instalar, o Squirrel ainda segura um lock
  // no diretorio — checar agora falha. Fica pra proxima abertura.
  if (process.argv.includes("--squirrel-firstrun")) {
    state = { ...state, status: "idle" };
    log("[UPDATE] primeira execucao — checagem adiada pra proxima abertura");
    return;
  }

  const feedUrl = `https://update.electronjs.org/${REPO}/${process.platform}-${process.arch}/${app.getVersion()}`;
  try {
    autoUpdater.setFeedURL({ url: feedUrl });
  } catch (e) {
    log(`[UPDATE ERRO] setFeedURL: ${e.message}`);
    state = { ...state, status: "error", error: e.message };
    return;
  }
  started = true;

  autoUpdater.on("checking-for-update", () => {
    setState({ status: "checking", error: null });
  });
  autoUpdater.on("update-available", () => {
    log("[UPDATE] nova versao disponivel — baixando");
    setState({ status: "downloading" });
  });
  autoUpdater.on("update-not-available", () => {
    setState({ status: "uptodate", checkedAt: Date.now() });
  });
  autoUpdater.on("update-downloaded", (_e, releaseNotes, releaseName) => {
    const version = (releaseName || "").replace(/^v/, "") || null;
    log(`[UPDATE] versao ${version ?? "?"} baixada — pronta pra instalar`);
    setState({
      status: "downloaded",
      version,
      checkedAt: Date.now(),
    });
  });
  autoUpdater.on("error", (err) => {
    log(`[UPDATE ERRO] ${err?.message ?? err}`);
    setState({ status: "error", error: err?.message ?? String(err) });
  });

  setTimeout(check, FIRST_CHECK_DELAY_MS);
  setInterval(check, CHECK_INTERVAL_MS);
}

module.exports = { init, check, install, getState };
