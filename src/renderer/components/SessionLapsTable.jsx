import { formatLapTime, formatSector, formatFuel } from "../lib/format.js";
import DeleteButton from "./DeleteButton.jsx";
import CopyLapButton from "./CopyLapButton.jsx";

const DIVIDER = { borderLeft: "1px solid var(--border)" };

export default function SessionLapsTable({
  laps,
  bestLapId,
  worstLapId,
  bestS1,
  bestS2,
  bestS3,
  hasPosition,
  outlierSet,
  onDeleteLap,
}) {
  const bestTime = laps.find((l) => l.id === bestLapId)?.lapTime ?? null;
  const maxDelta = bestTime
    ? Math.max(
        0.1,
        ...laps.filter((l) => l.isValid).map((l) => l.lapTime - bestTime)
      )
    : 1;

  return (
    <table className="laps">
      <thead>
        <tr>
          <th className="num" style={{ width: 44 }}>
            #
          </th>
          <th className="num" style={DIVIDER}>
            S1
          </th>
          <th className="num">S2</th>
          <th className="num">S3</th>
          <th className="num">Tempo</th>
          <th className="num" style={DIVIDER}>
            Δ
          </th>
          {hasPosition && (
            <th className="num" style={DIVIDER}>
              Pos
            </th>
          )}
          <th className="num" style={DIVIDER}>
            Pneu
          </th>
          <th className="num">Restante</th>
          <th style={{ width: 32 }}></th>
          {onDeleteLap && <th style={{ width: 32 }}></th>}
        </tr>
      </thead>
      <tbody>
        {laps.map((lap) => {
          const isOutlier = outlierSet?.has(lap.id);
          const cls = [
            !lap.isValid ? "invalid" : "",
            lap.id === worstLapId ? "worst" : "",
            !lap.isValid ? "invalid-clean" : "",
            isOutlier ? "outlier" : "",
          ]
            .filter(Boolean)
            .join(" ");

          const isBestRow = lap.id === bestLapId;

          const s1Best = lap.isValid && lap.sector1 === bestS1 && lap.sector1 != null;
          const s2Best = lap.isValid && lap.sector2 === bestS2 && lap.sector2 != null;
          const s3Best = lap.isValid && lap.sector3 === bestS3 && lap.sector3 != null;

          const delta =
            bestTime != null && lap.isValid ? lap.lapTime - bestTime : null;
          const deltaText =
            !lap.isValid
              ? "—"
              : delta == null
                ? "--"
                : delta === 0
                  ? "—"
                  : `+${delta.toFixed(3)}`;
          const pct = delta != null ? Math.min(1, delta / maxDelta) : 0;
          const deltaColor =
            pct < 0.2 ? "var(--green)" : pct < 0.5 ? "var(--yellow)" : "var(--accent)";

          return (
            <tr key={lap.id} className={cls}>
              <td className="num text-muted" style={{ width: 44 }}>
                <span className="inline-flex items-center gap-1.5">
                  <span>{lap.lapNumber}</span>
                  {lap.hasTouch && (
                    <span
                      className="punch-badge"
                      title="Contato nessa volta"
                    >
                      !
                    </span>
                  )}
                  {isOutlier && (
                    <span
                      className="mono text-[9px] tracking-widest"
                      style={{
                        color: "var(--muted)",
                        border: "1px solid var(--border)",
                        padding: "1px 4px",
                      }}
                      title="Volta desconsiderada (outlier)"
                    >
                      OUT
                    </span>
                  )}
                </span>
              </td>
              <td
                className={`num worst-col${s1Best ? " best-sector" : ""}`}
                style={DIVIDER}
              >
                {!lap.isValid ? "—" : formatSector(lap.sector1)}
              </td>
              <td className={`num worst-col${s2Best ? " best-sector" : ""}`}>
                {!lap.isValid ? "—" : formatSector(lap.sector2)}
              </td>
              <td className={`num worst-col${s3Best ? " best-sector" : ""}`}>
                {!lap.isValid ? "—" : formatSector(lap.sector3)}
              </td>
              <td
                className={`num worst-col${isBestRow ? " best-time" : ""}`}
              >
                {!lap.isValid ? "—" : formatLapTime(lap.lapTime)}
              </td>
              <td className="num worst-col" style={DIVIDER}>
                {lap.isValid && delta != null ? (
                  <div className="flex items-center gap-2 justify-end">
                    <span className="text-muted" style={{ minWidth: 48 }}>
                      {deltaText}
                    </span>
                    <span
                      className="inline-block"
                      style={{
                        width: 40,
                        height: 6,
                        background: "var(--surface-2)",
                      }}
                    >
                      <span
                        className="inline-block h-full"
                        style={{
                          width: `${pct * 100}%`,
                          background: deltaColor,
                        }}
                      />
                    </span>
                  </div>
                ) : (
                  <span className="text-muted">{deltaText}</span>
                )}
              </td>
              {hasPosition && (
                <td className="num" style={DIVIDER}>
                  {lap.position != null ? `P${lap.position}` : "--"}
                </td>
              )}
              <td className="num" style={DIVIDER}>
                {lap.tyreWearAvg != null
                  ? (lap.tyreWearAvg * 100).toFixed(1) + "%"
                  : "--"}
              </td>
              <td className="num">{formatFuel(lap.fuelRemaining)}L</td>
              <td className="text-right">
                <CopyLapButton lapId={lap.id} />
              </td>
              {onDeleteLap && (
                <td className="text-right">
                  <DeleteButton
                    label="deletar volta"
                    confirmMessage={`Deletar a volta #${lap.lapNumber}?`}
                    onConfirm={() => onDeleteLap(lap.id)}
                  />
                </td>
              )}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
