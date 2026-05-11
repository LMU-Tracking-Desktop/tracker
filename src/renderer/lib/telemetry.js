/**
 * Helpers pra comparar telemetria de duas voltas.
 * Samples: array de { d, t, th, br, st, rpm, g, v } ordenado por d (distancia).
 */

// Encontra a distancia em que `t` elapsed foi atingido. Interpola linearmente.
export function distanceAtTime(samples, t) {
  if (!samples || samples.length < 2 || t == null || t <= 0) return null;
  if (t <= samples[0].t) return samples[0].d;
  if (t >= samples[samples.length - 1].t)
    return samples[samples.length - 1].d;
  // busca linear (samples ordenados por d → t monotonico)
  for (let i = 1; i < samples.length; i++) {
    if (samples[i].t >= t) {
      const a = samples[i - 1];
      const b = samples[i];
      if (b.t === a.t) return a.d;
      const frac = (t - a.t) / (b.t - a.t);
      return a.d + frac * (b.d - a.d);
    }
  }
  return samples[samples.length - 1].d;
}

// Tempo (s) em que o piloto cruzou a distancia `d`. Interpola linearmente.
export function timeAtDistance(samples, d) {
  if (!samples || samples.length === 0 || d == null) return null;
  if (d <= samples[0].d) return samples[0].t;
  if (d >= samples[samples.length - 1].d) return samples[samples.length - 1].t;
  let lo = 0;
  let hi = samples.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (samples[mid].d <= d) lo = mid;
    else hi = mid;
  }
  const a = samples[lo];
  const b = samples[hi];
  if (b.d === a.d) return a.t;
  const frac = (d - a.d) / (b.d - a.d);
  return a.t + frac * (b.t - a.t);
}

// Tempo gasto entre as distancias d1 e d2 (mini-setor arbitrario).
// Retorna null se a volta nao cobre o intervalo todo.
export function timeInRange(samples, d1, d2) {
  if (!samples || samples.length < 2) return null;
  const lo = Math.min(d1, d2);
  const hi = Math.max(d1, d2);
  // Volta precisa cobrir todo o range — senao a comparacao nao e justa
  if (samples[0].d > lo + 1) return null;
  if (samples[samples.length - 1].d < hi - 1) return null;
  const t1 = timeAtDistance(samples, lo);
  const t2 = timeAtDistance(samples, hi);
  if (t1 == null || t2 == null) return null;
  return t2 - t1;
}

// Reduz `samples` pra no maximo `maxPoints` via subsampling uniforme.
// Preserva o primeiro e o ultimo sample sempre.
export function downsample(samples, maxPoints) {
  if (!samples || samples.length <= maxPoints) return samples;
  const out = new Array(maxPoints);
  const step = (samples.length - 1) / (maxPoints - 1);
  for (let i = 0; i < maxPoints; i++) {
    out[i] = samples[Math.round(i * step)];
  }
  return out;
}

// Interpola linearmente um canal de `samples` no ponto de distancia d.
function interpolateAt(samples, d, key) {
  if (!samples || samples.length === 0) return null;
  if (d <= samples[0].d) return samples[0][key];
  if (d >= samples[samples.length - 1].d) return samples[samples.length - 1][key];
  // Busca linear — samples estao ordenados por d
  for (let i = 1; i < samples.length; i++) {
    if (samples[i].d >= d) {
      const a = samples[i - 1];
      const b = samples[i];
      if (b.d === a.d) return b[key];
      const frac = (d - a.d) / (b.d - a.d);
      return a[key] + frac * (b[key] - a[key]);
    }
  }
  return samples[samples.length - 1][key];
}

// Para cada sample de `current`, computa os valores equivalentes em `reference`
// interpolando em reference na mesma distancia. Retorna array alinhado.
export function alignReferenceTo(current, reference) {
  if (!current || !reference) return null;
  let refIdx = 0;
  return current.map((s) => {
    while (refIdx < reference.length - 1 && reference[refIdx + 1].d < s.d) {
      refIdx++;
    }
    // refIdx aponta para o primeiro sample com d >= s.d (ou o ultimo)
    const a = reference[Math.max(0, refIdx)];
    const b = reference[Math.min(reference.length - 1, refIdx + 1)];
    const frac = b.d === a.d ? 0 : (s.d - a.d) / (b.d - a.d);
    const lerp = (k) => a[k] + frac * (b[k] - a[k]);
    return {
      d: s.d,
      t_ref: lerp("t"),
      th_ref: lerp("th"),
      br_ref: lerp("br"),
      st_ref: lerp("st"),
      v_ref: lerp("v"),
    };
  });
}

// Computa delta (tempo atual - tempo referencia) ao longo da volta.
export function computeDelta(current, reference) {
  const aligned = alignReferenceTo(current, reference);
  if (!aligned) return [];
  return current.map((s, i) => ({
    d: s.d,
    delta: Number((s.t - aligned[i].t_ref).toFixed(3)),
  }));
}

// ─── Mini-setores por fase de pilotagem ─────────────────────────────────
//
// Em vez de quadrados de distancia fixa (que misturam reta + entrada de
// curva no mesmo bin), os segmentos sao detectados a partir dos sinais
// de freio/acelerador/velocidade DA volta de referencia, e os limites
// em distancia sao reutilizados pra medir a sua volta — garantindo
// comparacao apples-to-apples no mesmo pedaco de pista.
//
// Cada curva vira 2 fases: FREADA (brake-on → vmin) e SAIDA (vmin →
// throttle 100%). Entre curvas, RETA. Auto-numeradas T1, T2, ...

export function detectSegments(samples, opts = {}) {
  if (!samples || samples.length < 20) return [];

  // Prominencia minima (km/h) que o vale precisa ter pros lados pra contar
  // como curva. Picos pequenos viram ruido e sao ignorados.
  const PROMINENCE_KMH = opts.prominenceKmh ?? 22;
  const THROTTLE_FULL = opts.throttleFull ?? 0.92;
  const BRAKE_ON = opts.brakeOn ?? 0.05;
  const MIN_CORNER_LEN = opts.minCornerLen ?? 30;
  const MERGE_GAP_M = opts.mergeGapM ?? 30;
  const SMOOTH = 4;
  const TIME_REQUIRED = 0.2;

  const n = samples.length;

  // Suaviza velocidade pra remover oscilacao de baixa amplitude
  const vSmooth = new Array(n);
  for (let i = 0; i < n; i++) {
    let sum = 0;
    let c = 0;
    for (let j = Math.max(0, i - SMOOTH); j <= Math.min(n - 1, i + SMOOTH); j++) {
      sum += samples[j].v ?? 0;
      c++;
    }
    vSmooth[i] = sum / c;
  }

  // ── 1. Detecta extremos por prominencia (state machine rising/falling).
  // So registra um pico/vale quando a velocidade inverte direcao por pelo
  // menos PROMINENCE_KMH/2 km/h — wobbles menores que isso sao filtrados.
  const HYST = PROMINENCE_KMH / 2;
  const extrema = []; // [{idx, v, kind: 'max'|'min'}]
  let state = "rising"; // arbitrario: ja confirma quando inverter
  let candIdx = 0;
  let candV = vSmooth[0];

  // Inicializa estado com base nas primeiras amostras
  // (procura primeiro movimento significativo)
  for (let i = 1; i < n; i++) {
    if (vSmooth[i] > candV + HYST * 0.3) {
      state = "rising";
      candIdx = i;
      candV = vSmooth[i];
      break;
    }
    if (vSmooth[i] < candV - HYST * 0.3) {
      state = "falling";
      candIdx = i;
      candV = vSmooth[i];
      break;
    }
  }

  for (let i = 1; i < n; i++) {
    const v = vSmooth[i];
    if (state === "rising") {
      if (v > candV) {
        candV = v;
        candIdx = i;
      } else if (candV - v >= HYST) {
        // dropped enough — confirma pico
        extrema.push({ idx: candIdx, v: candV, kind: "max" });
        state = "falling";
        candV = v;
        candIdx = i;
      }
    } else {
      if (v < candV) {
        candV = v;
        candIdx = i;
      } else if (v - candV >= HYST) {
        // rose enough — confirma vale
        extrema.push({ idx: candIdx, v: candV, kind: "min" });
        state = "rising";
        candV = v;
        candIdx = i;
      }
    }
  }
  // Fecha o ultimo extremo (em particular se a volta termina numa subida apos vmin)
  if (extrema.length > 0 && state === "falling") {
    extrema.push({ idx: candIdx, v: candV, kind: "min" });
  }

  // ── 2. Pega so os vales — cada um e um candidato a curva.
  let valleys = extrema.filter((e) => e.kind === "min");

  // Mescla vales muito proximos (mesma curva complexa / chicane com 2 apexes):
  // mantem o de menor velocidade.
  const mergedValleys = [];
  for (const v of valleys) {
    if (mergedValleys.length > 0) {
      const last = mergedValleys[mergedValleys.length - 1];
      const gap = samples[v.idx].d - samples[last.idx].d;
      if (gap < MERGE_GAP_M) {
        if (v.v < last.v) {
          mergedValleys[mergedValleys.length - 1] = v;
        }
        continue;
      }
    }
    mergedValleys.push(v);
  }
  valleys = mergedValleys;

  // ── 3. Pra cada vale, expande entrada (pra tras) e saida (pra frente).
  // Entrada: enquanto velocidade ainda desce OU ha freio (>=5%), limite 250m.
  // Saida: ate o gas ficar >=92% por 0.2s consecutivos, limite 350m.
  const corners = [];
  let cornerNum = 0;
  for (const valley of valleys) {
    const vminIdx = valley.idx;

    let entryIdx = vminIdx;
    for (let i = vminIdx - 1; i >= 0; i--) {
      const s = samples[i];
      const braking = (s.br ?? 0) >= BRAKE_ON;
      const decelerating = vSmooth[i] > vSmooth[i + 1];
      if (braking || decelerating) {
        entryIdx = i;
      } else {
        break;
      }
      if (samples[vminIdx].d - s.d > 250) break;
    }

    let exitIdx = vminIdx;
    let streakStart = -1;
    for (let i = vminIdx + 1; i < n; i++) {
      const s = samples[i];
      if ((s.th ?? 0) >= THROTTLE_FULL) {
        if (streakStart === -1) streakStart = i;
        if (s.t - samples[streakStart].t >= TIME_REQUIRED) {
          exitIdx = streakStart;
          break;
        }
      } else {
        streakStart = -1;
      }
      if (s.d - samples[vminIdx].d > 350) {
        exitIdx = i;
        break;
      }
    }
    if (exitIdx === vminIdx) exitIdx = Math.min(n - 1, vminIdx + 5);

    const cornerLen = samples[exitIdx].d - samples[entryIdx].d;
    if (cornerLen < MIN_CORNER_LEN) continue;

    cornerNum++;
    corners.push({
      cornerIdx: cornerNum,
      brakeStartD: samples[entryIdx].d,
      vminD: samples[vminIdx].d,
      throttleFullD: samples[exitIdx].d,
      vmin: samples[vminIdx].v ?? valley.v,
    });
  }

  const MIN_STRAIGHT_LEN = opts.minStraightLen ?? 40;

  const segments = [];
  const lapStartD = samples[0].d;
  const lapEndD = samples[n - 1].d;

  if (corners.length > 0 && corners[0].brakeStartD - lapStartD > MIN_STRAIGHT_LEN) {
    segments.push({
      name: "RETA → T1",
      type: "straight",
      from: lapStartD,
      to: corners[0].brakeStartD,
    });
  }

  for (let k = 0; k < corners.length; k++) {
    const c = corners[k];
    if (c.vminD > c.brakeStartD) {
      segments.push({
        name: `FREADA T${c.cornerIdx}`,
        type: "braking",
        cornerIdx: c.cornerIdx,
        from: c.brakeStartD,
        to: c.vminD,
        vmin: c.vmin,
      });
    }
    if (c.throttleFullD > c.vminD) {
      segments.push({
        name: `SAÍDA T${c.cornerIdx}`,
        type: "exit",
        cornerIdx: c.cornerIdx,
        from: c.vminD,
        to: c.throttleFullD,
      });
    }
    if (k < corners.length - 1) {
      const next = corners[k + 1];
      if (next.brakeStartD - c.throttleFullD > MIN_STRAIGHT_LEN) {
        segments.push({
          name: `RETA T${c.cornerIdx}→T${next.cornerIdx}`,
          type: "straight",
          from: c.throttleFullD,
          to: next.brakeStartD,
        });
      }
    } else if (lapEndD - c.throttleFullD > MIN_STRAIGHT_LEN) {
      segments.push({
        name: `RETA T${c.cornerIdx} → META`,
        type: "straight",
        from: c.throttleFullD,
        to: lapEndD,
      });
    }
  }

  return segments;
}

// Para cada segmento, mede o tempo gasto na current e na reference e
// calcula o delta. Os limites em distancia vem da ref (passada pra
// `detectSegments`) — mesma janela de pista nas duas voltas.
export function segmentDeltas(currentSamples, referenceSamples, segments) {
  return segments.map((seg) => {
    const tCur = timeInRange(currentSamples, seg.from, seg.to);
    const tRef = timeInRange(referenceSamples, seg.from, seg.to);
    return {
      ...seg,
      timeCurrent: tCur,
      timeReference: tRef,
      delta: tCur != null && tRef != null ? tCur - tRef : null,
    };
  });
}

// Merge current + aligned reference em um unico dataset pros grafios overlay.
export function mergeForChart(current, reference) {
  const aligned = alignReferenceTo(current, reference);
  return current.map((s, i) => {
    const r = aligned ? aligned[i] : null;
    return {
      d: s.d,
      throttle: Math.round(s.th * 100),
      brake: Math.round(s.br * 100),
      steering: Math.round(s.st * 100),
      speed: s.v,
      throttle_ref: r ? Math.round(r.th_ref * 100) : null,
      brake_ref: r ? Math.round(r.br_ref * 100) : null,
      steering_ref: r ? Math.round(r.st_ref * 100) : null,
      speed_ref: r ? Number(r.v_ref.toFixed(1)) : null,
      delta: r ? Number((s.t - r.t_ref).toFixed(3)) : null,
    };
  });
}
