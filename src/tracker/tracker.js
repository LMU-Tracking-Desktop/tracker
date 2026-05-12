/**
 * LMU Lap Tracker - versao desktop (Electron).
 * Le shared memory NATIVA do LMU (LMU_Data) e salva voltas direto no SQLite via Prisma.
 *
 * Uso:
 *   const { startTracker } = require("./tracker");
 *   const stop = startTracker({ cfg, prisma, log });  // retorna stop()
 */

const sm = require("./lmu_sm");

// ── Helpers ─────────────────────────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function sessionTypeFromCode(code) {
  if (code === 0) return "testday";
  if (code >= 1 && code <= 4) return "practice";
  if (code >= 5 && code <= 8) return "qualifying";
  if (code === 9) return "warmup";
  if (code >= 10 && code <= 13) return "race";
  return "practice";
}

// ── LMU REST API (one-shot por sessao) ──────────────────

async function fetchVehicleInfo(liveryName) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5000);
    const resp = await fetch(
      "http://localhost:6397/rest/sessions/getAllVehicles",
      { signal: ctrl.signal, headers: { Connection: "close" } }
    );
    clearTimeout(t);
    if (!resp.ok) return null;
    const data = await resp.json();
    const entry = data.find((v) => v.desc === liveryName);
    if (!entry) return null;
    return { manufacturer: entry.manufacturer || null };
  } catch {
    return null;
  }
}

// ── DB operacoes ────────────────────────────────────────

async function ensureUser(prisma, name) {
  return prisma.user.upsert({
    where: { name },
    update: {},
    create: { name },
  });
}

async function createSession(prisma, { username, track, car, carClass, type }) {
  const [user, trackRow] = await Promise.all([
    prisma.user.upsert({
      where: { name: username },
      update: {},
      create: { name: username },
    }),
    prisma.track.upsert({
      where: { name: track },
      update: {},
      create: { name: track },
    }),
  ]);
  return prisma.session.create({
    data: {
      userId: user.id,
      trackId: trackRow.id,
      car,
      carClass,
      type,
    },
  });
}

async function saveLap(prisma, sessionId, lap, log) {
  const fields = {
    lapTime: lap.lapTime,
    isValid: lap.isValid,
    sector1: lap.sector1,
    sector2: lap.sector2,
    sector3: lap.sector3,
    fuelUsed: lap.fuelUsed,
    fuelRemaining: lap.fuelRemaining,
    fuelCapacity: lap.fuelCapacity,
    energyUsed: lap.energyUsed,
    tyreWearAvg: lap.tyreWearAvg,
    position: lap.position,
    hasTouch: lap.hasTouch ?? false,
    telemetryJson: lap.telemetryJson ?? null,
  };
  // CREATE com shift-on-conflict: se (sessionId, lapNumber) ja existe,
  // incrementa o numero ate achar slot livre. Evita sobrescrever voltas
  // antigas quando o tracker nao detectou corretamente uma nova sessao.
  let lapNumber = lap.lapNumber;
  let attempts = 0;
  while (attempts < 200) {
    try {
      return await prisma.lap.create({
        data: { sessionId, lapNumber, ...fields },
      });
    } catch (e) {
      const isUnique =
        e.code === "P2002" ||
        (typeof e.message === "string" && e.message.includes("UNIQUE"));
      if (!isUnique) throw e;
      if (attempts === 0 && log) {
        log(
          `  [WARN] volta ${lap.lapNumber} ja existe nessa sessao — deslocando pra frente`
        );
      }
      lapNumber++;
      attempts++;
    }
  }
  throw new Error("muitas colisoes de lapNumber");
}

// ── Loop principal ──────────────────────────────────────

async function runTracker({
  cfg,
  prisma,
  log,
  shouldStop,
  onStatus,
  onLive,
  onLapSaved,
}) {
  const emitStatus = (connected) => {
    try {
      onStatus?.(connected);
    } catch (e) {
      log(`[STATUS ERRO] ${e.message}`);
    }
  };
  emitStatus(false);
  const pollMs = cfg.poll_interval_ms || 250;

  log("=".repeat(50));
  log("  LMU Lap Tracker (local)");
  log(`  Username: ${cfg.username}`);
  log(`  Storage:  SQLite local`);
  log("=".repeat(50));

  // Garante que o usuario existe no banco
  try {
    await ensureUser(prisma, cfg.username);
    log(`[OK] Usuario: ${cfg.username}`);
  } catch (e) {
    log(`[ERRO DB] ao registrar usuario: ${e.message}`);
    return;
  }

  let smHandle = null;
  let lastTelemetry = null;
  let sessionId = null;
  let lastLapNumber = -1;
  let lastTrack = null;
  let waitingForLmu = true;
  let lastSessionType = null;
  let lastCar = null;
  let lastLapFuel = null;
  let lastImpactETBaseline = 0;
  let lastCurrentET = null; // detecta reset do LMU (crash + reopen)
  // Quando detectamos lap nova sem dados prontos (mLastLapTime ainda 0),
  // nao avancamos lastLapNumber — retentamos. Contador evita loop infinito
  // se dados nunca chegarem (lap genuinamente sem tempo, DNF, etc).
  let pendingLapNumber = -1;
  let pendingRetries = 0;

  // Buffers pro loop de sampling de inputs (throttle/brake/steering/etc)
  let sampleBucketLap = -1;
  let currentSamples = [];
  // Map<lapNumber, samples[]> — preserva amostras por volta ate o main loop
  // consumir. Um slot unico causava clobber quando main loop atrasava save
  // (ex: mLastLapTime com 1 tick de lag → save pulado → lap seguinte sobrescrevia).
  const completedSamplesByLap = new Map();

  // Loop separado coletando amostras de input + emitindo telemetria viva
  // pra overlays in-game. 33ms (~30Hz) — pedais visualmente fluidos sem custo
  // alto. Dois usos: (a) buffer pra salvar com a volta, (b) live broadcast.
  (async () => {
    const SAMPLE_MS = 33;
    const r3 = (n) => Math.round(n * 1000) / 1000;
    const r1 = (n) => Math.round(n * 10) / 10;
    while (!shouldStop()) {
      await sleep(SAMPLE_MS);
      const snap = smHandle ? sm.readSnapshot(smHandle) : null;
      if (!snap || !snap.player || !snap.telemetry) {
        // Sem dados de jogador (jogo fechado, no menu, ou saiu da partida):
        // notifica overlay com frame inativo pra ele esconder. Sem isso,
        // o overlay fica preso visivel com a ultima telemetria na tela.
        if (onLive) {
          try {
            onLive({ inRealtime: false });
          } catch {}
        }
        continue;
      }
      const player = snap.player;
      const playerTelem = snap.telemetry;

      const mTotalLaps = player.mTotalLaps;
      if (mTotalLaps !== sampleBucketLap) {
        // Threshold baixo: salva qualquer lap com pelo menos 3 samples.
        // Antes era 10 — estava perdendo telemetria em laps curtas ou com
        // sampler afetado por tranco do plugin.
        if (sampleBucketLap >= 0 && currentSamples.length >= 3) {
          completedSamplesByLap.set(mTotalLaps, currentSamples);
          log(
            `[SAMPLER] lap ${sampleBucketLap}→${mTotalLaps} : ${currentSamples.length} samples guardados (map=${completedSamplesByLap.size})`
          );
        } else {
          log(
            `[SAMPLER] lap ${sampleBucketLap}→${mTotalLaps} : SEM BUFFER (sampleBucketLap=${sampleBucketLap}, samples=${currentSamples.length})`
          );
        }
        currentSamples = [];
        sampleBucketLap = mTotalLaps;
        // Limpa entradas antigas (>2 laps atrás) que nunca foram consumidas
        for (const k of completedSamplesByLap.keys()) {
          if (k < mTotalLaps - 2) {
            log(`[SAMPLER] descartando lap ${k} (nao consumido)`);
            completedSamplesByLap.delete(k);
          }
        }
      }

      const vel = playerTelem.mLocalVel;
      const speed =
        Math.sqrt(vel.x * vel.x + vel.y * vel.y + vel.z * vel.z) * 3.6;

      // Tempo REAL decorrido na volta: ET global - ET quando lap comecou.
      // (mTimeIntoLap do rF2 e estimativa baseada em posicao, nao serve pra delta.)
      const tReal = snap.scoring.mCurrentET - (player.mLapStartET ?? 0);

      currentSamples.push({
        d: r1(player.mLapDist),
        t: r3(tReal > 0 ? tReal : 0),
        th: r3(playerTelem.mUnfilteredThrottle),
        br: r3(playerTelem.mUnfilteredBrake),
        st: r3(playerTelem.mUnfilteredSteering),
        rpm: Math.round(playerTelem.mEngineRPM),
        g: playerTelem.mGear,
        v: r1(speed),
        x: r1(playerTelem.mPos.x),
        z: r1(playerTelem.mPos.z),
      });

      // Emit live frame pra overlays. Inclui contexto que main precisa pra
      // (a) decidir mostrar/esconder (inRealtime, track, carClass), (b)
      // calcular delta vs refLap (lapDist, tReal, mTotalLaps), (c) widget
      // de pneus (mWheels[i].mWear) e (d) filtrar por tipo de sessao.
      if (onLive) {
        try {
          const wheels = playerTelem.mWheels || [];
          onLive({
            throttle: playerTelem.mUnfilteredThrottle,
            brake: playerTelem.mUnfilteredBrake,
            clutch: 0,
            steering: playerTelem.mUnfilteredSteering,
            rpm: playerTelem.mEngineRPM,
            gear: playerTelem.mGear,
            speed,
            lapDist: player.mLapDist,
            lapTime: tReal > 0 ? tReal : 0,
            totalLaps: mTotalLaps,
            inRealtime: snap.scoring.mInRealtime === true,
            track: snap.scoring.mTrackName,
            carClass: player.mVehicleClass,
            sessionType: sessionTypeFromCode(snap.scoring.mSession),
            // Pneus: 0..1 (0 = novo, 1 = careca). Ordem: FL, FR, RL, RR.
            tireWear: [
              wheels[0]?.mWear ?? 0,
              wheels[1]?.mWear ?? 0,
              wheels[2]?.mWear ?? 0,
              wheels[3]?.mWear ?? 0,
            ],
          });
        } catch (e) {
          // Nao deixa erro de overlay matar sampler
        }
      }
    }
  })().catch((e) => log(`[SAMPLE ERRO] ${e.message}`));

  log("\n[...] Aguardando Le Mans Ultimate...");

  while (!shouldStop()) {
    await sleep(pollMs);

    if (!smHandle) smHandle = sm.open();

    if (!smHandle) {
      if (!waitingForLmu) {
        log("[...] LMU desconectado. Aguardando...");
        waitingForLmu = true;
        sessionId = null;
        lastLapNumber = -1;
        lastTrack = null;
        emitStatus(false);
      }
      continue;
    }

    const snap = sm.readSnapshot(smHandle);
    if (!snap) continue;

    if (snap.telemetry) lastTelemetry = snap.telemetry;
    const playerTelem = snap.telemetry || lastTelemetry;

    // So consideramos "conectado" quando ja temos player carregado.
    // LMU_Data existe mesmo com LMU no menu — mas sem player decode falha.
    if (waitingForLmu && snap.player) {
      log("[OK] LMU conectado!");
      const p0 = snap.player;
      log(
        `[INIT] estado inicial: mTotalLaps=${p0.mTotalLaps} mLapDist=${p0.mLapDist?.toFixed?.(1) ?? "?"}m track="${snap.scoring?.mTrackName}"`
      );
      waitingForLmu = false;
      emitStatus(true);
    }

    const player = snap.player;
    if (!player) continue;

    const track = snap.scoring.mTrackName || "Unknown";
    const sessionType = sessionTypeFromCode(snap.scoring.mSession);
    const car = player.mVehicleName || "Unknown";
    const carClass = player.mVehicleClass || "Unknown";
    const lapNumber = player.mTotalLaps;
    const lastLapTime = player.mLastLapTime;
    const bestSector1 = player.mLastSector1;
    const bestSector2 = player.mLastSector2;
    const lapInvalid = player.mCountLapFlag === 0;

    const fuel = playerTelem ? playerTelem.mFuel : 0;
    const fuelCapacity = playerTelem ? playerTelem.mFuelCapacity : 0;

    let sector3 = 0;
    if (lastLapTime > 0 && bestSector1 > 0 && bestSector2 > 0) {
      sector3 = lastLapTime - bestSector1 - bestSector2;
    }

    // Detecta reset do LMU (game crash/reopen, restart de sessao, etc).
    // Se mCurrentET caiu drasticamente, a sessao do LMU foi reiniciada.
    // Sem isso, o tracker pode continuar anexando voltas novas na sessao antiga
    // e sobrescrever laps via upsert (sessionId_lapNumber).
    const currentET = snap.scoring.mCurrentET;
    if (
      lastCurrentET != null &&
      typeof currentET === "number" &&
      currentET < lastCurrentET - 10
    ) {
      log(
        `[...] LMU reiniciou a sessao (ET ${lastCurrentET.toFixed(1)}s → ${currentET.toFixed(1)}s). Resetando estado.`
      );
      sessionId = null;
      lastLapNumber = -1;
      lastTrack = null;
      lastSessionType = null;
      lastCar = null;
      lastLapFuel = null;
      lastImpactETBaseline = 0;
    }
    lastCurrentET = currentET;

    const inRealtime = snap.scoring.mInRealtime === true;
    const isNewSession =
      inRealtime &&
      (track !== lastTrack ||
        sessionType !== lastSessionType ||
        car !== lastCar ||
        (lastLapNumber >= 0 && lapNumber < lastLapNumber)) &&
      track &&
      track !== "Unknown";

    if (isNewSession) {
      lastTrack = track;
      lastSessionType = sessionType;
      lastCar = car;
      lastLapNumber = -1;
      lastLapFuel = null;
      lastImpactETBaseline = playerTelem?.mLastImpactET ?? 0;
      sessionId = null;

      const vehInfo = await fetchVehicleInfo(car);
      const carName = (vehInfo && vehInfo.manufacturer) || car;

      log(
        `\n[NOVA SESSAO] ${track} | ${carName} (${carClass}) | ${sessionType.toUpperCase()}`
      );
      try {
        const result = await createSession(prisma, {
          username: cfg.username,
          track,
          car: carName,
          carClass,
          type: sessionType,
        });
        sessionId = result.id;
        log(`  Session ID: ${sessionId}`);
      } catch (e) {
        log(`  [ERRO DB] ao criar sessao: ${e.message}`);
      }
    }

    // Detecta reabastecimento (ida ao box) pra fuelUsed nao ficar negativo
    if (lastLapFuel !== null && fuel > lastLapFuel) {
      lastLapFuel = fuel;
    }

    // Nova volta completada
    if (lapNumber > lastLapNumber && lastLapNumber >= 0 && sessionId) {
      const hasLapTime = lastLapTime > 0;
      const hasAnyData = hasLapTime || bestSector1 > 0 || bestSector2 > 0;
      const isRace = sessionType === "race";

      // Retenta se:
      //  (a) nao-corrida sem dados (rF2 lag em mLastLapTime), OU
      //  (b) sampler ainda nao flushou os samples dessa volta (main loop beat
      //      sampler — bug especialmente ruim em voltas invalidadas porque a
      //      sem telemetria acabava sendo aceita).
      const needData = !isRace && !hasAnyData;
      const samplesReady = completedSamplesByLap.has(lapNumber);
      // So espera samples se sampler ainda ta coletando muito (currentSamples
      // grande = sampler tem dados pra flushar, so nao foi ainda). Se
      // currentSamples pequeno, lap foi curta/sampler atrasou — nao vale esperar.
      const samplerHasPending = currentSamples.length > 50;
      const shouldWaitSamples = !samplesReady && samplerHasPending;

      if (needData || shouldWaitSamples) {
        if (pendingLapNumber === lapNumber) {
          pendingRetries++;
        } else {
          pendingLapNumber = lapNumber;
          pendingRetries = 1;
        }
        if (pendingRetries <= 20) {
          log(
            `[SAVE] lap ${lapNumber} aguardando (retry ${pendingRetries}/20) — needData=${needData} waitSamples=${shouldWaitSamples} currentSamples=${currentSamples.length}`
          );
          continue; // nao avanca lastLapNumber, retenta
        }
        log(`[SAVE] lap ${lapNumber} timeout — salvando assim mesmo`);
      }
      pendingLapNumber = -1;
      pendingRetries = 0;

      {
        const round = (n, p) => Number(n.toFixed(p));

        let lapData;
        let tyreWearAvg = 0;
        if (playerTelem && playerTelem.mWheels) {
          tyreWearAvg =
            playerTelem.mWheels.reduce((s, w) => s + (w.mWear || 0), 0) / 4;
        }
        const fuelUsed =
          lastLapFuel !== null && lastLapFuel > fuel ? lastLapFuel - fuel : 0;

        // Detecta contato nessa volta: compara o timestamp do ultimo impacto
        // com a baseline do inicio da volta. Se subiu, houve toque.
        const currentImpactET = playerTelem?.mLastImpactET ?? 0;
        const hasTouch = currentImpactET > lastImpactETBaseline;
        lastImpactETBaseline = currentImpactET;

        // Pega as amostras coletadas pelo loop de 20Hz, se existirem pra essa volta
        let telemetryJson = null;
        const mapKeys = [...completedSamplesByLap.keys()].join(",") || "vazio";
        log(
          `[SAVE] tentando salvar lap ${lapNumber} (lastLapNumber=${lastLapNumber}) | map=[${mapKeys}] | currentSamples=${currentSamples.length}`
        );
        const samplesForLap = completedSamplesByLap.get(lapNumber);
        if (samplesForLap && samplesForLap.length >= 3) {
          telemetryJson = JSON.stringify(samplesForLap);
          log(
            `[SAVE] ✓ telemetria OK (${samplesForLap.length} samples, ${Math.round(telemetryJson.length / 1024)}KB)`
          );
          completedSamplesByLap.delete(lapNumber);
        } else {
          log(`[SAVE] ✗ SEM TELEMETRIA pra lap ${lapNumber} (map=[${mapKeys}])`);
        }

        if (hasLapTime) {
          lapData = {
            lapNumber,
            lapTime: round(lastLapTime, 6),
            isValid: !lapInvalid,
            sector1: bestSector1 > 0 ? round(bestSector1, 6) : null,
            sector2: bestSector2 > 0 ? round(bestSector2, 6) : null,
            sector3: sector3 > 0 ? round(sector3, 6) : null,
            fuelUsed: round(fuelUsed, 3),
            fuelRemaining: round(fuel, 3),
            fuelCapacity: round(fuelCapacity, 3),
            energyUsed: null,
            tyreWearAvg: tyreWearAvg > 0 ? round(tyreWearAvg, 6) : null,
            position: isRace ? player.mPlace : null,
            hasTouch,
            telemetryJson,
          };
          lastLapFuel = fuel;
        } else {
          lapData = {
            lapNumber,
            lapTime: 0,
            isValid: false,
            sector1: 0,
            sector2: 0,
            sector3: 0,
            fuelUsed: round(fuelUsed, 3),
            fuelRemaining: round(fuel, 3),
            fuelCapacity: round(fuelCapacity, 3),
            energyUsed: null,
            tyreWearAvg: tyreWearAvg > 0 ? round(tyreWearAvg, 6) : null,
            position: isRace ? player.mPlace : null,
            hasTouch,
            telemetryJson,
          };
          lastLapFuel = fuel;
        }

        if (hasLapTime) {
          const status = lapData.isValid ? "VALIDA" : "INVALIDA";
          const mins = Math.floor(lastLapTime / 60);
          const secs = (lastLapTime % 60).toFixed(3).padStart(6, "0");
          log(`\n  [VOLTA ${lapNumber}] ${mins}:${secs} (${status})`);
        } else {
          log(`\n  [VOLTA ${lapNumber}] SEM TEMPO (corrida - zerada)`);
        }

        try {
          await saveLap(prisma, sessionId, lapData, log);
          log(`    [OK] Salvo no banco`);
          // Notifica overlay pra recarregar refLap (caso essa tenha sido a
          // volta mais rapida que a referencia atual)
          try {
            onLapSaved?.();
          } catch (e) {
            log(`    [ERRO onLapSaved] ${e.message}`);
          }
        } catch (e) {
          log(`    [ERRO DB] ${e.message}`);
        }
      }
    }

    lastLapNumber = lapNumber;
  }

  if (smHandle) sm.close(smHandle);
  log("\n[FIM] Tracker encerrado.");
}

function startTracker({ cfg, prisma, log, onStatus, onLive, onLapSaved }) {
  let stopped = false;
  const shouldStop = () => stopped;

  runTracker({
    cfg,
    prisma,
    log,
    shouldStop,
    onStatus,
    onLive,
    onLapSaved,
  }).catch((e) => {
    log(`[ERRO FATAL] ${e.message}`);
  });

  return () => {
    stopped = true;
    try {
      onStatus?.(false);
    } catch {}
  };
}

module.exports = { startTracker };
