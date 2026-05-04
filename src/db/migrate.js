/**
 * Aplica as migrations Prisma no DB local automaticamente no startup.
 * Le os arquivos migration.sql de prisma/migrations/* e executa via better-sqlite3
 * se as tabelas ainda nao existirem.
 */

const path = require("node:path");
const fs = require("node:fs");
const Database = require("better-sqlite3");

function findMigrationsDir() {
  // Em dev, as migrations estao em {projeto}/prisma/migrations.
  // Em prod, teremos que empacotar (resources/prisma/migrations).
  const candidates = [
    path.resolve(__dirname, "../../prisma/migrations"),
    path.resolve(process.resourcesPath || "", "prisma/migrations"),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

function listMigrations(dir) {
  return fs
    .readdirSync(dir)
    .filter((n) => fs.statSync(path.join(dir, n)).isDirectory())
    .filter((n) => fs.existsSync(path.join(dir, n, "migration.sql")))
    .sort();
}

function ensureMigrationsTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _prisma_migrations (
      id TEXT PRIMARY KEY,
      checksum TEXT NOT NULL,
      finished_at DATETIME,
      migration_name TEXT NOT NULL,
      logs TEXT,
      rolled_back_at DATETIME,
      started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      applied_steps_count INTEGER NOT NULL DEFAULT 0
    );
  `);
}

function getAppliedMigrations(db) {
  const rows = db
    .prepare("SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL")
    .all();
  return new Set(rows.map((r) => r.migration_name));
}

function applyMigration(db, migrationName, sql) {
  const id = Math.random().toString(36).slice(2) + Date.now().toString(36);
  db.exec("BEGIN");
  try {
    db.exec(sql);
    db.prepare(
      "INSERT INTO _prisma_migrations (id, checksum, migration_name, finished_at, applied_steps_count) VALUES (?, ?, ?, CURRENT_TIMESTAMP, 1)"
    ).run(id, "", migrationName);
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

function runMigrations(dbFilePath, log) {
  const migrationsDir = findMigrationsDir();
  if (!migrationsDir) {
    log?.("[MIGRATE] diretorio de migrations nao encontrado, pulando");
    return;
  }

  fs.mkdirSync(path.dirname(dbFilePath), { recursive: true });
  const db = new Database(dbFilePath);
  try {
    ensureMigrationsTable(db);
    const applied = getAppliedMigrations(db);
    const migrations = listMigrations(migrationsDir);
    const pending = migrations.filter((m) => !applied.has(m));

    if (pending.length === 0) {
      log?.("[MIGRATE] DB ja atualizado");
      return;
    }

    log?.(`[MIGRATE] aplicando ${pending.length} migration(s)...`);
    for (const name of pending) {
      const sqlPath = path.join(migrationsDir, name, "migration.sql");
      const sql = fs.readFileSync(sqlPath, "utf-8");
      applyMigration(db, name, sql);
      log?.(`[MIGRATE] ${name} OK`);
    }
  } finally {
    db.close();
  }
}

module.exports = { runMigrations };
