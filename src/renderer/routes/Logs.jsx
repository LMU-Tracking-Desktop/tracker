import { useEffect, useRef, useState } from "react";

const MAX_LINES = 1000;

export default function Logs() {
  const [lines, setLines] = useState([]);
  const [autoScroll, setAutoScroll] = useState(true);
  const endRef = useRef(null);

  useEffect(() => {
    if (!window.api) return;

    // 1. Puxa o buffer acumulado (logs que vieram antes do listener montar)
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

    // 2. Escuta novos logs
    const unsub = window.api.onTrackerLog?.((line) => {
      setLines((prev) => {
        const next = prev.length >= MAX_LINES ? prev.slice(1) : prev.slice();
        next.push({ id: Date.now() + Math.random(), text: line });
        return next;
      });
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (autoScroll && endRef.current) {
      endRef.current.scrollIntoView({ behavior: "auto", block: "end" });
    }
  }, [lines, autoScroll]);

  return (
    <div className="flex flex-col h-screen">
      <div className="h-14 px-6 border-b hairline flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <span className="chip accent">LOGS</span>
          <span className="mono text-[11px] text-muted tracking-wider">
            tracker output — {lines.length} linha{lines.length === 1 ? "" : "s"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <label className="mono text-[10px] tracking-[0.2em] text-muted flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
            />
            AUTO-SCROLL
          </label>
          <button
            type="button"
            className="btn"
            onClick={() => setLines([])}
          >
            LIMPAR
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-[#050507]">
        <pre className="mono text-[12.5px] leading-[1.5] text-[#d8d8e0] px-6 py-4 m-0 whitespace-pre-wrap select-text">
          {lines.length === 0 ? (
            <span className="text-muted">
              {"> aguardando logs do tracker..."}
            </span>
          ) : (
            lines.map((l) => <div key={l.id}>{l.text}</div>)
          )}
          <div ref={endRef} />
        </pre>
      </div>
    </div>
  );
}
