// Mapa de erros — desenha o tracado da pista (a partir do x/z dos bins) e
// pinta cada trecho conforme a camada selecionada. Top-down, escala uniforme.

const VB_W = 1000;
const VB_H = 700;
const PAD = 50;

// Gradiente verde → amarelo → vermelho. t em 0..1 (0 = bom, 1 = ruim).
function heat(t) {
  t = Math.max(0, Math.min(1, t));
  if (t < 0.5) {
    const u = t / 0.5;
    return `rgb(${Math.round(62 + u * 178)}, ${Math.round(
      207 - u * 7
    )}, ${Math.round(101 - u * 41)})`;
  }
  const u = (t - 0.5) / 0.5;
  return `rgb(${Math.round(240 - u * 10)}, ${Math.round(
    200 - u * 136
  )}, ${Math.round(60)})`;
}

// Valor "ruim" de cada bin por camada (sempre: maior = pior).
function layerValue(bin, layer) {
  switch (layer) {
    case "abstc":
      return Math.max(bin.absFreq || 0, bin.tcFreq || 0);
    case "speed":
      return bin.refMinSpeed != null && bin.minSpeed != null
        ? Math.max(0, bin.refMinSpeed - bin.minSpeed)
        : 0;
    case "consistency":
      return bin.stdDelta || 0;
    case "delta":
    default:
      return Math.max(0, bin.avgDelta || 0);
  }
}

export default function ErrorMap({ bins, layer, hoveredIndex, onHoverBin }) {
  if (!bins || bins.length < 3) return null;

  // Bounding box dos pontos
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const b of bins) {
    if (b.x < minX) minX = b.x;
    if (b.x > maxX) maxX = b.x;
    if (b.z < minZ) minZ = b.z;
    if (b.z > maxZ) maxZ = b.z;
  }
  const spanX = maxX - minX || 1;
  const spanZ = maxZ - minZ || 1;
  const scale = Math.min(
    (VB_W - 2 * PAD) / spanX,
    (VB_H - 2 * PAD) / spanZ
  );
  const offX = (VB_W - spanX * scale) / 2;
  const offY = (VB_H - spanZ * scale) / 2;
  // z invertido (SVG y cresce pra baixo)
  const pt = (b) => ({
    x: offX + (b.x - minX) * scale,
    y: offY + (maxZ - b.z) * scale,
  });

  const values = bins.map((b) => layerValue(b, layer));
  const maxVal = Math.max(...values, 1e-6);

  const pts = bins.map(pt);

  // Segmentos: bin k → bin k+1, fechando o circuito
  const segments = [];
  for (let k = 0; k < bins.length; k++) {
    const a = pts[k];
    const b = pts[(k + 1) % bins.length];
    segments.push({ k, a, b, color: heat(values[k] / maxVal) });
  }

  return (
    <svg
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      style={{ width: "100%", height: "auto", display: "block" }}
    >
      {/* Trilha base escura por baixo, pra dar corpo ao tracado */}
      {segments.map((s) => (
        <line
          key={`bg-${s.k}`}
          x1={s.a.x}
          y1={s.a.y}
          x2={s.b.x}
          y2={s.b.y}
          stroke="rgba(0,0,0,0.6)"
          strokeWidth={16}
          strokeLinecap="round"
        />
      ))}
      {/* Segmentos coloridos */}
      {segments.map((s) => (
        <line
          key={`fg-${s.k}`}
          x1={s.a.x}
          y1={s.a.y}
          x2={s.b.x}
          y2={s.b.y}
          stroke={s.color}
          strokeWidth={hoveredIndex === s.k ? 16 : 10}
          strokeLinecap="round"
        />
      ))}
      {/* Hit areas (invisiveis, mais grossas) pra hover */}
      {segments.map((s) => (
        <line
          key={`hit-${s.k}`}
          x1={s.a.x}
          y1={s.a.y}
          x2={s.b.x}
          y2={s.b.y}
          stroke="transparent"
          strokeWidth={26}
          strokeLinecap="round"
          style={{ cursor: "pointer" }}
          onMouseEnter={() => onHoverBin?.(s.k)}
          onMouseLeave={() => onHoverBin?.(null)}
        />
      ))}
      {/* Marcador de largada/chegada */}
      {pts[0] && (
        <circle
          cx={pts[0].x}
          cy={pts[0].y}
          r={9}
          fill="none"
          stroke="var(--tx-0)"
          strokeWidth={2.5}
        />
      )}
    </svg>
  );
}
