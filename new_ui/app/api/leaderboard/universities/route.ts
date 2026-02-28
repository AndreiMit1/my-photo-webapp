import { NextResponse } from "next/server";
import sqlite3 from "sqlite3";
import { open } from "sqlite";

export async function GET() {
  const dbPath = process.env.RESULTS_DB_PATH ?? "../results.db";
  const db = await open({ filename: dbPath, driver: sqlite3.Database });

  const rows = await db.all(`
    SELECT
      u.org_cluster_id as id,
      u.org_norm as label,
      COUNT(DISTINCT u.user_id) as usersCount,
      MAX(s.total_score) as bestTotalScore
    FROM submissions s
    JOIN users u ON u.user_id = s.user_id
    WHERE u.org_cluster_id IS NOT NULL
    GROUP BY u.org_cluster_id, u.org_norm
    ORDER BY usersCount DESC, bestTotalScore DESC
    LIMIT 200
  `);

  return NextResponse.json({ items: rows });
}