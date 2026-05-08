const COLORS = {
  race: {
    color: "var(--crit)",
    border: "var(--crit)",
    bg: "rgba(255, 59, 59, 0.08)",
  },
  qualifying: {
    color: "var(--warn)",
    border: "rgba(251, 191, 36, 0.5)",
    bg: "rgba(251, 191, 36, 0.06)",
  },
  qualy: {
    color: "var(--warn)",
    border: "rgba(251, 191, 36, 0.5)",
    bg: "rgba(251, 191, 36, 0.06)",
  },
  practice: {
    color: "var(--tx-2)",
    border: "var(--bd-1)",
  },
  warmup: {
    color: "var(--steer)",
    border: "rgba(74, 214, 255, 0.5)",
    bg: "rgba(74, 214, 255, 0.06)",
  },
  testday: {
    color: "var(--tx-2)",
    border: "var(--bd-1)",
  },
};

export default function TypeBadge({ type }) {
  const key = (type || "").toLowerCase();
  const c = COLORS[key] ?? COLORS.practice;
  return (
    <span
      className="chip"
      style={{
        color: c.color,
        borderColor: c.border,
        background: c.bg,
      }}
    >
      {(type || "").toUpperCase()}
    </span>
  );
}
