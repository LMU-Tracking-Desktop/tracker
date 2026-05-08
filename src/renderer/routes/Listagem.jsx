import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import TrackSelect from "../components/TrackSelect.jsx";
import CarCell from "../components/CarCell.jsx";
import TypeBadge from "../components/TypeBadge.jsx";
import DeleteButton from "../components/DeleteButton.jsx";
import CopyLapButton from "../components/CopyLapButton.jsx";
import PageHeader from "../components/PageHeader.jsx";
import { Field } from "../components/Field.jsx";
import {
  formatLapTime,
  formatSector,
  formatDateTime,
} from "../lib/format.js";

const PAGE_SIZE = 50;

function SortHeader({ field, label, align = "left", current, dir, onSort }) {
  const active = current === field;
  const nextDir = active ? (dir === "asc" ? "desc" : "asc") : "desc";
  return (
    <button
      type="button"
      onClick={() => onSort(field, nextDir)}
      style={{
        textAlign: align,
        width: "100%",
        background: "transparent",
        border: 0,
        cursor: "pointer",
        color: active ? "var(--tx-0)" : "inherit",
        font: "inherit",
        padding: 0,
        letterSpacing: "inherit",
        textTransform: "inherit",
      }}
    >
      {label}
      {active ? (dir === "asc" ? " ↑" : " ↓") : ""}
    </button>
  );
}

function Pagination({ page, total, pageSize, onChange }) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "10px 14px",
        borderBottom: "1px solid var(--bd-0)",
        background: "var(--bg-1)",
      }}
    >
      <span
        className="mono"
        style={{
          fontSize: 10,
          letterSpacing: "0.14em",
          color: "var(--tx-2)",
        }}
      >
        {total} {total === 1 ? "VOLTA" : "VOLTAS"} · PÁGINA {page} /{" "}
        {totalPages}
      </span>
      <div style={{ display: "flex", gap: 6 }}>
        <button
          type="button"
          className="btn"
          disabled={page <= 1}
          onClick={() => onChange(Math.max(1, page - 1))}
          style={{ opacity: page <= 1 ? 0.4 : 1 }}
        >
          ← ANTERIOR
        </button>
        <button
          type="button"
          className="btn"
          disabled={page >= totalPages}
          onClick={() => onChange(Math.min(totalPages, page + 1))}
          style={{ opacity: page >= totalPages ? 0.4 : 1 }}
        >
          PRÓXIMA →
        </button>
      </div>
    </div>
  );
}

export default function Listagem() {
  const [tracks, setTracks] = useState([]);
  const [cars, setCars] = useState([]);
  const [filterOpts, setFilterOpts] = useState({
    cars: [],
    types: [],
    classes: [],
  });
  const [trackId, setTrackId] = useState(null);
  const [type, setType] = useState("");
  const [carClass, setCarClass] = useState("");
  const [car, setCar] = useState("");
  const [day, setDay] = useState("");
  const [sort, setSort] = useState("createdAt");
  const [dir, setDir] = useState("desc");
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ laps: [], total: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [t, c] = await Promise.all([
        window.api?.listTracks?.() ?? [],
        window.api?.listCars?.() ?? [],
      ]);
      setTracks(t || []);
      setCars(c || []);
    })();
  }, []);

  useEffect(() => {
    (async () => {
      const o = await window.api?.getFilterOptions?.({ trackId });
      setFilterOpts(o || { cars: [], types: [], classes: [] });
    })();
  }, [trackId]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const r = await window.api?.getListagem?.({
          trackId,
          type: type || null,
          carClass: carClass || null,
          car: car || null,
          day: day || null,
          sort,
          dir,
          page,
          pageSize: PAGE_SIZE,
        });
        if (!cancelled) setData(r || { laps: [], total: 0 });
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [trackId, type, carClass, car, day, sort, dir, page]);

  useEffect(() => {
    setPage(1);
  }, [trackId, type, carClass, car, day]);

  const carImages = useMemo(
    () => new Map(cars.map((c) => [c.name, c.imageUrl])),
    [cars]
  );

  const handleSort = (field, d) => {
    setSort(field);
    setDir(d);
  };

  const handleDeleteLap = async (id) => {
    const done = await window.api.deleteLap(id);
    if (done) {
      setData((prev) => ({
        ...prev,
        laps: prev.laps.filter((l) => l.id !== id),
        total: Math.max(0, prev.total - 1),
      }));
    }
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflow: "auto",
      }}
    >
      <PageHeader
        crumbs={[{ label: "LISTAGEM" }, { label: "VOLTAS" }]}
        actions={
          <span
            className="mono"
            style={{
              fontSize: 10,
              letterSpacing: "0.14em",
              color: "var(--tx-3)",
            }}
          >
            {data.total} TOTAL
          </span>
        }
      />

      {/* Filters */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
          gap: "var(--gap)",
          padding: "var(--pad)",
        }}
      >
        <TrackSelect
          tracks={tracks}
          value={trackId}
          onChange={setTrackId}
          includeAll
        />
        <Field label="Classe">
          <select
            className="select"
            value={carClass}
            onChange={(e) => setCarClass(e.target.value)}
          >
            <option value="">todas as classes</option>
            {filterOpts.classes.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Carro">
          <select
            className="select"
            value={car}
            onChange={(e) => setCar(e.target.value)}
          >
            <option value="">todos os carros</option>
            {filterOpts.cars.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Tipo">
          <select
            className="select"
            value={type}
            onChange={(e) => setType(e.target.value)}
          >
            <option value="">todos os tipos</option>
            {filterOpts.types.map((t) => (
              <option key={t} value={t}>
                {t.toUpperCase()}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Dia">
          <input
            type="date"
            className="input"
            value={day}
            onChange={(e) => setDay(e.target.value)}
          />
        </Field>
      </div>

      {/* Table / states */}
      <div style={{ padding: "0 var(--pad) var(--pad)" }}>
        {loading && data.laps.length === 0 ? (
          <div
            style={{
              border: "1px solid var(--bd-0)",
              background: "var(--bg-1)",
              padding: "48px var(--pad)",
              textAlign: "center",
            }}
          >
            <span
              className="mono"
              style={{
                fontSize: 10,
                letterSpacing: "0.18em",
                color: "var(--tx-3)",
              }}
            >
              CARREGANDO...
            </span>
          </div>
        ) : data.laps.length === 0 ? (
          <div
            style={{
              border: "1px solid var(--bd-0)",
              background: "var(--bg-1)",
              padding: "48px var(--pad)",
              textAlign: "center",
            }}
          >
            <span
              className="mono"
              style={{
                fontSize: 10,
                letterSpacing: "0.18em",
                color: "var(--tx-3)",
              }}
            >
              NENHUMA VOLTA COM ESSES FILTROS
            </span>
          </div>
        ) : (
          <div
            style={{
              border: "1px solid var(--bd-0)",
              background: "var(--bg-1)",
            }}
          >
            <Pagination
              page={page}
              total={data.total}
              pageSize={PAGE_SIZE}
              onChange={setPage}
            />
            <div style={{ overflowX: "auto" }}>
              <table className="laps">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>
                      <SortHeader
                        field="createdAt"
                        label="Data"
                        current={sort}
                        dir={dir}
                        onSort={handleSort}
                      />
                    </th>
                    <th>Pista</th>
                    <th>Carro</th>
                    <th>Classe</th>
                    <th>Tipo</th>
                    <th className="num">
                      <SortHeader
                        field="lapNumber"
                        label="Volta#"
                        align="right"
                        current={sort}
                        dir={dir}
                        onSort={handleSort}
                      />
                    </th>
                    <th className="num">
                      <SortHeader
                        field="sector1"
                        label="S1"
                        align="right"
                        current={sort}
                        dir={dir}
                        onSort={handleSort}
                      />
                    </th>
                    <th className="num">
                      <SortHeader
                        field="sector2"
                        label="S2"
                        align="right"
                        current={sort}
                        dir={dir}
                        onSort={handleSort}
                      />
                    </th>
                    <th className="num">
                      <SortHeader
                        field="sector3"
                        label="S3"
                        align="right"
                        current={sort}
                        dir={dir}
                        onSort={handleSort}
                      />
                    </th>
                    <th className="num">
                      <SortHeader
                        field="lapTime"
                        label="Tempo"
                        align="right"
                        current={sort}
                        dir={dir}
                        onSort={handleSort}
                      />
                    </th>
                    <th className="num">
                      <SortHeader
                        field="tyreWearAvg"
                        label="Pneu"
                        align="right"
                        current={sort}
                        dir={dir}
                        onSort={handleSort}
                      />
                    </th>
                    <th style={{ width: 32 }}></th>
                    <th style={{ width: 32 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {data.laps.map((lap, i) => {
                    const cls = !lap.isValid ? "invalid" : "";
                    const dash = (content) => (lap.isValid ? content : "—");
                    return (
                      <tr key={lap.id} className={cls}>
                        <td className="num" style={{ color: "var(--tx-3)" }}>
                          <span className="inline-flex items-center gap-1.5">
                            <span>{(page - 1) * PAGE_SIZE + i + 1}</span>
                            {lap.hasTouch && (
                              <span
                                className="punch-badge"
                                title="Contato nessa volta"
                              >
                                !
                              </span>
                            )}
                          </span>
                        </td>
                        <td className="whitespace-nowrap">
                          <Link
                            to={`/sessoes/${lap.sessionId}`}
                            style={{
                              color: "var(--tx-1)",
                              textDecoration: "none",
                            }}
                          >
                            {formatDateTime(lap.createdAt)}
                          </Link>
                        </td>
                        <td className="whitespace-nowrap">
                          {lap.session.track.name}
                        </td>
                        <td>
                          <CarCell
                            name={lap.session.car}
                            imageUrl={carImages.get(lap.session.car) ?? null}
                          />
                        </td>
                        <td style={{ color: "var(--tx-2)" }}>
                          {lap.session.carClass}
                        </td>
                        <td>
                          <TypeBadge type={lap.session.type} />
                        </td>
                        <td className="num" style={{ color: "var(--tx-2)" }}>
                          {lap.lapNumber}
                        </td>
                        <td className="num">
                          {dash(formatSector(lap.sector1))}
                        </td>
                        <td className="num">
                          {dash(formatSector(lap.sector2))}
                        </td>
                        <td className="num">
                          {dash(formatSector(lap.sector3))}
                        </td>
                        <td className="num">
                          {dash(formatLapTime(lap.lapTime))}
                        </td>
                        <td className="num" style={{ color: "var(--tx-2)" }}>
                          {lap.tyreWearAvg != null
                            ? (lap.tyreWearAvg * 100).toFixed(1) + "%"
                            : "--"}
                        </td>
                        <td className="text-right">
                          <CopyLapButton lapId={lap.id} />
                        </td>
                        <td className="text-right">
                          <DeleteButton
                            label="deletar volta"
                            confirmMessage={`Deletar a volta #${lap.lapNumber}?`}
                            onConfirm={() => handleDeleteLap(lap.id)}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
