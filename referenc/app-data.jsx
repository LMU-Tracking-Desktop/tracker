// app-data.jsx — realistic mock data, deterministic

const TRACKS = [
  { id: "paul-ricard", name: "Paul Ricard - 1A-V2", short: "PAUL RICARD", length: 5755, sectors: [1700, 3200, 5755] },
  { id: "le-mans", name: "Circuit de la Sarthe", short: "LE MANS", length: 13626, sectors: [4200, 8800, 13626] },
  { id: "spa", name: "Spa-Francorchamps", short: "SPA", length: 7004, sectors: [2200, 4900, 7004] },
  { id: "monza", name: "Monza", short: "MONZA", length: 5793, sectors: [1900, 3800, 5793] },
  { id: "fuji", name: "Fuji Speedway", short: "FUJI", length: 4563, sectors: [1500, 3000, 4563] },
];

const CARS = [
  { make: "BMW", model: "M4 GT3", class: "GT3" },
  { make: "Mercedes-AMG", model: "GT3", class: "GT3" },
  { make: "Ferrari", model: "296 GT3", class: "GT3" },
  { make: "Lamborghini", model: "Huracán GT3", class: "GT3" },
  { make: "Lexus", model: "RC F GT3", class: "GT3" },
  { make: "Oreca", model: "07", class: "LMP2" },
  { make: "Cadillac", model: "V-Series.R", class: "Hypercar" },
  { make: "Toyota", model: "GR010", class: "Hypercar" },
  { make: "Porsche", model: "963", class: "Hypercar" },
];

const SESSION_TYPES = ["practice", "qualifying", "race"];

// deterministic PRNG
function mulberry(seed) {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function fmtLap(ms) {
  if (ms == null) return "—";
  const m = Math.floor(ms / 60000);
  const s = ((ms % 60000) / 1000).toFixed(3);
  return `${m}:${s.padStart(6, "0")}`;
}
function fmtSector(ms) {
  if (ms == null) return "—";
  const m = Math.floor(ms / 60000);
  const s = ((ms % 60000) / 1000).toFixed(3);
  return m > 0 ? `${m}:${s.padStart(6, "0")}` : s;
}
function fmtDelta(ms) {
  if (ms == null) return "—";
  const sign = ms >= 0 ? "+" : "−";
  return `${sign}${(Math.abs(ms) / 1000).toFixed(3)}`;
}
function fmtDate(d) {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = String(d.getFullYear()).slice(2);
  const hh = String(d.getHours()).padStart(2, "0");
  const mn = String(d.getMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${yy}, ${hh}:${mn}`;
}

// Build sessions
function buildSessions() {
  const rng = mulberry(42);
  const out = [];
  const start = new Date(2026, 4, 7, 21, 0); // 07/05/26 21:00
  for (let i = 0; i < 70; i++) {
    const car = CARS[Math.floor(rng() * CARS.length)];
    const track = TRACKS[Math.floor(rng() * (i < 20 ? 1 : TRACKS.length))];
    // for first 20 sessions, use Paul Ricard for consistency with screenshots
    const type = SESSION_TYPES[Math.floor(rng() * (i < 5 ? 1 : 3))];
    const lapCount = Math.max(0, Math.floor(rng() * 28));
    const baseTime = car.class === "Hypercar" ? 95000 : car.class === "LMP2" ? 102000 : 118000;
    const noise = () => (rng() - 0.5) * 1200;
    const laps = [];
    let bestMs = Infinity;
    for (let j = 0; j < lapCount; j++) {
      const ms = Math.round(baseTime + noise() + (j === 0 ? 4000 : 0) + (rng() < 0.06 ? 8000 : 0));
      const valid = rng() > 0.13;
      const touch = !valid && rng() > 0.5;
      const s1 = Math.round(ms * (0.295 + (rng() - 0.5) * 0.01));
      const s2 = Math.round(ms * (0.555 + (rng() - 0.5) * 0.01));
      const s3 = ms - s1 - s2;
      const fuelLeft = Math.max(2, 95 - j * 3 - rng() * 0.6);
      laps.push({ n: j + 1, ms, valid, touch, s1, s2, s3, fuel: fuelLeft, fuelUsed: 2.9 + rng() * 0.4, tire: Math.max(80, 100 - j * 0.7 - rng() * 0.4) });
      if (valid && ms < bestMs) bestMs = ms;
    }
    const dt = new Date(start.getTime() - i * 1000 * 60 * (37 + Math.floor(rng() * 200)));
    out.push({
      id: "S" + (i + 1),
      track, car, type, laps, lapCount, bestMs: bestMs === Infinity ? null : bestMs,
      avgMs: laps.length ? Math.round(laps.reduce((a, l) => a + l.ms, 0) / laps.length) : null,
      datetime: dt,
      fuelTank: 120,
    });
  }
  return out;
}

// Build telemetry channels for a lap (deterministic)
function buildChannels(seed = 1, len = 5755) {
  const rng = mulberry(seed * 7919);
  const points = 600; // resolution
  const distance = Array.from({ length: points }, (_, i) => Math.round((i / (points - 1)) * len));
  const corners = [0.07, 0.13, 0.22, 0.32, 0.42, 0.51, 0.6, 0.7, 0.78, 0.86, 0.92];
  const cornerIntensity = corners.map(() => 0.5 + rng() * 0.5);

  const cornerMass = (t) => {
    let v = 0;
    corners.forEach((c, i) => {
      const w = Math.exp(-Math.pow((t - c) * 70, 2)) * cornerIntensity[i];
      v += w;
    });
    return Math.min(1, v);
  };

  const throttle = [], brake = [], steer = [], speed = [], gear = [], rpm = [];
  for (let i = 0; i < points; i++) {
    const t = i / (points - 1);
    const cm = cornerMass(t);
    const thr = Math.max(0, Math.min(1, 1 - cm * 1.2 + (rng() - 0.5) * 0.05));
    const brk = Math.max(0, Math.min(1, Math.max(0, cm - 0.4) * 2.4));
    const stear = Math.max(-1, Math.min(1, (Math.sin(t * 53 + seed) * cm) + (rng() - 0.5) * 0.05));
    const spd = Math.max(50, Math.min(310, 60 + (1 - cm) * 220 + (rng() - 0.5) * 8));
    const g = Math.max(1, Math.min(8, Math.round(2 + spd / 50 + (rng() - 0.5) * 0.5)));
    const rpmv = Math.max(2000, Math.min(9500, 3000 + thr * 6000 + (rng() - 0.5) * 200));
    throttle.push(thr);
    brake.push(brk);
    steer.push(stear);
    speed.push(spd);
    gear.push(g);
    rpm.push(rpmv);
  }
  return { distance, throttle, brake, steer, speed, gear, rpm, length: len };
}

const SESSIONS = buildSessions();

window.LMU_DATA = {
  TRACKS, CARS, SESSIONS,
  fmtLap, fmtSector, fmtDelta, fmtDate, mulberry, buildChannels,
};
