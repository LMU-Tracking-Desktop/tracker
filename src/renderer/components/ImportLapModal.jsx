import { useState } from "react";
import Modal from "./Modal.jsx";
import { Field } from "./Field.jsx";

export default function ImportLapModal({ open, onClose, onImported }) {
  const [text, setText] = useState("");
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const tryParse = (s) => {
    setError(null);
    if (!s.trim()) {
      setPreview(null);
      return;
    }
    try {
      const obj = JSON.parse(s);
      if (obj?.__fmt !== "lmu-lap/1") {
        setError("formato não reconhecido");
        setPreview(null);
        return;
      }
      setPreview(obj);
    } catch {
      setError("JSON inválido");
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
      setError("sem permissão pro clipboard");
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
    <Modal
      open={open}
      onClose={onClose}
      title="Importar Volta"
      subtitle="Cole o JSON exportado por um amigo"
      width={640}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            CANCELAR
          </button>
          <button
            type="button"
            className={preview && !saving ? "btn solid" : "btn"}
            disabled={!preview || saving}
            onClick={handleImport}
            style={{ opacity: !preview || saving ? 0.5 : 1 }}
          >
            {saving ? "IMPORTANDO..." : "IMPORTAR"}
          </button>
        </>
      }
    >
      <div
        style={{
          padding: "var(--pad)",
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button type="button" className="btn" onClick={handlePaste}>
            COLAR DO CLIPBOARD
          </button>
          <span
            className="mono"
            style={{
              fontSize: 10,
              letterSpacing: "0.14em",
              color: "var(--tx-3)",
              textTransform: "uppercase",
            }}
          >
            ou cola no campo abaixo
          </span>
        </div>

        <Field label="JSON da volta">
          <textarea
            className="input"
            rows={8}
            placeholder='{"__fmt":"lmu-lap/1", ...}'
            value={text}
            onChange={handleChange}
            style={{
              fontFamily: "Geist Mono, ui-monospace, monospace",
              fontSize: 11,
              lineHeight: 1.4,
              resize: "vertical",
            }}
          />
        </Field>

        {error && (
          <div
            className="mono"
            style={{
              fontSize: 11,
              letterSpacing: "0.06em",
              color: "var(--crit)",
              padding: "8px 12px",
              border: "1px solid var(--crit)",
              background: "rgba(255, 59, 59, 0.06)",
            }}
          >
            ▲ {error}
          </div>
        )}

        <div
          className="mono"
          style={{
            fontSize: 10,
            letterSpacing: "0.06em",
            color: "var(--tx-3)",
            lineHeight: 1.5,
          }}
        >
          Limite: até 3 voltas por pista + classe. Se já tiver 3, a nova só
          entra se for mais rápida que a mais lenta, e substitui ela.
        </div>

        {preview && (
          <div
            style={{
              border: "1px solid var(--bd-0)",
              background: "var(--bg-2)",
            }}
          >
            <div
              style={{
                padding: "10px 14px",
                borderBottom: "1px solid var(--bd-0)",
              }}
            >
              <span
                className="mono"
                style={{
                  fontSize: 10,
                  letterSpacing: "0.18em",
                  color: "var(--tx-1)",
                  textTransform: "uppercase",
                  fontWeight: 600,
                }}
              >
                Preview
              </span>
            </div>
            <div
              className="mono"
              style={{
                padding: "var(--pad)",
                display: "flex",
                flexDirection: "column",
                gap: 6,
                fontSize: 12,
              }}
            >
              <Row label="Piloto" value={preview.owner} />
              <Row label="Pista" value={preview.track} />
              <Row
                label="Carro"
                value={
                  <>
                    {preview.car}{" "}
                    <span style={{ color: "var(--tx-3)" }}>
                      [{preview.carClass}]
                    </span>
                  </>
                }
              />
              <Row
                label={`Volta ${preview.lapNumber}`}
                value={
                  <>
                    <span style={{ color: "var(--speed)", fontWeight: 600 }}>
                      {fmtTime(preview.lapTime)}
                    </span>
                    <span
                      style={{
                        color: "var(--tx-3)",
                        marginLeft: 8,
                        fontSize: 10,
                        letterSpacing: "0.14em",
                      }}
                    >
                      {(preview.type || "").toUpperCase()}
                    </span>
                  </>
                }
              />
              <Row
                label="Telemetria"
                value={
                  preview.telemetry?.length
                    ? `${preview.telemetry.length} samples`
                    : "nenhuma"
                }
                muted={!preview.telemetry?.length}
              />
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

function Row({ label, value, muted }) {
  return (
    <div style={{ display: "flex", gap: 10 }}>
      <span
        style={{
          color: "var(--tx-3)",
          letterSpacing: "0.1em",
          minWidth: 84,
          fontSize: 10,
          textTransform: "uppercase",
        }}
      >
        {label}
      </span>
      <span style={{ color: muted ? "var(--tx-3)" : "var(--tx-0)" }}>
        {value}
      </span>
    </div>
  );
}
