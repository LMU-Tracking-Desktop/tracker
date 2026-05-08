import { useEffect, useMemo, useRef, useState } from "react";
import PageHeader from "../components/PageHeader.jsx";
import { useLmuStatus } from "../lib/useLmuStatus.js";

const MAX_LINES = 1000;

const TAG_COLORS = {
  ERRO: "var(--crit)",
  "ERRO FATAL": "var(--crit)",
  "DB ERRO": "var(--crit)",
  "IPC ERRO": "var(--crit)",
  "SAMPLE ERRO": "var(--crit)",
  "STATUS ERRO": "var(--crit)",
  OK: "var(--ok)",
  STATUS: "var(--ok)",
  INIT: "var(--steer)",
  SAMPLER: "var(--steer)",
  IPC: "var(--tx-2)",
  CFG: "var(--warn)",
  DBG: "var(--tx-3)",
  DB: "var(--tx-2)",
  "lmu-asset": "var(--tx-3)",
};

function classify(text) {
  // matches "[TAG] ..." or "[TAG word] ..."
  const m = text.match(/^\[([^\]]+)\]/);
  if (!m) return null;
  return m[1];
}

function colorFor(tag) {
  if (!tag) return null;
  // exact match first
  if (TAG_COLORS[tag]) return TAG_COLORS[tag];
  // prefix match (e.g. "ERRO foo")
  for (const k of Object.keys(TAG_COLORS)) {
    if (tag.startsWith(k)) return TAG_COLORS[k];
  }
  return null;
}

function LogLine({ text }) {
  const tag = classify(text);
  const tagColor = colorFor(tag);
  if (!tag) {
    // Lines with "[...]" or "[OK]" plain prefix (no brackets)
    if (text.startsWith("[...]"))
      return (
        <div style={{ color: "var(--tx-3)", whiteSpace: "pre-wrap" }}>
          {text}
        </div>
      );
    if (text.startsWith("[OK]"))
      return (
        <div style={{ color: "var(--ok)", whiteSpace: "pre-wrap" }}>
          {text}
        </div>
      );
    return (
      <div style={{ color: "var(--tx-1)", whiteSpace: "pre-wrap" }}>
        {text}
      </div>
    );
  }
  const rest = text.slice(tag.length + 2); // skip "[TAG]"
  return (
    <div style={{ display: "flex", whiteSpace: "pre-wrap" }}>
      <span
        style={{
          color: tagColor || "var(--tx-2)",
          flexShrink: 0,
        }}
      >
        [{tag}]
      </span>
      <span style={{ color: "var(--tx-1)" }}>{rest}</span>
    </div>
  );
}

export default function Logs() {
  const [lines, setLines] = useState([]);
  const [autoScroll, setAutoScroll] = useState(true);
  const [filter, setFilter] = useState("");
  const endRef = useRef(null);
  const lmuConnected = useLmuStatus();

  useEffect(() => {
    if (!window.api) return;

    window.api.getLogBuffer?.().then((buffer) => {
      if (!buffer || buffer.length === 0) return;
      setLines((prev) => {
        const existingTexts = new Set(prev.map((l) => l.text));
        const seeded = buffer
          .filter((t) => !existingTexts.has(t))
          .map((text) => ({ id: Math.random(), text }));
        return [...seeded, ...prev];
      });
    });

    const unsub = window.api.onTrackerLog?.((line) => {
      setLines((prev) => {
        const next = prev.length >= MAX_LINES ? prev.slice(1) : prev.slice();
        next.push({ id: Date.now() + Math.random(), text: line });
        return next;
      });
    });
    return unsub;
  }, []);

  const visible = useMemo(() => {
    if (!filter.trim()) return lines;
    const q = filter.toLowerCase();
    return lines.filter((l) => l.text.toLowerCase().includes(q));
  }, [lines, filter]);

  useEffect(() => {
    if (autoScroll && endRef.current) {
      endRef.current.scrollIntoView({ behavior: "auto", block: "end" });
    }
  }, [visible, autoScroll]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflow: "hidden",
      }}
    >
      <PageHeader
        crumbs={[{ label: "LOGS" }, { label: "TRACKER OUTPUT" }]}
        actions={
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span
              className="mono"
              style={{
                fontSize: 10,
                letterSpacing: "0.14em",
                color: "var(--tx-3)",
                textTransform: "uppercase",
              }}
            >
              {visible.length}
              {filter ? `/${lines.length}` : ""} LINHAS
            </span>
            <span
              className="chip"
              style={{
                color: lmuConnected ? "var(--ok)" : "var(--tx-3)",
                borderColor: lmuConnected
                  ? "rgba(74, 222, 128, 0.4)"
                  : "var(--bd-1)",
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: lmuConnected ? "var(--ok)" : "var(--tx-3)",
                  display: "inline-block",
                  animation: lmuConnected
                    ? "pulse-dot 1.4s ease-in-out infinite"
                    : "none",
                }}
              />{" "}
              {lmuConnected ? "STREAMING" : "OFFLINE"}
            </span>
          </div>
        }
      />

      {/* Toolbar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--gap)",
          padding: "var(--pad)",
          borderBottom: "1px solid var(--bd-0)",
          background: "var(--bg-1)",
          flexShrink: 0,
        }}
      >
        <input
          type="text"
          className="input"
          placeholder="filtrar (ex: ERRO, SAMPLER, lap, ...)"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={{ flex: 1, maxWidth: 480 }}
        />
        <label
          className="mono"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 10,
            letterSpacing: "0.14em",
            color: "var(--tx-2)",
            cursor: "pointer",
            textTransform: "uppercase",
          }}
        >
          <input
            type="checkbox"
            checked={autoScroll}
            onChange={(e) => setAutoScroll(e.target.checked)}
            style={{ accentColor: "var(--accent)" }}
          />
          Auto-scroll
        </label>
        <div style={{ flex: 1 }} />
        <button
          type="button"
          className="btn"
          onClick={() => setLines([])}
          disabled={lines.length === 0}
          style={{ opacity: lines.length === 0 ? 0.4 : 1 }}
        >
          LIMPAR
        </button>
      </div>

      {/* Log viewport */}
      <div
        style={{
          flex: 1,
          overflow: "auto",
          background: "var(--bg-0)",
          fontFamily: "Geist Mono, ui-monospace, monospace",
          fontSize: 12,
          lineHeight: 1.55,
          padding: "12px var(--pad)",
        }}
      >
        {visible.length === 0 ? (
          <div
            style={{
              color: "var(--tx-3)",
              padding: "40px 0",
              textAlign: "center",
              letterSpacing: "0.14em",
              fontSize: 10,
              textTransform: "uppercase",
            }}
          >
            {filter ? "NENHUMA LINHA COM ESSE FILTRO" : "AGUARDANDO LOGS DO TRACKER..."}
          </div>
        ) : (
          visible.map((l) => <LogLine key={l.id} text={l.text} />)
        )}
        <div ref={endRef} />
      </div>
    </div>
  );
}
