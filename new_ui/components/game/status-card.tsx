"use client";

import { Info, CheckCircle2, AlertTriangle, Target } from "lucide-react";
import { cn } from "@/lib/utils";

export type StatusType = "info" | "success" | "error" | "waiting";

interface StatusCardProps {
  type: StatusType;
  message: string;
}

const config: Record<
  StatusType,
  { icon: React.ElementType; borderClass: string; iconClass: string; bgClass: string }
> = {
  info: {
    icon: Info,
    borderClass: "border-primary/30",
    iconClass: "text-primary",
    bgClass: "bg-primary/5",
  },
  success: {
    icon: CheckCircle2,
    borderClass: "border-success/30",
    iconClass: "text-success",
    bgClass: "bg-success/5",
  },
  error: {
    icon: AlertTriangle,
    borderClass: "border-destructive/30",
    iconClass: "text-destructive",
    bgClass: "bg-destructive/5",
  },
  waiting: {
    icon: Target,
    borderClass: "border-chart-3/30",
    iconClass: "text-chart-3",
    bgClass: "bg-chart-3/5",
  },
};

export function StatusCard({ type, message }: StatusCardProps) {
  const { icon: Icon, borderClass, iconClass, bgClass } = config[type];

  return (
    <div
      className={cn(
        "glass rounded-2xl border px-4 py-3 flex items-start gap-3 transition-all duration-300",
        borderClass,
        bgClass
      )}
    >
      <Icon className={cn("size-4 mt-0.5 shrink-0", iconClass)} />
      <p className="text-sm text-foreground/90 leading-relaxed">{message}</p>
    </div>
  );
}
