import { useEffect, useState } from "react";
import PageHeader from "../components/PageHeader.jsx";
import { Field } from "../components/Field.jsx";
import { useLmuStatus } from "../lib/useLmuStatus.js";

export default function Settings() {
  const [config, setConfig] = useState(null);
  const [username, setUsername] = useState("");
  const [pollMs, setPollMs] = useState(250);
  const [outlierPct, setOutlierPct] = useState(7);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [version, setVersion] = useState("");
  const lmuConnected = useLmuStatus();

  useEffect(() => {
    (async () => {
      const c = await window.api?.getConfig?.();
      if (!c) return;
      setConfig(c);
      setUsername(c.username ?? "");
      setPollMs(c.poll_interval_ms ?? 250);
      setOutlierPct(c.outlier_threshold_pct ?? 7);
    })();
    window.api?.getAppVersion?.().then((v) => setVersion(v || ""));
  }, []);

  const save = async () => {
    if (saving) return;
    setSaving(true);
    setSaved(false);
    try {
      const next = await window.api?.setConfig?.({
        username: username.trim() || config?.username,
        poll_interval_ms: Math.max(50, Math.min(5000, pollMs | 0)),
        outlier_threshold_pct: Math.max(0, Math.min(50, outlierPct | 0)),
      });
      if (next) {
        setConfig(next);
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }
    } finally {
      setSaving(false);
    }
  };

  const dirty =
    config &&
    (username.trim() !== config.username ||
      (pollMs | 0) !== config.poll_interval_ms ||
      (outlierPct | 0) !== (config.outlier_threshold_pct ?? 7));

  const sectionStyle = {
    background: "var(--bg-1)",
    border: "1px solid var(--bd-0)",
  };
  const sectionHeaderStyle = {
    padding: "10px 14px",
    borderBottom: "1px solid var(--bd-0)",
  };
  const sectionTitle = (text) => (
    <span
      className="mono"
      style={{
        fontSize: 10,
        letterSpacing: "0.14em",
        color: "var(--tx-1)",
        textTransform: "uppercase",
      }}
    >
      {text}
    </span>
  );

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflow: "auto",
      }}
    >
      <PageHeader
        crumbs={[{ label: "SETTINGS" }, { label: "CONFIGURAÇÕES" }]}
      />

      <div
        style={{
          padding: "var(--pad)",
          display: "flex",
          flexDirection: "column",
          gap: "var(--gap)",
          maxWidth: 760,
        }}
      >
        {/* Profile + tracker */}
        <div style={sectionStyle}>
          <div style={sectionHeaderStyle}>{sectionTitle("Tracker")}</div>
          <div
            style={{
              padding: "var(--pad)",
              display: "flex",
              flexDirection: "column",
              gap: 18,
            }}
          >
            <Field
              label="Username (piloto)"
              hint="Aplicado na próxima sessão criada. Mudar não renomeia sessões antigas."
            >
              <input
                type="text"
                className="input"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Seu nome no LMU"
              />
            </Field>

            <Field
              label="Poll interval (ms)"
              hint="Frequência de leitura do shared memory. Default 250ms. Menor = mais precisão, mais CPU. Entre 50 e 5000."
            >
              <input
                type="number"
                className="input"
                value={pollMs}
                min={50}
                max={5000}
                step={50}
                onChange={(e) => setPollMs(parseInt(e.target.value, 10) || 250)}
              />
            </Field>

            <Field
              label="Outlier threshold (%)"
              hint="Volta será considerada outlier (e desconsiderada em charts/stats) se for X% acima da mediana da sessão. Só afeta practice/qualy — em corrida todas as voltas entram. Default 7%. Use 0 pra desligar."
            >
              <input
                type="number"
                className="input"
                value={outlierPct}
                min={0}
                max={50}
                step={1}
                onChange={(e) =>
                  setOutlierPct(parseInt(e.target.value, 10) || 0)
                }
              />
            </Field>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                paddingTop: 6,
                borderTop: "1px solid var(--bd-0)",
                marginTop: 6,
              }}
            >
              <button
                type="button"
                className={dirty ? "btn solid" : "btn"}
                disabled={!dirty || saving}
                onClick={save}
                style={{
                  opacity: !dirty || saving ? 0.5 : 1,
                }}
              >
                {saving ? "SALVANDO..." : "SALVAR"}
              </button>
              {saved && (
                <span
                  className="mono"
                  style={{
                    fontSize: 10,
                    letterSpacing: "0.14em",
                    color: "var(--ok)",
                  }}
                >
                  ✓ SALVO
                </span>
              )}
              {dirty && !saved && (
                <span
                  className="mono"
                  style={{
                    fontSize: 10,
                    letterSpacing: "0.14em",
                    color: "var(--warn)",
                  }}
                >
                  ALTERAÇÕES PENDENTES
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Status / About */}
        <div style={sectionStyle}>
          <div style={sectionHeaderStyle}>{sectionTitle("Sistema")}</div>
          <div
            style={{
              padding: "var(--pad)",
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "var(--gap)",
            }}
          >
            <InfoRow
              label="LMU"
              value={lmuConnected ? "● CONECTADO" : "● OFFLINE"}
              valueColor={lmuConnected ? "var(--ok)" : "var(--tx-3)"}
            />
            <InfoRow
              label="Storage"
              value="SQLite local"
            />
            <InfoRow
              label="Conexão"
              value="Shared memory (LMU_Data)"
            />
            <InfoRow label="Versão" value={`v${version || "?"}`} />
          </div>
          <div
            style={{
              padding: "10px 14px",
              borderTop: "1px solid var(--bd-0)",
              fontSize: 10,
              letterSpacing: "0.06em",
              color: "var(--tx-3)",
            }}
            className="mono"
          >
            Config salva em{" "}
            <span style={{ color: "var(--tx-1)" }}>
              %APPDATA%\lmu-desktop\config.json
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value, valueColor }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span
        className="mono"
        style={{
          fontSize: 9,
          letterSpacing: "0.18em",
          color: "var(--tx-3)",
          textTransform: "uppercase",
        }}
      >
        {label}
      </span>
      <span
        className="mono"
        style={{
          fontSize: 12,
          color: valueColor || "var(--tx-0)",
          fontWeight: 500,
        }}
      >
        {value}
      </span>
    </div>
  );
}
