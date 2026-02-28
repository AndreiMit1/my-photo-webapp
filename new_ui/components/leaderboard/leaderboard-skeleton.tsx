"use client";

import { Skeleton } from "@/components/ui/skeleton";

export function LeaderboardSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="glass rounded-2xl px-4 py-3 flex items-center gap-3">
          <Skeleton className="size-8 rounded-lg bg-muted/40" />
          <div className="flex-1 flex flex-col gap-1.5">
            <Skeleton className="h-3.5 w-24 rounded bg-muted/40" />
            <Skeleton className="h-2.5 w-16 rounded bg-muted/30" />
          </div>
          <div className="flex flex-col items-end gap-1">
            <Skeleton className="h-5 w-12 rounded bg-muted/40" />
            <Skeleton className="h-2 w-6 rounded bg-muted/30" />
          </div>
        </div>
      ))}
    </div>
  );
}
