/**
 * Baixa os mapas de pista do LMU a partir do dataset publico do Sanity
 * usado por TrackTitan. Salva em assets/track-maps/ com manifest.json.
 *
 * Uso:
 *   node scripts/download-track-maps.js
 *
 * Re-executar e idempotente: arquivos ja baixados sao pulados.
 */

const fs = require("node:fs");
const path = require("node:path");
const https = require("node:https");

const SANITY_PROJECT = "5xqo0b3r";
const SANITY_DATASET = "production";
const LMU_GAME_ID = "6e03d0db-582a-43d2-818f-25bcb9575f6f";

const OUT_DIR = path.join(__dirname, "..", "assets", "track-maps");
const MANIFEST_PATH = path.join(OUT_DIR, "manifest.json");

function get(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return resolve(get(res.headers.location));
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        }
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolve(Buffer.concat(chunks)));
        res.on("error", reject);
      })
      .on("error", reject);
  });
}

function slugify(name) {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

async function fetchLmuTracks() {
  const query =
    `*[_type=="track" && "${LMU_GAME_ID}" in games[]._ref]` +
    `{name, "image": image.asset->url}`;
  const url =
    `https://${SANITY_PROJECT}.api.sanity.io/v2021-06-07/data/query/${SANITY_DATASET}` +
    `?query=${encodeURIComponent(query)}`;
  const buf = await get(url);
  const data = JSON.parse(buf.toString("utf8"));
  return data.result || [];
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  console.log("Buscando pistas LMU no Sanity...");
  const tracks = await fetchLmuTracks();
  console.log(`Encontradas ${tracks.length} pistas.`);

  // Dedup por URL de imagem (Spa e Spa-Endurance compartilham o mesmo arquivo).
  const seenUrls = new Map(); // url -> slug usado
  const manifest = [];

  for (const t of tracks) {
    if (!t.image) {
      console.log(`  - SKIP "${t.name}" (sem imagem)`);
      continue;
    }
    const ext = path.extname(new URL(t.image).pathname) || ".png";
    let file;
    if (seenUrls.has(t.image)) {
      // mesma imagem ja baixada com outro slug, reusa
      file = seenUrls.get(t.image);
      console.log(`  ~ "${t.name}" reusa ${file}`);
    } else {
      const slug = slugify(t.name);
      file = `${slug}${ext}`;
      const dest = path.join(OUT_DIR, file);
      if (fs.existsSync(dest)) {
        console.log(`  = "${t.name}" ja existe (${file})`);
      } else {
        process.stdout.write(`  + "${t.name}" -> ${file}... `);
        const buf = await get(t.image);
        fs.writeFileSync(dest, buf);
        console.log(`${(buf.length / 1024).toFixed(1)} KB`);
      }
      seenUrls.set(t.image, file);
    }
    manifest.push({ name: t.name, file });
  }

  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
  console.log(`\nManifest: ${MANIFEST_PATH} (${manifest.length} entradas)`);
}

main().catch((e) => {
  console.error("ERRO:", e.message);
  process.exit(1);
});
