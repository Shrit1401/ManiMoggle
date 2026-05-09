"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { useFaceLandmarker } from "./use-face-landmarker";
import type { Scores } from "./face-rating";
import { rateFromImage, captureVideoFrame } from "./ai-rating";
import { overallFromMean, traitMean } from "./face-rating";

export type OpponentData = {
  name: string;
  phase: "lobby" | "scanning" | "done";
  overall?: number;
  elo?: number;
  sub?: string;
  tierCode?: string;
  tierColor?: string;
  level?: string;
  domLabel?: string;
  flawLabel?: string;
  wins?: number;
  losses?: number;
};

interface Props {
  roomId: Id<"rooms">;
  sessionId: string;
  playerName: string;
  opponent: OpponentData | null;
  onDone: () => void;
}

// ─── Photo snap overlay ───────────────────────────────────────────────────────

function PhotoSnap({
  videoRef,
  onContinue,
}: {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  onContinue: () => void;
}) {
  const [step, setStep]   = useState<"snap" | "processing" | "preview">("snap");
  const [score, setScore] = useState<number | null>(null);

  const handleSnap = async () => {
    const video = videoRef.current;
    if (!video) return;
    const frame = captureVideoFrame(video);
    if (!frame) { onContinue(); return; }
    setStep("processing");
    try {
      const ai = await rateFromImage(frame);
      if (ai) {
        const vals = Object.values(ai.traits);
        const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
        setScore(overallFromMean(mean));
      }
    } catch { /* ignore */ }
    setStep("preview");
  };

  return (
    <div className="absolute inset-0 z-30 flex flex-col items-center justify-end pb-10 px-5">
      {/* dark gradient from bottom */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent pointer-events-none" />

      {step === "snap" && (
        <div className="relative flex flex-col items-center gap-4 w-full max-w-xs">
          <p className="font-mono text-[7px] tracking-[0.35em] uppercase text-white/40">
            Step 1 of 2 · Quick Photo Read
          </p>
          <p className="font-sans font-bold text-[15px] tracking-[0.06em] uppercase text-white text-center">
            Snap a selfie for your initial PSL read
          </p>
          <button
            onClick={handleSnap}
            className="w-full rounded-full bg-white/15 hover:bg-white/25 active:scale-[0.97]
              ring-2 ring-white/30 py-4 font-mono text-[11px] tracking-[0.28em] uppercase text-white
              transition-all shadow-[0_0_30px_rgba(255,255,255,0.08)]"
          >
            SNAP SELFIE
          </button>
          <button
            onClick={onContinue}
            className="font-mono text-[8px] tracking-[0.2em] uppercase text-white/25 hover:text-white/45"
          >
            Skip →
          </button>
        </div>
      )}

      {step === "processing" && (
        <div className="relative flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-white/20 border-t-cyan-400 animate-spin" />
          <p className="font-mono text-[8px] tracking-[0.25em] uppercase text-white/50">
            AI Reading Face…
          </p>
        </div>
      )}

      {step === "preview" && (
        <div className="relative flex flex-col items-center gap-4 w-full max-w-xs">
          <p className="font-mono text-[7px] tracking-[0.35em] uppercase text-white/40">
            Initial PSL Read
          </p>
          <div className="flex flex-col items-center gap-1">
            <span className="font-sans font-black text-[56px] text-white tabular-nums leading-none">
              {score !== null ? score.toFixed(1) : "—"}
            </span>
            <span className="font-mono text-[8px] tracking-[0.3em] uppercase text-white/35">
              AI First Impression
            </span>
          </div>
          <p className="font-mono text-[7px] tracking-widest text-white/30 text-center">
            The live scan will refine your score over 15 seconds
          </p>
          <button
            onClick={onContinue}
            className="w-full rounded-full bg-cyan-500/20 hover:bg-cyan-500/35 active:scale-[0.97]
              ring-1 ring-cyan-400/40 py-4 font-mono text-[11px] tracking-[0.28em] uppercase text-cyan-300
              transition-all"
          >
            BEGIN LIVE SCAN →
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Compact score overlay ────────────────────────────────────────────────────

function ScoreOverlay({ scores, name, label }: { scores: Scores | null; name: string; label: string }) {
  const overall  = scores ? scores.overall.toFixed(1) : "—";
  const eloStr   = scores ? String(scores.elo) : "—";
  const subStr   = scores ? scores.sub : "SUB—";
  const domTxt   = scores?.dom.label  ?? "—";
  const flawTxt  = scores?.flaw.label ?? "—";
  const tierClr  = scores?.tier.starColor ?? "#9ca3af";
  const tierCode = scores?.tier.code ?? "—";
  const level    = scores?.level ?? "L—";

  return (
    <div className="absolute inset-0 pointer-events-none">
      {/* Score card — top left */}
      <div className="absolute top-3 left-3 glass rounded-2xl px-3 py-2.5 shadow-xl max-w-[155px]">
        <p className="font-mono text-[6.5px] tracking-[0.25em] uppercase text-white/40 mb-0.5">PSL Score</p>
        <div className="flex items-end gap-1.5 mb-1">
          <p className="font-sans font-black text-[38px] tabular-nums leading-none"
            style={{ color: scores ? "#22d3ee" : "white" }}>{overall}</p>
          {scores && (
            <div className="mb-1.5">
              <span className="font-mono text-[7px] tracking-widest uppercase block" style={{ color: tierClr }}>
                ★ {tierCode}
              </span>
            </div>
          )}
        </div>
        <div className="space-y-[3px]">
          <div className="flex items-center gap-1">
            <span className="font-mono text-[6.5px] text-white/28 w-6 uppercase tracking-widest">DOM</span>
            <span className="font-mono text-[8px] text-emerald-300 truncate max-w-[95px]">{domTxt}</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="font-mono text-[6.5px] text-white/28 w-6 uppercase tracking-widest">FLAW</span>
            <span className="font-mono text-[8px] text-rose-400 truncate max-w-[95px]">{flawTxt}</span>
          </div>
        </div>
      </div>

      {/* Right panel */}
      <div className="absolute top-3 right-3 flex flex-col items-end gap-1.5">
        <div className="glass rounded-full px-2.5 py-[4px] font-mono text-[6.5px] tracking-[0.22em] uppercase text-white/55">
          {label}
        </div>
        <div className="flex items-center gap-1.5 glass rounded-xl px-2.5 py-1.5">
          <span className="font-mono font-bold text-[10px] text-white uppercase tracking-[0.08em]">{name}</span>
          <div className="w-6 h-6 rounded-full bg-gradient-to-br from-cyan-500/30 to-cyan-500/10
            ring-1 ring-cyan-400/30 flex items-center justify-center font-mono text-[9px] font-bold text-cyan-300">
            {name.charAt(0)}
          </div>
        </div>
        <div className="flex overflow-hidden rounded-xl ring-1 ring-white/15 font-mono text-[8px] font-bold">
          <div className="flex items-center gap-1 px-2 py-[5px] text-white"
            style={{ background: "linear-gradient(135deg, rgba(249,115,22,0.9), rgba(245,158,11,0.8))" }}>
            <span className="text-[9px]">🌹</span><span>{subStr}</span>
          </div>
          <div className="w-px bg-white/15 self-stretch" />
          <div className="flex items-center px-2 py-[5px] text-white"
            style={{ background: "linear-gradient(135deg, rgba(34,211,238,0.8), rgba(14,165,233,0.85))" }}>
            {eloStr} ELO
          </div>
        </div>
        <div className="flex flex-col items-center justify-center w-8 h-8 rounded-[8px] glass">
          <span className="font-mono text-[6px] text-white/30 uppercase leading-none">LVL</span>
          <span className="font-mono text-[10px] font-bold text-white">{level.replace("L","")}</span>
        </div>
      </div>
    </div>
  );
}

// ─── Opponent panel ────────────────────────────────────────────────────────────

function OpponentPanel({ opponent }: { opponent: OpponentData | null }) {
  if (!opponent) {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-neutral-950">
        <div className="w-14 h-14 rounded-full border-2 border-dashed border-white/12
          flex items-center justify-center text-white/15 text-2xl">?</div>
        <p className="font-mono text-[8px] tracking-[0.28em] uppercase text-white/25">No opponent</p>
      </div>
    );
  }

  const done     = opponent.phase === "done";
  const scanning = opponent.phase === "scanning";
  const scores: Scores | null = done ? {
    overall: opponent.overall ?? 0,
    elo:     opponent.elo ?? 0,
    sub:     (opponent.sub ?? "SUB3") as Scores["sub"],
    tier:    { code: (opponent.tierCode ?? "MTN") as Scores["tier"]["code"], starColor: opponent.tierColor ?? "#fbbf24" },
    level:   opponent.level ?? "L1",
    dom:     { label: opponent.domLabel ?? "—", value: opponent.overall ?? 0 },
    flaw:    { label: opponent.flawLabel ?? "—", value: 0 },
    traits:  {} as Scores["traits"],
  } : null;

  return (
    <div className="absolute inset-0 bg-neutral-950">
      <div className="absolute inset-0 opacity-[0.03]"
        style={{ backgroundImage: "repeating-linear-gradient(0deg,#fff 0px,#fff 1px,transparent 1px,transparent 40px),repeating-linear-gradient(90deg,#fff 0px,#fff 1px,transparent 1px,transparent 40px)" }} />
      {done ? (
        <ScoreOverlay scores={scores} name={opponent.name} label="ENEMY SCAN" />
      ) : scanning ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
          <div className="w-14 h-14 rounded-full bg-white/5 ring-2 ring-cyan-400/30
            flex items-center justify-center font-mono text-xl font-bold text-cyan-300">
            {opponent.name.charAt(0)}
          </div>
          <p className="font-sans font-bold text-[14px] tracking-[0.08em] uppercase text-white/70">{opponent.name}</p>
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
            <span className="font-mono text-[8px] tracking-widest uppercase text-cyan-400">Scanning…</span>
          </div>
          <div className="absolute top-3 right-3 rounded-full bg-black/40 px-2.5 py-[4px]
            font-mono text-[7px] tracking-[0.22em] uppercase text-white/45 ring-1 ring-white/12">
            ENEMY SCAN
          </div>
        </div>
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
          <div className="w-14 h-14 rounded-full bg-white/5 ring-2 ring-white/15
            flex items-center justify-center font-mono text-xl font-bold text-white/50">
            {opponent.name.charAt(0)}
          </div>
          <p className="font-sans font-bold text-[14px] tracking-[0.08em] uppercase text-white/50">{opponent.name}</p>
          <span className="font-mono text-[8px] tracking-widest uppercase text-white/22">Ready</span>
          <div className="absolute top-3 right-3 rounded-full bg-black/40 px-2.5 py-[4px]
            font-mono text-[7px] tracking-[0.22em] uppercase text-white/35 ring-1 ring-white/10">
            ENEMY SCAN
          </div>
        </div>
      )}
    </div>
  );
}

// ─── VS bar ───────────────────────────────────────────────────────────────────

function VsBar({ myScore, oppScore, phase, scanProgress, onStart }: {
  myScore: number; oppScore: number; phase: string; scanProgress: number; onStart: () => void;
}) {
  const total   = myScore + oppScore;
  const myFrac  = total > 0 ? myScore / total : 0.5;
  const mogging = myFrac > 0.52;
  const mogged  = myFrac < 0.48;
  const statusText = myScore > 0 && oppScore > 0
    ? (mogging ? "⟶  MOGGING" : mogged ? "GETTING MOGGED  ⟵" : "EVEN") : "";
  const secsLeft = phase === "scanning" ? Math.ceil((1 - scanProgress) * 15) : null;

  return (
    <div className="flex flex-col items-center gap-1.5 py-2 px-4 shrink-0 relative">
      <div className="w-full flex items-center gap-2 h-8 relative">
        <div className="flex-1 h-1.5 rounded-full overflow-hidden bg-white/8 relative">
          <div className="absolute left-0 top-0 h-full rounded-full bg-cyan-400 transition-all duration-700"
            style={{ width: `${myFrac * 100}%` }} />
          <div className="absolute right-0 top-0 h-full rounded-full bg-rose-500 transition-all duration-700"
            style={{ width: `${(1 - myFrac) * 100}%` }} />
          <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full bg-white shadow-[0_0_6px_rgba(255,255,255,0.6)] z-10 transition-all duration-700"
            style={{ left: `${myFrac * 100}%` }} />
        </div>
        <div className="absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2
          w-8 h-8 rounded-full bg-black ring-2 ring-white/18 flex items-center justify-center z-20 shrink-0">
          <span className="font-mono text-[8px] font-bold text-white/70">VS</span>
        </div>
      </div>
      <div className="flex items-center justify-between w-full">
        <span className={`font-mono text-[7px] tracking-[0.2em] uppercase transition-colors
          ${mogging ? "text-cyan-400" : mogged ? "text-rose-400" : "text-white/30"}`}>
          {statusText}
        </span>
        {phase === "live" && (
          <button onClick={onStart}
            className="rounded-full bg-white/10 hover:bg-white/18 active:scale-[0.97]
              ring-1 ring-white/20 px-5 py-1.5 font-mono text-[9px] tracking-[0.22em]
              uppercase text-white transition-all">
            Start Scan
          </button>
        )}
        {phase === "scanning" && (
          <span className="font-mono text-[8px] tracking-[0.15em] text-white/40">{secsLeft}s left</span>
        )}
        {phase === "analyzing" && (
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping shrink-0" />
            <span className="font-mono text-[8px] tracking-[0.18em] uppercase text-cyan-400">AI…</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Timer bar ────────────────────────────────────────────────────────────────

function TimerBar({ phase, scanProgress, myReady, oppReady }: {
  phase: string; scanProgress: number; myReady: boolean; oppReady: boolean;
}) {
  const secs    = phase === "scanning" ? Math.ceil((1 - scanProgress) * 15) : phase === "live" ? 15 : 0;
  const timerStr = `${String(Math.floor(secs / 60)).padStart(2, "0")}:${String(secs % 60).padStart(2, "0")}`;

  return (
    <div className="flex items-center justify-between px-4 pt-safe shrink-0 h-11 bg-black/80 backdrop-blur-sm border-b border-white/5">
      <div className="flex items-center gap-1.5">
        <div className={`w-2 h-2 rounded-full transition-colors
          ${phase === "scanning" ? "bg-cyan-400 animate-pulse" : myReady ? "bg-emerald-400" : "bg-white/20"}`} />
        <span className="font-mono text-[7px] tracking-widest uppercase text-white/30">Me</span>
      </div>
      <div className="flex flex-col items-center">
        <span className={`font-mono font-bold tabular-nums transition-colors
          ${phase === "scanning"
            ? secs <= 5 ? "text-rose-400 text-[20px]" : "text-white text-[20px]"
            : phase === "analyzing" ? "text-cyan-400 text-[14px]" : "text-white/40 text-[18px]"}`}>
          {phase === "analyzing" ? "AI ANALYSIS" : timerStr}
        </span>
        {phase === "scanning" && (
          <div className="w-20 h-[2px] bg-white/10 rounded-full mt-0.5 overflow-hidden">
            <div className="h-full rounded-full bg-cyan-400 transition-all duration-200"
              style={{ width: `${scanProgress * 100}%` }} />
          </div>
        )}
      </div>
      <div className="flex items-center gap-1.5">
        <span className="font-mono text-[7px] tracking-widest uppercase text-white/30">Opp</span>
        <div className={`w-2 h-2 rounded-full transition-colors ${oppReady ? "bg-emerald-400" : "bg-white/15"}`} />
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function RoomScanView({ roomId, sessionId, playerName, opponent, onDone }: Props) {
  const {
    status, phase, scores, error,
    videoRef, canvasRef,
    retry, startScan, resetScan,
    scanProgress,
  } = useFaceLandmarker();

  const submitScore  = useMutation(api.players.submitScore);
  const submittedRef = useRef(false);
  const [showDone, setShowDone] = useState(false);

  // Photo snap state — shown before user starts the scan
  const [snapDone, setSnapDone] = useState(false);

  const showSnap = status === "ready" && phase === "live" && !snapDone;

  const handleSnapContinue = () => {
    setSnapDone(true);
  };

  const handleStartScan = () => {
    setSnapDone(true); // ensure snap dismissed
    startScan();
  };

  // Auto-submit when scan complete
  useEffect(() => {
    if (phase !== "complete" || !scores || submittedRef.current) return;
    submittedRef.current = true;
    setShowDone(true);
    void submitScore({
      roomId, sessionId,
      overall:   scores.overall,
      elo:       scores.elo,
      sub:       scores.sub,
      tierCode:  scores.tier.code,
      tierColor: scores.tier.starColor,
      level:     scores.level,
      domLabel:  scores.dom.label,
      flawLabel: scores.flaw.label,
    }).then(() => {
      setTimeout(onDone, 2000);
    });
  }, [phase, scores, roomId, sessionId, submitScore, onDone]);

  const myScore  = scores?.overall ?? 0;
  const oppScore = opponent?.overall ?? 0;
  const oppReady = opponent?.phase === "done";

  return (
    <div className="flex flex-col h-[100dvh] bg-black overflow-hidden">

      <TimerBar
        phase={phase}
        scanProgress={scanProgress}
        myReady={phase === "complete"}
        oppReady={oppReady}
      />

      {/* My video (top half) */}
      <div className="flex-1 relative overflow-hidden min-h-0">
        {status === "requesting" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/90 z-20">
            <div className="w-8 h-8 rounded-full border-2 border-white/20 border-t-white/70 animate-spin" />
          </div>
        )}
        {(status === "denied" || status === "unsupported" || status === "error") && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 z-20 gap-3 px-6 text-center">
            <span className="text-3xl">📷</span>
            <p className="font-mono text-[9px] tracking-widest uppercase text-white/50 max-w-xs">
              {status === "denied" ? "Camera denied"
                : status === "unsupported" ? "Camera not supported"
                : (error ?? "Scanner failed")}
            </p>
            {status !== "unsupported" && (
              <button onClick={retry}
                className="rounded-full bg-white/10 ring-1 ring-white/20 px-4 py-2
                  font-mono text-[9px] tracking-widest uppercase text-white">
                Retry
              </button>
            )}
          </div>
        )}

        <video ref={videoRef} autoPlay muted playsInline
          className="absolute inset-0 w-full h-full object-cover"
          style={{ transform: "scaleX(-1)" }}
        />
        <canvas ref={canvasRef}
          className="absolute inset-0 w-full h-full object-cover pointer-events-none"
          style={{ transform: "scaleX(-1)" }}
        />

        <ScoreOverlay scores={scores} name={playerName} label="YOUR SCAN" />

        {/* Photo snap overlay — shown before scan starts */}
        {showSnap && (
          <PhotoSnap videoRef={videoRef} onContinue={handleSnapContinue} />
        )}

        {phase === "analyzing" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 z-10">
            <div className="flex items-center gap-2 rounded-full bg-cyan-500/20 ring-1 ring-cyan-400/40 px-5 py-2.5">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
              <span className="font-mono text-[9px] tracking-[0.22em] uppercase text-cyan-300">AI Analysis…</span>
            </div>
          </div>
        )}

        {showDone && phase === "complete" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/30 z-10">
            <div className="flex items-center gap-2 rounded-full bg-emerald-500/20 ring-1 ring-emerald-400/40 px-5 py-2.5">
              <span className="font-mono text-[9px] tracking-[0.22em] uppercase text-emerald-300">Score Locked ✓</span>
            </div>
          </div>
        )}
      </div>

      {/* VS bar */}
      <VsBar
        myScore={myScore}
        oppScore={oppScore}
        phase={phase}
        scanProgress={scanProgress}
        onStart={handleStartScan}
      />

      {/* Opponent panel (bottom half) */}
      <div className="flex-1 relative overflow-hidden min-h-0">
        <OpponentPanel opponent={opponent} />
      </div>
    </div>
  );
}
