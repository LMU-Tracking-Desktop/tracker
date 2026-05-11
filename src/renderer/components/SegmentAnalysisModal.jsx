import { useMemo, useState } from "react";
import Modal from "./Modal.jsx";
import SegmentMiniMap from "./SegmentMiniMap.jsx";
import ChannelChart from "./ChannelChart.jsx";

const TYPE_COLOR = {
  braking: "var(--brake)",
  exit: "var(--throttle)",
  straight: "var(--speed)",
};

const TYPE_LABEL = {
  braking: "FREADA",
  exit: "SAÍDA",
  straight: "RETA",
};

function deltaColor(delta) {
  if (delta == null) return "var(--tx-2)";
  if (delta > 0.005) return Math.abs(delta) > 0.2 ? "var(--crit)" : "var(--warn)";
  if (delta < -0.005) return "var(--ok)";
  return "var(--tx-2)";
}

function fmtSigned(d) {
  if (d == null) return "—";
  return (d > 0 ? "+" : "") + d.toFixed(3) + "s";
}

function pillStyle(active) {
  return {
    padding: "4px 8px",
    background: active ? "var(--bg-2)" : "transparent",
    border: "1px solid var(--bd-1)",
    color: active ? "var(--tx-0)" : "var(--tx-3)",
    fontSize: 9,
    letterSpacing: "0.14em",
    cursor: "pointer",
  };
}

// Calcula varias estatisticas do trecho [from, to] de samples
function rangeStats(samples, from, to) {
  if (!samples || samples.length === 0) return null;
  let vMin = Infinity;
  let vMax = -Infinity;
  let dVmin = null;
  let dBrakeOn = null;
  let dBrakeRelease = null; // primeiro ponto onde freio cai abaixo de 5% depois de ter freado
  let brakePeak = 0;
  let dThrottleFull = null;
  let fullThrottleSamples = 0;
  let totalSamples = 0;
  let maxGear = 0;
  let peakSteer = 0;
  let gearAtVmin = null;
  let foundVmin = false;
  let everBraked = false;
  let releasedSinceBrake = false;

  for (const s of samples) {
    if (s.d < from) continue;
    if (s.d > to) break;
    totalSamples++;
    const v = s.v ?? 0;
    const br = s.br ?? 0;
    const th = s.th ?? 0;
    const g = s.g ?? 0;
    const stAbs = Math.abs(s.st ?? 0);

    if (v < vMin) {
      vMin = v;
      dVmin = s.d;
      gearAtVmin = g;
    }
    if (v > vMax) vMax = v;
    if (br > brakePeak) brakePeak = br;
    if (br >= 0.05) {
      if (dBrakeOn == null) dBrakeOn = s.d;
      everBraked = true;
      releasedSinceBrake = false;
    } else if (everBraked && !releasedSinceBrake) {
      dBrakeRelease = s.d;
      releasedSinceBrake = true;
    }
    if (th >= 0.95) fullThrottleSamples++;
    if (!foundVmin && dThrottleFull == null && th >= 0.95) {
      if (v <= vMin + 1) foundVmin = true;
      else dThrottleFull = s.d;
    }
    if (g > maxGear) maxGear = g;
    if (stAbs > peakSteer) peakSteer = stAbs;
  }
  return {
    vMin: isFinite(vMin) ? vMin : null,
    vMax: isFinite(vMax) ? vMax : null,
    dVmin,
    dBrakeOn,
    dBrakeRelease,
    brakePeak,
    dThrottleFull,
    fullThrottlePct: totalSamples > 0 ? fullThrottleSamples / totalSamples : 0,
    maxGear,
    peakSteer,
    gearAtVmin,
  };
}

function buildInsights(seg, current, reference) {
  if (!seg || !current || !reference) return [];
  const cur = rangeStats(current, seg.from, seg.to);
  const ref = rangeStats(reference, seg.from, seg.to);
  if (!cur || !ref) return [];
  const out = [];

  if (seg.type === "braking") {
    // 1) ponto de freada
    if (cur.dBrakeOn != null && ref.dBrakeOn != null) {
      const diff = cur.dBrakeOn - ref.dBrakeOn;
      if (Math.abs(diff) > 3) {
        out.push({
          label: "PONTO DE FREADA",
          value: `${diff > 0 ? "+" : ""}${diff.toFixed(0)}m`,
          hint:
            diff > 0
              ? "VOCÊ FREOU MAIS TARDE"
              : "VOCÊ FREOU MAIS CEDO",
          good: diff > 0,
        });
      } else {
        out.push({
          label: "PONTO DE FREADA",
          value: "≈ IGUAL",
          hint: "DENTRO DE 3m",
        });
      }
    }
    // 2) vmin
    if (cur.vMin != null && ref.vMin != null) {
      const dv = cur.vMin - ref.vMin;
      out.push({
        label: "VMIN",
        value: `${Math.round(cur.vMin)} vs ${Math.round(ref.vMin)} km/h`,
        hint:
          Math.abs(dv) < 0.5
            ? "EQUIVALENTE"
            : dv > 0
            ? `+${dv.toFixed(1)} km/h`
            : `${dv.toFixed(1)} km/h`,
        good: dv > 0,
      });
    }
    // 3) trail braking — quanto o freio se estende ALÉM do vmin
    if (
      cur.dBrakeRelease != null &&
      cur.dVmin != null &&
      ref.dBrakeRelease != null &&
      ref.dVmin != null
    ) {
      const trailCur = cur.dBrakeRelease - cur.dVmin;
      const trailRef = ref.dBrakeRelease - ref.dVmin;
      const diff = trailCur - trailRef;
      const hint =
        trailCur < 0
          ? "VOCÊ SOLTA ANTES DO APEX"
          : trailRef < 0
          ? "REF SOLTA ANTES DO APEX"
          : Math.abs(diff) < 3
          ? "TRAIL SIMILAR"
          : diff > 0
          ? "VOCÊ TRAIL-BRAKE MAIS"
          : "REF TRAIL-BRAKE MAIS";
      out.push({
        label: "TRAIL BRAKING",
        value: `${trailCur >= 0 ? "+" : ""}${trailCur.toFixed(0)}m vs ${
          trailRef >= 0 ? "+" : ""
        }${trailRef.toFixed(0)}m`,
        hint,
      });
    }
    // 4) pico do freio
    if (Math.abs(cur.brakePeak - ref.brakePeak) > 0.05) {
      const diff = cur.brakePeak - ref.brakePeak;
      out.push({
        label: "PICO DO FREIO",
        value: `${Math.round(cur.brakePeak * 100)}% vs ${Math.round(
          ref.brakePeak * 100
        )}%`,
        hint: diff > 0 ? "VOCÊ FREIA MAIS FORTE" : "VOCÊ FREIA MAIS LEVE",
      });
    }
  }

  if (seg.type === "exit") {
    if (cur.dThrottleFull != null && ref.dThrottleFull != null) {
      const diff = cur.dThrottleFull - ref.dThrottleFull;
      if (Math.abs(diff) > 3) {
        out.push({
          label: "REABERTURA DO GÁS",
          value: `${diff > 0 ? "+" : ""}${diff.toFixed(0)}m`,
          hint:
            diff < 0
              ? "VOCÊ ACELEROU MAIS CEDO"
              : "VOCÊ ACELEROU MAIS TARDE",
          good: diff < 0,
        });
      } else {
        out.push({
          label: "REABERTURA DO GÁS",
          value: "≈ IGUAL",
          hint: "DENTRO DE 3m",
        });
      }
    }
    if (cur.vMin != null && ref.vMin != null) {
      const dv = cur.vMin - ref.vMin;
      out.push({
        label: "VMIN NA SAÍDA",
        value: `${Math.round(cur.vMin)} vs ${Math.round(ref.vMin)} km/h`,
        hint:
          Math.abs(dv) < 0.5
            ? "EQUIVALENTE"
            : dv > 0
            ? `+${dv.toFixed(1)} km/h`
            : `${dv.toFixed(1)} km/h`,
        good: dv > 0,
      });
    }
    // pico de steering — saída fechada vs aberta
    if (cur.peakSteer != null && ref.peakSteer != null) {
      const diff = cur.peakSteer - ref.peakSteer;
      if (Math.abs(diff) > 0.05) {
        out.push({
          label: "PICO DE VOLANTE",
          value: `${Math.round(cur.peakSteer * 100)}% vs ${Math.round(
            ref.peakSteer * 100
          )}%`,
          hint:
            diff > 0
              ? "VOCÊ TORCEU MAIS (LINHA FECHADA)"
              : "VOCÊ ABRIU MAIS A LINHA",
        });
      }
    }
    if (cur.gearAtVmin != null && ref.gearAtVmin != null) {
      if (cur.gearAtVmin !== ref.gearAtVmin) {
        out.push({
          label: "MARCHA NO APEX",
          value: `${cur.gearAtVmin}ª vs ${ref.gearAtVmin}ª`,
          hint: "MARCHA DIFERENTE",
        });
      }
    }
  }

  if (seg.type === "straight") {
    if (cur.vMax != null && ref.vMax != null) {
      const dv = cur.vMax - ref.vMax;
      out.push({
        label: "VMAX",
        value: `${Math.round(cur.vMax)} vs ${Math.round(ref.vMax)} km/h`,
        hint:
          Math.abs(dv) < 0.5
            ? "EQUIVALENTE"
            : dv > 0
            ? `+${dv.toFixed(1)} km/h`
            : `${dv.toFixed(1)} km/h`,
        good: dv > 0,
      });
    }
    if (cur.vMin != null && ref.vMin != null) {
      const dv = cur.vMin - ref.vMin;
      if (Math.abs(dv) > 1) {
        out.push({
          label: "VEL. NA ENTRADA",
          value: `${Math.round(cur.vMin)} vs ${Math.round(ref.vMin)} km/h`,
          hint:
            dv > 0
              ? "ENTROU MAIS RÁPIDO"
              : "ENTROU MAIS LENTO (saída da curva)",
          good: dv > 0,
        });
      }
    }
    // % pé fundo na reta
    const ftDiff = (cur.fullThrottlePct - ref.fullThrottlePct) * 100;
    if (Math.abs(ftDiff) > 3) {
      out.push({
        label: "TEMPO EM PÉ FUNDO",
        value: `${Math.round(cur.fullThrottlePct * 100)}% vs ${Math.round(
          ref.fullThrottlePct * 100
        )}%`,
        hint:
          ftDiff > 0
            ? `+${ftDiff.toFixed(0)} pp (MAIS COMPROMETIDO)`
            : `${ftDiff.toFixed(0)} pp (HESITOU)`,
        good: ftDiff > 0,
      });
    }
    if (cur.maxGear !== ref.maxGear && cur.maxGear > 0 && ref.maxGear > 0) {
      out.push({
        label: "MARCHA MÁXIMA",
        value: `${cur.maxGear}ª vs ${ref.maxGear}ª`,
        hint: "MARCHA TOPO DIFERENTE",
      });
    }
  }
  return out;
}

function buildCoachText(seg, current, reference) {
  if (!seg || !current || !reference) return null;
  const cur = rangeStats(current, seg.from, seg.to);
  const ref = rangeStats(reference, seg.from, seg.to);
  if (!cur || !ref) return null;
  const delta = seg.delta;
  if (delta == null) return null;

  const dv = cur.vMin != null && ref.vMin != null ? cur.vMin - ref.vMin : 0;
  const dvMax =
    cur.vMax != null && ref.vMax != null ? cur.vMax - ref.vMax : 0;
  const dBrake =
    cur.dBrakeOn != null && ref.dBrakeOn != null
      ? cur.dBrakeOn - ref.dBrakeOn
      : 0;
  const dThrottle =
    cur.dThrottleFull != null && ref.dThrottleFull != null
      ? cur.dThrottleFull - ref.dThrottleFull
      : 0;

  // FREADA
  if (seg.type === "braking") {
    if (delta < -0.03) {
      return "Freada melhor que a referência. Repita o ponto e o perfil de pedal nessa curva.";
    }
    if (Math.abs(delta) <= 0.03) {
      return "Freada equivalente à referência. Sem ganho fácil aqui.";
    }
    if (dBrake < -5 && dv < -1) {
      return "Você freia cedo demais E está mais lento no apex — o tempo extra de freada não está virando velocidade. Atrase o ponto e mantenha pressão constante até o apex.";
    }
    if (dBrake < -5 && dv >= -1) {
      return "Você freia mais cedo que a referência sem ganho de vmin. Atrase o ponto pra preservar tempo na entrada.";
    }
    if (dBrake > 5 && dv < -1) {
      return "Freia tarde mas mata o apex — provavelmente chegando longo. Antecipe o freio em 5–10m ou alivie a pressão antes do apex.";
    }
    if (dBrake > 5 && dv >= -1) {
      return "Freou tarde e segurou o vmin, mas perdeu tempo na freada mesmo assim. Provavelmente está demorando a soltar — solte ligeiramente antes pra carregar mais velocidade.";
    }
    if (dv < -1) {
      return "Mesmo ponto de freada, mas vmin mais baixo. Solte o freio um pouco antes pra carregar mais velocidade no apex.";
    }
    return "Pequena perda na freada — diferença fina, foque em consistência.";
  }

  // SAÍDA
  if (seg.type === "exit") {
    if (delta < -0.03) return "Saída melhor que a referência. Consolide o ponto de reabertura.";
    if (Math.abs(delta) <= 0.03) return "Saída equivalente. Sem ganho relevante aqui.";
    if (dThrottle > 5 && dv < -1) {
      return "Está saindo mais lento E reabrindo o gás mais tarde — provavelmente saída fechada. Abra a linha pra liberar o pé direito antes.";
    }
    if (dThrottle > 5) {
      return "Reabriu o gás mais tarde que a referência. Provavelmente espera demais a estabilidade — tenta começar a abrir o pedal antes, mesmo que parcial.";
    }
    if (dv < -1) {
      return "Vmin baixo na saída. Ou a entrada foi apertada demais, ou está modulando o freio até o apex sem necessidade.";
    }
    return "Saída boa, mas com perda fina. Pode ser ângulo de volante mantido por mais tempo do que precisa.";
  }

  // RETA
  if (seg.type === "straight") {
    if (delta < -0.03) return "Reta melhor que a referência.";
    if (Math.abs(delta) <= 0.03) return "Reta equivalente.";
    const dvEntry =
      cur.vMin != null && ref.vMin != null ? cur.vMin - ref.vMin : 0;
    if (dvEntry < -3 && Math.abs(dvMax) < 2) {
      return "Você entra na reta mais devagar e o vmax é igual — a perda nasceu na SAÍDA da curva anterior. Foque ali.";
    }
    if (dvMax < -3) {
      return "Vmax menor que a referência. Provavelmente diferença de marchas, aero ou setup — não é técnica de pilotagem aqui.";
    }
    if (delta > 0.1) {
      return "Perda significativa numa reta com velocidades parecidas. Confira marchas: pode estar trocando tarde ou rebatendo.";
    }
    return "Perda pequena, provavelmente carryover da curva anterior.";
  }
  return null;
}

function SegmentCard({ seg, telemetry, onClick }) {
  const color = TYPE_COLOR[seg.type];
  const dColor = deltaColor(seg.delta);
  const subId = seg.cornerIdx
    ? `T${seg.cornerIdx}`
    : seg.name.replace(/^RETA\s*/, "");
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "flex",
        flexDirection: "column",
        background: "var(--bg-1)",
        border: "1px solid var(--bd-0)",
        borderTop: `3px solid ${color}`,
        padding: 0,
        textAlign: "left",
        cursor: "pointer",
        overflow: "hidden",
        transition: "border-color .1s, background .1s",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "var(--bg-2)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "var(--bg-1)";
      }}
    >
      {/* Header: tipo bem destacado + ID + comprimento */}
      <div
        style={{
          padding: "9px 12px",
          background: "var(--bg-0)",
          borderBottom: "1px solid var(--bd-0)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: 8,
          }}
        >
          <span
            className="mono"
            style={{
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: "0.14em",
              color: color,
              textTransform: "uppercase",
            }}
          >
            {TYPE_LABEL[seg.type]}
          </span>
          <span
            className="mono"
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: "var(--tx-0)",
              letterSpacing: "0.02em",
            }}
          >
            {subId}
          </span>
        </div>
        <span
          className="mono"
          style={{
            fontSize: 10,
            letterSpacing: "0.14em",
            color: "var(--tx-3)",
          }}
        >
          {Math.round(seg.to - seg.from)}m
        </span>
      </div>

      {/* Mini track map */}
      <div
        style={{
          aspectRatio: "16/10",
          background: "var(--bg-0)",
          borderBottom: "1px solid var(--bd-0)",
          padding: 6,
        }}
      >
        <SegmentMiniMap
          telemetry={telemetry}
          segmentFrom={seg.from}
          segmentTo={seg.to}
          highlightColor={dColor}
          width={240}
          height={150}
        />
      </div>

      {/* Delta + tempos */}
      <div
        style={{
          padding: "10px 12px",
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}
      >
        <div
          className="mono"
          style={{
            fontSize: 22,
            fontWeight: 600,
            color: dColor,
            letterSpacing: "-0.01em",
            lineHeight: 1,
          }}
        >
          {fmtSigned(seg.delta)}
        </div>
        <div
          className="mono"
          style={{
            display: "flex",
            gap: 14,
            fontSize: 10,
            color: "var(--tx-3)",
            letterSpacing: "0.06em",
          }}
        >
          <span>
            VOCÊ{" "}
            <span style={{ color: "var(--tx-1)" }}>
              {seg.timeCurrent != null ? seg.timeCurrent.toFixed(3) : "—"}
            </span>
          </span>
          <span>
            REF{" "}
            <span style={{ color: "var(--tx-2)" }}>
              {seg.timeReference != null ? seg.timeReference.toFixed(3) : "—"}
            </span>
          </span>
        </div>
      </div>
    </button>
  );
}

function DetailView({ seg, telemetry, referenceTelemetry, onBack }) {
  const insights = useMemo(
    () => buildInsights(seg, telemetry, referenceTelemetry),
    [seg, telemetry, referenceTelemetry]
  );
  const coach = useMemo(
    () => buildCoachText(seg, telemetry, referenceTelemetry),
    [seg, telemetry, referenceTelemetry]
  );
  const zoom = [seg.from, seg.to];
  const dColor = deltaColor(seg.delta);
  const color = TYPE_COLOR[seg.type];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, padding: 14 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <button
          type="button"
          className="mono"
          onClick={onBack}
          style={{
            padding: "6px 10px",
            background: "transparent",
            border: "1px solid var(--bd-1)",
            color: "var(--tx-1)",
            fontSize: 10,
            letterSpacing: "0.14em",
            cursor: "pointer",
          }}
        >
          ← VOLTAR
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span
            style={{
              width: 8,
              height: 8,
              background: color,
              borderRadius: 1,
            }}
          />
          <span
            className="mono"
            style={{
              fontSize: 12,
              color: "var(--tx-1)",
              letterSpacing: "0.06em",
              fontWeight: 500,
            }}
          >
            {seg.name}
          </span>
          <span
            className="mono"
            style={{
              fontSize: 10,
              color: "var(--tx-3)",
              letterSpacing: "0.14em",
            }}
          >
            {Math.round(seg.to - seg.from)}m
          </span>
        </div>
        <span
          className="mono"
          style={{
            fontSize: 22,
            fontWeight: 600,
            color: dColor,
            letterSpacing: "-0.01em",
          }}
        >
          {fmtSigned(seg.delta)}
        </span>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(260px, 1fr) 2fr",
          gap: 14,
          alignItems: "stretch",
        }}
      >
        <div
          style={{
            background: "var(--bg-0)",
            border: "1px solid var(--bd-0)",
            padding: 10,
            minHeight: 260,
          }}
        >
          <SegmentMiniMap
            telemetry={referenceTelemetry || telemetry}
            segmentFrom={seg.from}
            segmentTo={seg.to}
            highlightColor={dColor}
            width={380}
            height={260}
            showStartEnd
          />
          <div
            className="mono"
            style={{
              marginTop: 10,
              fontSize: 9,
              letterSpacing: "0.14em",
              color: "var(--tx-3)",
              display: "flex",
              gap: 14,
              justifyContent: "center",
            }}
          >
            <span>○ INÍCIO</span>
            <span>● FIM</span>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <ChannelChart
            title="VELOCIDADE"
            subtitle="KM/H"
            channelKey="v"
            color="var(--speed)"
            yDomain={["auto", "auto"]}
            formatter={(v) => `${Math.round(v)}`}
            current={telemetry}
            reference={referenceTelemetry}
            zoomRange={zoom}
            height={120}
          />
          <ChannelChart
            title="FREIO"
            subtitle="%"
            channelKey="br"
            color="var(--brake)"
            yDomain={[0, 1]}
            formatter={(v) => `${Math.round(v * 100)}%`}
            current={telemetry}
            reference={referenceTelemetry}
            zoomRange={zoom}
            height={90}
          />
          <ChannelChart
            title="ACELERADOR"
            subtitle="%"
            channelKey="th"
            color="var(--throttle)"
            yDomain={[0, 1]}
            formatter={(v) => `${Math.round(v * 100)}%`}
            current={telemetry}
            reference={referenceTelemetry}
            zoomRange={zoom}
            height={90}
          />
        </div>
      </div>

      {(coach || insights.length > 0) && (
        <div
          style={{
            background: "var(--bg-0)",
            border: "1px solid var(--bd-0)",
          }}
        >
          <div
            style={{
              padding: "8px 12px",
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
              Análise
            </span>
          </div>

          {coach && (
            <div
              style={{
                padding: "12px 14px",
                borderBottom:
                  insights.length > 0 ? "1px solid var(--bd-0)" : "none",
                background: "rgba(214, 255, 0, 0.03)",
                borderLeft: "3px solid var(--accent)",
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
                  color: "var(--accent)",
                  textTransform: "uppercase",
                  fontWeight: 600,
                }}
              >
                Coach
              </span>
              <span
                style={{
                  fontSize: 13,
                  color: "var(--tx-0)",
                  lineHeight: 1.5,
                  letterSpacing: "0.005em",
                }}
              >
                {coach}
              </span>
            </div>
          )}

          {insights.length > 0 && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: `repeat(${Math.min(insights.length, 4)}, 1fr)`,
              }}
            >
              {insights.map((ins, i) => (
                <div
                  key={i}
                  style={{
                    padding: 12,
                    borderRight:
                      i < insights.length - 1 ? "1px solid var(--bd-0)" : "none",
                    borderTop:
                      i >= 4 ? "1px solid var(--bd-0)" : "none",
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
                    {ins.label}
                  </span>
                  <span
                    className="mono"
                    style={{
                      fontSize: 15,
                      fontWeight: 600,
                      color:
                        ins.good == null
                          ? "var(--tx-0)"
                          : ins.good
                          ? "var(--ok)"
                          : "var(--crit)",
                      letterSpacing: "-0.01em",
                    }}
                  >
                    {ins.value}
                  </span>
                  {ins.hint && (
                    <span
                      className="mono"
                      style={{
                        fontSize: 9,
                        letterSpacing: "0.12em",
                        color: "var(--tx-2)",
                      }}
                    >
                      {ins.hint}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function SegmentAnalysisModal({
  open,
  onClose,
  deltas,
  telemetry,
  referenceTelemetry,
}) {
  const [selectedSeg, setSelectedSeg] = useState(null);
  const [sortMode, setSortMode] = useState("loss");
  const [typeFilter, setTypeFilter] = useState("all");

  const rows = useMemo(() => {
    let r = deltas.filter((d) => d.delta != null);
    if (typeFilter !== "all") r = r.filter((d) => d.type === typeFilter);
    if (sortMode === "track") return [...r].sort((a, b) => a.from - b.from);
    return [...r].sort((a, b) => b.delta - a.delta);
  }, [deltas, sortMode, typeFilter]);

  const totals = useMemo(() => {
    const sum = { braking: 0, exit: 0, straight: 0, all: 0 };
    for (const d of deltas) {
      if (d.delta == null) continue;
      sum[d.type] += d.delta;
      sum.all += d.delta;
    }
    return sum;
  }, [deltas]);

  const reset = () => {
    setSelectedSeg(null);
  };

  return (
    <Modal
      open={open}
      onClose={() => {
        reset();
        onClose?.();
      }}
      title={
        selectedSeg
          ? "ANÁLISE POR SEGMENTO · DETALHE"
          : "ANÁLISE POR SEGMENTO"
      }
      subtitle={
        selectedSeg
          ? null
          : `${rows.length} SEGMENTO${rows.length === 1 ? "" : "S"}`
      }
      width={1100}
    >
      {selectedSeg ? (
        <DetailView
          seg={selectedSeg}
          telemetry={telemetry}
          referenceTelemetry={referenceTelemetry}
          onBack={() => setSelectedSeg(null)}
        />
      ) : (
        <>
          {/* Resumo por tipo + filtros */}
          <div
            style={{
              padding: "12px 14px",
              borderBottom: "1px solid var(--bd-0)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <div
              style={{
                display: "flex",
                gap: 14,
                alignItems: "center",
              }}
              className="mono"
            >
              <span
                style={{
                  fontSize: 9,
                  letterSpacing: "0.14em",
                  color: "var(--tx-3)",
                }}
              >
                TOTAL
              </span>
              <span
                style={{
                  fontSize: 16,
                  fontWeight: 600,
                  color: deltaColor(totals.all),
                }}
              >
                {fmtSigned(totals.all)}
              </span>
              {["braking", "exit", "straight"].map((t) => (
                <span
                  key={t}
                  style={{
                    fontSize: 11,
                    letterSpacing: "0.04em",
                    color: "var(--tx-3)",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      background: TYPE_COLOR[t],
                      borderRadius: 1,
                    }}
                  />
                  <span style={{ color: "var(--tx-2)" }}>
                    {TYPE_LABEL[t]}
                  </span>
                  <span
                    style={{
                      color: deltaColor(totals[t]),
                      fontWeight: 500,
                    }}
                  >
                    {fmtSigned(totals[t])}
                  </span>
                </span>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <div style={{ display: "flex" }}>
                {[
                  ["all", "TODOS"],
                  ["braking", "FREADAS"],
                  ["exit", "SAÍDAS"],
                  ["straight", "RETAS"],
                ].map(([v, l], i, arr) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setTypeFilter(v)}
                    className="mono"
                    style={{
                      ...pillStyle(typeFilter === v),
                      borderLeft: i === 0 ? "1px solid var(--bd-1)" : "none",
                    }}
                  >
                    {l}
                  </button>
                ))}
              </div>
              <div style={{ display: "flex" }}>
                {[
                  ["loss", "MAIOR PERDA"],
                  ["track", "ORDEM DA PISTA"],
                ].map(([v, l], i) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setSortMode(v)}
                    className="mono"
                    style={{
                      ...pillStyle(sortMode === v),
                      borderLeft: i === 0 ? "1px solid var(--bd-1)" : "none",
                    }}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Grid de cards */}
          <div
            style={{
              padding: 14,
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
              gap: 12,
            }}
          >
            {rows.map((seg, i) => (
              <SegmentCard
                key={`${seg.from}-${seg.to}-${i}`}
                seg={seg}
                telemetry={referenceTelemetry || telemetry}
                onClick={() => setSelectedSeg(seg)}
              />
            ))}
            {rows.length === 0 && (
              <div
                style={{
                  padding: "40px 0",
                  textAlign: "center",
                  gridColumn: "1 / -1",
                }}
                className="mono"
              >
                <span
                  style={{
                    fontSize: 10,
                    letterSpacing: "0.18em",
                    color: "var(--tx-3)",
                  }}
                >
                  SEM SEGMENTOS NESSE FILTRO
                </span>
              </div>
            )}
          </div>
        </>
      )}
    </Modal>
  );
}
