// Coach por curva — compara a passagem TIPICA do piloto em cada curva com as
// MELHORES passagens dele mesmo nessa curva. Sem referencia externa: a
// diferenca entre o que voce ja sabe fazer (melhores passagens) e o que voce
// faz na maioria das voltas vira frase ("freia 12m antes", "nao abre o carro
// na saida", "acelera cedo e o TC entra").
//
// Entrada: voltas da mesma pista + carro, cada uma com samples ordenados por
// distancia ({d, t, th, br, st, v, x, z, abs, tc} — formato do tracker).
// Curvas detectadas na volta mais rapida (detectSegments) e usadas como
// janela fixa de pista pra todas as voltas.
//
// Puro (sem electron/prisma): roda no main process via IPC "coach.analyze".

import { detectSegments } from "../renderer/lib/telemetry.js";

const STEP_M = 2; // resolucao da grade de distancia por curva
const MIN_LAPS = 5;

// Limiares: diferenca minima (tipico vs melhores) pra virar dica.
const TH = {
  brakeM: 8,
  vminKmh: 3,
  throttleOnM: 10,
  fullThrottleM: 15,
  coastS: 0.12,
  lineM: 0.8,
  exitKmh: 3,
  steer: 0.05,
  freq: 0.25,
};

// ── Helpers numericos ──────────────────────────────────

function median(arr) {
  const v = arr.filter((x) => x != null && Number.isFinite(x)).sort((a, b) => a - b);
  if (v.length === 0) return null;
  const m = v.length >> 1;
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

function mean(arr) {
  const v = arr.filter((x) => x != null && Number.isFinite(x));
  if (v.length === 0) return null;
  return v.reduce((s, x) => s + x, 0) / v.length;
}

// Interpolacao linear por distancia (samples ordenados por d).
function interp(samples, d, key) {
  const n = samples.length;
  if (d <= samples[0].d) return samples[0][key] ?? 0;
  if (d >= samples[n - 1].d) return samples[n - 1][key] ?? 0;
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (samples[mid].d <= d) lo = mid;
    else hi = mid;
  }
  const a = samples[lo];
  const b = samples[hi];
  const span = b.d - a.d || 1;
  const va = a[key] ?? 0;
  const vb = b[key] ?? 0;
  return va + ((d - a.d) / span) * (vb - va);
}

// Reamostra a volta numa grade uniforme de distancia [from, to].
function resample(samples, from, to) {
  const grid = [];
  for (let d = from; d <= to; d += STEP_M) {
    grid.push({
      d,
      t: interp(samples, d, "t"),
      th: interp(samples, d, "th"),
      br: interp(samples, d, "br"),
      st: interp(samples, d, "st"),
      v: interp(samples, d, "v"),
      x: interp(samples, d, "x"),
      z: interp(samples, d, "z"),
      abs: interp(samples, d, "abs") >= 0.5,
      tc: interp(samples, d, "tc") >= 0.5,
    });
  }
  return grid;
}

// ── Geometria da linha ─────────────────────────────────
//
// lapDist e medido no "centro" da pista, entao dois carros no mesmo d estao
// na mesma secao transversal. O offset lateral e a distancia perpendicular
// entre a posicao da volta e a da volta de referencia, no mesmo d.

function heading(refSamples, d) {
  const a = { x: interp(refSamples, d - 3, "x"), z: interp(refSamples, d - 3, "z") };
  const b = { x: interp(refSamples, d + 3, "x"), z: interp(refSamples, d + 3, "z") };
  const hx = b.x - a.x;
  const hz = b.z - a.z;
  const len = Math.hypot(hx, hz) || 1;
  return { x: hx / len, z: hz / len };
}

// +1 se a curva vira pro lado da normal (-hz, hx), -1 se pro outro.
function turnSign(refSamples, vminD) {
  const h1 = heading(refSamples, vminD - 30);
  const h2 = heading(refSamples, vminD + 30);
  const cross = h1.x * h2.z - h1.z * h2.x;
  return cross >= 0 ? 1 : -1;
}

// Offset lateral medio no trecho [d0, d1], positivo = mais pra DENTRO da curva.
function insideOffset(lapSamples, refSamples, d0, d1, sign) {
  const vals = [];
  for (let d = d0; d <= d1; d += STEP_M) {
    const h = heading(refSamples, d);
    const nx = -h.z;
    const nz = h.x;
    const dx = interp(lapSamples, d, "x") - interp(refSamples, d, "x");
    const dz = interp(lapSamples, d, "z") - interp(refSamples, d, "z");
    vals.push((dx * nx + dz * nz) * sign);
  }
  return mean(vals);
}

// ── Curvas da volta de referencia ──────────────────────

function cornersFromReference(refSamples) {
  const segs = detectSegments(refSamples);
  const byIdx = new Map();
  for (const s of segs) {
    if (!s.cornerIdx) continue;
    const c = byIdx.get(s.cornerIdx) ?? { idx: s.cornerIdx };
    if (s.type === "braking") {
      c.brakeStartD = s.from;
      c.vminD = s.to;
      c.vmin = s.vmin;
    } else if (s.type === "exit") {
      c.vminD = c.vminD ?? s.from;
      c.throttleFullD = s.to;
    }
    byIdx.set(s.cornerIdx, c);
  }
  const corners = [...byIdx.values()]
    .map((c) => ({
      ...c,
      brakeStartD: c.brakeStartD ?? c.vminD,
      throttleFullD: c.throttleFullD ?? c.vminD + 40,
    }))
    .filter((c) => c.vminD != null)
    .sort((a, b) => a.vminD - b.vminD);

  const lapStart = refSamples[0].d;
  const lapEnd = refSamples[refSamples.length - 1].d;
  // Janela de analise: um pouco antes da freada (pega quem freia cedo) ate
  // um pouco depois do gas 100% (pega velocidade de saida), sem invadir a
  // curva vizinha.
  return corners.map((c, i) => {
    const prev = corners[i - 1];
    const next = corners[i + 1];
    const from = Math.max(lapStart, prev ? prev.throttleFullD : -Infinity, c.brakeStartD - 80);
    const to = Math.min(lapEnd, next ? next.brakeStartD : Infinity, c.throttleFullD + 60);
    // O tempo que decide quais passagens sao "as melhores" vai ate a proxima
    // freada: uma curva bonita que mata a saida perde na reta seguinte e nao
    // conta como boa. As metricas (freada, gas, linha) usam so [from, to].
    const timeTo = Math.max(to, next ? next.brakeStartD : lapEnd);
    return { ...c, from, to, timeTo };
  });
}

// ── Metricas de uma passagem ───────────────────────────

function passMetrics(lapSamples, refSamples, corner, sign) {
  const g = resample(lapSamples, corner.from, corner.to);
  if (g.length < 5) return null;

  const time = interp(lapSamples, corner.timeTo, "t") - interp(lapSamples, corner.from, "t");
  if (!(time > 0)) return null;

  // Freada: primeiro ponto com freio >= 10%
  let brakeIdx = g.findIndex((p) => p.br >= 0.1);
  if (brakeIdx < 0) brakeIdx = null;

  // Ponto mais lento
  let vminIdx = 0;
  for (let i = 1; i < g.length; i++) if (g[i].v < g[vminIdx].v) vminIdx = i;

  // Soltou o freio
  let releaseIdx = null;
  if (brakeIdx != null) {
    for (let i = brakeIdx; i < g.length; i++) {
      if (g[i].br < 0.05) {
        releaseIdx = i;
        break;
      }
    }
  }

  // Voltou ao gas (>= 20%) depois de soltar o freio / passar do mais lento
  const pickFrom = releaseIdx ?? Math.max(0, vminIdx - 10);
  let onIdx = null;
  for (let i = pickFrom; i < g.length; i++) {
    if (g[i].th >= 0.2) {
      onIdx = i;
      break;
    }
  }

  // Gas 100%
  let fullIdx = null;
  if (onIdx != null) {
    for (let i = onIdx; i < g.length; i++) {
      if (g[i].th >= 0.95) {
        fullIdx = i;
        break;
      }
    }
  }

  // Abriu o gas e teve que aliviar (queda de 25% abaixo do maximo ja aplicado)
  let lifted = false;
  if (onIdx != null) {
    let runMax = 0;
    const end = fullIdx ?? g.length - 1;
    for (let i = onIdx; i <= end; i++) {
      runMax = Math.max(runMax, g[i].th);
      if (runMax - g[i].th > 0.25) {
        lifted = true;
        break;
      }
    }
  }

  // TC/ABS na fase certa
  const tcFrom = onIdx ?? vminIdx;
  const tc = g.slice(tcFrom).some((p) => p.tc);
  const abs = brakeIdx != null && g.slice(brakeIdx, vminIdx + 5).some((p) => p.abs);

  // Tempo sem pedal nenhum entre o inicio da janela e a volta ao gas
  let coast = 0;
  const coastEnd = onIdx ?? vminIdx;
  for (let i = 1; i <= coastEnd; i++) {
    const p = g[i];
    if (p.th < 0.05 && p.br < 0.05 && p.v > 30) coast += p.t - g[i - 1].t;
  }

  // Volante na saida: media de |st| nos 60m apos o ponto mais lento
  const exitSteer = mean(
    g.slice(vminIdx, Math.min(g.length, vminIdx + 30)).map((p) => Math.abs(p.st))
  );

  // Linha (relativa a volta de referencia, + = mais por dentro)
  const exitMid = corner.vminD + (corner.throttleFullD - corner.vminD) * 0.4;
  const lineApex = insideOffset(lapSamples, refSamples, corner.vminD - 10, corner.vminD + 10, sign);
  const lineExit = insideOffset(lapSamples, refSamples, exitMid, corner.throttleFullD, sign);

  return {
    time,
    entrySpeed: g[0].v,
    brakeD: brakeIdx != null ? g[brakeIdx].d : null,
    vmin: g[vminIdx].v,
    throttleOnD: onIdx != null ? g[onIdx].d : null,
    fullThrottleD: fullIdx != null ? g[fullIdx].d : corner.to,
    lifted,
    tc,
    abs,
    coast,
    exitSpeed: g[g.length - 1].v,
    exitSteer,
    lineApex,
    lineExit,
  };
}

// ── Achados (comparacao tipico x melhores) ─────────────

const fmt = (n, p = 0) => Math.abs(n).toFixed(p).replace(".", ",");
const pct = (f) => `${Math.round(f * 100)}%`;

function freqOf(passes, pred) {
  const vals = passes.filter((p) => pred(p) != null);
  if (vals.length === 0) return 0;
  return vals.filter((p) => pred(p) === true).length / vals.length;
}

function boolRate(passes, key) {
  return passes.length ? passes.filter((p) => p[key]).length / passes.length : 0;
}

function findingsFor(all, best) {
  const out = [];
  const typ = (k) => median(all.map((p) => p[k]));
  const ref = (k) => median(best.map((p) => p[k]));
  // fracao das voltas em que o desvio acontece (o "sempre" da frase)
  const deviates = (k, dir, th) => {
    const r = ref(k);
    if (r == null) return 0;
    return freqOf(all, (p) => (p[k] == null ? null : dir * (p[k] - r) > th));
  };
  const add = (f) => {
    if (f.freq >= TH.freq) out.push({ ...f, score: f.magnitude * f.freq });
  };

  // Freada
  const dBrake = typ("brakeD") != null && ref("brakeD") != null ? typ("brakeD") - ref("brakeD") : null;
  const dVmin = typ("vmin") - ref("vmin");
  const absTyp = boolRate(all, "abs");
  const absBest = boolRate(best, "abs");
  if (dBrake != null && dBrake < -TH.brakeM) {
    const freq = deviates("brakeD", -1, TH.brakeM);
    add({
      type: "brake-early",
      text: `Freia ${fmt(dBrake)} m antes do que nas suas melhores passagens`,
      freq,
      magnitude: -dBrake / TH.brakeM,
    });
  } else if (dBrake != null && dBrake > TH.brakeM && (dVmin < -2 || absTyp - absBest > 0.25)) {
    const freq = deviates("brakeD", 1, TH.brakeM);
    const why =
      absTyp - absBest > 0.25
        ? `o ABS entra em ${pct(absTyp)} das voltas`
        : `o ponto mais lento cai ${fmt(dVmin)} km/h`;
    add({
      type: "brake-late",
      text: `Freia ${fmt(dBrake)} m mais tarde e passa do ponto: ${why}`,
      freq,
      magnitude: dBrake / TH.brakeM,
    });
  }

  // Velocidade minima
  if (dVmin < -TH.vminKmh) {
    add({
      type: "vmin",
      text: `Passa ${fmt(dVmin)} km/h mais lento no ponto mais lento da curva`,
      freq: deviates("vmin", -1, TH.vminKmh),
      magnitude: -dVmin / TH.vminKmh,
    });
  }

  // Volta ao gas
  const dOn =
    typ("throttleOnD") != null && ref("throttleOnD") != null ? typ("throttleOnD") - ref("throttleOnD") : null;
  const liftTyp = boolRate(all, "lifted");
  const liftBest = boolRate(best, "lifted");
  const tcTyp = boolRate(all, "tc");
  const tcBest = boolRate(best, "tc");
  const earlyConsequence =
    liftTyp - liftBest > 0.25
      ? `precisa aliviar o gás em ${pct(liftTyp)} das voltas`
      : tcTyp - tcBest > 0.25
        ? `o TC entra em ${pct(tcTyp)} das voltas`
        : null;
  if (dOn != null && dOn < -TH.throttleOnM && earlyConsequence) {
    add({
      type: "throttle-early",
      text: `Acelera cedo demais: volta ao gás ${fmt(dOn)} m antes e ${earlyConsequence}`,
      freq: deviates("throttleOnD", -1, TH.throttleOnM),
      magnitude: -dOn / TH.throttleOnM + 1,
    });
  } else if (earlyConsequence) {
    add({
      type: "throttle-unstable",
      text: `Saída instável: ${earlyConsequence} (nas melhores: ${pct(Math.max(liftBest, tcBest))})`,
      freq: Math.max(liftTyp - liftBest, tcTyp - tcBest),
      magnitude: 2,
    });
  } else if (dOn != null && dOn > TH.throttleOnM) {
    add({
      type: "throttle-late",
      text: `Demora pra voltar ao gás: ${fmt(dOn)} m depois das suas melhores`,
      freq: deviates("throttleOnD", 1, TH.throttleOnM),
      magnitude: dOn / TH.throttleOnM,
    });
  }

  const dFull = typ("fullThrottleD") - ref("fullThrottleD");
  if (dFull > TH.fullThrottleM && !(dOn != null && dOn > TH.throttleOnM)) {
    add({
      type: "full-throttle-late",
      text: `Demora pra acelerar tudo: gás 100% ${fmt(dFull)} m depois`,
      freq: deviates("fullThrottleD", 1, TH.fullThrottleM),
      magnitude: dFull / TH.fullThrottleM,
    });
  }

  // Sem pedal
  const dCoast = typ("coast") - ref("coast");
  if (dCoast > TH.coastS) {
    add({
      type: "coast",
      text: `Fica ${fmt(dCoast, 2)} s sem gás nem freio na entrada`,
      freq: deviates("coast", 1, TH.coastS),
      magnitude: dCoast / TH.coastS,
    });
  }

  // Linha
  const dExitLine = typ("lineExit") - ref("lineExit");
  if (dExitLine > TH.lineM) {
    add({
      type: "line-exit",
      text: `Não abre o carro na saída: fica ${fmt(dExitLine, 1)} m mais por dentro que nas melhores`,
      freq: deviates("lineExit", 1, TH.lineM),
      magnitude: dExitLine / TH.lineM,
    });
  }
  const dApexLine = typ("lineApex") - ref("lineApex");
  if (dApexLine < -TH.lineM) {
    add({
      type: "line-apex",
      text: `Não chega no apex: passa ${fmt(dApexLine, 1)} m mais longe da parte de dentro`,
      freq: deviates("lineApex", -1, TH.lineM),
      magnitude: -dApexLine / TH.lineM,
    });
  }

  // Volante
  const dSteer = typ("exitSteer") - ref("exitSteer");
  if (dSteer > TH.steer) {
    add({
      type: "steer-exit",
      text: `Segura mais volante na saída (${Math.round((dSteer / (ref("exitSteer") || 1)) * 100)}% a mais) — demora a desvirar`,
      freq: deviates("exitSteer", 1, TH.steer),
      magnitude: dSteer / TH.steer,
    });
  }

  // Consequencia: velocidade de saida (so mostra se nada acima explicou)
  const dExit = typ("exitSpeed") - ref("exitSpeed");
  if (dExit < -TH.exitKmh && out.length === 0) {
    add({
      type: "exit-speed",
      text: `Sai da curva ${fmt(dExit)} km/h mais lento`,
      freq: deviates("exitSpeed", -1, TH.exitKmh),
      magnitude: -dExit / TH.exitKmh,
    });
  }

  return out.sort((a, b) => b.score - a.score).slice(0, 3);
}

// ── API ────────────────────────────────────────────────

/**
 * @param {Array<{id: string, lapTime: number, samples: object[]}>} laps
 *   voltas validas da mesma pista + carro, samples ordenados por d.
 */
export function analyzeCorners(laps) {
  const usable = laps.filter((l) => Array.isArray(l.samples) && l.samples.length >= 50);
  if (usable.length < MIN_LAPS) {
    return { corners: [], lapCount: usable.length, minLaps: MIN_LAPS };
  }
  const ref = usable.reduce((a, b) => (b.lapTime < a.lapTime ? b : a));
  const refSamples = ref.samples;
  const corners = cornersFromReference(refSamples);

  const result = corners.map((c) => {
    const sign = turnSign(refSamples, c.vminD);
    const raw = [];
    for (const lap of usable) {
      const m = passMetrics(lap.samples, refSamples, c, sign);
      if (m) raw.push({ ...m, lapId: lap.id });
    }

    // Passagens absurdas (rodada, saida de pista, trafego) distorcem a
    // mediana: corta o que passar de mediana + 3 desvios robustos (MAD),
    // com piso de 0.3s pra nao cortar variacao normal.
    const medT = median(raw.map((p) => p.time));
    const mad = median(raw.map((p) => Math.abs(p.time - medT))) * 1.4826;
    const passes = raw.filter((p) => p.time <= medT + Math.max(3 * mad, 0.3));
    if (passes.length < MIN_LAPS) return null;

    // "Melhores passagens": top 15% mais rapidas nessa curva (1 a 3).
    // Mediana de varias e mais robusta que uma unica passagem sortuda.
    // Justica: so concorrem passagens que NAO chegaram bem mais rapido que
    // o normal — senao a "melhor" so foi rapida porque a curva anterior foi
    // melhor, e o coach mandaria copiar algo que nao e dessa curva.
    const entryTyp = median(passes.map((p) => p.entrySpeed));
    const fair = passes.filter((p) => p.entrySpeed <= entryTyp + TH.vminKmh);
    const pool = fair.length >= 3 ? fair : passes;
    const k = Math.max(1, Math.min(3, Math.round(passes.length * 0.15)));
    const best = [...pool].sort((a, b) => a.time - b.time).slice(0, k);
    const bestTime = median(best.map((p) => p.time));
    const typicalTime = median(passes.map((p) => p.time));

    return {
      idx: c.idx,
      name: `T${c.idx}`,
      from: c.from,
      to: c.to,
      vminD: c.vminD,
      pos: { x: interp(refSamples, c.vminD, "x"), z: interp(refSamples, c.vminD, "z") },
      passes: passes.length,
      discarded: raw.length - passes.length,
      bestLapIds: best.map((p) => p.lapId),
      bestTime,
      typicalTime,
      loss: Math.max(0, typicalTime - bestTime),
      vminBest: median(best.map((p) => p.vmin)),
      vminTypical: median(passes.map((p) => p.vmin)),
      findings: findingsFor(passes, best),
    };
  });

  const out = result.filter(Boolean);
  // Tracado pro mapa (~400 pontos)
  const stride = Math.max(1, Math.floor(refSamples.length / 400));
  const path = refSamples
    .filter((_, i) => i % stride === 0)
    .map((s) => ({ x: s.x, z: s.z, d: s.d }));

  return {
    lapCount: usable.length,
    minLaps: MIN_LAPS,
    refLapId: ref.id,
    refLapTime: ref.lapTime,
    totalLoss: out.reduce((s, c) => s + c.loss, 0),
    corners: out,
    path,
  };
}
