import "dotenv/config";
import { defineConfig } from "drizzle-kit";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

let url = process.env.DATABASE_URL;
const isSupabase = url.includes("supabase.co") || url.includes("supabase.com");
if (isSupabase) {
  const u = new URL(url);
  u.searchParams.delete("sslmode");
  url = u.toString();
}

export default defineConfig({
  out: "./migrations",
  schema: "./shared/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url,
    ssl: isSupabase ? { rejectUnauthorized: false } : undefined,
  },
});
