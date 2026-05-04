import { createContext, useCallback, useContext, useState } from "react";

const ConfirmContext = createContext(null);

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    // Fallback caso o provider nao esteja montado (nao deveria acontecer)
    return async (opts) => window.confirm(opts?.message || "Tem certeza?");
  }
  return ctx;
}

export default function ConfirmProvider({ children }) {
  const [state, setState] = useState(null);

  const confirm = useCallback((opts = {}) => {
    return new Promise((resolve) => {
      setState({
        title: opts.title || "Confirmar",
        message: opts.message || "Tem certeza?",
        detail: opts.detail || "",
        confirmLabel: opts.confirmLabel || "Confirmar",
        cancelLabel: opts.cancelLabel || "Cancelar",
        variant: opts.variant || "danger",
        resolve,
      });
    });
  }, []);

  const close = (result) => {
    if (state) state.resolve(result);
    setState(null);
  };

  // Fecha com ESC cancela, Enter confirma
  const handleKey = (e) => {
    if (e.key === "Escape") close(false);
    else if (e.key === "Enter") close(true);
  };

  const variantColor =
    state?.variant === "danger" ? "var(--accent)" : "var(--green)";

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {state && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 100,
          }}
          onClick={() => close(false)}
          onKeyDown={handleKey}
          tabIndex={-1}
        >
          <div
            className="border hairline"
            style={{
              background: "var(--background)",
              width: "min(460px, 92vw)",
              display: "flex",
              flexDirection: "column",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-3 border-b hairline flex items-center justify-between">
              <span
                className="mono text-[11px] tracking-[0.2em]"
                style={{ color: variantColor }}
              >
                {state.title.toUpperCase()}
              </span>
            </div>
            <div className="p-5 space-y-3">
              <div className="text-sm leading-relaxed">{state.message}</div>
              {state.detail && (
                <div
                  className="mono text-[11px] tracking-wider"
                  style={{ color: "var(--muted)" }}
                >
                  {state.detail}
                </div>
              )}
            </div>
            <div className="px-5 py-3 border-t hairline flex items-center justify-end gap-2">
              <button
                type="button"
                className="btn"
                onClick={() => close(false)}
              >
                {state.cancelLabel.toUpperCase()}
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => close(true)}
                autoFocus
                style={{
                  color: variantColor,
                  borderColor: variantColor,
                }}
              >
                {state.confirmLabel.toUpperCase()}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}
