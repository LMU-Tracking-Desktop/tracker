import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import TrackSelect from "../components/TrackSelect.jsx";
import CarCell from "../components/CarCell.jsx";
import TypeBadge from "../components/TypeBadge.jsx";
import DeleteButton from "../components/DeleteButton.jsx";
import { formatDateTime } from "../lib/format.js";

const TYPE_OPTIONS = [
  { value: "", label: "todos os tipos" },
  { value: "practice", label: "PRACTICE" },
  { value: "qualifying", label: "QUALIFYING" },
  { value: "race", label: "RACE" },
  { value: "warmup", label: "WARMUP" },
  { value: "testday", label: "TESTDAY" },
];

const PAGE_SIZE = 50;

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
    <div className="p-8">
      <div className="max-w-[1400px] mx-auto space-y-8">
        <div>
          <div className="mb-6">
            <span className="chip">SESSOES</span>
          </div>
          <h1 className="text-3xl font-semibold">Sessões</h1>
        </div>

        <section className="grid grid-cols-1 md:grid-cols-2 gap-4 md:items-end">
          <TrackSelect tracks={tracks} value={trackId} onChange={setTrackId} />
          <label className="block">
            <span className="label">Tipo</span>
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
          </label>
        </section>

        {loading && sessions.length === 0 ? (
          <section className="border hairline p-12 text-center text-muted mono text-xs tracking-widest">
            CARREGANDO...
          </section>
        ) : sessions.length === 0 ? (
          <section className="border hairline p-12 text-center text-muted mono text-xs tracking-widest">
            NENHUMA SESSAO COM ESSES FILTROS
          </section>
        ) : (
          <section className="border hairline">
            <div className="px-4 py-3 border-b hairline flex items-center justify-between">
              <span className="mono text-[10px] tracking-[0.2em] text-muted">
                {total} SESSOES · PAGINA {page} /{" "}
                {Math.max(1, Math.ceil(total / PAGE_SIZE))}
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
                  disabled={page >= Math.ceil(total / PAGE_SIZE)}
                  onClick={() =>
                    setPage((p) =>
                      Math.min(Math.ceil(total / PAGE_SIZE), p + 1)
                    )
                  }
                  style={{
                    opacity: page >= Math.ceil(total / PAGE_SIZE) ? 0.4 : 1,
                  }}
                >
                  PROXIMA →
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="laps">
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Pista</th>
                    <th>Carro</th>
                    <th>Classe</th>
                    <th>Tipo</th>
                    <th className="num">Voltas</th>
                    <th style={{ width: 32 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((s) => (
                    <tr key={s.id}>
                      <td className="whitespace-nowrap">
                        <Link
                          to={`/sessoes/${s.id}`}
                          className="text-muted hover:text-foreground"
                          style={{ textDecoration: "none" }}
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
                      <td className="text-muted">{s.carClass}</td>
                      <td>
                        <TypeBadge type={s.type} />
                      </td>
                      <td className="num">{s._count?.laps ?? 0}</td>
                      <td className="text-right">
                        <DeleteButton
                          label="deletar sessao"
                          confirmMessage={`Deletar sessao de ${s.track.name}`}
                          confirmDetail={`${s._count?.laps ?? 0} voltas serao apagadas. Essa acao nao pode ser desfeita.`}
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
          </section>
        )}
      </div>
    </div>
  );
}
