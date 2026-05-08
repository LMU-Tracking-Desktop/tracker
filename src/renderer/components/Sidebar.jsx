import { NavLink } from "react-router-dom";
import { useLmuStatus } from "../lib/useLmuStatus.js";

const ITEMS = [
  { to: "/", label: "HOME", end: true },
  { to: "/listagem", label: "LISTAGEM" },
  { to: "/sessoes", label: "SESSOES" },
  { to: "/dashboard", label: "DASHBOARD" },
  { to: "/logs", label: "LOGS" },
  { to: "/settings", label: "SETTINGS" },
];

function NavItem({ to, end, label }) {
  return (
    <NavLink to={to} end={end}>
      {({ isActive }) => (
        <span
          className="mono"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "12px 16px",
            borderLeft: "2px solid",
            borderLeftColor: isActive ? "var(--accent)" : "transparent",
            color: isActive ? "var(--tx-0)" : "var(--tx-2)",
            fontSize: 11,
            letterSpacing: "0.14em",
            cursor: "pointer",
            userSelect: "none",
            textDecoration: "none",
          }}
          onMouseEnter={(e) => {
            if (!isActive) e.currentTarget.style.color = "var(--tx-1)";
          }}
          onMouseLeave={(e) => {
            if (!isActive) e.currentTarget.style.color = "var(--tx-2)";
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              background: isActive ? "var(--accent)" : "var(--bd-2)",
              flexShrink: 0,
            }}
          />
          {label}
        </span>
      )}
    </NavLink>
  );
}

export default function Sidebar() {
  const lmuConnected = useLmuStatus();
  return (
    <aside
      style={{
        width: 200,
        background: "var(--bg-1)",
        borderRight: "1px solid var(--bd-0)",
        display: "flex",
        flexDirection: "column",
        flexShrink: 0,
      }}
    >
      {/* Logo */}
      <div
        style={{
          height: 56,
          padding: "0 16px",
          display: "flex",
          alignItems: "center",
          gap: 10,
          borderBottom: "1px solid var(--bd-0)",
          flexShrink: 0,
        }}
      >
        <div
          className="mono"
          style={{
            width: 30,
            height: 30,
            background: "var(--accent)",
            color: "var(--accent-ink)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: "0.06em",
            flexShrink: 0,
          }}
        >
          LM
        </div>
        <span
          className="mono"
          style={{
            fontSize: 11,
            letterSpacing: "0.22em",
            color: "var(--tx-1)",
            fontWeight: 600,
          }}
        >
          TIMING
        </span>
      </div>

      {/* Nav */}
      <nav
        style={{
          display: "flex",
          flexDirection: "column",
          padding: "8px 0",
          flex: 1,
        }}
      >
        {ITEMS.map((n) => (
          <NavItem key={n.to} to={n.to} end={n.end} label={n.label} />
        ))}
      </nav>

      {/* LMU status */}
      <div
        style={{
          padding: 12,
          borderTop: "1px solid var(--bd-0)",
          flexShrink: 0,
        }}
      >
        <div
          className="mono"
          style={{
            fontSize: 9,
            letterSpacing: "0.14em",
            color: "var(--tx-3)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span>LMU</span>
          <span style={{ color: lmuConnected ? "var(--ok)" : "var(--tx-3)" }}>
            ● {lmuConnected ? "ON" : "OFF"}
          </span>
        </div>
      </div>
    </aside>
  );
}
