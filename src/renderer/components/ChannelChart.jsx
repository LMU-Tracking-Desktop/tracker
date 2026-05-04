import { memo, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceArea,
  ReferenceLine,
} from "recharts";

/**
 * Um canal de telemetria (throttle, brake, steering, speed) plotado sobre
 * distancia. Ref sempre em cinza tracejado pra ficar claro o que e referencia.
 *
 * props:
 *   title, subtitle, channelKey (ex: 'th' | 'br' | 'st' | 'v'),
 *   color, formatter(v) -> string, yDomain,
 *   current, reference (samples arrays),
 *   onHover, onZoomChange, zoomRange, height
 */
function ChannelChartBase({
  title,
  subtitle,
  channelKey,
  color,
  formatter,
  yDomain,
  current,
  reference,
  onHover,
  onZoomChange,
  zoomRange,
  sectorMarkers,
  height = 140,
  stepped = false, // step chart pra dados categoricos (ex: marcha)
}) {
  const lineType = stepped ? "stepAfter" : "monotone";
  const [drag, setDrag] = useState(null);

  const dataAll = useMemo(() => {
    if (!current || current.length === 0) return [];
    // Usa interpolacao pra alinhar ref nos mesmos pontos de d
    let refMap = null;
    if (reference && reference.length > 0) {
      refMap = reference;
    }
    return current.map((s) => {
      const out = {
        d: s.d,
        v: s[channelKey],
      };
      if (refMap) {
        // binary-ish search por d
        let lo = 0;
        let hi = refMap.length - 1;
        while (lo < hi - 1) {
          const mid = (lo + hi) >> 1;
          if (refMap[mid].d < s.d) lo = mid;
          else hi = mid;
        }
        const a = refMap[lo];
        const b = refMap[hi];
        const frac = b.d === a.d ? 0 : Math.max(0, Math.min(1, (s.d - a.d) / (b.d - a.d)));
        out.v_ref = a[channelKey] + frac * (b[channelKey] - a[channelKey]);
      }
      return out;
    });
  }, [current, reference, channelKey]);

  const data = useMemo(() => {
    if (!zoomRange) return dataAll;
    return dataAll.filter((d) => d.d >= zoomRange[0] && d.d <= zoomRange[1]);
  }, [dataAll, zoomRange]);

  if (!dataAll.length) return null;

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

  const fmt = formatter || ((v) => `${Math.round(v)}`);

  return (
    <div
      className="border hairline flex flex-col"
      style={{ background: "var(--surface)" }}
    >
      <div className="px-4 py-2 border-b hairline flex items-center justify-between">
        <span
          className="mono text-[10px] tracking-[0.2em]"
          style={{ color }}
        >
          {title}
        </span>
        {subtitle && (
          <span className="mono text-[10px] tracking-[0.2em] text-muted">
            {subtitle}
          </span>
        )}
      </div>
      <div style={{ height, userSelect: "none" }} className="p-2">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data}
            margin={{ top: 4, right: 12, bottom: 2, left: 8 }}
            onMouseMove={handleMove}
            onMouseDown={handleDown}
            onMouseUp={handleUp}
            onMouseLeave={handleLeave}
          >
            <CartesianGrid stroke="var(--border)" strokeDasharray="2 4" />
            <XAxis
              dataKey="d"
              type="number"
              domain={zoomRange || ["dataMin", "dataMax"]}
              stroke="var(--muted)"
              tick={{ fontSize: 10 }}
              tickLine={false}
              tickFormatter={(v) => `${Math.round(v)}m`}
              allowDataOverflow
            />
            <YAxis
              stroke="var(--muted)"
              tick={{ fontSize: 10 }}
              tickLine={false}
              domain={yDomain}
              width={50}
              tickFormatter={fmt}
            />
            <Tooltip
              contentStyle={{
                background: "var(--surface-2)",
                border: "1px solid var(--border)",
                fontSize: 12,
              }}
              labelStyle={{ color: "var(--muted)" }}
              labelFormatter={(v) => `${Math.round(v)}m`}
              formatter={(v, name) => [
                v != null ? fmt(v) : "—",
                name === "v_ref" ? "referencia" : "atual",
              ]}
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
                  fontFamily:
                    'ui-monospace, "SF Mono", "Consolas", monospace',
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
                  fontFamily:
                    'ui-monospace, "SF Mono", "Consolas", monospace',
                }}
              />
            )}
            {reference && (
              <Line
                type={lineType}
                dataKey="v_ref"
                stroke="#8a8a92"
                strokeWidth={1.2}
                strokeDasharray="3 3"
                dot={false}
                isAnimationActive={false}
                name="v_ref"
              />
            )}
            <Line
              type={lineType}
              dataKey="v"
              stroke={color}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
              name="v"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default memo(ChannelChartBase);
