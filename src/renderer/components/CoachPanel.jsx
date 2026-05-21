import { useMemo } from "react";
import { coachLap, segLabel } from "../lib/coach.js";

const KIND_COLOR = {
  brake: "var(--brake)",
  speed: "var(--speed)",
  throttle: "var(--throttle)",
  grip: "var(--warn)",
  line: "var(--steer)",
  ok: "var(--ok)",
};

const SEV_COLOR = {
  crit: "var(--crit)",
  warn: "var(--warn)",
  info: "var(--tx-2)",
  ok: "var(--ok)",
};

const TYPE_PT = { braking: "FREADAS", exit: "SAÍDAS", straight: "RETAS" };

function fmtSigned(d) {
  if (d == null) return "—";
  return (d > 0 ? "+" : "") + d.toFixed(3) + "s";
}

function Header({ children, right }) {
  return (
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
          fontWeight: 600,
        }}
      >
        {children}
      </span>
      {right && (
        <span
          className="mono"
          style={{
            fontSize: 9,
            letterSpacing: "0.14em",
            color: "var(--tx-3)",
            textTransform: "uppercase",
          }}
        >
          {right}
        </span>
      )}
    </div>
  );
}

function CoachItem({ seg, onClick }) {
  const tip = seg.tips[0];
  const sevColor = SEV_COLOR[seg.severity] || "var(--tx-2)";
  return (
    <button
      type="button"
      onClick={onClick}
      title="Clique para dar zoom neste trecho nos gráficos"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 6,
        textAlign: "left",
        background: "var(--bg-0)",
        border: "1px solid var(--bd-0)",
        borderLeft: `3px solid ${KIND_COLOR[tip.kind] || "var(--bd-2)"}`,
        padding: "9px 11px",
        cursor: "pointer",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "var(--bg-2)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "var(--bg-0)";
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <span
          className="mono"
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: "var(--tx-0)",
            letterSpacing: "0.06em",
          }}
        >
          {segLabel(seg)}
        </span>
        <span
          className="mono"
          style={{ fontSize: 12, fontWeight: 600, color: sevColor }}
        >
          {fmtSigned(seg.delta)}
        </span>
      </div>
      <span
        style={{
          fontSize: 11,
          lineHeight: 1.45,
          color: "var(--tx-1)",
        }}
      >
        {tip.text}
      </span>
    </button>
  );
}

export default function CoachPanel({
  deltas,
  telemetry,
  referenceTelemetry,
  onSegmentSelect,
}) {
  const result = useMemo(
    () => coachLap(deltas, telemetry, referenceTelemetry),
    [deltas, telemetry, referenceTelemetry]
  );

  const wrap = {
    background: "var(--bg-1)",
    border: "1px solid var(--bd-0)",
  };

  if (!referenceTelemetry || !deltas?.length) {
    return (
      <div style={wrap}>
        <Header>Coach</Header>
        <div style={{ padding: "var(--pad)" }}>
          <span
            className="mono"
            style={{
              fontSize: 10,
              letterSpacing: "0.1em",
              color: "var(--tx-3)",
              lineHeight: 1.6,
            }}
          >
            ESCOLHA UMA VOLTA EM "COMPARAR COM" PARA O COACH ANALISAR O QUE
            MUDAR.
          </span>
        </div>
      </div>
    );
  }

  const { summary } = result;
  const worst = summary?.worst || [];

  const worstType = summary
    ? Object.entries(summary.byType).sort((a, b) => b[1] - a[1])[0]
    : null;

  return (
    <div style={wrap}>
      <Header right={`${worst.length} A CORRIGIR`}>Coach</Header>

      <div
        style={{
          padding: "10px 14px",
          borderBottom: "1px solid var(--bd-0)",
          display: "flex",
          flexDirection: "column",
          gap: 4,
        }}
      >
        <span
          className="mono"
          style={{
            fontSize: 9,
            letterSpacing: "0.16em",
            color: "var(--tx-3)",
          }}
        >
          DIFERENÇA TOTAL PARA A REFERÊNCIA
        </span>
        <span
          className="mono"
          style={{
            fontSize: 22,
            fontWeight: 600,
            lineHeight: 1,
            color:
              summary && summary.totalLoss > 0.03
                ? "var(--crit)"
                : summary && summary.totalLoss < -0.03
                ? "var(--ok)"
                : "var(--tx-0)",
          }}
        >
          {fmtSigned(summary?.totalLoss)}
        </span>
        {worstType && worstType[1] > 0.03 && (
          <span
            className="mono"
            style={{
              fontSize: 10,
              letterSpacing: "0.06em",
              color: "var(--tx-2)",
            }}
          >
            Maior perda nas{" "}
            <span style={{ color: "var(--tx-0)", fontWeight: 600 }}>
              {TYPE_PT[worstType[0]]}
            </span>{" "}
            ({fmtSigned(worstType[1])})
          </span>
        )}
      </div>

      <div
        style={{
          padding: "var(--pad)",
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        {worst.length === 0 ? (
          <span
            className="mono"
            style={{
              fontSize: 10,
              letterSpacing: "0.1em",
              color: "var(--ok)",
              lineHeight: 1.6,
            }}
          >
            VOLTA LIMPA — NENHUM TRECHO COM PERDA RELEVANTE PARA A REFERÊNCIA.
          </span>
        ) : (
          worst
            .slice(0, 3)
            .map((seg, i) => (
              <CoachItem
                key={`${seg.from}-${seg.to}-${i}`}
                seg={seg}
                onClick={() => onSegmentSelect?.(seg)}
              />
            ))
        )}
      </div>
    </div>
  );
}
