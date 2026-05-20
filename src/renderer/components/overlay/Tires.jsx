// Status dos pneus — mostra SEMPRE desgaste + temperatura juntos.
// O toggle showTemp so decide qual fica em destaque (numero grande) e qual
// vira sub-info pequena. Layout 2x2 (FL FR / RL RR).

function colorForWear(health) {
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

// Janela ideal aproximada de pneu de corrida: ~80-100C. Frio = azul,
// ideal = verde, quente = vermelho.
function colorForTemp(c) {
  if (c <= 0) return "rgb(120,120,130)"; // sem dado
  if (c < 70) {
    const t = Math.max(0, (c - 40) / 30);
    return `rgb(${Math.round(70 + t * 60)}, ${Math.round(140 + t * 60)}, 230)`;
  }
  if (c <= 100) {
    const t = (c - 70) / 30;
    return `rgb(${Math.round(80 + t * 160)}, 200, ${Math.round(80 - t * 40)})`;
  }
  const t = Math.min(1, (c - 100) / 30);
  return `rgb(240, ${Math.round(160 - t * 120)}, 40)`;
}

function Cell({ label, primary, secondary }) {
  return (
    <div
      style={{
        width: 40,
        height: 44,
        background: "rgba(0,0,0,0.6)",
        border: `2px solid ${primary.color}`,
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
          lineHeight: 1,
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: 14,
          fontWeight: 700,
          color: primary.color,
          fontVariantNumeric: "tabular-nums",
          lineHeight: 1,
        }}
      >
        {primary.value}
      </span>
      <span
        style={{
          fontSize: 9,
          fontWeight: 600,
          color: secondary.color,
          fontVariantNumeric: "tabular-nums",
          lineHeight: 1,
        }}
      >
        {secondary.value}
      </span>
    </div>
  );
}

export default function Tires({ tireWear, tireTemp, mode = "wear" }) {
  const wear = tireWear || [0, 0, 0, 0];
  const temp = tireTemp || [0, 0, 0, 0];
  const tempPrimary = mode === "temp";
  const labels = ["FL", "FR", "RL", "RR"];

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
        fontFamily: "'JetBrains Mono', 'Geist Mono', ui-monospace, monospace",
      }}
    >
      {labels.map((label, i) => {
        const pct = Math.max(0, Math.min(100, Math.round(wear[i] * 100)));
        const c = Math.round(temp[i]);
        const wearInfo = { value: `${pct}%`, color: colorForWear(wear[i]) };
        const tempInfo = {
          value: c > 0 ? `${c}°` : "—",
          color: colorForTemp(temp[i]),
        };
        return (
          <Cell
            key={label}
            label={label}
            primary={tempPrimary ? tempInfo : wearInfo}
            secondary={tempPrimary ? wearInfo : tempInfo}
          />
        );
      })}
    </div>
  );
}
