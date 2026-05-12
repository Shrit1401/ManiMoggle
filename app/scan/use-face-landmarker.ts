"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import type { FaceLandmarker } from "@mediapipe/tasks-vision";
import {
  scoreFace, smoothScores, aggregateMedian, traitsToVector,
  buildScores, jitterTraits, generateCandy, traitMean,
  detectSmile, detectEyeOpen, computeBonuses, computeBadges,
} from "./face-rating";
import type { Scores, TraitKey, BonusEvent } from "./face-rating";

export type Status = "idle" | "requesting" | "ready" | "denied" | "unsupported" | "error";
export type Phase  = "live" | "scanning" | "analyzing" | "complete";

const WASM_CDN  = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm";
const MODEL_URL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

const SCAN_DURATION_MS = 15_000;
const LUMA_MIN         = 30;
const LUMA_MAX         = 245;
const FACE_AREA_MIN    = 0.10;
const YAW_RATIO_MAX    = 0.18;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sampleLuma(video: HTMLVideoElement, offscreen: HTMLCanvasElement): number {
  const ctx = offscreen.getContext("2d");
  if (!ctx) return 128;
  ctx.drawImage(video, 0, 0, 64, 36);
  const data = ctx.getImageData(0, 0, 64, 36).data;
  let sum = 0;
  for (let i = 0; i < data.length; i += 4) {
    sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }
  return sum / (64 * 36);
}

function estimateYaw(pts: { x: number; y: number }[]): number {
  const fw = Math.abs(pts[454].x - pts[234].x);
  if (fw === 0) return 0;
  return Math.abs(pts[1].x - (pts[234].x + pts[454].x) / 2) / fw;
}

function faceAreaOk(pts: { x: number; y: number }[]): boolean {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return (maxX - minX) * (maxY - minY) >= FACE_AREA_MIN;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useFaceLandmarker() {
  const videoRef         = useRef<HTMLVideoElement>(null);
  const canvasRef        = useRef<HTMLCanvasElement>(null);
  const lumaCanvasRef    = useRef<HTMLCanvasElement | null>(null);
  const rafRef           = useRef<number>(0);
  const streamRef        = useRef<MediaStream | null>(null);
  const landmarkerRef    = useRef<FaceLandmarker | null>(null);
  const smoothedRef      = useRef<Scores | null>(null);
  const rawScoresRef     = useRef<Scores | null>(null);
  const lastUpdateRef    = useRef(0);
  const lastTsRef        = useRef(-1);
  const lastVideoTimeRef = useRef(-1);
  const mountedRef       = useRef(true);
  const phaseRef         = useRef<Phase>("live");
  const samplesRef       = useRef<number[][]>([]);
  const scanStartRef     = useRef(0);
  const skippedRef       = useRef(0);
  const lastLumaRef      = useRef<number>(128);

  // Bonus detection tracking
  const firedBonusKeysRef  = useRef<Set<string>>(new Set());
  const maxSmileRef        = useRef(0);
  const maxEyeRef          = useRef(0);

  const [status,           setStatus]           = useState<Status>("idle");
  const [phase,            setPhase]            = useState<Phase>("live");
  const [scores,           setScores]           = useState<Scores | null>(null);
  const [error,            setError]            = useState<string | null>(null);
  const [scanProgress,     setScanProgress]     = useState(0);
  const [samplesCollected, setSamplesCollected] = useState(0);
  const [samplesSkipped,   setSamplesSkipped]   = useState(0);
  const [liveBonuses,      setLiveBonuses]      = useState<BonusEvent[]>([]);

  const stopEverything = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const startScan = useCallback(() => {
    if (phaseRef.current !== "live") return;
    samplesRef.current        = [];
    skippedRef.current        = 0;
    scanStartRef.current      = performance.now();
    firedBonusKeysRef.current = new Set();
    maxSmileRef.current      = 0;
    maxEyeRef.current        = 0;
    phaseRef.current         = "scanning";
    setPhase("scanning");
    setLiveBonuses([]);
    setScanProgress(0);
    setSamplesCollected(0);
    setSamplesSkipped(0);
  }, []);

  const resetScan = useCallback(() => {
    phaseRef.current          = "live";
    samplesRef.current        = [];
    skippedRef.current        = 0;
    smoothedRef.current       = null;
    rawScoresRef.current      = null;
    firedBonusKeysRef.current = new Set();
    maxSmileRef.current      = 0;
    maxEyeRef.current        = 0;
    setPhase("live");
    setScores(null);
    setLiveBonuses([]);
    setScanProgress(0);
    setSamplesCollected(0);
    setSamplesSkipped(0);
  }, []);

  const start = useCallback(async () => {
    stopEverything();
    setError(null);
    phaseRef.current          = "live";
    samplesRef.current        = [];
    skippedRef.current        = 0;
    smoothedRef.current       = null;
    rawScoresRef.current      = null;
    firedBonusKeysRef.current = new Set();
    maxSmileRef.current      = 0;
    maxEyeRef.current        = 0;
    setPhase("live");
    setScores(null);
    setLiveBonuses([]);
    setScanProgress(0);
    setSamplesCollected(0);
    setSamplesSkipped(0);

    if (!navigator.mediaDevices?.getUserMedia) { setStatus("unsupported"); return; }
    setStatus("requesting");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "user" }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: true,
      });
      if (!mountedRef.current) { stream.getTracks().forEach((t) => t.stop()); return; }
      streamRef.current = stream;

      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await video.play();

      if (!lumaCanvasRef.current) {
        lumaCanvasRef.current = document.createElement("canvas");
        lumaCanvasRef.current.width  = 64;
        lumaCanvasRef.current.height = 36;
      }

      if (!landmarkerRef.current) {
        const { FaceLandmarker, FilesetResolver } = await import("@mediapipe/tasks-vision");
        const vision = await FilesetResolver.forVisionTasks(WASM_CDN);
        landmarkerRef.current = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate: "CPU" },
          runningMode: "VIDEO",
          numFaces: 1,
        });
      }
      if (!mountedRef.current) return;
      setStatus("ready");

      const loop = () => {
        if (!mountedRef.current) return;
        const v  = videoRef.current;
        const c  = canvasRef.current;
        const lm = landmarkerRef.current;
        if (!v || !c || !lm) { rafRef.current = requestAnimationFrame(loop); return; }

        if (v.videoWidth > 0 && c.width !== v.videoWidth) {
          c.width = v.videoWidth; c.height = v.videoHeight;
        }
        const ctx = c.getContext("2d");
        if (ctx) ctx.clearRect(0, 0, c.width, c.height);

        if (v.readyState >= 2 && v.videoWidth > 0 && ctx) {
          if (v.currentTime === lastVideoTimeRef.current) {
            rafRef.current = requestAnimationFrame(loop); return;
          }
          lastVideoTimeRef.current = v.currentTime;
          const ts = Math.max(performance.now(), lastTsRef.current + 1);
          lastTsRef.current = ts;

          let pts: { x: number; y: number; z: number }[] | undefined;
          try { pts = lm.detectForVideo(v, ts)?.faceLandmarks?.[0]; }
          catch { rafRef.current = requestAnimationFrame(loop); return; }

          if (pts?.length === 478) {
            // Draw face mesh contours
            const W = c.width, H = c.height;
            const p = (i: number) => [pts![i].x * W, pts![i].y * H] as [number, number];

            const drawPath = (indices: number[], closed = false, alpha = 0.55) => {
              if (indices.length < 2) return;
              ctx.beginPath();
              ctx.moveTo(...p(indices[0]));
              for (let k = 1; k < indices.length; k++) ctx.lineTo(...p(indices[k]));
              if (closed) ctx.closePath();
              ctx.strokeStyle = `rgba(34,197,94,${alpha})`;
              ctx.lineWidth = 1;
              ctx.stroke();
            };

            drawPath([10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109,10], true, 0.7);
            drawPath([33,7,163,144,145,153,154,155,133,173,157,158,159,160,161,246,33], true, 0.65);
            drawPath([263,249,390,373,374,380,381,382,362,398,384,385,386,387,388,466,263], true, 0.65);
            drawPath([70,63,105,66,107,55,65,52,53,46], false, 0.5);
            drawPath([300,293,334,296,336,285,295,282,283,276], false, 0.5);
            drawPath([168,6,197,195,5,4,1,19,94], false, 0.5);
            drawPath([129,98,97,2,326,327,358,279,360,363,440,344,438,457,274,461,462,370,94], false, 0.45);
            drawPath([61,146,91,181,84,17,314,405,321,375,291,409,270,269,267,0,37,39,40,185,61], true, 0.65);
            drawPath([78,95,88,178,87,14,317,402,318,324,308,415,310,311,312,13,82,81,80,191,78], true, 0.5);
            ctx.fillStyle = "rgba(34,197,94,0.8)";
            for (const i of [234,454,152,10,33,263,1,61,291]) {
              ctx.beginPath();
              ctx.arc(pts![i].x * W, pts![i].y * H, 2, 0, Math.PI * 2);
              ctx.fill();
            }

            const frameLuma = lumaCanvasRef.current ? sampleLuma(v, lumaCanvasRef.current) : undefined;
            if (frameLuma !== undefined) lastLumaRef.current = frameLuma;

            const raw = scoreFace(pts, frameLuma);
            if (raw) {
              const jittered = jitterTraits(raw.traits);
              smoothedRef.current = smoothScores(smoothedRef.current, { ...raw, traits: jittered });

              const currentPhase = phaseRef.current;

              if (currentPhase === "live" || currentPhase === "scanning") {
                const now = performance.now();
                if (now - lastUpdateRef.current > 55) {
                  lastUpdateRef.current = now;
                  const snap = smoothedRef.current;
                  if (snap) {
                    const noise = (Math.random() - 0.5) * 0.7;
                    const displayOverall = Math.max(1, Math.min(10, snap.overall + noise));
                    setScores({
                      ...snap,
                      overall: displayOverall,
                      elo: Math.round(displayOverall * 42 + 15),
                    });
                  }
                }
              }

              if (currentPhase === "scanning") {
                const elapsed = performance.now() - scanStartRef.current;
                setScanProgress(Math.min(elapsed / SCAN_DURATION_MS, 1));

                const lumaVal = frameLuma ?? 128;
                const lumaOk  = lumaVal >= LUMA_MIN && lumaVal <= LUMA_MAX;
                const areaOk  = faceAreaOk(pts);
                const yawOk   = estimateYaw(pts) <= YAW_RATIO_MAX;

                if (lumaOk && areaOk && yawOk) {
                  samplesRef.current.push(traitsToVector(raw.traits));
                  setSamplesCollected(samplesRef.current.length);
                } else {
                  skippedRef.current += 1;
                  setSamplesSkipped(skippedRef.current);
                }

                // ── Live bonus detection ───────────────────────────────────────
                const fired = firedBonusKeysRef.current;

                const smile = detectSmile(pts);
                if (smile.detected) {
                  maxSmileRef.current = Math.max(maxSmileRef.current, smile.strength);
                  if (!fired.has("smile")) {
                    fired.add("smile");
                    const delta = Math.min(0.15 + smile.strength * 0.15, 0.30);
                    setLiveBonuses(prev => [...prev, { key: "smile", label: "Genuine Smile", delta, traitKey: "harmony" }]);
                  }
                }

                const eyeOpen = detectEyeOpen(pts);
                if (eyeOpen.detected) {
                  maxEyeRef.current = Math.max(maxEyeRef.current, eyeOpen.strength);
                  if (!fired.has("eye_contact")) {
                    fired.add("eye_contact");
                    const delta = Math.min(0.10 + eyeOpen.strength * 0.10, 0.20);
                    setLiveBonuses(prev => [...prev, { key: "eye_contact", label: "Eye Contact", delta, traitKey: "canthalTilt" }]);
                  }
                }

                if (raw.traits.goldenRatio >= 7.5 && !fired.has("golden_ratio")) {
                  fired.add("golden_ratio");
                  setLiveBonuses(prev => [...prev, { key: "golden_ratio", label: "Phi Aligned", delta: 0.20, traitKey: "goldenRatio" }]);
                }

                if (raw.traits.jawline >= 7.5 && !fired.has("sharp_jaw")) {
                  fired.add("sharp_jaw");
                  setLiveBonuses(prev => [...prev, { key: "sharp_jaw", label: "Sharp Mandible", delta: 0.20, traitKey: "jawline" }]);
                }

                if (raw.traits.symmetry >= 8.0 && !fired.has("mirror_symmetry")) {
                  fired.add("mirror_symmetry");
                  setLiveBonuses(prev => [...prev, { key: "mirror_symmetry", label: "Mirror Symmetry", delta: 0.15, traitKey: "symmetry" }]);
                }

                if (raw.traits.harmony >= 7.5 && !fired.has("perfect_harmony")) {
                  fired.add("perfect_harmony");
                  setLiveBonuses(prev => [...prev, { key: "perfect_harmony", label: "Perfect Harmony", delta: 0.15, traitKey: "harmony" }]);
                }

                // ── Transition to analyzing (score computation) ──────────────
                if (elapsed >= SCAN_DURATION_MS) {
                  phaseRef.current = "analyzing";
                  setPhase("analyzing");
                  setScanProgress(1);

                  const fallback = samplesRef.current.length >= 3
                    ? aggregateMedian(samplesRef.current)
                    : smoothedRef.current;

                  rawScoresRef.current = fallback;

                  const capturedLuma  = lastLumaRef.current;
                  const capturedSmile = maxSmileRef.current;
                  const capturedEye   = maxEyeRef.current;

                  // Brief analyzing pause, then compute final score immediately
                  setTimeout(() => {
                    if (!mountedRef.current) return;
                    const base = fallback;
                    if (base) {
                      const candy      = generateCandy();
                      const bonuses    = computeBonuses(base.traits, {
                        luma:          capturedLuma,
                        smileStrength: capturedSmile,
                        eyeStrength:   capturedEye,
                      });
                      const badges     = computeBadges(base.traits);
                      const bonusDelta = bonuses.reduce((s, b) => s + b.delta, 0);
                      const baseMean   = traitMean(base.traits);
                      const finalOverall = Math.max(3, Math.min(10, baseMean + candy + bonusDelta));
                      const final: Scores = {
                        ...base,
                        overall: finalOverall,
                        elo:     Math.round(finalOverall * 42 + 15),
                        bonuses,
                        badges,
                      };
                      phaseRef.current = "complete";
                      setPhase("complete");
                      setScores(final);
                    } else {
                      phaseRef.current = "complete";
                      setPhase("complete");
                    }
                  }, 700);
                }
              }
            }
          } else {
            smoothedRef.current = null;
            if (phaseRef.current === "live") setScores(null);
          }
        }
        rafRef.current = requestAnimationFrame(loop);
      };

      rafRef.current = requestAnimationFrame(loop);
    } catch (e: unknown) {
      if (!mountedRef.current) return;
      const err = e as { name?: string; message?: string };
      if (err.name === "NotAllowedError" || err.name === "NotFoundError") setStatus("denied");
      else { setStatus("error"); setError(err.message ?? "Failed to initialize scanner"); }
    }
  }, [stopEverything]);

  useEffect(() => {
    mountedRef.current = true;
    Promise.resolve().then(() => { if (mountedRef.current) start(); });
    return () => {
      mountedRef.current = false;
      stopEverything();
      landmarkerRef.current?.close();
      landmarkerRef.current = null;
    };
  }, [start, stopEverything]);

  return {
    status, phase, scores, error,
    videoRef, canvasRef, streamRef,
    retry: start, startScan, resetScan,
    scanProgress, samplesCollected, samplesSkipped,
    liveBonuses,
    rawScores: rawScoresRef.current,
  };
}
