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
