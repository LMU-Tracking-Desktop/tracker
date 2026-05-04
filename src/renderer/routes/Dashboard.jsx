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
import { formatLapTime, formatDateTime } from "../lib/format.js";
import { stats } from "../lib/stats.js";
import { computeOutlierSet } from "../lib/outlier.js";

const WINDOWS = [
  { value: "7", label: "7 DIAS" },
  { value: "30", label: "30 DIAS" },
  { value: "90", label: "90 DIAS" },
  { value: "", label: "TUDO" },
];

const TYPE_ORDER = ["practice", "qualifying", "race"];

function Metric({ label, value, accent }) {
  return (
    <div
      className="p-5 border-r border-b hairline last:border-r-0 flex flex-col gap-2"
      style={{ background: "var(--surface)" }}
    >
      <span className="mono text-[10px] tracking-[0.18em] text-muted">
        {label}
      </span>
      <span
        className="mono text-2xl md:text-3xl font-semibold tabular-nums"
        style={{ color: accent ? "var(--accent)" : "var(--foreground)" }}
      >
        {value}
      </span>
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
  rows.sort(
    (a, b) => TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type)
  );
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

  return (
    <div className="p-8">
      <div className="max-w-[1400px] mx-auto space-y-8">
        <div>
          <div className="mb-6">
            <span className="chip">DASHBOARD</span>
          </div>
          <h1 className="text-3xl font-semibold">Analise</h1>
        </div>

        <section className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-4 md:items-end">
          <TrackSelect tracks={tracks} value={trackId} onChange={setTrackId} />
          <div className="flex items-end gap-2">
            {WINDOWS.map((w) => {
              const active =
                (w.value === "" && windowDays == null) ||
                (w.value !== "" && windowDays === parseInt(w.value, 10));
              return (
                <button
                  key={w.label}
                  type="button"
                  className="btn"
                  onClick={() =>
                    setWindowDays(w.value === "" ? null : parseInt(w.value, 10))
                  }
                  style={{
                    color: active ? "var(--accent)" : undefined,
                    borderColor: active ? "var(--accent)" : undefined,
                  }}
                >
                  {w.label}
                </button>
              );
            })}
          </div>
        </section>

        {!trackId ? (
          <section className="border hairline stripe-bg p-12 text-center">
            <div className="mono text-xs tracking-[0.2em] text-muted">
              SELECIONE UMA PISTA
            </div>
          </section>
        ) : loading ? (
          <section className="border hairline p-12 text-center text-muted mono text-xs tracking-widest">
            CARREGANDO...
          </section>
        ) : !analysis ? (
          <section className="border hairline p-12 text-center text-muted mono text-xs tracking-widest">
            SEM VOLTAS VALIDAS NESSA JANELA
          </section>
        ) : (
          <>
            <section className="grid grid-cols-2 md:grid-cols-4 gap-0 border hairline">
              <Metric
                label="MELHOR VOLTA"
                value={formatLapTime(analysis.s.min)}
                accent
              />
              <Metric label="MEDIA" value={formatLapTime(analysis.s.mean)} />
              <Metric
                label="VALIDAS"
                value={String(analysis.s.count).padStart(3, "0")}
              />
              <Metric
                label="σ"
                value={`${analysis.s.stdDev.toFixed(2)}s`}
              />
            </section>

            <section
              className="border hairline"
              style={{ background: "var(--surface)" }}
            >
              <div className="px-4 py-3 border-b hairline flex items-center justify-between">
                <span className="mono text-[10px] tracking-[0.2em] text-muted">
                  EVOLUCAO · TODAS AS VOLTAS NO PERIODO
                  {analysis.outlierCount > 0
                    ? ` · ${analysis.outlierCount} OUTLIER(S) DESCONSIDERADA(S)`
                    : ""}
                </span>
                <span className="mono text-[10px] tracking-[0.2em] text-muted">
                  MEDIA {formatLapTime(analysis.s.mean)}
                </span>
              </div>
              <div className="h-[320px] p-3">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={analysis.chartData}
                    margin={{ top: 8, right: 12, bottom: 4, left: 8 }}
                  >
                    <CartesianGrid
                      stroke="var(--border)"
                      strokeDasharray="2 4"
                    />
                    <XAxis
                      dataKey="idx"
                      stroke="var(--muted)"
                      tick={{ fontSize: 11 }}
                      tickLine={false}
                    />
                    <YAxis
                      stroke="var(--muted)"
                      tick={{ fontSize: 11 }}
                      tickLine={false}
                      tickFormatter={(v) => formatLapTime(v)}
                      width={70}
                      domain={analysis.yDomain}
                      allowDataOverflow={false}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "var(--surface-2)",
                        border: "1px solid var(--border)",
                        fontSize: 12,
                      }}
                      labelStyle={{ color: "var(--muted)" }}
                      labelFormatter={(l, items) =>
                        items?.[0]?.payload?.when ?? `#${l}`
                      }
                      formatter={(v) => [v ? formatLapTime(v) : "—", "tempo"]}
                    />
                    <ReferenceLine
                      y={analysis.s.mean}
                      stroke="var(--muted)"
                      strokeDasharray="4 4"
                    />
                    <Line
                      type="monotone"
                      dataKey="lapTime"
                      stroke="var(--accent)"
                      strokeWidth={2}
                      dot={{ r: 2.5, fill: "var(--accent)" }}
                      connectNulls
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </section>

            <section>
              <div className="mb-3 flex items-baseline gap-3 flex-wrap">
                <h2 className="text-lg font-semibold">Ritmo por tipo</h2>
              </div>
              {analysis.byType.length === 0 ? (
                <div className="border hairline p-8 text-center text-muted mono text-xs tracking-widest">
                  SEM DADOS POR TIPO
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-0 border hairline">
                  {analysis.byType.map((r) => {
                    const rate = r.invalidRate;
                    const rateColor =
                      rate <= 0.05
                        ? "var(--green)"
                        : rate <= 0.15
                          ? "var(--yellow)"
                          : "var(--accent)";
                    return (
                      <div
                        key={r.type}
                        className="p-5 border-r border-b hairline last:border-r-0 flex flex-col gap-3"
                        style={{ background: "var(--surface)" }}
                      >
                        <span className="mono text-[11px] tracking-[0.2em] text-muted">
                          {r.type.toUpperCase()}
                        </span>
                        <span
                          className="mono text-3xl font-semibold tabular-nums"
                          style={{ color: "var(--accent)" }}
                        >
                          {formatLapTime(r.stats.median)}
                        </span>
                        <div className="mono text-[11px] text-muted tracking-wider flex items-center gap-3 flex-wrap">
                          <span>melhor {formatLapTime(r.stats.min)}</span>
                          <span>·</span>
                          <span>σ {r.stats.stdDev.toFixed(2)}s</span>
                        </div>
                        <div className="mono text-[10px] tracking-widest text-muted flex items-center justify-between">
                          <span>
                            {r.validCount} validas · {r.invalidCount} invalidas
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
            </section>

            <section>
              <div className="mb-3 flex items-baseline gap-3 flex-wrap">
                <h2 className="text-lg font-semibold">
                  Consistencia por carro
                </h2>
                <span className="mono text-[10px] tracking-[0.2em] text-muted">
                  MELHOR MEDIANA NO TOPO
                </span>
              </div>
              {analysis.byCar.length === 0 ? (
                <div className="border hairline p-8 text-center text-muted mono text-xs tracking-widest">
                  PRECISA DE 3+ VOLTAS VALIDAS POR CARRO
                </div>
              ) : (
                <section className="border hairline overflow-x-auto">
                  <table className="laps">
                    <thead>
                      <tr>
                        <th>Carro</th>
                        <th className="num">Voltas</th>
                        <th className="num">Melhor</th>
                        <th className="num">Mediana</th>
                        <th className="num">σ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analysis.byCar.map((r, i) => (
                        <tr key={r.car}>
                          <td>
                            {r.car}
                            <span className="text-muted ml-2">
                              [{r.carClass}]
                            </span>
                            {i === 0 && (
                              <span className="chip accent ml-2">TOP</span>
                            )}
                          </td>
                          <td className="num">{r.count}</td>
                          <td className="num">
                            {formatLapTime(r.stats.min)}
                          </td>
                          <td
                            className="num"
                            style={{
                              color: i === 0 ? "var(--accent)" : undefined,
                            }}
                          >
                            {formatLapTime(r.stats.median)}
                          </td>
                          <td className="num">
                            {r.stats.stdDev.toFixed(2)}s
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
