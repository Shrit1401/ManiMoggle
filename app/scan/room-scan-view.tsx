"use client";

import { useEffect, useRef } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { useFaceLandmarker } from "./use-face-landmarker";
import { Hud } from "./hud";

interface Props {
  roomId: Id<"rooms">;
  sessionId: string;
  playerName: string;
  onDone: () => void;
}

export function RoomScanView({ roomId, sessionId, playerName, onDone }: Props) {
  const {
    status, phase, scores, error,
    videoRef, canvasRef,
    retry, startScan, resetScan,
    scanProgress, samplesCollected, samplesSkipped,
  } = useFaceLandmarker();

  const submitScore = useMutation(api.players.submitScore);
  const submittedRef = useRef(false);

  useEffect(() => {
    if (phase !== "complete" || !scores || submittedRef.current) return;
    submittedRef.current = true;
    void submitScore({
      roomId,
      sessionId,
      overall: scores.overall,
      elo: scores.elo,
      sub: scores.sub,
      tierCode: scores.tier.code,
      tierColor: scores.tier.starColor,
      level: scores.level,
      domLabel: scores.dom.label,
      flawLabel: scores.flaw.label,
    }).then(onDone);
  }, [phase, scores, roomId, sessionId, submitScore, onDone]);

  return (
    <div className="relative flex-1 w-full overflow-hidden bg-black min-h-screen">
      <video
        ref={videoRef}
        autoPlay muted playsInline
        className="absolute inset-0 w-full h-full object-cover"
        style={{ transform: "scaleX(-1)" }}
      />
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full object-cover pointer-events-none"
        style={{ transform: "scaleX(-1)" }}
      />
      <div className="absolute inset-0">
        <Hud
          scores={scores}
          userName={playerName}
          phase={phase}
          scanProgress={scanProgress}
          samplesCollected={samplesCollected}
          samplesSkipped={samplesSkipped}
          onStart={startScan}
          onReset={resetScan}
        />
      </div>

      {status === "requesting" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 gap-5">
          <div className="w-10 h-10 rounded-full border-2 border-white/20 border-t-white/80 animate-spin" />
          <p className="font-mono text-[11px] tracking-[0.22em] uppercase text-white/60">Initializing scan…</p>
        </div>
      )}

      {(status === "denied" || status === "unsupported" || status === "error") && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/85 gap-4 px-8 text-center">
          <span className="text-4xl">📷</span>
          <p className="font-mono text-[11px] tracking-[0.18em] uppercase text-white/55 max-w-xs">
            {status === "denied" ? "Camera access denied" : status === "unsupported" ? "Camera not supported" : (error ?? "Scanner failed")}
          </p>
          {status !== "unsupported" && (
            <button onClick={retry} className="rounded-full bg-white/10 hover:bg-white/20 ring-1 ring-white/20 px-5 py-2 font-mono text-[11px] tracking-widest uppercase text-white transition-colors">
              Retry
            </button>
          )}
        </div>
      )}

      {/* Submitting overlay */}
      {phase === "complete" && submittedRef.current && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60">
          <div className="flex items-center gap-3 rounded-full bg-emerald-500/20 ring-1 ring-emerald-400/40 px-6 py-3">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            <span className="font-mono text-[10px] tracking-[0.22em] uppercase text-emerald-300">Submitting…</span>
          </div>
        </div>
      )}
    </div>
  );
}
