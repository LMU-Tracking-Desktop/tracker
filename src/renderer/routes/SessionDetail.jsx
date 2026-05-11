import { useEffect, useState } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import TypeBadge from "../components/TypeBadge.jsx";
import SessionLapsTable from "../components/SessionLapsTable.jsx";
import PageHeader from "../components/PageHeader.jsx";
import {
  LapTimeChart,
  PositionChart,
  TyreWearChart,
  FuelChart,
} from "../components/SessionCharts.jsx";
import { formatLapTime, formatSector, formatDateTime } from "../lib/format.js";
import { stats } from "../lib/stats.js";
import { computeOutlierSet } from "../lib/outlier.js";

function StatCell({ label, value, color, hint }) {
  return (
    <div
      style={{
        background: "var(--bg-1)",
        padding: "var(--pad)",
        display: "flex",
        flexDirection: "column",
        gap: 6,
        borderRight: "1px solid var(--bd-0)",
        borderBottom: "1px solid var(--bd-0)",
      }}
    >
      <span
        className="mono"
        style={{
          fontSize: 9,
          letterSpacing: "0.18em",
          color: "var(--tx-3)",
          textTransform: "uppercase",
        }}
      >
        {label}
      </span>
      <span
        className="mono"
        style={{
          fontSize: 22,
          fontWeight: 600,
          color: color || "var(--tx-0)",
          letterSpacing: "-0.01em",
          lineHeight: 1,
        }}
      >
        {value}
      </span>
      {hint && (
        <span
          className="mono"
          style={{
            fontSize: 9,
            letterSpacing: "0.14em",
            color: "var(--tx-2)",
            textTransform: "uppercase",
          }}
        >
          {hint}
        </span>
      )}
    </div>
  );
}

function StatCard({ label, value, color, hint }) {
  return (
    <div
      style={{
        background: "var(--bg-1)",
        border: "1px solid var(--bd-0)",
        padding: "var(--pad)",
        display: "flex",
        flexDirection: "column",
        gap: 6,
        minHeight: 92,
      }}
    >
      <span
        className="mono"
        style={{
          fontSize: 9,
          letterSpacing: "0.18em",
          color: "var(--tx-3)",
          textTransform: "uppercase",
        }}
      >
        {label}
      </span>
      <span
        className="mono"
        style={{
          fontSize: 24,
          fontWeight: 600,
          color: color || "var(--tx-0)",
          letterSpacing: "-0.01em",
          lineHeight: 1,
        }}
      >
        {value}
      </span>
      {hint && (
        <span
          className="mono"
          style={{
            fontSize: 9,
            letterSpacing: "0.14em",
            color: "var(--tx-2)",
            textTransform: "uppercase",
          }}
        >
          {hint}
        </span>
      )}
    </div>
  );
}

function fmtShortDate(d) {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  });
}

function IdealSectorCell({ k, ref, sessionBest, sessionId }) {
  if (!ref) {
    return (
      <div
        style={{
          padding: "var(--pad)",
          background: "var(--bg-1)",
          borderRight: "1px solid var(--bd-0)",
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}
      >
        <span
          className="mono"
          style={{
            fontSize: 9,
            letterSpacing: "0.18em",
            color: "var(--tx-3)",
          }}
        >
          {k}
        </span>
        <span
          className="mono"
          style={{ fontSize: 20, fontWeight: 600, color: "var(--tx-3)" }}
        >
          —
        </span>
      </div>
    );
  }

  const fromThisSession = ref.sessionId === sessionId;
  const gap =
    sessionBest != null && ref.value != null ? sessionBest - ref.value : null;

  return (
    <div
      style={{
        padding: "var(--pad)",
        background: "var(--bg-1)",
        borderRight: "1px solid var(--bd-0)",
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span
          className="mono"
          style={{
            fontSize: 9,
            letterSpacing: "0.18em",
            color: "var(--tx-3)",
          }}
        >
          {k}
        </span>
        <span
          className="mono"
          style={{
            fontSize: 8,
            letterSpacing: "0.16em",
            padding: "2px 6px",
            border: `1px solid ${
              fromThisSession ? "var(--ok)" : "var(--bd-1)"
            }`,
            color: fromThisSession ? "var(--ok)" : "var(--tx-2)",
          }}
        >
          {fromThisSession ? "ESTA SESSÃO" : fmtShortDate(ref.sessionStartedAt)}
        </span>
      </div>
      <span
        className="mono"
        style={{
          fontSize: 22,
          fontWeight: 600,
          color: fromThisSession ? "var(--ok)" : "var(--tx-0)",
          letterSpacing: "-0.01em",
          lineHeight: 1,
        }}
      >
        {formatSector(ref.value)}
      </span>
      {fromThisSession ? (
        <span
          className="mono"
          style={{
            fontSize: 9,
            letterSpacing: "0.14em",
            color: "var(--tx-3)",
          }}
        >
          SEU PB
        </span>
      ) : sessionBest != null ? (
        <div
          style={{ display: "flex", flexDirection: "column", gap: 2 }}
          className="mono"
        >
          <span
            style={{
              fontSize: 9,
              letterSpacing: "0.14em",
              color: "var(--tx-3)",
            }}
          >
            ESTA SESSÃO {formatSector(sessionBest)}
          </span>
          <span
            style={{
              fontSize: 11,
              color: gap > 0.5 ? "var(--crit)" : "var(--warn)",
              fontWeight: 500,
            }}
          >
            +{gap.toFixed(3)}s
          </span>
        </div>
      ) : (
        <span
          className="mono"
          style={{
            fontSize: 9,
            letterSpacing: "0.14em",
            color: "var(--tx-3)",
          }}
        >
          SEM REGISTRO NESTA SESSÃO
        </span>
      )}
    </div>
  );
}

function IdealLapCard({
  bestSectors,
  sessionBestS1,
  sessionBestS2,
  sessionBestS3,
  sessionBestLap,
  sessionId,
}) {
  if (!bestSectors) return null;
  const s1 = bestSectors.sector1?.value;
  const s2 = bestSectors.sector2?.value;
  const s3 = bestSectors.sector3?.value;
  const ideal = s1 != null && s2 != null && s3 != null ? s1 + s2 + s3 : null;
  const gap =
    ideal != null && sessionBestLap != null ? sessionBestLap - ideal : null;
  const overallBest = bestSectors.bestLap?.value ?? null;
  const overallFromThisSession =
    bestSectors.bestLap?.sessionId === sessionId;

  return (
    <div style={{ padding: "0 var(--pad) var(--pad)" }}>
      <div
        style={{
          background: "var(--bg-1)",
          border: "1px solid var(--bd-0)",
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
              fontWeight: 600,
            }}
          >
            Volta Ideal · Esta Pista + Classe
          </span>
          <span
            className="mono"
            style={{
              fontSize: 9,
              letterSpacing: "0.16em",
              color: "var(--tx-3)",
              textTransform: "uppercase",
            }}
          >
            Melhores Setores em Todas as Sessões
          </span>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.2fr 1fr",
            borderBottom: "1px solid var(--bd-0)",
          }}
        >
          <div
            style={{
              padding: "var(--pad)",
              borderRight: "1px solid var(--bd-0)",
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            <span
              className="mono"
              style={{
                fontSize: 9,
                letterSpacing: "0.18em",
                color: "var(--tx-3)",
                textTransform: "uppercase",
              }}
            >
              Potencial Teórico
            </span>
            <span
              className="mono"
              style={{
                fontSize: 34,
                fontWeight: 600,
                color: "var(--accent)",
                letterSpacing: "-0.02em",
                lineHeight: 1,
              }}
            >
              {ideal != null ? formatLapTime(ideal) : "—"}
            </span>
            {gap != null && (
              <span
                className="mono"
                style={{
                  fontSize: 11,
                  letterSpacing: "0.04em",
                  color: gap > 0.1 ? "var(--warn)" : "var(--ok)",
                }}
              >
                {gap > 0
                  ? `−${gap.toFixed(3)}s vs sua melhor desta sessão`
                  : "VOCÊ JÁ ESTÁ NO IDEAL DESTA SESSÃO"}
                {sessionBestLap != null && gap > 0 && (
                  <span style={{ color: "var(--tx-3)", marginLeft: 8 }}>
                    ({formatLapTime(sessionBestLap)})
                  </span>
                )}
              </span>
            )}
          </div>

          <div
            style={{
              padding: "var(--pad)",
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            <span
              className="mono"
              style={{
                fontSize: 9,
                letterSpacing: "0.18em",
                color: "var(--tx-3)",
                textTransform: "uppercase",
              }}
            >
              Melhor Volta Real (Histórico)
            </span>
            <span
              className="mono"
              style={{
                fontSize: 26,
                fontWeight: 600,
                color: overallFromThisSession ? "var(--ok)" : "var(--tx-0)",
                letterSpacing: "-0.02em",
                lineHeight: 1,
              }}
            >
              {overallBest != null ? formatLapTime(overallBest) : "—"}
            </span>
            {bestSectors.bestLap && (
              <span
                className="mono"
                style={{
                  fontSize: 9,
                  letterSpacing: "0.14em",
                  color: "var(--tx-3)",
                  textTransform: "uppercase",
                }}
              >
                {overallFromThisSession
                  ? "FEITA NESTA SESSÃO"
                  : `EM ${fmtShortDate(
                      bestSectors.bestLap.sessionStartedAt
                    )} · ${bestSectors.bestLap.car || ""}`}
              </span>
            )}
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
          }}
        >
          <IdealSectorCell
            k="S1"
            ref={bestSectors.sector1}
            sessionBest={sessionBestS1}
            sessionId={sessionId}
          />
          <IdealSectorCell
            k="S2"
            ref={bestSectors.sector2}
            sessionBest={sessionBestS2}
            sessionId={sessionId}
          />
          <IdealSectorCell
            k="S3"
            ref={bestSectors.sector3}
            sessionBest={sessionBestS3}
            sessionId={sessionId}
          />
        </div>
      </div>
    </div>
  );
}

function ClassPill({ cls }) {
  if (!cls) return null;
  return (
    <span
      className="mono"
      style={{
        padding: "3px 8px",
        fontSize: 9,
        letterSpacing: "0.16em",
        border: "1px solid var(--bd-1)",
        color: "var(--tx-1)",
        textTransform: "uppercase",
      }}
    >
      {cls}
    </span>
  );
}

export default function SessionDetail() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const selectedLapId = searchParams.get("lap");
  const referenceLapId = searchParams.get("ref");
  const setSelectedLapId = (id) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (id) next.set("lap", id);
        else next.delete("lap");
        return next;
      },
      { replace: true }
    );
  };
  const [outlierPct, setOutlierPct] = useState(7);
  const [bestSectors, setBestSectors] = useState(null);

  useEffect(() => {
    window.api?.getConfig?.().then((c) => {
      if (c) setOutlierPct(c.outlier_threshold_pct ?? 7);
    });
  }, []);

  useEffect(() => {
    if (!data?.laps || selectedLapId) return;
    const withTelemetry = data.laps.filter((l) => l.hasTelemetry && l.isValid);
    if (withTelemetry.length === 0) return;
    const best = withTelemetry.reduce((best, l) =>
      !best || l.lapTime < best.lapTime ? l : best
    );
    setSelectedLapId(best.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, selectedLapId]);

  const handleDeleteLap = async (lapId) => {
    const done = await window.api.deleteLap(lapId);
    if (done) {
      setData((prev) =>
        prev
          ? { ...prev, laps: prev.laps.filter((l) => l.id !== lapId) }
          : prev
      );
    }
  };

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const d = await window.api?.getSessionDetail?.(sessionId);
        if (!cancelled) {
          setData(d);
          setLoading(false);
        }
      } catch {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    const id = setInterval(load, 5000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [sessionId]);

  // Melhores setores em todas as sessoes (mesma pista + classe). Recarrega
  // junto com `data` pra refletir voltas novas que viraram PB em tempo real.
  useEffect(() => {
    if (!data?.session?.trackId) return;
    let cancelled = false;
    window.api
      ?.getBestSectorsForTrack?.({
        trackId: data.session.trackId,
        carClass: data.session.carClass,
      })
      .then((r) => {
        if (!cancelled) setBestSectors(r);
      });
    return () => {
      cancelled = true;
    };
  }, [data?.session?.trackId, data?.session?.carClass, data?.laps?.length]);

  const emptyBox = (label) => (
    <div
      style={{
        border: "1px solid var(--bd-0)",
        background: "var(--bg-1)",
        padding: "48px var(--pad)",
        textAlign: "center",
        margin: "var(--pad)",
      }}
    >
      <span
        className="mono"
        style={{
          fontSize: 10,
          letterSpacing: "0.18em",
          color: "var(--tx-3)",
        }}
      >
        {label}
      </span>
    </div>
  );

  if (loading) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          height: "100%",
          overflow: "auto",
        }}
      >
        <PageHeader
          crumbs={[
            { label: "SESSÕES", onClick: () => navigate("/sessoes") },
            { label: "..." },
          ]}
        />
        {emptyBox("CARREGANDO...")}
      </div>
    );
  }

  if (!data) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          height: "100%",
          overflow: "auto",
        }}
      >
        <PageHeader
          crumbs={[
            { label: "SESSÕES", onClick: () => navigate("/sessoes") },
            { label: "NÃO ENCONTRADA" },
          ]}
        />
        {emptyBox("SESSÃO NÃO ENCONTRADA")}
      </div>
    );
  }

  const { session, laps, car } = data;

  const outlierSet = computeOutlierSet(
    laps.map((l) => ({
      ...l,
      session: { type: session.type },
      sessionId: session.id,
    })),
    outlierPct
  );

  const nonOutlierValid = laps.filter(
    (l) => l.isValid && !outlierSet.has(l.id)
  );
  const validTimes = nonOutlierValid.map((l) => l.lapTime);
  const s = validTimes.length > 0 ? stats(validTimes) : null;
  const bestLapId =
    nonOutlierValid.find((l) => l.lapTime === s?.min)?.id ?? null;
  const worstLapId =
    s && s.max !== s.min
      ? nonOutlierValid.find((l) => l.lapTime === s.max)?.id ?? null
      : null;

  const bestSectorOf = (key) => {
    const vals = nonOutlierValid.map((l) => l[key]).filter((v) => v != null);
    return vals.length > 0 ? Math.min(...vals) : null;
  };
  const bestS1 = bestSectorOf("sector1");
  const bestS2 = bestSectorOf("sector2");
  const bestS3 = bestSectorOf("sector3");

  const totalFuelUsed = laps.reduce((acc, l) => acc + l.fuelUsed, 0);
  const totalInvalids = laps.filter((l) => !l.isValid).length;
  const firstPosition = laps.find((l) => l.position != null)?.position ?? null;
  const lastPosition =
    [...laps].reverse().find((l) => l.position != null)?.position ?? null;
  const finalTyre =
    [...laps].reverse().find((l) => l.tyreWearAvg != null)?.tyreWearAvg ?? null;
  const hasPosition = laps.some((l) => l.position != null);
  const hasTelemetry = laps.some((l) => l.hasTelemetry);

  const goTelemetry = () => {
    const q = [];
    if (selectedLapId) q.push(`lap=${encodeURIComponent(selectedLapId)}`);
    if (referenceLapId) q.push(`ref=${encodeURIComponent(referenceLapId)}`);
    const qs = q.length ? `?${q.join("&")}` : "";
    navigate(`/sessoes/${sessionId}/telemetria${qs}`);
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflow: "auto",
      }}
    >
      <PageHeader
        crumbs={[
          { label: "SESSÕES", onClick: () => navigate("/sessoes") },
          { label: session.track.name },
        ]}
        actions={
          <div style={{ display: "flex", gap: 6 }}>
            {hasTelemetry && (
              <button
                type="button"
                className="btn solid"
                onClick={goTelemetry}
              >
                VER GRÁFICOS →
              </button>
            )}
          </div>
        }
      />

      {/* Header card: info + 4 stats */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.4fr 1fr",
          gap: "var(--gap)",
          padding: "var(--pad)",
        }}
      >
        <div
          style={{
            background: "var(--bg-1)",
            border: "1px solid var(--bd-0)",
            padding: "var(--pad)",
            display: "flex",
            flexDirection: "column",
            gap: 14,
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <TypeBadge type={session.type} />
              <span
                className="mono"
                style={{
                  fontSize: 10,
                  color: "var(--tx-3)",
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                }}
              >
                {formatDateTime(session.startedAt)}
              </span>
            </div>
            <div
              style={{
                fontSize: 32,
                fontWeight: 600,
                letterSpacing: "-0.02em",
                lineHeight: 1.05,
              }}
            >
              {session.track.name}
            </div>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            {car?.imageUrl && (
              <img
                src={car.imageUrl}
                alt=""
                style={{
                  width: 44,
                  height: 44,
                  objectFit: "cover",
                  border: "1px solid var(--bd-1)",
                  flexShrink: 0,
                }}
              />
            )}
            <span
              className="mono"
              style={{
                fontSize: 11,
                color: "var(--tx-1)",
                padding: "5px 9px",
                border: "1px solid var(--bd-1)",
                letterSpacing: "0.06em",
              }}
            >
              {session.car}
            </span>
            <ClassPill cls={session.carClass} />
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            border: "1px solid var(--bd-0)",
            background: "var(--bg-1)",
          }}
        >
          <StatCell
            label="Melhor Volta"
            value={s ? formatLapTime(s.min) : "—"}
            color="var(--speed)"
            hint={
              s && bestLapId
                ? `VOLTA ${
                    laps.find((l) => l.id === bestLapId)?.lapNumber ?? ""
                  }`
                : ""
            }
          />
          <StatCell
            label="Média"
            value={s ? formatLapTime(s.median) : "—"}
            hint={
              s ? `Δ +${(s.median - s.min).toFixed(2)}s` : ""
            }
          />
          <StatCell
            label="Válidas"
            value={String(validTimes.length).padStart(2, "0")}
            hint={`${laps.length} VOLTAS`}
          />
          <StatCell
            label="Inválidas"
            value={String(totalInvalids).padStart(2, "0")}
            color={
              totalInvalids > laps.length * 0.15 ? "var(--crit)" : undefined
            }
            hint={`${laps.filter((l) => l.hasTouch).length} TOQUES`}
          />
        </div>
      </div>

      {/* Volta ideal — melhores setores na pista + classe (todas sessoes) */}
      <IdealLapCard
        bestSectors={bestSectors}
        sessionBestS1={bestS1}
        sessionBestS2={bestS2}
        sessionBestS3={bestS3}
        sessionBestLap={s?.min ?? null}
        sessionId={session.id}
      />

      {/* Secondary stats row */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: "var(--gap)",
          padding: "0 var(--pad) var(--pad)",
        }}
      >
        <StatCard
          label="σ Consistência"
          value={s ? `${s.stdDev.toFixed(2)}s` : "—"}
          color={
            s == null
              ? "var(--tx-3)"
              : s.stdDev < 1
              ? "var(--ok)"
              : s.stdDev < 2
              ? "var(--tx-0)"
              : "var(--crit)"
          }
          hint={
            s == null
              ? ""
              : s.stdDev < 1
              ? "Excelente"
              : s.stdDev < 2
              ? "Boa"
              : "Instável"
          }
        />
        <StatCard
          label="Combustível Usado"
          value={totalFuelUsed > 0 ? `${totalFuelUsed.toFixed(1)}L` : "—"}
          hint={
            totalFuelUsed > 0 && laps.length > 0
              ? `MÉDIA ${(totalFuelUsed / laps.length).toFixed(2)}L/VOLTA`
              : ""
          }
        />
        <StatCard
          label="Pneu Final"
          value={
            finalTyre != null ? `${(finalTyre * 100).toFixed(1)}%` : "—"
          }
          color={
            finalTyre == null
              ? undefined
              : finalTyre > 0.9
              ? "var(--ok)"
              : finalTyre > 0.8
              ? "var(--warn)"
              : "var(--crit)"
          }
          hint={
            finalTyre == null
              ? ""
              : finalTyre > 0.9
              ? "OK"
              : finalTyre > 0.8
              ? "Desgaste normal"
              : "Alto desgaste"
          }
        />
        <StatCard
          label={hasPosition ? "Posição Inicial → Final" : "Voltas"}
          value={
            hasPosition && firstPosition != null && lastPosition != null
              ? `P${firstPosition} → P${lastPosition}`
              : String(laps.length).padStart(2, "0")
          }
          color={
            hasPosition &&
            firstPosition != null &&
            lastPosition != null &&
            lastPosition < firstPosition
              ? "var(--ok)"
              : hasPosition &&
                firstPosition != null &&
                lastPosition != null &&
                lastPosition > firstPosition
              ? "var(--crit)"
              : undefined
          }
          hint={hasPosition ? "Lap-by-lap" : "Total"}
        />
      </div>

      {/* Charts */}
      {laps.length > 0 && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "var(--gap)",
            padding: "0 var(--pad) var(--pad)",
          }}
        >
          <LapTimeChart
            data={laps.map((l) => ({
              lap: l.lapNumber,
              valid: l.isValid ? l.lapTime : null,
              invalid: l.isValid ? null : l.lapTime,
              touch: l.hasTouch && l.isValid ? l.lapTime : null,
            }))}
            avg={s?.mean ?? null}
            best={s?.min ?? null}
          />
          {hasPosition ? (
            <PositionChart
              data={laps.map((l) => ({
                lap: l.lapNumber,
                position: l.position,
              }))}
            />
          ) : (
            <TyreWearChart
              data={laps.map((l) => ({
                lap: l.lapNumber,
                tyre: l.tyreWearAvg,
              }))}
            />
          )}
          {hasPosition && (
            <TyreWearChart
              data={laps.map((l) => ({
                lap: l.lapNumber,
                tyre: l.tyreWearAvg,
              }))}
            />
          )}
          <FuelChart
            data={laps.map((l) => ({
              lap: l.lapNumber,
              fuelRemaining: l.fuelRemaining,
              fuelUsed: l.fuelUsed,
            }))}
            capacity={laps[0]?.fuelCapacity ?? 0}
          />
        </div>
      )}

      {/* Lap-by-lap full table */}
      <div style={{ padding: "0 var(--pad) var(--pad)" }}>
        <div
          style={{
            background: "var(--bg-1)",
            border: "1px solid var(--bd-0)",
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
              Voltas · Lap-by-lap
              {outlierSet.size > 0
                ? ` · ${outlierSet.size} OUTLIER${
                    outlierSet.size > 1 ? "S" : ""
                  } DESCONSIDERADA${outlierSet.size > 1 ? "S" : ""}`
                : ""}
            </span>
            <span
              className="mono"
              style={{
                fontSize: 10,
                letterSpacing: "0.14em",
                color: "var(--tx-3)",
              }}
            >
              {laps.length} {laps.length === 1 ? "VOLTA" : "VOLTAS"}
            </span>
          </div>
          <div style={{ overflowX: "auto" }}>
            <SessionLapsTable
              laps={laps}
              bestLapId={bestLapId}
              worstLapId={worstLapId}
              bestS1={bestS1}
              bestS2={bestS2}
              bestS3={bestS3}
              hasPosition={hasPosition}
              outlierSet={outlierSet}
              onDeleteLap={handleDeleteLap}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
