import { useEffect, useMemo, useState } from "react";
import { timeInRange } from "../lib/telemetry.js";

const fmtLap = (t) => {
  if (t == null || t <= 0) return "—";
  const m = Math.floor(t / 60);
  const s = (t % 60).toFixed(3).padStart(6, "0");
  return `${m}:${s}`;
};

const fmtRange = (t) => (t == null ? "—" : `${t.toFixed(3)}s`);

const fmtDelta = (d) => {
  if (d == null) return "—";
  const sign = d > 0 ? "+" : "";
  return `${sign}${d.toFixed(3)}s`;
};

// Descreve uma candidata de forma uniforme.
// kind: "session" | "other" | "import"
function buildCandidates({ sessionLaps, otherLaps, importedLaps, currentLapId }) {
  const list = [];
  for (const l of sessionLaps || []) {
    if (!l.hasTelemetry) continue;
    list.push({
      key: l.id,
      lapId: l.id,
      kind: "session",
      label: `Volta ${l.lapNumber}`,
      sublabel: l.isValid ? null : "INV",
      lapTime: l.lapTime,
      isValid: l.isValid,
      isCurrent: l.id === currentLapId,
    });
  }
  for (const l of otherLaps || []) {
    list.push({
      key: l.id,
      lapId: l.id,
      kind: "other",
      label: fmtLap(l.lapTime),
      sublabel: `${(l.session?.car || "").split(" ")[0]} · ${new Date(
        l.session?.startedAt
      ).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}`,
      lapTime: l.lapTime,
      isValid: true,
    });
  }
  for (const l of importedLaps || []) {
    list.push({
      key: `imp:${l.id}`,
      lapId: `imp:${l.id}`,
      kind: "import",
      label: fmtLap(l.lapTime),
      sublabel: `${l.ownerName} · ${(l.car || "").split(" ")[0]}`,
      lapTime: l.lapTime,
      isValid: true,
    });
  }
  return list;
}

async function fetchTelemetryFor(lapId) {
  if (typeof lapId === "string" && lapId.startsWith("imp:")) {
    return window.api?.getImportTelemetry?.(lapId.slice(4));
  }
  return window.api?.getLapTelemetry?.(lapId);
}

export default function BestInRangePanel({
  open,
  onClose,
  range,
  currentLapId,
  currentTelemetry,
  sessionLaps,
  otherLaps,
  importedLaps,
  onSelect,
}) {
  const [showInvalid, setShowInvalid] = useState(false);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  const candidates = useMemo(
    () =>
      buildCandidates({
        sessionLaps,
        otherLaps,
        importedLaps,
        currentLapId,
      }),
    [sessionLaps, otherLaps, importedLaps, currentLapId]
  );

  // Calcula tempo no trecho pra cada candidata.
  useEffect(() => {
    if (!open || !range) return;
    let cancelled = false;
    setLoading(true);
    setResults([]);

    const [d1, d2] = range;

    const work = candidates.map(async (c) => {
      let samples = null;
      if (c.lapId === currentLapId && currentTelemetry) {
        samples = currentTelemetry;
      } else {
        samples = await fetchTelemetryFor(c.lapId);
      }
      const t = timeInRange(samples, d1, d2);
      return { ...c, timeInRange: t };
    });

    Promise.all(work).then((rows) => {
      if (cancelled) return;
      setResults(rows);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [open, range, candidates, currentLapId, currentTelemetry]);

  if (!open || !range) return null;

  const [d1, d2] = range;

  const filtered = showInvalid ? results : results.filter((r) => r.isValid);
  const withTime = filtered.filter((r) => r.timeInRange != null);
  const sorted = [...withTime].sort((a, b) => a.timeInRange - b.timeInRange);
  const currentRow = results.find((r) => r.lapId === currentLapId);
  const currentT = currentRow?.timeInRange ?? null;
  const bestT = sorted[0]?.timeInRange ?? null;

  const kindBadge = (kind) => {
    if (kind === "other") return "OUTRA SESSAO";
    if (kind === "import") return "IMPORTADA";
    return "SESSAO";
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
          width: "min(720px, 94vw)",
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-3 border-b hairline flex items-center justify-between">
          <div className="flex flex-col gap-0.5">
            <span className="mono text-[11px] tracking-[0.2em]">
              MELHORES NESTE TRECHO
            </span>
            <span className="mono text-[10px] tracking-[0.15em] text-muted">
              {Math.round(d1)}m → {Math.round(d2)}m ·{" "}
              {Math.round(d2 - d1)}m
            </span>
          </div>
          <button
            type="button"
            className="delete-btn always"
            onClick={onClose}
            title="Fechar"
          >
            ✕
          </button>
        </div>

        <div className="px-5 py-2 border-b hairline flex items-center justify-between">
          <label className="mono text-[10px] tracking-[0.15em] text-muted flex items-center gap-2">
            <input
              type="checkbox"
              checked={showInvalid}
              onChange={(e) => setShowInvalid(e.target.checked)}
            />
            MOSTRAR VOLTAS INVALIDAS
          </label>
          {currentT != null && (
            <span className="mono text-[10px] tracking-[0.15em] text-muted">
              VOLTA ATUAL NO TRECHO: {fmtRange(currentT)}
            </span>
          )}
        </div>

        <div className="overflow-y-auto" style={{ flex: 1 }}>
          {loading && (
            <div className="p-8 text-center mono text-[10px] tracking-widest text-muted">
              CALCULANDO...
            </div>
          )}
          {!loading && sorted.length === 0 && (
            <div className="p-8 text-center mono text-[10px] tracking-widest text-muted">
              NENHUMA VOLTA COBRE ESSE TRECHO
            </div>
          )}
          {!loading && sorted.length > 0 && (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr
                  style={{
                    background: "var(--surface)",
                    borderBottom: "1px solid var(--border)",
                  }}
                >
                  <th
                    className="mono text-[10px] tracking-[0.15em] text-muted"
                    style={{ padding: "8px 12px", textAlign: "left" }}
                  >
                    #
                  </th>
                  <th
                    className="mono text-[10px] tracking-[0.15em] text-muted"
                    style={{ padding: "8px 12px", textAlign: "left" }}
                  >
                    VOLTA
                  </th>
                  <th
                    className="mono text-[10px] tracking-[0.15em] text-muted"
                    style={{ padding: "8px 12px", textAlign: "left" }}
                  >
                    ORIGEM
                  </th>
                  <th
                    className="mono text-[10px] tracking-[0.15em] text-muted"
                    style={{ padding: "8px 12px", textAlign: "right" }}
                  >
                    NO TRECHO
                  </th>
                  <th
                    className="mono text-[10px] tracking-[0.15em] text-muted"
                    style={{ padding: "8px 12px", textAlign: "right" }}
                  >
                    Δ vs ATUAL
                  </th>
                  <th
                    className="mono text-[10px] tracking-[0.15em] text-muted"
                    style={{ padding: "8px 12px", textAlign: "right" }}
                  >
                    Δ vs MELHOR
                  </th>
                  <th style={{ padding: "8px 12px" }} />
                </tr>
              </thead>
              <tbody>
                {sorted.map((row, i) => {
                  const dCur =
                    currentT != null ? row.timeInRange - currentT : null;
                  const dBest =
                    bestT != null ? row.timeInRange - bestT : null;
                  const isCurrent = row.lapId === currentLapId;
                  return (
                    <tr
                      key={row.key}
                      style={{
                        borderBottom: "1px solid var(--border)",
                        background: isCurrent ? "var(--surface)" : "transparent",
                      }}
                    >
                      <td
                        className="mono text-[11px]"
                        style={{ padding: "8px 12px", color: "var(--muted)" }}
                      >
                        {i + 1}
                      </td>
                      <td
                        className="mono text-[11px]"
                        style={{ padding: "8px 12px" }}
                      >
                        {row.label}
                        {row.sublabel ? (
                          <span
                            className="text-muted ml-2"
                            style={{ fontSize: 10 }}
                          >
                            {row.sublabel}
                          </span>
                        ) : null}
                        {!row.isValid ? (
                          <span
                            className="ml-2"
                            style={{ color: "var(--accent)", fontSize: 10 }}
                          >
                            INV
                          </span>
                        ) : null}
                        {isCurrent ? (
                          <span
                            className="ml-2"
                            style={{ color: "var(--accent)", fontSize: 10 }}
                          >
                            ATUAL
                          </span>
                        ) : null}
                      </td>
                      <td
                        className="mono text-[10px] text-muted"
                        style={{ padding: "8px 12px" }}
                      >
                        {kindBadge(row.kind)}
                      </td>
                      <td
                        className="mono text-[11px]"
                        style={{
                          padding: "8px 12px",
                          textAlign: "right",
                          color: i === 0 ? "var(--green)" : undefined,
                        }}
                      >
                        {fmtRange(row.timeInRange)}
                      </td>
                      <td
                        className="mono text-[11px]"
                        style={{
                          padding: "8px 12px",
                          textAlign: "right",
                          color:
                            dCur == null || isCurrent
                              ? "var(--muted)"
                              : dCur < 0
                                ? "var(--green)"
                                : "var(--accent)",
                        }}
                      >
                        {isCurrent ? "—" : fmtDelta(dCur)}
                      </td>
                      <td
                        className="mono text-[11px] text-muted"
                        style={{ padding: "8px 12px", textAlign: "right" }}
                      >
                        {dBest === 0 ? "—" : fmtDelta(dBest)}
                      </td>
                      <td
                        style={{ padding: "8px 12px", textAlign: "right" }}
                      >
                        <button
                          type="button"
                          className="btn"
                          disabled={isCurrent}
                          onClick={() => {
                            onSelect?.(row.lapId);
                            onClose?.();
                          }}
                          style={{
                            opacity: isCurrent ? 0.4 : 1,
                            fontSize: 10,
                          }}
                        >
                          USAR REF
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="px-5 py-2 border-t hairline mono text-[9px] tracking-[0.15em] text-muted">
          tempo no trecho = t(fim) − t(inicio) interpolado · independente do
          delta acumulado
        </div>
      </div>
    </div>
  );
}
