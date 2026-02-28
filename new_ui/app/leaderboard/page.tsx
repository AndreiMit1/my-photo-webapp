"use client";

import { useEffect, useMemo, useState } from "react";

type Row = {
  rank: number;
  userId: number;
  nickname: string;
  bestTotalScore: number;
  avgScore: number;
  runs: number;
};

type GroupItem = {
  id: number;
  label: string;
  usersCount: number;
  bestTotalScore: number;
};

type Tab = "overall" | "universities" | "faculties";

function getTelegramUserId(): number | null {
  const tg = (window as any).Telegram?.WebApp;
  const id = tg?.initDataUnsafe?.user?.id;
  return typeof id === "number" ? id : null;
}

export default function LeaderboardPage() {
  const [tab, setTab] = useState<Tab>("overall");

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);

  const [universities, setUniversities] = useState<GroupItem[]>([]);
  const [faculties, setFaculties] = useState<GroupItem[]>([]);
  const [selectedUni, setSelectedUni] = useState<number | null>(null);
  const [selectedFac, setSelectedFac] = useState<number | null>(null);

  const me = useMemo(() => (typeof window !== "undefined" ? getTelegramUserId() : null), []);

  async function fetchRows(url: string) {
    setLoading(true);
    try {
      const r = await fetch(url, { cache: "no-store" });
      const j = await r.json();
      setRows(j.items ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // prefetch group lists
    (async () => {
      const [u, f] = await Promise.all([
        fetch("/api/leaderboard/universities", { cache: "no-store" }).then((r) => r.json()),
        fetch("/api/leaderboard/faculties", { cache: "no-store" }).then((r) => r.json()),
      ]);
      setUniversities(u.items ?? []);
      setFaculties(f.items ?? []);
    })();
  }, []);

  useEffect(() => {
    if (tab === "overall") {
      fetchRows("/api/leaderboard?limit=50");
    } else if (tab === "universities") {
      if (selectedUni == null) {
        const first = universities[0]?.id ?? null;
        setSelectedUni(first);
        if (first != null) fetchRows(`/api/leaderboard?orgClusterId=${first}&limit=50`);
      } else {
        fetchRows(`/api/leaderboard?orgClusterId=${selectedUni}&limit=50`);
      }
    } else if (tab === "faculties") {
      if (selectedFac == null) {
        const first = faculties[0]?.id ?? null;
        setSelectedFac(first);
        if (first != null) fetchRows(`/api/leaderboard?facultyClusterId=${first}&limit=50`);
      } else {
        fetchRows(`/api/leaderboard?facultyClusterId=${selectedFac}&limit=50`);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, selectedUni, selectedFac, universities.length, faculties.length]);

  return (
    <div className="min-h-screen min-h-[100dvh] gradient-mesh p-3">
      <div className="glass rounded-2xl px-4 py-3 mb-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-lg font-semibold">🏆 Leaderboard</div>
            <div className="text-xs text-muted-foreground">All time</div>
          </div>
          <button
            className="text-xs font-mono px-3 py-2 rounded-xl bg-muted/20"
            onClick={() => history.back()}
          >
            ← back
          </button>
        </div>

        <div className="flex gap-2 mt-3">
          <button
            className={"flex-1 rounded-xl py-2 text-xs font-mono " + (tab === "overall" ? "bg-primary/15 ring-1 ring-primary/50 text-primary" : "bg-muted/10 text-muted-foreground")}
            onClick={() => setTab("overall")}
          >
            Все
          </button>
          <button
            className={"flex-1 rounded-xl py-2 text-xs font-mono " + (tab === "universities" ? "bg-primary/15 ring-1 ring-primary/50 text-primary" : "bg-muted/10 text-muted-foreground")}
            onClick={() => setTab("universities")}
          >
            Вузы
          </button>
          <button
            className={"flex-1 rounded-xl py-2 text-xs font-mono " + (tab === "faculties" ? "bg-primary/15 ring-1 ring-primary/50 text-primary" : "bg-muted/10 text-muted-foreground")}
            onClick={() => setTab("faculties")}
          >
            Факультеты
          </button>
        </div>

        {tab === "universities" && (
          <div className="mt-3">
            <div className="text-[11px] text-muted-foreground mb-1">Выбери вуз</div>
            <select
              className="w-full rounded-xl bg-muted/10 px-3 py-2 text-sm"
              value={selectedUni ?? ""}
              onChange={(e) => setSelectedUni(Number(e.target.value))}
            >
              {universities.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.label} · users {u.usersCount}
                </option>
              ))}
            </select>
          </div>
        )}

        {tab === "faculties" && (
          <div className="mt-3">
            <div className="text-[11px] text-muted-foreground mb-1">Выбери факультет</div>
            <select
              className="w-full rounded-xl bg-muted/10 px-3 py-2 text-sm"
              value={selectedFac ?? ""}
              onChange={(e) => setSelectedFac(Number(e.target.value))}
            >
              {faculties.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.label} · users {u.usersCount}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="glass rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border/30 text-xs text-muted-foreground">
          {loading ? "Загрузка..." : `Показано: ${rows.length}`}
        </div>

        <div className="divide-y divide-border/20">
          {rows.map((r) => {
            const isMe = me != null && r.userId === me;
            return (
              <div key={r.userId} className={"px-4 py-3 flex items-center gap-3 " + (isMe ? "outline outline-1 outline-chart-5/60" : "")}>
                <div className="w-10 text-center font-mono text-sm">{r.rank}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold truncate">
                    {r.nickname} {isMe ? <span className="text-xs font-mono text-chart-5">· you</span> : null}
                  </div>
                  <div className="text-[11px] text-muted-foreground font-mono">
                    avg {r.avgScore} · runs {r.runs}
                  </div>
                </div>
                <div className="font-mono text-sm">{r.bestTotalScore}</div>
              </div>
            );
          })}
          {!loading && rows.length === 0 && (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground">
              Пока нет результатов
            </div>
          )}
        </div>
      </div>
    </div>
  );
}