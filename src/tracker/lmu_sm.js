/**
 * LMU Native Shared Memory Reader.
 *
 * Le o buffer "LMU_Data" exposto nativamente pelo Le Mans Ultimate (Studio 397).
 * NAO depende de plugin externo — o LMU expoe esse mapeamento direto, sempre que
 * uma sessao esta carregada.
 *
 * Layout: SharedMemoryLayout { SharedMemoryObjectOut data }
 *   data.generic     SharedMemoryGeneric (332 bytes)
 *   data.paths       SharedMemoryPathData (1300 bytes)
 *   data.scoring     SharedMemoryScoringData (~127KB com array de 104 veiculos + stream)
 *   data.telemetry   SharedMemoryTelemetryData (~196KB com 104 TelemInfoV01)
 *
 * Os structs originais (ScoringInfoV01, VehicleScoringInfoV01, TelemInfoV01,
 * TelemWheelV01) estao em #pragma pack(push, 4) — alinhamento maximo 4 bytes.
 * Em vez de mapear via koffi (que so suporta align=1 packed ou align=natural),
 * lemos os campos por offset usando Buffer/DataView. Mais confiavel e
 * tolerante a mudancas de layout em campos que nao usamos.
 *
 * Sincronia: LMU oferece um event "LMU_Data_Event" + um spinlock em
 * "LMU_SharedMemoryLockData". Pra MVP, lemos sem lock e re-tentamos quando
 * detectamos torn read (mCurrentET muda durante a copia). Se tornarmos isso
 * insuficiente, da pra implementar o lock via InterlockedCompareExchange.
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

// ── Layout offsets (computados a partir de InternalsPlugin.hpp pack(4)) ──

const MAX_PATH = 260;
const SME_MAX = 16;
const TELEM_VECT3_SIZE = 24; // 3 * double
const TELEM_WHEEL_SIZE = 260;
const TELEM_INFO_SIZE = 1888;
const VEH_SCORING_SIZE = 584;
const SCORING_INFO_SIZE = 548;

// SharedMemoryGeneric:
//   events[16] uint32  → 0..64
//   gameVersion long   → 64..68
//   FFBTorque  float   → 68..72
//   appInfo    ApplicationStateV01 (260 bytes) → 72..332
const GENERIC_SIZE = 332;
const PATHS_OFFSET = GENERIC_SIZE; // 332
const PATHS_SIZE = MAX_PATH * 5; // 1300

// SharedMemoryScoringData
const SCORING_OFFSET = PATHS_OFFSET + PATHS_SIZE; // 1632
const SCORING_INFO_OFFSET = SCORING_OFFSET; // 1632
const SCORING_STREAM_SIZE_OFFSET = SCORING_INFO_OFFSET + SCORING_INFO_SIZE; // 2180
const VEH_SCORING_OFFSET = SCORING_STREAM_SIZE_OFFSET + 8; // 2188 (size_t = 8)
const VEH_SCORING_COUNT = 104;
const SCORING_STREAM_OFFSET =
  VEH_SCORING_OFFSET + VEH_SCORING_SIZE * VEH_SCORING_COUNT; // 62924
const SCORING_STREAM_SIZE = 65536;
const SCORING_END = SCORING_STREAM_OFFSET + SCORING_STREAM_SIZE; // 128460

// SharedMemoryTelemetryData
const TELEMETRY_OFFSET = SCORING_END; // 128460
//   activeVehicles    uint8   → +0
//   playerVehicleIdx  uint8   → +1
//   playerHasVehicle  bool    → +2
//   (padding pra alinhar telemInfo[0] em 4) → +3 → +4
const TELEM_INFO_BASE_OFFSET = TELEMETRY_OFFSET + 4;
const LAYOUT_SIZE =
  TELEM_INFO_BASE_OFFSET + TELEM_INFO_SIZE * VEH_SCORING_COUNT;

// ── ScoringInfoV01 field offsets (relativos a SCORING_INFO_OFFSET) ──

const SI = {
  mTrackName: 0, // char[64]
  mSession: 64, // long
  mCurrentET: 68, // double
  mEndET: 76, // double
  mMaxLaps: 84, // long
  mLapDist: 88, // double
  mResultsStream: 96, // ptr (8 bytes)
  mNumVehicles: 104, // long
  mGamePhase: 108, // uchar
  mYellowFlagState: 109, // signed char
  mSectorFlag: 110, // signed char[3]
  mStartLight: 113, // uchar
  mNumRedLights: 114, // uchar
  mInRealtime: 115, // bool
  mPlayerName: 116, // char[32]
  mPlrFileName: 148, // char[64]
  mDarkCloud: 212, // double
  mRaining: 220, // double
  mAmbientTemp: 228, // double
  mTrackTemp: 236, // double
  mWind: 244, // TelemVect3 (24)
  mMinPathWetness: 268, // double
  mMaxPathWetness: 276, // double
  mGameMode: 284, // uchar
  mIsPasswordProtected: 285, // bool
  mServerPort: 286, // ushort
  mServerPublicIP: 288, // ulong
  mMaxPlayers: 292, // long
  mServerName: 296, // char[32]
  mStartET: 328, // float
  mAvgPathWetness: 332, // double
  mSessionTimeRemaining: 340, // float
  mTimeOfDay: 344, // float
  mIsFixedSetup: 348, // bool
  mTrackGripLevel: 349, // uint8
  mCloudCoverage: 350, // uint8
  mTrackLimitsStepsPerPenalty: 351, // uint8
  mTrackLimitsStepsPerPoint: 352, // uint8
  // mExpansion[187] 353
  mVehiclePtr: 540, // ptr (8 bytes)
};

// ── VehicleScoringInfoV01 field offsets ──

const VSI = {
  mID: 0, // long
  mDriverName: 4, // char[32]
  mVehicleName: 36, // char[64]
  mTotalLaps: 100, // short
  mSector: 102, // signed char
  mFinishStatus: 103, // signed char
  mLapDist: 104, // double
  mPathLateral: 112, // double
  mTrackEdge: 120, // double
  mBestSector1: 128, // double
  mBestSector2: 136, // double
  mBestLapTime: 144, // double
  mLastSector1: 152, // double
  mLastSector2: 160, // double
  mLastLapTime: 168, // double
  mCurSector1: 176, // double
  mCurSector2: 184, // double
  mNumPitstops: 192, // short
  mNumPenalties: 194, // short
  mIsPlayer: 196, // bool
  mControl: 197, // signed char
  mInPits: 198, // bool
  mPlace: 199, // uchar
  mVehicleClass: 200, // char[32]
  mTimeBehindNext: 232, // double
  mLapsBehindNext: 240, // long
  mTimeBehindLeader: 244, // double
  mLapsBehindLeader: 252, // long
  mLapStartET: 256, // double
  mPos: 264, // TelemVect3 (24)
  mLocalVel: 288, // TelemVect3
  mLocalAccel: 312, // TelemVect3
  mOri: 336, // TelemVect3[3] (72)
  mLocalRot: 408, // TelemVect3
  mLocalRotAccel: 432, // TelemVect3
  mHeadlights: 456, // uchar
  mPitState: 457, // uchar
  mServerScored: 458, // uchar
  mIndividualPhase: 459, // uchar
  mQualification: 460, // long
  mTimeIntoLap: 464, // double
  mEstimatedLapTime: 472, // double
  mPitGroup: 480, // char[24]
  mFlag: 504, // uchar
  mUnderYellow: 505, // bool
  mCountLapFlag: 506, // uchar
  mInGarageStall: 507, // bool
  mUpgradePack: 508, // uchar[16]
  mPitLapDist: 524, // float
  mBestLapSector1: 528, // float
  mBestLapSector2: 532, // float
  mSteamID: 536, // ulonglong
  mVehFilename: 544, // char[32]
  mAttackMode: 576, // short
  mFuelFraction: 578, // uchar
  mDRSState: 579, // bool
  // mExpansion[4] 580
};

// ── TelemInfoV01 field offsets (so o que usamos) ──

const TI = {
  mID: 0,
  mDeltaTime: 4,
  mElapsedTime: 12,
  mLapNumber: 20,
  mLapStartET: 24,
  mVehicleName: 32, // char[64]
  mTrackName: 96, // char[64]
  mPos: 160, // TelemVect3
  mLocalVel: 184, // TelemVect3
  mLocalAccel: 208,
  mOri: 232,
  mLocalRot: 304,
  mLocalRotAccel: 328,
  mGear: 352,
  mEngineRPM: 356, // double @ align 4
  mEngineWaterTemp: 364,
  mEngineOilTemp: 372,
  mClutchRPM: 380,
  mUnfilteredThrottle: 388,
  mUnfilteredBrake: 396,
  mUnfilteredSteering: 404,
  mUnfilteredClutch: 412,
  mFilteredThrottle: 420,
  mFilteredBrake: 428,
  mFilteredSteering: 436,
  mFilteredClutch: 444,
  mFuel: 524, // double
  mEngineMaxRPM: 532, // double
  mFuelCapacity: 608, // double @ align 4
  mLastImpactET: 552, // double
  // mWheel[4] inicia apos mExpansion[20] que termina em 848.
  mWheelArrayBase: 848,
};

const TW = {
  mWear: 152, // double
};

// ── Helpers de leitura ─────────────────────────────────

function readDouble(buf, base, off) {
  return buf.readDoubleLE(base + off);
}
function readFloat(buf, base, off) {
  return buf.readFloatLE(base + off);
}
function readLong(buf, base, off) {
  return buf.readInt32LE(base + off);
}
function readShort(buf, base, off) {
  return buf.readInt16LE(base + off);
}
function readUInt8(buf, base, off) {
  return buf.readUInt8(base + off);
}
function readBool(buf, base, off) {
  return buf.readUInt8(base + off) !== 0;
}
function readCStr(buf, base, off, len) {
  let end = base + off;
  const stop = end + len;
  while (end < stop && buf[end] !== 0) end++;
  return buf.toString("utf8", base + off, end);
}
function readVect3(buf, base, off) {
  return {
    x: buf.readDoubleLE(base + off + 0),
    y: buf.readDoubleLE(base + off + 8),
    z: buf.readDoubleLE(base + off + 16),
  };
}

// ── Buffer abstracao ───────────────────────────────────

function open() {
  const handle = OpenFileMappingA(FILE_MAP_READ, 0, "LMU_Data");
  if (!handle) return null;
  const view = MapViewOfFile(handle, FILE_MAP_READ, 0, 0, LAYOUT_SIZE);
  if (!view) {
    CloseHandle(handle);
    return null;
  }
  // Buffer reusavel pra evitar alocar 324KB por leitura
  const buf = Buffer.alloc(LAYOUT_SIZE);
  return { handle, view, buf };
}

function close(h) {
  if (!h) return;
  UnmapViewOfFile(h.view);
  CloseHandle(h.handle);
}

// Copia LAYOUT_SIZE bytes do mapeamento pro Buffer de uso. Usa RtlMoveMemory
// (memmove). Trade-off: nao temos protecao de torn read aqui, mas a frequencia
// de update do LMU e baixa em escala humana e re-leituras sao baratas.
function snapshot(h) {
  if (!h) return null;
  RtlCopyMemory(h.buf, h.view, LAYOUT_SIZE);
  return h.buf;
}

// ── Decoders ───────────────────────────────────────────

function decodeScoringInfo(buf) {
  const base = SCORING_INFO_OFFSET;
  return {
    mTrackName: readCStr(buf, base, SI.mTrackName, 64),
    mSession: readLong(buf, base, SI.mSession),
    mCurrentET: readDouble(buf, base, SI.mCurrentET),
    mNumVehicles: readLong(buf, base, SI.mNumVehicles),
    mGamePhase: readUInt8(buf, base, SI.mGamePhase),
    mInRealtime: readBool(buf, base, SI.mInRealtime),
    mPlayerName: readCStr(buf, base, SI.mPlayerName, 32),
  };
}

function decodeVehicleScoring(buf, idx) {
  const base = VEH_SCORING_OFFSET + VEH_SCORING_SIZE * idx;
  return {
    mID: readLong(buf, base, VSI.mID),
    mDriverName: readCStr(buf, base, VSI.mDriverName, 32),
    mVehicleName: readCStr(buf, base, VSI.mVehicleName, 64),
    mTotalLaps: readShort(buf, base, VSI.mTotalLaps),
    mLapDist: readDouble(buf, base, VSI.mLapDist),
    mBestSector1: readDouble(buf, base, VSI.mBestSector1),
    mBestSector2: readDouble(buf, base, VSI.mBestSector2),
    mBestLapTime: readDouble(buf, base, VSI.mBestLapTime),
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

function decodeTelemInfo(buf, idx) {
  const base = TELEM_INFO_BASE_OFFSET + TELEM_INFO_SIZE * idx;
  const wheelBase = base + TI.mWheelArrayBase;
  const wheels = [];
  for (let i = 0; i < 4; i++) {
    const wb = wheelBase + TELEM_WHEEL_SIZE * i;
    wheels.push({ mWear: buf.readDoubleLE(wb + TW.mWear) });
  }
  return {
    mID: readLong(buf, base, TI.mID),
    mLapNumber: readLong(buf, base, TI.mLapNumber),
    mLapStartET: readDouble(buf, base, TI.mLapStartET),
    mPos: readVect3(buf, base, TI.mPos),
    mLocalVel: readVect3(buf, base, TI.mLocalVel),
    mGear: readLong(buf, base, TI.mGear),
    mEngineRPM: readDouble(buf, base, TI.mEngineRPM),
    mUnfilteredThrottle: readDouble(buf, base, TI.mUnfilteredThrottle),
    mUnfilteredBrake: readDouble(buf, base, TI.mUnfilteredBrake),
    mUnfilteredSteering: readDouble(buf, base, TI.mUnfilteredSteering),
    mFuel: readDouble(buf, base, TI.mFuel),
    mFuelCapacity: readDouble(buf, base, TI.mFuelCapacity),
    mLastImpactET: readDouble(buf, base, TI.mLastImpactET),
    mWheels: wheels,
  };
}

function findPlayerVehicleIdx(buf, numVehicles) {
  for (let i = 0; i < numVehicles; i++) {
    const base = VEH_SCORING_OFFSET + VEH_SCORING_SIZE * i;
    if (readBool(buf, base, VSI.mIsPlayer)) return i;
  }
  return -1;
}

function findTelemIdxById(buf, mID, numActive) {
  for (let i = 0; i < numActive; i++) {
    const base = TELEM_INFO_BASE_OFFSET + TELEM_INFO_SIZE * i;
    if (readLong(buf, base, TI.mID) === mID) return i;
  }
  return -1;
}

function decodeTelemetryHeader(buf) {
  return {
    activeVehicles: readUInt8(buf, TELEMETRY_OFFSET, 0),
    playerVehicleIdx: readUInt8(buf, TELEMETRY_OFFSET, 1),
    playerHasVehicle: readBool(buf, TELEMETRY_OFFSET, 2),
  };
}

// API de alto nivel: copia o buffer e decodifica scoring + player + telemetry
// numa unica chamada. Retorna null se ainda nao ha dados (ex: LMU no menu).
function readSnapshot(h) {
  const buf = snapshot(h);
  if (!buf) return null;
  const scoring = decodeScoringInfo(buf);
  if (
    !scoring.mTrackName ||
    scoring.mNumVehicles <= 0 ||
    scoring.mNumVehicles > VEH_SCORING_COUNT
  ) {
    return { scoring, player: null, telemetry: null };
  }
  const playerIdx = findPlayerVehicleIdx(buf, scoring.mNumVehicles);
  if (playerIdx < 0) return { scoring, player: null, telemetry: null };
  const player = decodeVehicleScoring(buf, playerIdx);

  const telemHeader = decodeTelemetryHeader(buf);
  let telemetry = null;
  // Tenta usar playerVehicleIdx do header — se bater por mID, usa direto.
  // Caso contrario, escaneia ate activeVehicles procurando o mID do player.
  const vIdx = telemHeader.playerVehicleIdx;
  if (
    vIdx < telemHeader.activeVehicles &&
    vIdx < VEH_SCORING_COUNT
  ) {
    const candidate = decodeTelemInfo(buf, vIdx);
    if (candidate.mID === player.mID) telemetry = candidate;
  }
  if (!telemetry) {
    const idx = findTelemIdxById(buf, player.mID, telemHeader.activeVehicles);
    if (idx >= 0) telemetry = decodeTelemInfo(buf, idx);
  }
  return { scoring, player, telemetry };
}

module.exports = {
  open,
  close,
  snapshot,
  readSnapshot,
  decodeScoringInfo,
  decodeVehicleScoring,
  decodeTelemInfo,
  findPlayerVehicleIdx,
  findTelemIdxById,
  decodeTelemetryHeader,
  // Pra debug
  LAYOUT_SIZE,
  GENERIC_SIZE,
  SCORING_OFFSET,
  TELEMETRY_OFFSET,
  TELEM_INFO_BASE_OFFSET,
};
