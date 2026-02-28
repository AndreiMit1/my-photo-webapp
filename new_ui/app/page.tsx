"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { Header } from "@/components/game/header";
import { ChartCard } from "@/components/game/chart-card";
import { StatusCard, type StatusType } from "@/components/game/status-card";
import { RoundProgress } from "@/components/game/round-progress";
import { ActionBar } from "@/components/game/action-bar";

// ─── Constants ───────────────────────────────────────────────
const CANVAS_W = 2200;
const CANVAS_H = 500;
const TOTAL_ROUNDS = 5;
const HISTORY_LEN = 30;
const PHI = 0.7;
const SIGMA = 1.0;

// Increased vertical compression: plot uses top ~60% of canvas
const PADDING = { top: 40, bottom: 130, left: 60, right: 80 };

// Forecast step definitions: label + offset from last history point
const STEP_DEFS = [
  { label: "T+1", offset: 1, block: 0 },
  { label: "T+2", offset: 2, block: 0 },
  { label: "T+4", offset: 4, block: 1 },
  { label: "T+5", offset: 5, block: 1 },
  { label: "T+7", offset: 7, block: 2 },
  { label: "T+8", offset: 8, block: 2 },
] as const;

const NUM_STEPS = STEP_DEFS.length;
const MAX_OFFSET = STEP_DEFS[NUM_STEPS - 1].offset; // 8

// Extra horizontal gap (in data units) injected between blocks
// We add virtual "gap" units between block boundaries to widen them
const BLOCK_GAP = 1.5; // 1.5 extra data-unit gaps between blocks
const TOTAL_POINTS = HISTORY_LEN + MAX_OFFSET + BLOCK_GAP * 2; // 2 gaps

// ─── AR(1) Data Generator ───────────────────────────────────
function generateAR1(
  phi: number,
  sigma: number,
  length: number,
  startValue = 0,
): number[] {
  const data: number[] = [startValue];
  for (let i = 1; i < length; i++) {
    const noise = sigma * gaussianRandom();
    data.push(phi * data[i - 1] + noise);
  }
  return data;
}

function gaussianRandom(): number {
  let u = 0,
    v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

// ─── Types ───────────────────────────────────────────────────
interface StepPrediction {
  initial: number | null;
  final: number | null;
  confirmed: boolean;
}

interface RoundData {
  history: number[];
  truth: number[]; // full truth from history end up to MAX_OFFSET
  predictions: StepPrediction[];
  score: number | null;
}

// ─── Helper: map step offset to x position including block gaps ──
function stepOffsetToVirtual(offset: number): number {
  // offsets: 1,2 (block0) | 4,5 (block1) | 7,8 (block2)
  // Insert gap after offset 2 and after offset 5
  if (offset <= 2) return offset;
  if (offset <= 5) return offset + BLOCK_GAP;
  return offset + BLOCK_GAP * 2;
}

// ─── Main Page Component ─────────────────────────────────────
export default function ForecastGamePage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [scrollPosition, setScrollPosition] = useState(0);
  const [currentRound, setCurrentRound] = useState(0);
  const [rounds, setRounds] = useState<RoundData[]>([]);
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [roundSubmitted, setRoundSubmitted] = useState(false);
  const [status, setStatus] = useState<{ type: StatusType; message: string }>({
    type: "info",
    message: "Тыкните на графике, чтобы поставить точку для T+1.",
  });

  // Current round data
  const currentRoundData = rounds[rounds.length - 1] ?? null;
  const currentStepPreds = currentRoundData?.predictions ?? [];
  const activeStep = STEP_DEFS[activeStepIndex];
  const activePred = currentStepPreds[activeStepIndex];

  // ─── Initialize Telegram WebApp ────────────────────────────
  useEffect(() => {
    const tg =
      typeof window !== "undefined"
        ? (window as unknown as Record<string, unknown>).Telegram
        : null;
    if (tg && typeof tg === "object" && "WebApp" in tg) {
      const wa = (tg as Record<string, unknown>).WebApp as Record<
        string,
        unknown
      >;
      if (typeof wa.ready === "function") (wa.ready as () => void)();
      if (typeof wa.setHeaderColor === "function")
        (wa.setHeaderColor as (c: string) => void)("#111827");
      if (typeof wa.setBackgroundColor === "function")
        (wa.setBackgroundColor as (c: string) => void)("#0d0d1a");
      if (typeof wa.expand === "function") (wa.expand as () => void)();
    }
  }, []);

  // ─── Start first round on mount ────────────────────────────
  useEffect(() => {
    startNewRound();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Create empty predictions array ────────────────────────
  const makeEmptyPredictions = (): StepPrediction[] =>
    Array.from({ length: NUM_STEPS }, () => ({
      initial: null,
      final: null,
      confirmed: false,
    }));

  // ─── Start a new round ─────────────────────────────────────
  const startNewRound = useCallback(() => {
    const fullSeries = generateAR1(
      PHI,
      SIGMA,
      HISTORY_LEN + MAX_OFFSET + 1,
    );
    const history = fullSeries.slice(0, HISTORY_LEN);
    const truth = fullSeries.slice(HISTORY_LEN);

    const newRound: RoundData = {
      history,
      truth,
      predictions: makeEmptyPredictions(),
      score: null,
    };

    setRounds((prev) => [...prev, newRound]);
    setActiveStepIndex(0);
    setRoundSubmitted(false);
    setStatus({
      type: "info",
      message: `Раунд ${Math.min(rounds.length + 1, TOTAL_ROUNDS)} из ${TOTAL_ROUNDS}. Тыкните на графике, чтобы поставить точку для ${STEP_DEFS[0].label}.`,
    });
  }, [rounds.length]);

  // ─── Compute y-range for slider bounds ─────────────────────
  const getYRange = useCallback((): { min: number; max: number } => {
    if (!currentRoundData) return { min: -5, max: 5 };
    const allVals = [
      ...currentRoundData.history,
      ...currentStepPreds
        .map((p) => p.final)
        .filter((v): v is number => v !== null),
    ];
    const minV = Math.min(...allVals) - 3;
    const maxV = Math.max(...allVals) + 3;
    return { min: minV, max: maxV };
  }, [currentRoundData, currentStepPreds]);

  // ─── Handle canvas click for placing prediction ────────────
  const handleCanvasClick = useCallback(
    (
      e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>
    ) => {
      if (roundSubmitted) return;
      if (activeStepIndex >= NUM_STEPS) return;

      // If already placed (has initial), ignore tap - use slider to adjust
      if (activePred && activePred.initial !== null) return;

      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const scaleX = CANVAS_W / rect.width;
      const scaleY = CANVAS_H / rect.height;

      let clientX: number, clientY: number;
      if ("touches" in e) {
        if (e.touches.length === 0) return;
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
      } else {
        clientX = e.clientX;
        clientY = e.clientY;
      }

      const y = (clientY - rect.top) * scaleY;

      // Convert y to data value
      const allData = currentRoundData?.history ?? [];
      const existingPreds = currentStepPreds
        .map((p) => p.final)
        .filter((v): v is number => v !== null);
      const minVal = Math.min(...allData, ...existingPreds) - 2;
      const maxVal = Math.max(...allData, ...existingPreds) + 2;
      const plotH = CANVAS_H - PADDING.top - PADDING.bottom;

      // Clamp to valid y range with generous tap tolerance
      const yClamp = Math.max(PADDING.top - 30, Math.min(y, CANVAS_H - PADDING.bottom + 50));
      const yVal = maxVal - ((yClamp - PADDING.top) / plotH) * (maxVal - minVal);

      // Verify click is roughly in the forecast zone (generous tolerance)
      const plotW = CANVAS_W - PADDING.left - PADDING.right;
      const x = (clientX - rect.left) * scaleX;
      const historyVirtual = HISTORY_LEN;
      const predStartX = PADDING.left + (historyVirtual / TOTAL_POINTS) * plotW;
      if (x < predStartX - 60) return; // generous: 60px tolerance

      // Place point for active step
      setRounds((prev) => {
        const updated = [...prev];
        const round = { ...updated[updated.length - 1] };
        const preds = [...round.predictions];
        preds[activeStepIndex] = {
          initial: yVal,
          final: yVal,
          confirmed: false,
        };
        round.predictions = preds;
        updated[updated.length - 1] = round;
        return updated;
      });

      setStatus({
        type: "waiting",
        message: `Подвиньте бегунок, затем нажмите «Согласовать прогноз» для ${activeStep.label}.`,
      });
    },
    [
      roundSubmitted,
      activeStepIndex,
      activePred,
      currentRoundData,
      currentStepPreds,
      activeStep,
    ],
  );

  // ─── Handle vertical slider change ─────────────────────────
  const handleSliderChange = useCallback(
    (value: number) => {
      if (roundSubmitted || activeStepIndex >= NUM_STEPS) return;
      if (!activePred || activePred.initial === null) return;

      setRounds((prev) => {
        const updated = [...prev];
        const round = { ...updated[updated.length - 1] };
        const preds = [...round.predictions];
        preds[activeStepIndex] = {
          ...preds[activeStepIndex],
          final: value,
          confirmed: false,
        };
        round.predictions = preds;
        updated[updated.length - 1] = round;
        return updated;
      });
    },
    [roundSubmitted, activeStepIndex, activePred],
  );

  // ─── Confirm active step ───────────────────────────────────
  const handleConfirmStep = useCallback(() => {
    if (roundSubmitted || activeStepIndex >= NUM_STEPS) return;
    if (!activePred || activePred.initial === null) return;

    // Lock this step
    setRounds((prev) => {
      const updated = [...prev];
      const round = { ...updated[updated.length - 1] };
      const preds = [...round.predictions];
      preds[activeStepIndex] = {
        ...preds[activeStepIndex],
        confirmed: true,
      };
      round.predictions = preds;
      updated[updated.length - 1] = round;
      return updated;
    });

    const nextIndex = activeStepIndex + 1;

    if (nextIndex < NUM_STEPS) {
      setActiveStepIndex(nextIndex);
      setStatus({
        type: "success",
        message: `Шаг ${activeStep.label} согласован! Теперь поставьте точку для ${STEP_DEFS[nextIndex].label}.`,
      });
    } else {
      // All steps confirmed for this round
      setRoundSubmitted(true);

      // Calculate MSE
      const preds = rounds[rounds.length - 1]?.predictions ?? [];
      const truth = rounds[rounds.length - 1]?.truth ?? [];
      let sumSqErr = 0;
      let count = 0;
      for (let i = 0; i < NUM_STEPS; i++) {
        const predVal = preds[i]?.final ?? activePred.final;
        const truthIdx = STEP_DEFS[i].offset - 1;
        if (predVal !== null && truthIdx < truth.length) {
          const diff = (predVal ?? 0) - truth[truthIdx];
          sumSqErr += diff * diff;
          count++;
        }
      }
      // Use the latest pred for last step since state hasn't flushed
      const lastPredVal = activePred.final ?? 0;
      const lastTruthIdx = STEP_DEFS[activeStepIndex].offset - 1;
      if (lastTruthIdx < truth.length) {
        sumSqErr =
          sumSqErr -
          ((preds[activeStepIndex]?.final ?? 0) - truth[lastTruthIdx]) ** 2 +
          (lastPredVal - truth[lastTruthIdx]) ** 2;
      }

      const mse = count > 0 ? sumSqErr / count : 0;
      const score = Math.max(0, Math.round(100 - mse * 10));

      setRounds((prev) => {
        const updated = [...prev];
        const round = { ...updated[updated.length - 1] };
        const allPreds = [...round.predictions];
        allPreds[activeStepIndex] = {
          ...allPreds[activeStepIndex],
          confirmed: true,
        };
        round.predictions = allPreds;
        round.score = score;
        updated[updated.length - 1] = round;
        return updated;
      });

      setStatus({
        type: score >= 60 ? "success" : "error",
        message: `Все шаги согласованы! Очки: ${score}/100 (MSE: ${mse.toFixed(2)}). ${score >= 60 ? "Отличный прогноз!" : "Зелёная линия показывает истинный путь."}`,
      });
    }
  }, [roundSubmitted, activeStepIndex, activePred, activeStep, rounds]);

  // ─── Advance to next round ─────────────────────────────────
  const handleNextRound = useCallback(() => {
    if (currentRound + 1 < TOTAL_ROUNDS) {
      setCurrentRound((prev) => prev + 1);
      startNewRound();
    }
  }, [currentRound, startNewRound]);

  // ─── Send results ──────────────────────────────────────────
  // ─── Send results ──────────────────────────────────────────
  const handleSendResults = useCallback(() => {
    const totalScore = rounds.reduce((sum, r) => sum + (r.score ?? 0), 0);
    const avgScore = Math.round(totalScore / TOTAL_ROUNDS);

    const wa =
      typeof window !== "undefined"
        ? (window as any).Telegram?.WebApp
        : null;

    // отправляем данные боту (Telegram WebApp)
    if (wa?.sendData) {
      wa.sendData(
        JSON.stringify({
          totalScore,
          avgScore,
          rounds: rounds.map((r) => ({
            score: r.score,
            predictions: r.predictions.map((p, i) => ({
              step: STEP_DEFS[i].label,
              offset: STEP_DEFS[i].offset,
              initial: p.initial,
              final: p.final,
            })),
          })),
        })
      );
    }

    // показываем статус с очками
    setStatus({
      type: "success",
      message: `Результаты отправлены! Среднее: ${avgScore}/100. Итого: ${totalScore}/${TOTAL_ROUNDS * 100}.`,
    });

    // закрываем мини-приложение
    if (wa?.close) {
      setTimeout(() => wa.close(), 600);
    }
  }, [rounds]);

  // ─── Canvas drawing ────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rd = rounds[rounds.length - 1];
    if (!rd) return;

    function draw() {
      if (!ctx || !rd) return;
      ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

      const { history, truth, predictions } = rd;
      const plotW = CANVAS_W - PADDING.left - PADDING.right;
      const plotH = CANVAS_H - PADDING.top - PADDING.bottom;

      // Gather all visible values for scaling
      const allVals: number[] = [...history];
      for (const p of predictions) {
        if (p.final !== null) allVals.push(p.final);
      }
      if (roundSubmitted) {
        for (const def of STEP_DEFS) {
          const idx = def.offset - 1;
          if (idx < truth.length) allVals.push(truth[idx]);
        }
      }
      const minVal = Math.min(...allVals) - 2;
      const maxVal = Math.max(...allVals) + 2;

      // x-mapping: history uses indices 0..HISTORY_LEN-1, then forecast uses virtual positions with gaps
      const toX = (virtualIdx: number) =>
        PADDING.left + (virtualIdx / TOTAL_POINTS) * plotW;
      const toY = (v: number) =>
        PADDING.top + ((maxVal - v) / (maxVal - minVal)) * plotH;

      // Step x-position helper (with block gaps)
      const stepX = (stepIdx: number) => {
        const virt = HISTORY_LEN + stepOffsetToVirtual(STEP_DEFS[stepIdx].offset) - 1;
        return toX(virt);
      };

      // Truth x-position helper (continuous, maps any offset to virtual x)
      const truthX = (offset: number) => {
        // offset is 0-based here (truth array index)
        // actual step offset = offset + 1
        const actualOffset = offset + 1;
        return toX(HISTORY_LEN + stepOffsetToVirtual(actualOffset) - 1);
      };

      // ─── Background ──────────────────────────────────
      ctx.fillStyle = "rgba(13, 13, 30, 0.95)";
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

      // Subtle grid
      ctx.strokeStyle = "rgba(255, 255, 255, 0.04)";
      ctx.lineWidth = 1;
      const gridSteps = 8;
      for (let i = 0; i <= gridSteps; i++) {
        const gy = PADDING.top + (i / gridSteps) * plotH;
        ctx.beginPath();
        ctx.moveTo(PADDING.left, gy);
        ctx.lineTo(CANVAS_W - PADDING.right, gy);
        ctx.stroke();
      }
      for (let i = 0; i < HISTORY_LEN; i += 5) {
        const gx = toX(i);
        ctx.beginPath();
        ctx.moveTo(gx, PADDING.top);
        ctx.lineTo(gx, CANVAS_H - PADDING.bottom);
        ctx.stroke();
      }

      // ─── Y-axis labels ───────────────────────────────
      ctx.fillStyle = "rgba(255, 255, 255, 0.35)";
      ctx.font = "20px 'Geist Mono', monospace";
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      for (let i = 0; i <= gridSteps; i++) {
        const val = maxVal - (i / gridSteps) * (maxVal - minVal);
        const gy = PADDING.top + (i / gridSteps) * plotH;
        ctx.fillText(val.toFixed(1), PADDING.left - 12, gy);
      }

      // ─── Forecast zone background ────────────────────
      const predStartX = toX(HISTORY_LEN);
      ctx.fillStyle = "rgba(100, 180, 255, 0.02)";
      ctx.fillRect(
        predStartX,
        PADDING.top,
        CANVAS_W - PADDING.right - predStartX,
        plotH,
      );

      // ─── Dashed divider at forecast start ────────────
      ctx.setLineDash([8, 6]);
      ctx.strokeStyle = "rgba(100, 180, 255, 0.25)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(predStartX, PADDING.top);
      ctx.lineTo(predStartX, CANVAS_H - PADDING.bottom);
      ctx.stroke();
      ctx.setLineDash([]);

      // "FORECAST" label
      ctx.fillStyle = "rgba(100, 180, 255, 0.4)";
      ctx.font = "bold 18px 'Geist', sans-serif";
      ctx.textAlign = "left";
      ctx.fillText("ПРОГНОЗ", predStartX + 12, PADDING.top + 8);

      // ─── Block banding with increased gap separators ─
      const blockDefs = [
        { steps: [0, 1], color: "rgba(100, 180, 255, 0.03)" },
        { steps: [2, 3], color: "rgba(130, 200, 160, 0.03)" },
        { steps: [4, 5], color: "rgba(200, 170, 100, 0.03)" },
      ];
      for (const block of blockDefs) {
        const x1 = stepX(block.steps[0]) - 20;
        const x2 = stepX(block.steps[1]) + 20;
        ctx.fillStyle = block.color;
        ctx.fillRect(x1, PADDING.top, x2 - x1, plotH);
      }

      // ─── Block gap separators (between block 0-1 and 1-2) ─
      const gapPairs = [
        { after: 1, before: 2 }, // between T+2 and T+4
        { after: 3, before: 4 }, // between T+5 and T+7
      ];
      for (const gap of gapPairs) {
        const xAfter = stepX(gap.after);
        const xBefore = stepX(gap.before);
        const xMid = (xAfter + xBefore) / 2;

        // Faint gap band
        ctx.fillStyle = "rgba(100, 130, 200, 0.04)";
        ctx.fillRect(xAfter + 5, PADDING.top, xBefore - xAfter - 10, plotH);

        // Dashed separator
        ctx.setLineDash([4, 6]);
        ctx.strokeStyle = "rgba(140, 160, 220, 0.18)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(xMid, PADDING.top);
        ctx.lineTo(xMid, CANVAS_H - PADDING.bottom);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // ─── Step labels on x-axis ───────────────────────
      ctx.font = "bold 20px 'Geist Mono', monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      for (let s = 0; s < NUM_STEPS; s++) {
        const def = STEP_DEFS[s];
        const sx = stepX(s);
        const isActive = s === activeStepIndex && !roundSubmitted;
        const isConfirmed = predictions[s]?.confirmed;

        if (isActive) {
          ctx.fillStyle = "rgba(255, 170, 60, 0.95)";
          ctx.font = "bold 22px 'Geist Mono', monospace";
        } else if (isConfirmed) {
          ctx.fillStyle = "rgba(200, 220, 255, 0.55)";
          ctx.font = "bold 20px 'Geist Mono', monospace";
        } else {
          ctx.fillStyle = "rgba(255, 255, 255, 0.2)";
          ctx.font = "bold 20px 'Geist Mono', monospace";
        }
        ctx.fillText(def.label, sx, CANVAS_H - PADDING.bottom + 14);

        // Tick mark
        ctx.beginPath();
        ctx.moveTo(sx, CANVAS_H - PADDING.bottom);
        ctx.lineTo(sx, CANVAS_H - PADDING.bottom + 8);
        ctx.strokeStyle = isActive
          ? "rgba(255, 170, 60, 0.6)"
          : "rgba(255, 255, 255, 0.15)";
        ctx.lineWidth = isActive ? 2 : 1;
        ctx.stroke();
      }

      // ─── History x-axis labels ───────────────────────
      ctx.fillStyle = "rgba(255, 255, 255, 0.2)";
      ctx.font = "16px 'Geist Mono', monospace";
      ctx.textAlign = "center";
      for (let i = 0; i < HISTORY_LEN; i += 5) {
        ctx.fillText(String(i), toX(i), CANVAS_H - PADDING.bottom + 14);
      }

      // ─── History line ────────────────────────────────
      ctx.strokeStyle = "rgba(200, 220, 255, 0.8)";
      ctx.lineWidth = 3;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.beginPath();
      for (let i = 0; i < history.length; i++) {
        const px = toX(i);
        const py = toY(history[i]);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();

      // History glow
      ctx.strokeStyle = "rgba(200, 220, 255, 0.15)";
      ctx.lineWidth = 8;
      ctx.beginPath();
      for (let i = 0; i < history.length; i++) {
        const px = toX(i);
        const py = toY(history[i]);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();

      // History dots
      for (let i = 0; i < history.length; i++) {
        const px = toX(i);
        const py = toY(history[i]);
        ctx.beginPath();
        ctx.arc(px, py, 4, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(200, 220, 255, 0.9)";
        ctx.fill();
      }

      // ─── Truth line (after round submitted) ──────────
      if (roundSubmitted) {
        ctx.strokeStyle = "rgba(80, 220, 130, 0.7)";
        ctx.lineWidth = 2.5;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        // Start from last history point
        ctx.moveTo(
          toX(HISTORY_LEN - 1),
          toY(history[history.length - 1]),
        );
        // Draw through step offsets with correct x-positions
        for (const def of STEP_DEFS) {
          const truthIdx = def.offset - 1;
          if (truthIdx < truth.length) {
            const si = STEP_DEFS.findIndex((d) => d.offset === def.offset);
            ctx.lineTo(stepX(si), toY(truth[truthIdx]));
          }
        }
        ctx.stroke();
        ctx.setLineDash([]);

        // Truth dots only at step offsets
        for (let s = 0; s < NUM_STEPS; s++) {
          const def = STEP_DEFS[s];
          const truthIdx = def.offset - 1;
          if (truthIdx < truth.length) {
            const px = stepX(s);
            const py = toY(truth[truthIdx]);
            ctx.beginPath();
            ctx.arc(px, py, 5, 0, Math.PI * 2);
            ctx.fillStyle = "rgba(80, 220, 130, 0.9)";
            ctx.fill();
            ctx.strokeStyle = "rgba(80, 220, 130, 0.3)";
            ctx.lineWidth = 6;
            ctx.stroke();
          }
        }
      }

      // ─── Prediction points & lines ────────────────────
      const placedPoints: { x: number; y: number; stepIdx: number }[] = [];
      for (let s = 0; s < NUM_STEPS; s++) {
        const pred = predictions[s];
        if (pred && pred.final !== null) {
          placedPoints.push({
            x: stepX(s),
            y: toY(pred.final),
            stepIdx: s,
          });
        }
      }

      // Prediction connecting line
      if (placedPoints.length > 0) {
        ctx.strokeStyle = "rgba(255, 170, 60, 0.5)";
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.moveTo(
          toX(HISTORY_LEN - 1),
          toY(history[history.length - 1]),
        );
        for (const pt of placedPoints) {
          ctx.lineTo(pt.x, pt.y);
        }
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Draw prediction dots
      for (let s = 0; s < NUM_STEPS; s++) {
        const px = stepX(s);
        const pred = predictions[s];
        const isActive = s === activeStepIndex && !roundSubmitted;
        const isConfirmed = pred?.confirmed ?? false;

        if (pred && pred.final !== null) {
          const py = toY(pred.final);

          if (isActive) {
            // Active: pulsing orange glow
            ctx.beginPath();
            ctx.arc(px, py, 16, 0, Math.PI * 2);
            ctx.fillStyle = "rgba(255, 170, 60, 0.10)";
            ctx.fill();

            ctx.beginPath();
            ctx.arc(px, py, 9, 0, Math.PI * 2);
            ctx.fillStyle = "rgba(255, 170, 60, 0.95)";
            ctx.fill();
            ctx.strokeStyle = "rgba(255, 170, 60, 0.5)";
            ctx.lineWidth = 3;
            ctx.stroke();

            // Active vertical guide line
            ctx.setLineDash([2, 4]);
            ctx.strokeStyle = "rgba(255, 170, 60, 0.2)";
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(px, PADDING.top);
            ctx.lineTo(px, CANVAS_H - PADDING.bottom);
            ctx.stroke();
            ctx.setLineDash([]);

            // Value label near point
            ctx.fillStyle = "rgba(255, 170, 60, 0.9)";
            ctx.font = "bold 18px 'Geist Mono', monospace";
            ctx.textAlign = "left";
            ctx.textBaseline = "middle";
            ctx.fillText(pred.final.toFixed(2), px + 16, py);
          } else if (isConfirmed) {
            // Confirmed: solid, muted
            ctx.beginPath();
            ctx.arc(px, py, 6, 0, Math.PI * 2);
            ctx.fillStyle = "rgba(200, 220, 255, 0.7)";
            ctx.fill();
            ctx.strokeStyle = "rgba(200, 220, 255, 0.3)";
            ctx.lineWidth = 2;
            ctx.stroke();

            // Checkmark indicator
            ctx.fillStyle = "rgba(80, 220, 130, 0.8)";
            ctx.font = "bold 16px 'Geist', sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "bottom";
            ctx.fillText("\u2713", px, py - 10);
          } else {
            ctx.beginPath();
            ctx.arc(px, py, 6, 0, Math.PI * 2);
            ctx.fillStyle = "rgba(255, 170, 60, 0.7)";
            ctx.fill();
          }
        } else if (!roundSubmitted) {
          // Future unfilled step - faint placeholder
          const centerY = toY((maxVal + minVal) / 2);
          ctx.beginPath();
          ctx.arc(px, centerY, 6, 0, Math.PI * 2);
          ctx.strokeStyle =
            s === activeStepIndex
              ? "rgba(255, 170, 60, 0.35)"
              : "rgba(255, 255, 255, 0.08)";
          ctx.lineWidth = 1.5;
          ctx.setLineDash([3, 3]);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }

      // ─── Tap target hint for active step (larger circle) ─
      if (!roundSubmitted && activeStepIndex < NUM_STEPS) {
        const pred = predictions[activeStepIndex];
        if (!pred || pred.initial === null) {
          const ax = stepX(activeStepIndex);
          const centerY = toY((maxVal + minVal) / 2);
          // Draw large dashed ring as tap target hint
          ctx.beginPath();
          ctx.arc(ax, centerY, 28, 0, Math.PI * 2);
          ctx.strokeStyle = "rgba(255, 170, 60, 0.15)";
          ctx.lineWidth = 2;
          ctx.setLineDash([4, 4]);
          ctx.stroke();
          ctx.setLineDash([]);

          // "Tap" hint text
          ctx.fillStyle = "rgba(255, 170, 60, 0.35)";
          ctx.font = "14px 'Geist', sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "top";
          ctx.fillText("TAP", ax, centerY + 34);
        }
      }
    }

    draw();
  }, [rounds, roundSubmitted, activeStepIndex]);

  // ─── Derived state ─────────────────────────────────────────
  const sliderVisible =
    !roundSubmitted &&
    activeStepIndex < NUM_STEPS &&
    !!activePred &&
    activePred.initial !== null;

  const yRange = getYRange();
  const canAdvance = roundSubmitted && currentRound + 1 < TOTAL_ROUNDS;
  const allDone =
    rounds.length === TOTAL_ROUNDS && rounds.every((r) => r.score !== null);

  // Voting hint text
  const votingHint = (() => {
    if (roundSubmitted) return "";
    if (!activePred || activePred.initial === null) {
      return `Тыкните на графике, чтобы поставить точку для ${activeStep?.label ?? ""}`;
    }
    return `Подвиньте бегунок, затем нажмите «Согласовать прогноз» для ${activeStep?.label ?? ""}`;
  })();

  return (
    <div className="gradient-mesh min-h-screen min-h-[100dvh] flex flex-col">
      <Header
        phi={PHI}
        isFullscreen={isFullscreen}
        onToggleFullscreen={() => {
          const tg =
            typeof window !== "undefined"
              ? (window as unknown as Record<string, unknown>).Telegram
              : null;
          if (tg && typeof tg === "object" && "WebApp" in tg) {
            const wa = (tg as Record<string, unknown>).WebApp as Record<
              string,
              unknown
            >;
            if (isFullscreen && typeof wa.exitFullscreen === "function") {
              (wa.exitFullscreen as () => void)();
            } else if (
              !isFullscreen &&
              typeof wa.requestFullscreen === "function"
            ) {
              (wa.requestFullscreen as () => void)();
            }
          } else {
            if (!document.fullscreenElement) {
              document.documentElement.requestFullscreen?.();
            } else {
              document.exitFullscreen?.();
            }
          }
          setIsFullscreen((prev) => !prev);
        }}
      />

      <main className="flex-1 flex flex-col gap-3 px-3 py-3 overflow-y-auto">
        {/* Round + step progress */}
        <div className="glass rounded-2xl px-4 py-2.5">
          <RoundProgress
            currentRound={roundSubmitted ? currentRound + 1 : currentRound}
            totalRounds={TOTAL_ROUNDS}
          />
          {/* Step progress within round */}
          {!roundSubmitted && (
            <div className="flex items-center gap-1.5 mt-2">
              <span className="text-[10px] font-mono text-muted-foreground whitespace-nowrap">
                {"Шаг "}{Math.min(activeStepIndex + 1, NUM_STEPS)}/{NUM_STEPS}
              </span>
              <div className="flex items-center gap-0.5 flex-1">
                {STEP_DEFS.map((def, i) => {
                  const pred = currentStepPreds[i];
                  const isConf = pred?.confirmed ?? false;
                  const isActive = i === activeStepIndex;
                  return (
                    <div
                      key={def.label}
                      className="flex flex-col items-center gap-0.5 flex-1"
                    >
                      <div
                        className={
                          "h-1.5 w-full rounded-full transition-all duration-300 " +
                          (isConf
                            ? "bg-success"
                            : isActive
                              ? "bg-chart-5/60"
                              : "bg-muted")
                        }
                      />
                      <span
                        className={
                          "text-[9px] font-mono leading-none transition-colors " +
                          (isConf
                            ? "text-success"
                            : isActive
                              ? "text-chart-5"
                              : "text-muted-foreground/50")
                        }
                      >
                        {def.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Chart with voting panel */}
        <div
          onClick={handleCanvasClick}
          onTouchStart={handleCanvasClick}
          role="img"
          aria-label="Time series chart for forecasting"
        >
          <ChartCard
            canvasRef={canvasRef}
            scrollPosition={scrollPosition}
            onScrollChange={setScrollPosition}
            maxScroll={rounds.length}
            sliderVisible={sliderVisible}
            sliderValue={activePred?.final ?? 0}
            sliderMin={yRange.min}
            sliderMax={yRange.max}
            onSliderChange={handleSliderChange}
            activeStepLabel={activeStep?.label ?? ""}
            onConfirmStep={handleConfirmStep}
            confirmDisabled={!sliderVisible}
            votingHint={votingHint}
            roundSubmitted={roundSubmitted}
          />
        </div>

        {/* Status */}
        <StatusCard type={status.type} message={status.message} />

        {/* Score summary when all done */}
        {allDone && (
          <div className="glass rounded-2xl px-4 py-3 text-center">
            <p className="text-xs text-muted-foreground mb-1">Итоговый результат</p>
            <p className="text-2xl font-bold text-foreground font-mono">
              {rounds.reduce((s, r) => s + (r.score ?? 0), 0)}{" "}
              <span className="text-sm text-muted-foreground font-normal">
                / {TOTAL_ROUNDS * 100}
              </span>
            </p>
          </div>
        )}

        {/* Round done but show step recap */}
        {roundSubmitted && !allDone && (
          <div className="glass rounded-2xl px-4 py-3">
            <p className="text-xs text-muted-foreground mb-2">
              Результаты шагов (начальн. / итог.)
            </p>
            <div className="grid grid-cols-3 gap-2">
              {STEP_DEFS.map((def, i) => {
                const pred = currentStepPreds[i];
                const truthVal =
                  currentRoundData?.truth[def.offset - 1] ?? null;
                return (
                  <div
                    key={def.label}
                    className="text-center bg-muted/20 rounded-lg px-2 py-1.5"
                  >
                    <span className="text-[10px] font-mono text-muted-foreground block">
                      {def.label}
                    </span>
                    <span className="text-xs font-mono text-foreground">
                      {pred?.final?.toFixed(1) ?? "-"}
                    </span>
                    {truthVal !== null && (
                      <span className="text-[10px] font-mono text-success block">
                        {"факт: "}{truthVal.toFixed(1)}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>

      <ActionBar
        canAdvance={canAdvance}
        allDone={allDone}
        onNextRound={handleNextRound}
        onSendResults={handleSendResults}
      />
    </div>
  );
}
