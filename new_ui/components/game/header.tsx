"use client";

import { Maximize, Minimize } from "lucide-react";
import { Button } from "@/components/ui/button";

interface HeaderProps {
  phi: number;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
}

export function Header({ phi, isFullscreen, onToggleFullscreen }: HeaderProps) {
  return (
    <header className="sticky top-0 z-50 glass-strong">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex flex-col gap-0.5 min-w-0">
          <h1 className="text-base font-semibold text-foreground tracking-tight leading-tight">
            AR(1) Forecast Game
          </h1>
          <span className="text-xs font-mono text-muted-foreground">
            {"φ = "}{phi.toFixed(2)}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onToggleFullscreen}
            className="text-muted-foreground hover:text-foreground hover:bg-accent/50 rounded-xl"
            aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
          >
            {isFullscreen ? (
              <Minimize className="size-4" />
            ) : (
              <Maximize className="size-4" />
            )}
          </Button>
        </div>
      </div>
    </header>
  );
}
