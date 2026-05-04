import { useState } from "react";

export default function CopyLapButton({ lapId }) {
  const [state, setState] = useState("idle"); // idle | loading | ok | err

  const handle = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (state === "loading") return;
    setState("loading");
    try {
      const payload = await window.api?.exportLap?.(lapId);
      if (!payload) {
        setState("err");
        return;
      }
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      setState("ok");
      setTimeout(() => setState("idle"), 1500);
    } catch {
      setState("err");
      setTimeout(() => setState("idle"), 1500);
    }
  };

  const label =
    state === "ok"
      ? "✓"
      : state === "err"
        ? "!"
        : state === "loading"
          ? "…"
          : "⎘";
  const color =
    state === "ok"
      ? "var(--green)"
      : state === "err"
        ? "var(--accent)"
        : undefined;

  return (
    <button
      type="button"
      className="delete-btn"
      onClick={handle}
      disabled={state === "loading"}
      title="Copiar volta (JSON)"
      style={color ? { color, borderColor: color, opacity: 1 } : undefined}
    >
      {label}
    </button>
  );
}
