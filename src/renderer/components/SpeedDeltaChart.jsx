import { memo, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
  ReferenceArea,
} from "recharts";

/**
 * Grafico de diferenca de velocidade (atual - referencia) por distancia.
 * Positivo = atual mais RAPIDO (verde), negativo = mais LENTO (vermelho).
 */
function SpeedDeltaChartBase({
  current,
  reference,
  onHover,
  onZoomChange,
  zoomRange,
  sectorMarkers,
}) {
  const [drag, setDrag] = useState(null);

  const dataAll = useMemo(() => {
    if (!current || !reference) return [];
    let refIdx = 0;
    return current.map((s) => {
      while (refIdx < reference.length - 1 && reference[refIdx + 1].d < s.d) {
        refIdx++;
      }
      const a = reference[Math.max(0, refIdx)];
      const b = reference[Math.min(reference.length - 1, refIdx + 1)];
      const frac = b.d === a.d ? 0 : (s.d - a.d) / (b.d - a.d);
      const refV = a.v + frac * (b.v - a.v);
      return {
        d: s.d,
        delta: Number((s.v - refV).toFixed(1)),
      };
    });
  }, [current, reference]);

  const data = useMemo(() => {
    if (!zoomRange) return dataAll;
    return dataAll.filter((d) => d.d >= zoomRange[0] && d.d <= zoomRange[1]);
  }, [dataAll, zoomRange]);

  if (!dataAll.length) return null;

  const deltas = data.map((d) => d.delta);
  const minD = deltas.length ? Math.min(...deltas) : 0;
  const maxD = deltas.length ? Math.max(...deltas) : 0;
  const absMax = Math.max(Math.abs(minD), Math.abs(maxD), 3);

  const handleMove = (state) => {
    if (!state?.isTooltipActive || state.activeLabel == null) return;
    if (drag) setDrag({ start: drag.start, end: state.activeLabel });
    else if (onHover) onHover(state.activeLabel);
  };
  const handleDown = (state) => {
    if (!onZoomChange) return;
    if (state?.activeLabel != null) {
      setDrag({ start: state.activeLabel, end: state.activeLabel });
    }
  };
  const handleUp = () => {
    if (!drag || !onZoomChange) {
      setDrag(null);
      return;
    }
    const lo = Math.min(drag.start, drag.end);
    const hi = Math.max(drag.start, drag.end);
    if (hi - lo > 30) onZoomChange([lo, hi]);
    setDrag(null);
  };
  const handleLeave = () => {
    setDrag(null);
    if (onHover) onHover(null);
  };

  return (
    <div
      className="border hairline flex flex-col"
      style={{ background: "var(--surface)" }}
    >
      <div className="px-4 py-3 border-b hairline flex items-center justify-between">
        <span className="mono text-[10px] tracking-[0.2em] text-muted">
          DELTA DE VELOCIDADE
        </span>
        <span className="mono text-[10px] tracking-[0.2em] text-muted">
          VERDE = MAIS RAPIDO · VERMELHO = MAIS LENTO (KM/H)
        </span>
      </div>
      <div className="h-[200px] p-3" style={{ userSelect: "none" }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={data}
            margin={{ top: 8, right: 12, bottom: 4, left: 8 }}
            onMouseMove={handleMove}
            onMouseDown={handleDown}
            onMouseUp={handleUp}
            onMouseLeave={handleLeave}
          >
            <defs>
              <linearGradient id="spdPos" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--green)" stopOpacity={0.5} />
                <stop
                  offset="100%"
                  stopColor="var(--green)"
                  stopOpacity={0}
                />
              </linearGradient>
              <linearGradient id="spdNeg" x1="0" y1="1" x2="0" y2="0">
                <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.5} />
                <stop
                  offset="100%"
                  stopColor="var(--accent)"
                  stopOpacity={0}
                />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="var(--border)" strokeDasharray="2 4" />
            <XAxis
              dataKey="d"
              type="number"
              domain={zoomRange || ["dataMin", "dataMax"]}
              stroke="var(--muted)"
              tick={{ fontSize: 11 }}
              tickLine={false}
              tickFormatter={(v) => `${Math.round(v)}m`}
              allowDataOverflow
            />
            <YAxis
              stroke="var(--muted)"
              tick={{ fontSize: 11 }}
              tickLine={false}
              domain={[-absMax, absMax]}
              width={60}
              tickFormatter={(v) =>
                `${v > 0 ? "+" : ""}${Math.round(v)}`
              }
            />
            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const entry = payload.find(
                  (p) => typeof p.value === "number" && isFinite(p.value)
                );
                if (!entry) return null;
                const v = entry.value;
                const color =
                  v > 1
                    ? "var(--green)"
                    : v < -1
                      ? "var(--accent)"
                      : "var(--muted)";
                const tag =
                  v > 1 ? "MAIS RAPIDO" : v < -1 ? "MAIS LENTO" : "IGUAL";
                const sign = v > 0 ? "+" : "";
                return (
                  <div
                    style={{
                      background: "var(--surface-2)",
                      border: "1px solid var(--border)",
                      padding: "8px 12px",
                      fontFamily:
                        'ui-monospace, "SF Mono", "Consolas", monospace',
                      fontSize: 12,
                      lineHeight: 1.5,
                    }}
                  >
                    <div
                      style={{
                        color: "var(--muted)",
                        fontSize: 10,
                        letterSpacing: "0.1em",
                      }}
                    >
                      {Math.round(label)}m
                    </div>
                    <div style={{ color, fontWeight: 600 }}>
                      {tag} {sign}
                      {v.toFixed(1)} km/h
                    </div>
                  </div>
                );
              }}
            />
            <ReferenceLine y={0} stroke="var(--muted)" strokeWidth={1} />
            {drag && (
              <ReferenceArea
                x1={drag.start}
                x2={drag.end}
                fill="var(--accent)"
                fillOpacity={0.15}
                stroke="var(--accent)"
                strokeOpacity={0.4}
              />
            )}
            {sectorMarkers?.s1 != null && (
              <ReferenceLine
                x={sectorMarkers.s1}
                stroke="#ffd60a"
                strokeOpacity={0.55}
                strokeDasharray="4 3"
                label={{
                  value: "S1",
                  position: "insideTopLeft",
                  fill: "#ffd60a",
                  fontSize: 10,
                }}
              />
            )}
            {sectorMarkers?.s2 != null && (
              <ReferenceLine
                x={sectorMarkers.s2}
                stroke="#ffd60a"
                strokeOpacity={0.55}
                strokeDasharray="4 3"
                label={{
                  value: "S2",
                  position: "insideTopLeft",
                  fill: "#ffd60a",
                  fontSize: 10,
                }}
              />
            )}
            <Area
              type="monotone"
              dataKey="delta"
              stroke="none"
              fill="url(#spdPos)"
              baseValue={0}
              isAnimationActive={false}
            />
            <Area
              type="monotone"
              dataKey={(d) => (d.delta < 0 ? d.delta : 0)}
              stroke="none"
              fill="url(#spdNeg)"
              baseValue={0}
              isAnimationActive={false}
            />
            <Area
              type="monotone"
              dataKey="delta"
              stroke="#c77dff"
              strokeWidth={2}
              fill="none"
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default memo(SpeedDeltaChartBase);
