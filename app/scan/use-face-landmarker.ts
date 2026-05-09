"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import type { FaceLandmarker } from "@mediapipe/tasks-vision";
import {
  scoreFace, smoothScores, aggregateMedian, traitsToVector,
  buildScores, jitterTraits,
} from "./face-rating";
import type { Scores, TraitKey } from "./face-rating";
import { rateFromImage, captureVideoFrame } from "./ai-rating";
import type { AIRating } from "./ai-rating";

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

function aiToScores(ai: AIRating): Scores {
  const traits = ai.traits as Record<TraitKey, number>;
  return buildScores(
    traits,
    { label: ai.dom.label,  value: ai.dom.value  },
    { label: ai.flaw.label, value: ai.flaw.value },
  );
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
  const lastUpdateRef    = useRef(0);
  const lastTsRef        = useRef(-1);
  const lastVideoTimeRef = useRef(-1);
  const mountedRef       = useRef(true);
  const phaseRef         = useRef<Phase>("live");
  const samplesRef       = useRef<number[][]>([]);
  const scanStartRef     = useRef(0);
  const skippedRef       = useRef(0);

  const [status,           setStatus]           = useState<Status>("idle");
  const [phase,            setPhase]            = useState<Phase>("live");
  const [scores,           setScores]           = useState<Scores | null>(null);
  const [error,            setError]            = useState<string | null>(null);
  const [scanProgress,     setScanProgress]     = useState(0);
  const [samplesCollected, setSamplesCollected] = useState(0);
  const [samplesSkipped,   setSamplesSkipped]   = useState(0);

  const stopEverything = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const startScan = useCallback(() => {
    if (phaseRef.current !== "live") return;
    samplesRef.current  = [];
    skippedRef.current  = 0;
    scanStartRef.current = performance.now();
    phaseRef.current    = "scanning";
    setPhase("scanning");
    setScanProgress(0);
    setSamplesCollected(0);
    setSamplesSkipped(0);
  }, []);

  const resetScan = useCallback(() => {
    phaseRef.current    = "live";
    samplesRef.current  = [];
    skippedRef.current  = 0;
    smoothedRef.current = null;
    setPhase("live");
    setScores(null);
    setScanProgress(0);
    setSamplesCollected(0);
    setSamplesSkipped(0);
  }, []);

  const start = useCallback(async () => {
    stopEverything();
    setError(null);
    phaseRef.current    = "live";
    samplesRef.current  = [];
    skippedRef.current  = 0;
    smoothedRef.current = null;
    setPhase("live");
    setScores(null);
    setScanProgress(0);
    setSamplesCollected(0);
    setSamplesSkipped(0);

    if (!navigator.mediaDevices?.getUserMedia) { setStatus("unsupported"); return; }
    setStatus("requesting");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
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
          baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
          runningMode: "VIDEO",
          numFaces: 1,
        });
      }
      if (!mountedRef.current) return;
      setStatus("ready");

      const loop = () => {
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
          try { pts = lm.detectForVideo(v, ts).faceLandmarks?.[0]; }
          catch { rafRef.current = requestAnimationFrame(loop); return; }

          if (pts?.length === 478) {
            ctx.fillStyle = "rgba(34,197,94,0.55)";
            for (let i = 0; i < pts.length; i += 2) {
              const pt = pts[i];
              ctx.beginPath();
              ctx.arc(pt.x * c.width, pt.y * c.height, 1, 0, Math.PI * 2);
              ctx.fill();
            }

            const raw = scoreFace(pts);
            if (raw) {
              // Apply per-frame jitter for variation (same position ≠ same score)
              const jittered = jitterTraits(raw.traits);

              // EMA smooth the jittered traits
              smoothedRef.current = smoothScores(smoothedRef.current, { ...raw, traits: jittered });

              const currentPhase = phaseRef.current;

              if (currentPhase === "live" || currentPhase === "scanning") {
                const now = performance.now();
                if (now - lastUpdateRef.current > 55) {
                  lastUpdateRef.current = now;
                  const snap = smoothedRef.current;
                  if (snap) {
                    // Add visible per-display-tick noise so the number visibly fluctuates
                    const noise = (Math.random() - 0.5) * 0.5;
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

                const luma   = lumaCanvasRef.current ? sampleLuma(v, lumaCanvasRef.current) : 128;
                const lumaOk = luma >= LUMA_MIN && luma <= LUMA_MAX;
                const areaOk = faceAreaOk(pts);
                const yawOk  = estimateYaw(pts) <= YAW_RATIO_MAX;

                if (lumaOk && areaOk && yawOk) {
                  samplesRef.current.push(traitsToVector(raw.traits));
                  setSamplesCollected(samplesRef.current.length);
                } else {
                  skippedRef.current += 1;
                  setSamplesSkipped(skippedRef.current);
                }

                if (elapsed >= SCAN_DURATION_MS) {
                  phaseRef.current = "analyzing";
                  setPhase("analyzing");
                  setScanProgress(1);

                  const frame    = captureVideoFrame(v);
                  const fallback = samplesRef.current.length >= 3
                    ? aggregateMedian(samplesRef.current)
                    : smoothedRef.current;

                  void (async () => {
                    let final: Scores | null = null;
                    if (frame) {
                      const ai = await rateFromImage(frame);
                      if (ai) final = aiToScores(ai);
                    }
                    if (!final) final = fallback;
                    if (mountedRef.current) {
                      phaseRef.current = "complete";
                      setPhase("complete");
                      if (final) setScores({ ...final });
                    }
                  })();
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
    videoRef, canvasRef,
    retry: start, startScan, resetScan,
    scanProgress, samplesCollected, samplesSkipped,
  };
}
