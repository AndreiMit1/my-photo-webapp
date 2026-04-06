import { NextRequest, NextResponse } from "next/server";
import sqlite3 from "sqlite3";
import { open } from "sqlite";

type RawRow = {
  userId: number;
  participantId: string;
  orgRaw: string;
  facultyRaw: string;
  totalScore: number;
};

type UserAgg = {
  userId: number;
  participantId: string;
  orgRaw: string;
  facultyRaw: string;
  scores: number[];
  meanScore: number;
  runs: number;
  bayesScore: number;
};

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  const limit = Math.min(Number(searchParams.get("limit") ?? "50"), 200);
  const orgClusterId = searchParams.get("orgClusterId");
  const facultyClusterId = searchParams.get("facultyClusterId");

  const dbPath = process.env.RESULTS_DB_PATH ?? "../results.db";
  const db = await open({ filename: dbPath, driver: sqlite3.Database });

  let where = "WHERE u.wants_leaderboard = 1 AND u.participant_id IS NOT NULL";
  const params: number[] = [];

  if (orgClusterId) {
    where += " AND u.org_cluster_id = ?";
    params.push(Number(orgClusterId));
  } else if (facultyClusterId) {
    where += " AND u.faculty_cluster_id = ?";
    params.push(Number(facultyClusterId));
  }

  const rawRows = await db.all<RawRow[]>(
    `
    SELECT
      u.user_id as userId,
      u.participant_id as participantId,
      u.org_raw as orgRaw,
      u.faculty_raw as facultyRaw,
      s.total_score as totalScore
    FROM submissions s
    JOIN users u ON u.user_id = s.user_id
    ${where}
    `,
    ...params
  );

  await db.close();

  if (!rawRows.length) {
    return NextResponse.json({
      updatedAt: Math.floor(Date.now() / 1000),
      items: [],
    });
  }

  const byUser = new Map<number, UserAgg>();

  for (const row of rawRows) {
    if (!byUser.has(row.userId)) {
      byUser.set(row.userId, {
        userId: row.userId,
        participantId: row.participantId,
        orgRaw: row.orgRaw,
        facultyRaw: row.facultyRaw,
        scores: [],
        meanScore: 0,
        runs: 0,
        bayesScore: 0,
      });
    }

    byUser.get(row.userId)!.scores.push(Number(row.totalScore) || 0);
  }

  const users = Array.from(byUser.values());

  for (const user of users) {
    user.runs = user.scores.length;
    user.meanScore =
      user.scores.length > 0
        ? user.scores.reduce((a, b) => a + b, 0) / user.scores.length
        : 0;
  }

  // 1. Общее среднее mu
  const mu =
    users.reduce((sum, u) => sum + u.meanScore, 0) / users.length;

  // 2. Межучастниковая дисперсия tau^2
  let tau2 = 0;
  if (users.length > 1) {
    tau2 =
      users.reduce((sum, u) => sum + (u.meanScore - mu) ** 2, 0) /
      (users.length - 1);
  }

  // 3. Внутриучастниковая дисперсия sigma^2
  let sigmaNumerator = 0;
  let sigmaDenominator = 0;

  for (const user of users) {
    if (user.scores.length <= 1) continue;

    sigmaNumerator += user.scores.reduce(
      (sum, y) => sum + (y - user.meanScore) ** 2,
      0
    );
    sigmaDenominator += user.scores.length - 1;
  }

  const sigma2 =
    sigmaDenominator > 0 ? sigmaNumerator / sigmaDenominator : 0;

  // 4. Lambda = sigma^2 / tau^2
  const lambda =
    tau2 > 1e-12 ? sigma2 / tau2 : 0;

  // 5. Байесовская оценка
  for (const user of users) {
    const n = user.runs;
    const ybar = user.meanScore;

    user.bayesScore =
      lambda > 0
        ? (n / (n + lambda)) * ybar + (lambda / (n + lambda)) * mu
        : ybar;
  }

  users.sort((a, b) => {
    if (b.bayesScore !== a.bayesScore) return b.bayesScore - a.bayesScore;
    if (b.meanScore !== a.meanScore) return b.meanScore - a.meanScore;
    return b.runs - a.runs;
  });

  const items = users.slice(0, limit).map((u, idx) => ({
    rank: idx + 1,
    userId: u.userId,
    participantId: u.participantId,
    orgRaw: u.orgRaw,
    facultyRaw: u.facultyRaw,
    bayesScore: Number(u.bayesScore.toFixed(2)),
    avgScore: Number(u.meanScore.toFixed(2)),
    runs: u.runs,
  }));

  return NextResponse.json({
    updatedAt: Math.floor(Date.now() / 1000),
    meta: {
      mu: Number(mu.toFixed(4)),
      sigma2: Number(sigma2.toFixed(4)),
      tau2: Number(tau2.toFixed(4)),
      lambda: Number(lambda.toFixed(4)),
    },
    items,
  });
}