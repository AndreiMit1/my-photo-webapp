"use client";

import { ArrowLeft, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export function LeaderboardHeader() {
  return (
    <header className="sticky top-0 z-50 glass-strong">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3 min-w-0">
          <Button
            variant="ghost"
            size="icon"
            asChild
            className="text-muted-foreground hover:text-foreground hover:bg-accent/50 rounded-xl shrink-0 size-8"
          >
            <Link href="/" aria-label="Back to game">
              <ArrowLeft className="size-4" />
            </Link>
          </Button>
          <div className="flex flex-col gap-0.5 min-w-0">
            <h1 className="text-base font-semibold text-foreground tracking-tight leading-tight flex items-center gap-2">
              <Trophy className="size-4 text-chart-3 shrink-0" />
              {"Leaderboard"}
            </h1>
            <span className="text-xs text-muted-foreground">
              {"Top performers"}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}
