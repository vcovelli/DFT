import { readFile, readdir } from "node:fs/promises";
import pg from "pg";
const client = new pg.Client({
  connectionString:
    process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL,
  ssl:
    process.env.NODE_ENV === "production"
      ? {
          rejectUnauthorized: true,
          ...(process.env.DATABASE_CA_CERT
            ? { ca: process.env.DATABASE_CA_CERT.replace(/\\n/g, "\n") }
            : {}),
        }
      : undefined,
});
await client.connect();
try {
  await client.query("SELECT pg_advisory_lock(723984)");
  await client.query(
    "CREATE TABLE IF NOT EXISTS schema_migrations(name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
  );
  for (const name of (await readdir("db/migrations"))
    .filter((n) => n.endsWith(".sql"))
    .sort()) {
    if (
      (
        await client.query("SELECT 1 FROM schema_migrations WHERE name=$1", [
          name,
        ])
      ).rowCount
    )
      continue;
    await client.query("BEGIN");
    try {
      await client.query(await readFile(`db/migrations/${name}`, "utf8"));
      await client.query("INSERT INTO schema_migrations(name) VALUES($1)", [
        name,
      ]);
      await client.query("COMMIT");
      console.log(`Applied ${name}`);
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    }
  }
} finally {
  await client.end();
}
