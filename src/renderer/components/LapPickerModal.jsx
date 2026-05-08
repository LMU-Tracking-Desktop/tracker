import { useEffect, useMemo, useState } from "react";
import Modal from "./Modal.jsx";

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

export default function LapPickerModal({
  open,
  onClose,
  onSelect,
  mode,
  title,
  sessionLaps = [],
  otherLaps = [],
  importedLaps = [],
  selectedLapId,
  excludeLapId,
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
      ...(isReference
        ? [{ id: "shared", label: "Voltas compartilhadas" }]
        : []),
    ];
    return list;
  }, [isReference]);

  useEffect(() => {
    if (open && !tab) setTab("session");
  }, [open, tab]);

  const candidatesByTab = useMemo(() => {
    const allSession = sessionLaps
      .filter((l) => l.hasTelemetry)
      .map(normalizeSession);
    const allOther = otherLaps.map(normalizeOther);
    const allImports = importedLaps.map(normalizeImport);

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
  const purple = { color: "var(--speed)", fontWeight: 600 };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title || (isReference ? "Comparar com" : "Escolher Volta")}
      width={900}
      height={640}
      footer={
        isReference && (
          <>
            <span
              className="mono"
              style={{
                fontSize: 9,
                letterSpacing: "0.14em",
                color: "var(--tx-3)",
                textTransform: "uppercase",
                marginRight: "auto",
              }}
            >
              Clique numa linha pra usar como referência
            </span>
            <button
              type="button"
              className="btn"
              onClick={() => {
                onSelect?.(null);
                onClose?.();
              }}
            >
              SEM REFERÊNCIA
            </button>
          </>
        )
      }
    >
      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        {/* Sidebar tabs */}
        <div
          style={{
            width: 200,
            flexShrink: 0,
            display: "flex",
            flexDirection: "column",
            background: "var(--bg-2)",
            borderRight: "1px solid var(--bd-0)",
          }}
        >
          {tabs.map((t) => {
            const active = tab === t.id;
            return (
              <button
                type="button"
                key={t.id}
                onClick={() => setTab(t.id)}
                className="mono"
                style={{
                  textAlign: "left",
                  padding: "10px 14px",
                  border: "none",
                  background: active ? "var(--bg-1)" : "transparent",
                  color: active ? "var(--tx-0)" : "var(--tx-2)",
                  borderLeft: "2px solid",
                  borderLeftColor: active ? "var(--accent)" : "transparent",
                  cursor: "pointer",
                  fontSize: 11,
                  letterSpacing: "0.08em",
                  fontWeight: active ? 600 : 400,
                }}
                onMouseEnter={(e) => {
                  if (!active) e.currentTarget.style.color = "var(--tx-1)";
                }}
                onMouseLeave={(e) => {
                  if (!active) e.currentTarget.style.color = "var(--tx-2)";
                }}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            minWidth: 0,
          }}
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
            <span
              className="mono"
              style={{
                fontSize: 10,
                letterSpacing: "0.14em",
                color: "var(--tx-3)",
                textTransform: "uppercase",
              }}
            >
              {filteredRows.length}{" "}
              {filteredRows.length === 1 ? "VOLTA" : "VOLTAS"}
            </span>
          </div>

          <div style={{ flex: 1, overflowY: "auto" }}>
            {filteredRows.length === 0 ? (
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
                NENHUMA VOLTA
              </div>
            ) : (
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
                    {rankedField && <th style={TH_STYLE}>#</th>}
                    <th style={TH_STYLE}>Volta</th>
                    <th style={TH_STYLE}>Origem</th>
                    <th
                      style={{
                        ...TH_STYLE,
                        textAlign: "right",
                        borderLeft: "1px solid var(--bd-0)",
                      }}
                    >
                      S1
                    </th>
                    <th style={{ ...TH_STYLE, textAlign: "right" }}>S2</th>
                    <th style={{ ...TH_STYLE, textAlign: "right" }}>S3</th>
                    <th
                      style={{
                        ...TH_STYLE,
                        textAlign: "right",
                        borderLeft: "1px solid var(--bd-0)",
                      }}
                    >
                      Tempo
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
                          borderBottom: "1px solid var(--bd-0)",
                          background: isSelected
                            ? "var(--bg-2)"
                            : "transparent",
                          cursor: "pointer",
                        }}
                        onMouseEnter={(e) => {
                          if (!isSelected)
                            e.currentTarget.style.background = "var(--bg-2)";
                        }}
                        onMouseLeave={(e) => {
                          if (!isSelected)
                            e.currentTarget.style.background = "transparent";
                        }}
                      >
                        {rankedField && (
                          <td style={{ ...TD_STYLE, color: "var(--tx-3)" }}>
                            {i + 1}
                          </td>
                        )}
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
                          {isSelected && (
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
                            borderLeft: "1px solid var(--bd-0)",
                            color: "var(--tx-1)",
                            ...(isBest("sector1", bestSector1) ? purple : {}),
                          }}
                        >
                          {fmtSector(row.sector1)}
                        </td>
                        <td
                          style={{
                            ...TD_STYLE,
                            textAlign: "right",
                            color: "var(--tx-1)",
                            ...(isBest("sector2", bestSector2) ? purple : {}),
                          }}
                        >
                          {fmtSector(row.sector2)}
                        </td>
                        <td
                          style={{
                            ...TD_STYLE,
                            textAlign: "right",
                            color: "var(--tx-1)",
                            ...(isBest("sector3", bestSector3) ? purple : {}),
                          }}
                        >
                          {fmtSector(row.sector3)}
                        </td>
                        <td
                          style={{
                            ...TD_STYLE,
                            textAlign: "right",
                            borderLeft: "1px solid var(--bd-0)",
                            color: "var(--tx-0)",
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
    </Modal>
  );
}
