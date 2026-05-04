import { Link } from "react-router-dom";
import CarCell from "./CarCell.jsx";
import TypeBadge from "./TypeBadge.jsx";
import {
  formatLapTime,
  formatSector,
  formatFuel,
  formatDateTime,
} from "../lib/format.js";

export default function LapsTable({ laps, bestLapId, carClass, carImages }) {
  return (
    <section className="border hairline overflow-x-auto">
      <div className="px-4 py-3 border-b hairline flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="chip accent">{(carClass || "—").toUpperCase()}</span>
          <span className="mono text-[10px] tracking-[0.2em] text-muted">
            TOP 3 · GERAL
          </span>
        </div>
        <span className="mono text-[10px] tracking-[0.2em] text-muted">
          {laps.length} {laps.length === 1 ? "VOLTA" : "VOLTAS"}
        </span>
      </div>
      <table className="laps">
        <thead>
          <tr>
            <th>#</th>
            <th>Data</th>
            <th>Carro</th>
            <th>Tipo</th>
            <th className="num">Volta</th>
            <th className="num">S1</th>
            <th className="num">S2</th>
            <th className="num">S3</th>
            <th className="num">Comb.</th>
            <th className="num">Pneu</th>
          </tr>
        </thead>
        <tbody>
          {laps.map((lap, i) => (
            <tr key={lap.id} className={!lap.isValid ? "invalid" : ""}>
              <td className="num text-muted">
                <span className="inline-flex items-center gap-1.5">
                  <span>{i + 1}</span>
                  {lap.hasTouch && (
                    <span className="punch-badge" title="Contato nessa volta">
                      !
                    </span>
                  )}
                </span>
              </td>
              <td className="text-muted whitespace-nowrap">
                <Link
                  to={`/sessoes/${lap.sessionId}`}
                  className="text-muted hover:text-accent"
                  style={{ textDecoration: "none" }}
                >
                  {formatDateTime(lap.createdAt)}
                </Link>
              </td>
              <td>
                <CarCell
                  name={lap.session.car}
                  imageUrl={carImages?.get(lap.session.car) ?? null}
                  carClass={lap.session.carClass}
                />
              </td>
              <td>
                <TypeBadge type={lap.session.type} />
              </td>
              <td
                className={`num${lap.id === bestLapId ? " best-time" : ""}`}
              >
                {formatLapTime(lap.lapTime)}
              </td>
              <td className="num">{formatSector(lap.sector1)}</td>
              <td className="num">{formatSector(lap.sector2)}</td>
              <td className="num">{formatSector(lap.sector3)}</td>
              <td className="num">{formatFuel(lap.fuelUsed)}L</td>
              <td className="num">
                {lap.tyreWearAvg != null
                  ? (lap.tyreWearAvg * 100).toFixed(1) + "%"
                  : "--"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
