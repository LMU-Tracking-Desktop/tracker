// app-screens-2.jsx — SessionDetail, Telemetry, Replay3D
const { SESSIONS: S2, fmtLap: fL2, fmtSector: fS2, fmtDate: fD2, fmtDelta: fDL2, buildChannels: bC2 } = window.LMU_DATA;
const { ChartPanel: CP2, ChannelChart: CC2, TrackMap: TM2, StatCard: SC2, pathFromPairs: pFP2 } = window.APP_CHARTS;
const { PageHeader: PH2, ClassPill: CL2, TypePill: TP2 } = window.APP_SCREENS;

// =================== SESSION DETAIL ===================
function SessionDetailScreen({ navigate, params }) {
  const session = S2.find((s) => s.id === params.id) || S2[0];
  const [hoverLap, setHoverLap] = uS(null);
  const lapTimes = session.laps.map((l) => l.ms);
  const validLaps = session.laps.filter((l) => l.valid);
  const minMs = Math.min(...validLaps.map((l) => l.ms));
  const maxMs = Math.max(...validLaps.map((l) => l.ms));
  const avgMs = session.avgMs;
  const sigma = (() => {
    if (validLaps.length < 2) return 0;
    const m = avgMs;
    const v = validLaps.reduce((a, l) => a + (l.ms - m) ** 2, 0) / validLaps.length;
    return Math.sqrt(v) / 1000;
  })();
  const fuelUsed = session.laps.reduce((a, l) => a + l.fuelUsed, 0);
  const tireFinal = session.laps.length ? session.laps[session.laps.length - 1].tire : 100;
  const invalidLaps = session.laps.filter((l) => !l.valid).length;

  // chart geometry
  const W = 900, H = 220, padL = 50, padR = 16, padT = 12, padB = 28;
  const innerW = W - padL - padR, innerH = H - padT - padB;
  const yMin = Math.max(minMs - 1500, 0);
  const yMax = Math.max(maxMs + 1500, yMin + 4000);
  const xPos = (i) => padL + (i / Math.max(1, session.laps.length - 1)) * innerW;
  const yPos = (ms) => padT + (1 - (ms - yMin) / (yMax - yMin)) * innerH;

  const lapPath = session.laps.map((l, i) => `${i === 0 ? "M" : "L"} ${xPos(i)} ${yPos(l.ms)}`).join(" ");

  // tire wear chart
  const tireMin = Math.min(...session.laps.map((l) => l.tire), 80);
  const tirePath = session.laps.map((l, i) => `${i === 0 ? "M" : "L"} ${xPos(i)} ${padT + (1 - (l.tire - tireMin) / (100 - tireMin)) * innerH}`).join(" ");
  const tireArea = tirePath + ` L ${xPos(session.laps.length - 1)} ${H - padB} L ${padL} ${H - padB} Z`;

  // fuel chart (descending)
  const fuelPath = session.laps.map((l, i) => `${i === 0 ? "M" : "L"} ${xPos(i)} ${padT + (1 - l.fuel / 120) * innerH}`).join(" ");

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "auto" }}>
      <PH2
        crumbs={[
          { label: "SESSÕES", onClick: () => navigate("sessions") },
          { label: "← TODAS AS SESSÕES", onClick: () => navigate("sessions") },
          { label: session.id },
        ]}
        actions={
          <div style={{ display: "flex", gap: 8 }}>
            <button className="mono" onClick={() => session.bestMs && navigate("telemetry", { sessId: session.id, lapN: session.laps.find(l => l.ms === session.bestMs)?.n || 1 })}
              style={{ padding: "6px 12px", fontSize: 10, letterSpacing: ".14em", background: "var(--accent)", color: "var(--accent-ink)", border: "none", fontWeight: 600 }}>
              📊 VER GRÁFICOS →
            </button>
            <button className="mono" onClick={() => session.bestMs && navigate("replay", { sessId: session.id, lapN: session.laps.find(l => l.ms === session.bestMs)?.n || 1 })}
              style={{ padding: "6px 12px", fontSize: 10, letterSpacing: ".14em", background: "transparent", color: "var(--tx-1)", border: "1px solid var(--bd-1)" }}>
              ▶ REPLAY 3D
            </button>
          </div>
        }
      />

      {/* session header card */}
      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: "var(--gap)", padding: "var(--pad)" }}>
        <div style={{ background: "var(--bg-1)", border: "1px solid var(--bd-0)", padding: "var(--pad)", display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <TP2 type={session.type} />
            <span className="mono" style={{ fontSize: 10, color: "var(--tx-3)", letterSpacing: ".14em" }}>{fD2(session.datetime)}</span>
          </div>
          <div style={{ fontSize: 32, fontWeight: 600, letterSpacing: "-.02em", lineHeight: 1.05 }}>{session.track.name}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div className="mono" style={{ fontSize: 11, color: "var(--tx-1)", padding: "5px 9px", border: "1px solid var(--bd-1)", letterSpacing: ".06em" }}>{session.car.make} {session.car.model}</div>
            <CL2 cls={session.car.class} />
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--gap)" }}>
          <SC2 label="MELHOR VOLTA" value={session.bestMs ? fL2(session.bestMs) : "—"} crit hint={session.bestMs ? `VOLTA ${session.laps.find(l => l.ms === session.bestMs)?.n}` : ""} />
          <SC2 label="MÉDIA" value={avgMs ? fL2(avgMs) : "—"} hint={`Δ +${(((avgMs || 0) - (session.bestMs || 0)) / 1000).toFixed(2)}s`} />
          <SC2 label="VÁLIDAS" value={validLaps.length} hint={`${session.lapCount} VOLTAS`} />
          <SC2 label="INVÁLIDAS" value={invalidLaps} crit hint={`${session.laps.filter(l=>l.touch).length} TOQUES`} />
        </div>
      </div>

      {/* secondary stats row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "var(--gap)", padding: "0 var(--pad) var(--pad)" }}>
        <SC2 label="σ CONSISTÊNCIA" value={sigma.toFixed(2) + "s"} hint={sigma < 1 ? "EXCELENTE" : sigma < 2 ? "BOA" : "INSTÁVEL"} accent={sigma < 1} />
        <SC2 label="COMBUSTÍVEL USADO" value={fuelUsed.toFixed(1) + "L"} hint={`MÉDIA ${(fuelUsed/Math.max(1,session.laps.length)).toFixed(2)}L/VOLTA`} />
        <SC2 label="PNEU FINAL" value={tireFinal.toFixed(1) + "%"} hint={tireFinal > 90 ? "OK" : tireFinal > 80 ? "DESGASTE NORMAL" : "ALTO DESGASTE"} crit={tireFinal < 80} />
        <SC2 label="VOLTAS" value={session.lapCount} hint="LAP-BY-LAP" />
      </div>

      {/* charts: lap times + tire wear */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "var(--gap)", padding: "0 var(--pad) var(--pad)" }}>
        <CP2 title="TEMPO DE VOLTA" right="● AMARELO = TOQUE  ▲ = INVÁLIDA" height={H + 36}>
          <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
            {/* grid */}
            {[0, 1, 2, 3, 4].map((i) => (
              <line key={i} x1={padL} x2={W - padR} y1={padT + (i * innerH) / 4} y2={padT + (i * innerH) / 4} stroke="var(--bd-0)" strokeWidth="1" />
            ))}
            {/* y-axis labels */}
            {[0, 1, 2, 3, 4].map((i) => {
              const ms = yMax - ((yMax - yMin) * i) / 4;
              return <text key={i} x={padL - 6} y={padT + (i * innerH) / 4 + 3} textAnchor="end" fontSize="9" fontFamily="Geist Mono, monospace" fill="var(--tx-3)">{fL2(ms)}</text>;
            })}
            {/* avg line */}
            {avgMs && <line x1={padL} x2={W - padR} y1={yPos(avgMs)} y2={yPos(avgMs)} stroke="var(--tx-3)" strokeDasharray="3 4" strokeWidth=".8" />}
            {avgMs && <text x={W - padR - 4} y={yPos(avgMs) - 3} textAnchor="end" fontSize="9" fontFamily="Geist Mono, monospace" fill="var(--tx-3)">M</text>}
            {/* line + dots */}
            <path d={lapPath} stroke="var(--crit)" strokeWidth="1.4" fill="none" vectorEffect="non-scaling-stroke" />
            {session.laps.map((l, i) => (
              <g key={i}>
                <circle cx={xPos(i)} cy={yPos(l.ms)} r={hoverLap === i ? 5 : 3.5}
                  fill={l.ms === session.bestMs ? "var(--accent)" : "var(--crit)"}
                  stroke={l.ms === session.bestMs ? "var(--accent-ink)" : "var(--bg-1)"} strokeWidth="1.5"
                  onMouseEnter={() => setHoverLap(i)} onMouseLeave={() => setHoverLap(null)}
                  style={{ cursor: "pointer" }} />
                {l.touch && <circle cx={xPos(i)} cy={H - padB + 6} r="2.5" fill="var(--gear)" />}
                {!l.valid && !l.touch && (
                  <polygon points={`${xPos(i) - 3},${H - padB + 9} ${xPos(i) + 3},${H - padB + 9} ${xPos(i)},${H - padB + 4}`} fill="var(--gear)" />
                )}
              </g>
            ))}
            {/* x-axis */}
            {session.laps.map((l, i) => (
              i % 2 === 0 ? <text key={i} x={xPos(i)} y={H - 8} textAnchor="middle" fontSize="9" fontFamily="Geist Mono, monospace" fill="var(--tx-3)">{l.n}</text> : null
            ))}
          </svg>
          {hoverLap != null && (
            <div className="mono" style={{
              position: "absolute", top: 12, right: 16,
              background: "var(--bg-3)", border: "1px solid var(--bd-2)",
              padding: "8px 12px", fontSize: 10, letterSpacing: ".06em",
              display: "flex", flexDirection: "column", gap: 3,
            }}>
              <span style={{ color: "var(--tx-3)" }}>VOLTA {session.laps[hoverLap].n}</span>
              <span style={{ color: session.laps[hoverLap].ms === session.bestMs ? "var(--accent)" : "var(--crit)", fontSize: 14, fontWeight: 600 }}>{fL2(session.laps[hoverLap].ms)}</span>
              <span style={{ color: "var(--tx-2)" }}>S1 {fS2(session.laps[hoverLap].s1)} · S2 {fS2(session.laps[hoverLap].s2)} · S3 {fS2(session.laps[hoverLap].s3)}</span>
            </div>
          )}
        </CP2>

        <CP2 title="DESGASTE DE PNEU" right="MÉDIA (%)" height={H + 36}>
          <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
            {[0, 1, 2, 3, 4].map((i) => (
              <line key={i} x1={padL} x2={W - padR} y1={padT + (i * innerH) / 4} y2={padT + (i * innerH) / 4} stroke="var(--bd-0)" strokeWidth="1" />
            ))}
            {[100, 95, 90, 85, 80].map((v, i) => (
              <text key={v} x={padL - 6} y={padT + (i * innerH) / 4 + 3} textAnchor="end" fontSize="9" fontFamily="Geist Mono, monospace" fill="var(--tx-3)">{v}%</text>
            ))}
            <path d={tireArea} fill="var(--steer)" opacity=".10" />
            <path d={tirePath} stroke="var(--steer)" strokeWidth="1.4" fill="none" vectorEffect="non-scaling-stroke" />
            {session.laps.map((l, i) => (
              <circle key={i} cx={xPos(i)} cy={padT + (1 - (l.tire - tireMin) / (100 - tireMin)) * innerH} r="2.5" fill="var(--steer)" />
            ))}
          </svg>
        </CP2>
      </div>

      {/* fuel + lap-by-lap table */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr", gap: "var(--gap)", padding: "0 var(--pad) var(--pad)" }}>
        <CP2 title="COMBUSTÍVEL" right={`TANQUE ${session.fuelTank}L`} height={H + 36}>
          <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
            {[0, 1, 2, 3, 4].map((i) => (
              <line key={i} x1={padL} x2={W - padR} y1={padT + (i * innerH) / 4} y2={padT + (i * innerH) / 4} stroke="var(--bd-0)" strokeWidth="1" />
            ))}
            {[120, 90, 60, 30, 0].map((v, i) => (
              <text key={v} x={padL - 6} y={padT + (i * innerH) / 4 + 3} textAnchor="end" fontSize="9" fontFamily="Geist Mono, monospace" fill="var(--tx-3)">{v}L</text>
            ))}
            <path d={fuelPath + ` L ${xPos(session.laps.length - 1)} ${H - padB} L ${padL} ${H - padB} Z`} fill="var(--throttle)" opacity=".10" />
            <path d={fuelPath} stroke="var(--throttle)" strokeWidth="1.4" fill="none" vectorEffect="non-scaling-stroke" />
          </svg>
        </CP2>

        <div style={{ background: "var(--bg-1)", border: "1px solid var(--bd-0)", display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--bd-0)" }}>
            <span className="mono" style={{ fontSize: 10, letterSpacing: ".14em", color: "var(--tx-1)" }}>VOLTAS · LAP-BY-LAP</span>
          </div>
          <div style={{ overflow: "auto", maxHeight: H + 36 }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }} className="mono">
              <thead style={{ position: "sticky", top: 0, background: "var(--bg-1)", zIndex: 1 }}>
                <tr style={{ fontSize: 9, letterSpacing: ".14em", color: "var(--tx-3)" }}>
                  {["#","TEMPO","S1","S2","S3","COMB.","PNEU","STATUS"].map((h, i) => (
                    <th key={i} style={{ textAlign: i === 0 ? "left" : (i >= 1 ? "right" : "left"), padding: "8px 12px", fontWeight: 500, borderBottom: "1px solid var(--bd-0)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {session.laps.map((l, i) => (
                  <tr key={i} onClick={() => navigate("telemetry", { sessId: session.id, lapN: l.n })} style={{ borderTop: "1px solid var(--bd-0)", cursor: "pointer", fontSize: 11 }}
                    onMouseEnter={(e) => e.currentTarget.style.background = "var(--bg-2)"}
                    onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
                    <td style={{ padding: "7px 12px", color: "var(--tx-2)" }}>{l.n}</td>
                    <td style={{ padding: "7px 12px", textAlign: "right", color: l.ms === session.bestMs ? "var(--accent)" : (l.valid ? "var(--tx-0)" : "var(--tx-3)"), fontWeight: l.ms === session.bestMs ? 600 : 400 }}>{fL2(l.ms)}</td>
                    <td style={{ padding: "7px 12px", textAlign: "right", color: "var(--tx-2)" }}>{fS2(l.s1)}</td>
                    <td style={{ padding: "7px 12px", textAlign: "right", color: "var(--tx-2)" }}>{fS2(l.s2)}</td>
                    <td style={{ padding: "7px 12px", textAlign: "right", color: "var(--tx-2)" }}>{fS2(l.s3)}</td>
                    <td style={{ padding: "7px 12px", textAlign: "right", color: "var(--tx-2)" }}>{l.fuelUsed.toFixed(2)}L</td>
                    <td style={{ padding: "7px 12px", textAlign: "right", color: l.tire > 90 ? "var(--ok)" : l.tire > 80 ? "var(--gear)" : "var(--crit)" }}>{l.tire.toFixed(1)}%</td>
                    <td style={{ padding: "7px 12px", textAlign: "right", color: l.valid ? "var(--ok)" : "var(--crit)", fontSize: 9, letterSpacing: ".1em" }}>{l.valid ? "OK" : (l.touch ? "TOQUE" : "INVÁLIDA")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

// =================== TELEMETRY ===================
function TelemetryScreen({ navigate, params }) {
  const session = S2.find((s) => s.id === params.sessId) || S2[0];
  const [lapN, setLapN] = uS(params.lapN || (session.laps[0] && session.laps[0].n) || 1);
  const [compareN, setCompareN] = uS(null);
  const [hoverX, setHoverX] = uS(null);

  const lap = session.laps.find((l) => l.n === lapN) || session.laps[0];
  const compareLap = compareN != null ? session.laps.find((l) => l.n === compareN) : null;
  const channels = uM(() => bC2(parseInt(session.id.slice(1)) * 100 + lapN, session.track.length), [lapN, session.id]);
  const compareChannels = uM(() => compareLap ? bC2(parseInt(session.id.slice(1)) * 100 + compareLap.n, session.track.length) : null, [compareLap, session.id]);

  const sectorTs = session.track.sectors.map((s) => s / session.track.length);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "auto" }}>
      <PH2
        crumbs={[
          { label: "SESSÕES", onClick: () => navigate("sessions") },
          { label: "← VOLTAR À SESSÃO", onClick: () => navigate("session", { id: session.id }) },
          { label: "TELEMETRIA" },
        ]}
        actions={
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span className="mono" style={{ fontSize: 10, letterSpacing: ".14em", color: "var(--accent)", padding: "3px 8px", border: "1px solid var(--accent)" }}>TELEMETRIA</span>
            <span className="mono" style={{ fontSize: 11, letterSpacing: ".06em", color: "var(--tx-1)" }}>{session.track.short} · {session.car.make}</span>
            <button className="mono" onClick={() => navigate("replay", { sessId: session.id, lapN: lap.n })} style={{
              marginLeft: 8, padding: "5px 10px", fontSize: 10, letterSpacing: ".14em",
              background: "transparent", color: "var(--tx-1)", border: "1px solid var(--bd-1)",
            }}>▶ 3D</button>
          </div>
        }
      />

      {/* lap selectors */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: "var(--gap)", padding: "var(--pad)", alignItems: "end" }}>
        <div>
          <div className="mono" style={{ fontSize: 10, letterSpacing: ".14em", color: "var(--tx-2)", marginBottom: 6 }}>VOLTA</div>
          <select value={lapN} onChange={(e) => setLapN(parseInt(e.target.value))}
            className="mono" style={{
              width: "100%", padding: "10px 12px", background: "var(--bg-1)", color: "var(--tx-0)",
              border: "1px solid var(--bd-1)", fontSize: 11, letterSpacing: ".05em",
            }}>
            {session.laps.map((l) => (
              <option key={l.n} value={l.n}>VOLTA {l.n} · {fL2(l.ms)}{l.ms === session.bestMs ? " (BEST)" : ""}{!l.valid ? " (INV)" : ""}</option>
            ))}
          </select>
        </div>
        <div>
          <div className="mono" style={{ fontSize: 10, letterSpacing: ".14em", color: "var(--tx-2)", marginBottom: 6 }}>COMPARAR COM</div>
          <select value={compareN || ""} onChange={(e) => setCompareN(e.target.value ? parseInt(e.target.value) : null)}
            className="mono" style={{
              width: "100%", padding: "10px 12px", background: "var(--bg-1)", color: "var(--tx-0)",
              border: "1px solid var(--bd-1)", fontSize: 11, letterSpacing: ".05em",
            }}>
            <option value="">— NENHUMA —</option>
            {session.laps.filter((l) => l.n !== lap.n).map((l) => (
              <option key={l.n} value={l.n}>VOLTA {l.n} · {fL2(l.ms)}</option>
            ))}
          </select>
        </div>
        <button className="mono" style={{
          padding: "10px 16px", fontSize: 11, letterSpacing: ".14em",
          background: "transparent", color: "var(--tx-1)", border: "1px solid var(--bd-1)",
        }}>📁 IMPORTAR</button>
      </div>

      {/* main: charts grid + track map sidebar */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 320px", gap: "var(--gap)", padding: "0 var(--pad) var(--pad)" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--gap)" }}>
          <CC2 label="THROTTLE" color="var(--throttle)" values={channels.throttle} distance={channels.distance} length={channels.length} sectors={session.track.sectors} ymin={0} ymax={1} />
          <CC2 label="BRAKE" color="var(--brake)" values={channels.brake} distance={channels.distance} length={channels.length} sectors={session.track.sectors} ymin={0} ymax={1} />
          <CC2 label="STEERING" color="var(--steer)" values={channels.steer} distance={channels.distance} length={channels.length} sectors={session.track.sectors} ymin={-1} ymax={1} signed />
          <CC2 label="VELOCIDADE" color="var(--speed)" values={channels.speed} distance={channels.distance} length={channels.length} sectors={session.track.sectors} ymin={50} ymax={310} unit="km/h" />
          <CC2 label="MARCHA" color="var(--gear)" values={channels.gear} distance={channels.distance} length={channels.length} sectors={session.track.sectors} ymin={1} ymax={8} unit="" hardLine />
          <CC2 label="RPM" color="var(--rpm)" values={channels.rpm} distance={channels.distance} length={channels.length} sectors={session.track.sectors} ymin={2000} ymax={9500} unit="rpm" />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "var(--gap)", position: "sticky", top: 0, height: "fit-content" }}>
          <div style={{ background: "var(--bg-1)", border: "1px solid var(--bd-0)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderBottom: "1px solid var(--bd-0)" }}>
              <span className="mono" style={{ fontSize: 10, letterSpacing: ".14em", color: "var(--tx-1)" }}>TRAÇADO</span>
              <span className="mono" style={{ fontSize: 9, letterSpacing: ".14em", color: "var(--tx-3)" }}>RESETAR</span>
            </div>
            <div style={{ padding: 10 }}>
              <TM2 trackId={session.track.id} carT={-1} sectors={sectorTs} height={200} />
            </div>
            <div className="mono" style={{ padding: "8px 14px", borderTop: "1px solid var(--bd-0)", fontSize: 9, color: "var(--tx-3)", letterSpacing: ".14em", textAlign: "center" }}>
              SCROLL = ZOOM · ARRASTAR = PAN
            </div>
          </div>

          <div style={{ background: "var(--bg-1)", border: "1px solid var(--bd-0)", padding: "var(--pad)" }}>
            <div className="mono" style={{ fontSize: 10, letterSpacing: ".14em", color: "var(--tx-2)", marginBottom: 10 }}>VOLTA · {lap.n}</div>
            <div className="mono" style={{ fontSize: 26, fontWeight: 600, color: lap.ms === session.bestMs ? "var(--accent)" : "var(--crit)", letterSpacing: "-.01em" }}>{fL2(lap.ms)}</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 14 }}>
              {[["S1", lap.s1], ["S2", lap.s2], ["S3", lap.s3]].map(([k, v]) => (
                <div key={k}>
                  <div className="mono" style={{ fontSize: 9, color: "var(--tx-3)", letterSpacing: ".14em" }}>{k}</div>
                  <div className="mono" style={{ fontSize: 13, color: "var(--tx-0)", fontWeight: 500 }}>{fS2(v)}</div>
                </div>
              ))}
            </div>
            {compareLap && (
              <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--bd-0)" }}>
                <div className="mono" style={{ fontSize: 10, letterSpacing: ".14em", color: "var(--tx-2)" }}>vs VOLTA {compareLap.n}</div>
                <div className="mono" style={{ fontSize: 22, fontWeight: 600, color: lap.ms < compareLap.ms ? "var(--ok)" : "var(--crit)" }}>
                  {fDL2(lap.ms - compareLap.ms)}s
                </div>
              </div>
            )}
          </div>

          <div style={{ background: "var(--bg-1)", border: "1px solid var(--bd-0)", padding: "var(--pad)" }}>
            <div className="mono" style={{ fontSize: 10, letterSpacing: ".14em", color: "var(--tx-2)", marginBottom: 10 }}>CANAIS · MIN/MAX</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }} className="mono">
              {[
                ["THROTTLE MAX", `${Math.round(Math.max(...channels.throttle) * 100)}%`, "var(--throttle)"],
                ["BRAKE MAX", `${Math.round(Math.max(...channels.brake) * 100)}%`, "var(--brake)"],
                ["VEL. MAX", `${Math.round(Math.max(...channels.speed))} km/h`, "var(--speed)"],
                ["VEL. MIN", `${Math.round(Math.min(...channels.speed))} km/h`, "var(--tx-2)"],
                ["RPM MAX", `${Math.round(Math.max(...channels.rpm))}`, "var(--rpm)"],
              ].map(([k, v, c]) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                  <span style={{ color: "var(--tx-3)", letterSpacing: ".06em" }}>{k}</span>
                  <span style={{ color: c, fontWeight: 500 }}>{v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// =================== REPLAY 3D ===================
function Replay3DScreen({ navigate, params }) {
  const session = S2.find((s) => s.id === params.sessId) || S2[0];
  const lapN = params.lapN || 1;
  const lap = session.laps.find((l) => l.n === lapN) || session.laps[0];
  const channels = uM(() => bC2(parseInt(session.id.slice(1)) * 100 + lap.n, session.track.length), [lap.n, session.id]);
  const totalSec = lap.ms / 1000;

  const [t, setT] = uS(0); // 0..1
  const [playing, setPlaying] = uS(false);
  const [speed, setSpeed] = uS(1);
  const [view, setView] = uS("3d");
  const [camera, setCamera] = uS("chase");

  uE(() => {
    if (!playing) return;
    let raf;
    let last = performance.now();
    const tick = (now) => {
      const dt = (now - last) / 1000;
      last = now;
      setT((prev) => {
        const next = prev + (dt * speed) / totalSec;
        return next >= 1 ? 0 : next;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, totalSec]);

  const idx = Math.floor(t * (channels.distance.length - 1));
  const curSpd = channels.speed[idx];
  const curThr = channels.throttle[idx];
  const curBrk = channels.brake[idx];
  const curStr = channels.steer[idx];
  const curGear = channels.gear[idx];
  const curRpm = channels.rpm[idx];
  const curDist = channels.distance[idx];
  const curTime = t * totalSec;

  // 3D-ish perspective car (stylized rectangle as user requested)
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: "1px solid var(--bd-0)", background: "var(--bg-1)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button className="mono" onClick={() => navigate("telemetry", { sessId: session.id, lapN: lap.n })} style={{
            padding: "5px 10px", fontSize: 10, letterSpacing: ".14em", background: "transparent",
            color: "var(--tx-1)", border: "1px solid var(--bd-1)",
          }}>← VOLTAR</button>
          <span className="mono" style={{ fontSize: 10, letterSpacing: ".14em", color: "var(--accent)" }}>REPLAY 3D</span>
          <span className="mono" style={{ fontSize: 10, letterSpacing: ".14em", color: "var(--tx-3)" }}>·</span>
          <span className="mono" style={{ fontSize: 10, letterSpacing: ".14em", color: "var(--tx-1)" }}>{session.track.short} · {session.car.make} · VOLTA {lap.n}</span>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {["chase", "tv", "top"].map((c) => (
            <button key={c} className="mono" onClick={() => setCamera(c)} style={{
              padding: "5px 10px", fontSize: 10, letterSpacing: ".14em",
              background: camera === c ? "var(--bg-3)" : "transparent",
              color: camera === c ? "var(--accent)" : "var(--tx-2)",
              border: "1px solid " + (camera === c ? "var(--accent)" : "var(--bd-1)"),
            }}>{c.toUpperCase()}</button>
          ))}
          <span style={{ width: 12 }}></span>
          {["2d", "3d"].map((v) => (
            <button key={v} className="mono" onClick={() => setView(v)} style={{
              padding: "5px 10px", fontSize: 10, letterSpacing: ".14em",
              background: view === v ? "var(--accent)" : "transparent",
              color: view === v ? "var(--accent-ink)" : "var(--tx-2)",
              border: "1px solid " + (view === v ? "var(--accent)" : "var(--bd-1)"),
              fontWeight: view === v ? 600 : 400,
            }}>{v.toUpperCase()}</button>
          ))}
        </div>
      </div>

      {/* viewport */}
      <div style={{ flex: 1, position: "relative", background: "linear-gradient(180deg, #050505 0%, #000 70%, #0a0a0a 100%)", overflow: "hidden", minHeight: 0 }}>
        {view === "3d" ? <ThreeDViewport channels={channels} t={t} camera={camera} /> : <TwoDViewport track={session.track} t={t} channels={channels} />}

        {/* HUD overlays */}
        <div style={{ position: "absolute", top: 16, left: 16, display: "flex", flexDirection: "column", gap: 10 }}>
          <HUDValue label="VELOCIDADE" value={Math.round(curSpd)} unit="km/h" big color="var(--crit)" />
          <HUDValue label="MARCHA" value={curGear} unit="" big color="var(--gear)" />
        </div>

        <div style={{ position: "absolute", top: 16, right: 16, display: "flex", flexDirection: "column", gap: 10, alignItems: "flex-end" }}>
          <HUDValue label="VOLTA · TEMPO" value={curTime.toFixed(2)} unit="s" mono color="var(--tx-0)" align="right" />
          <HUDValue label="DISTÂNCIA" value={curDist} unit="m" mono color="var(--tx-1)" align="right" />
          <HUDValue label="RPM" value={Math.round(curRpm)} unit="" mono color="var(--rpm)" align="right" />
        </div>

        {/* throttle/brake bars */}
        <div style={{ position: "absolute", bottom: 130, left: 16, display: "flex", flexDirection: "column", gap: 8 }}>
          <BarMeter label="THROTTLE" value={curThr} color="var(--throttle)" />
          <BarMeter label="BRAKE" value={curBrk} color="var(--brake)" />
          <BarMeter label="STEER" value={(curStr + 1) / 2} color="var(--steer)" signed />
        </div>

        {/* mini map */}
        <div style={{ position: "absolute", bottom: 130, right: 16, width: 220, background: "rgba(10,10,10,.7)", border: "1px solid var(--bd-1)", padding: 8 }}>
          <div className="mono" style={{ fontSize: 9, letterSpacing: ".14em", color: "var(--tx-3)", marginBottom: 4 }}>TRAÇADO</div>
          <TM2 trackId={session.track.id} carT={t} sectors={session.track.sectors.map((s) => s / session.track.length)} height={120} />
        </div>
      </div>

      {/* speed chart strip */}
      <div style={{ height: 70, background: "var(--bg-1)", borderTop: "1px solid var(--bd-0)", padding: "6px 16px", position: "relative" }}>
        <svg width="100%" height="58" viewBox="0 0 1000 58" preserveAspectRatio="none">
          <path d={pFP2(channels.distance, channels.speed, 1000, 58, 50, 310)} stroke="var(--speed)" strokeWidth="1" fill="none" vectorEffect="non-scaling-stroke" />
          <path d={pFP2(channels.distance, channels.speed, 1000, 58, 50, 310) + ` L 1000 58 L 0 58 Z`} fill="var(--speed)" opacity=".15" />
          <line x1={t * 1000} x2={t * 1000} y1="0" y2="58" stroke="var(--crit)" strokeWidth="1" />
        </svg>
      </div>

      {/* controls */}
      <div style={{ height: 56, background: "var(--bg-2)", borderTop: "1px solid var(--bd-0)", padding: "0 16px", display: "flex", alignItems: "center", gap: 14 }}>
        <button onClick={() => setPlaying(!playing)} className="mono" style={{
          padding: "7px 14px", fontSize: 11, letterSpacing: ".14em", fontWeight: 600,
          background: playing ? "var(--crit)" : "var(--accent)", color: playing ? "#fff" : "var(--accent-ink)", border: "none",
        }}>{playing ? "❚❚ PAUSA" : "▶ REPRODUZIR"}</button>
        <button onClick={() => setT(0)} className="mono" style={{
          padding: "7px 10px", fontSize: 10, letterSpacing: ".14em",
          background: "transparent", color: "var(--tx-1)", border: "1px solid var(--bd-1)",
        }}>⏮</button>
        <button onClick={() => setT((p) => Math.min(1, p + 0.05))} className="mono" style={{
          padding: "7px 10px", fontSize: 10, letterSpacing: ".14em",
          background: "transparent", color: "var(--tx-1)", border: "1px solid var(--bd-1)",
        }}>▶▶ FRENTE</button>

        <span className="mono" style={{ marginLeft: 8, fontSize: 10, letterSpacing: ".14em", color: "var(--tx-3)" }}>VEL</span>
        <div style={{ display: "flex", gap: 0, border: "1px solid var(--bd-1)" }}>
          {[0.25, 0.5, 1, 2, 4].map((v) => (
            <button key={v} onClick={() => setSpeed(v)} className="mono" style={{
              padding: "6px 10px", fontSize: 10, letterSpacing: ".05em",
              background: speed === v ? "var(--bg-3)" : "transparent",
              color: speed === v ? "var(--accent)" : "var(--tx-2)",
              border: "none", borderRight: "1px solid var(--bd-1)",
            }}>{v}×</button>
          ))}
        </div>

        <div style={{ flex: 1 }} />
        <span className="mono" style={{ fontSize: 11, letterSpacing: ".06em", color: "var(--tx-1)" }}>
          {curTime.toFixed(2)}s / {totalSec.toFixed(2)}s
        </span>
      </div>
    </div>
  );
}

function HUDValue({ label, value, unit, big, mono, color, align = "left" }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2, alignItems: align === "right" ? "flex-end" : "flex-start" }}>
      <span className="mono" style={{ fontSize: 9, letterSpacing: ".18em", color: "var(--tx-3)" }}>{label}</span>
      <div style={{ display: "flex", gap: 6, alignItems: "baseline" }}>
        <span className={mono ? "mono" : "mono"} style={{ fontSize: big ? 38 : 18, fontWeight: 600, color, lineHeight: 1, letterSpacing: "-.01em" }}>{value}</span>
        {unit && <span className="mono" style={{ fontSize: 10, letterSpacing: ".14em", color: "var(--tx-2)" }}>{unit}</span>}
      </div>
    </div>
  );
}
function BarMeter({ label, value, color, signed }) {
  return (
    <div style={{ width: 200, display: "flex", alignItems: "center", gap: 10 }}>
      <span className="mono" style={{ fontSize: 9, letterSpacing: ".14em", color: "var(--tx-3)", width: 60 }}>{label}</span>
      <div style={{ flex: 1, height: 6, background: "var(--bg-3)", border: "1px solid var(--bd-1)", position: "relative", overflow: "hidden" }}>
        {signed ? (
          <div style={{
            position: "absolute", height: "100%",
            width: `${Math.abs(value - 0.5) * 100}%`,
            left: value > 0.5 ? "50%" : `${value * 100}%`,
            background: color,
          }} />
        ) : (
          <div style={{ width: `${value * 100}%`, height: "100%", background: color }} />
        )}
      </div>
    </div>
  );
}

function TwoDViewport({ track, t, channels }) {
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: "70%", maxWidth: 800 }}>
        <TM2 trackId={track.id} carT={t} sectors={track.sectors.map((s) => s / track.length)} height={400} glow />
      </div>
    </div>
  );
}

// stylized 3D-ish viewport using CSS perspective + SVG
function ThreeDViewport({ channels, t, camera }) {
  const idx = Math.floor(t * (channels.distance.length - 1));
  const curStr = channels.steer[idx];
  const curSpd = channels.speed[idx];

  // animated horizon grid
  const gridOffset = (t * channels.length * 4) % 60;

  return (
    <div style={{
      width: "100%", height: "100%", position: "relative",
      perspective: "800px", overflow: "hidden",
    }}>
      {/* horizon */}
      <div style={{
        position: "absolute", left: 0, right: 0, top: "45%", height: 1,
        background: "linear-gradient(90deg, transparent, var(--bd-2) 30%, var(--bd-2) 70%, transparent)",
      }} />

      {/* sky gradient */}
      <div style={{
        position: "absolute", left: 0, right: 0, top: 0, height: "45%",
        background: "radial-gradient(ellipse at 50% 100%, rgba(214,255,0,.08), transparent 60%)",
      }} />

      {/* perspective ground grid */}
      <svg width="100%" height="100%" style={{ position: "absolute", inset: 0 }} viewBox="0 0 1000 600" preserveAspectRatio="none">
        <defs>
          <linearGradient id="grdFade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--bd-1)" stopOpacity="0" />
            <stop offset="40%" stopColor="var(--bd-1)" stopOpacity=".5" />
            <stop offset="100%" stopColor="var(--bd-2)" stopOpacity=".9" />
          </linearGradient>
        </defs>
        {/* ground horizontal lines (perspective) */}
        {Array.from({ length: 16 }).map((_, i) => {
          const ratio = (i + (gridOffset / 60)) / 16;
          const y = 270 + ratio * ratio * 330;
          const op = 0.1 + ratio * 0.5;
          return <line key={i} x1="0" x2="1000" y1={y} y2={y} stroke="var(--bd-1)" strokeWidth="1" opacity={op} />;
        })}
        {/* ground vertical lines (vanishing) */}
        {Array.from({ length: 21 }).map((_, i) => {
          const x = (i / 20) * 1000;
          const cx = 500 + curStr * 60;
          return <line key={i} x1={cx} x2={x} y1="270" y2="600" stroke="var(--bd-1)" strokeWidth=".7" opacity=".4" />;
        })}
        {/* track surface (a wedge ahead of the car) */}
        <path d={`M ${500 + curStr*60} 270 L ${380 + curStr*200} 600 L ${620 + curStr*200} 600 Z`}
          fill="#0e0e0e" stroke="var(--bd-2)" strokeWidth="1" />
        {/* track edges */}
        <line x1={500 + curStr*60} y1="270" x2={380 + curStr*200} y2="600" stroke="var(--accent)" strokeWidth="1" opacity=".4" />
        <line x1={500 + curStr*60} y1="270" x2={620 + curStr*200} y2="600" stroke="var(--accent)" strokeWidth="1" opacity=".4" />
        {/* track center stripes */}
        {Array.from({ length: 7 }).map((_, i) => {
          const ratio = (i + (gridOffset / 60)) / 7;
          const y = 270 + ratio * ratio * 330;
          const cx = (500 + curStr * 60) + (((500 + curStr * 60) - (500 + curStr*200)) * (-(ratio * ratio)));
          // simpler — straight stripes from vanishing point
          const sy = 270 + ratio * 330;
          const sx = (500 + curStr*60) + ((500 + curStr*200) - (500 + curStr*60)) * ratio;
          return <line key={i} x1={sx - 12} x2={sx + 12} y1={y} y2={y} stroke="var(--accent)" strokeWidth="1.5" opacity=".5" />;
        })}
      </svg>

      {/* car silhouette (rectangle as requested) */}
      <div style={{
        position: "absolute",
        left: "50%", bottom: "12%",
        transform: `translateX(-50%) translateX(${curStr * -80}px)`,
        width: 120, height: 60,
      }}>
        {/* shadow */}
        <div style={{
          position: "absolute", inset: "auto -10px -8px -10px",
          height: 14, background: "radial-gradient(ellipse at center, rgba(0,0,0,.7), transparent 70%)",
        }} />
        {/* car body */}
        <div style={{
          width: "100%", height: "100%",
          background: "linear-gradient(180deg, #1a1a1a 0%, #0a0a0a 100%)",
          border: "1.5px solid var(--accent)",
          position: "relative",
          boxShadow: "0 0 30px rgba(214,255,0,.15)",
        }}>
          {/* windscreen */}
          <div style={{
            position: "absolute", top: 6, left: 18, right: 18, height: 16,
            background: "rgba(74,214,255,.15)", borderTop: "1px solid var(--steer)",
          }} />
          {/* number/livery */}
          <div className="mono" style={{
            position: "absolute", top: 26, left: 0, right: 0, textAlign: "center",
            fontSize: 9, color: "var(--accent)", letterSpacing: ".2em", fontWeight: 600,
          }}>LMU</div>
          {/* taillights */}
          <div style={{ position: "absolute", bottom: 4, left: 8, width: 10, height: 3, background: "var(--crit)" }} />
          <div style={{ position: "absolute", bottom: 4, right: 8, width: 10, height: 3, background: "var(--crit)" }} />
        </div>
      </div>

      {/* corner notice */}
      <div className="mono" style={{
        position: "absolute", bottom: 16, left: "50%", transform: "translateX(-50%)",
        fontSize: 9, letterSpacing: ".18em", color: "var(--tx-3)",
      }}>● PLACEHOLDER · MODELO 3D REAL DO CARRO É RENDERIZADO NO APP</div>
    </div>
  );
}

window.APP_SCREENS_2 = { SessionDetailScreen, TelemetryScreen, Replay3DScreen };
