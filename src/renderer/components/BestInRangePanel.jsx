import { useEffect, useMemo, useState } from "react";
import Modal from "./Modal.jsx";
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

function buildCandidates({ sessionLaps, otherLaps, importedLaps, currentLapId }) {
  const list = [];
  for (const l of sessionLaps || []) {
    if (!l.hasTelemetry) continue;
    list.push({
      key: l.id,
      lapId: l.id,
      kind: "session",
      label: `Volta ${l.lapNumber}`,
      sublabel: null,
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

const KIND_BADGE = {
  session: "SESSÃO",
  other: "OUTRA SESSÃO",
  import: "IMPORTADA",
};

const TH_STYLE = {
  padding: "8px 12px",
  textAlign: "left",
  fontSize: 9,
  letterSpacing: "0.18em",
  color: "var(--tx-3)",
  textTransform: "uppercase",
  fontWeight: 500,
  fontFamily: "Geist Mono",
  borderBottom: "1px solid var(--bd-0)",
};
const TD_STYLE = {
  padding: "8px 12px",
  fontSize: 11,
  fontFamily: "Geist Mono",
};

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
      buildCandidates({ sessionLaps, otherLaps, importedLaps, currentLapId }),
    [sessionLaps, otherLaps, importedLaps, currentLapId]
  );

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

  if (!range) return null;

  const [d1, d2] = range;
  const filtered = showInvalid ? results : results.filter((r) => r.isValid);
  const withTime = filtered.filter((r) => r.timeInRange != null);
  const sorted = [...withTime].sort((a, b) => a.timeInRange - b.timeInRange);
  const currentRow = results.find((r) => r.lapId === currentLapId);
  const currentT = currentRow?.timeInRange ?? null;
  const bestT = sorted[0]?.timeInRange ?? null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Melhores neste Trecho"
      subtitle={`${Math.round(d1)}m → ${Math.round(d2)}m · ${Math.round(
        d2 - d1
      )}m`}
      width={760}
      footer={
        <span
          className="mono"
          style={{
            fontSize: 9,
            letterSpacing: "0.14em",
            color: "var(--tx-3)",
            textTransform: "uppercase",
          }}
        >
          Tempo no trecho = t(fim) − t(início) interpolado · independente do delta acumulado
        </span>
      }
    >
      <div
        style={{
          padding: "8px 14px",
          borderBottom: "1px solid var(--bd-0)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexShrink: 0,
        }}
      >
        <label
          className="mono"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 10,
            letterSpacing: "0.14em",
            color: "var(--tx-2)",
            cursor: "pointer",
            textTransform: "uppercase",
          }}
        >
          <input
            type="checkbox"
            checked={showInvalid}
            onChange={(e) => setShowInvalid(e.target.checked)}
            style={{ accentColor: "var(--accent)" }}
          />
          Mostrar inválidas
        </label>
        {currentT != null && (
          <span
            className="mono"
            style={{
              fontSize: 10,
              letterSpacing: "0.14em",
              color: "var(--tx-3)",
              textTransform: "uppercase",
            }}
          >
            Volta atual no trecho:{" "}
            <span style={{ color: "var(--tx-1)" }}>{fmtRange(currentT)}</span>
          </span>
        )}
      </div>

      <div style={{ flex: 1, overflowY: "auto" }}>
        {loading && (
          <div
            className="mono"
            style={{
              padding: 32,
              textAlign: "center",
              fontSize: 10,
              letterSpacing: "0.18em",
              color: "var(--tx-3)",
            }}
          >
            CALCULANDO...
          </div>
        )}
        {!loading && sorted.length === 0 && (
          <div
            className="mono"
            style={{
              padding: 32,
              textAlign: "center",
              fontSize: 10,
              letterSpacing: "0.18em",
              color: "var(--tx-3)",
            }}
          >
            NENHUMA VOLTA COBRE ESSE TRECHO
          </div>
        )}
        {!loading && sorted.length > 0 && (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead
              style={{
                position: "sticky",
                top: 0,
                background: "var(--bg-1)",
                zIndex: 1,
              }}
            >
              <tr>
                <th style={TH_STYLE}>#</th>
                <th style={TH_STYLE}>Volta</th>
                <th style={TH_STYLE}>Origem</th>
                <th style={{ ...TH_STYLE, textAlign: "right" }}>No Trecho</th>
                <th style={{ ...TH_STYLE, textAlign: "right" }}>Δ vs Atual</th>
                <th style={{ ...TH_STYLE, textAlign: "right" }}>Δ vs Melhor</th>
                <th style={TH_STYLE}></th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((row, i) => {
                const dCur =
                  currentT != null ? row.timeInRange - currentT : null;
                const dBest = bestT != null ? row.timeInRange - bestT : null;
                const isCurrent = row.lapId === currentLapId;
                return (
                  <tr
                    key={row.key}
                    style={{
                      borderBottom: "1px solid var(--bd-0)",
                      background: isCurrent ? "var(--bg-2)" : "transparent",
                    }}
                  >
                    <td style={{ ...TD_STYLE, color: "var(--tx-3)" }}>
                      {i + 1}
                    </td>
                    <td style={{ ...TD_STYLE, color: "var(--tx-0)" }}>
                      <span>{row.label}</span>
                      {row.sublabel && (
                        <span
                          style={{
                            color: "var(--tx-3)",
                            marginLeft: 8,
                            fontSize: 10,
                          }}
                        >
                          {row.sublabel}
                        </span>
                      )}
                      {!row.isValid && (
                        <span
                          style={{
                            color: "var(--crit)",
                            marginLeft: 8,
                            fontSize: 9,
                            letterSpacing: "0.14em",
                          }}
                        >
                          INV
                        </span>
                      )}
                      {isCurrent && (
                        <span
                          style={{
                            color: "var(--accent)",
                            marginLeft: 8,
                            fontSize: 9,
                            letterSpacing: "0.14em",
                            fontWeight: 600,
                          }}
                        >
                          ATUAL
                        </span>
                      )}
                    </td>
                    <td
                      style={{
                        ...TD_STYLE,
                        color: "var(--tx-3)",
                        fontSize: 9,
                        letterSpacing: "0.14em",
                      }}
                    >
                      {KIND_BADGE[row.kind]}
                    </td>
                    <td
                      style={{
                        ...TD_STYLE,
                        textAlign: "right",
                        color: i === 0 ? "var(--speed)" : "var(--tx-0)",
                        fontWeight: i === 0 ? 600 : 400,
                      }}
                    >
                      {fmtRange(row.timeInRange)}
                    </td>
                    <td
                      style={{
                        ...TD_STYLE,
                        textAlign: "right",
                        color:
                          dCur == null || isCurrent
                            ? "var(--tx-3)"
                            : dCur < 0
                            ? "var(--ok)"
                            : "var(--crit)",
                        fontWeight: !isCurrent && dCur != null ? 600 : 400,
                      }}
                    >
                      {isCurrent ? "—" : fmtDelta(dCur)}
                    </td>
                    <td
                      style={{
                        ...TD_STYLE,
                        textAlign: "right",
                        color: "var(--tx-2)",
                      }}
                    >
                      {dBest === 0 ? "—" : fmtDelta(dBest)}
                    </td>
                    <td style={{ ...TD_STYLE, textAlign: "right" }}>
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
                          fontSize: 9,
                          padding: "4px 10px",
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
    </Modal>
  );
}
