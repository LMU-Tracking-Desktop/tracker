/**
 * Motor de coaching: cruza a sua volta com a de referencia e, a partir
 * dos canais de telemetria (freio, gas, velocidade, ABS, TC), decide o
 * que mudar em cada segmento e devolve frases diretas e prescritivas.
 *
 * Entrada: segmentos com delta ja calculado (segmentDeltas) + os samples
 * das duas voltas. Cada sample: { d, t, th, br, st, rpm, g, v, abs, tc }.
 *
 * `coachConsistency` vai alem: cruza VARIAS voltas suas com a referencia
 * e mede em quantas o mesmo erro reaparece — separa habito (recorrente,
 * vale corrigir) de erro isolado (ruido).
 */

import { segmentDeltas } from "./telemetry.js";

// Perda (s) a partir da qual vale a pena comentar um segmento.
const LOSS_THRESHOLD = 0.03;

// Primeira distancia na janela [from,to] em que `key` cruza `threshold`.
function crossUp(samples, from, to, key, threshold) {
  for (const s of samples) {
    if (s.d < from || s.d > to) continue;
    if ((s[key] ?? 0) >= threshold) return s.d;
  }
  return null;
}

function minOf(samples, from, to, key) {
  let m = Infinity;
  for (const s of samples) {
    if (s.d < from || s.d > to) continue;
    const v = s[key];
    if (v != null && v < m) m = v;
  }
  return isFinite(m) ? m : null;
}

function maxOf(samples, from, to, key) {
  let m = -Infinity;
  for (const s of samples) {
    if (s.d < from || s.d > to) continue;
    const v = s[key];
    if (v != null && v > m) m = v;
  }
  return isFinite(m) ? m : null;
}

// Fracao de samples na janela com o flag (abs/tc) ativo.
function activeFrac(samples, from, to, key) {
  let n = 0;
  let active = 0;
  for (const s of samples) {
    if (s.d < from || s.d > to) continue;
    n++;
    if (s[key]) active++;
  }
  return n ? active / n : 0;
}

// Velocidade interpolada no ponto de distancia `d`.
function speedAt(samples, d) {
  if (!samples || samples.length === 0) return null;
  if (d <= samples[0].d) return samples[0].v;
  if (d >= samples[samples.length - 1].d)
    return samples[samples.length - 1].v;
  for (let i = 1; i < samples.length; i++) {
    if (samples[i].d >= d) {
      const a = samples[i - 1];
      const b = samples[i];
      if (b.d === a.d) return b.v;
      const frac = (d - a.d) / (b.d - a.d);
      return a.v + frac * (b.v - a.v);
    }
  }
  return samples[samples.length - 1].v;
}

const TYPE_LABEL = { braking: "FREADA", exit: "SAÍDA", straight: "RETA" };

// Rotulo curto do segmento: "FREADA T3", "SAÍDA T5", "RETA T6→T7".
export function segLabel(seg) {
  const t = TYPE_LABEL[seg.type] || seg.type;
  if (seg.cornerIdx) return `${t} T${seg.cornerIdx}`;
  return seg.name || t;
}

function severityForLoss(delta) {
  if (delta == null) return "info";
  if (delta <= -LOSS_THRESHOLD) return "ok";
  if (delta > 0.2) return "crit";
  if (delta > LOSS_THRESHOLD) return "warn";
  return "info";
}

// Analisa um segmento e devolve { ...seg, severity, tips: [{text,kind}] }.
// `kind`: brake | speed | throttle | grip | line | ok.
function coachSegment(seg, current, reference) {
  const tips = [];
  const { from, to, delta } = seg;
  const severity = severityForLoss(delta);

  // Ganhou tempo ou perda irrelevante: nada a corrigir.
  if (delta == null || delta <= LOSS_THRESHOLD) {
    if (delta != null && delta <= -LOSS_THRESHOLD) {
      tips.push({
        text: "Você ganha tempo aqui — mantenha o que está fazendo.",
        kind: "ok",
      });
    } else {
      tips.push({ text: "Sem perda relevante neste trecho.", kind: "ok" });
    }
    return { ...seg, severity, tips };
  }

  if (seg.type === "braking") {
    const refVmin = minOf(reference, from, to, "v");
    const curVmin = minOf(current, from, to, "v");
    // Procura o ponto de freada um pouco antes do inicio do segmento —
    // a sua volta pode estar freando antes da referencia.
    const win = from - 80;
    const refBrakeD = crossUp(reference, win, to, "br", 0.45);
    const curBrakeD = crossUp(current, win, to, "br", 0.45);
    const curAbs = activeFrac(current, from, to, "abs");
    const refAbs = activeFrac(reference, from, to, "abs");

    if (curVmin != null && refVmin != null) {
      const dv = curVmin - refVmin;
      if (dv < -4) {
        tips.push({
          text: `Velocidade mínima ${Math.round(
            -dv
          )} km/h abaixo da referência — você freia demais. Freie mais leve e carregue mais velocidade na curva.`,
          kind: "speed",
        });
      } else if (dv > 5) {
        tips.push({
          text: `Velocidade mínima ${Math.round(
            dv
          )} km/h acima da referência — entrou rápido demais e provavelmente correu para fora. Freie um pouco mais forte.`,
          kind: "line",
        });
      }
    }

    if (curBrakeD != null && refBrakeD != null) {
      const dd = curBrakeD - refBrakeD;
      if (dd < -8) {
        tips.push({
          text: `Você freia ${Math.round(
            -dd
          )} m cedo demais — atrase o ponto de freada.`,
          kind: "brake",
        });
      } else if (dd > 12 && curAbs > 0.12) {
        tips.push({
          text: `Você freia ${Math.round(
            dd
          )} m tarde demais e trava a roda — antecipe um pouco a freada.`,
          kind: "brake",
        });
      }
    }

    if (curAbs > refAbs + 0.1 && curAbs > 0.15) {
      tips.push({
        text: "O ABS dispara muito na freada — você está travando o freio. Aplique o pico de pressão e solte de forma progressiva.",
        kind: "grip",
      });
    }
  } else if (seg.type === "exit") {
    const win = to + 80;
    const refThrD = crossUp(reference, from, win, "th", 0.95);
    const curThrD = crossUp(current, from, win, "th", 0.95);
    const curTc = activeFrac(current, from, to, "tc");
    const refTc = activeFrac(reference, from, to, "tc");
    const curExitV = speedAt(current, to);
    const refExitV = speedAt(reference, to);

    if (curThrD != null && refThrD != null) {
      const dd = curThrD - refThrD;
      if (dd > 10) {
        tips.push({
          text: `Você abre o gás todo ${Math.round(
            dd
          )} m depois da referência — antecipe a aceleração na saída.`,
          kind: "throttle",
        });
      }
    }

    if (curTc > refTc + 0.1 && curTc > 0.15) {
      tips.push({
        text: "O controle de tração corta na saída — você acelera cedo ou forte demais. Abra o gás de forma mais progressiva.",
        kind: "grip",
      });
    }

    if (curExitV != null && refExitV != null && curExitV < refExitV - 4) {
      tips.push({
        text: `Você termina a curva ${Math.round(
          refExitV - curExitV
        )} km/h mais devagar — essa perda se arrasta para a reta seguinte.`,
        kind: "speed",
      });
    }
  } else if (seg.type === "straight") {
    const curEntryV = speedAt(current, from);
    const refEntryV = speedAt(reference, from);
    const curPeak = maxOf(current, from, to, "v");
    const refPeak = maxOf(reference, from, to, "v");

    if (curEntryV != null && refEntryV != null && curEntryV < refEntryV - 4) {
      tips.push({
        text: `Você entra na reta ${Math.round(
          refEntryV - curEntryV
        )} km/h mais devagar — a perda vem da saída da curva anterior. Trabalhe a saída antes desta reta.`,
        kind: "speed",
      });
    } else if (
      curPeak != null &&
      refPeak != null &&
      curPeak < refPeak - 3
    ) {
      tips.push({
        text: `Velocidade de pico ${Math.round(
          refPeak - curPeak
        )} km/h menor na reta — confira as trocas de marcha e se não está levantando o pé cedo.`,
        kind: "throttle",
      });
    }
  }

  if (tips.length === 0) {
    tips.push({
      text: "Você perde tempo aqui, mas os canais estão próximos da referência — provavelmente é traçado/linha. Veja o mapa do trecho.",
      kind: "line",
    });
  }

  return { ...seg, severity, tips };
}

// Analisa todos os segmentos. Devolve { segments, summary }.
// `summary`: { totalLoss, byType, worst } — worst e o segmento de maior perda.
export function coachLap(deltas, current, reference) {
  if (!deltas || !deltas.length || !current || !reference) {
    return { segments: [], summary: null };
  }
  const segments = deltas.map((seg) =>
    coachSegment(seg, current, reference)
  );

  const byType = { braking: 0, exit: 0, straight: 0 };
  let totalLoss = 0;
  for (const s of segments) {
    if (s.delta == null) continue;
    totalLoss += s.delta;
    if (byType[s.type] != null) byType[s.type] += s.delta;
  }

  const losers = segments
    .filter((s) => s.delta != null && s.delta > LOSS_THRESHOLD)
    .sort((a, b) => b.delta - a.delta);

  return {
    segments,
    summary: {
      totalLoss,
      byType,
      worst: losers,
    },
  };
}

function median(arr) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// Severidade de um erro recorrente: recorrencia alta + perda relevante
// = habito a corrigir; recorrencia baixa = erro isolado.
function consistencySeverity(recurrence, medianLoss) {
  if (!recurrence || recurrence < 0.3) return "info";
  if (recurrence >= 0.6 && (medianLoss || 0) > 0.05) return "crit";
  if (recurrence >= 0.45) return "warn";
  return "info";
}

// Cruza varias voltas suas com a referencia e mede a CONSISTENCIA de cada
// erro: em quantas voltas o mesmo problema reaparece no mesmo trecho.
// `laps`: [{ id, label, samples }]. `segments`: saida de detectSegments
// rodada na referencia. Erro que aparece na maioria das voltas e habito;
// erro que aparece em poucas e ruido e nao deve guiar a sua pratica.
export function coachConsistency({ segments, reference, laps }) {
  if (!segments?.length || !reference || !laps?.length) {
    return { segments: [], ranked: [], lapsAnalyzed: 0, summary: null };
  }

  // Acumulador por segmento (indexado pela posicao em `segments`).
  const acc = segments.map((seg) => ({
    seg,
    deltas: [], // todos os deltas validos (perda ou ganho)
    losses: [], // so os deltas > LOSS_THRESHOLD
    kinds: {}, // contagem de tips[0].kind nas voltas que perderam
    tipByLoss: [], // [{ loss, tip }] das voltas que perderam
  }));

  let lapsAnalyzed = 0;
  for (const lap of laps) {
    if (!lap.samples || lap.samples.length < 20) continue;
    const deltas = segmentDeltas(lap.samples, reference, segments);
    let counted = false;
    deltas.forEach((d, i) => {
      const a = acc[i];
      if (d.delta == null) return;
      counted = true;
      a.deltas.push(d.delta);
      if (d.delta > LOSS_THRESHOLD) {
        const cs = coachSegment(d, lap.samples, reference);
        const tip = cs.tips[0] || { text: "", kind: "line" };
        a.losses.push(d.delta);
        a.kinds[tip.kind] = (a.kinds[tip.kind] || 0) + 1;
        a.tipByLoss.push({ loss: d.delta, tip });
      }
    });
    if (counted) lapsAnalyzed++;
  }

  const out = acc.map(({ seg, deltas, losses, kinds, tipByLoss }) => {
    const lapsTotal = deltas.length;
    const lapsLost = losses.length;
    const recurrence = lapsTotal ? lapsLost / lapsTotal : 0;
    const medianLoss = median(losses);
    const worstLoss = losses.length ? Math.max(...losses) : null;

    // Tip representativo: o da volta cuja perda fica na mediana — um
    // exemplo concreto, nem o melhor nem o pior caso.
    let tip = null;
    if (tipByLoss.length) {
      const sorted = [...tipByLoss].sort((a, b) => a.loss - b.loss);
      tip = sorted[sorted.length >> 1].tip;
    }

    let dominantKind = null;
    let best = 0;
    for (const [k, c] of Object.entries(kinds)) {
      if (c > best) {
        best = c;
        dominantKind = k;
      }
    }

    return {
      ...seg,
      lapsTotal,
      lapsLost,
      recurrence,
      medianLoss,
      worstLoss,
      dominantKind,
      tip,
      delta: medianLoss,
      severity: consistencySeverity(recurrence, medianLoss),
    };
  });

  // Recorrentes: erro em pelo menos 2 voltas e em >=30% das analisadas.
  const ranked = out
    .filter((s) => s.lapsLost >= 2 && s.recurrence >= 0.3)
    .sort(
      (a, b) =>
        b.recurrence * (b.medianLoss || 0) -
        a.recurrence * (a.medianLoss || 0)
    );

  const recurringLoss = ranked.reduce(
    (sum, s) => sum + (s.medianLoss || 0),
    0
  );

  return {
    segments: out,
    ranked,
    lapsAnalyzed,
    summary: { recurringLoss, lapsAnalyzed },
  };
}
