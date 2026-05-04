import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import logo from "../../../assets/logo.png";

const ITEMS = [
  { to: "/", label: "HOME", end: true },
  { to: "/listagem", label: "LISTAGEM" },
  { to: "/sessoes", label: "SESSOES" },
  { to: "/dashboard", label: "DASHBOARD" },
  { to: "/logs", label: "LOGS" },
  { to: "/settings", label: "SETTINGS" },
];

export default function Sidebar() {
  const [version, setVersion] = useState("");
  useEffect(() => {
    window.api?.getAppVersion?.().then((v) => setVersion(v || ""));
  }, []);
  return (
    <aside className="w-56 shrink-0 border-r hairline flex flex-col">
      <div className="h-14 px-5 flex items-center gap-3 border-b hairline">
        <img src={logo} alt="LMU" className="w-7 h-7 object-contain" />
        <span className="mono text-sm tracking-[0.2em]">TIMING</span>
      </div>

      <nav className="flex-1 py-4">
        {ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              [
                "block px-5 py-2.5 mono text-[10px] tracking-[0.2em] border-l-2",
                isActive
                  ? "text-foreground border-accent bg-surface"
                  : "text-muted border-transparent hover:text-foreground",
              ].join(" ")
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="px-5 py-3 border-t hairline flex items-center justify-between">
        <span className="chip accent">ENDURANCE</span>
        <span className="chip">v{version || "?"}</span>
      </div>
    </aside>
  );
}
