// Mapa do coach — tracado da volta de referencia com um marcador numerado
// por curva, colorido pela perda tipica (verde = ok, vermelho = onde focar).

const VB_W = 1000;
const VB_H = 700;
const PAD = 50;

function lossColor(loss, maxLoss) {
  const t = maxLoss > 0 ? Math.min(1, loss / maxLoss) : 0;
  if (t < 0.33) return "var(--ok)";
  if (t < 0.66) return "var(--warn)";
  return "var(--crit)";
}

export default function CoachMap({ path, corners, selected, onSelect }) {
  if (!path || path.length < 3) return null;

  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const p of path) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.z < minZ) minZ = p.z;
    if (p.z > maxZ) maxZ = p.z;
  }
  const spanX = maxX - minX || 1;
  const spanZ = maxZ - minZ || 1;
  const scale = Math.min((VB_W - 2 * PAD) / spanX, (VB_H - 2 * PAD) / spanZ);
  const offX = (VB_W - spanX * scale) / 2;
  const offY = (VB_H - spanZ * scale) / 2;
  const px = (x) => offX + (x - minX) * scale;
  const py = (z) => offY + (z - minZ) * scale;

  const d = path
    .map((p, i) => `${i === 0 ? "M" : "L"}${px(p.x).toFixed(1)},${py(p.z).toFixed(1)}`)
    .join(" ");
  const maxLoss = Math.max(0, ...corners.map((c) => c.loss));

  return (
    <svg
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      style={{ width: "100%", height: "auto", display: "block" }}
    >
      <path d={d} fill="none" stroke="var(--bd-2)" strokeWidth={10} strokeLinejoin="round" />
      <path d={d} fill="none" stroke="var(--bg-3)" strokeWidth={6} strokeLinejoin="round" />
      {corners.map((c) => {
        const active = selected === c.idx;
        const color = lossColor(c.loss, maxLoss);
        return (
          <g
            key={c.idx}
            transform={`translate(${px(c.pos.x)}, ${py(c.pos.z)})`}
            onClick={() => onSelect?.(active ? null : c.idx)}
            style={{ cursor: "pointer" }}
          >
            <circle
              r={active ? 24 : 18}
              fill="var(--bg-0)"
              stroke={color}
              strokeWidth={active ? 4 : 3}
            />
            <text
              className="mono"
              textAnchor="middle"
              dominantBaseline="central"
              fill={active ? "var(--tx-0)" : color}
              style={{ fontSize: 15, fontWeight: 700 }}
            >
              {c.idx}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
