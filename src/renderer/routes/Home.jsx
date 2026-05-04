import { useEffect, useMemo, useState } from "react";
import TrackSelect from "../components/TrackSelect.jsx";
import LapsTable from "../components/LapsTable.jsx";
import { formatLapTime } from "../lib/format.js";

function StatCard({ label, value, sub }) {
  return (
    <div className="border hairline bg-surface p-5">
      <div className="mono text-[10px] tracking-[0.14em] uppercase text-muted mb-3">
        {label}
      </div>
      <div className="text-4xl font-semibold tabular-nums">{value}</div>
      {sub && (
        <div className="mono text-[10px] tracking-[0.14em] uppercase text-muted mt-2">
          {sub}
        </div>
      )}
    </div>
  );
}

function StatCell({ label, value, accent }) {
  return (
    <div
      className="p-5 border-b border-r hairline last:border-b-0 flex flex-col gap-2"
      style={{ background: "var(--surface)" }}
    >
      <span className="mono text-[10px] tracking-[0.18em] text-muted">
        {label}
      </span>
      <span
        className="mono text-2xl md:text-3xl font-semibold tabular-nums"
        style={{ color: accent ? "var(--accent)" : "var(--foreground)" }}
      >
        {value}
      </span>
    </div>
  );
}

export default function Home() {
  const [stats7d, setStats7d] = useState(null);
  const [tracks, setTracks] = useState([]);
  const [cars, setCars] = useState([]);
  const [trackId, setTrackId] = useState(null);
  const [data, setData] = useState(null);
  const [loadingData, setLoadingData] = useState(false);

  // Carga inicial: tracks, cars, stats7d, ultima pista
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [t, c, s7, lastTrack] = await Promise.all([
        window.api?.listTracks?.() ?? [],
        window.api?.listCars?.() ?? [],
        window.api?.getStats7d?.() ?? null,
        window.api?.getLastTrack?.() ?? null,
      ]);
      if (cancelled) return;
      setTracks(t || []);
      setCars(c || []);
      setStats7d(s7);
      if (lastTrack) setTrackId(lastTrack);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Refresh dos dados quando troca de pista ou com polling
  useEffect(() => {
    if (!trackId) {
      setData(null);
      return;
    }
    let cancelled = false;
    const load = async () => {
      setLoadingData(true);
      try {
        const d = await window.api?.getHomeData?.(trackId);
        if (!cancelled) setData(d);
      } finally {
        if (!cancelled) setLoadingData(false);
      }
    };
    load();
    const id = setInterval(load, 10000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [trackId]);

  // Refresh dos stats de 7 dias a cada 30s
  useEffect(() => {
    const id = setInterval(async () => {
      const s = await window.api?.getStats7d?.();
      setStats7d(s);
    }, 30000);
    return () => clearInterval(id);
  }, []);

  const carImages = useMemo(
    () => new Map(cars.map((c) => [c.name, c.imageUrl])),
    [cars]
  );

  const fmt = (v) => (v == null ? "—" : v);
  const fmtPos = (v) => (v == null ? "—" : `P${String(v).padStart(2, "0")}`);

  return (
    <div className="p-8">
      <div className="max-w-[1400px] mx-auto space-y-8">
        {/* Header */}
        <div>
          <div className="mb-6 flex items-center gap-3">
            <span className="chip">HOME</span>
            <span className="mono text-[10px] tracking-[0.14em] uppercase text-muted">
              ultimos 7 dias
            </span>
          </div>
          <h1 className="text-3xl font-semibold mb-1">Le Mans Ultimate</h1>
          <p className="mono text-[12px] text-muted tracking-wider">
            Lap telemetry // desktop edition
          </p>
        </div>

        {/* 7-day cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="sessoes" value={fmt(stats7d?.sessions)} sub="total" />
          <StatCard label="voltas" value={fmt(stats7d?.laps)} sub="registradas" />
          <StatCard
            label="corridas"
            value={fmt(stats7d?.races)}
            sub="participacoes"
          />
          <StatCard
            label="melhor posicao"
            value={fmtPos(stats7d?.bestPosition)}
            sub="em corrida"
          />
        </div>

        {/* Filtro */}
        <section className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-4 md:items-end">
          <TrackSelect
            tracks={tracks}
            value={trackId}
            onChange={setTrackId}
          />
          <div className="md:pb-[10px]">
            <span className="chip">
              <span className="live-dot" /> ao vivo
            </span>
          </div>
        </section>

        {/* Hero + tabelas */}
        {!trackId ? (
          <section className="border hairline stripe-bg p-12 text-center space-y-3">
            <div className="mono text-xs tracking-[0.2em] text-muted">
              SELECIONE UMA PISTA
            </div>
            <h2 className="text-2xl font-semibold">Pronto para rodar</h2>
            <p className="text-sm text-muted max-w-md mx-auto">
              {tracks.length > 0
                ? "Escolhe uma pista acima para ver as voltas."
                : "Ainda nao ha pistas. Elas sao criadas automaticamente quando o tracker registra uma sessao."}
            </p>
          </section>
        ) : !data ? (
          <section className="border hairline p-12 text-center">
            <div className="mono text-xs tracking-[0.2em] text-muted">
              {loadingData ? "CARREGANDO..." : "SEM DADOS"}
            </div>
          </section>
        ) : (
          <>
            <section className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-0 border hairline">
              <div
                className="relative h-[320px] overflow-hidden hero-mask"
                style={{
                  background: data.track.imageUrl
                    ? `url(${data.track.imageUrl}) center/cover`
                    : "var(--surface)",
                }}
              >
                {!data.track.imageUrl && (
                  <div className="absolute inset-0 grid-bg opacity-60" />
                )}
                <div className="relative z-10 h-full flex flex-col justify-between p-6">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <div className="chip accent">PISTA</div>
                      <h2 className="text-3xl md:text-4xl font-bold leading-tight">
                        {data.track.name}
                      </h2>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 border-l hairline">
                <StatCell
                  label="MELHOR VOLTA"
                  value={
                    data.stats.bestLap != null
                      ? formatLapTime(data.stats.bestLap)
                      : "--:--.---"
                  }
                  accent
                />
                <StatCell
                  label="VOLTAS TOTAIS"
                  value={String(data.stats.totalLaps).padStart(3, "0")}
                />
                <StatCell
                  label="SESSOES"
                  value={String(data.stats.sessions).padStart(2, "0")}
                />
              </div>
            </section>

            {data.topByClass.length === 0 ? (
              <section className="border hairline p-8 text-center text-muted mono text-xs tracking-widest">
                NENHUMA VOLTA VALIDA AINDA NESTA PISTA
              </section>
            ) : (
              data.topByClass.map(({ carClass, laps }) => (
                <LapsTable
                  key={carClass}
                  laps={laps}
                  bestLapId={data.stats.bestLapId}
                  carClass={carClass}
                  carImages={carImages}
                />
              ))
            )}
          </>
        )}
      </div>
    </div>
  );
}
