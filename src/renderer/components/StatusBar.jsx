import { useEffect, useState } from "react";

export default function StatusBar() {
  const [version, setVersion] = useState("");
  useEffect(() => {
    window.api?.getAppVersion?.().then((v) => setVersion(v || ""));
  }, []);

  return (
    <div
      style={{
        height: 24,
        background: "var(--bg-1)",
        borderTop: "1px solid var(--bd-0)",
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-end",
        padding: "0 12px",
        flexShrink: 0,
      }}
    >
      <span
        className="mono"
        style={{
          fontSize: 9,
          letterSpacing: "0.14em",
          color: "var(--tx-3)",
        }}
      >
        v{version || "?"}
      </span>
    </div>
  );
}
