import { memo, useMemo } from "react";

const MAX_POINTS = 600;

function subsample(arr, target) {
  if (arr.length <= target) return arr;
  const out = new Array(target);
  const step = (arr.length - 1) / (target - 1);
  for (let i = 0; i < target; i++) out[i] = arr[Math.round(i * step)];
  return out;
}

function extractPoints(samples) {
  if (!samples) return [];
  return samples
    .filter((s) => typeof s.x === "number" && typeof s.z === "number")
    .map((s) => ({ x: s.x, z: s.z, d: s.d }));
}

function SegmentMiniMapBase({
  telemetry,
  segmentFrom,
  segmentTo,
  highlightColor,
  width = 200,
  height = 140,
  showStartEnd = false,
}) {
  const geom = useMemo(() => {
    if (!telemetry || telemetry.length < 10) return null;
    const pts = extractPoints(telemetry);
    if (pts.length < 5) return null;

    const sub = subsample(pts, MAX_POINTS);
    const allX = sub.map((p) => p.x);
    const allZ = sub.map((p) => p.z);
    const minX = Math.min(...allX);
    const maxX = Math.max(...allX);
    const minZ = Math.min(...allZ);
    const maxZ = Math.max(...allZ);
    const trackW = Math.max(1, maxX - minX);
    const trackH = Math.max(1, maxZ - minZ);

    const pad = 8;
    const scaleX = (width - pad * 2) / trackW;
    const scaleY = (height - pad * 2) / trackH;
    const scale = Math.min(scaleX, scaleY);
    const drawW = trackW * scale;
    const drawH = trackH * scale;
    const offsetX = (width - drawW) / 2;
    const offsetY = (height - drawH) / 2;

    const project = (p) => ({
      x: offsetX + (p.x - minX) * scale,
      y: offsetY + drawH - (p.z - minZ) * scale,
      d: p.d,
    });

    return { projected: sub.map(project) };
  }, [telemetry, width, height]);

  if (!geom) return null;

  const { projected } = geom;

  const inSegment = (d) => d >= segmentFrom && d <= segmentTo;

  // Linha base inteira (cinza fraco) + sobreposicao colorida no segmento
  const baseSegments = [];
  const hiSegments = [];
  for (let i = 1; i < projected.length; i++) {
    const a = projected[i - 1];
    const b = projected[i];
    baseSegments.push({ a, b, key: `b${i}` });
    if (inSegment(a.d) || inSegment(b.d)) {
      hiSegments.push({ a, b, key: `h${i}` });
    }
  }

  // Pontos de entrada e saida do segmento (start/end)
  let startPt = null;
  let endPt = null;
  if (showStartEnd) {
    let bestStartDiff = Infinity;
    let bestEndDiff = Infinity;
    for (const p of projected) {
      const ds = Math.abs(p.d - segmentFrom);
      const de = Math.abs(p.d - segmentTo);
      if (ds < bestStartDiff) {
        bestStartDiff = ds;
        startPt = p;
      }
      if (de < bestEndDiff) {
        bestEndDiff = de;
        endPt = p;
      }
    }
  }

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMidYMid meet"
      style={{ width: "100%", height: "100%", display: "block" }}
    >
      {/* base: pista inteira em cinza fraco */}
      <g>
        {baseSegments.map((s) => (
          <line
            key={s.key}
            x1={s.a.x}
            y1={s.a.y}
            x2={s.b.x}
            y2={s.b.y}
            stroke="rgba(120, 120, 130, 0.35)"
            strokeWidth={1.5}
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </g>
      {/* segmento em destaque */}
      <g>
        {hiSegments.map((s) => (
          <line
            key={s.key}
            x1={s.a.x}
            y1={s.a.y}
            x2={s.b.x}
            y2={s.b.y}
            stroke={highlightColor}
            strokeWidth={3}
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </g>
      {/* pontos de entrada/saida do segmento */}
      {showStartEnd && startPt && (
        <circle
          cx={startPt.x}
          cy={startPt.y}
          r={3.5}
          fill="var(--bg-0)"
          stroke={highlightColor}
          strokeWidth={1.5}
        />
      )}
      {showStartEnd && endPt && (
        <circle
          cx={endPt.x}
          cy={endPt.y}
          r={3.5}
          fill={highlightColor}
          stroke="var(--bg-0)"
          strokeWidth={1}
        />
      )}
    </svg>
  );
}

export default memo(SegmentMiniMapBase);
