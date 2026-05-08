// Grafico historico de inputs (throttle/brake) dos ultimos N segundos.
// Quando showReference=true e refSamples disponivel, sobrepoe ref atras.

import { useEffect, useRef, useState } from "react";

const WIDTH = 360;
const HEIGHT = 90;
const WINDOW_S = 10; // segundos visiveis no grafico
const GREEN = "#3ecf65";
const RED = "#e6403d";

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
      </svg>
      <div
        style={{
          fontSize: 9,
          letterSpacing: "0.1em",
          color: "rgba(255,255,255,0.55)",
          marginTop: 2,
          textAlign: "center",
          textShadow: "0 1px 2px rgba(0,0,0,0.9)",
        }}
      >
        {WINDOW_S}s {showReference && refSamples ? "· REF" : ""}
      </div>
    </div>
  );
}
