import { median } from "./stats.js";

/**
 * Retorna um Set com os IDs das voltas a desconsiderar como outliers.
 * Regra:
 *   - so se aplica a sessoes NAO-corrida (practice/quali/warmup/testday)
 *   - apenas voltas validas sao elegiveis
 *   - outlier = lapTime > mediana da sessao * (1 + threshold%)
 *
 * laps: array de voltas do tipo Lap (com session.type OU com sessionType direto)
 * thresholdPct: numero (ex: 7 = 7%). Se <= 0, retorna Set vazio.
 * getSessionType: fn(lap) => type string. Default assume lap.session.type.
 */
export function computeOutlierSet(laps, thresholdPct, getSessionType) {
  const out = new Set();
  if (!laps || laps.length === 0 || !thresholdPct || thresholdPct <= 0) {
    return out;
  }
  const getType = getSessionType || ((l) => l.session?.type);

  // Agrupa por sessionId (cada sessao tem sua propria mediana)
  const bySession = new Map();
  for (const l of laps) {
    if (!l.isValid) continue;
    if (getType(l) === "race") continue;
    const sid = l.sessionId;
    if (!bySession.has(sid)) bySession.set(sid, []);
    bySession.get(sid).push(l);
  }

  const factor = 1 + thresholdPct / 100;

  for (const [, sessionLaps] of bySession) {
    if (sessionLaps.length < 3) continue; // poucos samples, nao filtra
    const times = sessionLaps.map((l) => l.lapTime).sort((a, b) => a - b);
    const med = median(times);
    if (!isFinite(med) || med <= 0) continue;
    const cutoff = med * factor;
    for (const l of sessionLaps) {
      if (l.lapTime > cutoff) out.add(l.id);
    }
  }
  return out;
}
