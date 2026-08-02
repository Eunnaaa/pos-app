import "dotenv/config";
import { pool } from "../db";

async function seed() {
  await pool.query("select 1");
  console.info("No demo data inserted. Create the owner through sign-up/onboarding, then enter business data from the management UI.");
}

seed()
  .catch((error: unknown) => {
    console.error("Seed check failed", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
