import { useMemo, useState } from "react";
import Modal from "./Modal.jsx";
import SegmentMiniMap from "./SegmentMiniMap.jsx";

const TYPE_COLOR = {
  braking: "var(--brake)",
  exit: "var(--throttle)",
  straight: "var(--speed)",
};

const TYPE_LABEL = {
  braking: "FREADA",
  exit: "SAÍDA",
  straight: "RETA",
};

function deltaColor(delta) {
  if (delta == null) return "var(--tx-2)";
  if (delta > 0.005) return Math.abs(delta) > 0.2 ? "var(--crit)" : "var(--warn)";
  if (delta < -0.005) return "var(--ok)";
  return "var(--tx-2)";
}

function fmtSigned(d) {
  if (d == null) return "—";
  return (d > 0 ? "+" : "") + d.toFixed(3) + "s";
}

function pillStyle(active) {
  return {
    padding: "4px 8px",
    background: active ? "var(--bg-2)" : "transparent",
    border: "1px solid var(--bd-1)",
    color: active ? "var(--tx-0)" : "var(--tx-3)",
    fontSize: 9,
    letterSpacing: "0.14em",
    cursor: "pointer",
  };
}

function SegmentCard({ seg, telemetry, onClick }) {
  const color = TYPE_COLOR[seg.type];
  const dColor = deltaColor(seg.delta);
  const subId = seg.cornerIdx
    ? `T${seg.cornerIdx}`
    : seg.name.replace(/^RETA\s*/, "");
  return (
    <button
      type="button"
      onClick={onClick}
      title="Clique pra dar zoom nesse trecho nos gráficos"
      style={{
        display: "flex",
        flexDirection: "column",
        background: "var(--bg-1)",
        border: "1px solid var(--bd-0)",
        borderTop: `3px solid ${color}`,
        padding: 0,
        textAlign: "left",
        cursor: "pointer",
        overflow: "hidden",
        transition: "background .1s",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "var(--bg-2)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "var(--bg-1)";
      }}
    >
      <div
        style={{
          padding: "9px 12px",
          background: "var(--bg-0)",
          borderBottom: "1px solid var(--bd-0)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <div
          style={{ display: "flex", alignItems: "baseline", gap: 8 }}
        >
          <span
            className="mono"
            style={{
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: "0.14em",
              color: color,
              textTransform: "uppercase",
            }}
          >
            {TYPE_LABEL[seg.type]}
          </span>
          <span
            className="mono"
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: "var(--tx-0)",
              letterSpacing: "0.02em",
            }}
          >
            {subId}
          </span>
        </div>
        <span
          className="mono"
          style={{
            fontSize: 10,
            letterSpacing: "0.14em",
            color: "var(--tx-3)",
          }}
        >
          {Math.round(seg.to - seg.from)}m
        </span>
      </div>

      <div
        style={{
          aspectRatio: "16/10",
          background: "var(--bg-0)",
          borderBottom: "1px solid var(--bd-0)",
          padding: 6,
        }}
      >
        <SegmentMiniMap
          telemetry={telemetry}
          segmentFrom={seg.from}
          segmentTo={seg.to}
          highlightColor={dColor}
          width={240}
          height={150}
        />
      </div>

      <div
        style={{
          padding: "10px 12px",
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}
      >
        <div
          className="mono"
          style={{
            fontSize: 22,
            fontWeight: 600,
            color: dColor,
            letterSpacing: "-0.01em",
            lineHeight: 1,
          }}
        >
          {fmtSigned(seg.delta)}
        </div>
        <div
          className="mono"
          style={{
            display: "flex",
            gap: 14,
            fontSize: 10,
            color: "var(--tx-3)",
            letterSpacing: "0.06em",
          }}
        >
          <span>
            VOCÊ{" "}
            <span style={{ color: "var(--tx-1)" }}>
              {seg.timeCurrent != null ? seg.timeCurrent.toFixed(3) : "—"}
            </span>
          </span>
          <span>
            REF{" "}
            <span style={{ color: "var(--tx-2)" }}>
              {seg.timeReference != null ? seg.timeReference.toFixed(3) : "—"}
            </span>
          </span>
        </div>
      </div>
    </button>
  );
}

export default function SegmentAnalysisModal({
  open,
  onClose,
  deltas,
  telemetry,
  referenceTelemetry,
  onSegmentSelect,
}) {
  const [sortMode, setSortMode] = useState("loss");
  const [typeFilter, setTypeFilter] = useState("all");

  const rows = useMemo(() => {
    let r = deltas.filter((d) => d.delta != null);
    if (typeFilter !== "all") r = r.filter((d) => d.type === typeFilter);
    if (sortMode === "track") return [...r].sort((a, b) => a.from - b.from);
    return [...r].sort((a, b) => b.delta - a.delta);
  }, [deltas, sortMode, typeFilter]);

  const totals = useMemo(() => {
    const sum = { braking: 0, exit: 0, straight: 0, all: 0 };
    for (const d of deltas) {
      if (d.delta == null) continue;
      sum[d.type] += d.delta;
      sum.all += d.delta;
    }
    return sum;
  }, [deltas]);

  const handleCardClick = (seg) => {
    onSegmentSelect?.(seg);
    onClose?.();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="ANÁLISE POR SEGMENTO"
      subtitle={`${rows.length} SEGMENTO${rows.length === 1 ? "" : "S"} · CLIQUE PRA ZOOM`}
      width={1100}
    >
      <div
        style={{
          padding: "12px 14px",
          borderBottom: "1px solid var(--bd-0)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div
          style={{ display: "flex", gap: 14, alignItems: "center" }}
          className="mono"
        >
          <span
            style={{
              fontSize: 9,
              letterSpacing: "0.14em",
              color: "var(--tx-3)",
            }}
          >
            TOTAL
          </span>
          <span
            style={{
              fontSize: 16,
              fontWeight: 600,
              color: deltaColor(totals.all),
            }}
          >
            {fmtSigned(totals.all)}
          </span>
          {["braking", "exit", "straight"].map((t) => (
            <span
              key={t}
              style={{
                fontSize: 11,
                letterSpacing: "0.04em",
                color: "var(--tx-3)",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  background: TYPE_COLOR[t],
                  borderRadius: 1,
                }}
              />
              <span style={{ color: "var(--tx-2)" }}>{TYPE_LABEL[t]}</span>
              <span
                style={{ color: deltaColor(totals[t]), fontWeight: 500 }}
              >
                {fmtSigned(totals[t])}
              </span>
            </span>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <div style={{ display: "flex" }}>
            {[
              ["all", "TODOS"],
              ["braking", "FREADAS"],
              ["exit", "SAÍDAS"],
              ["straight", "RETAS"],
            ].map(([v, l], i) => (
              <button
                key={v}
                type="button"
                onClick={() => setTypeFilter(v)}
                className="mono"
                style={{
                  ...pillStyle(typeFilter === v),
                  borderLeft: i === 0 ? "1px solid var(--bd-1)" : "none",
                }}
              >
                {l}
              </button>
            ))}
          </div>
          <div style={{ display: "flex" }}>
            {[
              ["loss", "MAIOR PERDA"],
              ["track", "ORDEM DA PISTA"],
            ].map(([v, l], i) => (
              <button
                key={v}
                type="button"
                onClick={() => setSortMode(v)}
                className="mono"
                style={{
                  ...pillStyle(sortMode === v),
                  borderLeft: i === 0 ? "1px solid var(--bd-1)" : "none",
                }}
              >
                {l}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div
        style={{
          padding: 14,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
          gap: 12,
        }}
      >
        {rows.map((seg, i) => (
          <SegmentCard
            key={`${seg.from}-${seg.to}-${i}`}
            seg={seg}
            telemetry={referenceTelemetry || telemetry}
            onClick={() => handleCardClick(seg)}
          />
        ))}
        {rows.length === 0 && (
          <div
            style={{
              padding: "40px 0",
              textAlign: "center",
              gridColumn: "1 / -1",
            }}
            className="mono"
          >
            <span
              style={{
                fontSize: 10,
                letterSpacing: "0.18em",
                color: "var(--tx-3)",
              }}
            >
              SEM SEGMENTOS NESSE FILTRO
            </span>
          </div>
        )}
      </div>
    </Modal>
  );
}
