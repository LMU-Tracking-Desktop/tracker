// app-charts.jsx — chart primitives, sparklines, gauges
const { useState: uS, useEffect: uE, useMemo: uM, useRef: uR } = React;

function pathLine(values, w, h, opts = {}) {
  const { signed = false, padTop = 4, padBottom = 4 } = opts;
  if (!values || !values.length) return "";
  const usable = h - padTop - padBottom;
  const dx = w / (values.length - 1);
  let d = "";
  values.forEach((v, i) => {
    const yn = signed ? (v + 1) / 2 : v;
    const y = padTop + (1 - yn) * usable;
    d += (i ? "L" : "M") + (i * dx).toFixed(1) + " " + y.toFixed(1) + " ";
  });
  return d;
}
function pathArea(values, w, h, opts = {}) {
  return pathLine(values, w, h, opts) + ` L ${w} ${h} L 0 ${h} Z`;
}
function pathFromPairs(xs, ys, w, h, ymin, ymax, opts = {}) {
  if (!xs || !xs.length) return "";
  const xmax = xs[xs.length - 1];
  const xmin = xs[0];
  const usable = h - 8;
  let d = "";
  for (let i = 0; i < xs.length; i++) {
    const x = ((xs[i] - xmin) / (xmax - xmin)) * w;
    const yn = (ys[i] - ymin) / (ymax - ymin);
    const y = 4 + (1 - yn) * usable;
    d += (i ? "L" : "M") + x.toFixed(1) + " " + y.toFixed(1) + " ";
  }
  return d;
}

function Sparkline({ values, color = "var(--accent)", width = 80, height = 20, signed = false }) {
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: "block" }}>
      <path d={pathLine(values, width, height, { signed, padTop: 2, padBottom: 2 })}
        fill="none" stroke={color} strokeWidth="1.2" />
    </svg>
  );
}

function StatCard({ label, value, hint, accent, big, crit }) {
  return (
    <div style={{
      background: "var(--bg-1)", border: "1px solid var(--bd-0)",
      padding: "var(--pad)",
      display: "flex", flexDirection: "column", gap: 8, minHeight: 92,
    }}>
      <div className="mono" style={{ fontSize: 10, color: "var(--tx-2)", letterSpacing: ".14em" }}>{label}</div>
      <div className="mono" style={{
        fontSize: big ? 38 : 30, fontWeight: 600, lineHeight: 1,
        color: crit ? "var(--crit)" : (accent ? "var(--accent)" : "var(--tx-0)"),
        letterSpacing: "-.01em",
      }}>{value}</div>
      {hint && <div className="mono" style={{ fontSize: 10, color: "var(--tx-3)", letterSpacing: ".1em" }}>{hint}</div>}
    </div>
  );
}

function ChartPanel({ title, children, right, height = 220, footer }) {
  return (
    <div style={{ background: "var(--bg-1)", border: "1px solid var(--bd-0)", display: "flex", flexDirection: "column" }}>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 14px", borderBottom: "1px solid var(--bd-0)",
      }}>
        <span className="mono" style={{ fontSize: 10, color: "var(--tx-1)", letterSpacing: ".14em" }}>{title}</span>
        {right && <span className="mono" style={{ fontSize: 10, color: "var(--tx-3)", letterSpacing: ".14em" }}>{right}</span>}
      </div>
      <div style={{ height, padding: "12px 14px", position: "relative", display: "flex", flexDirection: "column" }}>
        {children}
      </div>
      {footer && <div style={{ padding: "8px 14px", borderTop: "1px solid var(--bd-0)", background: "var(--bg-2)" }}>{footer}</div>}
    </div>
  );
}

function Grid({ values, width, height, ticks = 4, vTicks = 8 }) {
  return (
    <g>
      {Array.from({ length: ticks + 1 }).map((_, i) => (
        <line key={"h" + i} x1="0" x2={width} y1={(i * height) / ticks} y2={(i * height) / ticks}
          stroke="var(--bd-0)" strokeWidth="1" />
      ))}
      {Array.from({ length: vTicks + 1 }).map((_, i) => (
        <line key={"v" + i} y1="0" y2={height} x1={(i * width) / vTicks} x2={(i * width) / vTicks}
          stroke="var(--bd-0)" strokeWidth="1" opacity=".5" />
      ))}
    </g>
  );
}

// channel chart with label, axis, area-fill, sector markers
function ChannelChart({ label, color, values, distance, length, sectors, ymin = 0, ymax = 1, unit = "%", height = 130, signed = false, hardLine = false }) {
  const W = 1000, H = height;
  const dPath = pathFromPairs(distance, values, W, H, ymin, ymax);
  // build area
  const last = values.length - 1;
  let area = dPath + ` L ${W} ${H} L 0 ${H} Z`;

  return (
    <div style={{ background: "var(--bg-1)", border: "1px solid var(--bd-0)" }}>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "8px 12px", borderBottom: "1px solid var(--bd-0)",
      }}>
        <span className="mono" style={{ fontSize: 10, color, letterSpacing: ".16em", fontWeight: 600 }}>{label}</span>
        <span className="mono" style={{ fontSize: 10, color: "var(--tx-3)", letterSpacing: ".14em" }}>{unit}</span>
      </div>
      <div style={{ position: "relative" }}>
        <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ display: "block" }}>
          <Grid width={W} height={H} ticks={4} vTicks={10} />
          {signed && <line x1="0" x2={W} y1={H / 2} y2={H / 2} stroke="var(--bd-1)" strokeWidth=".6" strokeDasharray="3 4" />}
          {!hardLine && <path d={area} fill={color} opacity=".10" />}
          <path d={dPath} stroke={color} strokeWidth={hardLine ? "1.4" : "1.2"} fill="none" vectorEffect="non-scaling-stroke" />
          {/* sector markers */}
          {sectors && sectors.map((s, i) => {
            const x = (s / length) * W;
            return (
              <g key={i}>
                <line x1={x} x2={x} y1="0" y2={H} stroke="var(--gear)" strokeWidth="0.8" strokeDasharray="3 3" opacity=".55" />
                <text x={x + 4} y="14" fontFamily="Geist Mono, monospace" fontSize="9" fill="var(--gear)" letterSpacing=".1em">S{i + 1}</text>
              </g>
            );
          })}
        </svg>
        {/* y-axis labels */}
        <div className="mono" style={{
          position: "absolute", top: 0, left: 6, right: 6, height: "100%",
          display: "flex", flexDirection: "column", justifyContent: "space-between",
          pointerEvents: "none",
        }}>
          {[ymax, (ymax + ymin) / 2, ymin].map((v, i) => (
            <span key={i} style={{ fontSize: 9, color: "var(--tx-3)", letterSpacing: ".05em" }}>
              {Math.round(v * 100) / 100}{unit === "%" ? "%" : ""}
            </span>
          ))}
        </div>
      </div>
      {/* x-axis */}
      <div className="mono" style={{
        display: "flex", justifyContent: "space-between", padding: "4px 12px 8px",
        fontSize: 9, color: "var(--tx-3)", letterSpacing: ".08em",
      }}>
        <span>1m</span>
        <span>{Math.round(length * 0.25)}m</span>
        <span>{Math.round(length * 0.5)}m</span>
        <span>{Math.round(length * 0.75)}m</span>
        <span>{length}m</span>
      </div>
    </div>
  );
}

// Track outline (stylized — abstract shape)
function TrackMap({ trackId = "paul-ricard", carT = -1, sectors = [], showSectors = true, height = 200, glow = false }) {
  const trackPaths = {
    "paul-ricard": "M 60 130 C 80 60, 200 50, 280 80 S 420 60, 500 90 C 580 120, 700 100, 760 140 C 820 180, 800 230, 740 240 C 660 252, 580 230, 500 240 C 380 250, 260 244, 180 220 C 100 200, 50 180, 60 130 Z",
    "le-mans":     "M 50 140 C 130 60, 280 70, 380 100 C 460 124, 540 80, 640 100 C 740 120, 800 180, 760 230 C 720 270, 580 280, 460 250 C 340 224, 260 260, 180 250 C 80 240, 30 200, 50 140 Z",
    "spa":         "M 80 180 C 60 80, 220 70, 320 110 C 400 140, 480 90, 580 130 C 680 170, 760 130, 800 200 C 820 250, 700 280, 600 250 C 480 220, 380 270, 260 240 C 140 210, 90 240, 80 180 Z",
    "monza":       "M 60 110 C 80 60, 240 50, 380 80 C 540 110, 700 80, 800 130 C 820 180, 800 240, 700 250 C 560 260, 380 240, 240 250 C 120 258, 50 220, 60 110 Z",
    "fuji":        "M 80 110 C 100 50, 280 60, 420 90 C 560 120, 700 90, 760 150 C 800 210, 720 260, 580 250 C 420 240, 280 260, 180 240 C 80 220, 60 170, 80 110 Z",
  };
  const d = trackPaths[trackId] || trackPaths["paul-ricard"];
  const pathRef = uR(null);
  const [carPos, setCarPos] = uS(null);
  const [secPos, setSecPos] = uS([]);

  uE(() => {
    if (!pathRef.current) return;
    const len = pathRef.current.getTotalLength();
    if (carT >= 0) {
      const p = pathRef.current.getPointAtLength(len * carT);
      const p2 = pathRef.current.getPointAtLength(Math.min(len, len * carT + 1));
      const a = Math.atan2(p2.y - p.y, p2.x - p.x);
      setCarPos({ x: p.x, y: p.y, a });
    }
    if (showSectors && sectors.length) {
      setSecPos(sectors.map((t) => {
        const p = pathRef.current.getPointAtLength(len * t);
        return { x: p.x, y: p.y };
      }));
    }
  }, [carT, trackId, JSON.stringify(sectors), showSectors]);

  return (
    <svg viewBox="0 0 880 320" width="100%" height={height} preserveAspectRatio="xMidYMid meet">
      {/* glow */}
      {glow && <path d={d} stroke="var(--accent)" strokeWidth="14" fill="none" opacity=".06" />}
      {/* track surface */}
      <path d={d} stroke="#1a1a1a" strokeWidth="11" fill="none" strokeLinejoin="round" />
      <path ref={pathRef} d={d} stroke="var(--tx-2)" strokeWidth="1" fill="none" strokeLinejoin="round" />
      <path d={d} stroke="var(--bd-2)" strokeWidth=".8" fill="none" strokeDasharray="3 5" opacity=".7" />

      {/* sector markers */}
      {secPos.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r="4.5" fill="var(--gear)" stroke="var(--bg-0)" strokeWidth="1.5" />
          <text x={p.x + 7} y={p.y + 3} fontFamily="Geist Mono, monospace" fontSize="9" fill="var(--gear)" letterSpacing=".1em">S{i + 1}</text>
        </g>
      ))}

      {/* car as oriented rectangle (placeholder for real 3D model) */}
      {carPos && (
        <g transform={`translate(${carPos.x},${carPos.y}) rotate(${(carPos.a * 180) / Math.PI})`}>
          <rect x="-5" y="-2.5" width="10" height="5" fill="var(--accent)" stroke="var(--accent-ink)" strokeWidth=".6" />
        </g>
      )}
    </svg>
  );
}

window.APP_CHARTS = {
  Sparkline, StatCard, ChartPanel, ChannelChart, TrackMap,
  pathLine, pathArea, pathFromPairs,
};
