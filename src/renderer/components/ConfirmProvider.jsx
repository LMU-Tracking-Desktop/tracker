import { createContext, useCallback, useContext, useEffect, useState } from "react";
import Modal from "./Modal.jsx";

const ConfirmContext = createContext(null);

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
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

  useEffect(() => {
    if (!state) return;
    const onKey = (e) => {
      if (e.key === "Enter") close(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const variantColor =
    state?.variant === "danger" ? "var(--crit)" : "var(--ok)";

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Modal
        open={!!state}
        onClose={() => close(false)}
        title={state?.title || ""}
        width={460}
        zIndex={100}
        footer={
          state && (
            <>
              <button
                type="button"
                className="btn"
                onClick={() => close(false)}
              >
                {state.cancelLabel.toUpperCase()}
              </button>
              <button
                type="button"
                className="mono"
                onClick={() => close(true)}
                autoFocus
                style={{
                  padding: "6px 14px",
                  fontSize: 11,
                  letterSpacing: "0.14em",
                  background: variantColor,
                  color: state.variant === "danger" ? "#fff" : "var(--accent-ink)",
                  border: "1px solid",
                  borderColor: variantColor,
                  fontWeight: 600,
                  cursor: "pointer",
                  textTransform: "uppercase",
                }}
              >
                {state.confirmLabel.toUpperCase()}
              </button>
            </>
          )
        }
      >
        {state && (
          <div
            style={{
              padding: "var(--pad)",
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            <div
              style={{
                fontSize: 14,
                lineHeight: 1.5,
                color: "var(--tx-0)",
              }}
            >
              {state.message}
            </div>
            {state.detail && (
              <div
                className="mono"
                style={{
                  fontSize: 11,
                  letterSpacing: "0.06em",
                  color: "var(--tx-2)",
                  lineHeight: 1.5,
                }}
              >
                {state.detail}
              </div>
            )}
          </div>
        )}
      </Modal>
    </ConfirmContext.Provider>
  );
}
