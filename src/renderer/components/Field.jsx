export function FieldLabel({ children }) {
  return (
    <span
      className="mono"
      style={{
        fontSize: 10,
        letterSpacing: "0.14em",
        color: "var(--tx-2)",
        textTransform: "uppercase",
      }}
    >
      {children}
    </span>
  );
}

export function Field({ label, children, hint }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <FieldLabel>{label}</FieldLabel>
      {children}
      {hint && (
        <span
          className="mono"
          style={{
            fontSize: 10,
            letterSpacing: "0.06em",
            color: "var(--tx-3)",
            lineHeight: 1.5,
          }}
        >
          {hint}
        </span>
      )}
    </div>
  );
}
