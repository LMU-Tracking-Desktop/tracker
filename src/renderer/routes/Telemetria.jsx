import { useEffect, useMemo, useState } from "react";
import {
  useParams,
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
import PageHeader from "../components/PageHeader.jsx";
import { downsample, distanceAtTime } from "../lib/telemetry.js";

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

function SidePanel({ title, right, children }) {
  return (
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
  const [pickerMode, setPickerMode] = useState(null);

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
            { label: "TELEMETRIA" },
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
            { label: "TELEMETRIA" },
          ]}
        />
        {emptyBox("SESSÃO NÃO ENCONTRADA")}
      </div>
    );
  }

  const { session } = data;
  const selectedLap = data.laps.find((l) => l.id === selectedLapId);
  const referenceLap =
    referenceLapId && !referenceLapId.startsWith("imp:")
      ? data.laps.find((l) => l.id === referenceLapId) ||
        otherLaps.find((l) => l.id === referenceLapId)
      : null;

  // Metricas uteis: % do tempo em full throttle / em frenagem, vel media,
  // vel max/min, rpm max. Os MAX de pedais nao dizem nada (sempre 100%).
  const channelStats = telemetry
    ? (() => {
        const n = telemetry.length;
        let throttleSum = 0;
        let fullThrottleN = 0;
        let brakingN = 0;
        let speedSum = 0;
        let speedSamples = 0;
        let vMax = 0;
        let vMin = Infinity;
        let rpmMax = 0;
        for (const s of telemetry) {
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
          throttleAvgPct: n ? throttleSum / n : 0,
          vAvg: speedSamples ? speedSum / speedSamples : 0,
          vMax,
          vMin: isFinite(vMin) ? vMin : 0,
          rpmMax,
        };
      })()
    : null;

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
          {
            label: session.track?.name || "—",
            onClick: () => navigate(`/sessoes/${sessionId}`),
          },
          { label: "TELEMETRIA" },
        ]}
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
              style={{ opacity: !selectedLapId ? 0.4 : 1 }}
            >
              ▶ 2D
            </button>
            <button
              type="button"
              className="btn solid"
              onClick={() => {
                const q = referenceLapId
                  ? `?mode=3d&ref=${encodeURIComponent(referenceLapId)}`
                  : "?mode=3d";
                navigate(`/replay/${selectedLapId}${q}`);
              }}
              disabled={!selectedLapId}
              style={{ opacity: !selectedLapId ? 0.4 : 1 }}
            >
              ▶ 3D
            </button>
          </div>
        }
      />

      {/* Lap pickers */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr auto",
          gap: "var(--gap)",
          padding: "var(--pad)",
          alignItems: "end",
        }}
      >
        <LapPickerButton
          label="Volta"
          onClick={() => setPickerMode("primary")}
          text={describeLap({
            lapId: selectedLapId,
            sessionLaps: data.laps,
            otherLaps,
            importedLaps,
          })}
        />
        <LapPickerButton
          label="Comparar com"
          accent={!!referenceLapId}
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
        <div style={{ display: "flex", alignItems: "end", gap: 6 }}>
          {selectedLap && (
            <CopyLapButton lap={selectedLap} session={session} />
          )}
        </div>
      </div>

      {/* Zoom indicator bar */}
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
            ZOOM · {Math.round(zoomRange[0])}m → {Math.round(zoomRange[1])}m
            ·{" "}
            {Math.round(zoomRange[1] - zoomRange[0])}m
          </span>
          <div style={{ display: "flex", gap: 6 }}>
            <button
              type="button"
              className="btn"
              onClick={() => setShowBestInRange(true)}
              title="Voltas mais rápidas neste trecho"
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

      {loadingTelem ? (
        emptyBox("CARREGANDO TELEMETRIA...")
      ) : telemetry ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) 320px",
            gap: "var(--gap)",
            padding: "0 var(--pad) var(--pad)",
          }}
        >
          {/* Charts column */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "var(--gap)",
              minWidth: 0,
            }}
          >
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
                telemetry={telemetry}
                reference={referenceTelemetry}
                hoverDistance={hoverDistance}
                zoomRange={zoomRange}
                sectorMarkers={sectorMarkers}
              />
            </SidePanel>

            {selectedLap && (
              <SidePanel
                title={`Volta · ${selectedLap.lapNumber}`}
                right={selectedLap.isValid ? "VÁLIDA" : "INVÁLIDA"}
              >
                <div
                  className="mono"
                  style={{
                    fontSize: 26,
                    fontWeight: 600,
                    color: selectedLap.isValid
                      ? "var(--speed)"
                      : "var(--crit)",
                    letterSpacing: "-0.01em",
                    lineHeight: 1,
                    marginBottom: 12,
                  }}
                >
                  {fmtLapTime(selectedLap.lapTime)}
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr 1fr",
                    gap: 8,
                  }}
                >
                  {[
                    ["S1", selectedLap.sector1],
                    ["S2", selectedLap.sector2],
                    ["S3", selectedLap.sector3],
                  ].map(([k, v]) => (
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
                    </div>
                  ))}
                </div>
                {referenceLap && (
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
                      vs Volta {referenceLap.lapNumber}
                    </div>
                    <div
                      className="mono"
                      style={{
                        fontSize: 20,
                        fontWeight: 600,
                        color:
                          selectedLap.lapTime < referenceLap.lapTime
                            ? "var(--ok)"
                            : "var(--crit)",
                        letterSpacing: "-0.01em",
                      }}
                    >
                      {selectedLap.lapTime < referenceLap.lapTime ? "" : "+"}
                      {(selectedLap.lapTime - referenceLap.lapTime).toFixed(3)}s
                    </div>
                  </div>
                )}
              </SidePanel>
            )}

            {channelStats && (
              <SidePanel title="Métricas">
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
                        letterSpacing: "0.04em",
                      }}
                    >
                      <span
                        style={{
                          color: "var(--tx-3)",
                          letterSpacing: "0.14em",
                        }}
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
        emptyBox("SELECIONE UMA VOLTA")
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
