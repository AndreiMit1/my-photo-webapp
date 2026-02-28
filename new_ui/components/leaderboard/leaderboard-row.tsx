"use client";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

export interface LeaderboardItem {
  rank: number;
  userId: number;
  nickname: string;
  bestTotalScore: number;
  avgScore: number;
  runs: number;
}

interface LeaderboardRowProps {
  item: LeaderboardItem;
  isCurrentUser: boolean;
}

const medalColors: Record<number, { bg: string; border: string; glow: string; text: string }> = {
  1: {
    bg: "bg-[oklch(0.75_0.12_85_/_0.08)]",
    border: "border-[oklch(0.75_0.12_85_/_0.25)]",
    glow: "shadow-[0_0_16px_oklch(0.75_0.12_85_/_0.12)]",
    text: "text-[oklch(0.82_0.12_85)]",
  },
  2: {
    bg: "bg-[oklch(0.70_0.02_260_/_0.08)]",
    border: "border-[oklch(0.70_0.02_260_/_0.25)]",
    glow: "shadow-[0_0_16px_oklch(0.70_0.02_260_/_0.10)]",
    text: "text-[oklch(0.78_0.02_260)]",
  },
  3: {
    bg: "bg-[oklch(0.65_0.10_55_/_0.08)]",
    border: "border-[oklch(0.65_0.10_55_/_0.25)]",
    glow: "shadow-[0_0_16px_oklch(0.65_0.10_55_/_0.10)]",
    text: "text-[oklch(0.73_0.10_55)]",
  },
};

function RankBadge({ rank }: { rank: number }) {
  const medal = medalColors[rank];

  if (medal) {
    return (
      <div
        className={cn(
          "size-8 rounded-lg flex items-center justify-center font-bold text-sm font-mono",
          medal.bg,
          medal.text,
          medal.glow,
        )}
      >
        {rank}
      </div>
    );
  }

  return (
    <div className="size-8 rounded-lg flex items-center justify-center text-xs font-mono text-muted-foreground bg-muted/30">
      {rank}
    </div>
  );
}

export function LeaderboardRow({ item, isCurrentUser }: LeaderboardRowProps) {
  const medal = medalColors[item.rank];

  return (
    <div
      className={cn(
        "flex items-center gap-3 px-4 py-3 rounded-2xl transition-all duration-200",
        medal ? cn("glass", medal.border, medal.glow) : "glass",
        isCurrentUser && "ring-2 ring-primary/40 shadow-[0_0_20px_oklch(0.72_0.19_220_/_0.15)]",
      )}
    >
      <RankBadge rank={item.rank} />

      <div className="flex flex-col gap-0.5 min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground truncate">
            {item.nickname}
          </span>
          {isCurrentUser && (
            <Badge
              variant="outline"
              className="text-[10px] px-1.5 py-0 h-4 border-primary/40 text-primary bg-primary/10"
            >
              You
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
          <span>
            {"avg "}
            <span className="font-mono text-foreground/60">{item.avgScore}</span>
          </span>
          <span>
            {"runs "}
            <span className="font-mono text-foreground/60">{item.runs}</span>
          </span>
        </div>
      </div>

      <div className="text-right shrink-0">
        <span className={cn(
          "text-lg font-bold font-mono tabular-nums",
          medal ? medal.text : "text-foreground",
        )}>
          {item.bestTotalScore}
        </span>
        <span className="block text-[9px] text-muted-foreground uppercase tracking-wider">
          best
        </span>
      </div>
    </div>
  );
}
