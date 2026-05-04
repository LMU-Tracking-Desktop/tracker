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

module.exports = {
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
