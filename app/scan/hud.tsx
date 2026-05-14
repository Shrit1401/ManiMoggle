"use client";

import type { Scores, TraitKey } from "./face-rating";
import type { Phase } from "./use-face-landmarker";
import { HudCornerFrame } from "../../components/ui/HudCornerFrame";

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

const TRAIT_CONFIG: { key: TraitKey; label: string; short: string }[] = [
  { key: "canthalTilt", label: "Eye Tilt",     short: "EYE" },
  { key: "jawline",     label: "Jawline",      short: "JAW" },
  { key: "symmetry",    label: "Symmetry",     short: "SYM" },
  { key: "harmony",     label: "Harmony",      short: "HAR" },
  { key: "goldenRatio", label: "φ Ratio",      short: "PHI" },
  { key: "skin",        label: "Skin",         short: "SKN" },
];

function TraitBar({ label, short, value }: { label: string; short: string; value: number }) {
  const pct = ((value - 1) / 9) * 100;
  const color = value >= 7.5 ? "#22d3ee" : value >= 5.5 ? "#a3a3a3" : "#f87171";
  return (
    <div className="flex items-center gap-1.5">
      <span className="font-mono text-[6.5px] tracking-widest uppercase text-white/30 w-7 shrink-0">{short}</span>
      <div className="flex-1 h-[3px] rounded-full bg-white/8 overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="font-mono text-[9px] tabular-nums text-white/55 w-6 text-right">{value.toFixed(1)}</span>
    </div>
  );
}

function CountdownRing({ progress }: { progress: number }) {
  const r    = 30;
  const circ = 2 * Math.PI * r;
  return (
    <svg width="72" height="72" className="rotate-[-90deg]">
      <circle cx="36" cy="36" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="3" />
      <circle cx="36" cy="36" r={r} fill="none" stroke="#22d3ee" strokeWidth="3" strokeLinecap="round"
        strokeDasharray={`${circ * progress} ${circ}`}
        style={{ transition: "stroke-dasharray 0.2s linear" }} />
    </svg>
  );
}

export function Hud({
  scores, userName = "YOU", phase,
  scanProgress, samplesCollected, samplesSkipped,
  onStart, onReset,
}: Props) {
  const overallStr = scores ? scores.overall.toFixed(1) : "—";
  const eloStr     = scores ? String(scores.elo)        : "—";
  const subStr     = scores ? scores.sub                : "SUB—";
  const domLabel   = scores?.dom.label  ?? "—";
  const flawLabel  = scores?.flaw.label ?? "—";
  const tierClr    = scores?.tier.starColor ?? "#9ca3af";
  const secsLeft   = phase === "scanning" ? Math.ceil((1 - scanProgress) * 15) : null;

  return (
    <>
      {/* ── Corner brackets ── */}
      <HudCornerFrame size={28} opacity={0.45} />

      {/* ── Main score card — top left ── */}
      <div className="absolute top-4 left-4 rounded-2xl glass px-3.5 py-3 sm:px-4 sm:py-3.5
        shadow-[0_8px_40px_rgba(0,0,0,0.6)] pointer-events-none min-w-[160px]">

        {phase === "complete" && (
          <p className="font-mono text-[10px] tracking-[0.25em] uppercase text-cyan-400 mb-1">
            ✦ Final Score
          </p>
        )}

        <p className="font-mono text-[10px] tracking-[0.25em] uppercase text-white/40 mb-0.5">
          PSL Score
        </p>

        <div className="flex items-end gap-2 mb-1">
          <p className="font-sans font-black text-[50px] sm:text-[56px] leading-none tabular-nums"
            style={{ color: phase === "complete" ? "#22d3ee" : "white" }}>
            {overallStr}
          </p>
          {scores && (
            <div className="mb-2 flex flex-col gap-0.5">
              <span className="text-[10px]" style={{ color: tierClr }}>★</span>
              <span className="font-mono text-[8px] tracking-widest uppercase" style={{ color: tierClr }}>
                {scores.tier.code}
              </span>
            </div>
          )}
        </div>

        {/* DOM / FLAW */}
        <div className="space-y-[5px] mb-2.5">
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-white/30 w-7 shrink-0">DOM</span>
            <span className="font-mono text-[10px] text-emerald-300 truncate max-w-[110px]">{domLabel}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-white/30 w-7 shrink-0">FLAW</span>
            <span className="font-mono text-[10px] text-rose-400 truncate max-w-[110px]">{flawLabel}</span>
          </div>
        </div>

        {/* Trait bars — only when scores available */}
        {scores && (
          <div className="flex flex-col gap-1.5 pt-2 border-t border-white/[0.06]">
            {TRAIT_CONFIG.map(t => (
              <TraitBar key={t.key} label={t.label} short={t.short} value={scores.traits[t.key]} />
            ))}
          </div>
        )}
      </div>

      {/* ── Right panel ── */}
      <div className="absolute top-4 right-4 flex flex-col items-end gap-2 pointer-events-none">
        {/* Your scan badge */}
        <div className="rounded-full glass px-3 py-[5px] font-mono text-[10px] tracking-[0.25em] uppercase text-white/50">
          Your Scan
        </div>

        {/* Name + avatar */}
        <div className="flex items-center gap-2 glass rounded-[var(--radius-card)] px-3 py-2">
          <span className="font-mono font-bold text-[11px] text-white uppercase tracking-[0.1em]">{userName}</span>
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-cyan-500/30 to-cyan-500/10
            ring-1 ring-[var(--ring-2)] flex items-center justify-center font-mono text-[10px] font-bold text-cyan-300">
            {userName.charAt(0)}
          </div>
        </div>

        {/* SUB | ELO pills */}
        <div className="flex overflow-hidden rounded-[var(--radius-input)] ring-1 ring-[var(--ring-2)] font-mono text-[9px] font-bold tracking-wider">
          <div className="flex items-center gap-1 px-2.5 py-[6px] text-white"
            style={{ background: "linear-gradient(135deg, rgba(249,115,22,0.9), rgba(245,158,11,0.8))" }}>
            <span className="text-[10px]">🌹</span>
            <span>{subStr}</span>
          </div>
          <div className="w-px bg-[var(--ring-2)] self-stretch" />
          <div className="flex items-center px-2.5 py-[6px] text-white"
            style={{ background: "linear-gradient(135deg, rgba(34,211,238,0.8), rgba(14,165,233,0.85))" }}>
            {eloStr} ELO
          </div>
        </div>

        {/* Level badge */}
        <div className="flex flex-col items-center justify-center w-10 h-10 rounded-[10px] glass">
          <span className="font-mono text-[7px] uppercase text-white/30 leading-none">LVL</span>
          <span className="font-mono text-[12px] font-bold text-white leading-tight">
            {scores?.level?.replace("L", "") ?? "—"}
          </span>
        </div>
      </div>

      {/* ── Bottom scan controls ── */}
      <div className="absolute bottom-8 sm:bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-3">

        {phase === "live" && (
          <button onClick={onStart}
            className="pointer-events-auto rounded-full px-8 py-3.5 font-mono text-[10px] tracking-[0.25em] uppercase
              text-black font-bold transition-all active:scale-[0.97]
              shadow-[0_0_35px_rgba(34,211,238,0.3)] hover:shadow-[0_0_50px_rgba(34,211,238,0.45)]"
            style={{ background: "linear-gradient(135deg, #22d3ee, #06b6d4)" }}>
            Start Scan
          </button>
        )}

        {phase === "scanning" && secsLeft !== null && (
          <div className="flex flex-col items-center gap-2 pointer-events-none">
            <div className="relative">
              <CountdownRing progress={scanProgress} />
              <span className="absolute inset-0 flex items-center justify-center font-mono text-[18px] font-semibold text-white tabular-nums">
                {secsLeft}
              </span>
            </div>
            <div className="flex items-center gap-1.5 glass rounded-full px-3 py-1.5">
              <span className="w-1 h-1 rounded-full bg-cyan-400 animate-pulse" />
              <span className="font-mono text-[7.5px] tracking-[0.2em] uppercase text-white/50">
                {samplesCollected} samples
                {samplesSkipped > 0 && <span className="text-white/25"> · {samplesSkipped} skipped</span>}
              </span>
            </div>
          </div>
        )}

        {phase === "analyzing" && (
          <div className="pointer-events-none flex items-center gap-2.5 glass rounded-full px-5 py-3">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
            <span className="font-mono text-[9px] tracking-[0.22em] uppercase text-cyan-300">Computing Score…</span>
          </div>
        )}

        {phase === "complete" && (
          <button onClick={onReset}
            className="pointer-events-auto glass rounded-full px-8 py-3.5 font-mono text-[10px] tracking-[0.25em]
              uppercase text-white hover:bg-white/10 active:scale-[0.97] transition-all">
            Rescan
          </button>
        )}
      </div>
    </>
  );
}
