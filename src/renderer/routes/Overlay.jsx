import { useEffect, useMemo, useRef, useState } from "react";
import Pedals from "../components/overlay/Pedals.jsx";
import Delta from "../components/overlay/Delta.jsx";
import SectorStrip from "../components/overlay/SectorStrip.jsx";
import Trecho from "../components/overlay/Trecho.jsx";
import Trailing from "../components/overlay/Trailing.jsx";
import Tires from "../components/overlay/Tires.jsx";

const WIDGET_IDS = ["delta", "strip", "trecho", "pedals", "trailing", "tires"];

// Posicao em fracao (0..1) → pixels da viewport. Apos primeiro drag salva em px.
function toPx(v, dim) {
  if (v == null) return 0;
  if (v >= 0 && v <= 1.5) return Math.round(v * dim);
  return v;
}

function isVisible(widget, sessionType) {
  if (!widget?.enabled) return false;
  const s = widget.sessions || {};
  if (sessionType === "race") return s.race !== false;
  if (sessionType === "qualy") return s.qualy !== false;
  return s.practice !== false; // default + practice/testday/warmup
}

function Widget({ id, pos, scale, edit, onMove, children }) {
  const dragRef = useRef(null);
  function onMouseDown(e) {
    if (!edit) return;
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const startPos = { x: pos.x, y: pos.y };
    dragRef.current = { startX, startY, startPos };
    function move(ev) {
      const dx = ev.clientX - dragRef.current.startX;
      const dy = ev.clientY - dragRef.current.startY;
      onMove(id, { x: startPos.x + dx, y: startPos.y + dy });
    }
    function up() {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      dragRef.current = null;
    }
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  }
  return (
    <div
      onMouseDown={onMouseDown}
      style={{
        position: "absolute",
        left: pos.x,
        top: pos.y,
        transform: `scale(${scale || 1})`,
        transformOrigin: "top left",
        cursor: edit ? "move" : "default",
        outline: edit ? "2px dashed rgba(80,200,255,0.85)" : "none",
        outlineOffset: 4,
        background: edit ? "rgba(0,80,120,0.15)" : "transparent",
        userSelect: "none",
      }}
    >
      {children}
    </div>
  );
}

export default function Overlay() {
  const [tick, setTick] = useState(null);
  const [edit, setEdit] = useState(false);
  const [widgets, setWidgets] = useState(null);
  const [refSamples, setRefSamples] = useState(null);
  const [positions, setPositions] = useState(null);
  const dimsRef = useRef({ w: 0, h: 0 });

  // Background transparente pra essa rota
  useEffect(() => {
    const root = document.getElementById("root");
    document.documentElement.style.background = "transparent";
    document.body.style.background = "transparent";
    document.body.style.margin = "0";
    document.body.style.overflow = "hidden";
    if (root) root.style.background = "transparent";
    dimsRef.current = { w: window.innerWidth, h: window.innerHeight };
  }, []);

  // Carrega config inicial
  useEffect(() => {
    let cancel = false;
    (async () => {
      const cfg = await window.api?.getOverlayWidgets?.();
      if (cancel || !cfg) return;
      setWidgets(cfg);
      const w = window.innerWidth;
      const h = window.innerHeight;
      const pos = {};
      for (const id of WIDGET_IDS) {
        pos[id] = {
          x: toPx(cfg[id]?.x ?? 0.5, w),
          y: toPx(cfg[id]?.y ?? 0.5, h),
        };
      }
      setPositions(pos);
    })();
    return () => {
      cancel = true;
    };
  }, []);

  // Subscribe live tick / mode / widgets / ref
  useEffect(() => {
    const offTick = window.api?.onOverlayTick?.((p) => setTick(p));
    const offMode = window.api?.onOverlayMode?.(({ edit: e }) => setEdit(!!e));
    const offWidgets = window.api?.onOverlayWidgets?.((cfg) => {
      setWidgets(cfg);
      // Atualiza posicoes (sem sobrescrever as ja editadas localmente
      // — mas como a fonte da verdade e o config, aceita as do servidor)
      const w = dimsRef.current.w;
      const h = dimsRef.current.h;
      setPositions((prev) => {
        const next = { ...(prev || {}) };
        for (const id of WIDGET_IDS) {
          if (cfg[id]) {
            next[id] = {
              x: toPx(cfg[id].x ?? 0.5, w),
              y: toPx(cfg[id].y ?? 0.5, h),
            };
          }
        }
        return next;
      });
    });
    const offRef = window.api?.onOverlayRef?.((p) => setRefSamples(p?.samples || null));
    return () => {
      offTick?.();
      offMode?.();
      offWidgets?.();
      offRef?.();
    };
  }, []);

  // Persist position on drag (debounced).
  // Clampa pra >= 2 px porque o renderer detecta fracoes como valores <= 1.5.
  // Sem clamp, arrastar pra colado na borda salvaria 0 ou 1, que ao recarregar
  // seria interpretado como "0% ou 100% da tela".
  const saveTimerRef = useRef({});
  function moveWidget(id, newPos) {
    const safe = {
      x: Math.max(2, Math.round(newPos.x)),
      y: Math.max(2, Math.round(newPos.y)),
    };
    setPositions((p) => ({ ...(p || {}), [id]: safe }));
    clearTimeout(saveTimerRef.current[id]);
    saveTimerRef.current[id] = setTimeout(() => {
      window.api?.setOverlayWidget?.(id, safe);
    }, 200);
  }

  const sessionType = tick?.sessionType || "practice";

  const visibleIds = useMemo(() => {
    if (!widgets) return new Set();
    const out = new Set();
    for (const id of WIDGET_IDS) {
      if (isVisible(widgets[id], sessionType)) out.add(id);
    }
    return out;
  }, [widgets, sessionType]);

  if (!widgets || !positions) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "transparent",
        overflow: "hidden",
        pointerEvents: edit ? "auto" : "none",
        fontFamily:
          "'JetBrains Mono', 'Geist Mono', ui-monospace, monospace",
      }}
    >
      {edit && (
        <div
          style={{
            position: "absolute",
            top: 12,
            left: "50%",
            transform: "translateX(-50%)",
            background: "rgba(20,30,40,0.95)",
            color: "#fff",
            padding: "8px 14px",
            fontSize: 12,
            letterSpacing: "0.12em",
            border: "1px solid rgba(80,200,255,0.6)",
            zIndex: 1000,
            pointerEvents: "auto",
            display: "flex",
            alignItems: "center",
            gap: 14,
            fontFamily: "inherit",
          }}
        >
          <span>MODO EDIT — arraste os widgets</span>
          <button
            onClick={() => window.api?.setOverlayEdit?.(false)}
            style={{
              background: "rgba(80,200,255,0.25)",
              color: "#fff",
              border: "1px solid rgba(80,200,255,0.8)",
              padding: "4px 10px",
              fontSize: 11,
              letterSpacing: "0.1em",
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            CONCLUIR
          </button>
        </div>
      )}

      {visibleIds.has("delta") && (
        <Widget id="delta" pos={positions.delta} scale={widgets.delta?.scale} edit={edit} onMove={moveWidget}>
          <Delta delta={tick?.delta ?? null} hasRef={tick?.hasRef ?? false} />
        </Widget>
      )}

      {visibleIds.has("strip") && (
        <Widget id="strip" pos={positions.strip} scale={widgets.strip?.scale} edit={edit} onMove={moveWidget}>
          <SectorStrip
            buckets={tick?.buckets || null}
            bucketCount={tick?.bucketCount ?? 30}
            progress={tick?.bucketProgress ?? 0}
          />
        </Widget>
      )}

      {visibleIds.has("trecho") && (
        <Widget id="trecho" pos={positions.trecho} scale={widgets.trecho?.scale} edit={edit} onMove={moveWidget}>
          <Trecho
            microDelta={tick?.microDelta ?? null}
            hasRef={tick?.hasRef ?? false}
          />
        </Widget>
      )}

      {visibleIds.has("pedals") && (
        <Widget id="pedals" pos={positions.pedals} scale={widgets.pedals?.scale} edit={edit} onMove={moveWidget}>
          <Pedals throttle={tick?.throttle ?? 0} brake={tick?.brake ?? 0} />
        </Widget>
      )}

      {visibleIds.has("trailing") && (
        <Widget id="trailing" pos={positions.trailing} scale={widgets.trailing?.scale} edit={edit} onMove={moveWidget}>
          <Trailing
            tick={tick}
            refSamples={refSamples}
            showReference={widgets.trailing?.showReference ?? true}
          />
        </Widget>
      )}

      {visibleIds.has("tires") && (
        <Widget id="tires" pos={positions.tires} scale={widgets.tires?.scale} edit={edit} onMove={moveWidget}>
          <Tires tireWear={tick?.tireWear} />
        </Widget>
      )}
    </div>
  );
}
