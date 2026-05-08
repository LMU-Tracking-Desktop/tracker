/**
 * Script de validacao rapida: abre LMU_Data, le snapshot e imprime campos
 * pra confirmar que os offsets estao certos. Requer LMU rodando + sessao ativa.
 *
 * Uso: node scripts/test-lmu-sm.js
 */
const sm = require("../src/tracker/lmu_sm.js");

const h = sm.open();
if (!h) {
  console.error("[ERRO] Nao consegui abrir LMU_Data. LMU esta rodando e em sessao?");
  process.exit(1);
}

console.log("Layout size:", sm.LAYOUT_SIZE);

const snap = sm.readSnapshot(h);
if (!snap) {
  console.error("[ERRO] readSnapshot retornou null");
  sm.close(h);
  process.exit(1);
}

console.log("\n=== ScoringInfo ===");
console.log(snap.scoring);

console.log("\n=== Player VehicleScoring ===");
console.log(snap.player);

console.log("\n=== Player Telemetry (subset) ===");
if (snap.telemetry) {
  const t = snap.telemetry;
  console.log({
    mID: t.mID,
    mLapNumber: t.mLapNumber,
    mLapStartET: t.mLapStartET,
    mGear: t.mGear,
    mEngineRPM: t.mEngineRPM,
    mUnfilteredThrottle: t.mUnfilteredThrottle,
    mUnfilteredBrake: t.mUnfilteredBrake,
    mUnfilteredSteering: t.mUnfilteredSteering,
    mFuel: t.mFuel,
    mFuelCapacity: t.mFuelCapacity,
    mLastImpactET: t.mLastImpactET,
    mPos: t.mPos,
    mLocalVel: t.mLocalVel,
    mWheels: t.mWheels,
  });
} else {
  console.log("(no player telemetry)");
}

sm.close(h);
