import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import PageHeader from "../components/PageHeader.jsx";
import { formatLapTime, formatDateTime } from "../lib/format.js";

// Por coluna: como extrair o valor, qual a direcao "intuitiva" na primeira
// clicada, e se compara como string. Nulls sempre vao pro fim, independente
// de direcao — sem isso, sort desc empurraria pistas sem voltas/posicao
// pro topo (que e o que o usuario NUNCA quer ver primeiro).
const FIELDS = {
  name: { value: (r) => r.name, defaultDir: "asc", str: true },
  sessions: { value: (r) => r.sessions, defaultDir: "desc" },
  totalLaps: { value: (r) => r.totalLaps, defaultDir: "desc" },
  bestLap: { value: (r) => r.bestLap, defaultDir: "asc" },
  bestPosition: { value: (r) => r.bestPosition, defaultDir: "asc" },
  avgPosition: { value: (r) => r.avgPosition, defaultDir: "asc" },
  lastDriven: { value: (r) => r.lastDriven, defaultDir: "desc", str: true },
};

function compareRows(a, b, field, dir) {
  const f = FIELDS[field];
  if (!f) return 0;
  const av = f.value(a);
  const bv = f.value(b);
  const aNull = av == null || av === "" || av === 0;
  const bNull = bv == null || bv === "" || bv === 0;
  // Nulls/zeros vao SEMPRE pro fim, em qualquer direcao. Pistas sem
  // melhor volta / sem posicao em corrida nao tem valor "menor" — sao
  // ausencia de dado, nao deveriam aparecer antes de dados validos.
  if (aNull && bNull) return 0;
  if (aNull) return 1;
  if (bNull) return -1;
  let c = f.str ? av.localeCompare(bv) : av - bv;
  return dir === "asc" ? c : -c;
}

function SortHeader({ field, label, align = "left", current, dir, onSort }) {
  const active = current === field;
  const nextDir = active
    ? dir === "asc"
      ? "desc"
      : "asc"
    : FIELDS[field]?.defaultDir || "desc";
  return (
    <button
      type="button"
      onClick={() => onSort(field, nextDir)}
      style={{
        textAlign: align,
        width: "100%",
        background: "transparent",
        border: 0,
        cursor: "pointer",
        color: active ? "var(--tx-0)" : "inherit",
        font: "inherit",
        padding: 0,
        letterSpacing: "inherit",
        textTransform: "inherit",
      }}
    >
      {label}
      {active ? (dir === "asc" ? " ↑" : " ↓") : ""}
    </button>
  );
}

function fmtPos(v) {
  if (v == null) return "—";
  return `P${String(v).padStart(2, "0")}`;
}

function fmtAvg(v) {
  if (v == null) return "—";
  return `P${v.toFixed(1)}`;
}

export default function Pistas() {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState("lastDriven");
  const [dir, setDir] = useState("desc");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const r = (await window.api?.listTracksSummary?.()) ?? [];
      if (!cancelled) {
        setRows(r);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => compareRows(a, b, sort, dir));
  }, [rows, sort, dir]);

  const handleSort = (field, nextDir) => {
    setSort(field);
    setDir(nextDir);
  };

  const goToTrack = (trackId) => {
    navigate("/", { state: { trackId } });
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflow: "auto",
      }}
    >
      <PageHeader crumbs={[{ label: "PISTAS" }, { label: "OVERVIEW" }]} />

      <div style={{ padding: "0 var(--pad) var(--pad)" }}>
        {loading && rows.length === 0 ? (
          <div
            style={{
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
              CARREGANDO...
            </span>
          </div>
        ) : rows.length === 0 ? (
          <div
            style={{
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
              NENHUMA PISTA AINDA
            </span>
          </div>
        ) : (
          <div
            style={{
              border: "1px solid var(--bd-0)",
              background: "var(--bg-1)",
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
                  letterSpacing: "0.14em",
                  color: "var(--tx-2)",
                }}
              >
                {rows.length} {rows.length === 1 ? "PISTA" : "PISTAS"}
              </span>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table className="laps">
                <thead>
                  <tr>
                    <th>
                      <SortHeader
                        field="name"
                        label="Pista"
                        current={sort}
                        dir={dir}
                        onSort={handleSort}
                      />
                    </th>
                    <th className="num">
                      <SortHeader
                        field="sessions"
                        label="Sessões"
                        align="right"
                        current={sort}
                        dir={dir}
                        onSort={handleSort}
                      />
                    </th>
                    <th className="num">
                      <SortHeader
                        field="totalLaps"
                        label="Voltas"
                        align="right"
                        current={sort}
                        dir={dir}
                        onSort={handleSort}
                      />
                    </th>
                    <th className="num">
                      <SortHeader
                        field="bestLap"
                        label="Melhor Volta"
                        align="right"
                        current={sort}
                        dir={dir}
                        onSort={handleSort}
                      />
                    </th>
                    <th className="num">
                      <SortHeader
                        field="bestPosition"
                        label="Melhor Pos"
                        align="right"
                        current={sort}
                        dir={dir}
                        onSort={handleSort}
                      />
                    </th>
                    <th className="num">
                      <SortHeader
                        field="avgPosition"
                        label="Média Pos"
                        align="right"
                        current={sort}
                        dir={dir}
                        onSort={handleSort}
                      />
                    </th>
                    <th className="num">
                      <SortHeader
                        field="lastDriven"
                        label="Última"
                        align="right"
                        current={sort}
                        dir={dir}
                        onSort={handleSort}
                      />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((row) => (
                    <tr
                      key={row.id}
                      onClick={() => goToTrack(row.id)}
                      style={{ cursor: "pointer" }}
                    >
                      <td>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                          }}
                        >
                          {row.imageUrl ? (
                            <div
                              style={{
                                width: 48,
                                height: 28,
                                background: `url(${row.imageUrl}) center/cover`,
                                border: "1px solid var(--bd-0)",
                                flexShrink: 0,
                              }}
                            />
                          ) : (
                            <div
                              style={{
                                width: 48,
                                height: 28,
                                background: "var(--bg-0)",
                                border: "1px solid var(--bd-0)",
                                flexShrink: 0,
                              }}
                            />
                          )}
                          <span style={{ color: "var(--tx-0)" }}>
                            {row.name}
                          </span>
                        </div>
                      </td>
                      <td className="num">{row.sessions}</td>
                      <td className="num">{row.totalLaps}</td>
                      <td className="num mono" style={{ color: "var(--speed)" }}>
                        {row.bestLap != null
                          ? formatLapTime(row.bestLap)
                          : "—"}
                      </td>
                      <td
                        className="num mono"
                        style={{
                          color:
                            row.bestPosition != null && row.bestPosition <= 3
                              ? "var(--accent)"
                              : "var(--tx-1)",
                        }}
                      >
                        {fmtPos(row.bestPosition)}
                      </td>
                      <td className="num mono" style={{ color: "var(--tx-1)" }}>
                        {fmtAvg(row.avgPosition)}
                        {row.racesCount > 0 && (
                          <span
                            style={{
                              color: "var(--tx-3)",
                              fontSize: 10,
                              marginLeft: 4,
                            }}
                          >
                            ({row.racesCount})
                          </span>
                        )}
                      </td>
                      <td className="num" style={{ color: "var(--tx-2)" }}>
                        {row.lastDriven ? formatDateTime(row.lastDriven) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
