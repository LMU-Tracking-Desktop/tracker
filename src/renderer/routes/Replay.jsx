import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import PageHeader from "../components/PageHeader.jsx";
import { downsample } from "../lib/telemetry.js";

const LapReplay = lazy(() => import("../components/LapReplay.jsx"));

function ModeToggle({ value, onChange }) {
  return (
    <div
      style={{
        display: "inline-flex",
        border: "1px solid var(--bd-1)",
      }}
    >
      {["2d", "3d"].map((v, i) => {
        const active = value === v;
        return (
          <button
            key={v}
            type="button"
            onClick={() => onChange(v)}
            className="mono"
            style={{
              padding: "6px 14px",
              fontSize: 10,
              letterSpacing: "0.14em",
              background: active ? "var(--accent)" : "transparent",
              color: active ? "var(--accent-ink)" : "var(--tx-2)",
              border: "none",
              borderRight: i === 0 ? "1px solid var(--bd-1)" : "none",
              fontWeight: active ? 600 : 400,
              cursor: "pointer",
              textTransform: "uppercase",
            }}
          >
            {v}
          </button>
        );
      })}
    </div>
  );
}

function emptyBox(label) {
  return (
    <div
      style={{
        margin: "var(--pad)",
        border: "1px solid var(--bd-0)",
        background: "var(--bg-1)",
        padding: "48px var(--pad)",
        textAlign: "center",
      }}
    >
      <span
        className="mono"
        style={{
          fontSize: 10,
          letterSpacing: "0.18em",
          color: "var(--tx-3)",
        }}
      >
        {label}
      </span>
    </div>
  );
}

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

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") navigate(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate]);

  const telemetryDs = useMemo(
    () => (telemetry ? downsample(telemetry, 3000) : null),
    [telemetry]
  );
  const referenceDs = useMemo(
    () => (reference ? downsample(reference, 3000) : null),
    [reference]
  );

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: "var(--bg-0)",
      }}
    >
      <PageHeader
        crumbs={[
          { label: "← VOLTAR", onClick: () => navigate(-1) },
          { label: "REPLAY" },
          ...(reference ? [{ label: "COM COMPARAÇÃO" }] : []),
        ]}
        actions={
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <span
              className="mono"
              style={{
                fontSize: 9,
                letterSpacing: "0.14em",
                color: "var(--tx-3)",
                textTransform: "uppercase",
              }}
            >
              ESC = VOLTAR · ESPAÇO = PLAY · ← → = ±1s
            </span>
            <ModeToggle value={mode} onChange={setMode} />
          </div>
        }
      />

      <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
        {loading ? (
          emptyBox("CARREGANDO TELEMETRIA...")
        ) : !telemetryDs ? (
          emptyBox("VOLTA SEM TELEMETRIA")
        ) : (
          <Suspense fallback={emptyBox("CARREGANDO REPLAY...")}>
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
