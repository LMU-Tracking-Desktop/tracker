export default function TrackSelect({
  tracks,
  value,
  onChange,
  label = "Pista",
  includeAll = false,
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span
        className="mono"
        style={{
          fontSize: 10,
          letterSpacing: "0.14em",
          color: "var(--tx-2)",
          textTransform: "uppercase",
        }}
      >
        {label}
      </span>
      <select
        className="select"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
      >
        <option value="">{includeAll ? "todas as pistas" : "Selecione uma pista"}</option>
        {tracks.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
    </div>
  );
}
