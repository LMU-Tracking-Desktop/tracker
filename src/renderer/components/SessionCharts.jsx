import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
  Scatter,
  ComposedChart,
} from "recharts";
import { formatLapTime } from "../lib/format.js";

const TICK = {
  fontFamily: "Geist Mono, ui-monospace, monospace",
  fontSize: 10,
  fill: "var(--tx-3)",
};
const TOOLTIP = {
  contentStyle: {
    background: "var(--bg-3)",
    border: "1px solid var(--bd-2)",
    fontFamily: "Geist Mono, ui-monospace, monospace",
    fontSize: 11,
    color: "var(--tx-0)",
    letterSpacing: "0.04em",
  },
  labelStyle: { color: "var(--tx-3)", letterSpacing: "0.1em" },
  itemStyle: { color: "var(--tx-0)" },
};

function ChartWrap({ title, subtitle, children, height = 280 }) {
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
      <div style={{ height, padding: 12 }}>{children}</div>
    </div>
  );
}

export function LapTimeChart({ data, avg, best }) {
  const validTimes = data.map((d) => d.valid).filter((v) => v != null);
  const min = validTimes.length ? Math.min(...validTimes) : 0;
  const max = validTimes.length ? Math.max(...validTimes) : 1;
  const pad = Math.max(0.5, (max - min) * 0.15);
  const yMin = Math.max(0, min - pad);
  const yMax = max + pad;

  const floor = yMin + (yMax - yMin) * 0.02;
  const markedData = data.map((d) => ({
    ...d,
    invalidMarker: d.invalid != null ? floor : null,
  }));

  return (
    <ChartWrap title="Tempo de Volta" subtitle="● TOQUE  ▲ INVÁLIDA">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={markedData}
          margin={{ top: 8, right: 12, bottom: 4, left: 8 }}
        >
          <CartesianGrid stroke="var(--bd-0)" strokeDasharray="2 4" />
          <XAxis
            dataKey="lap"
            stroke="var(--tx-3)"
            tick={TICK}
            tickLine={false}
          />
          <YAxis
            stroke="var(--tx-3)"
            tick={TICK}
            tickLine={false}
            tickFormatter={(v) => formatLapTime(v)}
            width={70}
            domain={[yMin, yMax]}
          />
          <Tooltip
            {...TOOLTIP}
            labelFormatter={(l) => `VOLTA ${l}`}
            formatter={(v, name, item) => {
              if (v == null) return null;
              if (name === "invalidMarker") {
                const t = item?.payload?.invalid;
                return [t && t > 0 ? formatLapTime(t) : "cortada", "inválida"];
              }
              if (name === "touch") {
                return [formatLapTime(v), "com toque"];
              }
              return [formatLapTime(v), "válida"];
            }}
          />
          {avg != null && (
            <ReferenceLine
              y={avg}
              stroke="var(--tx-3)"
              strokeDasharray="4 4"
              label={{
                value: `MÉDIA ${formatLapTime(avg)}`,
                fill: "var(--tx-3)",
                fontSize: 9,
                fontFamily: "Geist Mono",
                letterSpacing: "0.14em",
                position: "right",
              }}
            />
          )}
          {best != null && (
            <ReferenceLine
              y={best}
              stroke="var(--speed)"
              strokeDasharray="2 4"
              strokeOpacity={0.5}
            />
          )}
          <Line
            type="monotone"
            dataKey="valid"
            stroke="var(--crit)"
            strokeWidth={1.4}
            dot={{ r: 2.5, fill: "var(--crit)", strokeWidth: 0 }}
            activeDot={{ r: 4, fill: "var(--accent)" }}
            connectNulls
            isAnimationActive={false}
            name="valid"
          />
          <Scatter
            dataKey="touch"
            fill="var(--warn)"
            stroke="#1a1400"
            strokeWidth={1}
            shape="circle"
            name="touch"
          />
          <Scatter
            dataKey="invalidMarker"
            fill="var(--warn)"
            shape="triangle"
            name="invalidMarker"
          />
        </ComposedChart>
      </ResponsiveContainer>
    </ChartWrap>
  );
}

export function PositionChart({ data }) {
  const points = data.filter((d) => d.position != null);
  const maxPos = Math.max(...points.map((d) => d.position ?? 0), 10);
  return (
    <ChartWrap title="Posição" subtitle="1º NO TOPO">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={data}
          margin={{ top: 8, right: 12, bottom: 4, left: 8 }}
        >
          <CartesianGrid stroke="var(--bd-0)" strokeDasharray="2 4" />
          <XAxis
            dataKey="lap"
            stroke="var(--tx-3)"
            tick={TICK}
            tickLine={false}
          />
          <YAxis
            stroke="var(--tx-3)"
            tick={TICK}
            tickLine={false}
            reversed
            domain={[1, Math.max(maxPos, 1)]}
            allowDecimals={false}
            width={40}
          />
          <Tooltip
            {...TOOLTIP}
            labelFormatter={(l) => `VOLTA ${l}`}
            formatter={(v) => [`P${v}`, "posição"]}
          />
          <Line
            type="stepAfter"
            dataKey="position"
            stroke="var(--warn)"
            strokeWidth={1.6}
            dot={{ r: 2.5, fill: "var(--warn)", strokeWidth: 0 }}
            activeDot={{ r: 4 }}
            connectNulls
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </ChartWrap>
  );
}

export function TyreWearChart({ data }) {
  const view = data.map((d) => ({
    ...d,
    tyrePct: d.tyre != null ? +(d.tyre * 100).toFixed(1) : null,
  }));
  return (
    <ChartWrap title="Desgaste de Pneu" subtitle="MÉDIA (%)">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={view} margin={{ top: 8, right: 12, bottom: 4, left: 8 }}>
          <CartesianGrid stroke="var(--bd-0)" strokeDasharray="2 4" />
          <XAxis
            dataKey="lap"
            stroke="var(--tx-3)"
            tick={TICK}
            tickLine={false}
          />
          <YAxis
            stroke="var(--tx-3)"
            tick={TICK}
            tickLine={false}
            tickFormatter={(v) => `${v}%`}
            width={50}
            domain={[0, 100]}
          />
          <Tooltip
            {...TOOLTIP}
            labelFormatter={(l) => `VOLTA ${l}`}
            formatter={(v) => [`${v}%`, "desgaste"]}
          />
          <Line
            type="monotone"
            dataKey="tyrePct"
            stroke="var(--steer)"
            strokeWidth={1.6}
            dot={{ r: 2.5, fill: "var(--steer)", strokeWidth: 0 }}
            activeDot={{ r: 4 }}
            connectNulls
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </ChartWrap>
  );
}

export function FuelChart({ data, capacity }) {
  return (
    <ChartWrap title="Combustível" subtitle={`TANQUE ${capacity.toFixed(0)}L`}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 8 }}>
          <CartesianGrid stroke="var(--bd-0)" strokeDasharray="2 4" />
          <XAxis
            dataKey="lap"
            stroke="var(--tx-3)"
            tick={TICK}
            tickLine={false}
          />
          <YAxis
            stroke="var(--tx-3)"
            tick={TICK}
            tickLine={false}
            tickFormatter={(v) => `${v}L`}
            width={50}
            domain={[0, capacity]}
          />
          <Tooltip
            {...TOOLTIP}
            labelFormatter={(l) => `VOLTA ${l}`}
            formatter={(v, name) => [
              `${(v ?? 0).toFixed(2)}L`,
              name === "fuelRemaining" ? "restante" : "consumo",
            ]}
          />
          <Line
            type="monotone"
            dataKey="fuelRemaining"
            stroke="var(--ok)"
            strokeWidth={1.6}
            dot={{ r: 2.5, fill: "var(--ok)", strokeWidth: 0 }}
            activeDot={{ r: 4 }}
            isAnimationActive={false}
            name="fuelRemaining"
          />
          <Line
            type="monotone"
            dataKey="fuelUsed"
            stroke="var(--warn)"
            strokeWidth={1.2}
            strokeDasharray="4 4"
            dot={false}
            isAnimationActive={false}
            name="fuelUsed"
          />
        </LineChart>
      </ResponsiveContainer>
    </ChartWrap>
  );
}
