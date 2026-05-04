import { defineConfig } from "vite";
import { builtinModules } from "node:module";

export default defineConfig({
  build: {
    rollupOptions: {
      external: [
        "electron",
        "koffi",
        "@prisma/adapter-better-sqlite3",
        "@prisma/client",
        "@prisma/client/runtime/client",
        "better-sqlite3",
        ...builtinModules,
        ...builtinModules.map((m) => `node:${m}`),
      ],
      output: {
        banner:
          'var __import_meta_url__ = require("url").pathToFileURL(__filename).href;',
      },
    },
  },
  define: {
    "import.meta.url": "__import_meta_url__",
  },
});
