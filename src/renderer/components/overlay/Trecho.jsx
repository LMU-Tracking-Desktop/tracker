// Delta do ultimo micro-setor completado. Numero pequeno colorido.

const GREEN = "#3ecf65";
const RED = "#e6403d";
const NEUTRAL = "rgba(255,255,255,0.85)";

export default function Trecho({ microDelta, hasRef }) {
  const color = !hasRef
    ? NEUTRAL
    : microDelta == null
      ? NEUTRAL
      : Math.abs(microDelta) < 0.005
        ? NEUTRAL
        : microDelta < 0
          ? GREEN
          : RED;

  const text = !hasRef
    ? "—"
    : microDelta == null
      ? "—"
      : `${microDelta >= 0 ? "+" : ""}${microDelta.toFixed(3)}`;

  return (
    <div
      style={{
        padding: "4px 10px",
        background: "rgba(0,0,0,0.5)",
        border: "1px solid rgba(255,255,255,0.1)",
        display: "flex",
        gap: 8,
        alignItems: "baseline",
        fontFamily:
          "'JetBrains Mono', 'Geist Mono', ui-monospace, monospace",
        textShadow: "0 1px 2px rgba(0,0,0,0.95)",
      }}
    >
      <span
        style={{
          fontSize: 10,
          letterSpacing: "0.12em",
          color: "rgba(255,255,255,0.55)",
        }}
      >
        TRECHO
      </span>
      <span
        style={{
          fontSize: 16,
          fontWeight: 700,
          color,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {text}
      </span>
    </div>
  );
}
