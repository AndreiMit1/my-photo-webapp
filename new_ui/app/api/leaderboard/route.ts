import { NextRequest, NextResponse } from "next/server";
import sqlite3 from "sqlite3";
import { open } from "sqlite";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const limit = Math.min(Number(searchParams.get("limit") ?? "50"), 200);

  const orgClusterId = searchParams.get("orgClusterId");
  const facultyClusterId = searchParams.get("facultyClusterId");

  const dbPath = process.env.RESULTS_DB_PATH ?? "../results.db";
  const db = await open({ filename: dbPath, driver: sqlite3.Database });

  let where = "";
  const params: any[] = [];

  if (orgClusterId) {
    where = "WHERE u.org_cluster_id = ?";
    params.push(Number(orgClusterId));
  } else if (facultyClusterId) {
    where = "WHERE u.faculty_cluster_id = ?";
    params.push(Number(facultyClusterId));
  }

  params.push(limit);

  const rows = await db.all(
    `
    SELECT
      u.user_id as userId,
      COALESCE(u.nickname, 'user-' || substr(CAST(u.user_id AS TEXT), -4)) as nickname,
      MAX(s.total_score) as bestTotalScore,
      ROUND(AVG(s.avg_score)) as avgScore,
      COUNT(*) as runs
    FROM submissions s
    JOIN users u ON u.user_id = s.user_id
    ${where}
    GROUP BY u.user_id
    ORDER BY bestTotalScore DESC
    LIMIT ?
    `,
    ...params
  );

  const items = rows.map((r: any, idx: number) => ({
    rank: idx + 1,
    userId: r.userId,
    nickname: r.nickname,
    bestTotalScore: r.bestTotalScore ?? 0,
    avgScore: r.avgScore ?? 0,
    runs: r.runs ?? 0,
  }));

  return NextResponse.json({
    updatedAt: Math.floor(Date.now() / 1000),
    items,
  });
}