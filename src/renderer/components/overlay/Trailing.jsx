// Grafico historico de inputs (throttle/brake) dos ultimos N segundos.
// Quando showReference=true e refSamples disponivel, sobrepoe ref atras.

import { useEffect, useRef, useState } from "react";

const WIDTH = 360;
const HEIGHT = 90;
const WINDOW_S = 10; // segundos visiveis no grafico
const GREEN = "#3ecf65";
const RED = "#e6403d";
const YELLOW = "#ffd64a"; // ABS/TC ativos

// Interpola th/br no array de ref samples (ordenados por d) na distancia d.
function interpRef(samples, d, key) {
  if (!samples || samples.length === 0) return null;
  if (d <= samples[0].d) return samples[0][key];
  const last = samples[samples.length - 1];
  if (d >= last.d) return last[key];
  let lo = 0;
  let hi = samples.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (samples[mid].d <= d) lo = mid;
    else hi = mid;
  }
  const a = samples[lo];
  const b = samples[hi];
  const span = b.d - a.d || 1;
  const frac = (d - a.d) / span;
  return a[key] + frac * (b[key] - a[key]);
}

function buildPath(points, getY) {
  if (points.length < 2) return "";
  let p = `M ${points[0].x.toFixed(1)} ${getY(points[0]).toFixed(1)}`;
  for (let i = 1; i < points.length; i++) {
    p += ` L ${points[i].x.toFixed(1)} ${getY(points[i]).toFixed(1)}`;
  }
  return p;
}

export default function Trailing({ tick, refSamples, showReference }) {
  const bufferRef = useRef([]);
  const [, force] = useState(0);

  // Adiciona ponto novo no buffer (mantendo so os ultimos WINDOW_S segundos)
  useEffect(() => {
    if (!tick) return;
    const now = performance.now() / 1000;
    bufferRef.current.push({
      t: now,
      throttle: tick.throttle ?? 0,
      brake: tick.brake ?? 0,
      abs: tick.absActive ? 1 : 0,
      tc: tick.tcActive ? 1 : 0,
      d: tick.lapDist ?? 0,
    });
    const cutoff = now - WINDOW_S;
    while (bufferRef.current.length && bufferRef.current[0].t < cutoff) {
      bufferRef.current.shift();
    }
    force((n) => (n + 1) & 0xffff);
  }, [tick]);

  const buf = bufferRef.current;
  const t1 = buf.length ? buf[buf.length - 1].t : 0;
  const t0 = t1 - WINDOW_S;

  // Mapeia cada ponto pra coordenadas SVG
  const points = buf.map((p) => ({
    ...p,
    x: ((p.t - t0) / WINDOW_S) * WIDTH,
  }));

  const yThr = (p) => HEIGHT - p.throttle * HEIGHT;
  const yBr = (p) => HEIGHT - p.brake * HEIGHT;

  // Ref overlay: pra cada ponto da buffer, busca th/br do ref na mesma distancia
  const refPoints =
    showReference && refSamples && refSamples.length > 0
      ? points.map((p) => ({
          x: p.x,
          throttle: interpRef(refSamples, p.d, "th") ?? 0,
          brake: interpRef(refSamples, p.d, "br") ?? 0,
        }))
      : null;

  // Segmentos onde ABS/TC estavam ativos — agrupa pontos consecutivos
  // pra desenhar uma faixa continua em vez de N retangulos.
  function buildEventSegments(key) {
    const segs = [];
    let start = null;
    for (let i = 0; i < points.length; i++) {
      if (points[i][key]) {
        if (start === null) start = points[i].x;
      } else if (start !== null) {
        segs.push([start, points[i - 1]?.x ?? start]);
        start = null;
      }
    }
    if (start !== null) {
      segs.push([start, points[points.length - 1].x]);
    }
    return segs;
  }
  const absSegs = buildEventSegments("abs");
  const tcSegs = buildEventSegments("tc");

  const currentABS = !!tick?.absActive;
  const currentTC = !!tick?.tcActive;

  return (
    <div
      style={{
        background: "rgba(0,0,0,0.55)",
        border: "1px solid rgba(255,255,255,0.1)",
        padding: 4,
        fontFamily:
          "'JetBrains Mono', 'Geist Mono', ui-monospace, monospace",
      }}
    >
      <svg width={WIDTH} height={HEIGHT} style={{ display: "block" }}>
        {/* Linha 50% pra referencia visual */}
        <line
          x1={0}
          x2={WIDTH}
          y1={HEIGHT / 2}
          y2={HEIGHT / 2}
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={1}
          strokeDasharray="2,3"
        />

        {/* Ref overlay (faded) */}
        {refPoints && refPoints.length >= 2 && (
          <>
            <path
              d={buildPath(refPoints, yThr)}
              fill="none"
              stroke={GREEN}
              strokeWidth={2}
              strokeOpacity={0.35}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            <path
              d={buildPath(refPoints, yBr)}
              fill="none"
              stroke={RED}
              strokeWidth={2}
              strokeOpacity={0.35}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          </>
        )}

        {/* Atual */}
        {points.length >= 2 && (
          <>
            <path
              d={buildPath(points, yThr)}
              fill="none"
              stroke={GREEN}
              strokeWidth={1.6}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            <path
              d={buildPath(points, yBr)}
              fill="none"
              stroke={RED}
              strokeWidth={1.6}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          </>
        )}

        {/* Faixa TC no topo (acima do throttle), faixa ABS na base (abaixo
            do brake). Marca onde os aids estavam intervindo. */}
        {tcSegs.map(([x0, x1], i) => (
          <line
            key={`tc-${i}`}
            x1={x0}
            x2={x1}
            y1={2}
            y2={2}
            stroke={YELLOW}
            strokeWidth={2.5}
            strokeLinecap="round"
          />
        ))}
        {absSegs.map(([x0, x1], i) => (
          <line
            key={`abs-${i}`}
            x1={x0}
            x2={x1}
            y1={HEIGHT - 2}
            y2={HEIGHT - 2}
            stroke={YELLOW}
            strokeWidth={2.5}
            strokeLinecap="round"
          />
        ))}
      </svg>
      <div
        style={{
          fontSize: 9,
          letterSpacing: "0.1em",
          color: "rgba(255,255,255,0.55)",
          marginTop: 2,
          textAlign: "center",
          textShadow: "0 1px 2px rgba(0,0,0,0.9)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
        }}
      >
        <span
          style={{
            color: currentTC ? YELLOW : "rgba(255,255,255,0.25)",
            fontWeight: currentTC ? 700 : 400,
          }}
        >
          TC
        </span>
        <span>
          {WINDOW_S}s{showReference && refSamples ? " · REF" : ""}
        </span>
        <span
          style={{
            color: currentABS ? YELLOW : "rgba(255,255,255,0.25)",
            fontWeight: currentABS ? 700 : 400,
          }}
        >
          ABS
        </span>
      </div>
    </div>
  );
}
