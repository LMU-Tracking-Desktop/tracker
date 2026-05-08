export default function PageHeader({ crumbs, actions }) {
  return (
    <div
      className="flex items-center justify-between border-b hairline"
      style={{
        height: 48,
        padding: "0 var(--pad)",
        background: "var(--bg-1)",
        flexShrink: 0,
      }}
    >
      <div className="flex items-center gap-2 mono">
        {crumbs.map((c, i) => (
          <span key={i} className="flex items-center gap-2">
            {i > 0 && (
              <span
                style={{
                  color: "var(--tx-3)",
                  fontSize: 10,
                  letterSpacing: "0.14em",
                }}
              >
                ·
              </span>
            )}
            {c.onClick ? (
              <button
                type="button"
                onClick={c.onClick}
                style={{
                  fontSize: 10,
                  letterSpacing: "0.14em",
                  color: "var(--tx-2)",
                  background: "transparent",
                  border: 0,
                  padding: 0,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  textTransform: "uppercase",
                }}
              >
                {c.label}
              </button>
            ) : (
              <span
                style={{
                  fontSize: 10,
                  letterSpacing: "0.14em",
                  color:
                    i === crumbs.length - 1 ? "var(--tx-0)" : "var(--tx-2)",
                  fontWeight: i === crumbs.length - 1 ? 600 : 400,
                  textTransform: "uppercase",
                }}
              >
                {c.label}
              </span>
            )}
          </span>
        ))}
      </div>
      <div className="flex items-center gap-2">{actions}</div>
    </div>
  );
}
