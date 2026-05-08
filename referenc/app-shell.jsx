// app-shell.jsx — sidebar nav + router + tweaks + toasts
const { HomeScreen, SessionsScreen } = window.APP_SCREENS;
const { SessionDetailScreen, TelemetryScreen, Replay3DScreen } = window.APP_SCREENS_2;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "density": "balanced",
  "sidebar": "wide",
  "accent": "#d6ff00"
}/*EDITMODE-END*/;

const ACCENT_OPTIONS = ["#d6ff00", "#ff3b3b", "#4ad6ff", "#fbbf24"];

const NAV = [
  { id: "home", label: "HOME", route: "home" },
  { id: "listing", label: "LISTAGEM", route: "listing" },
  { id: "sessions", label: "SESSÕES", route: "sessions" },
  { id: "dashboard", label: "DASHBOARD", route: "dashboard" },
  { id: "logs", label: "LOGS", route: "logs" },
  { id: "settings", label: "SETTINGS", route: "settings" },
];

function Sidebar({ active, navigate, density, mode = "wide" }) {
  const thin = mode === "thin";
  return (
    <aside style={{
      width: thin ? 56 : 200,
      background: "var(--bg-1)", borderRight: "1px solid var(--bd-0)",
      display: "flex", flexDirection: "column", flexShrink: 0,
      transition: "width .15s ease",
    }}>
      {/* logo */}
      <div style={{
        height: 56, padding: thin ? 12 : "0 16px",
        display: "flex", alignItems: "center", gap: 10,
        borderBottom: "1px solid var(--bd-0)",
      }}>
        <div style={{
          width: 30, height: 30,
          background: "var(--accent)", color: "var(--accent-ink)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontFamily: "Geist Mono", fontSize: 12, fontWeight: 700, letterSpacing: ".06em",
          flexShrink: 0,
        }}>LM</div>
        {!thin && <span className="mono" style={{ fontSize: 11, letterSpacing: ".22em", color: "var(--tx-1)", fontWeight: 600 }}>TIMING</span>}
      </div>

      {/* nav */}
      <nav style={{ display: "flex", flexDirection: "column", padding: thin ? "8px 6px" : "8px 0", flex: 1 }}>
        {NAV.map((n) => {
          const isActive = active === n.id;
          return (
            <button key={n.id} onClick={() => navigate(n.route)} className="mono"
              title={thin ? n.label : undefined}
              style={{
                background: "transparent",
                border: "none",
                borderLeft: thin ? "none" : "2px solid " + (isActive ? "var(--accent)" : "transparent"),
                padding: thin ? "12px 0" : "12px 16px",
                fontSize: 11, letterSpacing: ".14em",
                color: isActive ? "var(--tx-0)" : "var(--tx-2)",
                textAlign: thin ? "center" : "left",
                cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: thin ? "center" : "flex-start", gap: 10,
              }}
              onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.color = "var(--tx-1)"; }}
              onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.color = "var(--tx-2)"; }}
            >
              <span style={{
                width: 6, height: 6,
                background: isActive ? "var(--accent)" : "var(--bd-2)",
                borderRadius: thin ? 0 : 0,
                flexShrink: 0,
              }} />
              {!thin && n.label}
            </button>
          );
        })}
      </nav>

      {/* footer pills */}
      {!thin ? (
        <div style={{ padding: 12, borderTop: "1px solid var(--bd-0)", display: "flex", flexDirection: "column", gap: 8 }}>
          <div className="mono" style={{
            fontSize: 9, letterSpacing: ".18em", padding: "6px 8px",
            color: "var(--crit)", border: "1px solid var(--crit)", textAlign: "center", fontWeight: 600,
          }}>ENDURANCE</div>
          <div className="mono" style={{ fontSize: 9, letterSpacing: ".14em", color: "var(--tx-3)", display: "flex", justifyContent: "space-between", padding: "0 4px" }}>
            <span>V1.0.20</span>
            <span style={{ color: "var(--ok)" }}>● ON</span>
          </div>
        </div>
      ) : (
        <div style={{ padding: 8, borderTop: "1px solid var(--bd-0)" }}>
          <div className="mono" style={{
            fontSize: 9, letterSpacing: ".14em", padding: "6px 0",
            color: "var(--ok)", textAlign: "center",
          }}>●</div>
        </div>
      )}
    </aside>
  );
}

function StatusBar({ route, density }) {
  return (
    <div style={{
      height: 24, background: "var(--bg-1)", borderTop: "1px solid var(--bd-0)",
      display: "flex", alignItems: "center", gap: 14, padding: "0 12px",
    }}>
      <span className="mono" style={{ fontSize: 9, letterSpacing: ".14em", color: "var(--ok)" }}>● PLUGIN OK</span>
      <span className="mono" style={{ fontSize: 9, letterSpacing: ".14em", color: "var(--tx-3)" }}>POLLING 60HZ</span>
      <span className="mono" style={{ fontSize: 9, letterSpacing: ".14em", color: "var(--tx-3)" }}>ROUTE · /{route}</span>
      <span className="mono" style={{ fontSize: 9, letterSpacing: ".14em", color: "var(--tx-3)" }}>DENSITY · {density.toUpperCase()}</span>
      <div style={{ flex: 1 }} />
      <span className="mono" style={{ fontSize: 9, letterSpacing: ".14em", color: "var(--tx-3)" }}>14.4MB · 600 LAPS</span>
      <span className="mono" style={{ fontSize: 9, letterSpacing: ".14em", color: "var(--tx-3)" }}>v1.0.20</span>
    </div>
  );
}

// ============= TOASTS =============
function ToastHost({ toasts, onDismiss }) {
  return (
    <div style={{
      position: "fixed", right: 16, bottom: 48, zIndex: 1000,
      display: "flex", flexDirection: "column", gap: 8, pointerEvents: "none",
    }}>
      {toasts.map((t) => (
        <div key={t.id} style={{
          background: "var(--bg-3)", border: "1px solid var(--bd-2)",
          borderLeft: `3px solid ${t.color || "var(--accent)"}`,
          padding: "10px 14px", minWidth: 280, maxWidth: 360,
          display: "flex", flexDirection: "column", gap: 4,
          pointerEvents: "auto",
          animation: "slideInRight .3s ease",
        }}>
          <div className="mono" style={{ fontSize: 10, letterSpacing: ".14em", color: t.color || "var(--accent)", fontWeight: 600 }}>{t.title}</div>
          {t.body && <div style={{ fontSize: 12, color: "var(--tx-1)", lineHeight: 1.4 }}>{t.body}</div>}
        </div>
      ))}
    </div>
  );
}

// ============= MAIN APP =============
function App() {
  const [route, setRoute] = uS("home");
  const [params, setParams] = uS({});
  const [toasts, setToasts] = uS([]);
  const [tweaksOpen, setTweaksOpen] = uS(false);

  const [tweaks, setTweak] = useTweaks(TWEAK_DEFAULTS);

  // apply tweaks to root
  uE(() => {
    document.documentElement.dataset.density = tweaks.density;
    document.documentElement.dataset.sidebar = tweaks.sidebar;
    document.documentElement.style.setProperty("--accent", tweaks.accent);
    const ink = tweaks.accent === "#d6ff00" || tweaks.accent === "#fbbf24" ? "#0a0a0a" : "#fff";
    document.documentElement.style.setProperty("--accent-ink", ink);
  }, [tweaks.density, tweaks.sidebar, tweaks.accent]);

  // tweaks panel host protocol
  uE(() => {
    const h = (e) => {
      if (e.data?.type === "__activate_edit_mode") setTweaksOpen(true);
      if (e.data?.type === "__deactivate_edit_mode") setTweaksOpen(false);
    };
    window.addEventListener("message", h);
    window.parent.postMessage({ type: "__edit_mode_available" }, "*");
    return () => window.removeEventListener("message", h);
  }, []);

  // toast helpers
  const pushToast = (toast) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((ts) => [...ts, { id, ...toast }]);
    setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== id)), 4500);
  };

  // demo toasts on mount
  uE(() => {
    setTimeout(() => pushToast({ title: "● VOLTA GRAVADA", body: "VOLTA 27 · 1:58.682 · BMW M4 GT3 · PAUL RICARD", color: "var(--accent)" }), 1500);
    setTimeout(() => pushToast({ title: "● PLUGIN INSTALADO", body: "rFactor2 plugin v1.0.20 — telemetria conectada", color: "var(--ok)" }), 4000);
  }, []);

  // demo: random toasts every 18s
  uE(() => {
    const samples = [
      { title: "● VOLTA GRAVADA", body: "VOLTA 14 · 1:59.184 · MERCEDES GT3", color: "var(--accent)" },
      { title: "▲ VOLTA INVÁLIDA", body: "VOLTA 12 · cortou linha de saída · S2", color: "var(--crit)" },
      { title: "● TOQUE DETECTADO", body: "VOLTA 9 · curva 6 · contato leve", color: "var(--gear)" },
      { title: "✓ EXPORT P2P", body: "session-S1.json copiado para clipboard", color: "var(--steer)" },
    ];
    const iv = setInterval(() => {
      pushToast(samples[Math.floor(Math.random() * samples.length)]);
    }, 22000);
    return () => clearInterval(iv);
  }, []);

  const navigate = (r, p = {}) => {
    setRoute(r);
    setParams(p);
  };

  // route active mapping
  const activeNav = ["session", "telemetry", "replay"].includes(route) ? "sessions" : route;

  let content;
  if (route === "home") content = <HomeScreen navigate={navigate} />;
  else if (route === "sessions") content = <SessionsScreen navigate={navigate} />;
  else if (route === "session") content = <SessionDetailScreen navigate={navigate} params={params} />;
  else if (route === "telemetry") content = <TelemetryScreen navigate={navigate} params={params} />;
  else if (route === "replay") content = <Replay3DScreen navigate={navigate} params={params} />;
  else content = <PlaceholderScreen route={route} navigate={navigate} />;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", width: "100vw", background: "var(--bg-0)" }}>
      {/* window chrome */}
      <div style={{
        height: 28, background: "var(--bg-1)", borderBottom: "1px solid var(--bd-0)",
        display: "flex", alignItems: "center", gap: 10, padding: "0 12px", flexShrink: 0,
      }}>
        <div style={{ display: "flex", gap: 7 }}>
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#ff5f56" }} />
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#ffbd2e" }} />
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#27c93f" }} />
        </div>
        <span className="mono" style={{ fontSize: 10, letterSpacing: ".14em", color: "var(--tx-3)", marginLeft: 8 }}>
          LMU TIMING — DESKTOP · v1.0.20
        </span>
        <div style={{ flex: 1 }} />
        <span className="mono" style={{ fontSize: 9, letterSpacing: ".14em", color: "var(--tx-3)" }}>⌘K · COMANDOS</span>
      </div>

      <div style={{ flex: 1, display: "flex", overflow: "hidden", minHeight: 0 }}>
        <Sidebar active={activeNav} navigate={navigate} mode={tweaks.sidebar} density={tweaks.density} />
        <main style={{ flex: 1, minWidth: 0, background: "var(--bg-0)", overflow: "hidden", display: "flex", flexDirection: "column" }}>
          {content}
        </main>
      </div>

      <StatusBar route={route} density={tweaks.density} />

      <ToastHost toasts={toasts} onDismiss={(id) => setToasts((ts) => ts.filter((x) => x.id !== id))} />

      {tweaksOpen && (
        <TweaksPanel onClose={() => setTweaksOpen(false)}>
          <TweakSection title="Layout">
            <TweakRadio label="Sidebar" value={tweaks.sidebar} options={[{ value: "wide", label: "Wide" }, { value: "thin", label: "Thin" }]} onChange={(v) => setTweak("sidebar", v)} />
            <TweakSelect label="Densidade" value={tweaks.density} options={[{ value: "dense", label: "Dense (MoTeC)" }, { value: "balanced", label: "Balanced" }, { value: "airy", label: "Airy" }]} onChange={(v) => setTweak("density", v)} />
          </TweakSection>
          <TweakSection title="Cor de acento">
            <TweakColor label="Accent" value={tweaks.accent} options={ACCENT_OPTIONS} onChange={(v) => setTweak("accent", v)} />
          </TweakSection>
          <TweakSection title="Ações de demo">
            <TweakButton label="Disparar toast: VOLTA GRAVADA" onClick={() => pushToast({ title: "● VOLTA GRAVADA", body: "VOLTA 28 · 1:58.412 · NEW BEST", color: "var(--accent)" })} />
            <TweakButton label="Disparar toast: VOLTA INVÁLIDA" onClick={() => pushToast({ title: "▲ VOLTA INVÁLIDA", body: "VOLTA 28 · saiu da pista · S3", color: "var(--crit)" })} />
          </TweakSection>
        </TweaksPanel>
      )}
    </div>
  );
}

function PlaceholderScreen({ route, navigate }) {
  const titles = { listing: "Listagem", dashboard: "Dashboard", logs: "Logs", settings: "Settings" };
  return (
    <div style={{ padding: 32, height: "100%", overflow: "auto" }}>
      <div className="mono" style={{ fontSize: 10, letterSpacing: ".18em", color: "var(--accent)", marginBottom: 8 }}>EM BREVE</div>
      <h1 style={{ margin: 0, fontSize: 36, fontWeight: 600, letterSpacing: "-.02em" }}>{titles[route] || route}</h1>
      <p style={{ color: "var(--tx-2)", marginTop: 12, maxWidth: 520, fontSize: 14, lineHeight: 1.6 }}>
        Esta tela ainda não foi redesenhada. As 5 telas principais (HOME, SESSÕES, DETALHE, TELEMETRIA, REPLAY 3D) estão prontas — clique em SESSÕES para começar.
      </p>
      <button onClick={() => navigate("sessions")} className="mono" style={{
        marginTop: 24, padding: "10px 18px", fontSize: 11, letterSpacing: ".14em", fontWeight: 600,
        background: "var(--accent)", color: "var(--accent-ink)", border: "none",
      }}>IR PARA SESSÕES →</button>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
