/**
 * Mapa de pistas: dado o nome que o LMU expoe (mTrackName) ou o que o app
 * salva na tabela Track, devolve a URL do mapa local (servido via lmu-asset://).
 *
 * Os arquivos vivem em assets/track-maps/, descritos em manifest.json gerado
 * por scripts/download-track-maps.js.
 */

import manifest from "../../../assets/track-maps/manifest.json";

const ASSET_BASE = "lmu-asset://asset/track-maps/";

function normalize(s) {
  if (!s) return "";
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // remove acentos
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

// Pre-normaliza o manifest uma vez.
const ENTRIES = manifest.map((m) => ({
  name: m.name,
  file: m.file,
  norm: normalize(m.name),
}));

/**
 * Retorna { file, url, matchedName } pra um trackName, ou null se nao houver match.
 * Aceita variacoes: "Spa-Francorchamps", "Circuit De Spa-Francorchamps", "Spa", etc.
 */
export function findTrackMap(trackName) {
  const q = normalize(trackName);
  if (!q) return null;

  // 1) Exato
  let hit = ENTRIES.find((e) => e.norm === q);

  // 2) Substring: query contem manifest (ex: "Le Mans La Sarthe Endurance" contem "lemanslasarthe")
  //    Preferimos o match mais longo pra evitar pegar "Spa" qd existe "Spa-Francorchamps".
  if (!hit) {
    const candidates = ENTRIES.filter((e) => q.includes(e.norm));
    if (candidates.length) {
      hit = candidates.sort((a, b) => b.norm.length - a.norm.length)[0];
    }
  }

  // 3) Substring inversa: manifest contem query
  if (!hit) {
    const candidates = ENTRIES.filter((e) => e.norm.includes(q));
    if (candidates.length) {
      hit = candidates.sort((a, b) => a.norm.length - b.norm.length)[0];
    }
  }

  if (!hit) return null;
  return {
    file: hit.file,
    url: ASSET_BASE + hit.file,
    matchedName: hit.name,
  };
}

export function getTrackMapUrl(trackName) {
  const r = findTrackMap(trackName);
  return r ? r.url : null;
}
