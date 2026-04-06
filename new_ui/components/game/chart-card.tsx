"use client";

import { useRef, useEffect, useCallback } from "react";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";

const CANVAS_W = 2200;
const CANVAS_H = 500;

interface ChartCardProps {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  scrollPosition: number;
  onScrollChange: (value: number) => void;
  maxScroll: number;
  /** Vertical slider for adjusting active step value */
  sliderVisible: boolean;
  sliderValue: number;
  sliderMin: number;
  sliderMax: number;
  onSliderChange: (value: number) => void;
  /** Active step label and confirm */
  activeStepLabel: string;
  onConfirmStep: () => void;
  confirmDisabled: boolean;
  /** Hint text for the voting panel */
  votingHint: string;
  /** Whether the round is submitted (hides voting panel) */
  roundSubmitted: boolean;
}

export function ChartCard({
  canvasRef,
  scrollPosition,
  onScrollChange,
  maxScroll,
  sliderVisible,
  sliderValue,
  sliderMin,
  sliderMax,
  onSliderChange,
  activeStepLabel,
  onConfirmStep,
  confirmDisabled,
  votingHint,
  roundSubmitted,
}: ChartCardProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const handleSliderChange = useCallback(
    (value: number[]) => {
      const container = scrollContainerRef.current;
      if (!container) return;
      const maxScrollLeft = container.scrollWidth - container.clientWidth;
      const scrollLeft = (value[0] / 100) * maxScrollLeft;
      container.scrollLeft = scrollLeft;
      onScrollChange(value[0]);
    },
    [onScrollChange]
  );

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const maxScrollLeft = container.scrollWidth - container.clientWidth;
      if (maxScrollLeft <= 0) {
        onScrollChange(0);
        return;
      }
      const percent = (container.scrollLeft / maxScrollLeft) * 100;
      onScrollChange(Math.round(percent));
    };

    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => container.removeEventListener("scroll", handleScroll);
  }, [onScrollChange]);

  // Auto-scroll to the right when maxScroll signals new data
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    requestAnimationFrame(() => {
      container.scrollLeft = container.scrollWidth;
    });
  }, [maxScroll]);

  const handleVerticalSlider = useCallback(
    (value: number[]) => {
      // Radix vertical slider: 0 = bottom, 100 = top
      // Map 0..100 back to sliderMin..sliderMax
      const normalized = value[0] / 100;
      const mapped = sliderMin + normalized * (sliderMax - sliderMin);
      onSliderChange(mapped);
    },
    [onSliderChange, sliderMin, sliderMax]
  );

  // Map current sliderValue back to 0..100 for the vertical Radix slider
  const verticalSliderPercent =
    sliderMax !== sliderMin
      ? ((sliderValue - sliderMin) / (sliderMax - sliderMin)) * 100
      : 50;

  return (
    <div className="glass rounded-2xl overflow-hidden">
      {/* Chart + optional vertical slider */}
      <div className="flex">
        {/* Chart area */}
        <div className="flex-1 min-w-0">
          <div
            ref={scrollContainerRef}
            className="chart-scroll overflow-x-auto overflow-y-hidden"
            style={{ touchAction: "pan-x" }}
          >
          <canvas
            ref={canvasRef}
            width={CANVAS_W}
            height={CANVAS_H}
            className="block w-full h-auto"
            style={{
              aspectRatio: `${CANVAS_W} / ${CANVAS_H}`,
            }}
          />
          </div>
        </div>

        {/* Right-side vertical slider panel */}
        {sliderVisible && (
          <div className="flex flex-col items-center justify-between py-3 px-2.5 border-l border-border/30 gap-2 min-w-[56px]">
            <span className="text-[10px] font-mono text-muted-foreground leading-none">
              {sliderMax.toFixed(1)}
            </span>
            <div className="flex-1 flex items-center justify-center min-h-[120px]">
              <Slider
                orientation="vertical"
                value={[verticalSliderPercent]}
                onValueChange={handleVerticalSlider}
                min={0}
                max={100}
                step={0.5}
                className="h-full [&_[data-slot=slider-track]]:w-1.5 [&_[data-slot=slider-thumb]]:size-5 [&_[data-slot=slider-thumb]]:border-chart-5 [&_[data-slot=slider-range]]:bg-chart-5/60"
              />
            </div>
            <span className="text-[10px] font-mono text-muted-foreground leading-none">
              {sliderMin.toFixed(1)}
            </span>
          </div>
        )}
      </div>

      {/* ─── Voting Panel: under-chart confirmation area ─── */}
      {!roundSubmitted && (
        <div className="border-t border-border/30 px-4 py-4">
          {/* Hint text */}
          <p className="text-xs text-muted-foreground text-center mb-3 leading-relaxed">
            {votingHint}
          </p>

          {/* Big confirm CTA */}
          <Button
            onClick={onConfirmStep}
            disabled={confirmDisabled}
            className={
              "w-full rounded-2xl h-12 text-sm font-semibold transition-all duration-200 flex items-center justify-center gap-2 " +
              (confirmDisabled
                ? "bg-transparent border border-white/10 text-muted-foreground opacity-50 cursor-not-allowed"
                : "bg-transparent border border-blue-500 text-blue-200 hover:bg-blue-500/10 hover:text-blue-100 active:scale-[0.98] shadow-[0_0_0_1px_rgba(59,130,246,0.25)]")
            }
          >
            <Check className="size-4" />
            {"Согласовать прогноз"}
            <span className="text-blue-200/70 font-mono text-xs ml-1">
              {activeStepLabel}
            </span>
          </Button>
        </div>
      )}


    </div>
  );
}
