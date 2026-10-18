// Coach por curva — compara sua passagem tipica em cada curva com as suas
// melhores passagens nela e diz o que muda. Logica em src/analysis/coach.js.

import { useEffect, useMemo, useState } from "react";
import PageHeader from "../components/PageHeader.jsx";
import TrackSelect from "../components/TrackSelect.jsx";
import CoachMap from "../components/CoachMap.jsx";
import { Field } from "../components/Field.jsx";
import { formatLapTime } from "../lib/format.js";

const FEW_LAPS = 15;

const box = {
  background: "var(--bg-1)",
  border: "1px solid var(--bd-0)",
};

const label = {
  fontSize: 10,
  letterSpacing: "0.14em",
  color: "var(--tx-3)",
  textTransform: "uppercase",
};

function CornerCard({ c, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        width: "100%",
        textAlign: "left",
        padding: "12px 14px",
        background: active ? "var(--bg-2)" : "transparent",
        border: "none",
        borderBottom: "1px solid var(--bd-0)",
        borderLeft: "3px solid",
        borderLeftColor: active ? "var(--accent)" : "transparent",
        cursor: "pointer",
        color: "inherit",
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
        <span className="mono" style={{ fontSize: 14, fontWeight: 700, color: "var(--tx-0)" }}>
          {c.name}
        </span>
        <span className="mono" style={{ fontSize: 12, color: c.loss > 0.15 ? "var(--crit)" : "var(--warn)" }}>
          +{c.loss.toFixed(3)}s
        </span>
        <span className="mono" style={{ ...label, fontSize: 9, marginLeft: "auto" }}>
          {c.passes} passagens
        </span>
      </div>
      {c.findings.length === 0 ? (
        <span style={{ fontSize: 12, color: "var(--tx-3)" }}>
          Perde tempo aqui, mas sem um padrão claro — varia de volta pra volta.
        </span>
      ) : (
        <ul style={{ margin: 0, paddingLeft: 16, display: "flex", flexDirection: "column", gap: 6 }}>
          {c.findings.map((f) => (
            <li key={f.type} style={{ fontSize: 12.5, color: "var(--tx-1)", lineHeight: 1.45 }}>
              {f.text}
              <span className="mono" style={{ fontSize: 10, color: "var(--tx-3)", marginLeft: 6 }}>
                em {Math.round(f.freq * 100)}% das voltas
              </span>
            </li>
          ))}
        </ul>
      )}
    </button>
  );
}

export default function Coach() {
  const [tracks, setTracks] = useState([]);
  const [trackId, setTrackId] = useState(null);
  const [carClass, setCarClass] = useState(null);
  const [car, setCar] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(null);

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

  useEffect(() => {
    if (!trackId) {
      setData(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setSelected(null);
      try {
        const d = await window.api?.analyzeCoach?.({ trackId, carClass, car });
        if (!cancelled) setData(d);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [trackId, carClass, car]);

  // Ordena por perda: as primeiras sao "onde focar"
  const ranked = useMemo(
    () => [...(data?.corners || [])].filter((c) => c.loss > 0.01).sort((a, b) => b.loss - a.loss),
    [data]
  );

  const emptyBox = (text) => (
    <div style={{ ...box, margin: "var(--pad)", padding: "48px var(--pad)", textAlign: "center" }}>
      <span className="mono" style={{ ...label, letterSpacing: "0.18em" }}>
        {text}
      </span>
    </div>
  );

  const fewLaps = data && data.lapCount > 0 && data.lapCount < FEW_LAPS;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "auto" }}>
      <PageHeader crumbs={[{ label: "COACH" }, { label: "POR CURVA" }]} />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 260px) minmax(0, 160px) minmax(0, 200px) 1fr",
          gap: "var(--gap)",
          padding: "var(--pad)",
          alignItems: "end",
        }}
      >
        <TrackSelect
          tracks={tracks}
          value={trackId}
          onChange={(id) => {
            setTrackId(id);
            setCarClass(null);
            setCar(null);
          }}
        />
        <Field label="Classe">
          <select
            className="select"
            value={data?.carClass ?? ""}
            onChange={(e) => {
              setCarClass(e.target.value || null);
              setCar(null);
            }}
            disabled={(data?.availableClasses?.length ?? 0) <= 1}
          >
            {(data?.availableClasses || []).map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Carro">
          <select
            className="select"
            value={data?.car ?? ""}
            onChange={(e) => setCar(e.target.value || null)}
            disabled={(data?.availableCars?.length ?? 0) <= 1}
          >
            {(data?.availableCars || []).map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {!trackId ? (
        emptyBox("SELECIONE UMA PISTA")
      ) : loading ? (
        emptyBox("ANALISANDO SUAS VOLTAS...")
      ) : !data ? (
        emptyBox("ERRO AO ANALISAR — VEJA OS LOGS")
      ) : data.corners.length === 0 ? (
        emptyBox(
          `PRECISA DE PELO MENOS ${data.minLaps ?? 5} VOLTAS VÁLIDAS COM TELEMETRIA NESSE CARRO (TEM ${data.lapCount})`
        )
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) 420px",
            gap: "var(--gap)",
            padding: "0 var(--pad) var(--pad)",
            alignItems: "start",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--gap)" }}>
            <div style={{ ...box, padding: "var(--pad)" }}>
              <div className="mono" style={{ ...label, marginBottom: 8 }}>
                {data.lapCount} voltas recentes · ref {formatLapTime(data.refLapTime)} · perda típica somada{" "}
                <span style={{ color: "var(--warn)" }}>{data.totalLoss.toFixed(2)}s</span>
              </div>
              <CoachMap
                path={data.path}
                corners={data.corners}
                selected={selected}
                onSelect={setSelected}
              />
            </div>

            <div style={{ ...box, padding: "var(--pad)", fontSize: 12, color: "var(--tx-2)", lineHeight: 1.6 }}>
              <div className="mono" style={{ ...label, color: "var(--tx-1)", fontWeight: 600, marginBottom: 6 }}>
                Como o coach chega nisso
              </div>
              Em cada curva, compara como você passa <b>na maioria das voltas</b> com as suas{" "}
              <b>melhores passagens</b> nessa mesma curva. O tempo de cada passagem é medido da freada
              até a próxima freada, então uma curva bonita que estraga a reta seguinte não conta como
              boa. Passagens que só foram rápidas porque você chegou mais rápido da curva anterior ficam
              de fora, assim como rodadas e tráfego. Uma dica só aparece se acontece em pelo menos 25%
              das voltas.
              {fewLaps && (
                <div style={{ marginTop: 8, color: "var(--warn)" }}>
                  Com {data.lapCount} voltas a análise ainda é frágil. A partir de {FEW_LAPS} fica bem mais confiável.
                </div>
              )}
            </div>
          </div>

          <div style={box}>
            <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--bd-0)" }}>
              <span className="mono" style={{ ...label, color: "var(--tx-1)", fontWeight: 600 }}>
                Onde focar
              </span>
            </div>
            {ranked.length === 0 ? (
              <div className="mono" style={{ ...label, padding: 20, textAlign: "center" }}>
                Você já passa perto do seu melhor em todas as curvas
              </div>
            ) : (
              ranked.map((c) => (
                <CornerCard
                  key={c.idx}
                  c={c}
                  active={selected === c.idx}
                  onClick={() => setSelected(selected === c.idx ? null : c.idx)}
                />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
