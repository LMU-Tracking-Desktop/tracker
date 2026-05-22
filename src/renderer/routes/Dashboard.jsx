// Analise de telemetria GLOBAL — compara duas voltas quaisquer da pista
// selecionada, sem precisar entrar numa sessao. O track picker no topo e o
// contexto: define de qual pista o lap picker lista sessoes/voltas.

import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import DeltaChart from "../components/DeltaChart.jsx";
import SpeedDeltaChart from "../components/SpeedDeltaChart.jsx";
import TrackMap from "../components/TrackMap.jsx";
import ChannelChart from "../components/ChannelChart.jsx";
import ImportLapModal from "../components/ImportLapModal.jsx";
import BestInRangePanel from "../components/BestInRangePanel.jsx";
import LapPickerModal from "../components/LapPickerModal.jsx";
import PageHeader from "../components/PageHeader.jsx";
import SegmentAnalysisModal from "../components/SegmentAnalysisModal.jsx";
import TrackSelect from "../components/TrackSelect.jsx";
import { Field } from "../components/Field.jsx";
import {
  downsample,
  distanceAtTime,
  detectSegments,
  segmentDeltas,
} from "../lib/telemetry.js";

function fmtLapTime(t) {
  if (t == null || t <= 0) return "sem tempo";
  const m = Math.floor(t / 60);
  const s = (t % 60).toFixed(3).padStart(6, "0");
  return `${m}:${s}`;
}

function fmtSector(t) {
  if (t == null || t <= 0) return "—";
  return t.toFixed(3);
}

// Cache da configuracao da tela (pista + voltas) — persiste ao trocar de
// tela e ao reabrir o app, pra nao ter que reconfigurar toda vez.
const CACHE_KEY = "lmu.dashboard.v1";
function loadCache() {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY)) || {};
  } catch {
    return {};
  }
}
function saveCache(state) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(state));
  } catch {}
}

function fetchTelemetry(lapId) {
  if (!lapId) return Promise.resolve(null);
  if (lapId.startsWith("imp:")) {
    return window.api?.getImportTelemetry?.(lapId.slice(4));
  }
  return window.api?.getLapTelemetry?.(lapId);
}

function describeLap(meta) {
  if (!meta) return "— escolher —";
  if (meta.kind === "import") {
    return `${meta.owner} · ${fmtLapTime(meta.lapTime)}`;
  }
  const num = meta.lapNumber != null ? `Volta ${meta.lapNumber} · ` : "";
  return `${num}${fmtLapTime(meta.lapTime)}`;
}

function LapPickerButton({ label, text, onClick, accent }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span
        className="mono"
        style={{
          fontSize: 10,
          letterSpacing: "0.14em",
          color: "var(--tx-2)",
          textTransform: "uppercase",
        }}
      >
        {label}
      </span>
      <button
        type="button"
        onClick={onClick}
        className="mono"
        style={{
          padding: "10px 12px",
          background: "var(--bg-1)",
          color: accent ? "var(--accent)" : "var(--tx-0)",
          border: "1px solid",
          borderColor: accent ? "var(--accent)" : "var(--bd-1)",
          fontSize: 12,
          letterSpacing: "0.04em",
          textAlign: "left",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <span>{text}</span>
        <span style={{ color: "var(--tx-3)" }}>▾</span>
      </button>
    </div>
  );
}

// Delta de um setor vs o mesmo setor da volta B. Verde = mais rapido.
function SectorDelta({ value, refValue }) {
  if (value == null || value <= 0 || refValue == null || refValue <= 0) {
    return <div style={{ height: 13 }} />;
  }
  const d = value - refValue;
  const faster = d < 0;
  return (
    <div
      className="mono"
      style={{
        fontSize: 11,
        fontWeight: 600,
        color: faster ? "var(--ok)" : "var(--crit)",
        lineHeight: 1.2,
      }}
    >
      {faster ? "" : "+"}
      {d.toFixed(3)}
    </div>
  );
}

function SidePanel({ title, right, children }) {
  return (
    <div style={{ background: "var(--bg-1)", border: "1px solid var(--bd-0)" }}>
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
          {title}
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
      <div style={{ padding: "var(--pad)" }}>{children}</div>
    </div>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [tracks, setTracks] = useState([]);
  const [trackId, setTrackId] = useState(null);
  const [trackClasses, setTrackClasses] = useState([]);
  const [carClass, setCarClass] = useState(null);

  const lapAId = searchParams.get("a");
  const lapBId = searchParams.get("b");

  const setLapParam = (key, id) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (id) next.set(key, id);
        else next.delete(key);
        return next;
      },
      { replace: true }
    );
  };

  const [lapAMeta, setLapAMeta] = useState(null);
  const [lapBMeta, setLapBMeta] = useState(null);
  const [telemetryA, setTelemetryA] = useState(null);
  const [telemetryB, setTelemetryB] = useState(null);
  const [loadingA, setLoadingA] = useState(false);
  const [loadingB, setLoadingB] = useState(false);
  const [hoverDistance, setHoverDistance] = useState(null);
  const [zoomRange, setZoomRange] = useState(null);
  const [otherLaps, setOtherLaps] = useState([]);
  const [importedLaps, setImportedLaps] = useState([]);
  const [showImport, setShowImport] = useState(false);
  const [showBestInRange, setShowBestInRange] = useState(false);
  const [showSegmentAnalysis, setShowSegmentAnalysis] = useState(false);
  const [pickerMode, setPickerMode] = useState(null); // "a" | "b" | null

  // Flag: so persiste no cache depois de restaurar (evita o save inicial
  // com estado vazio sobrescrever o cache antes do restore).
  const cacheReady = useRef(false);

  // Carrega pistas + restaura cache (ou ultima pista jogada)
  useEffect(() => {
    (async () => {
      const [t, last] = await Promise.all([
        window.api?.listTracks?.() ?? [],
        window.api?.getLastTrack?.() ?? null,
      ]);
      const list = t || [];
      setTracks(list);
      const cache = loadCache();
      // So usa trackId do cache se a pista ainda existe
      const cachedTrack =
        cache.trackId && list.some((x) => x.id === cache.trackId)
          ? cache.trackId
          : null;
      setTrackId(cachedTrack || last || null);
      if (cache.carClass) setCarClass(cache.carClass);
      // Restaura voltas do cache se a URL nao trouxe nenhuma
      if (!lapAId && !lapBId && (cache.a || cache.b)) {
        setSearchParams(
          (prev) => {
            const next = new URLSearchParams(prev);
            if (cache.a) next.set("a", cache.a);
            if (cache.b) next.set("b", cache.b);
            return next;
          },
          { replace: true }
        );
      }
      cacheReady.current = true;
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persiste configuracao a cada mudanca
  useEffect(() => {
    if (!cacheReady.current) return;
    saveCache({ trackId, carClass, a: lapAId, b: lapBId });
  }, [trackId, carClass, lapAId, lapBId]);

  // Classes da pista (pro seletor). Ao trocar de pista, escolhe a classe
  // do cache se ainda valida, senao a mais recente.
  useEffect(() => {
    if (!trackId) {
      setTrackClasses([]);
      return;
    }
    let cancelled = false;
    window.api?.getTrackClasses?.(trackId).then((list) => {
      if (cancelled) return;
      const classes = list || [];
      setTrackClasses(classes);
      setCarClass((cur) =>
        cur && classes.includes(cur) ? cur : classes[0] || null
      );
    });
    return () => {
      cancelled = true;
    };
  }, [trackId]);

  const trackName = useMemo(
    () => tracks.find((t) => t.id === trackId)?.name ?? null,
    [tracks, trackId]
  );

  // Limpa as voltas escolhidas. Numa unica chamada de setSearchParams —
  // chamadas separadas recebem o mesmo prev e a segunda sobrescreve.
  const clearLaps = () => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("a");
        next.delete("b");
        return next;
      },
      { replace: true }
    );
  };

  // Trocar de pista: limpa voltas e reseta classe (o effect re-define).
  const changeTrack = (id) => {
    setTrackId(id);
    setCarClass(null);
    clearLaps();
  };

  // Trocar de classe: as voltas escolhidas eram de outra classe.
  const changeClass = (cls) => {
    setCarClass(cls || null);
    clearLaps();
  };

  // Pool de voltas pro picker (abas melhores/S1-S3): top da pista + imports
  useEffect(() => {
    if (!trackId) {
      setOtherLaps([]);
      return;
    }
    window.api
      ?.getTopLapsByTrack?.({ trackId, carClass: carClass || undefined, limit: 30 })
      .then((r) => setOtherLaps(r || []));
  }, [trackId, carClass]);

  const loadImported = () => {
    if (!trackName) {
      setImportedLaps([]);
      return;
    }
    window.api
      ?.listImportsForTrack?.({ trackName, carClass: carClass || undefined })
      .then((r) => setImportedLaps(r || []));
  };
  useEffect(() => {
    loadImported();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackName, carClass]);

  // Metadata + telemetria da volta A
  useEffect(() => {
    if (!lapAId) {
      setLapAMeta(null);
      setTelemetryA(null);
      return;
    }
    let cancelled = false;
    setLoadingA(true);
    Promise.all([
      window.api?.getLapMeta?.(lapAId),
      fetchTelemetry(lapAId),
    ]).then(([meta, telem]) => {
      if (cancelled) return;
      setLapAMeta(meta || null);
      setTelemetryA(telem || null);
      setLoadingA(false);
    });
    return () => {
      cancelled = true;
    };
  }, [lapAId]);

  // Metadata + telemetria da volta B
  useEffect(() => {
    if (!lapBId) {
      setLapBMeta(null);
      setTelemetryB(null);
      return;
    }
    let cancelled = false;
    setLoadingB(true);
    Promise.all([
      window.api?.getLapMeta?.(lapBId),
      fetchTelemetry(lapBId),
    ]).then(([meta, telem]) => {
      if (cancelled) return;
      setLapBMeta(meta || null);
      setTelemetryB(telem || null);
      setLoadingB(false);
    });
    return () => {
      cancelled = true;
    };
  }, [lapBId]);

  useEffect(() => {
    setZoomRange(null);
  }, [lapAId, lapBId]);

  const telemetryDs = useMemo(
    () => (telemetryA ? downsample(telemetryA, 700) : null),
    [telemetryA]
  );
  const referenceDs = useMemo(
    () => (telemetryB ? downsample(telemetryB, 700) : null),
    [telemetryB]
  );

  const segments = useMemo(
    () => (telemetryB ? detectSegments(telemetryB) : []),
    [telemetryB]
  );
  const segmentDelta = useMemo(() => {
    if (!segments.length || !telemetryA || !telemetryB) return [];
    return segmentDeltas(telemetryA, telemetryB, segments);
  }, [segments, telemetryA, telemetryB]);

  const sectorMarkers = useMemo(() => {
    if (!telemetryA || !lapAMeta) return null;
    const s1 =
      lapAMeta.sector1 && lapAMeta.sector1 > 0
        ? distanceAtTime(telemetryA, lapAMeta.sector1)
        : null;
    const s2 =
      lapAMeta.sector2 && lapAMeta.sector2 > 0
        ? distanceAtTime(telemetryA, lapAMeta.sector2)
        : null;
    if (s1 == null && s2 == null) return null;
    return { s1, s2 };
  }, [telemetryA, lapAMeta]);

  // Steering raramente usa ±100% — eixo fixo [-1,1] achata as nuances.
  // Escala simetrica pro maior angulo usado nas duas voltas (+15% de folga).
  const steeringDomain = useMemo(() => {
    let maxAbs = 0.1;
    for (const t of [telemetryA, telemetryB]) {
      if (!t) continue;
      for (const s of t) {
        const v = Math.abs(s.st ?? 0);
        if (v > maxAbs) maxAbs = v;
      }
    }
    const padded = Math.min(1, maxAbs * 1.15);
    return [-padded, padded];
  }, [telemetryA, telemetryB]);

  const channelStats = useMemo(() => {
    if (!telemetryA) return null;
    const n = telemetryA.length;
    let throttleSum = 0;
    let fullThrottleN = 0;
    let brakingN = 0;
    let speedSum = 0;
    let speedSamples = 0;
    let vMax = 0;
    let vMin = Infinity;
    let rpmMax = 0;
    for (const s of telemetryA) {
      const th = s.th ?? 0;
      const br = s.br ?? 0;
      const v = s.v;
      const rpm = s.rpm ?? 0;
      throttleSum += th;
      if (th >= 0.95) fullThrottleN++;
      if (br >= 0.05) brakingN++;
      if (v != null) {
        if (v > vMax) vMax = v;
        if (v > 5 && v < vMin) vMin = v;
        speedSum += v;
        speedSamples++;
      }
      if (rpm > rpmMax) rpmMax = rpm;
    }
    return {
      fullThrottlePct: n ? fullThrottleN / n : 0,
      brakingPct: n ? brakingN / n : 0,
      vAvg: speedSamples ? speedSum / speedSamples : 0,
      vMax,
      vMin: isFinite(vMin) ? vMin : 0,
      rpmMax,
    };
  }, [telemetryA]);

  const emptyBox = (label) => (
    <div
      style={{
        margin: "var(--pad)",
        border: "1px solid var(--bd-0)",
        background: "var(--bg-1)",
        padding: "48px var(--pad)",
        textAlign: "center",
      }}
    >
      <span
        className="mono"
        style={{ fontSize: 10, letterSpacing: "0.18em", color: "var(--tx-3)" }}
      >
        {label}
      </span>
    </div>
  );

  const excludeForA = lapBId || null;
  const excludeForB = lapAId || null;

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
        crumbs={[{ label: "ANÁLISE" }, { label: "COMPARAR VOLTAS" }]}
        actions={
          <div style={{ display: "flex", gap: 6 }}>
            <button
              type="button"
              className="btn"
              onClick={() => setShowImport(true)}
              title="Importar volta de um amigo (JSON)"
            >
              IMPORTAR
            </button>
            {telemetryB && segmentDelta.length > 0 && (
              <button
                type="button"
                className="btn"
                onClick={() => setShowSegmentAnalysis(true)}
                title="Análise por segmento (FREADA/SAÍDA/RETA)"
              >
                ANÁLISE POR SEGMENTO
              </button>
            )}
            <button
              type="button"
              className="btn solid"
              onClick={() => {
                const q = lapBId
                  ? `?mode=3d&ref=${encodeURIComponent(lapBId)}`
                  : "?mode=3d";
                navigate(`/replay/${lapAId}${q}`);
              }}
              disabled={!lapAId}
              style={{ opacity: !lapAId ? 0.4 : 1 }}
            >
              ▶ REPLAY
            </button>
          </div>
        }
      />

      {/* Track picker + classe + lap pickers */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 240px) minmax(0, 140px) 1fr 1fr",
          gap: "var(--gap)",
          padding: "var(--pad)",
          alignItems: "end",
        }}
      >
        <TrackSelect tracks={tracks} value={trackId} onChange={changeTrack} />
        <Field label="Classe">
          <select
            className="select"
            value={carClass ?? ""}
            onChange={(e) => changeClass(e.target.value)}
            disabled={trackClasses.length <= 1}
          >
            {trackClasses.length === 0 && <option value="">—</option>}
            {trackClasses.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>
        <LapPickerButton
          label="Volta A"
          onClick={() => trackId && setPickerMode("a")}
          text={loadingA ? "carregando..." : describeLap(lapAMeta)}
        />
        <LapPickerButton
          label="Volta B (comparar)"
          accent={!!lapBId}
          onClick={() => trackId && setPickerMode("b")}
          text={
            loadingB
              ? "carregando..."
              : lapBMeta
              ? describeLap(lapBMeta)
              : "— nenhuma —"
          }
        />
      </div>

      {/* Zoom bar */}
      {zoomRange && (
        <div
          style={{
            margin: "0 var(--pad) var(--pad)",
            padding: "10px 14px",
            border: "1px solid var(--accent)",
            background: "rgba(214, 255, 0, 0.04)",
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
              color: "var(--accent)",
              textTransform: "uppercase",
              fontWeight: 600,
            }}
          >
            ZOOM · {Math.round(zoomRange[0])}m → {Math.round(zoomRange[1])}m ·{" "}
            {Math.round(zoomRange[1] - zoomRange[0])}m
          </span>
          <div style={{ display: "flex", gap: 6 }}>
            <button
              type="button"
              className="btn"
              onClick={() => setShowBestInRange(true)}
              title="Voltas mais rápidas neste trecho"
            >
              MELHORES NESTE TRECHO
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

      {!trackId ? (
        emptyBox("SELECIONE UMA PISTA")
      ) : loadingA ? (
        emptyBox("CARREGANDO TELEMETRIA...")
      ) : telemetryA ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) 320px",
            gap: "var(--gap)",
            padding: "0 var(--pad) var(--pad)",
          }}
        >
          {/* Charts */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "var(--gap)",
              minWidth: 0,
            }}
          >
            {referenceDs && !loadingB && (
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
              color="var(--throttle)"
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
              color="var(--brake)"
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
              color="var(--steer)"
              yDomain={steeringDomain}
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
              color="var(--speed)"
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
              color="var(--gear)"
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

          {/* Sidebar */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "var(--gap)",
              position: "sticky",
              top: 0,
              alignSelf: "flex-start",
              height: "fit-content",
            }}
          >
            <SidePanel title="Traçado" right="DRAG = ZOOM">
              <TrackMap
                telemetry={telemetryA}
                reference={telemetryB}
                hoverDistance={hoverDistance}
                zoomRange={zoomRange}
                sectorMarkers={sectorMarkers}
              />
            </SidePanel>

            {lapAMeta && (
              <SidePanel
                title={
                  lapAMeta.lapNumber != null
                    ? `Volta A · ${lapAMeta.lapNumber}`
                    : "Volta A"
                }
                right={lapAMeta.isValid ? "VÁLIDA" : "INVÁLIDA"}
              >
                <div
                  className="mono"
                  style={{
                    fontSize: 26,
                    fontWeight: 600,
                    color: lapAMeta.isValid ? "var(--speed)" : "var(--crit)",
                    lineHeight: 1,
                    marginBottom: 12,
                  }}
                >
                  {fmtLapTime(lapAMeta.lapTime)}
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr 1fr",
                    gap: 8,
                  }}
                >
                  {[
                    ["S1", lapAMeta.sector1, lapBMeta?.sector1],
                    ["S2", lapAMeta.sector2, lapBMeta?.sector2],
                    ["S3", lapAMeta.sector3, lapBMeta?.sector3],
                  ].map(([k, v, refV]) => (
                    <div key={k}>
                      <div
                        className="mono"
                        style={{
                          fontSize: 9,
                          color: "var(--tx-3)",
                          letterSpacing: "0.18em",
                        }}
                      >
                        {k}
                      </div>
                      <div
                        className="mono"
                        style={{
                          fontSize: 13,
                          color: "var(--tx-0)",
                          fontWeight: 500,
                        }}
                      >
                        {fmtSector(v)}
                      </div>
                      <SectorDelta value={v} refValue={refV} />
                    </div>
                  ))}
                </div>
                {lapBMeta && (
                  <div
                    style={{
                      marginTop: 14,
                      paddingTop: 12,
                      borderTop: "1px solid var(--bd-0)",
                    }}
                  >
                    <div
                      className="mono"
                      style={{
                        fontSize: 9,
                        letterSpacing: "0.18em",
                        color: "var(--tx-3)",
                        textTransform: "uppercase",
                        marginBottom: 6,
                      }}
                    >
                      vs Volta B · {fmtLapTime(lapBMeta.lapTime)}
                    </div>
                    <div
                      className="mono"
                      style={{
                        fontSize: 20,
                        fontWeight: 600,
                        color:
                          lapAMeta.lapTime < lapBMeta.lapTime
                            ? "var(--ok)"
                            : "var(--crit)",
                      }}
                    >
                      {lapAMeta.lapTime < lapBMeta.lapTime ? "" : "+"}
                      {(lapAMeta.lapTime - lapBMeta.lapTime).toFixed(3)}s
                    </div>
                  </div>
                )}
              </SidePanel>
            )}

            {channelStats && (
              <SidePanel title="Métricas · Volta A">
                <div
                  className="mono"
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                  }}
                >
                  {[
                    [
                      "% PÉ FUNDO",
                      `${(channelStats.fullThrottlePct * 100).toFixed(1)}%`,
                      "var(--throttle)",
                    ],
                    [
                      "% NA FREADA",
                      `${(channelStats.brakingPct * 100).toFixed(1)}%`,
                      "var(--brake)",
                    ],
                    [
                      "VEL. MÉDIA",
                      `${Math.round(channelStats.vAvg)} km/h`,
                      "var(--tx-1)",
                    ],
                    [
                      "VEL. MAX",
                      `${Math.round(channelStats.vMax)} km/h`,
                      "var(--speed)",
                    ],
                    [
                      "VEL. MIN",
                      channelStats.vMin > 0
                        ? `${Math.round(channelStats.vMin)} km/h`
                        : "—",
                      "var(--tx-2)",
                    ],
                    [
                      "RPM MAX",
                      Math.round(channelStats.rpmMax).toLocaleString("pt-BR"),
                      "var(--rpm)",
                    ],
                  ].map(([k, v, c]) => (
                    <div
                      key={k}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        fontSize: 11,
                      }}
                    >
                      <span
                        style={{ color: "var(--tx-3)", letterSpacing: "0.14em" }}
                      >
                        {k}
                      </span>
                      <span style={{ color: c, fontWeight: 500 }}>{v}</span>
                    </div>
                  ))}
                </div>
              </SidePanel>
            )}
          </div>
        </div>
      ) : (
        emptyBox("ESCOLHA A VOLTA A PRA COMEÇAR")
      )}

      <ImportLapModal
        open={showImport}
        onClose={() => setShowImport(false)}
        onImported={loadImported}
      />

      <BestInRangePanel
        open={showBestInRange}
        onClose={() => setShowBestInRange(false)}
        range={zoomRange}
        currentLapId={lapAId}
        currentTelemetry={telemetryA}
        sessionLaps={[]}
        otherLaps={otherLaps}
        importedLaps={importedLaps}
        onSelect={(id) => setLapParam("b", id)}
      />

      <SegmentAnalysisModal
        open={showSegmentAnalysis}
        onClose={() => setShowSegmentAnalysis(false)}
        deltas={segmentDelta}
        telemetry={telemetryA}
        referenceTelemetry={telemetryB}
        onSegmentSelect={(seg) => setZoomRange([seg.from, seg.to])}
      />

      <LapPickerModal
        open={pickerMode != null}
        onClose={() => setPickerMode(null)}
        mode={pickerMode === "b" ? "reference" : "primary"}
        title={pickerMode === "b" ? "Escolher Volta B" : "Escolher Volta A"}
        trackId={trackId}
        carClass={carClass}
        sessionLaps={[]}
        otherLaps={otherLaps}
        importedLaps={importedLaps}
        selectedLapId={pickerMode === "b" ? lapBId : lapAId}
        excludeLapId={pickerMode === "b" ? excludeForB : excludeForA}
        onSelect={(id) => {
          if (pickerMode === "b") setLapParam("b", id);
          else setLapParam("a", id);
        }}
      />
    </div>
  );
}
