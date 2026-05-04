import { memo, useEffect, useMemo, useRef, useState } from "react";
import { computeDelta } from "../lib/telemetry.js";

const MAX_SEGMENTS = 900;

function subsample(arr, target) {
  if (arr.length <= target) return arr;
  const out = new Array(target);
  const step = (arr.length - 1) / (target - 1);
  for (let i = 0; i < target; i++) out[i] = arr[Math.round(i * step)];
  return out;
}

function extractPoints(samples) {
  if (!samples) return [];
  return samples
    .filter((s) => typeof s.x === "number" && typeof s.z === "number")
    .map((s) => ({ x: s.x, z: s.z, d: s.d }));
}

function TrackMapBase({
  telemetry,
  reference,
  hoverDistance,
  zoomRange,
  sectorMarkers,
}) {
  // "overlay" = mostrar as 2 linhas (atual + ref). Ativo quando:
  // - usuario clicou no switch SOBREPOR
  // - OU houve zoom via chart (range selecionado)
  const [showOverlay, setShowOverlay] = useState(false);
  const showBoth = (showOverlay || zoomRange != null) && !!reference;

  // Geometria base do tracado (samples projetados pra SVG)
  const geom = useMemo(() => {
    if (!telemetry || telemetry.length < 10) return null;
    let pts = extractPoints(telemetry);
    let refPts = reference ? extractPoints(reference) : null;

    if (zoomRange) {
      pts = pts.filter((p) => p.d >= zoomRange[0] && p.d <= zoomRange[1]);
      if (refPts) {
        refPts = refPts.filter(
          (p) => p.d >= zoomRange[0] && p.d <= zoomRange[1]
        );
      }
    }

    if (pts.length < 5) return null;

    const sub = subsample(pts, MAX_SEGMENTS);
    const subRef =
      refPts && refPts.length > 5 ? subsample(refPts, MAX_SEGMENTS) : null;

    const allX = [...sub.map((p) => p.x), ...(subRef?.map((p) => p.x) ?? [])];
    const allZ = [...sub.map((p) => p.z), ...(subRef?.map((p) => p.z) ?? [])];
    const minX = Math.min(...allX);
    const maxX = Math.max(...allX);
    const minZ = Math.min(...allZ);
    const maxZ = Math.max(...allZ);
    const trackW = Math.max(1, maxX - minX);
    const trackH = Math.max(1, maxZ - minZ);

    const width = 360;
    const pad = zoomRange ? 28 : 18;
    const aspect = trackW / trackH;
    const height = Math.max(
      180,
      Math.min(480, (width - pad * 2) / aspect + pad * 2)
    );

    const scaleX = (width - pad * 2) / trackW;
    const scaleY = (height - pad * 2) / trackH;
    const scale = Math.min(scaleX, scaleY);

    const drawW = trackW * scale;
    const drawH = trackH * scale;
    const offsetX = (width - drawW) / 2;
    const offsetY = (height - drawH) / 2;

    const project = (p) => ({
      x: offsetX + (p.x - minX) * scale,
      y: offsetY + drawH - (p.z - minZ) * scale,
      d: p.d,
    });

    const projected = sub.map(project);
    const projectedRef = subRef ? subRef.map(project) : null;

    return { projected, projectedRef, width, height };
  }, [telemetry, reference, zoomRange]);

  // Cores por delta — so usadas quando mostrando so linha atual
  const segColors = useMemo(() => {
    if (!geom) return null;
    const { projected } = geom;
    if (!reference) {
      return projected.map(() => "rgba(138,138,146,0.6)");
    }
    const deltas = computeDelta(telemetry, reference);
    const colors = new Array(projected.length);
    let idx = 0;
    const deltaAt = (d) => {
      while (idx < deltas.length - 1 && deltas[idx + 1].d < d) idx++;
      return deltas[idx]?.delta ?? 0;
    };
    let prev = deltaAt(projected[0].d);
    const segDelta = new Array(projected.length);
    segDelta[0] = 0;
    for (let i = 1; i < projected.length; i++) {
      const cur = deltaAt(projected[i].d);
      segDelta[i] = cur - prev;
      prev = cur;
    }
    const absMax = Math.max(0.005, ...segDelta.map((v) => Math.abs(v)));
    for (let i = 0; i < projected.length; i++) {
      const d = segDelta[i];
      const intensity = Math.min(1, Math.abs(d) / absMax);
      if (intensity < 0.15) {
        colors[i] = "rgba(138,138,146,0.6)";
      } else if (d > 0) {
        colors[i] = `rgba(255, 45, 45, ${(0.4 + intensity * 0.55).toFixed(2)})`;
      } else {
        colors[i] = `rgba(48, 245, 138, ${(0.4 + intensity * 0.55).toFixed(2)})`;
      }
    }
    return colors;
  }, [geom, telemetry, reference]);

  const hoverPoint = useMemo(() => {
    if (!geom || hoverDistance == null) return null;
    const { projected } = geom;
    let best = projected[0];
    let bestDiff = Math.abs(projected[0].d - hoverDistance);
    for (const p of projected) {
      const diff = Math.abs(p.d - hoverDistance);
      if (diff < bestDiff) {
        bestDiff = diff;
        best = p;
      }
    }
    return best;
  }, [geom, hoverDistance]);

  const sectorPoints = useMemo(() => {
    if (!geom || !sectorMarkers) return null;
    const { projected } = geom;
    const findAt = (d) => {
      if (d == null) return null;
      let best = null;
      let bestDiff = Infinity;
      for (const p of projected) {
        const diff = Math.abs(p.d - d);
        if (diff < bestDiff) {
          bestDiff = diff;
          best = p;
        }
      }
      return best;
    };
    return { s1: findAt(sectorMarkers.s1), s2: findAt(sectorMarkers.s2) };
  }, [geom, sectorMarkers]);

  // ── Scroll zoom / pan (viewBox local) ──
  const containerRef = useRef(null);
  const baseViewBox = geom
    ? { x: 0, y: 0, w: geom.width, h: geom.height }
    : { x: 0, y: 0, w: 360, h: 240 };
  const [viewBox, setViewBox] = useState(baseViewBox);

  // Reseta viewBox quando telemetria ou zoomRange mudam (novo contexto)
  useEffect(() => {
    if (geom) {
      setViewBox({ x: 0, y: 0, w: geom.width, h: geom.height });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [telemetry, reference, zoomRange, geom?.width, geom?.height]);

  const viewBoxRef = useRef(viewBox);
  viewBoxRef.current = viewBox;
  const geomRef = useRef(geom);
  geomRef.current = geom;

  // Wheel listener nativo (React onWheel e passive, nao aceita preventDefault)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e) => {
      e.preventDefault();
      const g = geomRef.current;
      const vb = viewBoxRef.current;
      if (!g) return;
      const rect = el.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const svgX = vb.x + (mx / rect.width) * vb.w;
      const svgY = vb.y + (my / rect.height) * vb.h;
      const zoomFactor = e.deltaY > 0 ? 1.15 : 1 / 1.15;
      let newW = vb.w * zoomFactor;
      let newH = vb.h * zoomFactor;
      const maxW = g.width;
      const maxH = g.height;
      const minW = g.width / 10;
      const minH = g.height / 10;
      newW = Math.max(minW, Math.min(maxW, newW));
      newH = Math.max(minH, Math.min(maxH, newH));
      const newX = svgX - (mx / rect.width) * newW;
      const newY = svgY - (my / rect.height) * newH;
      setViewBox({ x: newX, y: newY, w: newW, h: newH });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // Drag to pan
  const [drag, setDrag] = useState(null);
  const onMouseDown = (e) => {
    if (e.button !== 0) return;
    setDrag({
      mx: e.clientX,
      my: e.clientY,
      vbX: viewBox.x,
      vbY: viewBox.y,
    });
  };
  const onMouseMove = (e) => {
    if (!drag || !containerRef.current || !geom) return;
    const rect = containerRef.current.getBoundingClientRect();
    const dxSvg = ((e.clientX - drag.mx) / rect.width) * viewBox.w;
    const dySvg = ((e.clientY - drag.my) / rect.height) * viewBox.h;
    setViewBox({
      x: drag.vbX - dxSvg,
      y: drag.vbY - dySvg,
      w: viewBox.w,
      h: viewBox.h,
    });
  };
  const onMouseUp = () => setDrag(null);

  const resetView = () => {
    if (geom) setViewBox({ x: 0, y: 0, w: geom.width, h: geom.height });
  };
  const isZoomed =
    geom &&
    (viewBox.x !== 0 ||
      viewBox.y !== 0 ||
      viewBox.w !== geom.width ||
      viewBox.h !== geom.height);

  if (!geom || !segColors) return null;
  const { projected, projectedRef, width, height } = geom;
  const vbStr = `${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`;

  return (
    <div
      className="border hairline flex flex-col"
      style={{ background: "var(--surface)" }}
    >
      <div className="px-4 py-2 border-b hairline flex items-center justify-between gap-2">
        <span className="mono text-[10px] tracking-[0.2em] text-muted">
          TRACADO{zoomRange ? " · ZOOM" : ""}
          {isZoomed ? " · MANUAL" : ""}
        </span>
        <div className="flex items-center gap-2">
          {reference && (
            <label
              className="mono text-[10px] tracking-[0.2em] text-muted flex items-center gap-1.5 cursor-pointer select-none"
              title="Sobrepor a volta de referencia"
            >
              <input
                type="checkbox"
                checked={showOverlay}
                onChange={(e) => setShowOverlay(e.target.checked)}
              />
              SOBREPOR
            </label>
          )}
          <button
            type="button"
            className="btn"
            onClick={resetView}
            disabled={!isZoomed}
            style={{
              opacity: isZoomed ? 1 : 0.4,
              padding: "4px 8px",
              fontSize: 10,
            }}
            title="Voltar ao enquadramento inicial"
          >
            RESETAR
          </button>
        </div>
      </div>
      <div
        ref={containerRef}
        className="p-3 flex justify-center"
        style={{
          cursor: drag ? "grabbing" : isZoomed ? "grab" : "default",
          userSelect: "none",
        }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
      >
        <div style={{ position: "relative", width: "100%", maxWidth: width }}>
          <svg
            viewBox={vbStr}
            preserveAspectRatio="xMidYMid meet"
            style={{
              width: "100%",
              maxWidth: width,
              height: "auto",
              display: "block",
            }}
          >
            {/* Sombra base */}
            <g>
              {projected.map((p, i) =>
                i === 0 ? null : (
                  <line
                    key={`base-${i}`}
                    x1={projected[i - 1].x}
                    y1={projected[i - 1].y}
                    x2={p.x}
                    y2={p.y}
                    stroke="var(--border)"
                    strokeWidth={showBoth ? 3 : 4}
                    strokeLinecap="round"
                    vectorEffect="non-scaling-stroke"
                  />
                )
              )}
            </g>

            {showBoth ? (
              <>
                {/* Referencia em cinza tracejado */}
                {projectedRef && projectedRef.length > 1 && (
                  <g>
                    {projectedRef.map((p, i) =>
                      i === 0 ? null : (
                        <line
                          key={`ref-${i}`}
                          x1={projectedRef[i - 1].x}
                          y1={projectedRef[i - 1].y}
                          x2={p.x}
                          y2={p.y}
                          stroke="rgba(200, 200, 210, 0.9)"
                          strokeWidth={2.4}
                          strokeDasharray="4 3"
                          strokeLinecap="round"
                          vectorEffect="non-scaling-stroke"
                        />
                      )
                    )}
                  </g>
                )}
                {/* Atual em accent */}
                <g>
                  {projected.map((p, i) =>
                    i === 0 ? null : (
                      <line
                        key={`cur-${i}`}
                        x1={projected[i - 1].x}
                        y1={projected[i - 1].y}
                        x2={p.x}
                        y2={p.y}
                        stroke="var(--accent)"
                        strokeWidth={2.6}
                        strokeLinecap="round"
                        vectorEffect="non-scaling-stroke"
                      />
                    )
                  )}
                </g>
              </>
            ) : (
              /* Tracado colorido por delta */
              <g>
                {projected.map((p, i) =>
                  i === 0 ? null : (
                    <line
                      key={`seg-${i}`}
                      x1={projected[i - 1].x}
                      y1={projected[i - 1].y}
                      x2={p.x}
                      y2={p.y}
                      stroke={segColors[i]}
                      strokeWidth={2.2}
                      strokeLinecap="round"
                      vectorEffect="non-scaling-stroke"
                    />
                  )
                )}
              </g>
            )}

            {/* Sector markers */}
            {sectorPoints?.s1 && (
              <g>
                <circle
                  cx={sectorPoints.s1.x}
                  cy={sectorPoints.s1.y}
                  r={5}
                  fill="#ffd60a"
                  stroke="#1a1400"
                  strokeWidth={1}
                />
                <text
                  x={sectorPoints.s1.x + 8}
                  y={sectorPoints.s1.y + 3}
                  fill="#ffd60a"
                  fontSize={10}
                  fontFamily='ui-monospace, "SF Mono", "Consolas", monospace'
                >
                  S1
                </text>
              </g>
            )}
            {sectorPoints?.s2 && (
              <g>
                <circle
                  cx={sectorPoints.s2.x}
                  cy={sectorPoints.s2.y}
                  r={5}
                  fill="#ffd60a"
                  stroke="#1a1400"
                  strokeWidth={1}
                />
                <text
                  x={sectorPoints.s2.x + 8}
                  y={sectorPoints.s2.y + 3}
                  fill="#ffd60a"
                  fontSize={10}
                  fontFamily='ui-monospace, "SF Mono", "Consolas", monospace'
                >
                  S2
                </text>
              </g>
            )}

            {/* Hover dot */}
            {hoverPoint && (
              <g>
                <circle
                  cx={hoverPoint.x}
                  cy={hoverPoint.y}
                  r={10}
                  fill="var(--foreground)"
                  fillOpacity={0.2}
                />
                <circle
                  cx={hoverPoint.x}
                  cy={hoverPoint.y}
                  r={5}
                  fill="var(--foreground)"
                  stroke="var(--background)"
                  strokeWidth={1.2}
                />
              </g>
            )}
          </svg>
        </div>
      </div>
      <div className="px-4 pb-2 mono text-[9px] tracking-widest text-muted text-center">
        SCROLL = ZOOM · ARRASTAR = PAN
      </div>
    </div>
  );
}

export default memo(TrackMapBase);
