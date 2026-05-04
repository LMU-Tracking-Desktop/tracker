/**
 * Prisma client wrapper — aponta pro SQLite local.
 * Em dev: prisma/dev.db (relativo ao projeto).
 * Em prod: %APPDATA%/lmu-desktop/data.db
 */

const path = require("node:path");
const fs = require("node:fs");
const { PrismaClient } = require("../generated/prisma/client");
const { PrismaBetterSqlite3 } = require("@prisma/adapter-better-sqlite3");

function createPrisma(dbFilePath) {
  fs.mkdirSync(path.dirname(dbFilePath), { recursive: true });
  const adapter = new PrismaBetterSqlite3({ url: `file:${dbFilePath}` });
  return new PrismaClient({ adapter });
}

module.exports = { createPrisma };
