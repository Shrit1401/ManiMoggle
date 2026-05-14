"use client";

import { useFaceLandmarker } from "./use-face-landmarker";
import { Hud } from "./hud";

export function ScanView() {
  const {
    status, phase, scores, error,
    videoRef, canvasRef,
    retry, startScan, resetScan,
    scanProgress, samplesCollected, samplesSkipped,
  } = useFaceLandmarker();

  return (
    <div className="relative flex-1 w-full overflow-hidden bg-black">
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
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
          userName="YOU"
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
          <p className="font-mono text-[11px] tracking-[0.22em] uppercase text-white/60">
            Initializing scan…
          </p>
        </div>
      )}

      {(status === "denied" || status === "unsupported" || status === "error") && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/85 gap-4 px-8 text-center">
          <span className="text-4xl">📷</span>
          <p className="font-mono text-[10px] tracking-[0.25em] uppercase text-white/55 max-w-xs">
            {status === "denied" && "Camera access denied"}
            {status === "unsupported" && "Camera not supported in this browser"}
            {status === "error" && (error ?? "Scanner initialization failed")}
          </p>
          {status !== "unsupported" && (
            <button
              onClick={retry}
              className="rounded-full bg-[var(--surface-2)] hover:bg-[var(--surface-3)] ring-1 ring-[var(--ring-2)] px-5 py-2 font-mono text-[10px] tracking-[0.25em] uppercase text-white transition-colors"
            >
              Retry
            </button>
          )}
        </div>
      )}
    </div>
  );
}
