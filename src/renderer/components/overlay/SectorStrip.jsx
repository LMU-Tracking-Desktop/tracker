// Faixa de micro-setores. So 2 cores: verde (ganhou) ou vermelho (perdeu).
// Buckets nao completados = base escura.

const STRIP_WIDTH = 480;
const STRIP_HEIGHT = 16;
const GREEN = "#3ecf65";
const RED = "#e6403d";
const BASE = "rgba(255,255,255,0.06)";

function bucketColor(d) {
  if (d == null || Math.abs(d) < 0.001) return BASE;
  return d < 0 ? GREEN : RED;
}

export default function SectorStrip({ buckets, bucketCount, progress }) {
  const cells = buckets || new Array(bucketCount).fill(null);
  const cellW = STRIP_WIDTH / cells.length;
  const markerX = Math.max(0, Math.min(1, progress || 0)) * STRIP_WIDTH;

  return (
    <div
      style={{
        position: "relative",
        width: STRIP_WIDTH,
        height: STRIP_HEIGHT,
        display: "flex",
        background: "rgba(0,0,0,0.55)",
        border: "1px solid rgba(255,255,255,0.12)",
        padding: 2,
        gap: 1,
      }}
    >
      {cells.map((d, i) => (
        <div
          key={i}
          style={{
            flex: 1,
            background: bucketColor(d),
          }}
        />
      ))}
      <div
        style={{
          position: "absolute",
          left: markerX - 1,
          top: -2,
          width: 2,
          height: STRIP_HEIGHT + 4,
          background: "#fff",
          boxShadow: "0 0 4px rgba(0,0,0,0.95)",
        }}
      />
    </div>
  );
}
