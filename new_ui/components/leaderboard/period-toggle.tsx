"use client";

import { cn } from "@/lib/utils";

export type Period = "all" | "7d" | "24h";

interface PeriodToggleProps {
  value: Period;
  onChange: (period: Period) => void;
}

const options: { value: Period; label: string }[] = [
  { value: "all", label: "All time" },
  { value: "7d", label: "7 days" },
  { value: "24h", label: "24 hours" },
];

export function PeriodToggle({ value, onChange }: PeriodToggleProps) {
  return (
    <div className="glass rounded-xl p-1 flex items-center gap-1">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={cn(
            "flex-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200",
            value === opt.value
              ? "bg-primary/15 text-primary shadow-[0_0_12px_oklch(0.72_0.19_220_/_0.15)]"
              : "text-muted-foreground hover:text-foreground hover:bg-accent/30",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
