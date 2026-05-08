// Delta cumulativo grande. Verde = ganhando, vermelho = perdendo. So 2 cores.

const GREEN = "#3ecf65";
const RED = "#e6403d";
const NEUTRAL = "rgba(255,255,255,0.85)";

export default function Delta({ delta, hasRef }) {
  const color = !hasRef
    ? NEUTRAL
    : delta == null
      ? NEUTRAL
      : Math.abs(delta) < 0.005
        ? NEUTRAL
        : delta < 0
          ? GREEN
          : RED;

  const text = !hasRef
    ? "sem ref"
    : delta == null
      ? "—"
      : `${delta >= 0 ? "+" : ""}${delta.toFixed(3)}`;

  return (
    <div
      style={{
        padding: "3px 10px",
        background: "rgba(0,0,0,0.5)",
        border: "1px solid rgba(255,255,255,0.1)",
        fontSize: 18,
        fontWeight: 700,
        letterSpacing: "0.02em",
        color,
        textShadow: "0 1px 2px rgba(0,0,0,0.95)",
        lineHeight: 1.1,
        fontVariantNumeric: "tabular-nums",
        fontFamily:
          "'JetBrains Mono', 'Geist Mono', ui-monospace, monospace",
      }}
    >
      {text}
    </div>
  );
}
