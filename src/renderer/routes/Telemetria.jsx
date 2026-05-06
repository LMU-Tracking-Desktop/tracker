import { useEffect, useMemo, useState } from "react";
import {
  useParams,
  Link,
  useNavigate,
  useSearchParams,
} from "react-router-dom";
import DeltaChart from "../components/DeltaChart.jsx";
import SpeedDeltaChart from "../components/SpeedDeltaChart.jsx";
import TrackMap from "../components/TrackMap.jsx";
import ChannelChart from "../components/ChannelChart.jsx";
import ImportLapModal from "../components/ImportLapModal.jsx";
import CopyLapButton from "../components/CopyLapButton.jsx";
import BestInRangePanel from "../components/BestInRangePanel.jsx";
import LapPickerModal from "../components/LapPickerModal.jsx";
import { downsample, distanceAtTime } from "../lib/telemetry.js";

function fmtLapTime(t) {
  if (t == null || t <= 0) return "sem tempo";
  const m = Math.floor(t / 60);
  const s = (t % 60).toFixed(3).padStart(6, "0");
  return `${m}:${s}`;
}

function describeLap({ lapId, sessionLaps, otherLaps, importedLaps }) {
  if (!lapId) return "— escolher —";
  if (typeof lapId === "string" && lapId.startsWith("imp:")) {
    const id = lapId.slice(4);
    const l = importedLaps?.find((x) => x.id === id);
    if (!l) return "importada";
    return `${l.ownerName} · ${fmtLapTime(l.lapTime)}`;
  }
  const sess = sessionLaps?.find((x) => x.id === lapId);
  if (sess) return `Volta ${sess.lapNumber} · ${fmtLapTime(sess.lapTime)}`;
  const other = otherLaps?.find((x) => x.id === lapId);
  if (other) {
    const car = (other.session?.car || "").split(" ")[0];
    return `${fmtLapTime(other.lapTime)} · ${car}`;
  }
  return "—";
}

function LapPickerButton({ label, text, onClick }) {
  return (
    <label className="flex items-center gap-2">
      <span className="mono text-[10px] tracking-[0.2em] text-muted">
        {label}
      </span>
      <button
        type="button"
        className="btn"
        onClick={onClick}
        style={{ minWidth: 220, justifyContent: "flex-start", textAlign: "left" }}
      >
        {text}
        <span className="ml-2 text-muted">▾</span>
      </button>
    </label>
  );
}

export default function Telemetria() {
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
  const setReferenceLapId = (id) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (id) next.set("ref", id);
        else next.delete("ref");
        return next;
      },
      { replace: true }
    );
  };

  const [telemetry, setTelemetry] = useState(null);
  const [referenceTelemetry, setReferenceTelemetry] = useState(null);
  const [loadingTelem, setLoadingTelem] = useState(false);
  const [loadingRef, setLoadingRef] = useState(false);
  const [hoverDistance, setHoverDistance] = useState(null);
  const [zoomRange, setZoomRange] = useState(null);
  const [otherLaps, setOtherLaps] = useState([]);
  const [importedLaps, setImportedLaps] = useState([]);
  const [showImport, setShowImport] = useState(false);
  const [showBestInRange, setShowBestInRange] = useState(false);
  const [pickerMode, setPickerMode] = useState(null); // null | "primary" | "reference"

  // Load session data (uma vez — nao precisa polling aqui)
  useEffect(() => {
    let cancelled = false;
    window.api?.getSessionDetail?.(sessionId).then((d) => {
      if (!cancelled) {
        setData(d);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  // Top laps de outras sessoes (mesma pista/classe)
  useEffect(() => {
    if (!data?.session) return;
    window.api
      ?.getTopLapsByTrack?.({
        trackId: data.session.trackId,
        excludeSessionId: data.session.id,
        carClass: data.session.carClass,
        limit: 5,
      })
      .then((r) => setOtherLaps(r || []));
  }, [data?.session?.id, data?.session?.trackId]);

  // Voltas importadas
  const loadImported = () => {
    if (!data?.session?.track?.name) return;
    window.api
      ?.listImportsForTrack?.({
        trackName: data.session.track.name,
        carClass: data.session.carClass,
      })
      .then((r) => setImportedLaps(r || []));
  };
  useEffect(() => {
    loadImported();
  }, [data?.session?.id]);

  const telemetryDs = useMemo(
    () => (telemetry ? downsample(telemetry, 700) : null),
    [telemetry]
  );
  const referenceDs = useMemo(
    () => (referenceTelemetry ? downsample(referenceTelemetry, 700) : null),
    [referenceTelemetry]
  );

  const sectorMarkers = useMemo(() => {
    if (!telemetry || !selectedLapId) return null;
    const lap = data?.laps?.find((l) => l.id === selectedLapId);
    if (!lap) return null;
    const s1 =
      lap.sector1 && lap.sector1 > 0
        ? distanceAtTime(telemetry, lap.sector1)
        : null;
    const s2 =
      lap.sector2 && lap.sector2 > 0
        ? distanceAtTime(telemetry, lap.sector2)
        : null;
    if (s1 == null && s2 == null) return null;
    return { s1, s2 };
  }, [telemetry, data?.laps, selectedLapId]);

  // Auto-seleciona melhor volta quando dados carregam
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

  useEffect(() => {
    setZoomRange(null);
  }, [selectedLapId, referenceLapId]);

  useEffect(() => {
    if (!selectedLapId) {
      setTelemetry(null);
      return;
    }
    let cancelled = false;
    setLoadingTelem(true);
    window.api
      ?.getLapTelemetry?.(selectedLapId)
      .then((t) => {
        if (!cancelled) setTelemetry(t);
      })
      .finally(() => {
        if (!cancelled) setLoadingTelem(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedLapId]);

  useEffect(() => {
    if (!referenceLapId) {
      setReferenceTelemetry(null);
      return;
    }
    if (referenceLapId === selectedLapId) {
      setReferenceTelemetry(telemetry);
      return;
    }
    let cancelled = false;
    setLoadingRef(true);
    const isImport = referenceLapId.startsWith("imp:");
    const fetch = isImport
      ? window.api?.getImportTelemetry?.(referenceLapId.slice(4))
      : window.api?.getLapTelemetry?.(referenceLapId);
    Promise.resolve(fetch)
      .then((t) => {
        if (!cancelled) setReferenceTelemetry(t);
      })
      .finally(() => {
        if (!cancelled) setLoadingRef(false);
      });
    return () => {
      cancelled = true;
    };
  }, [referenceLapId, selectedLapId, telemetry]);

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

  const { session } = data;
  const selectedLap = data.laps.find((l) => l.id === selectedLapId);

  return (
    <div className="p-8">
      <div className="max-w-[1400px] mx-auto space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <Link
            to={`/sessoes/${sessionId}`}
            className="mono text-[10px] tracking-[0.2em] text-muted hover:text-accent"
          >
            ← VOLTAR À SESSÃO
          </Link>
          <div className="flex items-center gap-3">
            <span className="chip accent">TELEMETRIA</span>
            <span className="mono text-[11px] tracking-[0.15em] text-muted">
              {session.track?.name || "—"} · {session.car || "—"}
            </span>
          </div>
        </div>

        {/* Pickers + importar */}
        <div className="flex items-center justify-between gap-3 flex-wrap border hairline p-3">
          <div className="flex items-center gap-3 flex-wrap">
            <LapPickerButton
              label="VOLTA"
              onClick={() => setPickerMode("primary")}
              text={describeLap({
                lapId: selectedLapId,
                sessionLaps: data.laps,
                otherLaps,
                importedLaps,
              })}
            />
            <LapPickerButton
              label="COMPARAR COM"
              onClick={() => setPickerMode("reference")}
              text={
                referenceLapId
                  ? describeLap({
                      lapId: referenceLapId,
                      sessionLaps: data.laps,
                      otherLaps,
                      importedLaps,
                    })
                  : "— nenhuma —"
              }
            />
            <button
              type="button"
              className="btn"
              onClick={() => setShowImport(true)}
              title="Importar volta de um amigo (JSON)"
            >
              IMPORTAR
            </button>
          </div>
          <div className="flex items-center gap-2">
            {selectedLap && <CopyLapButton lap={selectedLap} session={session} />}
            <button
              type="button"
              className="btn"
              onClick={() => {
                const q = referenceLapId
                  ? `?mode=2d&ref=${encodeURIComponent(referenceLapId)}`
                  : "?mode=2d";
                navigate(`/replay/${selectedLapId}${q}`);
              }}
              disabled={!selectedLapId}
            >
              ▶ 2D
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                const q = referenceLapId
                  ? `?mode=3d&ref=${encodeURIComponent(referenceLapId)}`
                  : "?mode=3d";
                navigate(`/replay/${selectedLapId}${q}`);
              }}
              disabled={!selectedLapId}
            >
              ▶ 3D
            </button>
          </div>
        </div>

        {loadingTelem ? (
          <div className="border hairline p-8 text-center text-muted mono text-xs tracking-widest">
            CARREGANDO TELEMETRIA...
          </div>
        ) : telemetry ? (
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_380px] gap-4">
            <div className="space-y-3 min-w-0">
              {zoomRange && (
                <div className="flex items-center justify-between border hairline px-4 py-2">
                  <span className="mono text-[10px] tracking-[0.2em] text-muted">
                    ZOOM · {Math.round(zoomRange[0])}m →{" "}
                    {Math.round(zoomRange[1])}m
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="btn"
                      onClick={() => setShowBestInRange(true)}
                      title="Voltas mais rapidas neste trecho da pista"
                      style={{ color: "var(--accent)" }}
                    >
                      🔍 MELHORES NESTE TRECHO
                    </button>
                    <button
                      type="button"
                      className="btn"
                      onClick={() => setZoomRange(null)}
                    >
                      RESET ZOOM
                    </button>
                  </div>
                </div>
              )}
              {referenceDs && !loadingRef && (
                <>
                  <DeltaChart
                    current={telemetryDs}
                    reference={referenceDs}
                    onHover={setHoverDistance}
                    onZoomChange={setZoomRange}
                    zoomRange={zoomRange}
                    sectorMarkers={sectorMarkers}
                  />
                  <SpeedDeltaChart
                    current={telemetryDs}
                    reference={referenceDs}
                    onHover={setHoverDistance}
                    onZoomChange={setZoomRange}
                    zoomRange={zoomRange}
                    sectorMarkers={sectorMarkers}
                  />
                </>
              )}
              <ChannelChart
                title="THROTTLE"
                subtitle="%"
                channelKey="th"
                color="#30f58a"
                yDomain={[0, 1]}
                formatter={(v) => `${Math.round(v * 100)}%`}
                current={telemetryDs}
                reference={referenceDs}
                onHover={setHoverDistance}
                onZoomChange={setZoomRange}
                zoomRange={zoomRange}
                sectorMarkers={sectorMarkers}
              />
              <ChannelChart
                title="BRAKE"
                subtitle="%"
                channelKey="br"
                color="#ff2d2d"
                yDomain={[0, 1]}
                formatter={(v) => `${Math.round(v * 100)}%`}
                current={telemetryDs}
                reference={referenceDs}
                onHover={setHoverDistance}
                onZoomChange={setZoomRange}
                zoomRange={zoomRange}
                sectorMarkers={sectorMarkers}
              />
              <ChannelChart
                title="STEERING"
                subtitle="%"
                channelKey="st"
                color="#5ac8ff"
                yDomain={[-1, 1]}
                formatter={(v) => `${Math.round(v * 100)}%`}
                current={telemetryDs}
                reference={referenceDs}
                onHover={setHoverDistance}
                onZoomChange={setZoomRange}
                zoomRange={zoomRange}
                sectorMarkers={sectorMarkers}
              />
              <ChannelChart
                title="VELOCIDADE"
                subtitle="KM/H"
                channelKey="v"
                color="#c77dff"
                yDomain={["auto", "auto"]}
                formatter={(v) => `${Math.round(v)}`}
                current={telemetryDs}
                reference={referenceDs}
                onHover={setHoverDistance}
                onZoomChange={setZoomRange}
                zoomRange={zoomRange}
                sectorMarkers={sectorMarkers}
                height={170}
              />
              <ChannelChart
                title="MARCHA"
                channelKey="g"
                color="#ffd60a"
                yDomain={[-1, 8]}
                formatter={(v) =>
                  v == null
                    ? "—"
                    : v <= -1
                      ? "R"
                      : v === 0
                        ? "N"
                        : String(Math.round(v))
                }
                current={telemetryDs}
                reference={referenceDs}
                onHover={setHoverDistance}
                onZoomChange={setZoomRange}
                zoomRange={zoomRange}
                sectorMarkers={sectorMarkers}
                stepped
              />
            </div>
            <div className="lg:sticky lg:top-4 self-start">
              <TrackMap
                telemetry={telemetry}
                reference={referenceTelemetry}
                hoverDistance={hoverDistance}
                zoomRange={zoomRange}
                sectorMarkers={sectorMarkers}
              />
            </div>
          </div>
        ) : (
          <div className="border hairline p-8 text-center text-muted mono text-xs tracking-widest">
            SELECIONE UMA VOLTA
          </div>
        )}
      </div>

      <ImportLapModal
        open={showImport}
        onClose={() => setShowImport(false)}
        onImported={loadImported}
      />

      <BestInRangePanel
        open={showBestInRange}
        onClose={() => setShowBestInRange(false)}
        range={zoomRange}
        currentLapId={selectedLapId}
        currentTelemetry={telemetry}
        sessionLaps={data?.laps || []}
        otherLaps={otherLaps}
        importedLaps={importedLaps}
        onSelect={(id) => setReferenceLapId(id)}
      />

      <LapPickerModal
        open={pickerMode != null}
        onClose={() => setPickerMode(null)}
        mode={pickerMode || "primary"}
        sessionLaps={data?.laps || []}
        otherLaps={otherLaps}
        importedLaps={importedLaps}
        selectedLapId={
          pickerMode === "reference" ? referenceLapId : selectedLapId
        }
        excludeLapId={pickerMode === "reference" ? selectedLapId : null}
        onSelect={(id) => {
          if (pickerMode === "primary") setSelectedLapId(id);
          else setReferenceLapId(id);
        }}
      />
    </div>
  );
}
