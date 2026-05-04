/**
 * Gera assets/logo.ico a partir de assets/logo.png.
 * Inclui varios tamanhos (16, 24, 32, 48, 64, 128, 256) pro Windows usar
 * a resolucao certa em cada contexto (taskbar, desktop, atalho, etc).
 */
const fs = require("node:fs");
const path = require("node:path");

const src = path.join(__dirname, "..", "assets", "logo.png");
const dest = path.join(__dirname, "..", "assets", "logo.ico");

if (!fs.existsSync(src)) {
  console.error("[icon] nao encontrou", src);
  process.exit(1);
}

(async () => {
  const mod = await import("png-to-ico");
  const pngToIco = mod.default || mod;
  const buf = await pngToIco(src);
  fs.writeFileSync(dest, buf);
  console.log(`[icon] gerado: ${dest} (${buf.length} bytes)`);
})().catch((e) => {
  console.error("[icon] erro:", e);
  process.exit(1);
});
