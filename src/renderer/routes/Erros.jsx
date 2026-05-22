// Analise de erros na pista — agrega varias voltas e pinta o tracado por
// camada (perda de tempo, ABS/TC, velocidade minima, consistencia).

import { useEffect, useMemo, useState } from "react";
import PageHeader from "../components/PageHeader.jsx";
import TrackSelect from "../components/TrackSelect.jsx";
import ErrorMap from "../components/ErrorMap.jsx";
import { Field } from "../components/Field.jsx";
import { formatLapTime } from "../lib/format.js";

const LAYERS = [
  {
    id: "delta",
    label: "Perda de tempo",
    hint: "Onde você perde tempo vs sua melhor volta (média das voltas).",
  },
  {
    id: "abstc",
    label: "ABS / TC",
    hint: "Trechos onde os assists mais intervêm — freada/aceleração forçando.",
  },
  {
    id: "speed",
    label: "Velocidade mínima",
    hint: "Onde sua velocidade mínima fica abaixo da melhor volta.",
  },
  {
    id: "consistency",
    label: "Consistência",
    hint: "Trechos onde você varia mais de volta pra volta.",
  },
];

function layerValue(bin, layer) {
  switch (layer) {
    case "abstc":
      return Math.max(bin.absFreq || 0, bin.tcFreq || 0);
    case "speed":
      return bin.refMinSpeed != null && bin.minSpeed != null
        ? Math.max(0, bin.refMinSpeed - bin.minSpeed)
        : 0;
    case "consistency":
      return bin.stdDelta || 0;
    case "delta":
    default:
      return Math.max(0, bin.avgDelta || 0);
  }
}

function describeBin(bin, layer) {
  switch (layer) {
    case "abstc":
      return `ABS ${Math.round((bin.absFreq || 0) * 100)}% · TC ${Math.round(
        (bin.tcFreq || 0) * 100
      )}%`;
    case "speed":
      if (bin.refMinSpeed == null || bin.minSpeed == null) return "—";
      return `${Math.round(bin.minSpeed)} km/h · ref ${Math.round(
        bin.refMinSpeed
      )} (${(bin.minSpeed - bin.refMinSpeed).toFixed(0)})`;
    case "consistency":
      return `σ ${(bin.stdDelta || 0).toFixed(3)}s`;
    case "delta":
    default:
      return `+${(bin.avgDelta || 0).toFixed(3)}s médio`;
  }
}

const fmtDist = (b) =>
  `${Math.round(b.distFrom)}–${Math.round(b.distTo)}m`;

export default function Erros() {
  const [tracks, setTracks] = useState([]);
  const [trackId, setTrackId] = useState(null);
  const [carClass, setCarClass] = useState(null); // null = auto (mais rapida)
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [layer, setLayer] = useState("delta");
  const [hoveredIndex, setHoveredIndex] = useState(null);

  useEffect(() => {
    (async () => {
      const [t, last] = await Promise.all([
        window.api?.listTracks?.() ?? [],
        window.api?.getLastTrack?.() ?? null,
      ]);
      setTracks(t || []);
      if (last) setTrackId(last);
    })();
  }, []);

  const changeTrack = (id) => {
    setTrackId(id);
    setCarClass(null); // pista nova → volta pro auto
  };

  useEffect(() => {
    if (!trackId) {
      setData(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setHoveredIndex(null);
      try {
        const d = await window.api?.analyzeErrors?.({ trackId, carClass });
        if (!cancelled) setData(d);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [trackId, carClass]);

  // Top trechos piores na camada atual
  const topZones = useMemo(() => {
    if (!data?.bins) return [];
    return data.bins
      .map((b, i) => ({ b, i, v: layerValue(b, layer) }))
      .filter((x) => x.v > 0)
      .sort((a, b) => b.v - a.v)
      .slice(0, 6);
  }, [data, layer]);

  const layerDef = LAYERS.find((l) => l.id === layer);
  const hoveredBin = hoveredIndex != null ? data?.bins?.[hoveredIndex] : null;

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

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflow: "auto",
      }}
    >
      <PageHeader crumbs={[{ label: "ERROS" }, { label: "MAPA DA PISTA" }]} />

      {/* Track picker + class + layer toggle */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 260px) minmax(0, 160px) 1fr",
          gap: "var(--gap)",
          padding: "var(--pad)",
          alignItems: "end",
        }}
      >
        <TrackSelect tracks={tracks} value={trackId} onChange={changeTrack} />
        <Field label="Classe">
          <select
            className="select"
            value={carClass ?? data?.carClass ?? ""}
            onChange={(e) => setCarClass(e.target.value || null)}
            disabled={!data || (data.availableClasses?.length ?? 0) <= 1}
          >
            {(data?.availableClasses || []).map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {LAYERS.map((l) => {
            const active = layer === l.id;
            return (
              <button
                key={l.id}
                type="button"
                onClick={() => setLayer(l.id)}
                className="mono"
                style={{
                  padding: "8px 12px",
                  fontSize: 10,
                  letterSpacing: "0.1em",
                  background: active ? "var(--bg-3)" : "transparent",
                  color: active ? "var(--accent)" : "var(--tx-2)",
                  border: "1px solid",
                  borderColor: active ? "var(--accent)" : "var(--bd-1)",
                  fontWeight: active ? 600 : 400,
                  cursor: "pointer",
                  textTransform: "uppercase",
                }}
              >
                {l.label}
              </button>
            );
          })}
        </div>
      </div>

      {!trackId ? (
        emptyBox("SELECIONE UMA PISTA")
      ) : loading ? (
        emptyBox("ANALISANDO VOLTAS...")
      ) : !data || !data.bins?.length ? (
        emptyBox("SEM VOLTAS COM TELEMETRIA NESSA PISTA")
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) 320px",
            gap: "var(--gap)",
            padding: "0 var(--pad) var(--pad)",
          }}
        >
          {/* Mapa */}
          <div
            style={{
              background: "var(--bg-1)",
              border: "1px solid var(--bd-0)",
              padding: "var(--pad)",
            }}
          >
            <div
              className="mono"
              style={{
                fontSize: 10,
                letterSpacing: "0.14em",
                color: "var(--tx-3)",
                textTransform: "uppercase",
                marginBottom: 8,
              }}
            >
              {data.lapCount} {data.lapCount === 1 ? "VOLTA" : "VOLTAS"} ·{" "}
              {data.carClass || "—"} · REF {formatLapTime(data.refLapTime)}
            </div>
            <ErrorMap
              bins={data.bins}
              layer={layer}
              hoveredIndex={hoveredIndex}
              onHoverBin={setHoveredIndex}
            />
            {/* Legenda */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginTop: 8,
              }}
            >
              <span
                className="mono"
                style={{
                  fontSize: 9,
                  letterSpacing: "0.14em",
                  color: "var(--tx-3)",
                }}
              >
                BOM
              </span>
              <div
                style={{
                  flex: 1,
                  height: 8,
                  background:
                    "linear-gradient(90deg, rgb(62,207,101), rgb(240,200,60), rgb(230,64,60))",
                }}
              />
              <span
                className="mono"
                style={{
                  fontSize: 9,
                  letterSpacing: "0.14em",
                  color: "var(--tx-3)",
                }}
              >
                RUIM
              </span>
            </div>
          </div>

          {/* Painel lateral */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "var(--gap)",
            }}
          >
            <div
              style={{
                background: "var(--bg-1)",
                border: "1px solid var(--bd-0)",
                padding: "var(--pad)",
              }}
            >
              <div
                className="mono"
                style={{
                  fontSize: 10,
                  letterSpacing: "0.14em",
                  color: "var(--tx-1)",
                  textTransform: "uppercase",
                  fontWeight: 600,
                  marginBottom: 6,
                }}
              >
                {layerDef?.label}
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: "var(--tx-2)",
                  lineHeight: 1.5,
                }}
              >
                {layerDef?.hint}
              </div>
              {hoveredBin && (
                <div
                  style={{
                    marginTop: 12,
                    paddingTop: 10,
                    borderTop: "1px solid var(--bd-0)",
                  }}
                >
                  <div
                    className="mono"
                    style={{
                      fontSize: 9,
                      letterSpacing: "0.16em",
                      color: "var(--tx-3)",
                      textTransform: "uppercase",
                    }}
                  >
                    {fmtDist(hoveredBin)}
                  </div>
                  <div
                    className="mono"
                    style={{
                      fontSize: 15,
                      color: "var(--tx-0)",
                      fontWeight: 600,
                      marginTop: 4,
                    }}
                  >
                    {describeBin(hoveredBin, layer)}
                  </div>
                </div>
              )}
            </div>

            {/* Top zonas */}
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
                  Piores trechos
                </span>
              </div>
              {topZones.length === 0 ? (
                <div
                  className="mono"
                  style={{
                    padding: 20,
                    textAlign: "center",
                    fontSize: 10,
                    letterSpacing: "0.14em",
                    color: "var(--tx-3)",
                  }}
                >
                  NADA RELEVANTE
                </div>
              ) : (
                topZones.map(({ b, i }, rank) => (
                  <div
                    key={i}
                    onMouseEnter={() => setHoveredIndex(i)}
                    onMouseLeave={() => setHoveredIndex(null)}
                    style={{
                      padding: "8px 14px",
                      borderBottom: "1px solid var(--bd-0)",
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      cursor: "default",
                      background:
                        hoveredIndex === i ? "var(--bg-2)" : "transparent",
                    }}
                  >
                    <span
                      className="mono"
                      style={{
                        fontSize: 12,
                        color: "var(--tx-3)",
                        width: 16,
                      }}
                    >
                      {rank + 1}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        className="mono"
                        style={{
                          fontSize: 11,
                          color: "var(--tx-0)",
                          fontWeight: 500,
                        }}
                      >
                        {describeBin(b, layer)}
                      </div>
                      <div
                        className="mono"
                        style={{
                          fontSize: 9,
                          letterSpacing: "0.12em",
                          color: "var(--tx-3)",
                        }}
                      >
                        {fmtDist(b)}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
