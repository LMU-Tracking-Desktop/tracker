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

const BASE = {
  tick: {
    fontFamily:
      'ui-monospace, "SF Mono", "Consolas", monospace',
    fontSize: 11,
  },
  tooltipContent: {
    background: "var(--surface-2)",
    border: "1px solid var(--border)",
    fontFamily: 'ui-monospace, "SF Mono", "Consolas", monospace',
    fontSize: 12,
    color: "var(--foreground)",
  },
  tooltipLabel: { color: "var(--muted)", letterSpacing: "0.1em" },
};

function ChartWrap({ title, subtitle, children }) {
  return (
    <div
      className="border hairline flex flex-col"
      style={{ background: "var(--surface)" }}
    >
      <div className="px-4 py-3 border-b hairline flex items-center justify-between">
        <span className="mono text-[10px] tracking-[0.2em] text-muted">
          {title}
        </span>
        {subtitle && (
          <span className="mono text-[10px] tracking-[0.2em] text-muted">
            {subtitle}
          </span>
        )}
      </div>
      <div className="h-[280px] p-3">{children}</div>
    </div>
  );
}

export function LapTimeChart({ data, avg }) {
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
    <ChartWrap title="TEMPO DE VOLTA" subtitle="● AMARELO = TOQUE · ▲ = INVALIDA">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={markedData}
          margin={{ top: 8, right: 12, bottom: 4, left: 8 }}
        >
          <CartesianGrid stroke="var(--border)" strokeDasharray="2 4" />
          <XAxis
            dataKey="lap"
            stroke="var(--muted)"
            tick={BASE.tick}
            tickLine={false}
          />
          <YAxis
            stroke="var(--muted)"
            tick={BASE.tick}
            tickLine={false}
            tickFormatter={(v) => formatLapTime(v)}
            width={70}
            domain={[yMin, yMax]}
          />
          <Tooltip
            contentStyle={BASE.tooltipContent}
            labelStyle={BASE.tooltipLabel}
            labelFormatter={(l) => `VOLTA ${l}`}
            formatter={(v, name, item) => {
              if (v == null) return null;
              if (name === "invalidMarker") {
                const t = item?.payload?.invalid;
                return [t && t > 0 ? formatLapTime(t) : "cortada", "invalida"];
              }
              if (name === "touch") {
                return [formatLapTime(v), "com toque"];
              }
              return [formatLapTime(v), "valida"];
            }}
          />
          {avg != null && (
            <ReferenceLine
              y={avg}
              stroke="var(--muted)"
              strokeDasharray="4 4"
              label={{
                value: `MEDIA ${formatLapTime(avg)}`,
                fill: "var(--muted)",
                fontSize: 10,
                letterSpacing: "0.15em",
                position: "right",
              }}
            />
          )}
          <Line
            type="monotone"
            dataKey="valid"
            stroke="var(--accent)"
            strokeWidth={2}
            dot={{ r: 3, fill: "var(--accent)" }}
            activeDot={{ r: 5 }}
            connectNulls
            isAnimationActive={false}
            name="valid"
          />
          <Scatter
            dataKey="touch"
            fill="#ffd60a"
            stroke="#1a1400"
            strokeWidth={1}
            shape="circle"
            name="touch"
          />
          <Scatter
            dataKey="invalidMarker"
            fill="#ffd60a"
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
    <ChartWrap title="POSICAO" subtitle="1º NO TOPO">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={data}
          margin={{ top: 8, right: 12, bottom: 4, left: 8 }}
        >
          <CartesianGrid stroke="var(--border)" strokeDasharray="2 4" />
          <XAxis
            dataKey="lap"
            stroke="var(--muted)"
            tick={BASE.tick}
            tickLine={false}
          />
          <YAxis
            stroke="var(--muted)"
            tick={BASE.tick}
            tickLine={false}
            reversed
            domain={[1, Math.max(maxPos, 1)]}
            allowDecimals={false}
            width={40}
          />
          <Tooltip
            contentStyle={BASE.tooltipContent}
            labelStyle={BASE.tooltipLabel}
            labelFormatter={(l) => `VOLTA ${l}`}
            formatter={(v) => [`P${v}`, "posicao"]}
          />
          <Line
            type="stepAfter"
            dataKey="position"
            stroke="var(--yellow)"
            strokeWidth={2}
            dot={{ r: 3, fill: "var(--yellow)" }}
            activeDot={{ r: 5 }}
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
    <ChartWrap title="DESGASTE DE PNEU" subtitle="MEDIA (%)">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={view} margin={{ top: 8, right: 12, bottom: 4, left: 8 }}>
          <CartesianGrid stroke="var(--border)" strokeDasharray="2 4" />
          <XAxis
            dataKey="lap"
            stroke="var(--muted)"
            tick={BASE.tick}
            tickLine={false}
          />
          <YAxis
            stroke="var(--muted)"
            tick={BASE.tick}
            tickLine={false}
            tickFormatter={(v) => `${v}%`}
            width={50}
            domain={[0, 100]}
          />
          <Tooltip
            contentStyle={BASE.tooltipContent}
            labelStyle={BASE.tooltipLabel}
            labelFormatter={(l) => `VOLTA ${l}`}
            formatter={(v) => [`${v}%`, "desgaste"]}
          />
          <Line
            type="monotone"
            dataKey="tyrePct"
            stroke="#5ac8ff"
            strokeWidth={2}
            dot={{ r: 3, fill: "#5ac8ff" }}
            activeDot={{ r: 5 }}
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
    <ChartWrap title="COMBUSTIVEL" subtitle={`TANQUE ${capacity.toFixed(0)}L`}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 8 }}>
          <CartesianGrid stroke="var(--border)" strokeDasharray="2 4" />
          <XAxis
            dataKey="lap"
            stroke="var(--muted)"
            tick={BASE.tick}
            tickLine={false}
          />
          <YAxis
            stroke="var(--muted)"
            tick={BASE.tick}
            tickLine={false}
            tickFormatter={(v) => `${v}L`}
            width={50}
            domain={[0, capacity]}
          />
          <Tooltip
            contentStyle={BASE.tooltipContent}
            labelStyle={BASE.tooltipLabel}
            labelFormatter={(l) => `VOLTA ${l}`}
            formatter={(v, name) => [
              `${(v ?? 0).toFixed(2)}L`,
              name === "fuelRemaining" ? "restante" : "consumo",
            ]}
          />
          <Line
            type="monotone"
            dataKey="fuelRemaining"
            stroke="#30f58a"
            strokeWidth={2}
            dot={{ r: 3, fill: "#30f58a" }}
            activeDot={{ r: 5 }}
            isAnimationActive={false}
            name="fuelRemaining"
          />
          <Line
            type="monotone"
            dataKey="fuelUsed"
            stroke="#ff8a3d"
            strokeWidth={1.5}
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
