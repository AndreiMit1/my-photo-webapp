"use client";

import { cn } from "@/lib/utils";

interface RoundProgressProps {
  currentRound: number;
  totalRounds: number;
}

export function RoundProgress({ currentRound, totalRounds }: RoundProgressProps) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">
        {"Раунд "}{Math.min(currentRound, totalRounds)}{" из "}{totalRounds}
      </span>
      <div className="flex items-center gap-1 flex-1">
        {Array.from({ length: totalRounds }, (_, i) => (
          <div
            key={i}
            className={cn(
              "h-1.5 flex-1 rounded-full transition-all duration-500",
              i < currentRound
                ? "bg-primary"
                : i === currentRound
                  ? "bg-primary/40"
                  : "bg-muted"
            )}
          />
        ))}
      </div>
    </div>
  );
}
