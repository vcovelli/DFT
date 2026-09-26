import "server-only";
import { Pool, type QueryResultRow } from "pg";
import { env } from "./env";
export interface DB {
  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: unknown[],
  ): Promise<{ rows: T[]; rowCount: number | null }>;
}
let pool: Pool;
function getPool() {
  const e = env();
  const databaseUrl = new URL(e.DATABASE_URL);
  if (process.env.NODE_ENV === "production")
    for (const key of ["sslmode", "sslcert", "sslkey", "sslrootcert"])
      databaseUrl.searchParams.delete(key);
  if (pool) return pool;
  pool = new Pool({
    connectionString: databaseUrl.toString(),
    max: 2,
    query_timeout: 10000,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 10000,
    ssl:
      process.env.NODE_ENV === "production"
        ? {
            rejectUnauthorized: true,
            ...(e.DATABASE_CA_CERT
              ? { ca: e.DATABASE_CA_CERT.replace(/\\n/g, "\n") }
              : {}),
          }
        : undefined,
  });
  pool.on("error", () =>
    console.error(
      JSON.stringify({ level: "error", code: "database_pool_error" }),
    ),
  );
  return pool;
}
export const db: DB = {
  query: async (text, values) => {
    try {
      return await getPool().query(text, values);
    } catch {
      throw new Error("database_unavailable");
    }
  },
};
export async function transaction<T>(fn: (tx: DB) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL lock_timeout = '5s'");
    await client.query("SET LOCAL statement_timeout = '8s'");
    await client.query("SET LOCAL idle_in_transaction_session_timeout = '15s'");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
