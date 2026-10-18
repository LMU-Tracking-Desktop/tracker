const { FusesPlugin } = require("@electron-forge/plugin-fuses");
const { FuseV1Options, FuseVersion } = require("@electron/fuses");
const fs = require("node:fs");
const path = require("node:path");

// Modulos nativos (externals do Vite) que precisam vir junto via node_modules.
// plugin-vite nao copia node_modules — faz so o bundle do Vite. Copiamos manualmente.
// Deps nao bundladas pelo Vite (marcadas external ou transitivas de externals).
// Copiamos as pastas inteiras pra garantir que todas as deps transitivas vem junto.
const NATIVE_DEPS = [
  "koffi",
  "better-sqlite3",
  "bindings",
  "file-uri-to-path",
  // @prisma/* — ver @prisma/adapter-better-sqlite3 e @prisma/client
  "@prisma/adapter-better-sqlite3",
  "@prisma/client",
  "@prisma/client-runtime-utils",
  "@prisma/driver-adapter-utils",
  "@prisma/debug",
];

// Modulos com binario atrelado ao ABI do runtime (nao N-API). koffi usa
// N-API e serve pra qualquer versao; better-sqlite3 nao.
const ABI_BOUND_DEPS = ["better-sqlite3"];

// Carrega cada .node empacotado com o Electron do projeto (mesma versao do
// app). Se o ABI nao bater, o app instalado nem abre o banco — falha o build
// aqui em vez de publicar um instalador quebrado (aconteceu na v1.0.35).
function verifyNativeAbi(buildPath) {
  const { execFileSync } = require("node:child_process");
  const electronExe = require("electron"); // path do binario do Electron
  for (const dep of ABI_BOUND_DEPS) {
    const nodeFile = path.resolve(buildPath, "node_modules", dep, "build", "Release", `${dep.replace(/-/g, "_")}.node`);
    if (!fs.existsSync(nodeFile)) {
      throw new Error(`[native-abi] ${dep}: binario nao encontrado em ${nodeFile}`);
    }
    try {
      execFileSync(electronExe, ["-e", "require(process.argv[1])", nodeFile], {
        env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
        stdio: "pipe",
      });
    } catch (e) {
      const lines = String(e.stderr || e.message).split("\n");
      const msg = lines.filter((l) => /NODE_MODULE_VERSION|Error:/.test(l)).join(" ").trim() || lines[0];
      throw new Error(`[native-abi] ${dep} nao carrega no Electron empacotado: ${msg}`);
    }
  }
}

module.exports = {
  hooks: {
    // O afterCopy abaixo copia os modulos nativos de ./node_modules como
    // estao. Se o binario foi compilado pro Node (npm install/ci), o app
    // quebra — entao recompila pro Electron do projeto antes de empacotar.
    prePackage: async () => {
      const { rebuild } = require("@electron/rebuild");
      await rebuild({
        buildPath: __dirname,
        electronVersion: require("electron/package.json").version,
        onlyModules: ABI_BOUND_DEPS,
        force: true,
      });
    },
    postPackage: async (_config, { outputPaths }) => {
      for (const out of outputPaths) {
        verifyNativeAbi(path.join(out, "resources", "app.asar.unpacked"));
      }
    },
  },
  packagerConfig: {
    asar: {
      unpack: "**/*.{node,dll}",
    },
    name: "LMU Timing",
    executableName: "lmu-desktop",
    icon: "./assets/logo",
    extraResource: ["./assets", "./prisma"],
    afterCopy: [
      (buildPath, _electronVersion, _platform, _arch, callback) => {
        try {
          const srcRoot = path.join(__dirname, "node_modules");
          const destRoot = path.join(buildPath, "node_modules");
          fs.mkdirSync(destRoot, { recursive: true });
          for (const dep of NATIVE_DEPS) {
            const src = path.join(srcRoot, dep);
            const dest = path.join(destRoot, dep);
            if (fs.existsSync(src)) {
              fs.cpSync(src, dest, { recursive: true });
            }
          }
          callback();
        } catch (e) {
          callback(e);
        }
      },
    ],
  },
  rebuildConfig: {},
  // `npm run publish` (rodado pelo .github/workflows/release.yml ao dar push
  // de uma tag vX.Y.Z) sobe Setup.exe + .nupkg + RELEASES pro release.
  // Os 3 sao necessarios pro auto-update (src/updater.js) via Squirrel.
  publishers: [
    {
      name: "@electron-forge/publisher-github",
      config: {
        repository: { owner: "LMU-Tracking-Desktop", name: "tracker" },
        prerelease: false,
        draft: false,
      },
    },
  ],
  makers: [
    {
      name: "@electron-forge/maker-squirrel",
      config: {
        name: "lmu_desktop",
        setupExe: "LMU-Timing-Setup.exe",
        setupIcon: "./assets/logo.ico",
        iconUrl:
          "https://raw.githubusercontent.com/placeholder/placeholder/main/logo.ico",
      },
    },
    {
      name: "@electron-forge/maker-zip",
      platforms: ["darwin"],
    },
    {
      name: "@electron-forge/maker-deb",
      config: {},
    },
    {
      name: "@electron-forge/maker-rpm",
      config: {},
    },
  ],
  plugins: [
    {
      name: "@electron-forge/plugin-auto-unpack-natives",
      config: {},
    },
    {
      name: "@electron-forge/plugin-vite",
      config: {
        build: [
          {
            entry: "src/main.js",
            config: "vite.main.config.mjs",
            target: "main",
          },
          {
            entry: "src/preload.js",
            config: "vite.preload.config.mjs",
            target: "preload",
          },
        ],
        renderer: [
          {
            name: "main_window",
            config: "vite.renderer.config.mjs",
          },
        ],
      },
    },
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};
