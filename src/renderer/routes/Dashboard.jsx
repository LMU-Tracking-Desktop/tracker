import { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from "recharts";
import TrackSelect from "../components/TrackSelect.jsx";
import PageHeader from "../components/PageHeader.jsx";
import { Field } from "../components/Field.jsx";
import { formatLapTime, formatDateTime } from "../lib/format.js";
import { stats } from "../lib/stats.js";
import { computeOutlierSet } from "../lib/outlier.js";

const WINDOWS = [
  { value: 7, label: "7D" },
  { value: 30, label: "30D" },
  { value: 90, label: "90D" },
  { value: null, label: "TUDO" },
];

const TYPE_ORDER = ["practice", "qualifying", "race"];

function StatCard({ label, value, hint, color }) {
  return (
    <div
      style={{
        background: "var(--bg-1)",
        border: "1px solid var(--bd-0)",
        padding: "var(--pad)",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        minHeight: 92,
      }}
    >
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
          fontSize: 26,
          fontWeight: 600,
          color: color || "var(--tx-0)",
          letterSpacing: "-0.01em",
          lineHeight: 1,
        }}
      >
        {value}
      </span>
      {hint && (
        <span
          className="mono"
          style={{
            fontSize: 9,
            letterSpacing: "0.14em",
            color: "var(--tx-2)",
            textTransform: "uppercase",
          }}
        >
          {hint}
        </span>
      )}
    </div>
  );
}

function Panel({ title, right, children, height }) {
  return (
    <div
      style={{
        background: "var(--bg-1)",
        border: "1px solid var(--bd-0)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          padding: "10px 14px",
          borderBottom: "1px solid var(--bd-0)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span
          className="mono"
          style={{
            fontSize: 10,
            letterSpacing: "0.14em",
            color: "var(--tx-1)",
            textTransform: "uppercase",
          }}
        >
          {title}
        </span>
        {right && (
          <span
            className="mono"
            style={{
              fontSize: 10,
              letterSpacing: "0.14em",
              color: "var(--tx-3)",
              textTransform: "uppercase",
            }}
          >
            {right}
          </span>
        )}
      </div>
      <div style={{ height: height || "auto", padding: 12 }}>{children}</div>
    </div>
  );
}

function WindowSegmented({ value, onChange }) {
  return (
    <div
      style={{
        display: "inline-flex",
        border: "1px solid var(--bd-1)",
      }}
    >
      {WINDOWS.map((w, i) => {
        const active = value === w.value;
        return (
          <button
            key={w.label}
            type="button"
            onClick={() => onChange(w.value)}
            className="mono"
            style={{
              padding: "8px 12px",
              fontSize: 10,
              letterSpacing: "0.14em",
              background: active ? "var(--bg-3)" : "transparent",
              color: active ? "var(--accent)" : "var(--tx-2)",
              border: "none",
              borderRight:
                i < WINDOWS.length - 1 ? "1px solid var(--bd-1)" : "none",
              fontWeight: active ? 600 : 400,
              cursor: "pointer",
            }}
          >
            {w.label}
          </button>
        );
      })}
    </div>
  );
}

function computeTypeStats(laps) {
  const byType = new Map();
  for (const l of laps) {
    if (!byType.has(l.session.type))
      byType.set(l.session.type, { valid: [], invalid: 0 });
    const b = byType.get(l.session.type);
    if (l.isValid) b.valid.push(l.lapTime);
    else b.invalid += 1;
  }
  const rows = [];
  for (const [type, b] of byType) {
    if (b.valid.length === 0) continue;
    const s = stats(b.valid);
    const total = b.valid.length + b.invalid;
    rows.push({
      type,
      validCount: b.valid.length,
      invalidCount: b.invalid,
      invalidRate: total > 0 ? b.invalid / total : 0,
      stats: s,
    });
  }
  rows.sort((a, b) => TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type));
  return rows;
}

function computeCarStats(laps) {
  const byCar = new Map();
  for (const l of laps) {
    if (!l.isValid) continue;
    const key = l.session.car;
    if (!byCar.has(key))
      byCar.set(key, { times: [], carClass: l.session.carClass });
    byCar.get(key).times.push(l.lapTime);
  }
  const rows = [];
  for (const [car, b] of byCar) {
    if (b.times.length < 3) continue;
    const s = stats(b.times);
    rows.push({
      car,
      carClass: b.carClass,
      count: b.times.length,
      stats: s,
    });
  }
  rows.sort((a, b) => a.stats.median - b.stats.median);
  return rows;
}

export default function Dashboard() {
  const [tracks, setTracks] = useState([]);
  const [trackId, setTrackId] = useState(null);
  const [windowDays, setWindowDays] = useState(30);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [outlierPct, setOutlierPct] = useState(7);

  useEffect(() => {
    window.api?.getConfig?.().then((c) => {
      if (c) setOutlierPct(c.outlier_threshold_pct ?? 7);
    });
  }, []);

  useEffect(() => {
    (async () => {
      const [t, last] = await Promise.all([
        window.api?.listTracks?.() ?? [],
        window.api?.getLastTrack?.() ?? null,
      ]);
      setTracks(t || []);
      if (last) setTrackId(last);
    })();
  }, []);

  useEffect(() => {
    if (!trackId) {
      setData(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const d = await window.api?.getDashboard?.({ trackId, windowDays });
        if (!cancelled) setData(d);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [trackId, windowDays]);

  const analysis = useMemo(() => {
    if (!data || !data.laps) return null;
    const laps = data.laps;
    const outlierSet = computeOutlierSet(laps, outlierPct);
    const kept = laps.filter((l) => !outlierSet.has(l.id));
    const validTimes = kept.filter((l) => l.isValid).map((l) => l.lapTime);
    if (validTimes.length === 0) return null;
    const s = stats(validTimes);
    const chartData = kept.map((l, i) => ({
      idx: i + 1,
      lapTime: l.isValid ? l.lapTime : null,
      when: formatDateTime(l.createdAt),
    }));
    const pad = Math.max(0.5, (s.max - s.min) * 0.15);
    const yMin = Math.max(0, s.min - pad);
    const yMax = s.max + pad;
    return {
      laps: kept,
      rawLapsCount: laps.length,
      outlierCount: outlierSet.size,
      s,
      chartData,
      yDomain: [yMin, yMax],
      byType: computeTypeStats(kept),
      byCar: computeCarStats(kept),
    };
  }, [data, outlierPct]);

  const empty = (label) => (
    <div
      style={{
        border: "1px solid var(--bd-0)",
        background: "var(--bg-1)",
        padding: "48px var(--pad)",
        textAlign: "center",
        margin: "0 var(--pad) var(--pad)",
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
        crumbs={[{ label: "DASHBOARD" }, { label: "ANÁLISE" }]}
        actions={<WindowSegmented value={windowDays} onChange={setWindowDays} />}
      />

      {/* Filter */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 360px) 1fr",
          gap: "var(--gap)",
          padding: "var(--pad)",
        }}
      >
        <TrackSelect tracks={tracks} value={trackId} onChange={setTrackId} />
      </div>

      {!trackId ? (
        empty("SELECIONE UMA PISTA")
      ) : loading ? (
        empty("CARREGANDO...")
      ) : !analysis ? (
        empty("SEM VOLTAS VÁLIDAS NESSA JANELA")
      ) : (
        <>
          {/* Stats row */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: "var(--gap)",
              padding: "0 var(--pad) var(--pad)",
            }}
          >
            <StatCard
              label="Melhor Volta"
              value={formatLapTime(analysis.s.min)}
              color="var(--speed)"
              hint={`${analysis.s.count} válidas`}
            />
            <StatCard
              label="Média"
              value={formatLapTime(analysis.s.mean)}
              hint={`Δ +${(analysis.s.mean - analysis.s.min).toFixed(2)}s`}
            />
            <StatCard
              label="Mediana"
              value={formatLapTime(analysis.s.median)}
              hint="Tendência central"
            />
            <StatCard
              label="σ Consistência"
              value={`${analysis.s.stdDev.toFixed(2)}s`}
              hint={
                analysis.s.stdDev < 1
                  ? "Excelente"
                  : analysis.s.stdDev < 2
                  ? "Boa"
                  : "Instável"
              }
              color={
                analysis.s.stdDev < 1
                  ? "var(--ok)"
                  : analysis.s.stdDev >= 2
                  ? "var(--crit)"
                  : "var(--tx-0)"
              }
            />
          </div>

          {/* Lap evolution chart */}
          <div style={{ padding: "0 var(--pad) var(--pad)" }}>
            <Panel
              title="Evolução · Todas as Voltas"
              right={
                <>
                  MÉDIA {formatLapTime(analysis.s.mean)}
                  {analysis.outlierCount > 0
                    ? ` · ${analysis.outlierCount} OUTLIER${
                        analysis.outlierCount > 1 ? "S" : ""
                      } DESCONSIDERADA${analysis.outlierCount > 1 ? "S" : ""}`
                    : ""}
                </>
              }
              height={320}
            >
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={analysis.chartData}
                  margin={{ top: 8, right: 12, bottom: 4, left: 8 }}
                >
                  <CartesianGrid stroke="var(--bd-0)" strokeDasharray="2 4" />
                  <XAxis
                    dataKey="idx"
                    stroke="var(--tx-3)"
                    tick={{ fontSize: 10, fontFamily: "Geist Mono" }}
                    tickLine={false}
                  />
                  <YAxis
                    stroke="var(--tx-3)"
                    tick={{ fontSize: 10, fontFamily: "Geist Mono" }}
                    tickLine={false}
                    tickFormatter={(v) => formatLapTime(v)}
                    width={70}
                    domain={analysis.yDomain}
                    allowDataOverflow={false}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "var(--bg-3)",
                      border: "1px solid var(--bd-2)",
                      fontSize: 11,
                      fontFamily: "Geist Mono",
                      letterSpacing: "0.04em",
                    }}
                    labelStyle={{ color: "var(--tx-3)" }}
                    itemStyle={{ color: "var(--tx-0)" }}
                    labelFormatter={(l, items) =>
                      items?.[0]?.payload?.when ?? `#${l}`
                    }
                    formatter={(v) => [v ? formatLapTime(v) : "—", "tempo"]}
                  />
                  <ReferenceLine
                    y={analysis.s.mean}
                    stroke="var(--tx-3)"
                    strokeDasharray="4 4"
                  />
                  <ReferenceLine
                    y={analysis.s.min}
                    stroke="var(--speed)"
                    strokeDasharray="2 4"
                    strokeOpacity={0.5}
                  />
                  <Line
                    type="monotone"
                    dataKey="lapTime"
                    stroke="var(--crit)"
                    strokeWidth={1.4}
                    dot={{ r: 2.5, fill: "var(--crit)", strokeWidth: 0 }}
                    activeDot={{ r: 4, fill: "var(--accent)" }}
                    connectNulls
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </Panel>
          </div>

          {/* Per-type cards */}
          <div style={{ padding: "0 var(--pad) var(--pad)" }}>
            <div
              style={{
                marginBottom: 8,
                display: "flex",
                alignItems: "baseline",
                gap: 12,
              }}
            >
              <span
                className="mono"
                style={{
                  fontSize: 10,
                  letterSpacing: "0.18em",
                  color: "var(--tx-1)",
                  textTransform: "uppercase",
                  fontWeight: 600,
                }}
              >
                Ritmo por Tipo
              </span>
            </div>
            {analysis.byType.length === 0 ? (
              <div
                style={{
                  border: "1px solid var(--bd-0)",
                  background: "var(--bg-1)",
                  padding: "32px var(--pad)",
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
                  SEM DADOS POR TIPO
                </span>
              </div>
            ) : (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: `repeat(${Math.min(
                    3,
                    analysis.byType.length
                  )}, 1fr)`,
                  gap: "var(--gap)",
                }}
              >
                {analysis.byType.map((r) => {
                  const rate = r.invalidRate;
                  const rateColor =
                    rate <= 0.05
                      ? "var(--ok)"
                      : rate <= 0.15
                      ? "var(--warn)"
                      : "var(--crit)";
                  return (
                    <div
                      key={r.type}
                      style={{
                        background: "var(--bg-1)",
                        border: "1px solid var(--bd-0)",
                        padding: "var(--pad)",
                        display: "flex",
                        flexDirection: "column",
                        gap: 10,
                      }}
                    >
                      <span
                        className="mono"
                        style={{
                          fontSize: 9,
                          letterSpacing: "0.18em",
                          color: "var(--tx-3)",
                          textTransform: "uppercase",
                        }}
                      >
                        {r.type}
                      </span>
                      <span
                        className="mono"
                        style={{
                          fontSize: 26,
                          fontWeight: 600,
                          color: "var(--tx-0)",
                          letterSpacing: "-0.01em",
                          lineHeight: 1,
                        }}
                      >
                        {formatLapTime(r.stats.median)}
                      </span>
                      <div
                        className="mono"
                        style={{
                          display: "flex",
                          gap: 10,
                          fontSize: 10,
                          color: "var(--tx-2)",
                          letterSpacing: "0.06em",
                          flexWrap: "wrap",
                        }}
                      >
                        <span>
                          MELHOR{" "}
                          <span style={{ color: "var(--speed)" }}>
                            {formatLapTime(r.stats.min)}
                          </span>
                        </span>
                        <span style={{ color: "var(--tx-3)" }}>·</span>
                        <span>σ {r.stats.stdDev.toFixed(2)}s</span>
                      </div>
                      <div
                        className="mono"
                        style={{
                          fontSize: 9,
                          letterSpacing: "0.14em",
                          color: "var(--tx-3)",
                          textTransform: "uppercase",
                          display: "flex",
                          justifyContent: "space-between",
                          paddingTop: 6,
                          borderTop: "1px solid var(--bd-0)",
                        }}
                      >
                        <span>
                          {r.validCount} válidas · {r.invalidCount} inválidas
                        </span>
                        <span style={{ color: rateColor }}>
                          {(rate * 100).toFixed(0)}%
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Per-car table */}
          <div style={{ padding: "0 var(--pad) var(--pad)" }}>
            <Panel
              title="Consistência por Carro"
              right="MELHOR MEDIANA NO TOPO"
            >
              {analysis.byCar.length === 0 ? (
                <div
                  style={{
                    padding: "32px var(--pad)",
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
                    PRECISA DE 3+ VOLTAS VÁLIDAS POR CARRO
                  </span>
                </div>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table className="laps">
                    <thead>
                      <tr>
                        <th>Carro</th>
                        <th>Classe</th>
                        <th className="num">Voltas</th>
                        <th className="num">Melhor</th>
                        <th className="num">Mediana</th>
                        <th className="num">σ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        const minOfMins = Math.min(
                          ...analysis.byCar.map((r) => r.stats.min)
                        );
                        return analysis.byCar.map((r, i) => {
                          const isFastest = r.stats.min === minOfMins;
                          return (
                            <tr key={r.car}>
                              <td>
                                <span
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: 8,
                                  }}
                                >
                                  <span>{r.car}</span>
                                  {i === 0 && (
                                    <span className="chip accent">TOP</span>
                                  )}
                                </span>
                              </td>
                              <td style={{ color: "var(--tx-2)" }}>
                                {r.carClass}
                              </td>
                              <td
                                className="num"
                                style={{ color: "var(--tx-1)" }}
                              >
                                {r.count}
                              </td>
                              <td
                                className="num"
                                style={{
                                  color: isFastest
                                    ? "var(--speed)"
                                    : "var(--tx-0)",
                                  fontWeight: isFastest ? 600 : 400,
                                }}
                              >
                                {formatLapTime(r.stats.min)}
                              </td>
                              <td
                                className="num"
                                style={{
                                  color: i === 0 ? "var(--tx-0)" : "var(--tx-1)",
                                  fontWeight: i === 0 ? 600 : 400,
                                }}
                              >
                                {formatLapTime(r.stats.median)}
                              </td>
                              <td
                                className="num"
                                style={{ color: "var(--tx-2)" }}
                              >
                                {r.stats.stdDev.toFixed(2)}s
                              </td>
                            </tr>
                          );
                        });
                      })()}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}
