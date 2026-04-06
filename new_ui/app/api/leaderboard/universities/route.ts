import { NextResponse } from "next/server";
import sqlite3 from "sqlite3";
import { open } from "sqlite";

export async function GET() {
  const dbPath = process.env.RESULTS_DB_PATH ?? "../results.db";
  const db = await open({ filename: dbPath, driver: sqlite3.Database });

  const rows = await db.all(`
    SELECT
      u.org_cluster_id as id,
      MIN(COALESCE(NULLIF(u.org_raw, ''), u.org_norm, 'Без названия')) as label,
      COUNT(DISTINCT u.user_id) as usersCount
    FROM submissions s
    JOIN users u ON u.user_id = s.user_id
    WHERE u.wants_leaderboard = 1
      AND u.participant_id IS NOT NULL
      AND u.org_cluster_id IS NOT NULL
    GROUP BY u.org_cluster_id
    ORDER BY usersCount DESC, label ASC
    LIMIT 200
  `);

  await db.close();

  return NextResponse.json({ items: rows });
}