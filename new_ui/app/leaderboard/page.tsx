"use client";

import { useEffect, useMemo, useState } from "react";

type Row = {
  rank: number;
  userId: number;
  participantId: string;
  orgRaw: string;
  facultyRaw: string;
  bayesScore: number;
  avgScore: number;
  runs: number;
};

type GroupItem = {
  id: number;
  label: string;
  usersCount: number;
};

type Tab = "overall" | "universities" | "faculties";

const UNIVERSITY_ORDER = [
  "МГУ",
  "СПбГУ",
  "ВШЭ",
  "МФТИ",
  "МГТУ",
  "РАНХиГС",
  "Финансовый университет",
  "РУДН",
  "ИТМО",
  "КФУ",
];

const FACULTY_ORDER = [
  "Экономика и финансы",
  "Социальные науки",
  "Бизнес и менеджмент",
  "Международная экономика",
  "Мировая экономика и политика",
  "География и геоинформационные технологии",
  "Гуманитарные науки",
  "Математика",
  "Компьютерные науки",
  "Электроника и математические технологии",
  "Право",
  "Креативные индустрии",
  "Физика",
  "Городское и региональное развитие",
  "Химия",
  "Биология и биотехнологии",
  "Довузовская подготовка",
  "Иностранные языки",
  "Юриспруденция и администрирование",
  "Другое",
];

function sortByReference(items: GroupItem[], reference: string[]) {
  const orderMap = new Map(reference.map((name, idx) => [name.toLowerCase(), idx]));
  return [...items].sort((a, b) => {
    const ia = orderMap.get(a.label.toLowerCase());
    const ib = orderMap.get(b.label.toLowerCase());

    if (ia != null && ib != null) return ia - ib;
    if (ia != null) return -1;
    if (ib != null) return 1;

    return a.label.localeCompare(b.label, "ru");
  });
}

function metricCard(title: string, value: string | number, subtitle?: string) {
  return (
    <div className="rounded-3xl border border-white/10 bg-black/10 px-5 py-5 backdrop-blur-sm">
      <div className="text-xs text-muted-foreground mb-3">{title}</div>
      <div className="text-3xl font-semibold tracking-tight">{value}</div>
      {subtitle ? (
        <div className="text-sm text-muted-foreground mt-2">{subtitle}</div>
      ) : null}
    </div>
  );
}

function DistributionBars({ rows }: { rows: Row[] }) {
  const buckets = useMemo(() => {
    const ranges = [
      { label: "< 200", min: -Infinity, max: 200 },
      { label: "200–249", min: 200, max: 250 },
      { label: "250–299", min: 250, max: 300 },
      { label: "300–349", min: 300, max: 350 },
      { label: "350+", min: 350, max: Infinity },
    ];

    return ranges.map((r) => ({
      label: r.label,
      count: rows.filter((x) => x.avgScore >= r.min && x.avgScore < r.max).length,
    }));
  }, [rows]);

  const maxCount = Math.max(1, ...buckets.map((b) => b.count));

  return (
    <div className="rounded-3xl border border-white/10 bg-black/10 px-5 py-5">
      <div className="text-sm font-medium mb-4">Распределение результатов</div>
      <div className="space-y-3">
        {buckets.map((b) => (
          <div key={b.label}>
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
              <span>{b.label}</span>
              <span>{b.count}</span>
            </div>
            <div className="h-2 rounded-full bg-white/5 overflow-hidden">
              <div
                className="h-full rounded-full bg-cyan-400/70"
                style={{ width: `${(b.count / maxCount) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TopBars({ rows }: { rows: Row[] }) {
  const topRows = rows.slice(0, 10);
  const maxScore = Math.max(1, ...topRows.map((r) => r.avgScore));

  return (
    <div className="rounded-3xl border border-white/10 bg-black/10 px-5 py-5">
      <div className="text-sm font-medium mb-4">Топ-10 участников</div>
      <div className="space-y-3">
        {topRows.map((r) => (
          <div key={r.userId}>
            <div className="flex items-center justify-between gap-4 mb-1.5">
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">{r.participantId}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {r.orgRaw} · {r.facultyRaw}
                </div>
              </div>
              <div className="text-sm font-semibold shrink-0">{r.avgScore}</div>
            </div>
            <div className="h-2 rounded-full bg-white/5 overflow-hidden">
              <div
                className="h-full rounded-full bg-blue-400/80"
                style={{ width: `${(r.avgScore / maxScore) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function LeaderboardPage() {
  const [tab, setTab] = useState<Tab>("overall");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);

  const [universities, setUniversities] = useState<GroupItem[]>([]);
  const [faculties, setFaculties] = useState<GroupItem[]>([]);
  const [selectedUni, setSelectedUni] = useState<number | null>(null);
  const [selectedFac, setSelectedFac] = useState<number | null>(null);

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
    (async () => {
      const [u, f] = await Promise.all([
        fetch("/api/leaderboard/universities", { cache: "no-store" }).then((r) => r.json()),
        fetch("/api/leaderboard/faculties", { cache: "no-store" }).then((r) => r.json()),
      ]);

      setUniversities(sortByReference(u.items ?? [], UNIVERSITY_ORDER));
      setFaculties(sortByReference(f.items ?? [], FACULTY_ORDER));
    })();
  }, []);

  useEffect(() => {
    if (tab === "overall") {
      fetchRows("/api/leaderboard?limit=50");
      return;
    }

    if (tab === "universities") {
      if (!universities.length) return;

      const validSelected =
        selectedUni != null && universities.some((u) => u.id === selectedUni);

      const nextUni = validSelected ? selectedUni : universities[0].id;

      if (selectedUni !== nextUni) {
        setSelectedUni(nextUni);
        return;
      }

      fetchRows(`/api/leaderboard?orgClusterId=${nextUni}&limit=50`);
      return;
    }

    if (tab === "faculties") {
      if (!faculties.length) return;

      const validSelected =
        selectedFac != null && faculties.some((f) => f.id === selectedFac);

      const nextFac = validSelected ? selectedFac : faculties[0].id;

      if (selectedFac !== nextFac) {
        setSelectedFac(nextFac);
        return;
      }

      fetchRows(`/api/leaderboard?facultyClusterId=${nextFac}&limit=50`);
    }
  }, [tab, selectedUni, selectedFac, universities, faculties]);

  const leader = rows[0] ?? null;
  const participantsCount = rows.length;

  const avgScore =
    participantsCount > 0
      ? rows.reduce((sum, r) => sum + r.avgScore, 0) / participantsCount
      : 0;

  const maxScore = participantsCount > 0 ? Math.max(...rows.map((r) => r.avgScore)) : 0;

  const medianScore =
    participantsCount > 0
      ? (() => {
          const vals = [...rows.map((r) => r.avgScore)].sort((a, b) => a - b);
          const mid = Math.floor(vals.length / 2);
          return vals.length % 2 === 0 ? (vals[mid - 1] + vals[mid]) / 2 : vals[mid];
        })()
      : 0;

  const currentTitle =
    tab === "overall"
      ? "Все участники"
      : tab === "universities"
        ? "Рейтинг по вузу"
        : "Рейтинг по направлению";

  const currentFilterLabel =
    tab === "universities"
      ? universities.find((u) => u.id === selectedUni)?.label ?? "—"
      : tab === "faculties"
        ? faculties.find((f) => f.id === selectedFac)?.label ?? "—"
        : "Общая выборка";

  return (
    <div className="min-h-screen min-h-[100dvh] gradient-mesh p-3 md:p-4">
      <div className="glass rounded-3xl px-4 py-5 md:px-6 md:py-6 mb-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-2xl md:text-3xl font-semibold tracking-tight">
              Рейтинг участников
            </div>
            <div className="text-sm text-muted-foreground mt-1">
              Сводка результатов эксперимента
            </div>
          </div>

          <button
            className="rounded-2xl px-4 py-2.5 text-sm bg-muted/20 hover:bg-muted/30 transition"
            onClick={() => history.back()}
          >
            Назад
          </button>
        </div>

        <div className="flex gap-2 mt-5">
          <button
            className={
              "flex-1 rounded-2xl py-3 text-sm transition " +
              (tab === "overall"
                ? "bg-primary/15 ring-1 ring-primary/50 text-primary"
                : "bg-muted/10 text-muted-foreground")
            }
            onClick={() => setTab("overall")}
          >
            Все участники
          </button>
          <button
            className={
              "flex-1 rounded-2xl py-3 text-sm transition " +
              (tab === "universities"
                ? "bg-primary/15 ring-1 ring-primary/50 text-primary"
                : "bg-muted/10 text-muted-foreground")
            }
            onClick={() => setTab("universities")}
          >
            По вузам
          </button>
          <button
            className={
              "flex-1 rounded-2xl py-3 text-sm transition " +
              (tab === "faculties"
                ? "bg-primary/15 ring-1 ring-primary/50 text-primary"
                : "bg-muted/10 text-muted-foreground")
            }
            onClick={() => setTab("faculties")}
          >
            По направлениям
          </button>
        </div>

        {tab === "universities" && (
          <div className="mt-4">
            <div className="text-[11px] text-muted-foreground mb-1.5">Выберите вуз</div>
            <div className="relative">
              <select
                className="w-full appearance-none rounded-2xl bg-muted/10 px-4 py-3 pr-12 text-sm border border-white/10"
                value={selectedUni ?? ""}
                onChange={(e) => setSelectedUni(Number(e.target.value))}
              >
                {universities.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.label} · участников {u.usersCount}
                  </option>
                ))}
              </select>
              <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-white/70">
                ▾
              </span>
            </div>
          </div>
        )}

        {tab === "faculties" && (
          <div className="mt-4">
            <div className="text-[11px] text-muted-foreground mb-1.5">
              Выберите направление
            </div>
            <div className="relative">
              <select
                className="w-full appearance-none rounded-2xl bg-muted/10 px-4 py-3 pr-12 text-sm border border-white/10"
                value={selectedFac ?? ""}
                onChange={(e) => setSelectedFac(Number(e.target.value))}
              >
                {faculties.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.label} · участников {u.usersCount}
                  </option>
                ))}
              </select>
              <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-white/70">
                ▾
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-4">
        {metricCard("Режим просмотра", currentTitle, currentFilterLabel)}
        {metricCard("Участников", participantsCount)}
        {metricCard("Лучший результат", maxScore.toFixed(1))}
        {metricCard("Медианный результат", medianScore.toFixed(1))}
      </div>

      {leader && (
        <div className="rounded-3xl border border-white/10 bg-black/10 px-5 py-5 mb-4">
          <div className="text-sm text-muted-foreground mb-2">Лидер текущего раздела</div>
          <div className="text-2xl font-semibold break-all">{leader.participantId}</div>
          <div className="text-sm text-muted-foreground mt-3">{leader.orgRaw}</div>
          <div className="text-sm text-muted-foreground">{leader.facultyRaw}</div>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[0.95fr_1.05fr] gap-4 mb-4">
        <DistributionBars rows={rows} />
        <TopBars rows={rows} />
      </div>

      <div className="glass rounded-3xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border/30 text-sm text-muted-foreground">
          {loading ? "Загрузка..." : `Показано участников: ${rows.length}`}
        </div>

        <div className="divide-y divide-border/20">
          {rows.map((r, index) => (
            <div
              key={r.userId}
              className={
                "px-5 py-4 flex items-center gap-4 transition " +
                (index < 3 ? "bg-white/[0.02]" : "")
              }
            >
              <div className="w-14 text-center shrink-0">
                <div className="text-lg font-semibold">{r.rank}</div>
              </div>

              <div className="flex-1 min-w-0">
                <div className="text-sm md:text-base font-semibold break-all">
                  {r.participantId}
                </div>
                <div className="text-xs md:text-sm text-muted-foreground mt-1 truncate">
                  {r.orgRaw}
                </div>
                <div className="text-xs md:text-sm text-muted-foreground truncate">
                  {r.facultyRaw}
                </div>
              </div>

              <div className="w-40 hidden md:block">
                <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-blue-400/80"
                    style={{ width: `${Math.min(100, (r.avgScore / Math.max(maxScore, 1)) * 100)}%` }}
                  />
                </div>
              </div>

              <div className="text-right shrink-0">
                <div className="text-xs text-muted-foreground">Результат</div>
                <div className="text-lg font-semibold">{r.avgScore}</div>
              </div>
            </div>
          ))}

          {!loading && rows.length === 0 && (
            <div className="px-5 py-12 text-center text-sm text-muted-foreground">
              Пока нет результатов
            </div>
          )}
        </div>
      </div>
    </div>
  );
}