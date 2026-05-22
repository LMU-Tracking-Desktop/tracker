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

const fmtDateTime = (d) =>
  d
    ? new Date(d).toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

function normalizeSession(lap) {
  return {
    key: lap.id,
    lapId: lap.id,
    kind: "session",
    hasTelemetry: !!lap.hasTelemetry,
    isValid: !!lap.isValid,
    hasTouch: !!lap.hasTouch,
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
    hasTouch: !!lap.hasTouch,
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
    hasTouch: !!lap.hasTouch,
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
  trackId,
  sessionLaps = [],
  otherLaps = [],
  importedLaps = [],
  selectedLapId,
  excludeLapId,
}) {
  const isReference = mode === "reference";
  // Quando trackId e passado, o picker pode navegar todas as sessoes da
  // pista — vira a aba principal. Sem trackId, comportamento antigo.
  const hasSessionNav = !!trackId;
  const [tab, setTab] = useState(null);
  const [showInvalid, setShowInvalid] = useState(false);

  // Navegacao de sessoes (aba "Todas as sessoes")
  const [sessionList, setSessionList] = useState(null);
  const [navSessionId, setNavSessionId] = useState(null);
  const [navLapsCache, setNavLapsCache] = useState({});
  const [loadingNav, setLoadingNav] = useState(false);

  // best/shared aparecem em modo referencia OU sempre que ha navegacao de
  // sessao (picker global e full-featured pros dois lados da comparacao).
  const showBestShared = isReference || hasSessionNav;
  const tabs = useMemo(() => {
    return [
      ...(hasSessionNav
        ? [{ id: "sessions", label: "Todas as sessões" }]
        : [{ id: "session", label: "Voltas dessa sessão" }]),
      ...(showBestShared ? [{ id: "best", label: "Melhores voltas" }] : []),
      { id: "s1", label: "Melhor S1" },
      { id: "s2", label: "Melhor S2" },
      { id: "s3", label: "Melhor S3" },
      ...(showBestShared
        ? [{ id: "shared", label: "Voltas compartilhadas" }]
        : []),
    ];
  }, [showBestShared, hasSessionNav]);

  useEffect(() => {
    if (open && !tab) setTab(hasSessionNav ? "sessions" : "session");
  }, [open, tab, hasSessionNav]);

  // Carrega sessoes da pista quando a aba abre pela primeira vez
  useEffect(() => {
    if (tab !== "sessions" || !trackId || sessionList) return;
    let cancelled = false;
    setLoadingNav(true);
    window.api
      ?.listSessions?.({ trackId, pageSize: 100 })
      .then((res) => {
        if (cancelled) return;
        setSessionList(res?.sessions || []);
        setLoadingNav(false);
      })
      .catch(() => {
        if (!cancelled) setLoadingNav(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tab, trackId, sessionList]);

  const openNavSession = async (sid) => {
    setNavSessionId(sid);
    if (navLapsCache[sid]) return;
    setLoadingNav(true);
    try {
      const d = await window.api?.getSessionDetail?.(sid);
      setNavLapsCache((c) => ({ ...c, [sid]: d?.laps || [] }));
    } finally {
      setLoadingNav(false);
    }
  };

  const candidatesByTab = useMemo(() => {
    const allSession = sessionLaps
      .filter((l) => l.hasTelemetry)
      .map(normalizeSession);
    const allOther = otherLaps.map(normalizeOther);
    const allImports = importedLaps.map(normalizeImport);
    // Abas de setor/melhor varrem todas as fontes quando ha navegacao de
    // sessao OU em modo referencia. No modo antigo (picker da volta
    // principal dentro da sessao), ficam so nas voltas da sessao.
    const pool =
      hasSessionNav || isReference
        ? [...allSession, ...allOther, ...allImports]
        : allSession;
    const bySector = (key) =>
      [...pool]
        .filter((l) => l[key] != null && l[key] > 0)
        .sort((a, b) => a[key] - b[key]);

    return {
      session: [...allSession].sort((a, b) => a.lapNumber - b.lapNumber),
      best: [...pool]
        .filter((l) => l.lapTime != null && l.lapTime > 0)
        .sort((a, b) => a.lapTime - b.lapTime),
      s1: bySector("sector1"),
      s2: bySector("sector2"),
      s3: bySector("sector3"),
      shared: [...allImports].sort((a, b) => a.lapTime - b.lapTime),
    };
  }, [sessionLaps, otherLaps, importedLaps, hasSessionNav, isReference]);

  // Voltas da sessao aberta na navegacao (aba "Todas as sessoes")
  const navRows = useMemo(() => {
    if (!navSessionId) return [];
    const laps = navLapsCache[navSessionId] || [];
    return laps
      .filter((l) => l.hasTelemetry)
      .map(normalizeSession)
      .sort((a, b) => a.lapNumber - b.lapNumber);
  }, [navSessionId, navLapsCache]);

  const inSessionNav = tab === "sessions";
  const showingSessionList = inSessionNav && !navSessionId;

  const baseRows = inSessionNav ? navRows : candidatesByTab[tab] || [];
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

  const navSession = navSessionId
    ? sessionList?.find((s) => s.id === navSessionId)
    : null;

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
                onClick={() => {
                  setTab(t.id);
                  if (t.id !== "sessions") setNavSessionId(null);
                }}
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
          {/* Header bar */}
          <div
            style={{
              padding: "8px 14px",
              borderBottom: "1px solid var(--bd-0)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
              flexShrink: 0,
            }}
          >
            {showingSessionList ? (
              <span
                className="mono"
                style={{
                  fontSize: 10,
                  letterSpacing: "0.14em",
                  color: "var(--tx-2)",
                  textTransform: "uppercase",
                }}
              >
                Escolha uma sessão
              </span>
            ) : (
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
            )}
            {inSessionNav && navSessionId && (
              <button
                type="button"
                className="mono"
                onClick={() => setNavSessionId(null)}
                style={{
                  background: "transparent",
                  border: "1px solid var(--bd-1)",
                  color: "var(--tx-1)",
                  fontSize: 10,
                  letterSpacing: "0.1em",
                  padding: "4px 10px",
                  cursor: "pointer",
                }}
              >
                ← TODAS AS SESSÕES
              </button>
            )}
            <span
              className="mono"
              style={{
                fontSize: 10,
                letterSpacing: "0.14em",
                color: "var(--tx-3)",
                textTransform: "uppercase",
                marginLeft: "auto",
              }}
            >
              {showingSessionList
                ? `${sessionList?.length ?? 0} ${
                    (sessionList?.length ?? 0) === 1 ? "SESSÃO" : "SESSÕES"
                  }`
                : `${filteredRows.length} ${
                    filteredRows.length === 1 ? "VOLTA" : "VOLTAS"
                  }`}
            </span>
          </div>

          <div style={{ flex: 1, overflowY: "auto" }}>
            {loadingNav ? (
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
                CARREGANDO...
              </div>
            ) : showingSessionList ? (
              <SessionList
                sessions={sessionList || []}
                onOpen={openNavSession}
              />
            ) : filteredRows.length === 0 ? (
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
                    <th style={TH_STYLE}>
                      {inSessionNav ? "Status" : "Origem"}
                    </th>
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
                          {inSessionNav ? (
                            row.hasTouch ? (
                              <span style={{ color: "var(--crit)" }}>
                                ▲ BATIDA
                              </span>
                            ) : (
                              <span style={{ color: "var(--ok)" }}>LIMPA</span>
                            )
                          ) : (
                            KIND_BADGE[row.kind]
                          )}
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

function SessionList({ sessions, onOpen }) {
  if (sessions.length === 0) {
    return (
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
        NENHUMA SESSÃO NESSA PISTA
      </div>
    );
  }
  return (
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
          <th style={TH_STYLE}>Data</th>
          <th style={TH_STYLE}>Tipo</th>
          <th style={TH_STYLE}>Carro</th>
          <th style={{ ...TH_STYLE, textAlign: "right" }}>Pos</th>
          <th style={{ ...TH_STYLE, textAlign: "right" }}>Voltas</th>
          <th
            style={{
              ...TH_STYLE,
              textAlign: "right",
              borderLeft: "1px solid var(--bd-0)",
            }}
          >
            Melhor
          </th>
        </tr>
      </thead>
      <tbody>
        {sessions.map((s) => (
          <tr
            key={s.id}
            onClick={() => onOpen(s.id)}
            style={{
              borderBottom: "1px solid var(--bd-0)",
              cursor: "pointer",
            }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.background = "var(--bg-2)")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.background = "transparent")
            }
          >
            <td style={{ ...TD_STYLE, color: "var(--tx-0)" }}>
              {fmtDateTime(s.startedAt)}
            </td>
            <td
              style={{
                ...TD_STYLE,
                color: "var(--tx-2)",
                fontSize: 9,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
              }}
            >
              {s.type}
            </td>
            <td style={{ ...TD_STYLE, color: "var(--tx-1)" }}>
              {(s.car || "").split(" ")[0]}
              <span style={{ color: "var(--tx-3)", marginLeft: 6 }}>
                {s.carClass}
              </span>
            </td>
            <td
              style={{
                ...TD_STYLE,
                textAlign: "right",
                color:
                  s.finalPosition == null
                    ? "var(--tx-3)"
                    : s.finalPosition <= 3
                    ? "var(--accent)"
                    : "var(--tx-1)",
              }}
            >
              {s.finalPosition != null
                ? `P${String(s.finalPosition).padStart(2, "0")}`
                : "—"}
            </td>
            <td
              style={{ ...TD_STYLE, textAlign: "right", color: "var(--tx-1)" }}
            >
              {s._count?.laps ?? 0}
            </td>
            <td
              style={{
                ...TD_STYLE,
                textAlign: "right",
                borderLeft: "1px solid var(--bd-0)",
                color: s.bestLap != null ? "var(--speed)" : "var(--tx-3)",
                fontWeight: s.bestLap != null ? 600 : 400,
              }}
            >
              {fmtLap(s.bestLap)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
