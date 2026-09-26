import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import pg from "pg";

const { Pool } = pg;

const databaseUrl = process.env.DATABASE_URL?.trim();

if (!databaseUrl) {
  console.error("[AasPass] DATABASE_URL is missing.");
  process.exit(1);
}

const pool = new Pool({
  connectionString: databaseUrl,
  max: 1,
  connectionTimeoutMillis: 15000,
});

try {
  const schemaPath = resolve(process.cwd(), "..", "database", "schema.sql");
  const seedPath = resolve(process.cwd(), "..", "database", "seed.sql");

  console.log("[AasPass] Applying canonical schema...");
  const schema = await readFile(schemaPath, "utf8");
  await pool.query(schema);

  console.log("[AasPass] Applying development seed...");
  const seed = await readFile(seedPath, "utf8");
  await pool.query(seed);

  console.log("[AasPass] Database bootstrap complete.");
} catch (error) {
  console.error("[AasPass] Database bootstrap failed.");
  console.error(error);
  process.exit(1);
} finally {
  await pool.end();
}