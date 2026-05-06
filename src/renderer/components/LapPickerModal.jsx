import { useEffect, useMemo, useState } from "react";

const fmtLap = (t) => {
  if (t == null || t <= 0) return "—";
  const m = Math.floor(t / 60);
  const s = (t % 60).toFixed(3).padStart(6, "0");
  return `${m}:${s}`;
};

const fmtSector = (t) => {
  if (t == null || t <= 0) return "—";
  return `${t.toFixed(3)}s`;
};

const fmtDate = (d) =>
  d
    ? new Date(d).toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
      })
    : "—";

// Normaliza qualquer fonte (sessao/outras/importadas) num shape comum.
function normalizeSession(lap) {
  return {
    key: lap.id,
    lapId: lap.id,
    kind: "session",
    hasTelemetry: !!lap.hasTelemetry,
    isValid: !!lap.isValid,
    lapNumber: lap.lapNumber,
    lapTime: lap.lapTime,
    sector1: lap.sector1,
    sector2: lap.sector2,
    sector3: lap.sector3,
    label: `Volta ${lap.lapNumber}`,
    sublabel: null,
  };
}

function normalizeOther(lap) {
  const car = (lap.session?.car || "").split(" ")[0];
  const date = fmtDate(lap.session?.startedAt);
  return {
    key: lap.id,
    lapId: lap.id,
    kind: "other",
    hasTelemetry: true,
    isValid: true,
    lapNumber: lap.lapNumber,
    lapTime: lap.lapTime,
    sector1: lap.sector1,
    sector2: lap.sector2,
    sector3: lap.sector3,
    label: fmtLap(lap.lapTime),
    sublabel: `${car} · ${date}`,
  };
}

function normalizeImport(lap) {
  return {
    key: `imp:${lap.id}`,
    lapId: `imp:${lap.id}`,
    kind: "import",
    hasTelemetry: true,
    isValid: lap.isValid !== false,
    lapNumber: lap.lapNumber,
    lapTime: lap.lapTime,
    sector1: lap.sector1,
    sector2: lap.sector2,
    sector3: lap.sector3,
    label: fmtLap(lap.lapTime),
    sublabel: `${lap.ownerName} · ${(lap.car || "").split(" ")[0]}`,
  };
}

const KIND_BADGE = {
  session: "SESSAO",
  other: "OUTRA SESSAO",
  import: "IMPORTADA",
};

export default function LapPickerModal({
  open,
  onClose,
  onSelect,
  mode, // "primary" | "reference"
  title,
  sessionLaps = [],
  otherLaps = [],
  importedLaps = [],
  selectedLapId, // qual ja esta escolhida no slot (highlight + impede re-seleção sem efeito)
  excludeLapId, // no modo reference: nao mostrar a volta primaria
}) {
  const isReference = mode === "reference";
  const [tab, setTab] = useState(null);
  const [showInvalid, setShowInvalid] = useState(false);

  const tabs = useMemo(() => {
    const list = [
      { id: "session", label: "Voltas dessa sessão" },
      ...(isReference ? [{ id: "best", label: "Melhores voltas" }] : []),
      { id: "s1", label: "Melhor S1" },
      { id: "s2", label: "Melhor S2" },
      { id: "s3", label: "Melhor S3" },
      ...(isReference ? [{ id: "shared", label: "Voltas compartilhadas" }] : []),
    ];
    return list;
  }, [isReference]);

  useEffect(() => {
    if (open && !tab) setTab("session");
  }, [open, tab]);

  // Conjuntos de candidatas pra cada tab.
  const candidatesByTab = useMemo(() => {
    const allSession = sessionLaps
      .filter((l) => l.hasTelemetry)
      .map(normalizeSession);
    const allOther = otherLaps.map(normalizeOther);
    const allImports = importedLaps.map(normalizeImport);

    // Primary: so faz sentido escolher uma volta da sessao atual (precisa de telemetria local).
    if (!isReference) {
      return {
        session: [...allSession].sort((a, b) => a.lapNumber - b.lapNumber),
        s1: [...allSession]
          .filter((l) => l.sector1 != null && l.sector1 > 0)
          .sort((a, b) => a.sector1 - b.sector1),
        s2: [...allSession]
          .filter((l) => l.sector2 != null && l.sector2 > 0)
          .sort((a, b) => a.sector2 - b.sector2),
        s3: [...allSession]
          .filter((l) => l.sector3 != null && l.sector3 > 0)
          .sort((a, b) => a.sector3 - b.sector3),
      };
    }

    const all = [...allSession, ...allOther, ...allImports];
    return {
      session: [...allSession].sort((a, b) => a.lapNumber - b.lapNumber),
      best: [...all]
        .filter((l) => l.lapTime != null && l.lapTime > 0)
        .sort((a, b) => a.lapTime - b.lapTime),
      s1: [...all]
        .filter((l) => l.sector1 != null && l.sector1 > 0)
        .sort((a, b) => a.sector1 - b.sector1),
      s2: [...all]
        .filter((l) => l.sector2 != null && l.sector2 > 0)
        .sort((a, b) => a.sector2 - b.sector2),
      s3: [...all]
        .filter((l) => l.sector3 != null && l.sector3 > 0)
        .sort((a, b) => a.sector3 - b.sector3),
      shared: [...allImports].sort((a, b) => a.lapTime - b.lapTime),
    };
  }, [sessionLaps, otherLaps, importedLaps, isReference]);

  if (!open) return null;

  const baseRows = candidatesByTab[tab] || [];
  const filteredRows = baseRows
    .filter((r) => (showInvalid ? true : r.isValid))
    .filter((r) => (excludeLapId ? r.lapId !== excludeLapId : true));

  const rankedField =
    tab === "s1"
      ? "sector1"
      : tab === "s2"
        ? "sector2"
        : tab === "s3"
          ? "sector3"
          : null;

  // Melhor valor (positivo) de cada coluna nas linhas visiveis — pintado de roxo.
  const bestOf = (key) => {
    let best = null;
    for (const r of filteredRows) {
      const v = r[key];
      if (v == null || v <= 0) continue;
      if (best == null || v < best) best = v;
    }
    return best;
  };
  const bestLapTime = bestOf("lapTime");
  const bestSector1 = bestOf("sector1");
  const bestSector2 = bestOf("sector2");
  const bestSector3 = bestOf("sector3");
  const purple = { color: "var(--purple)" };

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
          width: "min(900px, 96vw)",
          height: "min(640px, 90vh)",
          display: "flex",
          flexDirection: "column",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-3 border-b hairline flex items-center justify-between">
          <span className="mono text-[11px] tracking-[0.2em]">
            {title || (isReference ? "COMPARAR COM" : "ESCOLHER VOLTA")}
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

        <div
          style={{
            display: "flex",
            flex: 1,
            minHeight: 0,
          }}
        >
          {/* Sidebar de tabs */}
          <div
            className="border-r hairline"
            style={{
              width: 200,
              flexShrink: 0,
              display: "flex",
              flexDirection: "column",
              background: "var(--surface)",
            }}
          >
            {tabs.map((t) => {
              const active = tab === t.id;
              return (
                <button
                  type="button"
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className="mono text-[11px] tracking-[0.1em]"
                  style={{
                    textAlign: "left",
                    padding: "10px 14px",
                    border: "none",
                    background: active ? "var(--background)" : "transparent",
                    color: active ? "var(--accent)" : "var(--muted)",
                    borderLeft: active
                      ? "2px solid var(--accent)"
                      : "2px solid transparent",
                    cursor: "pointer",
                  }}
                >
                  {t.label}
                </button>
              );
            })}
          </div>

          {/* Conteudo */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
            <div className="px-4 py-2 border-b hairline flex items-center justify-between">
              <label className="mono text-[10px] tracking-[0.15em] text-muted flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showInvalid}
                  onChange={(e) => setShowInvalid(e.target.checked)}
                />
                MOSTRAR VOLTAS INVALIDAS
              </label>
              <span className="mono text-[10px] tracking-[0.15em] text-muted">
                {filteredRows.length}{" "}
                {filteredRows.length === 1 ? "VOLTA" : "VOLTAS"}
              </span>
            </div>

            <div style={{ flex: 1, overflowY: "auto" }}>
              {filteredRows.length === 0 ? (
                <div className="p-8 text-center mono text-[10px] tracking-widest text-muted">
                  NENHUMA VOLTA
                </div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead
                    style={{
                      position: "sticky",
                      top: 0,
                      background: "var(--surface)",
                      borderBottom: "1px solid var(--border)",
                    }}
                  >
                    <tr>
                      {rankedField && (
                        <th
                          className="mono text-[10px] tracking-[0.15em] text-muted"
                          style={{ padding: "8px 12px", textAlign: "left" }}
                        >
                          #
                        </th>
                      )}
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
                        style={{
                          padding: "8px 12px",
                          textAlign: "right",
                          borderLeft: "1px solid var(--border)",
                        }}
                      >
                        S1
                      </th>
                      <th
                        className="mono text-[10px] tracking-[0.15em] text-muted"
                        style={{ padding: "8px 12px", textAlign: "right" }}
                      >
                        S2
                      </th>
                      <th
                        className="mono text-[10px] tracking-[0.15em] text-muted"
                        style={{ padding: "8px 12px", textAlign: "right" }}
                      >
                        S3
                      </th>
                      <th
                        className="mono text-[10px] tracking-[0.15em] text-muted"
                        style={{
                          padding: "8px 12px",
                          textAlign: "right",
                          borderLeft: "1px solid var(--border)",
                        }}
                      >
                        TEMPO
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.map((row, i) => {
                      const isSelected = row.lapId === selectedLapId;
                      const isBest = (key, best) =>
                        best != null && row[key] === best;
                      return (
                        <tr
                          key={row.key}
                          onClick={() => {
                            onSelect?.(row.lapId);
                            onClose?.();
                          }}
                          style={{
                            borderBottom: "1px solid var(--border)",
                            background: isSelected
                              ? "var(--surface)"
                              : "transparent",
                            cursor: "pointer",
                          }}
                          onMouseEnter={(e) => {
                            if (!isSelected)
                              e.currentTarget.style.background =
                                "var(--surface)";
                          }}
                          onMouseLeave={(e) => {
                            if (!isSelected)
                              e.currentTarget.style.background = "transparent";
                          }}
                        >
                          {rankedField && (
                            <td
                              className="mono text-[11px]"
                              style={{
                                padding: "8px 12px",
                                color: "var(--muted)",
                              }}
                            >
                              {i + 1}
                            </td>
                          )}
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
                                style={{
                                  color: "var(--accent)",
                                  fontSize: 10,
                                }}
                              >
                                INV
                              </span>
                            ) : null}
                            {isSelected ? (
                              <span
                                className="ml-2"
                                style={{
                                  color: "var(--accent)",
                                  fontSize: 10,
                                }}
                              >
                                ATUAL
                              </span>
                            ) : null}
                          </td>
                          <td
                            className="mono text-[10px] text-muted"
                            style={{ padding: "8px 12px" }}
                          >
                            {KIND_BADGE[row.kind]}
                          </td>
                          <td
                            className="mono text-[11px]"
                            style={{
                              padding: "8px 12px",
                              textAlign: "right",
                              borderLeft: "1px solid var(--border)",
                              ...(isBest("sector1", bestSector1) ? purple : {}),
                            }}
                          >
                            {fmtSector(row.sector1)}
                          </td>
                          <td
                            className="mono text-[11px]"
                            style={{
                              padding: "8px 12px",
                              textAlign: "right",
                              ...(isBest("sector2", bestSector2) ? purple : {}),
                            }}
                          >
                            {fmtSector(row.sector2)}
                          </td>
                          <td
                            className="mono text-[11px]"
                            style={{
                              padding: "8px 12px",
                              textAlign: "right",
                              ...(isBest("sector3", bestSector3) ? purple : {}),
                            }}
                          >
                            {fmtSector(row.sector3)}
                          </td>
                          <td
                            className="mono text-[11px]"
                            style={{
                              padding: "8px 12px",
                              textAlign: "right",
                              borderLeft: "1px solid var(--border)",
                              ...(isBest("lapTime", bestLapTime) ? purple : {}),
                            }}
                          >
                            {fmtLap(row.lapTime)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>

        {isReference && (
          <div className="px-5 py-2 border-t hairline flex items-center justify-between">
            <span className="mono text-[9px] tracking-[0.15em] text-muted">
              clique numa linha pra usar como referência
            </span>
            <button
              type="button"
              className="btn"
              onClick={() => {
                onSelect?.(null);
                onClose?.();
              }}
              style={{ fontSize: 10 }}
            >
              SEM REFERÊNCIA
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
