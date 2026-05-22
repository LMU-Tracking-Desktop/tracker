// Estatisticas analiticas de uma pista (ritmo por tipo, consistencia por
// carro, evolucao de voltas). Antes era a tela /dashboard; agora vive aqui
// e e embutida na Home, ja que e sempre escopado a uma pista.

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
    <div style={{ display: "inline-flex", border: "1px solid var(--bd-1)" }}>
      {WINDOWS.map((w, i) => {
        const active = value === w.value;
        return (
          <button
            key={w.label}
            type="button"
            onClick={() => onChange(w.value)}
            className="mono"
            style={{
              padding: "6px 10px",
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
    rows.push({ car, carClass: b.carClass, count: b.times.length, stats: s });
  }
  rows.sort((a, b) => a.stats.median - b.stats.median);
  return rows;
}

export default function TrackStats({ trackId }) {
  const [windowDays, setWindowDays] = useState(30);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [outlierPct, setOutlierPct] = useState(7);
  const [carClass, setCarClass] = useState(null);

  useEffect(() => {
    window.api?.getConfig?.().then((c) => {
      if (c) setOutlierPct(c.outlier_threshold_pct ?? 7);
    });
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

  // Classes presentes nos dados — pro seletor
  const availableClasses = useMemo(() => {
    if (!data?.laps) return [];
    const seen = new Set();
    const out = [];
    for (const l of data.laps) {
      const c = l.session?.carClass;
      if (c && !seen.has(c)) {
        seen.add(c);
        out.push(c);
      }
    }
    return out.sort();
  }, [data]);

  // Mantem a classe selecionada valida; senao pega a primeira
  useEffect(() => {
    setCarClass((cur) =>
      cur && availableClasses.includes(cur) ? cur : availableClasses[0] || null
    );
  }, [availableClasses]);

  const analysis = useMemo(() => {
    if (!data || !data.laps) return null;
    // Misturar classes distorce ritmo/consistencia — analisa uma por vez.
    const laps = carClass
      ? data.laps.filter((l) => l.session?.carClass === carClass)
      : data.laps;
    if (laps.length === 0) return null;
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
    return {
      rawLapsCount: laps.length,
      outlierCount: outlierSet.size,
      s,
      chartData,
      yDomain: [Math.max(0, s.min - pad), s.max + pad],
      byType: computeTypeStats(kept),
      byCar: computeCarStats(kept),
    };
  }, [data, outlierPct, carClass]);

  const emptyBox = (label) => (
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
        style={{ fontSize: 10, letterSpacing: "0.18em", color: "var(--tx-3)" }}
      >
        {label}
      </span>
    </div>
  );

  return (
    <div
      style={{ display: "flex", flexDirection: "column", gap: "var(--gap)" }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
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
          Análise da Pista
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {availableClasses.length > 1 && (
            <select
              className="select"
              value={carClass ?? ""}
              onChange={(e) => setCarClass(e.target.value || null)}
              style={{ width: "auto", padding: "5px 8px", fontSize: 11 }}
            >
              {availableClasses.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          )}
          <WindowSegmented value={windowDays} onChange={setWindowDays} />
        </div>
      </div>

      {loading ? (
        emptyBox("CARREGANDO...")
      ) : !analysis ? (
        emptyBox("SEM VOLTAS VÁLIDAS NESSA JANELA")
      ) : (
        <>
          {/* Lap evolution */}
          <Panel
            title="Evolução · Todas as Voltas"
            right={
              <>
                MÉDIA {formatLapTime(analysis.s.mean)}
                {analysis.outlierCount > 0
                  ? ` · ${analysis.outlierCount} OUTLIER${
                      analysis.outlierCount > 1 ? "S" : ""
                    } FORA`
                  : ""}
              </>
            }
            height={280}
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

          {/* Per-type */}
          {analysis.byType.length > 0 && (
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
                        fontSize: 24,
                        fontWeight: 600,
                        color: "var(--tx-0)",
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

          {/* Per-car */}
          {analysis.byCar.length > 0 && (
            <Panel title="Consistência por Carro" right="MELHOR MEDIANA NO TOPO">
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
                            <td className="num" style={{ color: "var(--tx-1)" }}>
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
                            <td className="num" style={{ color: "var(--tx-2)" }}>
                              {r.stats.stdDev.toFixed(2)}s
                            </td>
                          </tr>
                        );
                      });
                    })()}
                  </tbody>
                </table>
              </div>
            </Panel>
          )}
        </>
      )}
    </div>
  );
}
