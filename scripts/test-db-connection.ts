/**
 * Test database connectivity. Loads .env and tries to connect to DATABASE_URL.
 * Run: npx tsx scripts/test-db-connection.ts
 */
import "dotenv/config";
import pg from "pg";

let url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

// Supabase (direct or pooler): use our own SSL config so cert chain is accepted.
const isSupabase = url.includes("supabase.co") || url.includes("supabase.com");
if (isSupabase) {
  try {
    const u = new URL(url);
    u.searchParams.delete("sslmode");
    url = u.toString();
  } catch {
    // keep url as-is if parsing fails
  }
}

const client = new pg.Client({
  connectionString: url,
  ...(isSupabase ? { ssl: { rejectUnauthorized: false } } : {}),
});

client
  .connect()
  .then(() => {
    console.log("Database connection OK.");
    return client.query("SELECT 1");
  })
  .then(() => client.end())
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Database connection failed:", err.message);
    process.exit(1);
  });
