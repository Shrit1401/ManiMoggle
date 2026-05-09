"use client";

import type { Scores } from "./face-rating";
import type { Phase } from "./use-face-landmarker";

interface Props {
  scores: Scores | null;
  userName?: string;
  phase: Phase;
  scanProgress: number;
  samplesCollected: number;
  samplesSkipped: number;
  onStart: () => void;
  onReset: () => void;
}

function CornerBrackets() {
  return (
    <>
      <span className="absolute top-3 left-3 w-6 h-6 sm:w-7 sm:h-7 border-t-2 border-l-2 border-white/50 pointer-events-none" />
      <span className="absolute top-3 right-3 w-6 h-6 sm:w-7 sm:h-7 border-t-2 border-r-2 border-white/50 pointer-events-none" />
      <span className="absolute bottom-3 left-3 w-6 h-6 sm:w-7 sm:h-7 border-b-2 border-l-2 border-white/50 pointer-events-none" />
      <span className="absolute bottom-3 right-3 w-6 h-6 sm:w-7 sm:h-7 border-b-2 border-r-2 border-white/50 pointer-events-none" />
    </>
  );
}

function CountdownRing({ progress }: { progress: number }) {
  const r    = 32;
  const circ = 2 * Math.PI * r;
  return (
    <svg width="78" height="78" className="rotate-[-90deg]">
      <circle cx="39" cy="39" r={r} fill="none" stroke="rgba(255,255,255,0.10)" strokeWidth="3.5" />
      <circle
        cx="39" cy="39" r={r}
        fill="none" stroke="#22d3ee" strokeWidth="3.5" strokeLinecap="round"
        strokeDasharray={`${circ * progress} ${circ}`}
        style={{ transition: "stroke-dasharray 0.2s linear" }}
      />
    </svg>
  );
}

export function Hud({
  scores, userName = "YOU", phase,
  scanProgress, samplesCollected, samplesSkipped,
  onStart, onReset,
}: Props) {
  const overallStr = scores ? scores.overall.toFixed(1) : "—";
  const eloStr     = scores ? String(scores.elo) : "—";
  const subStr     = scores ? scores.sub : "SUB—";
  const domLabel   = scores?.dom.label  ?? "—";
  const flawLabel  = scores?.flaw.label ?? "—";
  const secsLeft   = phase === "scanning" ? Math.ceil((1 - scanProgress) * 15) : null;

  return (
    <>
      <CornerBrackets />

      {/* OVERALL SCORE — top left */}
      <div className="absolute top-4 left-4 min-w-[156px] sm:min-w-[178px] rounded-2xl
        bg-gradient-to-b from-white/[0.13] to-white/[0.04] backdrop-blur-md
        ring-1 ring-white/14 px-3.5 py-2.5 sm:px-4 sm:py-3
        shadow-[0_8px_32px_rgba(0,0,0,0.5)] pointer-events-none">
        {phase === "complete" && (
          <p className="font-mono uppercase tracking-[0.22em] text-[7px] text-cyan-400 mb-0.5">
            AI Verdict
          </p>
        )}
        <p className="font-mono uppercase tracking-[0.2em] text-[8px] text-white/50 mb-0.5">
          Overall Score
        </p>
        <p className="font-sans font-semibold text-[44px] sm:text-[52px] text-white tabular-nums leading-none mb-1">
          {overallStr}
        </p>
        {scores ? (
          <div className="flex items-center gap-1.5 mb-2.5">
            <span style={{ color: scores.tier.starColor }} className="text-xs leading-none">★</span>
            <span className="font-mono text-[9px] tracking-widest text-emerald-400 uppercase">
              {scores.tier.code}
            </span>
          </div>
        ) : (
          <div className="mb-2.5 h-4" />
        )}
        <div className="space-y-[4px]">
          <div className="flex items-center gap-1.5">
            <span className="font-mono uppercase tracking-[0.12em] text-[8px] text-white/40 w-8 shrink-0">DOM</span>
            <span className="text-[10px] font-medium text-emerald-300 truncate max-w-[108px]">{domLabel}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="font-mono uppercase tracking-[0.12em] text-[8px] text-white/40 w-8 shrink-0">FLAW</span>
            <span className="text-[10px] font-medium text-rose-400 truncate max-w-[108px]">{flawLabel}</span>
          </div>
        </div>
      </div>

      {/* YOUR SCAN panel — top right */}
      <div className="absolute top-4 right-4 flex flex-col items-end gap-1.5 pointer-events-none">
        <div className="rounded-full bg-white/8 px-3 py-[4px] font-mono text-[8px] tracking-[0.22em] uppercase ring-1 ring-white/18 text-white/65">
          Your Scan
        </div>
        <div className="flex items-center gap-1.5 rounded-2xl bg-gradient-to-b from-white/[0.12] to-white/[0.04]
          backdrop-blur-md ring-1 ring-white/14 px-2.5 py-1.5 shadow-[0_8px_32px_rgba(0,0,0,0.5)]">
          <span className="font-sans font-semibold text-[12px] text-white uppercase tracking-[0.1em]">
            {userName}
          </span>
          <div className="w-6 h-6 rounded-full bg-white/18 ring-1 ring-white/28 flex items-center justify-center text-white text-[9px] font-mono uppercase">
            {userName.charAt(0)}
          </div>
        </div>
        <div className="flex rounded-full overflow-hidden ring-1 ring-white/22 font-mono text-[10px] font-semibold tracking-wider">
          <div className="flex items-center gap-1 bg-gradient-to-r from-orange-500/90 to-amber-500/80 px-2.5 py-[6px] text-white">
            <span className="text-[11px] leading-none">🌹</span>
            <span>{subStr}</span>
          </div>
          <div className="w-px bg-white/18 self-stretch" />
          <div className="flex items-center px-2.5 py-[6px] bg-gradient-to-r from-cyan-500/80 to-sky-500/90 text-white">
            <span>{eloStr}&nbsp;ELO</span>
          </div>
        </div>
        <div className="flex flex-col items-center justify-center w-9 h-9 rounded-[8px] bg-white/[0.07] ring-1 ring-white/18 self-end">
          <span className="text-white/45 text-[10px] leading-none">▣</span>
          <span className="font-mono text-[10px] font-semibold text-white leading-tight mt-[1px]">
            {scores?.level ?? "L—"}
          </span>
        </div>
      </div>

      {/* Bottom center — scan controls */}
      <div className="absolute bottom-8 sm:bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-3">
        {phase === "live" && (
          <button
            onClick={onStart}
            className="pointer-events-auto rounded-full bg-white/10 hover:bg-white/18 active:scale-[0.97]
              ring-1 ring-white/22 px-7 sm:px-8 py-3 font-mono text-[10px] sm:text-[11px]
              tracking-[0.22em] uppercase text-white transition-all shadow-[0_4px_24px_rgba(0,0,0,0.4)]"
          >
            Start Scan
          </button>
        )}

        {phase === "scanning" && (
          <div className="flex flex-col items-center gap-2 pointer-events-none">
            <div className="relative">
              <CountdownRing progress={scanProgress} />
              <span className="absolute inset-0 flex items-center justify-center font-mono text-[17px] font-semibold text-white tabular-nums">
                {secsLeft}
              </span>
            </div>
            <p className="font-mono text-[8px] tracking-[0.2em] uppercase text-white/50">
              Scanning · {samplesCollected} samples
              {samplesSkipped > 0 && (
                <span className="text-white/28"> · {samplesSkipped} skipped</span>
              )}
            </p>
          </div>
        )}

        {phase === "analyzing" && (
          <div className="pointer-events-none flex flex-col items-center gap-2">
            <div className="flex items-center gap-2 rounded-full bg-cyan-500/18 ring-1 ring-cyan-400/35 px-5 py-2.5">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
              <span className="font-mono text-[9px] tracking-[0.22em] uppercase text-cyan-300">
                AI Analysis…
              </span>
            </div>
          </div>
        )}

        {phase === "complete" && (
          <button
            onClick={onReset}
            className="pointer-events-auto rounded-full bg-white/10 hover:bg-white/18 active:scale-[0.97]
              ring-1 ring-white/22 px-7 sm:px-8 py-3 font-mono text-[10px] sm:text-[11px]
              tracking-[0.22em] uppercase text-white transition-all shadow-[0_4px_24px_rgba(0,0,0,0.4)]"
          >
            Rescan
          </button>
        )}
      </div>
    </>
  );
}
