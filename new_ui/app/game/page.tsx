"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/game/header";
import { ChartCard } from "@/components/game/chart-card";
import { StatusCard, type StatusType } from "@/components/game/status-card";
import { RoundProgress } from "@/components/game/round-progress";
import { ActionBar } from "@/components/game/action-bar";

const CANVAS_W = 2200;
const CANVAS_H = 500;
const TOTAL_ROUNDS = 5;
const HISTORY_LEN = 30;
const PHI_POOL = [0.3, 0.5, 0.7, 0.9] as const;
type Phi = (typeof PHI_POOL)[number];
const SIGMA = 1.0;
const API_BASE = "http://127.0.0.1:8000";

const PADDING = { top: 40, bottom: 130, left: 60, right: 80 };

const STEP_DEFS = [
  { label: "T+1", offset: 1, block: 0 },
  { label: "T+2", offset: 2, block: 0 },
  { label: "T+4", offset: 4, block: 1 },
  { label: "T+5", offset: 5, block: 1 },
  { label: "T+7", offset: 7, block: 2 },
  { label: "T+8", offset: 8, block: 2 },
] as const;

const NUM_STEPS = STEP_DEFS.length;
const MAX_OFFSET = STEP_DEFS[NUM_STEPS - 1].offset;
const VISIBLE_HISTORY_POINTS = 30;
const VISIBLE_TOTAL_POINTS = VISIBLE_HISTORY_POINTS + MAX_OFFSET;
const GAME_STORAGE_KEY = "forecast_game_state_v1";

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
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}




type ForecastPoint = {
  xIndex: number;
  label: string;
  initial: number | null;
  final: number | null;
  confirmed: boolean;
  truth: number | null;
};



export default function ForecastGamePage() {
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [revealUpto, setRevealUpto] = useState(-1);
  const [status, setStatus] = useState<{ type: StatusType; message: string }>({
    type: "info",
    message: "Нажмите на график, чтобы отметить значение прогноза.",
  });

  const [blockIndex, setBlockIndex] = useState(0);
  const [phi, setPhi] = useState<Phi>(0.3);
  const [series, setSeries] = useState<number[]>([]);
  const [historyEnd, setHistoryEnd] = useState(HISTORY_LEN - 1);
  const [forecastPoints, setForecastPoints] = useState<ForecastPoint[]>([]);
  const [scores, setScores] = useState<number[]>([]);

  const history = series.slice(0, historyEnd + 1);

  const visibleStart = Math.max(0, historyEnd - (VISIBLE_HISTORY_POINTS - 1));
  const visibleEnd = historyEnd;

  const visibleHistory = series.slice(visibleStart, visibleEnd + 1);
  const [hydrated, setHydrated] = useState(false);
  const currentBlockStart = blockIndex * NUM_STEPS;
  const currentStepPreds = forecastPoints.slice(
    currentBlockStart,
    currentBlockStart + NUM_STEPS,
  );

  const activeStep = STEP_DEFS[activeStepIndex];
  const activePred = currentStepPreds[activeStepIndex];

  const truthForCurrentWindow = currentStepPreds.map((p) => p?.truth ?? null);

  const totalScore = scores.reduce((sum, x) => sum + x, 0);
  const avgScore = scores.length ? Math.round(totalScore / scores.length) : 0;
  const allDone = scores.length >= TOTAL_ROUNDS;

  useEffect(() => {
    const raw =
      typeof window !== "undefined"
        ? localStorage.getItem(GAME_STORAGE_KEY)
        : null;

    if (raw) {
      try {
        const saved = JSON.parse(raw);

        if (PHI_POOL.includes(saved.phi)) setPhi(saved.phi);

        setSeries(saved.series ?? []);
        setHistoryEnd(saved.historyEnd ?? HISTORY_LEN - 1);
        setForecastPoints(saved.forecastPoints ?? []);
        setScores(saved.scores ?? []);
        setBlockIndex(saved.blockIndex ?? 0);
        setActiveStepIndex(saved.activeStepIndex ?? 0);
        setRevealUpto(saved.revealUpto ?? -1);
        setStatus(
          saved.status ?? {
            type: "info",
            message: "Нажмите на график, чтобы задать прогноз для T+1.",
          },
        );

        setHydrated(true);
        return;
      } catch {
        localStorage.removeItem(GAME_STORAGE_KEY);
      }
    }

    const newPhi = PHI_POOL[Math.floor(Math.random() * PHI_POOL.length)];
    setPhi(newPhi);

    const fullSeries = generateAR1(
      newPhi,
      SIGMA,
      HISTORY_LEN + TOTAL_ROUNDS * 12 + 40,
    );

    setSeries(fullSeries);
    setHistoryEnd(HISTORY_LEN - 1);

    const firstBase = HISTORY_LEN - 1;
    const firstBlock: ForecastPoint[] = STEP_DEFS.map((def) => {
      const xIndex = firstBase + def.offset;
      return {
        xIndex,
        label: def.label,
        initial: null,
        final: null,
        confirmed: false,
        truth: xIndex < fullSeries.length ? fullSeries[xIndex] : null,
      };
    });

    setForecastPoints(firstBlock);
    setHydrated(true);
  }, []);
  

  
  useEffect(() => {
    if (!hydrated) return;
    if (series.length === 0) return;

    const payload = {
      phi,
      series,
      historyEnd,
      forecastPoints,
      scores,
      blockIndex,
      activeStepIndex,
      revealUpto,
      status,
    };

    localStorage.setItem(GAME_STORAGE_KEY, JSON.stringify(payload));
  }, [
    hydrated,
    series,
    historyEnd,
    forecastPoints,
    scores,
    blockIndex,
    activeStepIndex,
    revealUpto,
    status,
  ]);

  const getYRange = useCallback((): { min: number; max: number } => {
   return { min: -6, max: 6 };}, []);

  const handleCanvasClick = useCallback(
    (
      e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>,
    ) => {
      if (blockIndex >= TOTAL_ROUNDS) return;
      if (activeStepIndex >= NUM_STEPS) return;
      if (activePred && activePred.initial !== null) return;

      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const scaleX = CANVAS_W / rect.width;
      const scaleY = CANVAS_H / rect.height;

      let clientX: number;
      let clientY: number;

      if ("touches" in e) {
        if (e.touches.length === 0) return;
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
      } else {
        clientX = e.clientX;
        clientY = e.clientY;
      }

      const y = (clientY - rect.top) * scaleY;
      const plotW = CANVAS_W - PADDING.left - PADDING.right;
      const plotH = CANVAS_H - PADDING.top - PADDING.bottom;

      const minVal = -6;
      const maxVal = 6;

      const yClamp = Math.max(
        PADDING.top,
        Math.min(y, CANVAS_H - PADDING.bottom),
      );
      const yVal =
        maxVal - ((yClamp - PADDING.top) / plotH) * (maxVal - minVal);

      const x = (clientX - rect.left) * scaleX;

      const toX = (indexInWindow: number) =>
        PADDING.left + (indexInWindow / VISIBLE_TOTAL_POINTS) * plotW;

      const predStartX = toX(visibleHistory.length);

      if (x < predStartX - 60) return;

      setForecastPoints((prev) => {
        const updated = [...prev];
        const idx = currentBlockStart + activeStepIndex;
        updated[idx] = {
          ...updated[idx],
          initial: yVal,
          final: yVal,
          confirmed: false,
        };
        return updated;
      });

      setStatus({
        type: "waiting",
        message: `Измените положение точки, затем нажмите «Согласовать прогноз» для ${activeStep.label}.`,
      });
    },
    [
      blockIndex,
      activeStepIndex,
      activePred,
      history,
      currentStepPreds,
      activeStep,
      currentBlockStart,
    ],
  );

  const handleSliderChange = useCallback(
    (value: number) => {
      if (blockIndex >= TOTAL_ROUNDS || activeStepIndex >= NUM_STEPS) return;
      if (!activePred) return;

      setForecastPoints((prev) => {
        const updated = [...prev];
        const idx = currentBlockStart + activeStepIndex;
        const prevPoint = updated[idx];

        updated[idx] = {
          ...prevPoint,
          initial: prevPoint.initial ?? value,
          final: value,
          confirmed: false,
        };
        return updated;
      });
    },
    [blockIndex, activeStepIndex, activePred, currentBlockStart],
  );

  const handleConfirmStep = useCallback(() => {
    if (blockIndex >= TOTAL_ROUNDS || activeStepIndex >= NUM_STEPS) return;
    if (!activePred || activePred.initial === null) return;

    setForecastPoints((prev) => {
      const updated = [...prev];
      const idx = currentBlockStart + activeStepIndex;
      updated[idx] = {
        ...updated[idx],
        confirmed: true,
      };
      return updated;
    });

    setRevealUpto(activeStepIndex);

    const nextIndex = activeStepIndex + 1;

    if (nextIndex < NUM_STEPS) {
      setActiveStepIndex(nextIndex);
      setStatus({
        type: "success",
        message: `Шаг ${activeStep.label} согласован! Факт показан зелёным. Теперь поставьте точку для ${STEP_DEFS[nextIndex].label}.`,
      });
      return;
    }

    let sumSqErr = 0;
    let count = 0;

    for (let i = 0; i < NUM_STEPS; i++) {
      const point = currentStepPreds[i];
      const predVal = point?.final ?? null;
      const truthVal = point?.truth ?? null;

      if (predVal !== null && truthVal !== null) {
        const diff = predVal - truthVal;
        sumSqErr += diff * diff;
        count++;
      }
    }

    const mse = count > 0 ? sumSqErr / count : 0;
    const score = Math.max(0, Math.round(100 - mse * 10));

    setScores((prev) => [...prev, score]);

    if (blockIndex + 1 >= TOTAL_ROUNDS) {
      setStatus({
        type: score >= 60 ? "success" : "error",
        message: `Прогноз завершён!`,
      });
      return;
    }

    const newHistoryEnd = historyEnd + MAX_OFFSET;
    const nextBlock: ForecastPoint[] = STEP_DEFS.map((def) => {
      const xIndex = newHistoryEnd + def.offset;
      return {
        xIndex,
        label: def.label,
        initial: null,
        final: null,
        confirmed: false,
        truth: xIndex < series.length ? series[xIndex] : null,
      };
    });

    setForecastPoints((prev) => [...prev, ...nextBlock]);
    setHistoryEnd(newHistoryEnd);
    setBlockIndex((prev) => prev + 1);
    setActiveStepIndex(0);
    setRevealUpto(-1);

    setStatus({
      type: "info",
      message: "Справа появился новый блок прогноза. Продолжаем дальше.",
    });
  }, [
    blockIndex,
    activeStepIndex,
    activePred,
    activeStep,
    currentBlockStart,
    currentStepPreds,
    historyEnd,
    series,
  ]);



  const handleSendResults = useCallback(async () => {
    try {
      const userIdRaw =
        typeof window !== "undefined" ? localStorage.getItem("user_id") : null;
      const userId = userIdRaw ? Number(userIdRaw) : null;

      if (!userId) {
        setStatus({
          type: "error",
          message: "Не найден user_id. Сначала пройди анкету заново.",
        });
        return;
      }

      const payload = {
        phi,
        totalScore,
        avgScore,
        rounds: Array.from({ length: scores.length }, (_, blockIdx) => {
          const start = blockIdx * NUM_STEPS;
          const points = forecastPoints.slice(start, start + NUM_STEPS);

          return {
            score: scores[blockIdx] ?? null,
            predictions: points.map((p) => ({
              step: p.label,
              xIndex: p.xIndex,
              initial: p.initial,
              final: p.final,
              truth: p.truth,
            })),
          };
        }),
      };

      const response = await fetch(`${API_BASE}/results/save`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          user_id: userId,
          payload,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data?.detail || "Не удалось сохранить результаты");
      }

      setStatus({
        type: "success",
        message: `Результаты сохранены!`,
      });

      localStorage.removeItem(GAME_STORAGE_KEY);

      setTimeout(() => {
        router.push("/reward");
      }, 800);

    } catch (e: any) {
      setStatus({
        type: "error",
        message: e?.message || "Ошибка при сохранении результатов",
      });
    }
  }, [avgScore, phi, router, scores, forecastPoints, totalScore]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const maybeCtx = canvas.getContext("2d");
    if (!maybeCtx) return;

    const ctx = maybeCtx;

    if (history.length === 0) return;

    function draw() {
      ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

      const truth = truthForCurrentWindow;
      const allPredictions = forecastPoints;
      const currentPredictions = currentStepPreds;
      const plotW = CANVAS_W - PADDING.left - PADDING.right;
      const plotH = CANVAS_H - PADDING.top - PADDING.bottom;

      const dynamicTotalPoints = VISIBLE_TOTAL_POINTS;

      const allVals: number[] = [...visibleHistory];
      for (const p of allPredictions) {
        if (p.final !== null) allVals.push(p.final);
      }

      const showTruth = revealUpto >= 0;
      if (showTruth) {
        for (let s = 0; s <= revealUpto; s++) {
          const truthVal = truth[s];
          if (truthVal !== null) allVals.push(truthVal);
        }
      }

      const minVal = -6;
      const maxVal = 6;

      const toX = (indexInWindow: number) =>
        PADDING.left + (indexInWindow / dynamicTotalPoints) * plotW;

      const toY = (v: number) =>
        PADDING.top + ((maxVal - v) / (maxVal - minVal)) * plotH;

      const pointX = (xIndex: number) => toX(xIndex - visibleStart);

      ctx.fillStyle = "rgba(13, 13, 30, 0.95)";
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

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

      for (let i = 0; i < visibleHistory.length; i += 5) {
        const gx = toX(i);
        ctx.beginPath();
        ctx.moveTo(gx, PADDING.top);
        ctx.lineTo(gx, CANVAS_H - PADDING.bottom);
        ctx.stroke();
      }

      ctx.fillStyle = "rgba(255, 255, 255, 0.35)";
      ctx.font = "20px 'Geist Mono', monospace";
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";

      for (let i = 0; i <= gridSteps; i++) {
        const val = maxVal - (i / gridSteps) * (maxVal - minVal);
        const gy = PADDING.top + (i / gridSteps) * plotH;
        ctx.fillText(val.toFixed(1), PADDING.left - 12, gy);
      }

      const predStartX = pointX(historyEnd + 1);
      ctx.fillStyle = "rgba(100, 180, 255, 0.02)";
      ctx.fillRect(
        predStartX,
        PADDING.top,
        CANVAS_W - PADDING.right - predStartX,
        plotH,
      );

      ctx.setLineDash([8, 6]);
      ctx.strokeStyle = "rgba(100, 180, 255, 0.25)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(predStartX, PADDING.top);
      ctx.lineTo(predStartX, CANVAS_H - PADDING.bottom);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = "rgba(100, 180, 255, 0.4)";
      ctx.font = "bold 18px 'Geist', sans-serif";
      ctx.textAlign = "left";
      ctx.fillText("ПРОГНОЗ", predStartX + 12, PADDING.top + 8);

      const blockDefs = [
        { steps: [0, 1], color: "rgba(100, 180, 255, 0.03)" },
        { steps: [2, 3], color: "rgba(130, 200, 160, 0.03)" },
        { steps: [4, 5], color: "rgba(200, 170, 100, 0.03)" },
      ];

      for (const block of blockDefs) {
        const p1 = currentStepPreds[block.steps[0]];
        const p2 = currentStepPreds[block.steps[1]];
        if (!p1 || !p2) continue;

        const x1 = pointX(p1.xIndex) - 20;
        const x2 = pointX(p2.xIndex) + 20;
        ctx.fillStyle = block.color;
        ctx.fillRect(x1, PADDING.top, x2 - x1, plotH);
      }


      ctx.font = "bold 20px 'Geist Mono', monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "top";

      for (let s = 0; s < NUM_STEPS; s++) {
        const point = currentStepPreds[s];
        if (!point) continue;
        const sx = pointX(point.xIndex);
        const isActive = s === activeStepIndex && blockIndex < TOTAL_ROUNDS;
        const isConfirmed = point.confirmed;

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

        ctx.fillText(point.label, sx, CANVAS_H - PADDING.bottom + 14);

        ctx.beginPath();
        ctx.moveTo(sx, CANVAS_H - PADDING.bottom);
        ctx.lineTo(sx, CANVAS_H - PADDING.bottom + 8);
        ctx.strokeStyle = isActive
          ? "rgba(255, 170, 60, 0.6)"
          : "rgba(255, 255, 255, 0.15)";
        ctx.lineWidth = isActive ? 2 : 1;
        ctx.stroke();
      }

      ctx.fillStyle = "rgba(255, 255, 255, 0.2)";
      ctx.font = "16px 'Geist Mono', monospace";
      ctx.textAlign = "center";

      for (let i = 0; i < visibleHistory.length; i += 5) {
        const globalIndex = visibleStart + i;
        ctx.fillText(String(globalIndex), toX(i), CANVAS_H - PADDING.bottom + 14);
      }

      ctx.strokeStyle = "rgba(200, 220, 255, 0.8)";
      ctx.lineWidth = 3;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.beginPath();

      for (let i = 0; i < visibleHistory.length; i++) {
        const px = toX(i);
        const py = toY(visibleHistory[i]);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();

      ctx.strokeStyle = "rgba(200, 220, 255, 0.15)";
      ctx.lineWidth = 8;
      ctx.beginPath();

      for (let i = 0; i < visibleHistory.length; i++) {
        const px = toX(i);
        const py = toY(visibleHistory[i]);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();

      for (let i = 0; i < visibleHistory.length; i++) {
        const px = toX(i);
        const py = toY(visibleHistory[i]);
        ctx.beginPath();
        ctx.arc(px, py, 4, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(200, 220, 255, 0.9)";
        ctx.fill();
      }

      if (showTruth) {
        ctx.strokeStyle = "rgba(80, 220, 130, 0.7)";
        ctx.lineWidth = 2.5;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(
          toX(visibleHistory.length - 1),
          toY(visibleHistory[visibleHistory.length - 1]),
        );

      for (let s = 0; s <= revealUpto; s++) {
        const point = currentStepPreds[s];
        const truthVal = point?.truth ?? null;
        if (point && truthVal !== null) {
          ctx.lineTo(pointX(point.xIndex), toY(truthVal));
        }
      }

        ctx.stroke();
        ctx.setLineDash([]);

        for (let s = 0; s <= revealUpto; s++) {
          const point = currentStepPreds[s];
          const truthVal = point?.truth ?? null;
          if (point && truthVal !== null) {
            const px = pointX(point.xIndex);
            const py = toY(truthVal);
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

      const placedPoints: { x: number; y: number; xIndex: number }[] = [];

      for (const pred of allPredictions) {
        if (!pred || pred.final === null) continue;

        const localX = pred.xIndex - visibleStart;
        if (localX < 0 || localX > VISIBLE_TOTAL_POINTS) continue;

        placedPoints.push({
          x: pointX(pred.xIndex),
          y: toY(pred.final),
          xIndex: pred.xIndex,
        });
      }

      placedPoints.sort((a, b) => a.xIndex - b.xIndex);

      if (placedPoints.length > 0) {
        ctx.strokeStyle = "rgba(255, 170, 60, 0.7)";
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();

        ctx.moveTo(placedPoints[0].x, placedPoints[0].y);
        for (let i = 1; i < placedPoints.length; i++) {
          ctx.lineTo(placedPoints[i].x, placedPoints[i].y);
        }

        ctx.stroke();
        ctx.setLineDash([]);
      }


      for (let s = 0; s < allPredictions.length; s++) {
        const pred = allPredictions[s];
        if (!pred) continue;

        const localX = pred.xIndex - visibleStart;
        if (localX < 0 || localX > VISIBLE_TOTAL_POINTS) continue;

        const px = pointX(pred.xIndex);

        const isCurrentBlockPoint =
          s >= currentBlockStart && s < currentBlockStart + NUM_STEPS;

        const localStepIndex = s - currentBlockStart;
        const isActive =
          isCurrentBlockPoint && localStepIndex === activeStepIndex && !allDone;

        const isConfirmed = pred.confirmed;

        if (pred.final !== null) {
          const py = toY(pred.final);

          if (isActive) {
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

            ctx.fillStyle = "rgba(255, 170, 60, 0.9)";
            ctx.font = "bold 18px 'Geist Mono', monospace";
            ctx.textAlign = "left";
            ctx.textBaseline = "middle";
            ctx.fillText(pred.final.toFixed(2), px + 16, py);
            } else if (isConfirmed) {
              ctx.beginPath();
              ctx.arc(px, py, 6, 0, Math.PI * 2);
              ctx.fillStyle = isCurrentBlockPoint
                ? "rgba(255, 170, 60, 0.85)"
                : "rgba(255, 170, 60, 0.45)";
              ctx.fill();
            } else {
            ctx.beginPath();
            ctx.arc(px, py, 6, 0, Math.PI * 2);
            ctx.fillStyle = "rgba(255, 170, 60, 0.7)";
            ctx.fill();
          }
        } else if (isCurrentBlockPoint && !allDone) {
          const centerY = toY((maxVal + minVal) / 2);
          ctx.beginPath();
          ctx.arc(px, centerY, 6, 0, Math.PI * 2);
          ctx.strokeStyle =
            localStepIndex === activeStepIndex
              ? "rgba(255, 170, 60, 0.35)"
              : "rgba(255, 255, 255, 0.08)";
          ctx.lineWidth = 1.5;
          ctx.setLineDash([3, 3]);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }

      if (!allDone && activeStepIndex < NUM_STEPS) {
        const pred = currentStepPreds[activeStepIndex];
        if (!pred || pred.initial === null) {
          const currentPoint = currentStepPreds[activeStepIndex];
          if (!currentPoint) return;
          const ax = pointX(currentPoint.xIndex);
          const centerY = toY((maxVal + minVal) / 2);

          ctx.beginPath();
          ctx.arc(ax, centerY, 28, 0, Math.PI * 2);
          ctx.strokeStyle = "rgba(255, 170, 60, 0.15)";
          ctx.lineWidth = 2;
          ctx.setLineDash([4, 4]);
          ctx.stroke();
          ctx.setLineDash([]);

          ctx.fillStyle = "rgba(255, 170, 60, 0.35)";
          ctx.font = "14px 'Geist', sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "top";
          ctx.fillText("TAP", ax, centerY + 34);
        }
      }
    }
    draw();
  }, [
    history,
    visibleHistory,
    currentStepPreds,
    truthForCurrentWindow,
    forecastPoints,
    blockIndex,
    activeStepIndex,
    revealUpto,
    historyEnd,
    currentBlockStart,
    allDone,
  ]);



  const sliderVisible =
    !allDone &&
    activeStepIndex < NUM_STEPS &&
    !!activePred;

  const yRange = getYRange();
  const canAdvance = false;

  const votingHint = (() => {
    if (scores.length >= TOTAL_ROUNDS) return "";
    if (!activePred || activePred.initial === null) {
      return `Нажмите на график, чтобы отметить значение прогноза для ${activeStep?.label ?? ""}`;
    }
    return `Измените положение точки, затем нажмите «Согласовать прогноз» для ${activeStep?.label ?? ""}`;
  })();

  return (
    <div className="gradient-mesh min-h-screen min-h-[100dvh] flex flex-col">
      <Header
        phi={phi}
        isFullscreen={isFullscreen}
        onToggleFullscreen={() => {
          if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen?.();
          } else {
            document.exitFullscreen?.();
          }
          setIsFullscreen((prev) => !prev);
        }}
      />

      <main className="flex-1 flex flex-col gap-3 px-3 py-3 overflow-y-auto">
        <div className="glass rounded-2xl px-4 py-2.5">
          <RoundProgress
            currentRound={blockIndex + 1}
            totalRounds={TOTAL_ROUNDS}
          />

          {!allDone && (
            <div className="flex items-center gap-1.5 mt-2">
              <span className="text-[10px] font-mono text-muted-foreground whitespace-nowrap">
                Шаг {Math.min(activeStepIndex + 1, NUM_STEPS)}/{NUM_STEPS}
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

        <div
          onClick={handleCanvasClick}
          onTouchStart={handleCanvasClick}
          role="img"
          aria-label="Time series chart for forecasting"
        >
          <ChartCard
            canvasRef={canvasRef}
            scrollPosition={0}
            onScrollChange={() => {}}
            maxScroll={0}
            sliderVisible={sliderVisible}
            sliderValue={activePred?.final ?? 0}
            sliderMin={yRange.min}
            sliderMax={yRange.max}
            onSliderChange={handleSliderChange}
            activeStepLabel={activeStep?.label ?? ""}
            onConfirmStep={handleConfirmStep}
            confirmDisabled={!sliderVisible}
            votingHint={votingHint}
            roundSubmitted={scores.length >= TOTAL_ROUNDS}
          />
        </div>

        <StatusCard type={status.type} message={status.message} />

      {allDone && (
        <div className="glass rounded-2xl px-4 py-4 text-center">
          <p className="text-sm text-muted-foreground">
            Эксперимент завершён. Нажмите кнопку ниже, чтобы отправить результаты.
          </p>
        </div>
      )}
      </main>

      <ActionBar
        canAdvance={false}
        allDone={scores.length >= TOTAL_ROUNDS}
        onNextRound={() => {}}
        onSendResults={handleSendResults}
      />
    </div>
  );
}