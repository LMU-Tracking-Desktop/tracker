export function formatLapTime(seconds) {
  if (seconds == null || !isFinite(seconds) || seconds < 0) return "--:--.---";
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  return `${m}:${s.toFixed(3).padStart(6, "0")}`;
}

export function formatSector(seconds) {
  if (seconds == null) return "--.---";
  return seconds.toFixed(3);
}

export function formatFuel(v, digits = 2) {
  if (v == null) return "--";
  return v.toFixed(digits);
}

const TZ = "America/Sao_Paulo";

export function formatDateTime(d) {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TZ,
  });
}
