"use client";

import { ArrowRight, Send } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ActionBarProps {
  canAdvance: boolean;
  allDone: boolean;
  onNextRound: () => void;
  onSendResults: () => void;
}

export function ActionBar({
  canAdvance,
  allDone,
  onNextRound,
  onSendResults,
}: ActionBarProps) {
  return (
    <footer className="sticky bottom-0 z-50 glass-strong">
      <div className="px-4 py-3 flex items-center gap-3">
        {canAdvance && !allDone && (
          <Button
            onClick={onNextRound}
            variant="secondary"
            className="flex-1 rounded-xl h-11 text-sm font-medium bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-all"
          >
            {"Следующий раунд"}
            <ArrowRight className="size-4" />
          </Button>
        )}
        <Button
          onClick={onSendResults}
          disabled={!allDone}
          className={
            "flex-1 rounded-xl h-11 text-sm font-semibold transition-all " +
            (allDone
              ? "bg-primary text-primary-foreground hover:bg-primary/90 shadow-[0_0_20px_oklch(0.72_0.19_220_/_0.3)]"
              : "bg-muted text-muted-foreground")
          }
        >
          <Send className="size-4" />
          {"Отправить результаты"}
        </Button>
      </div>
    </footer>
  );
}
