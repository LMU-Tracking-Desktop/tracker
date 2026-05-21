import { useEffect, useMemo, useRef, useState } from "react";
import { coachConsistency, segLabel } from "../lib/coach.js";

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

function fmtSigned(d) {
  if (d == null) return "—";
  return (d > 0 ? "+" : "") + d.toFixed(3) + "s";
}

function fmtLap(t) {
  if (t == null || t <= 0) return "—";
  const m = Math.floor(t / 60);
  const s = (t % 60).toFixed(3).padStart(6, "0");
  return `${m}:${s}`;
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
      {right}
    </div>
  );
}

function ModeToggle({ mode, onChange }) {
  return (
    <div style={{ display: "flex", border: "1px solid var(--bd-1)" }}>
      {[
        ["session", "SESSÃO"],
        ["history", "HISTÓRICO"],
      ].map(([v, l], i) => {
        const active = mode === v;
        return (
          <button
            key={v}
            type="button"
            onClick={() => onChange(v)}
            className="mono"
            style={{
              padding: "3px 7px",
              fontSize: 8.5,
              letterSpacing: "0.12em",
              background: active ? "var(--bg-3)" : "transparent",
              color: active ? "var(--accent)" : "var(--tx-3)",
              border: "none",
              borderLeft: i === 0 ? "none" : "1px solid var(--bd-1)",
              fontWeight: active ? 600 : 400,
              cursor: "pointer",
            }}
          >
            {l}
          </button>
        );
      })}
    </div>
  );
}

function RecurrenceBadge({ lost, total, severity }) {
  const color = SEV_COLOR[severity] || "var(--tx-2)";
  return (
    <span
      className="mono"
      style={{
        fontSize: 9,
        letterSpacing: "0.1em",
        color,
        border: `1px solid ${color}`,
        padding: "2px 5px",
        whiteSpace: "nowrap",
      }}
    >
      {lost}/{total} VOLTAS
    </span>
  );
}

function CoachItem({ seg, onClick }) {
  const tip = seg.tip || { text: "", kind: "line" };
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
          alignItems: "center",
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
        <RecurrenceBadge
          lost={seg.lapsLost}
          total={seg.lapsTotal}
          severity={seg.severity}
        />
      </div>
      <span style={{ fontSize: 11, lineHeight: 1.45, color: "var(--tx-1)" }}>
        {tip.text}
      </span>
      <span
        className="mono"
        style={{
          fontSize: 9,
          letterSpacing: "0.1em",
          color: "var(--tx-3)",
        }}
      >
        PERDA TÍPICA {fmtSigned(seg.medianLoss)} · PIOR{" "}
        {fmtSigned(seg.worstLoss)}
      </span>
    </button>
  );
}

function Notice({ children, color }) {
  return (
    <div style={{ padding: "var(--pad)" }}>
      <span
        className="mono"
        style={{
          fontSize: 10,
          letterSpacing: "0.1em",
          color: color || "var(--tx-3)",
          lineHeight: 1.6,
        }}
      >
        {children}
      </span>
    </div>
  );
}

export default function CoachPanel({
  segments,
  referenceTelemetry,
  referenceLapId,
  sessionLaps,
  trackId,
  carClass,
  onSegmentSelect,
}) {
  const [mode, setMode] = useState("session");
  const [pool, setPool] = useState({ laps: [], loading: false });
  const cacheRef = useRef(new Map());

  const hasRef = !!referenceTelemetry && !!segments?.length;

  useEffect(() => {
    if (!hasRef) {
      setPool({ laps: [], loading: false });
      return;
    }
    let cancelled = false;
    (async () => {
      setPool((p) => ({ ...p, loading: true }));

      let candidates = [];
      if (mode === "session") {
        candidates = (sessionLaps || [])
          .filter(
            (l) => l.hasTelemetry && l.isValid && l.id !== referenceLapId
          )
          .map((l) => ({ id: l.id, label: `V${l.lapNumber}` }));
      } else {
        const hist =
          (await window.api?.getTopLapsByTrack?.({
            trackId,
            carClass,
            limit: 30,
          })) ?? [];
        candidates = hist
          .filter((l) => l.id !== referenceLapId)
          .map((l) => ({ id: l.id, label: fmtLap(l.lapTime) }));
      }

      const laps = [];
      await Promise.all(
        candidates.map(async (c) => {
          let s = cacheRef.current.get(c.id);
          if (!s) {
            s = await window.api?.getLapTelemetry?.(c.id);
            if (s) cacheRef.current.set(c.id, s);
          }
          if (s) laps.push({ ...c, samples: s });
        })
      );
      if (cancelled) return;
      setPool({ laps, loading: false });
    })();
    return () => {
      cancelled = true;
    };
  }, [
    mode,
    hasRef,
    referenceLapId,
    referenceTelemetry,
    segments,
    sessionLaps,
    trackId,
    carClass,
  ]);

  const result = useMemo(() => {
    if (!hasRef || !pool.laps.length) return null;
    return coachConsistency({
      segments,
      reference: referenceTelemetry,
      laps: pool.laps,
    });
  }, [hasRef, pool.laps, segments, referenceTelemetry]);

  const wrap = { background: "var(--bg-1)", border: "1px solid var(--bd-0)" };

  if (!hasRef) {
    return (
      <div style={wrap}>
        <Header>Coach · Consistência</Header>
        <Notice>
          ESCOLHA UMA VOLTA EM "COMPARAR COM" PARA O COACH MEDIR O QUE VOCÊ
          ERRA DE FORMA CONSISTENTE.
        </Notice>
      </div>
    );
  }

  const ranked = result?.ranked || [];
  const lapsAnalyzed = result?.lapsAnalyzed || 0;

  return (
    <div style={wrap}>
      <Header right={<ModeToggle mode={mode} onChange={setMode} />}>
        Coach · Consistência
      </Header>

      {pool.loading ? (
        <Notice>ANALISANDO SUAS VOLTAS...</Notice>
      ) : lapsAnalyzed < 2 ? (
        <Notice>
          PRECISA DE PELO MENOS 2 VOLTAS SUAS COM TELEMETRIA{" "}
          {mode === "session" ? "NESTA SESSÃO" : "NESTA PISTA"} PARA MEDIR
          CONSISTÊNCIA.
        </Notice>
      ) : (
        <>
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
              {lapsAnalyzed} VOLTAS ANALISADAS · ERROS RECORRENTES
            </span>
            <span
              className="mono"
              style={{
                fontSize: 22,
                fontWeight: 600,
                lineHeight: 1,
                color:
                  result.summary.recurringLoss > 0.05
                    ? "var(--crit)"
                    : "var(--ok)",
              }}
            >
              {fmtSigned(result.summary.recurringLoss)}
            </span>
            <span
              className="mono"
              style={{
                fontSize: 10,
                letterSpacing: "0.06em",
                color: "var(--tx-2)",
              }}
            >
              Tempo por volta que dá pra recuperar corrigindo os hábitos
              abaixo.
            </span>
          </div>

          <div
            style={{
              padding: "var(--pad)",
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            {ranked.length === 0 ? (
              <span
                className="mono"
                style={{
                  fontSize: 10,
                  letterSpacing: "0.1em",
                  color: "var(--ok)",
                  lineHeight: 1.6,
                }}
              >
                NENHUM ERRO RECORRENTE — SUAS PERDAS SÃO PONTUAIS, NÃO DE
                TÉCNICA. FOQUE EM REPETIR A VOLTA BOA.
              </span>
            ) : (
              ranked
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
        </>
      )}
    </div>
  );
}
