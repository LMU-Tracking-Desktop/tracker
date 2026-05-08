import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import TrackSelect from "../components/TrackSelect.jsx";
import CarCell from "../components/CarCell.jsx";
import TypeBadge from "../components/TypeBadge.jsx";
import DeleteButton from "../components/DeleteButton.jsx";
import PageHeader from "../components/PageHeader.jsx";
import { Field } from "../components/Field.jsx";
import { formatDateTime, formatLapTime } from "../lib/format.js";

const TYPE_OPTIONS = [
  { value: "", label: "todos os tipos" },
  { value: "practice", label: "PRACTICE" },
  { value: "qualifying", label: "QUALIFYING" },
  { value: "race", label: "RACE" },
  { value: "warmup", label: "WARMUP" },
  { value: "testday", label: "TESTDAY" },
];

const PAGE_SIZE = 50;

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
        {total} {total === 1 ? "SESSÃO" : "SESSÕES"} · PÁGINA {page} /{" "}
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

export default function Sessoes() {
  const [tracks, setTracks] = useState([]);
  const [cars, setCars] = useState([]);
  const [trackId, setTrackId] = useState(null);
  const [type, setType] = useState("");
  const [sessions, setSessions] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [t, c] = await Promise.all([
        window.api?.listTracks?.() ?? [],
        window.api?.listCars?.() ?? [],
      ]);
      if (cancelled) return;
      setTracks(t || []);
      setCars(c || []);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const res = await window.api?.listSessions?.({
          trackId: trackId ?? null,
          type: type || null,
          page,
          pageSize: PAGE_SIZE,
        });
        if (!cancelled) {
          setSessions(res?.sessions ?? []);
          setTotal(res?.total ?? 0);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    const id = setInterval(load, 10000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [trackId, type, page]);

  useEffect(() => {
    setPage(1);
  }, [trackId, type]);

  const carImages = useMemo(
    () => new Map(cars.map((c) => [c.name, c.imageUrl])),
    [cars]
  );

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
        crumbs={[{ label: "SESSÕES" }]}
        actions={
          <span
            className="mono"
            style={{
              fontSize: 10,
              letterSpacing: "0.14em",
              color: "var(--tx-3)",
            }}
          >
            {total} TOTAL
          </span>
        }
      />

      {/* Filters */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) minmax(0, 280px)",
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
        <Field label="Tipo">
          <select
            className="select"
            value={type}
            onChange={(e) => setType(e.target.value)}
          >
            {TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {/* Table / states */}
      <div style={{ padding: "0 var(--pad) var(--pad)" }}>
        {loading && sessions.length === 0 ? (
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
        ) : sessions.length === 0 ? (
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
              NENHUMA SESSÃO COM ESSES FILTROS
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
              total={total}
              pageSize={PAGE_SIZE}
              onChange={setPage}
            />
            <div style={{ overflowX: "auto" }}>
              <table className="laps">
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Pista</th>
                    <th>Carro</th>
                    <th>Classe</th>
                    <th>Tipo</th>
                    <th className="num">Voltas</th>
                    <th className="num">Melhor</th>
                    <th className="num">Média</th>
                    <th style={{ width: 32 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((s) => (
                    <tr key={s.id}>
                      <td className="whitespace-nowrap">
                        <Link
                          to={`/sessoes/${s.id}`}
                          style={{
                            color: "var(--tx-1)",
                            textDecoration: "none",
                          }}
                        >
                          {formatDateTime(s.startedAt)}
                        </Link>
                      </td>
                      <td>{s.track.name}</td>
                      <td>
                        <CarCell
                          name={s.car}
                          imageUrl={carImages.get(s.car) ?? null}
                        />
                      </td>
                      <td style={{ color: "var(--tx-2)" }}>{s.carClass}</td>
                      <td>
                        <TypeBadge type={s.type} />
                      </td>
                      <td className="num" style={{ color: "var(--tx-1)" }}>
                        {s._count?.laps ?? 0}
                      </td>
                      <td
                        className="num"
                        style={{
                          color:
                            s.bestLap != null
                              ? "var(--speed)"
                              : "var(--tx-3)",
                          fontWeight: s.bestLap != null ? 600 : 400,
                        }}
                      >
                        {s.bestLap != null ? formatLapTime(s.bestLap) : "—"}
                      </td>
                      <td className="num" style={{ color: "var(--tx-2)" }}>
                        {s.avgLap != null ? formatLapTime(s.avgLap) : "—"}
                      </td>
                      <td className="text-right">
                        <DeleteButton
                          label="deletar sessão"
                          confirmMessage={`Deletar sessão de ${s.track.name}`}
                          confirmDetail={`${
                            s._count?.laps ?? 0
                          } voltas serão apagadas. Essa ação não pode ser desfeita.`}
                          onConfirm={async () => {
                            const ok = await window.api.deleteSession(s.id);
                            if (ok) {
                              setSessions((prev) =>
                                prev.filter((x) => x.id !== s.id)
                              );
                              setTotal((t) => Math.max(0, t - 1));
                            }
                          }}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
