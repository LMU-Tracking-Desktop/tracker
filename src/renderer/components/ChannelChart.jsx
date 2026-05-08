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
      style={{
        background: "var(--bg-1)",
        border: "1px solid var(--bd-0)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          padding: "8px 14px",
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
            letterSpacing: "0.16em",
            color,
            fontWeight: 600,
            textTransform: "uppercase",
          }}
        >
          {title}
        </span>
        {subtitle && (
          <span
            className="mono"
            style={{
              fontSize: 10,
              letterSpacing: "0.14em",
              color: "var(--tx-3)",
              textTransform: "uppercase",
            }}
          >
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
            <CartesianGrid stroke="var(--bd-0)" strokeDasharray="2 4" />
            <XAxis
              dataKey="d"
              type="number"
              domain={zoomRange || ["dataMin", "dataMax"]}
              stroke="var(--tx-3)"
              tick={{ fontSize: 9, fontFamily: "Geist Mono", fill: "var(--tx-3)" }}
              tickLine={false}
              tickFormatter={(v) => `${Math.round(v)}m`}
              allowDataOverflow
            />
            <YAxis
              stroke="var(--tx-3)"
              tick={{ fontSize: 9, fontFamily: "Geist Mono", fill: "var(--tx-3)" }}
              tickLine={false}
              domain={yDomain}
              width={50}
              tickFormatter={fmt}
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
              labelFormatter={(v) => `${Math.round(v)}m`}
              formatter={(v, name) => [
                v != null ? fmt(v) : "—",
                name === "v_ref" ? "referência" : "atual",
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
                stroke="var(--warn)"
                strokeOpacity={0.55}
                strokeDasharray="4 3"
                label={{
                  value: "S1",
                  position: "insideTopLeft",
                  fill: "var(--warn)",
                  fontSize: 9,
                  fontFamily: "Geist Mono",
                }}
              />
            )}
            {sectorMarkers?.s2 != null && (
              <ReferenceLine
                x={sectorMarkers.s2}
                stroke="var(--warn)"
                strokeOpacity={0.55}
                strokeDasharray="4 3"
                label={{
                  value: "S2",
                  position: "insideTopLeft",
                  fill: "var(--warn)",
                  fontSize: 9,
                  fontFamily: "Geist Mono",
                }}
              />
            )}
            {reference && (
              <Line
                type={lineType}
                dataKey="v_ref"
                stroke="var(--tx-2)"
                strokeWidth={1}
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
              strokeWidth={1.6}
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
