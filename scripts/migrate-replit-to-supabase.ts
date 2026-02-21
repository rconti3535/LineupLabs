/**
 * Migrates all data from Replit PostgreSQL to Supabase PostgreSQL.
 *
 * Usage:
 *   1. Ensure the Supabase schema exists (run `npm run db:push` against Supabase first).
 *   2. Set environment variables:
 *      SOURCE_DATABASE_URL  - Replit DB (e.g. postgresql://postgres:password@helium/heliumdb?sslmode=disable)
 *      TARGET_DATABASE_URL  - Supabase DB (e.g. postgresql://postgres:PASSWORD@db.xxx.supabase.co:5432/postgres)
 *      Note: If your Supabase password contains # or @, URL-encode it (# → %23, @ → %40).
 *   3. Run: npx tsx scripts/migrate-replit-to-supabase.ts
 *
 * Tables are copied in FK-safe order. Sequences are reset after copy so new rows get correct IDs.
 */

import pg from "pg";
const { Client } = pg;

// Copy in FK-safe order (parents before children).
const TABLE_ORDER = [
  "users",
  "leagues",
  "teams",
  "players",
  "activities",
  "draft_picks",
  "player_adp",
  "league_transactions",
  "waivers",
  "waiver_claims",
  "daily_lineups",
  "league_matchups",
] as const;

// Truncate in reverse order so FKs are satisfied.
const TRUNCATE_ORDER = [...TABLE_ORDER].reverse();

async function getColumnNames(client: pg.Client, table: string): Promise<string[]> {
  const r = await client.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1
     ORDER BY ordinal_position`,
    [table]
  );
  return r.rows.map((row) => row.column_name);
}

async function copyTable(
  source: pg.Client,
  target: pg.Client,
  table: string
): Promise<{ rows: number }> {
  if (!(await tableExists(target, table))) {
    console.warn(`  Table "${table}" does not exist on target, skipping.`);
    return { rows: 0 };
  }
  const columns = await getColumnNames(source, table);
  if (columns.length === 0) {
    console.warn(`  Table "${table}" has no columns (might not exist on source), skipping.`);
    return { rows: 0 };
  }

  const cols = columns.join(", ");
  const placeholders = columns.map((_, i) => `$${i + 1}`).join(", ");
  const selectSql = `SELECT ${cols} FROM "${table}"`;
  const insertSql = `INSERT INTO "${table}" (${cols}) VALUES (${placeholders})`;

  const res = await source.query(selectSql);
  const rows = res.rows;
  const count = rows.length;

  if (count === 0) {
    console.log(`  ${table}: 0 rows`);
    return { rows: 0 };
  }

  for (const row of rows) {
    const values = columns.map((c) => row[c]);
    await target.query(insertSql, values);
  }

  console.log(`  ${table}: ${count} rows`);
  return { rows: count };
}

async function tableExists(client: pg.Client, table: string): Promise<boolean> {
  const r = await client.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1`,
    [table]
  );
  return r.rows.length > 0;
}

async function truncateTargetTables(target: pg.Client) {
  const existing: string[] = [];
  for (const table of TRUNCATE_ORDER) {
    if (await tableExists(target, table)) existing.push(`"${table}"`);
  }
  if (existing.length === 0) {
    console.log("  No target tables to truncate.");
    return;
  }
  await target.query(`TRUNCATE ${existing.join(", ")} RESTART IDENTITY CASCADE`);
  console.log("  Target tables truncated.");
}

async function resetSequences(target: pg.Client) {
  for (const table of TABLE_ORDER) {
    if (!(await tableExists(target, table))) continue;
    const seq = await target.query(
      `SELECT pg_get_serial_sequence('public."${table.replace(/"/g, '""')}"', 'id') AS seq`
    );
    const seqName = seq.rows[0]?.seq;
    if (seqName) {
      await target.query(
        `SELECT setval($1, COALESCE((SELECT MAX(id) FROM public."${table.replace(/"/g, '""')}"), 1))`,
        [seqName]
      );
    }
  }
  console.log("  Sequences reset.");
}

async function main() {
  const sourceUrl = process.env.SOURCE_DATABASE_URL;
  const targetUrl = process.env.TARGET_DATABASE_URL;

  if (!sourceUrl || !targetUrl) {
    console.error("Set SOURCE_DATABASE_URL and TARGET_DATABASE_URL.");
    process.exit(1);
  }

  const source = new Client({ connectionString: sourceUrl });
  const target = new Client({ connectionString: targetUrl });

  try {
    await source.connect();
    console.log("Connected to source (Replit).");
    await target.connect();
    console.log("Connected to target (Supabase).");

    console.log("Truncating target tables...");
    await truncateTargetTables(target);

    console.log("Copying data...");
    let total = 0;
    for (const table of TABLE_ORDER) {
      const { rows } = await copyTable(source, target, table);
      total += rows;
    }

    console.log("Resetting sequences on target...");
    await resetSequences(target);

    console.log(`\nDone. Migrated ${total} total rows.`);
  } catch (err) {
    console.error("Migration failed:", err);
    process.exit(1);
  } finally {
    await source.end();
    await target.end();
  }
}

main();
