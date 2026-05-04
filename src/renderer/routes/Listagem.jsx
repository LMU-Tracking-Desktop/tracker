import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import TrackSelect from "../components/TrackSelect.jsx";
import CarCell from "../components/CarCell.jsx";
import TypeBadge from "../components/TypeBadge.jsx";
import DeleteButton from "../components/DeleteButton.jsx";
import CopyLapButton from "../components/CopyLapButton.jsx";
import {
  formatLapTime,
  formatSector,
  formatDateTime,
} from "../lib/format.js";

const DIVIDER = { borderLeft: "1px solid var(--border)" };
const PAGE_SIZE = 50;

function SortHeader({ field, label, align = "left", current, dir, onSort }) {
  const active = current === field;
  const nextDir = active ? (dir === "asc" ? "desc" : "asc") : "desc";
  return (
    <button
      type="button"
      onClick={() => onSort(field, nextDir)}
      className="text-inherit"
      style={{
        textAlign: align,
        width: "100%",
        background: "transparent",
        border: 0,
        cursor: "pointer",
        color: active ? "var(--foreground)" : "inherit",
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

  // Reset page ao mudar filtros
  useEffect(() => {
    setPage(1);
  }, [trackId, type, carClass, car, day]);

  const carImages = useMemo(
    () => new Map(cars.map((c) => [c.name, c.imageUrl])),
    [cars]
  );

  const totalPages = Math.max(1, Math.ceil(data.total / PAGE_SIZE));

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
    <div className="p-8">
      <div className="max-w-[1400px] mx-auto space-y-8">
        <div>
          <div className="mb-6">
            <span className="chip">LISTAGEM</span>
          </div>
          <h1 className="text-3xl font-semibold">Voltas</h1>
        </div>

        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 md:items-end">
          <TrackSelect tracks={tracks} value={trackId} onChange={setTrackId} />
          <label className="block">
            <span className="label">Classe</span>
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
          </label>
          <label className="block">
            <span className="label">Carro</span>
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
          </label>
          <label className="block">
            <span className="label">Tipo</span>
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
          </label>
          <label className="block">
            <span className="label">Dia</span>
            <input
              type="date"
              className="input"
              value={day}
              onChange={(e) => setDay(e.target.value)}
            />
          </label>
        </section>

        {loading && data.laps.length === 0 ? (
          <section className="border hairline p-12 text-center text-muted mono text-xs tracking-widest">
            CARREGANDO...
          </section>
        ) : data.laps.length === 0 ? (
          <section className="border hairline p-12 text-center text-muted mono text-xs tracking-widest">
            NENHUMA VOLTA COM ESSES FILTROS
          </section>
        ) : (
          <section className="border hairline">
            <div className="px-4 py-3 border-b hairline flex items-center justify-between">
              <span className="mono text-[10px] tracking-[0.2em] text-muted">
                {data.total} VOLTAS · PAGINA {page} / {totalPages}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="btn"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  style={{ opacity: page <= 1 ? 0.4 : 1 }}
                >
                  ← ANTERIOR
                </button>
                <button
                  type="button"
                  className="btn"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  style={{ opacity: page >= totalPages ? 0.4 : 1 }}
                >
                  PROXIMA →
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
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
                    <th style={DIVIDER}>Pista</th>
                    <th>Carro</th>
                    <th>Classe</th>
                    <th>Tipo</th>
                    <th className="num" style={DIVIDER}>
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
                    <th className="num" style={DIVIDER}>
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
                    const cls = !lap.isValid ? "invalid invalid-clean" : "";
                    const dash = (content) => (lap.isValid ? content : "—");
                    return (
                      <tr key={lap.id} className={cls}>
                        <td className="num text-muted">
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
                        <td className="text-muted whitespace-nowrap">
                          <Link
                            to={`/sessoes/${lap.sessionId}`}
                            className="text-muted hover:text-foreground"
                            style={{ textDecoration: "none" }}
                          >
                            {formatDateTime(lap.createdAt)}
                          </Link>
                        </td>
                        <td style={DIVIDER} className="whitespace-nowrap">
                          {lap.session.track.name}
                        </td>
                        <td>
                          <CarCell
                            name={lap.session.car}
                            imageUrl={carImages.get(lap.session.car) ?? null}
                          />
                        </td>
                        <td className="text-muted">{lap.session.carClass}</td>
                        <td>
                          <TypeBadge type={lap.session.type} />
                        </td>
                        <td className="num text-muted" style={DIVIDER}>
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
                        <td className="num" style={DIVIDER}>
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
          </section>
        )}
      </div>
    </div>
  );
}
