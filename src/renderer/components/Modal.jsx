import { useEffect } from "react";

export default function Modal({
  open,
  onClose,
  title,
  subtitle,
  width = 640,
  height,
  children,
  footer,
  closeOnBackdrop = true,
  zIndex = 50,
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0, 0, 0, 0.7)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex,
      }}
      onClick={closeOnBackdrop ? onClose : undefined}
    >
      <div
        style={{
          background: "var(--bg-1)",
          border: "1px solid var(--bd-1)",
          width: `min(${width}px, 96vw)`,
          ...(height ? { height: `min(${height}px, 92vh)` } : { maxHeight: "92vh" }),
          display: "flex",
          flexDirection: "column",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            padding: "10px 14px",
            borderBottom: "1px solid var(--bd-0)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span
              className="mono"
              style={{
                fontSize: 10,
                letterSpacing: "0.18em",
                color: "var(--tx-1)",
                textTransform: "uppercase",
                fontWeight: 600,
              }}
            >
              {title}
            </span>
            {subtitle && (
              <span
                className="mono"
                style={{
                  fontSize: 10,
                  letterSpacing: "0.14em",
                  color: "var(--tx-3)",
                  textTransform: "uppercase",
                }}
              >
                {subtitle}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            title="Fechar (Esc)"
            style={{
              width: 22,
              height: 22,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              background: "transparent",
              color: "var(--tx-2)",
              border: "1px solid transparent",
              cursor: "pointer",
              fontSize: 14,
              transition: "color .1s, border-color .1s, background .1s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "var(--crit)";
              e.currentTarget.style.borderColor = "var(--crit)";
              e.currentTarget.style.background = "rgba(255, 59, 59, 0.08)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "var(--tx-2)";
              e.currentTarget.style.borderColor = "transparent";
              e.currentTarget.style.background = "transparent";
            }}
          >
            ✕
          </button>
        </div>

        <div
          style={{
            flex: 1,
            overflow: "auto",
            display: "flex",
            flexDirection: "column",
            minHeight: 0,
          }}
        >
          {children}
        </div>

        {footer && (
          <div
            style={{
              padding: "10px 14px",
              borderTop: "1px solid var(--bd-0)",
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-end",
              gap: 8,
              flexShrink: 0,
            }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
