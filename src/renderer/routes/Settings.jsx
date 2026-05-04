import { useEffect, useState } from "react";

export default function Settings() {
  const [config, setConfig] = useState(null);
  const [username, setUsername] = useState("");
  const [pollMs, setPollMs] = useState(250);
  const [outlierPct, setOutlierPct] = useState(7);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    (async () => {
      const c = await window.api?.getConfig?.();
      if (!c) return;
      setConfig(c);
      setUsername(c.username ?? "");
      setPollMs(c.poll_interval_ms ?? 250);
      setOutlierPct(c.outlier_threshold_pct ?? 7);
    })();
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

  return (
    <div className="p-8">
      <div className="max-w-[800px] mx-auto space-y-8">
        <div>
          <div className="mb-6">
            <span className="chip">SETTINGS</span>
          </div>
          <h1 className="text-3xl font-semibold">Configuracoes</h1>
        </div>

        <section className="border hairline p-6 space-y-5" style={{ background: "var(--surface)" }}>
          <label className="block">
            <span className="label">Username (piloto)</span>
            <input
              type="text"
              className="input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Seu nome no LMU"
            />
            <span className="mono text-[10px] tracking-widest text-muted mt-2 block">
              Aplicado na proxima sessao criada. Mudar nao renomeia sessoes antigas.
            </span>
          </label>

          <label className="block">
            <span className="label">Poll interval (ms)</span>
            <input
              type="number"
              className="input"
              value={pollMs}
              min={50}
              max={5000}
              step={50}
              onChange={(e) => setPollMs(parseInt(e.target.value, 10) || 250)}
            />
            <span className="mono text-[10px] tracking-widest text-muted mt-2 block">
              Frequencia de leitura do shared memory. Default 250ms. Menor = mais
              precisao, mais CPU. Entre 50 e 5000.
            </span>
          </label>

          <label className="block">
            <span className="label">Outlier threshold (%)</span>
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
            <span className="mono text-[10px] tracking-widest text-muted mt-2 block">
              Volta sera considerada outlier (e desconsiderada em charts/stats)
              se for X% acima da mediana da sessao. So afeta practice/qualy —
              em corrida todas as voltas entram. Default 7%. Use 0 pra desligar.
            </span>
          </label>

          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              className="btn"
              disabled={!dirty || saving}
              onClick={save}
              style={{
                opacity: !dirty || saving ? 0.5 : 1,
                color: dirty ? "var(--accent)" : undefined,
                borderColor: dirty ? "var(--accent)" : undefined,
              }}
            >
              {saving ? "SALVANDO..." : "SALVAR"}
            </button>
            {saved && (
              <span
                className="mono text-[10px] tracking-[0.2em]"
                style={{ color: "var(--green)" }}
              >
                ✓ SALVO
              </span>
            )}
            {dirty && !saved && (
              <span className="mono text-[10px] tracking-[0.2em] text-muted">
                alteracoes pendentes
              </span>
            )}
          </div>

          <div className="mono text-[10px] tracking-widest text-muted pt-3 border-t hairline">
            config salva em <span className="text-foreground">%APPDATA%\lmu-desktop\config.json</span>
          </div>
        </section>

        <section className="border hairline p-6 space-y-3" style={{ background: "var(--surface)" }}>
          <div className="mono text-[10px] tracking-[0.2em] text-muted">
            SOBRE
          </div>
          <div className="text-sm space-y-2">
            <div>
              <span className="text-muted">Storage: </span>
              <span className="mono">SQLite local</span>
            </div>
            <div>
              <span className="text-muted">Conexao LMU: </span>
              <span className="mono">Shared memory (rFactor2 plugin)</span>
            </div>
            <div>
              <span className="text-muted">Versao: </span>
              <span className="mono">0.1</span>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
