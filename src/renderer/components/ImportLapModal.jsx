import { useState } from "react";

export default function ImportLapModal({ open, onClose, onImported }) {
  const [text, setText] = useState("");
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  const tryParse = (s) => {
    setError(null);
    if (!s.trim()) {
      setPreview(null);
      return;
    }
    try {
      const obj = JSON.parse(s);
      if (obj?.__fmt !== "lmu-lap/1") {
        setError("formato nao reconhecido");
        setPreview(null);
        return;
      }
      setPreview(obj);
    } catch (e) {
      setError("JSON invalido");
      setPreview(null);
    }
  };

  const handleChange = (e) => {
    setText(e.target.value);
    tryParse(e.target.value);
  };

  const handlePaste = async () => {
    try {
      const s = await navigator.clipboard.readText();
      setText(s);
      tryParse(s);
    } catch {
      setError("sem permissao pro clipboard");
    }
  };

  const handleImport = async () => {
    if (!preview || saving) return;
    setSaving(true);
    const res = await window.api?.createImport?.(preview);
    setSaving(false);
    if (res?.ok) {
      onImported?.(res.id, res.replacedNote);
      setText("");
      setPreview(null);
      setError(null);
      onClose();
    } else {
      setError(res?.error || "erro ao importar");
    }
  };

  const fmtTime = (t) => {
    if (t == null || t <= 0) return "—";
    const m = Math.floor(t / 60);
    const s = (t % 60).toFixed(3).padStart(6, "0");
    return `${m}:${s}`;
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0, 0, 0, 0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 50,
      }}
      onClick={onClose}
    >
      <div
        className="border hairline"
        style={{
          background: "var(--background)",
          width: "min(640px, 92vw)",
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-3 border-b hairline flex items-center justify-between">
          <span className="mono text-[11px] tracking-[0.2em]">
            IMPORTAR VOLTA
          </span>
          <button
            type="button"
            className="delete-btn always"
            onClick={onClose}
            title="Fechar"
          >
            ✕
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          <div className="flex items-center gap-2">
            <button type="button" className="btn" onClick={handlePaste}>
              COLAR DO CLIPBOARD
            </button>
            <span className="mono text-[10px] tracking-widest text-muted">
              ou cola no textarea abaixo
            </span>
          </div>

          <textarea
            className="input"
            rows={8}
            placeholder='Cole o JSON da volta aqui (formato {"__fmt":"lmu-lap/1",...})'
            value={text}
            onChange={handleChange}
            style={{ fontFamily: "ui-monospace, monospace", fontSize: 11 }}
          />

          {error && (
            <div
              className="mono text-[11px] tracking-widest"
              style={{ color: "var(--accent)" }}
            >
              {error}
            </div>
          )}

          <div className="mono text-[10px] tracking-widest text-muted">
            Limite: ate 3 voltas por pista + classe. Se ja tiver 3, a nova so
            entra se for mais rapida que a mais lenta, e substitui ela.
          </div>

          {preview && (
            <div
              className="border hairline p-3"
              style={{ background: "var(--surface)" }}
            >
              <div className="mono text-[10px] tracking-[0.2em] text-muted mb-2">
                PREVIEW
              </div>
              <div className="mono text-[12px] space-y-1">
                <div>
                  <span className="text-muted">piloto: </span>
                  {preview.owner}
                </div>
                <div>
                  <span className="text-muted">pista: </span>
                  {preview.track}
                </div>
                <div>
                  <span className="text-muted">carro: </span>
                  {preview.car}{" "}
                  <span className="text-muted">[{preview.carClass}]</span>
                </div>
                <div>
                  <span className="text-muted">volta {preview.lapNumber}: </span>
                  <span style={{ color: "var(--accent)" }}>
                    {fmtTime(preview.lapTime)}
                  </span>
                  <span className="text-muted ml-2">
                    ({preview.type?.toUpperCase()})
                  </span>
                </div>
                <div>
                  <span className="text-muted">telemetria: </span>
                  {preview.telemetry?.length
                    ? `${preview.telemetry.length} samples`
                    : "nenhuma"}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t hairline flex items-center justify-end gap-2">
          <button type="button" className="btn" onClick={onClose}>
            CANCELAR
          </button>
          <button
            type="button"
            className="btn"
            disabled={!preview || saving}
            onClick={handleImport}
            style={{
              opacity: !preview || saving ? 0.5 : 1,
              color: "var(--accent)",
              borderColor: "var(--accent)",
            }}
          >
            {saving ? "IMPORTANDO..." : "IMPORTAR"}
          </button>
        </div>
      </div>
    </div>
  );
}
