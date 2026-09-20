import { it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readdirSync, readFileSync } from "node:fs";
it("applies every SQL migration and enforces public versus runtime-role access", async () => {
  const pg = new PGlite();
  try {
    // Minimal Supabase-owned schema fixture; hosted Storage behavior still needs staging validation.
    await pg.exec(`CREATE ROLE anon NOLOGIN;CREATE ROLE authenticated NOLOGIN;
   CREATE SCHEMA storage;
   CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
   CREATE TABLE storage.objects(name text,bucket_id text,created_at timestamptz);
   ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;`);
    for (const name of readdirSync("db/migrations")
      .filter((n) => n.endsWith(".sql"))
      .sort())
      await pg.exec(readFileSync(`db/migrations/${name}`, "utf8"));
    const bucket = (
      await pg.query<{ public: boolean }>("SELECT public FROM storage.buckets")
    ).rows[0];
    expect(bucket.public).toBe(false);
    await pg.exec("SET ROLE anon");
    await expect(pg.query("SELECT * FROM orders")).rejects.toThrow(
      "permission denied",
    );
    await pg.exec("RESET ROLE;SET ROLE authenticated");
    await expect(pg.query("SELECT * FROM orders")).rejects.toThrow(
      "permission denied",
    );
    await pg.exec("RESET ROLE;SET ROLE dft_app");
    expect(
      (await pg.query("SELECT * FROM business_settings")).rows,
    ).toHaveLength(1);
    await expect(
      pg.exec("ALTER TABLE orders ADD COLUMN unauthorized text"),
    ).rejects.toThrow();
    await pg.exec("RESET ROLE");
  } finally {
    await pg.close();
  }
}, 20000);
