const COLORS = {
  race: {
    color: "var(--accent)",
    border: "var(--accent)",
    bg: "rgba(255,45,45,0.08)",
  },
  qualifying: {
    color: "var(--yellow)",
    border: "rgba(255,214,10,0.5)",
    bg: "rgba(255,214,10,0.06)",
  },
  qualy: {
    color: "var(--yellow)",
    border: "rgba(255,214,10,0.5)",
    bg: "rgba(255,214,10,0.06)",
  },
  practice: {
    color: "var(--muted)",
    border: "var(--border)",
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
