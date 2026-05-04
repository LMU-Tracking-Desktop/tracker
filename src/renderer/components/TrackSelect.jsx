export default function TrackSelect({ tracks, value, onChange }) {
  return (
    <label className="block">
      <span className="label">Pista *</span>
      <select
        className="select"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
      >
        <option value="">Selecione uma pista</option>
        {tracks.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
    </label>
  );
}
