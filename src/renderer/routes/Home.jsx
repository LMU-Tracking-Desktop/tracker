import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import LapsTable from "../components/LapsTable.jsx";
import PageHeader from "../components/PageHeader.jsx";
import TrackSelect from "../components/TrackSelect.jsx";
import { formatLapTime } from "../lib/format.js";
import { useLmuStatus } from "../lib/useLmuStatus.js";

function LiveStatus() {
  const connected = useLmuStatus();
  if (connected) {
    return (
      <span
        className="chip"
        style={{
          color: "var(--ok)",
          borderColor: "rgba(74, 222, 128, 0.4)",
        }}
      >
        <span className="live-dot" /> AO VIVO
      </span>
    );
  }
  return (
    <span
      className="chip"
      style={{
        color: "var(--tx-3)",
        borderColor: "var(--bd-1)",
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: "var(--tx-3)",
          display: "inline-block",
        }}
      />{" "}
      OFFLINE
    </span>
  );
}

function StatCard({ label, value, hint, accent, crit }) {
  const valueColor = accent
    ? "var(--accent)"
    : crit
    ? "var(--crit)"
    : "var(--tx-0)";
  return (
    <div
      style={{
        background: "var(--bg-1)",
        border: "1px solid var(--bd-0)",
        padding: "var(--pad)",
        display: "flex",
        flexDirection: "column",
        gap: 8,
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
          fontSize: 26,
          fontWeight: 600,
          color: valueColor,
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

function MiniStat({ label, value, hint, color, borderRight, borderBottom }) {
  return (
    <div
      style={{
        padding: "var(--pad)",
        borderRight: borderRight ? "1px solid var(--bd-0)" : undefined,
        borderBottom: borderBottom ? "1px solid var(--bd-0)" : undefined,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        gap: 4,
        background: "var(--bg-1)",
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
        {label}
      </span>
      <span
        className="mono"
        style={{
          fontSize: 18,
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
            fontSize: 8,
            letterSpacing: "0.14em",
            color: "var(--tx-3)",
          }}
        >
          {hint}
        </span>
      )}
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

export default function Home() {
  const location = useLocation();
  const navTrackId = location.state?.trackId ?? null;
  const [stats7d, setStats7d] = useState(null);
  const [tracks, setTracks] = useState([]);
  const [cars, setCars] = useState([]);
  const [trackId, setTrackId] = useState(navTrackId);
  const [data, setData] = useState(null);
  const [loadingData, setLoadingData] = useState(false);

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
      // Se navegou de /pistas com state.trackId, respeita; senao usa o
      // ultimo dirigido.
      if (!navTrackId && lastTrack) setTrackId(lastTrack);
    })();
    return () => {
      cancelled = true;
    };
  }, [navTrackId]);

  // Quando muda navTrackId (ex: voltou de /pistas com outra pista), atualiza
  useEffect(() => {
    if (navTrackId) setTrackId(navTrackId);
  }, [navTrackId]);

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
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflow: "auto",
      }}
    >
      <PageHeader
        crumbs={[{ label: "HOME" }, { label: "LE MANS ULTIMATE" }]}
        actions={<LiveStatus />}
      />

      {/* 7-day stats */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: "var(--gap)",
          padding: "var(--pad)",
        }}
      >
        <StatCard
          label="Sessões"
          value={fmt(stats7d?.sessions)}
          hint="Total · 7 dias"
        />
        <StatCard
          label="Voltas"
          value={fmt(stats7d?.laps)}
          hint="Registradas · 7 dias"
        />
        <StatCard
          label="Corridas"
          value={fmt(stats7d?.races)}
          hint="Participações · 7 dias"
        />
        <StatCard
          label="Melhor Posição"
          value={fmtPos(stats7d?.bestPosition)}
          hint="Em corrida · 7 dias"
          accent={stats7d?.bestPosition != null && stats7d.bestPosition <= 3}
        />
      </div>

      {/* Filter */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 360px) 1fr",
          gap: "var(--gap)",
          padding: "0 var(--pad) var(--pad)",
          alignItems: "end",
        }}
      >
        <TrackSelect tracks={tracks} value={trackId} onChange={setTrackId} />
      </div>

      {/* Hero + stats / empty / loading */}
      {!trackId ? (
        <div
          className="stripe-bg"
          style={{
            margin: "0 var(--pad) var(--pad)",
            border: "1px solid var(--bd-0)",
            background: "var(--bg-1)",
            padding: "48px var(--pad)",
            textAlign: "center",
            display: "flex",
            flexDirection: "column",
            gap: 8,
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
            SELECIONE UMA PISTA
          </span>
          <h2
            style={{
              fontSize: 24,
              fontWeight: 600,
              letterSpacing: "-0.02em",
              margin: 0,
            }}
          >
            Pronto para rodar
          </h2>
          <p
            style={{
              color: "var(--tx-2)",
              fontSize: 13,
              maxWidth: 420,
              margin: "0 auto",
              lineHeight: 1.5,
            }}
          >
            {tracks.length > 0
              ? "Escolhe uma pista acima para ver as voltas."
              : "Ainda não há pistas. Elas são criadas automaticamente quando o tracker registra uma sessão."}
          </p>
        </div>
      ) : !data ? (
        <div
          style={{
            margin: "0 var(--pad) var(--pad)",
            border: "1px solid var(--bd-0)",
            background: "var(--bg-1)",
            padding: "48px var(--pad)",
            textAlign: "center",
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
            {loadingData ? "CARREGANDO..." : "SEM DADOS"}
          </span>
        </div>
      ) : (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1.6fr 1fr",
              gap: 0,
              padding: "0 var(--pad) var(--pad)",
            }}
          >
            {/* Hero */}
            <div
              className="hero-mask"
              style={{
                position: "relative",
                height: 280,
                overflow: "hidden",
                border: "1px solid var(--bd-0)",
                borderRight: "none",
                background: data.track.imageUrl
                  ? `url(${data.track.imageUrl}) center/cover`
                  : "var(--bg-1)",
              }}
            >
              {!data.track.imageUrl && (
                <div
                  className="grid-bg"
                  style={{
                    position: "absolute",
                    inset: 0,
                    opacity: 0.6,
                  }}
                />
              )}
              <div
                style={{
                  position: "relative",
                  zIndex: 10,
                  height: "100%",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  padding: "var(--pad)",
                }}
              >
                <div className="flex items-center gap-2">
                  <span className="chip accent">PISTA</span>
                  <span
                    className="mono"
                    style={{
                      fontSize: 10,
                      letterSpacing: "0.14em",
                      color: "var(--tx-3)",
                    }}
                  >
                    {data.stats.sessions}{" "}
                    {data.stats.sessions === 1 ? "SESSÃO" : "SESSÕES"} ·{" "}
                    {data.stats.totalLaps} VOLTAS
                  </span>
                </div>
                <div>
                  <h2
                    style={{
                      fontSize: 36,
                      fontWeight: 600,
                      letterSpacing: "-0.02em",
                      margin: 0,
                      lineHeight: 1.05,
                    }}
                  >
                    {data.track.name}
                  </h2>
                </div>
              </div>
            </div>

            {/* Stats grid: MELHOR VOLTA no topo (full width), 2x2 abaixo */}
            <div
              style={{
                display: "grid",
                gridTemplateRows: "auto 1fr 1fr",
                gridTemplateColumns: "1fr 1fr",
                border: "1px solid var(--bd-0)",
              }}
            >
              <div
                style={{
                  gridColumn: "1 / -1",
                  padding: "var(--pad)",
                  borderBottom: "1px solid var(--bd-0)",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "center",
                  gap: 6,
                  background: "var(--bg-1)",
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
                  MELHOR VOLTA
                </span>
                <span
                  className="mono"
                  style={{
                    fontSize: 28,
                    fontWeight: 600,
                    color: "var(--speed)",
                    letterSpacing: "-0.01em",
                    lineHeight: 1,
                  }}
                >
                  {data.stats.bestLap != null
                    ? formatLapTime(data.stats.bestLap)
                    : "—:—.—"}
                </span>
              </div>
              <MiniStat
                label="VOLTAS"
                value={String(data.stats.totalLaps).padStart(3, "0")}
                borderRight
                borderBottom
              />
              <MiniStat
                label="SESSÕES"
                value={String(data.stats.sessions).padStart(2, "0")}
                borderBottom
              />
              <MiniStat
                label="MELHOR POSIÇÃO"
                value={fmtPos(data.stats.bestPosition)}
                color={
                  data.stats.bestPosition != null && data.stats.bestPosition <= 3
                    ? "var(--accent)"
                    : undefined
                }
                hint={
                  data.stats.racesCount > 0
                    ? `${data.stats.racesCount} ${data.stats.racesCount === 1 ? "CORRIDA" : "CORRIDAS"}`
                    : "NA CLASSE"
                }
                borderRight
              />
              <MiniStat
                label="POSIÇÃO MÉDIA"
                value={
                  data.stats.avgPosition != null
                    ? `P${data.stats.avgPosition.toFixed(1)}`
                    : "—"
                }
                hint="FINAL · CORRIDAS"
              />
            </div>
          </div>

          {/* Top by class */}
          {data.topByClass.length === 0 ? (
            <div
              style={{
                margin: "0 var(--pad) var(--pad)",
                border: "1px solid var(--bd-0)",
                background: "var(--bg-1)",
                padding: "32px var(--pad)",
                textAlign: "center",
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
                NENHUMA VOLTA VÁLIDA AINDA NESTA PISTA
              </span>
            </div>
          ) : (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "var(--gap)",
                padding: "0 var(--pad) var(--pad)",
              }}
            >
              {data.topByClass.map(({ carClass, laps }) => (
                <LapsTable
                  key={carClass}
                  laps={laps}
                  bestLapId={data.stats.bestLapId}
                  carClass={carClass}
                  carImages={carImages}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
