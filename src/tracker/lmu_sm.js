/**
 * LMU Native Shared Memory Reader.
 *
 * Le o buffer "LMU_Data" exposto nativamente pelo Le Mans Ultimate (Studio 397).
 * NAO depende de plugin externo — o LMU expoe esse mapeamento direto, sempre que
 * uma sessao esta carregada.
 *
 * Layout de SharedMemoryObjectOut (pack(4) — alinhamento maximo 4):
 *   data.generic     SharedMemoryGeneric        (332 bytes)
 *   data.paths       SharedMemoryPathData       (5 * MAX_PATH = 1300 bytes)
 *   data.scoring     SharedMemoryScoringData    (~127KB com 104 vehs + stream)
 *   data.telemetry   SharedMemoryTelemetryData  (~196KB com 104 TelemInfoV01)
 *
 * Layout completo definido em
 *   <LMU>\Support\SharedMemoryInterface\InternalsPlugin.hpp
 *   <LMU>\Support\SharedMemoryInterface\SharedMemoryInterface.hpp
 *
 * Em vez de mapear cada struct via koffi (so suporta align=1 ou align=natural),
 * lemos por offset com Buffer/DataView. Mais resiliente a campos novos no fim
 * dos structs e mais simples de validar.
 *
 * Sincronia: o LMU expoe um event "LMU_Data_Event" + spinlock em
 * "LMU_SharedMemoryLockData", mas nao usamos. Polling + re-tentativa ja basta
 * pra nosso poll de 250ms — torn read e raro e auto-corrige no proximo ciclo.
 */

const koffi = require("koffi");

const FILE_MAP_READ = 0x0004;

const kernel32 = koffi.load("kernel32.dll");

const OpenFileMappingA = kernel32.func(
  "void* __stdcall OpenFileMappingA(uint32 dwDesiredAccess, int bInheritHandle, const char* lpName)"
);
const MapViewOfFile = kernel32.func(
  "void* __stdcall MapViewOfFile(void* hFileMappingObject, uint32 dwDesiredAccess, uint32 dwFileOffsetHigh, uint32 dwFileOffsetLow, size_t dwNumberOfBytesToMap)"
);
const UnmapViewOfFile = kernel32.func(
  "int __stdcall UnmapViewOfFile(void* lpBaseAddress)"
);
const CloseHandle = kernel32.func("int __stdcall CloseHandle(void* hObject)");
const RtlCopyMemory = kernel32.func(
  "void __stdcall RtlMoveMemory(void* dest, const void* src, size_t length)"
);

// ── Layout offsets (pack 4) ────────────────────────────

const MAX_PATH = 260;
const VEH_COUNT = 104;
const VEH_SCORING_SIZE = 584;
const SCORING_INFO_SIZE = 548;
const TELEM_INFO_SIZE = 1888;
const TELEM_WHEEL_SIZE = 260;

// Topo do SharedMemoryObjectOut:
const GENERIC_SIZE = 332; // events[16]+gameVersion+FFBTorque+ApplicationStateV01
const PATHS_OFFSET = GENERIC_SIZE; // 332
const PATHS_SIZE = MAX_PATH * 5; // 1300
const SCORING_OFFSET = PATHS_OFFSET + PATHS_SIZE; // 1632

// SharedMemoryScoringData (pack default = 8 nesta hpp, NAO pack(4)):
//   ScoringInfoV01 scoringInfo                 (548 bytes, align 4)
//   PADDING 4 bytes                            (size_t precisa align 8)
//   size_t scoringStreamSize                   (8 bytes)
//   VehicleScoringInfoV01 vehScoringInfo[104]  (584 cada, align 4)
//   char scoringStream[65536]
const SCORING_INFO_OFFSET = SCORING_OFFSET; // 1632
const SCORING_STREAM_SIZE_OFFSET = SCORING_INFO_OFFSET + SCORING_INFO_SIZE + 4; // 2184
const VEH_SCORING_OFFSET = SCORING_STREAM_SIZE_OFFSET + 8; // 2192
const SCORING_STREAM_OFFSET =
  VEH_SCORING_OFFSET + VEH_SCORING_SIZE * VEH_COUNT; // 62928
const SCORING_END = SCORING_STREAM_OFFSET + 65536; // 128464

// SharedMemoryTelemetryData (pack default 8):
//   uint8 activeVehicles, playerVehicleIdx, bool playerHasVehicle
//   PADDING ate align 4 pra telemInfo[104]
const TELEMETRY_OFFSET = SCORING_END; // 128464
const TELEM_INFO_BASE_OFFSET = TELEMETRY_OFFSET + 4; // 128468
const LAYOUT_SIZE = TELEM_INFO_BASE_OFFSET + TELEM_INFO_SIZE * VEH_COUNT;

// ── Field offsets dentro dos structs ──────────────────

// ScoringInfoV01 — apenas os campos consumidos pelo tracker.
const SI = {
  mTrackName: 0, // char[64]
  mSession: 64, // long
  mCurrentET: 68, // double (align 4)
  mNumVehicles: 104, // long
  mInRealtime: 115, // bool
};

// VehicleScoringInfoV01 — apenas o que tracker.js le.
const VSI = {
  mID: 0, // long
  mVehicleName: 36, // char[64]
  mTotalLaps: 100, // short
  mLapDist: 104, // double
  mLastSector1: 152, // double
  mLastSector2: 160, // double
  mLastLapTime: 168, // double
  mIsPlayer: 196, // bool
  mPlace: 199, // uchar
  mVehicleClass: 200, // char[32]
  mLapStartET: 256, // double
  mCountLapFlag: 506, // uchar
};

// TelemInfoV01 — apenas o que tracker.js le.
const TI = {
  mID: 0, // long
  mPos: 160, // TelemVect3
  mLocalVel: 184, // TelemVect3
  mGear: 352, // long
  mEngineRPM: 356, // double (align 4)
  mUnfilteredThrottle: 388, // double
  mUnfilteredBrake: 396, // double
  mUnfilteredSteering: 404, // double
  // mUnfilteredClutch 412
  mFilteredThrottle: 420, // double — apos TC/rev limiter
  mFilteredBrake: 428, // double — apos ABS
  mFuel: 524, // double
  mLastImpactET: 552, // double (align 4 apos mDentSeverity[8])
  mFuelCapacity: 608, // double (align 4 apos uchars)
  mWheelArrayBase: 848, // TelemWheelV01[4] apos mExpansion[20]
};

// TelemWheelV01 — so mWear.
const TW = {
  mWear: 152, // double (apos 19 doubles + char[16] = 152)
};

// ── Helpers ────────────────────────────────────────────

const readDouble = (buf, base, off) => buf.readDoubleLE(base + off);
const readLong = (buf, base, off) => buf.readInt32LE(base + off);
const readShort = (buf, base, off) => buf.readInt16LE(base + off);
const readUInt8 = (buf, base, off) => buf.readUInt8(base + off);
const readBool = (buf, base, off) => buf.readUInt8(base + off) !== 0;
function readCStr(buf, base, off, maxLen) {
  let end = base + off;
  const stop = end + maxLen;
  while (end < stop && buf[end] !== 0) end++;
  return buf.toString("utf8", base + off, end);
}
const readVect3 = (buf, base, off) => ({
  x: buf.readDoubleLE(base + off),
  y: buf.readDoubleLE(base + off + 8),
  z: buf.readDoubleLE(base + off + 16),
});

// ── Buffer abstracao ───────────────────────────────────

function open() {
  const handle = OpenFileMappingA(FILE_MAP_READ, 0, "LMU_Data");
  if (!handle) return null;
  const view = MapViewOfFile(handle, FILE_MAP_READ, 0, 0, LAYOUT_SIZE);
  if (!view) {
    CloseHandle(handle);
    return null;
  }
  return { handle, view, buf: Buffer.alloc(LAYOUT_SIZE) };
}

function close(h) {
  if (!h) return;
  UnmapViewOfFile(h.view);
  CloseHandle(h.handle);
}

// ── Decoders ───────────────────────────────────────────

function decodeScoringInfo(buf) {
  const base = SCORING_INFO_OFFSET;
  return {
    mTrackName: readCStr(buf, base, SI.mTrackName, 64),
    mSession: readLong(buf, base, SI.mSession),
    mCurrentET: readDouble(buf, base, SI.mCurrentET),
    mNumVehicles: readLong(buf, base, SI.mNumVehicles),
    mInRealtime: readBool(buf, base, SI.mInRealtime),
  };
}

function decodeVehicleScoring(buf, idx) {
  const base = VEH_SCORING_OFFSET + VEH_SCORING_SIZE * idx;
  return {
    mID: readLong(buf, base, VSI.mID),
    mVehicleName: readCStr(buf, base, VSI.mVehicleName, 64),
    mTotalLaps: readShort(buf, base, VSI.mTotalLaps),
    mLapDist: readDouble(buf, base, VSI.mLapDist),
    mLastSector1: readDouble(buf, base, VSI.mLastSector1),
    mLastSector2: readDouble(buf, base, VSI.mLastSector2),
    mLastLapTime: readDouble(buf, base, VSI.mLastLapTime),
    mIsPlayer: readBool(buf, base, VSI.mIsPlayer),
    mPlace: readUInt8(buf, base, VSI.mPlace),
    mVehicleClass: readCStr(buf, base, VSI.mVehicleClass, 32),
    mLapStartET: readDouble(buf, base, VSI.mLapStartET),
    mCountLapFlag: readUInt8(buf, base, VSI.mCountLapFlag),
  };
}

// Conta quantos veiculos da MESMA classe do player estao a frente (mPlace
// menor). Retorna posicao 1-based dentro da classe. Necessario porque
// mPlace e overall (todas as classes juntas) e em multiclass isso da
// numeros enganosos pro driver.
function computeClassPlace(buf, numVehicles, playerClass, playerPlace) {
  if (!playerClass) return playerPlace;
  let aheadInClass = 0;
  for (let i = 0; i < numVehicles; i++) {
    const base = VEH_SCORING_OFFSET + VEH_SCORING_SIZE * i;
    const cls = readCStr(buf, base, VSI.mVehicleClass, 32);
    if (cls !== playerClass) continue;
    const place = readUInt8(buf, base, VSI.mPlace);
    if (place > 0 && place < playerPlace) aheadInClass++;
  }
  return aheadInClass + 1;
}

function decodeTelemInfo(buf, idx) {
  const base = TELEM_INFO_BASE_OFFSET + TELEM_INFO_SIZE * idx;
  const wheelBase = base + TI.mWheelArrayBase;
  const mWheels = [
    { mWear: buf.readDoubleLE(wheelBase + 0 * TELEM_WHEEL_SIZE + TW.mWear) },
    { mWear: buf.readDoubleLE(wheelBase + 1 * TELEM_WHEEL_SIZE + TW.mWear) },
    { mWear: buf.readDoubleLE(wheelBase + 2 * TELEM_WHEEL_SIZE + TW.mWear) },
    { mWear: buf.readDoubleLE(wheelBase + 3 * TELEM_WHEEL_SIZE + TW.mWear) },
  ];
  return {
    mID: readLong(buf, base, TI.mID),
    mPos: readVect3(buf, base, TI.mPos),
    mLocalVel: readVect3(buf, base, TI.mLocalVel),
    mGear: readLong(buf, base, TI.mGear),
    mEngineRPM: readDouble(buf, base, TI.mEngineRPM),
    mUnfilteredThrottle: readDouble(buf, base, TI.mUnfilteredThrottle),
    mUnfilteredBrake: readDouble(buf, base, TI.mUnfilteredBrake),
    mUnfilteredSteering: readDouble(buf, base, TI.mUnfilteredSteering),
    mFilteredThrottle: readDouble(buf, base, TI.mFilteredThrottle),
    mFilteredBrake: readDouble(buf, base, TI.mFilteredBrake),
    mFuel: readDouble(buf, base, TI.mFuel),
    mFuelCapacity: readDouble(buf, base, TI.mFuelCapacity),
    mLastImpactET: readDouble(buf, base, TI.mLastImpactET),
    mWheels,
  };
}

function findPlayerIdx(buf, numVehicles) {
  for (let i = 0; i < numVehicles; i++) {
    const base = VEH_SCORING_OFFSET + VEH_SCORING_SIZE * i;
    if (readBool(buf, base, VSI.mIsPlayer)) return i;
  }
  return -1;
}

function findTelemIdxById(buf, mID, activeVehicles) {
  for (let i = 0; i < activeVehicles; i++) {
    const base = TELEM_INFO_BASE_OFFSET + TELEM_INFO_SIZE * i;
    if (readLong(buf, base, TI.mID) === mID) return i;
  }
  return -1;
}

// ── API ────────────────────────────────────────────────

// Tira um snapshot completo do LMU_Data e decodifica scoring + player + telemetry.
// Retorna null se nao houver mapeamento ou dados validos. Estrutura:
//   { scoring, player, telemetry }
// onde player/telemetry podem ser null se nao houver veiculo do jogador.
function readSnapshot(h) {
  if (!h) return null;
  RtlCopyMemory(h.buf, h.view, LAYOUT_SIZE);
  const buf = h.buf;
  const scoring = decodeScoringInfo(buf);
  if (
    !scoring.mTrackName ||
    scoring.mNumVehicles <= 0 ||
    scoring.mNumVehicles > VEH_COUNT
  ) {
    return { scoring, player: null, telemetry: null };
  }
  const playerIdx = findPlayerIdx(buf, scoring.mNumVehicles);
  if (playerIdx < 0) return { scoring, player: null, telemetry: null };
  const player = decodeVehicleScoring(buf, playerIdx);

  // Header da telemetry: activeVehicles + playerVehicleIdx (geralmente bate
  // direto com o slot do player). Se nao bater por mID, escaneia.
  const activeVehicles = readUInt8(buf, TELEMETRY_OFFSET, 0);
  const hintedIdx = readUInt8(buf, TELEMETRY_OFFSET, 1);
  let telemetry = null;
  if (hintedIdx < activeVehicles && hintedIdx < VEH_COUNT) {
    const candidate = decodeTelemInfo(buf, hintedIdx);
    if (candidate.mID === player.mID) telemetry = candidate;
  }
  if (!telemetry) {
    const idx = findTelemIdxById(buf, player.mID, activeVehicles);
    if (idx >= 0) telemetry = decodeTelemInfo(buf, idx);
  }
  return { scoring, player, telemetry };
}

// Snapshot fresco so pra calcular posicao na classe. Chamado pelo tracker
// no momento de salvar uma volta — uma vez por volta, nao a cada frame.
// Faz seu proprio RtlCopyMemory pra nao depender do estado do readSnapshot.
function readClassPlace(h, playerClass, playerPlace) {
  if (!h || !playerClass) return playerPlace ?? null;
  RtlCopyMemory(h.buf, h.view, LAYOUT_SIZE);
  const buf = h.buf;
  const numVehicles = readLong(buf, SCORING_INFO_OFFSET, SI.mNumVehicles);
  if (numVehicles <= 0 || numVehicles > VEH_COUNT) return playerPlace ?? null;
  return computeClassPlace(buf, numVehicles, playerClass, playerPlace);
}

module.exports = { open, close, readSnapshot, readClassPlace, LAYOUT_SIZE };
