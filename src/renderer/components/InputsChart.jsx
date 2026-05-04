import { useMemo, useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceArea,
} from "recharts";
import { mergeForChart } from "../lib/telemetry.js";

/**
 * Inputs (throttle/brake/steering) + velocidade vs distancia.
 * onHover(d | null): chamado quando mouse passa sobre o grafico (distancia em m)
 * onZoomChange([start, end] | null): chamado quando user seleciona uma faixa via click+drag
 * zoomRange: faixa atual de zoom (filtra os samples exibidos)
 */
export default function InputsChart({
  telemetry,
  reference,
  onHover,
  onZoomChange,
  zoomRange,
}) {
  const [drag, setDrag] = useState(null); // { start, end }

  const dataAll = useMemo(() => {
    if (!telemetry || telemetry.length === 0) return [];
    if (!reference) {
      return telemetry.map((s) => ({
        d: s.d,
        throttle: Math.round(s.th * 100),
        brake: Math.round(s.br * 100),
        steering: Math.round(s.st * 100),
        speed: s.v,
      }));
    }
    return mergeForChart(telemetry, reference);
  }, [telemetry, reference]);

  const data = useMemo(() => {
    if (!zoomRange) return dataAll;
    return dataAll.filter((d) => d.d >= zoomRange[0] && d.d <= zoomRange[1]);
  }, [dataAll, zoomRange]);

  if (!dataAll.length) return null;

  const hasRef = !!reference;

  const handleMove = (state) => {
    if (!state?.isTooltipActive || state.activeLabel == null) return;
    if (drag) {
      setDrag({ start: drag.start, end: state.activeLabel });
    } else if (onHover) {
      onHover(state.activeLabel);
    }
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

  const chartHandlers = {
    onMouseMove: handleMove,
    onMouseDown: handleDown,
    onMouseUp: handleUp,
    onMouseLeave: handleLeave,
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Inputs */}
      <div
        className="border hairline flex flex-col"
        style={{ background: "var(--surface)" }}
      >
        <div className="px-4 py-3 border-b hairline flex items-center justify-between">
          <span className="mono text-[10px] tracking-[0.2em] text-muted">
            INPUTS
          </span>
          <span className="mono text-[10px] tracking-[0.2em] text-muted">
            {hasRef
              ? "SOLIDO · ATUAL · TRACEJADO · REF"
              : "VERDE · THROTTLE · VERMELHO · BRAKE · AZUL · STEERING"}
          </span>
        </div>
        <div className="h-[260px] p-3" style={{ userSelect: "none" }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={data}
              margin={{ top: 8, right: 12, bottom: 4, left: 8 }}
              {...chartHandlers}
            >
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
                domain={[-100, 100]}
                width={50}
                tickFormatter={(v) => `${v}%`}
              />
              <Tooltip
                contentStyle={{
                  background: "var(--surface-2)",
                  border: "1px solid var(--border)",
                  fontSize: 12,
                }}
                labelStyle={{ color: "var(--muted)" }}
                labelFormatter={(v) => `${Math.round(v)}m`}
                formatter={(v, name) => [`${v}%`, name]}
              />
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
              {hasRef && (
                <>
                  <Line
                    type="monotone"
                    dataKey="throttle_ref"
                    stroke="#30f58a"
                    strokeWidth={1}
                    strokeOpacity={0.4}
                    strokeDasharray="3 3"
                    dot={false}
                    isAnimationActive={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="brake_ref"
                    stroke="#ff2d2d"
                    strokeWidth={1}
                    strokeOpacity={0.4}
                    strokeDasharray="3 3"
                    dot={false}
                    isAnimationActive={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="steering_ref"
                    stroke="#5ac8ff"
                    strokeWidth={1}
                    strokeOpacity={0.4}
                    strokeDasharray="3 3"
                    dot={false}
                    isAnimationActive={false}
                  />
                </>
              )}
              <Line
                type="monotone"
                dataKey="throttle"
                stroke="#30f58a"
                strokeWidth={1.8}
                dot={false}
                isAnimationActive={false}
                name="throttle"
              />
              <Line
                type="monotone"
                dataKey="brake"
                stroke="#ff2d2d"
                strokeWidth={1.8}
                dot={false}
                isAnimationActive={false}
                name="brake"
              />
              <Line
                type="monotone"
                dataKey="steering"
                stroke="#5ac8ff"
                strokeWidth={1.2}
                dot={false}
                isAnimationActive={false}
                name="steering"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Velocidade */}
      <div
        className="border hairline flex flex-col"
        style={{ background: "var(--surface)" }}
      >
        <div className="px-4 py-3 border-b hairline flex items-center justify-between">
          <span className="mono text-[10px] tracking-[0.2em] text-muted">
            VELOCIDADE
          </span>
          <span className="mono text-[10px] tracking-[0.2em] text-muted">
            {hasRef ? "ROXO · ATUAL · TRACEJADO · REF" : "KM/H"}
          </span>
        </div>
        <div className="h-[200px] p-3" style={{ userSelect: "none" }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={data}
              margin={{ top: 8, right: 12, bottom: 4, left: 8 }}
              {...chartHandlers}
            >
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
                width={50}
                tickFormatter={(v) => `${Math.round(v)}`}
              />
              <Tooltip
                contentStyle={{
                  background: "var(--surface-2)",
                  border: "1px solid var(--border)",
                  fontSize: 12,
                }}
                labelStyle={{ color: "var(--muted)" }}
                labelFormatter={(v) => `${Math.round(v)}m`}
                formatter={(v, name) => [`${v} km/h`, name]}
              />
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
              {hasRef && (
                <Line
                  type="monotone"
                  dataKey="speed_ref"
                  stroke="#c77dff"
                  strokeWidth={1}
                  strokeOpacity={0.4}
                  strokeDasharray="3 3"
                  dot={false}
                  isAnimationActive={false}
                />
              )}
              <Line
                type="monotone"
                dataKey="speed"
                stroke="#c77dff"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
