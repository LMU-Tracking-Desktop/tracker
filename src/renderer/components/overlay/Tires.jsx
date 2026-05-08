// Status dos pneus por mWear. Em LMU, mWear e a vida RESTANTE do pneu
// (1.0 = novo, 0.0 = careca) — nao a fracao desgastada. Verde quando cheio,
// transiciona pra amarelo e depois vermelho conforme desgasta.
// Layout 2x2 (FL FR / RL RR).

function colorFor(health) {
  const h = Math.max(0, Math.min(1, health));
  if (h > 0.6) {
    const t = (h - 0.6) / 0.4;
    const r = Math.round(60 + (1 - t) * 200);
    return `rgb(${Math.min(255, r)}, 200, 60)`;
  }
  if (h > 0.3) {
    const t = (h - 0.3) / 0.3;
    return `rgb(240, ${Math.round(100 + t * 120)}, 40)`;
  }
  const t = h / 0.3;
  return `rgb(230, ${Math.round(40 + t * 60)}, 40)`;
}

function Cell({ health, label }) {
  const pct = Math.max(0, Math.min(100, Math.round(health * 100)));
  const color = colorFor(health);
  return (
    <div
      style={{
        width: 36,
        height: 36,
        background: "rgba(0,0,0,0.6)",
        border: `2px solid ${color}`,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 1,
      }}
    >
      <span
        style={{
          fontSize: 8,
          letterSpacing: "0.08em",
          color: "rgba(255,255,255,0.6)",
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: 12,
          fontWeight: 700,
          color,
          fontVariantNumeric: "tabular-nums",
          lineHeight: 1,
        }}
      >
        {pct}
      </span>
    </div>
  );
}

export default function Tires({ tireWear }) {
  // tireWear[i] e na verdade a vida RESTANTE em LMU (1=novo, 0=careca)
  const w = tireWear || [0, 0, 0, 0];
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "auto auto",
        gap: 4,
        padding: 6,
        background: "rgba(0,0,0,0.5)",
        border: "1px solid rgba(255,255,255,0.1)",
        textShadow: "0 1px 2px rgba(0,0,0,0.95)",
        fontFamily:
          "'JetBrains Mono', 'Geist Mono', ui-monospace, monospace",
      }}
    >
      <Cell health={w[0]} label="FL" />
      <Cell health={w[1]} label="FR" />
      <Cell health={w[2]} label="RL" />
      <Cell health={w[3]} label="RR" />
    </div>
  );
}
