import { useEffect, useState } from "react";
import PageHeader from "../components/PageHeader.jsx";

const WIDGETS = [
  {
    id: "delta",
    name: "Delta",
    desc: "Numero grande do delta cumulativo (+/- vs volta de referencia)",
  },
  {
    id: "strip",
    name: "Faixa de micro-setores",
    desc: "Tira colorida mostrando onde voce ganha (verde) ou perde (vermelho) tempo na volta",
  },
  {
    id: "trecho",
    name: "Delta de trecho",
    desc: "Numero do delta do ultimo micro-setor completado",
  },
  {
    id: "pedals",
    name: "Pedais",
    desc: "Barras de throttle (verde) e brake (vermelho) em tempo real",
  },
  {
    id: "trailing",
    name: "Trailing (historico)",
    desc: "Grafico dos ultimos 10s de inputs. Pode sobrepor a referencia da melhor volta",
    extras: ["showReference"],
  },
  {
    id: "tires",
    name: "Status dos pneus",
    desc: "Desgaste das 4 rodas (verde / amarelo / vermelho)",
  },
];

function Toggle({ checked, onChange, label }) {
  return (
    <label
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        cursor: "pointer",
        userSelect: "none",
      }}
    >
      <span
        style={{
          width: 32,
          height: 18,
          background: checked ? "var(--accent)" : "var(--bd-1)",
          borderRadius: 9,
          position: "relative",
          transition: "background 0.15s",
          flexShrink: 0,
        }}
      >
        <span
          style={{
            position: "absolute",
            top: 2,
            left: checked ? 16 : 2,
            width: 14,
            height: 14,
            background: checked ? "var(--accent-ink)" : "var(--tx-1)",
            borderRadius: "50%",
            transition: "left 0.15s, background 0.15s",
          }}
        />
      </span>
      <span style={{ fontSize: 11, color: "var(--tx-1)" }}>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{ display: "none" }}
      />
    </label>
  );
}

function WidgetCard({ widget, def, onUpdate }) {
  const enabled = !!widget?.enabled;
  const sessions = widget?.sessions || {};

  const update = (partial) => onUpdate(def.id, partial);

  return (
    <div
      style={{
        background: "var(--bg-1)",
        border: "1px solid var(--bd-0)",
        opacity: enabled ? 1 : 0.55,
        transition: "opacity 0.15s",
      }}
    >
      <div
        style={{
          padding: "12px 16px",
          borderBottom: enabled ? "1px solid var(--bd-0)" : "none",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div style={{ flex: 1 }}>
          <div
            className="mono"
            style={{
              fontSize: 12,
              letterSpacing: "0.1em",
              color: "var(--tx-0)",
              fontWeight: 600,
              textTransform: "uppercase",
            }}
          >
            {def.name}
          </div>
          <div
            style={{
              fontSize: 11,
              color: "var(--tx-2)",
              marginTop: 4,
              maxWidth: 540,
            }}
          >
            {def.desc}
          </div>
        </div>
        <Toggle
          checked={enabled}
          onChange={(v) => update({ enabled: v })}
          label={enabled ? "ATIVO" : "INATIVO"}
        />
      </div>

      {enabled && (
        <div
          style={{
            padding: "12px 16px",
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <div
            className="mono"
            style={{
              fontSize: 9,
              letterSpacing: "0.18em",
              color: "var(--tx-3)",
            }}
          >
            APARECER EM
          </div>
          <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
            <Toggle
              checked={sessions.practice !== false}
              onChange={(v) =>
                update({ sessions: { ...sessions, practice: v } })
              }
              label="PRACTICE"
            />
            <Toggle
              checked={sessions.qualy !== false}
              onChange={(v) => update({ sessions: { ...sessions, qualy: v } })}
              label="QUALY"
            />
            <Toggle
              checked={sessions.race !== false}
              onChange={(v) => update({ sessions: { ...sessions, race: v } })}
              label="CORRIDA"
            />
          </div>

          <div
            style={{
              marginTop: 4,
              paddingTop: 10,
              borderTop: "1px solid var(--bd-0)",
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}
          >
            <span
              className="mono"
              style={{
                fontSize: 9,
                letterSpacing: "0.18em",
                color: "var(--tx-3)",
                width: 70,
              }}
            >
              TAMANHO
            </span>
            <input
              type="range"
              min={0.5}
              max={2}
              step={0.05}
              value={widget?.scale ?? 1}
              onChange={(e) => update({ scale: parseFloat(e.target.value) })}
              style={{ flex: 1, accentColor: "var(--accent)" }}
            />
            <span
              className="mono"
              style={{
                fontSize: 11,
                color: "var(--tx-1)",
                fontVariantNumeric: "tabular-nums",
                width: 48,
                textAlign: "right",
              }}
            >
              {Math.round((widget?.scale ?? 1) * 100)}%
            </span>
            <button
              className="btn"
              onClick={() => update({ scale: 1 })}
              style={{ padding: "4px 8px", fontSize: 9 }}
              title="Reset para 100%"
            >
              RESET
            </button>
          </div>

          {def.extras?.includes("showReference") && (
            <div
              style={{
                marginTop: 4,
                paddingTop: 10,
                borderTop: "1px solid var(--bd-0)",
              }}
            >
              <Toggle
                checked={widget?.showReference !== false}
                onChange={(v) => update({ showReference: v })}
                label="MOSTRAR DADOS DA MELHOR VOLTA NO FUNDO"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function Overlays() {
  const [widgets, setWidgets] = useState(null);
  // Otimista: assume on/edit-off enquanto fetch nao retorna. Sem isso o botao
  // renderiza "DESLIGADO" e clicar toggla pra false (porque !undefined ?? true).
  const [overlayState, setOverlayState] = useState({
    enabled: true,
    edit: false,
  });

  async function refresh() {
    const [w, s] = await Promise.all([
      window.api?.getOverlayWidgets?.(),
      window.api?.getOverlayState?.(),
    ]);
    setWidgets(w || null);
    if (s) setOverlayState(s);
  }

  useEffect(() => {
    refresh();
  }, []);

  async function update(id, partial) {
    setWidgets((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        [id]: {
          ...prev[id],
          ...partial,
          sessions: {
            ...(prev[id]?.sessions || {}),
            ...(partial.sessions || {}),
          },
        },
      };
    });
    await window.api?.setOverlayWidget?.(id, partial);
  }

  async function toggleEnabled() {
    const next = !overlayState.enabled;
    await window.api?.setOverlayEnabled?.(next);
    setOverlayState((s) => ({ ...s, enabled: next, edit: next ? s.edit : false }));
  }

  async function toggleEdit() {
    const next = !overlayState.edit;
    await window.api?.setOverlayEdit?.(next);
    setOverlayState((s) => ({ ...s, edit: next }));
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflow: "auto",
      }}
    >
      <PageHeader crumbs={[{ label: "OVERLAYS" }]} />

      <div
        style={{
          padding: "var(--pad)",
          display: "flex",
          flexDirection: "column",
          gap: "var(--gap)",
          maxWidth: 760,
        }}
      >
        {/* Controles globais */}
        <div
          style={{
            background: "var(--bg-1)",
            border: "1px solid var(--bd-0)",
            padding: "12px 16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <div>
            <div
              className="mono"
              style={{
                fontSize: 11,
                letterSpacing: "0.14em",
                color: "var(--tx-1)",
              }}
            >
              OVERLAY IN-GAME
            </div>
            <div
              style={{ fontSize: 11, color: "var(--tx-2)", marginTop: 4 }}
            >
              Aparece automaticamente quando voce esta dirigindo. Use o modo
              EDITAR pra reposicionar os widgets.
            </div>
            {overlayState?.refLapTime != null && (
              <div
                className="mono"
                style={{
                  fontSize: 10,
                  letterSpacing: "0.1em",
                  color: "var(--tx-3)",
                  marginTop: 6,
                }}
              >
                ref: {fmt(overlayState.refLapTime)}{" "}
                {overlayState.refSource &&
                  `(${overlayState.refSource === "self" ? "voce" : overlayState.refOwner || "import"})`}
              </div>
            )}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              className={overlayState?.enabled ? "btn solid" : "btn"}
              onClick={toggleEnabled}
            >
              {overlayState?.enabled ? "LIGADO" : "DESLIGADO"}
            </button>
            <button
              className={overlayState?.edit ? "btn solid" : "btn"}
              onClick={toggleEdit}
              disabled={!overlayState?.enabled}
              style={{ opacity: overlayState?.enabled ? 1 : 0.5 }}
            >
              {overlayState?.edit ? "EDITANDO" : "EDITAR POSICAO"}
            </button>
          </div>
        </div>

        {/* Widgets */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {WIDGETS.map((def) => (
            <WidgetCard
              key={def.id}
              widget={widgets?.[def.id]}
              def={def}
              onUpdate={update}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function fmt(t) {
  if (t == null || t <= 0) return "—";
  const m = Math.floor(t / 60);
  const s = (t % 60).toFixed(3).padStart(6, "0");
  return `${m}:${s}`;
}
