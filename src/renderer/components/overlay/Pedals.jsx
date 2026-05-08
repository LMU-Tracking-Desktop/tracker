// Pedais: barras verticais throttle (verde) + brake (vermelho).
// throttle/brake: 0..1.

const W = 26;
const H = 110;
const GAP = 6;

function Bar({ value, color, label }) {
  const pct = Math.max(0, Math.min(1, value || 0));
  const fillH = Math.round(pct * H);
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
      <div
        style={{
          width: W,
          height: H,
          background: "rgba(0, 0, 0, 0.55)",
          border: "1px solid rgba(255, 255, 255, 0.18)",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: fillH,
            background: color,
            transition: "height 30ms linear",
          }}
        />
      </div>
      <div
        style={{
          fontSize: 10,
          letterSpacing: "0.08em",
          color: "rgba(255, 255, 255, 0.85)",
          textShadow: "0 1px 2px rgba(0,0,0,0.9)",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: "#fff",
          textShadow: "0 1px 2px rgba(0,0,0,0.9)",
          minWidth: 28,
          textAlign: "center",
        }}
      >
        {Math.round(pct * 100)}
      </div>
    </div>
  );
}

export default function Pedals({ throttle, brake }) {
  return (
    <div style={{ display: "flex", gap: GAP, padding: 6 }}>
      <Bar value={brake} color="#e6403d" label="BR" />
      <Bar value={throttle} color="#3ecf65" label="TH" />
    </div>
  );
}
