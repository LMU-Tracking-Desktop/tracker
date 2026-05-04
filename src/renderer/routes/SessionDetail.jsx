import { useEffect, useState } from "react";
import { useParams, Link, useNavigate, useSearchParams } from "react-router-dom";
import TypeBadge from "../components/TypeBadge.jsx";
import SessionLapsTable from "../components/SessionLapsTable.jsx";
import {
  LapTimeChart,
  PositionChart,
  TyreWearChart,
  FuelChart,
} from "../components/SessionCharts.jsx";
import { formatLapTime, formatDateTime } from "../lib/format.js";
import { stats } from "../lib/stats.js";
import { computeOutlierSet } from "../lib/outlier.js";

function MetricCell({ label, value, accent }) {
  return (
    <div
      className="p-5 border-r border-b hairline last:border-r-0 flex flex-col gap-2"
      style={{ background: "var(--surface)" }}
    >
      <span className="mono text-[10px] tracking-[0.18em] text-muted">
        {label}
      </span>
      <span
        className="mono text-xl md:text-2xl font-semibold tabular-nums"
        style={{ color: accent ? "var(--accent)" : "var(--foreground)" }}
      >
        {value}
      </span>
    </div>
  );
}

function Thumb({ imageUrl, alt, fallback }) {
  return (
    <div
      className="w-12 h-12 border hairline overflow-hidden shrink-0 flex items-center justify-center"
      style={{ background: "var(--surface-2)" }}
      title={fallback}
    >
      {imageUrl ? (
        <img src={imageUrl} alt={alt} className="w-full h-full object-cover" />
      ) : (
        <span className="mono text-[10px] text-muted">
          {fallback.slice(0, 2).toUpperCase()}
        </span>
      )}
    </div>
  );
}

export default function SessionDetail() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  // selectedLapId e referenceLapId persistidos na URL — propagam pra Telemetria/Replay
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

  useEffect(() => {
    window.api?.getConfig?.().then((c) => {
      if (c) setOutlierPct(c.outlier_threshold_pct ?? 7);
    });
  }, []);

  // Auto-seleciona a melhor volta com telemetria (pra URL do botao VER GRAFICOS)
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

  if (loading) {
    return (
      <div className="p-8">
        <div className="border hairline p-12 text-center text-muted mono text-xs tracking-widest">
          CARREGANDO...
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-8">
        <div className="border hairline p-12 text-center text-muted mono text-xs tracking-widest">
          SESSAO NAO ENCONTRADA
        </div>
      </div>
    );
  }

  const { session, laps, car } = data;

  // Outliers: laps muito mais lentas que a mediana (so em nao-corrida)
  const outlierSet = computeOutlierSet(
    laps.map((l) => ({ ...l, session: { type: session.type }, sessionId: session.id })),
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
      ? (nonOutlierValid.find((l) => l.lapTime === s.max)?.id ?? null)
      : null;

  const bestSectorOf = (key) => {
    const vals = nonOutlierValid
      .map((l) => l[key])
      .filter((v) => v != null);
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

  return (
    <div className="p-8">
      <div className="max-w-[1400px] mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <Link
            to="/sessoes"
            className="mono text-[10px] tracking-[0.2em] text-muted hover:text-accent"
          >
            ← TODAS AS SESSOES
          </Link>
          {data.laps.some((l) => l.hasTelemetry) && (
            <button
              type="button"
              className="btn"
              onClick={() => {
                const q = [];
                if (selectedLapId)
                  q.push(`lap=${encodeURIComponent(selectedLapId)}`);
                if (referenceLapId)
                  q.push(`ref=${encodeURIComponent(referenceLapId)}`);
                const qs = q.length ? `?${q.join("&")}` : "";
                navigate(`/sessoes/${sessionId}/telemetria${qs}`);
              }}
              style={{
                color: "var(--accent)",
                borderColor: "var(--accent)",
              }}
            >
              📊 VER GRÁFICOS →
            </button>
          )}
        </div>

        <section className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-0 border hairline">
          <div
            className="p-5 border-r hairline flex flex-col gap-4 justify-between"
            style={{ background: "var(--surface)" }}
          >
            <div className="space-y-2">
              <TypeBadge type={session.type} />
              <h1 className="text-3xl font-bold leading-tight">
                {session.track.name}
              </h1>
              <div className="mono text-[11px] tracking-widest text-muted">
                {formatDateTime(session.startedAt)}
              </div>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <Thumb
                imageUrl={session.track.imageUrl}
                alt="pista"
                fallback={session.track.name}
              />
              <Thumb
                imageUrl={car?.imageUrl}
                alt="carro"
                fallback={session.car}
              />
              <div className="space-y-0.5">
                <div className="mono text-[10px] tracking-widest text-muted">
                  {session.car}
                </div>
                <div className="mono text-[10px] tracking-widest text-muted">
                  {session.carClass}
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2">
            <MetricCell
              label="MELHOR VOLTA"
              value={s ? formatLapTime(s.min) : "--"}
              accent
            />
            <MetricCell
              label="MEDIA"
              value={s ? formatLapTime(s.median) : "--"}
            />
            <MetricCell
              label="VALIDAS"
              value={String(validTimes.length).padStart(2, "0")}
            />
            <MetricCell
              label="INVALIDAS"
              value={String(totalInvalids).padStart(2, "0")}
              accent={totalInvalids > laps.length * 0.15}
            />
          </div>
        </section>

        <section className="grid grid-cols-2 md:grid-cols-4 gap-0 border hairline">
          <MetricCell
            label="σ CONSISTENCIA"
            value={s ? `${s.stdDev.toFixed(2)}s` : "--"}
          />
          <MetricCell
            label="COMBUSTIVEL USADO"
            value={totalFuelUsed > 0 ? `${totalFuelUsed.toFixed(1)}L` : "--"}
          />
          <MetricCell
            label="PNEU FINAL"
            value={
              finalTyre != null ? `${(finalTyre * 100).toFixed(1)}%` : "--"
            }
          />
          <MetricCell
            label={hasPosition ? "POSICAO INICIAL → FINAL" : "VOLTAS"}
            value={
              hasPosition && firstPosition != null && lastPosition != null
                ? `P${firstPosition} → P${lastPosition}`
                : String(laps.length).padStart(2, "0")
            }
            accent={
              hasPosition &&
              firstPosition != null &&
              lastPosition != null &&
              lastPosition < firstPosition
            }
          />
        </section>

        {laps.length > 0 && (
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <LapTimeChart
              data={laps.map((l) => ({
                lap: l.lapNumber,
                valid: l.isValid ? l.lapTime : null,
                invalid: l.isValid ? null : l.lapTime,
                touch: l.hasTouch && l.isValid ? l.lapTime : null,
              }))}
              avg={s?.mean ?? null}
            />
            {hasPosition && (
              <PositionChart
                data={laps.map((l) => ({
                  lap: l.lapNumber,
                  position: l.position,
                }))}
              />
            )}
            <TyreWearChart
              data={laps.map((l) => ({
                lap: l.lapNumber,
                tyre: l.tyreWearAvg,
              }))}
            />
            <FuelChart
              data={laps.map((l) => ({
                lap: l.lapNumber,
                fuelRemaining: l.fuelRemaining,
                fuelUsed: l.fuelUsed,
              }))}
              capacity={laps[0]?.fuelCapacity ?? 0}
            />
          </section>
        )}


        <section className="border hairline">
          <div className="px-4 py-3 border-b hairline flex items-center justify-between">
            <span className="mono text-[10px] tracking-[0.2em] text-muted">
              TODAS AS VOLTAS · POR ORDEM
              {outlierSet.size > 0
                ? ` · ${outlierSet.size} OUTLIER(S) DESCONSIDERADA(S)`
                : ""}
            </span>
            <span className="mono text-[10px] tracking-[0.2em] text-muted">
              {laps.length} {laps.length === 1 ? "VOLTA" : "VOLTAS"}
            </span>
          </div>
          <div className="overflow-x-auto">
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
        </section>
      </div>
    </div>
  );
}
