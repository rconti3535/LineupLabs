import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@shared/schema";

let connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Supabase (direct or pooler): use our SSL config so cert chain is accepted. Strip sslmode from URL
// so node-postgres doesn't override with strict SSL that fails on self-signed chain.
const isSupabase =
  connectionString.includes("supabase.co") || connectionString.includes("supabase.com");
if (isSupabase) {
  try {
    const u = new URL(connectionString);
    u.searchParams.delete("sslmode");
    connectionString = u.toString();
  } catch {
    // keep as-is if URL parsing fails
  }
}

const poolConfig: pg.PoolConfig = {
  connectionString,
  ...(isSupabase ? { ssl: { rejectUnauthorized: false } } : {}),
};

export const pool = new pg.Pool(poolConfig);
export const db = drizzle({ client: pool, schema });
