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
  return (pool ??= new Pool({
    connectionString: databaseUrl.toString(),
    max: 3,
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
  }));
}
export const db: DB = {
  query: (text, values) => getPool().query(text, values),
};
export async function transaction<T>(fn: (tx: DB) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL lock_timeout = '5s'");
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
