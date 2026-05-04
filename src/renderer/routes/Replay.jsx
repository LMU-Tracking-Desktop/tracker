import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { downsample } from "../lib/telemetry.js";

const LapReplay = lazy(() => import("../components/LapReplay.jsx"));

export default function Replay() {
  const { lapId } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();

  const refId = params.get("ref") || null;
  const modeParam = params.get("mode");
  const [mode, setMode] = useState(modeParam === "3d" ? "3d" : "2d");

  const [telemetry, setTelemetry] = useState(null);
  const [reference, setReference] = useState(null);
  const [loading, setLoading] = useState(true);

  // Carrega telemetria da volta principal
  useEffect(() => {
    if (!lapId) return;
    let cancelled = false;
    setLoading(true);
    window.api
      ?.getLapTelemetry?.(lapId)
      .then((t) => {
        if (!cancelled) setTelemetry(t);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [lapId]);

  // Carrega referencia (se houver). Suporta "imp:<id>" pra importadas.
  useEffect(() => {
    if (!refId) {
      setReference(null);
      return;
    }
    let cancelled = false;
    const isImport = refId.startsWith("imp:");
    const fetch = isImport
      ? window.api?.getImportTelemetry?.(refId.slice(4))
      : window.api?.getLapTelemetry?.(refId);
    Promise.resolve(fetch).then((t) => {
      if (!cancelled) setReference(t);
    });
    return () => {
      cancelled = true;
    };
  }, [refId]);

  // Esc volta pra sessao
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") navigate(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate]);

  // 3000 pontos = resolucao completa (raw tracker ~20Hz * 100s = 2000 amostras)
  // Antes era 700 que dava so ~7Hz numa volta longa — interpolacao muito esparsa
  const telemetryDs = useMemo(
    () => (telemetry ? downsample(telemetry, 3000) : null),
    [telemetry]
  );
  const referenceDs = useMemo(
    () => (reference ? downsample(reference, 3000) : null),
    [reference]
  );

  return (
    <div className="flex flex-col" style={{ height: "100vh" }}>
      {/* Tabs + controles de topo */}
      <div
        className="px-4 py-3 border-b hairline flex items-center justify-between flex-wrap gap-3"
        style={{ background: "var(--surface)" }}
      >
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="btn"
            onClick={() => navigate(-1)}
            style={{ padding: "4px 10px", fontSize: 10 }}
          >
            ← VOLTAR
          </button>
          <span className="mono text-[10px] tracking-[0.2em] text-muted">
            REPLAY {reference ? "· COM COMPARAÇÃO" : ""}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="btn"
            onClick={() => setMode("2d")}
            style={{
              padding: "6px 16px",
              color: mode === "2d" ? "var(--accent)" : "var(--muted)",
              borderColor: mode === "2d" ? "var(--accent)" : "var(--border)",
            }}
          >
            2D
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => setMode("3d")}
            style={{
              padding: "6px 16px",
              color: mode === "3d" ? "var(--accent)" : "var(--muted)",
              borderColor: mode === "3d" ? "var(--accent)" : "var(--border)",
            }}
          >
            3D
          </button>
        </div>
      </div>

      <div className="flex-1" style={{ overflow: "hidden" }}>
        {loading ? (
          <div className="p-8 text-center text-muted mono text-xs tracking-widest">
            CARREGANDO TELEMETRIA...
          </div>
        ) : !telemetryDs ? (
          <div className="p-8 text-center text-muted mono text-xs tracking-widest">
            VOLTA SEM TELEMETRIA
          </div>
        ) : (
          <Suspense
            fallback={
              <div className="p-8 text-center text-muted mono text-xs tracking-widest">
                CARREGANDO REPLAY...
              </div>
            }
          >
            <LapReplay
              telemetry={telemetryDs}
              reference={referenceDs}
              mode={mode}
            />
          </Suspense>
        )}
      </div>
    </div>
  );
}
