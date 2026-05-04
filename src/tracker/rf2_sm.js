/**
 * rF2 / LMU Shared Memory Reader
 *
 * Lê os buffers $rFactor2SMMP_Scoring$ e $rFactor2SMMP_Telemetry$ via
 * OpenFileMappingA + MapViewOfFile (Win32). Custo pro jogo: ~zero.
 *
 * Layout dos arquivos mapeados:
 *   [0..7]  rF2MappedBufferVersionBlock (2x uint32: begin, end)
 *   [8..]   struct de dados (rF2Scoring ou rF2Telemetry)
 *
 * Protocolo de leitura consistente:
 *   1. Lê versionBegin
 *   2. Copia o struct
 *   3. Lê versionEnd
 *   4. Se begin == end, leitura válida; senão, retry
 */

const koffi = require("koffi");

// ── Tipos básicos ────────────────────────────────────────

const rF2Vec3 = koffi.pack("rF2Vec3", {
  x: "double",
  y: "double",
  z: "double",
});

// MSVC: bool = 1 byte, long = 4 bytes. Usamos int8/int32 pra ser explícito.

const rF2Wheel = koffi.pack("rF2Wheel", {
  mSuspensionDeflection: "double",
  mRideHeight: "double",
  mSuspForce: "double",
  mBrakeTemp: "double",
  mBrakePressure: "double",
  mRotation: "double",
  mLateralPatchVel: "double",
  mLongitudinalPatchVel: "double",
  mLateralGroundVel: "double",
  mLongitudinalGroundVel: "double",
  mCamber: "double",
  mLateralForce: "double",
  mLongitudinalForce: "double",
  mTireLoad: "double",
  mGripFract: "double",
  mPressure: "double",
  mTemperature: koffi.array("double", 3),
  mWear: "double",
  mTerrainName: koffi.array("char", 16, "String"),
  mSurfaceType: "uint8",
  mFlat: "int8",
  mDetached: "int8",
  mStaticUndeflectedRadius: "uint8",
  mVerticalTireDeflection: "double",
  mWheelYLocation: "double",
  mToe: "double",
  mTireCarcassTemperature: "double",
  mTireInnerLayerTemperature: koffi.array("double", 3),
  mExpansion: koffi.array("uint8", 24),
});

// ── rF2VehicleScoring ────────────────────────────────────

const rF2VehicleScoring = koffi.pack("rF2VehicleScoring", {
  mID: "int32",
  mDriverName: koffi.array("char", 32, "String"),
  mVehicleName: koffi.array("char", 64, "String"),
  mTotalLaps: "int16",
  mSector: "int8",
  mFinishStatus: "int8",
  mLapDist: "double",
  mPathLateral: "double",
  mTrackEdge: "double",
  mBestSector1: "double",
  mBestSector2: "double",
  mBestLapTime: "double",
  mLastSector1: "double",
  mLastSector2: "double",
  mLastLapTime: "double",
  mCurSector1: "double",
  mCurSector2: "double",
  mNumPitstops: "int16",
  mNumPenalties: "int16",
  mIsPlayer: "int8",
  mControl: "int8",
  mInPits: "int8",
  mPlace: "uint8",
  mVehicleClass: koffi.array("char", 32, "String"),
  mTimeBehindNext: "double",
  mLapsBehindNext: "int32",
  mTimeBehindLeader: "double",
  mLapsBehindLeader: "int32",
  mLapStartET: "double",
  mPos: rF2Vec3,
  mLocalVel: rF2Vec3,
  mLocalAccel: rF2Vec3,
  mOri: koffi.array(rF2Vec3, 3),
  mLocalRot: rF2Vec3,
  mLocalRotAccel: rF2Vec3,
  mHeadlights: "uint8",
  mPitState: "uint8",
  mServerScored: "uint8",
  mIndividualPhase: "uint8",
  mQualification: "int32",
  mTimeIntoLap: "double",
  mEstimatedLapTime: "double",
  mPitGroup: koffi.array("char", 24, "String"),
  mFlag: "uint8",
  mUnderYellow: "int8",
  mCountLapFlag: "uint8",
  mInGarageStall: "int8",
  mUpgradePack: koffi.array("uint8", 16),
  mPitLapDist: "float",
  mBestLapSector1: "float",
  mBestLapSector2: "float",
  mExpansion: koffi.array("uint8", 48),
});

// ── rF2ScoringInfo ───────────────────────────────────────

const rF2ScoringInfo = koffi.pack("rF2ScoringInfo", {
  mTrackName: koffi.array("char", 64, "String"),
  mSession: "int32",
  mCurrentET: "double",
  mEndET: "double",
  mMaxLaps: "int32",
  mLapDist: "double",
  pointer1: koffi.array("uint8", 8),
  mNumVehicles: "int32",
  mGamePhase: "uint8",
  mYellowFlagState: "int8",
  mSectorFlag: koffi.array("int8", 3),
  mStartLight: "uint8",
  mNumRedLights: "uint8",
  mInRealtime: "int8",
  mPlayerName: koffi.array("char", 32, "String"),
  mPlrFileName: koffi.array("char", 64, "String"),
  mDarkCloud: "double",
  mRaining: "double",
  mAmbientTemp: "double",
  mTrackTemp: "double",
  mWind: rF2Vec3,
  mMinPathWetness: "double",
  mMaxPathWetness: "double",
  mGameMode: "uint8",
  mIsPasswordProtected: "int8",
  mServerPort: "uint16",
  mServerPublicIP: "uint32",
  mMaxPlayers: "int32",
  mServerName: koffi.array("char", 32, "String"),
  mStartET: "float",
  mAvgPathWetness: "double",
  mExpansion: koffi.array("uint8", 200),
  pointer2: koffi.array("uint8", 8),
});

// ── rF2Scoring (arquivo completo menos version block) ────

const rF2Scoring = koffi.pack("rF2Scoring", {
  mBytesUpdatedHint: "int32",
  mScoringInfo: rF2ScoringInfo,
  mVehicles: koffi.array(rF2VehicleScoring, 128),
});

// ── rF2VehicleTelemetry ──────────────────────────────────

const rF2VehicleTelemetry = koffi.pack("rF2VehicleTelemetry", {
  mID: "int32",
  mDeltaTime: "double",
  mElapsedTime: "double",
  mLapNumber: "int32",
  mLapStartET: "double",
  mVehicleName: koffi.array("char", 64, "String"),
  mTrackName: koffi.array("char", 64, "String"),
  mPos: rF2Vec3,
  mLocalVel: rF2Vec3,
  mLocalAccel: rF2Vec3,
  mOri: koffi.array(rF2Vec3, 3),
  mLocalRot: rF2Vec3,
  mLocalRotAccel: rF2Vec3,
  mGear: "int32",
  mEngineRPM: "double",
  mEngineWaterTemp: "double",
  mEngineOilTemp: "double",
  mClutchRPM: "double",
  mUnfilteredThrottle: "double",
  mUnfilteredBrake: "double",
  mUnfilteredSteering: "double",
  mUnfilteredClutch: "double",
  mFilteredThrottle: "double",
  mFilteredBrake: "double",
  mFilteredSteering: "double",
  mFilteredClutch: "double",
  mSteeringShaftTorque: "double",
  mFront3rdDeflection: "double",
  mRear3rdDeflection: "double",
  mFrontWingHeight: "double",
  mFrontRideHeight: "double",
  mRearRideHeight: "double",
  mDrag: "double",
  mFrontDownforce: "double",
  mRearDownforce: "double",
  mFuel: "double",
  mEngineMaxRPM: "double",
  mScheduledStops: "uint8",
  mOverheating: "int8",
  mDetached: "int8",
  mHeadlights: "int8",
  mDentSeverity: koffi.array("uint8", 8),
  mLastImpactET: "double",
  mLastImpactMagnitude: "double",
  mLastImpactPos: rF2Vec3,
  mEngineTorque: "double",
  mCurrentSector: "int32",
  mSpeedLimiter: "uint8",
  mMaxGears: "uint8",
  mFrontTireCompoundIndex: "uint8",
  mRearTireCompoundIndex: "uint8",
  mFuelCapacity: "double",
  mFrontFlapActivated: "uint8",
  mRearFlapActivated: "uint8",
  mRearFlapLegalStatus: "uint8",
  mIgnitionStarter: "uint8",
  mFrontTireCompoundName: koffi.array("char", 18, "String"),
  mRearTireCompoundName: koffi.array("char", 18, "String"),
  mSpeedLimiterAvailable: "uint8",
  mAntiStallActivated: "uint8",
  mUnused: koffi.array("uint8", 2),
  mVisualSteeringWheelRange: "float",
  mRearBrakeBias: "double",
  mTurboBoostPressure: "double",
  mPhysicsToGraphicsOffset: koffi.array("float", 3),
  mPhysicalSteeringWheelRange: "float",
  mBatteryChargeFraction: "double",
  mElectricBoostMotorTorque: "double",
  mElectricBoostMotorRPM: "double",
  mElectricBoostMotorTemperature: "double",
  mElectricBoostWaterTemperature: "double",
  mElectricBoostMotorState: "uint8",
  mExpansion: koffi.array("uint8", 111),
  mWheels: koffi.array(rF2Wheel, 4),
});

const rF2Telemetry = koffi.pack("rF2Telemetry", {
  mBytesUpdatedHint: "int32",
  mNumVehicles: "int32",
  mVehicles: koffi.array(rF2VehicleTelemetry, 128),
});

const rF2MappedBufferVersionBlock = koffi.pack(
  "rF2MappedBufferVersionBlock",
  {
    mVersionUpdateBegin: "uint32",
    mVersionUpdateEnd: "uint32",
  }
);

// ── Win32 ────────────────────────────────────────────────

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

const FILE_MAP_READ = 0x0004;
const VERSION_BLOCK_SIZE = 8;

// ── Buffer abstração ─────────────────────────────────────

function openBuffer(name, dataType) {
  const totalSize = VERSION_BLOCK_SIZE + koffi.sizeof(dataType);
  const handle = OpenFileMappingA(FILE_MAP_READ, 0, name);
  if (!handle) return null;
  const view = MapViewOfFile(handle, FILE_MAP_READ, 0, 0, totalSize);
  if (!view) {
    CloseHandle(handle);
    return null;
  }
  return { handle, view, dataType, name };
}

function closeBuffer(buf) {
  if (!buf) return;
  UnmapViewOfFile(buf.view);
  CloseHandle(buf.handle);
}

function readBuffer(buf) {
  if (!buf) return null;
  for (let attempt = 0; attempt < 20; attempt++) {
    const vBegin = koffi.decode(buf.view, rF2MappedBufferVersionBlock)
      .mVersionUpdateBegin;
    if (vBegin === 0) return null; // plugin ainda nao inicializou
    const data = koffi.decode(buf.view, VERSION_BLOCK_SIZE, buf.dataType);
    const vEnd = koffi.decode(buf.view, rF2MappedBufferVersionBlock)
      .mVersionUpdateEnd;
    if (vBegin === vEnd) return data;
  }
  return null;
}

// ── API pública ──────────────────────────────────────────

function openScoring() {
  return openBuffer("$rFactor2SMMP_Scoring$", rF2Scoring);
}
function openTelemetry() {
  return openBuffer("$rFactor2SMMP_Telemetry$", rF2Telemetry);
}

module.exports = {
  openScoring,
  openTelemetry,
  readBuffer,
  closeBuffer,
};
