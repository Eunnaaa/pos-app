import "dotenv/config";
import { pool } from "../db";

async function clearData() {
  if (!process.argv.includes("--yes")) {
    throw new Error("Refusing to clear data without --yes. Run: npm run db:clear -- --yes");
  }

  const result = await pool.query<{ table_name: string }>(`
    select table_name
    from information_schema.tables
    where table_schema = 'public'
      and table_type = 'BASE TABLE'
      and table_name <> '__drizzle_migrations'
    order by table_name
  `);
  if (!result.rows.length) {
    console.info("No application tables found; nothing to clear");
    return;
  }

  const identifiers = result.rows.map(({ table_name }) => `"${table_name.replaceAll('"', '""')}"`).join(", ");
  await pool.query("begin");
  try {
    await pool.query(`truncate table ${identifiers} restart identity cascade`);
    await pool.query("commit");
    console.info(`Cleared all records from ${result.rows.length} application tables`);
  } catch (error) {
    await pool.query("rollback");
    throw error;
  }
}

clearData()
  .catch((error: unknown) => {
    console.error("Database clear failed", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
