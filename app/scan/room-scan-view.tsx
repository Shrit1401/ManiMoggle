"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { useFaceLandmarker } from "./use-face-landmarker";
import { useWebRTCGroup } from "./use-webrtc-group";
import type { Scores, TraitKey, BonusEvent, Badge } from "./face-rating";

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
  liveScore?: number;
};

interface Props {
  roomId: Id<"rooms">;
  sessionId: string;
  playerName: string;
  opponent: OpponentData | null;
  opponentSessionId?: string | null;
  onDone: () => void;
}

// ─── Sub-score trait bars ─────────────────────────────────────────────────────

const DISPLAYED_TRAITS: { key: TraitKey; label: string }[] = [
  { key: "symmetry",    label: "Symmetry" },
  { key: "harmony",     label: "Harmony"  },
  { key: "jawline",     label: "Jaw"      },
  { key: "canthalTilt", label: "Canthal"  },
  { key: "skin",        label: "Skin"     },
];

function TraitBars({ traits }: { traits: Record<TraitKey, number> }) {
  return (
    <div className="flex flex-col gap-[4px] mt-2">
      {DISPLAYED_TRAITS.map(({ key, label }) => {
        const val = traits[key];
        if (val === undefined) return null;
        const pct = Math.round(((val - 1) / 9) * 100);
        const color = val >= 7 ? "#22d3ee" : val >= 5 ? "#fbbf24" : "#f87171";
        return (
          <div key={key} className="flex items-center gap-1.5">
            <span className="font-mono text-[5px] text-white/30 uppercase tracking-widest w-10 shrink-0">{label}</span>
            <div className="flex-1 h-[2.5px] rounded-full bg-white/10 overflow-hidden">
              <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: color }} />
            </div>
            <span className="font-mono text-[5.5px] text-white/45 tabular-nums w-5 text-right shrink-0">{val.toFixed(1)}</span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Live bonus callout chips ─────────────────────────────────────────────────

function LiveBonusStack({ bonuses }: { bonuses: BonusEvent[] }) {
  if (bonuses.length === 0) return null;
  return (
    <div className="absolute top-12 right-3 flex flex-col items-end gap-1.5 pointer-events-none z-20">
      {bonuses.map((b, i) => (
        <div
          key={b.key}
          className="animate-bonus-pop flex items-center gap-1.5
            bg-cyan-500/20 ring-1 ring-cyan-400/40 backdrop-blur-sm
            px-2.5 py-1 rounded-full"
          style={{ animationDelay: `${i * 0.12}s` }}
        >
          <span className="font-mono text-[7px] tracking-widest uppercase text-cyan-200">{b.label}</span>
          <span className="font-mono text-[7px] text-cyan-400 font-bold">+{b.delta.toFixed(2)}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Confetti burst ───────────────────────────────────────────────────────────

const CONFETTI_COLORS = ["#22d3ee","#f43f5e","#fbbf24","#a78bfa","#34d399","#fb923c"];

function ConfettiBurst({ count = 40, tierColor }: { count?: number; tierColor: string }) {
  const pieces = useRef(
    Array.from({ length: count }, (_, i) => ({
      left: 20 + Math.abs(Math.sin(i * 47.3) * 43758.5) % 60,
      delay: Math.abs(Math.sin(i * 13.7) * 43758.5) % 1.2,
      dur:   0.8 + Math.abs(Math.sin(i * 73.1) * 43758.5) % 0.8,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      rotate: Math.abs(Math.sin(i * 23.9) * 43758.5) % 360,
      size: 4 + Math.abs(Math.sin(i * 59.3) * 43758.5) % 6,
    })),
  );

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-30">
      {/* Tier radial burst */}
      <div className="animate-tier-burst absolute inset-0 rounded-xl pointer-events-none"
        style={{ background: `radial-gradient(ellipse 80% 60% at 50% 50%, ${tierColor}33 0%, transparent 70%)` }} />
      {pieces.current.map((p, i) => (
        <div
          key={i}
          className="absolute"
          style={{
            left: `${p.left}%`,
            top: "10%",
            width: p.size,
            height: p.size,
            borderRadius: i % 3 === 0 ? "50%" : 2,
            background: p.color,
            animationName: "confetti-fall",
            animationDuration: `${p.dur}s`,
            animationDelay: `${p.delay}s`,
            animationTimingFunction: "ease-in",
            animationFillMode: "both",
            transform: `rotate(${p.rotate}deg)`,
          }}
        />
      ))}
    </div>
  );
}

// ─── Reveal overlay (final score with breakdown) ──────────────────────────────

function RevealOverlay({ scores, name }: { scores: Scores; name: string }) {
  const [displayVal, setDisplayVal]     = useState(1.0);
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [showBadges, setShowBadges]       = useState(false);
  const [showConfetti, setShowConfetti]   = useState(false);
  const animFrameRef = useRef<number>(0);

  const finalVal  = scores.overall;
  const tierClr   = scores.tier.starColor;
  const tierCode  = scores.tier.code;
  const isCHS     = tierCode === "CHS" || tierCode === "MOG";
  const baseScore = Math.max(1, finalVal - (scores.bonuses ?? []).reduce((s, b) => s + b.delta, 0));

  useEffect(() => {
    const start     = performance.now();
    const duration  = 1400;
    const startVal  = 1.0;

    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      const eased = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
      setDisplayVal(startVal + (finalVal - startVal) * eased);
      if (t < 1) {
        animFrameRef.current = requestAnimationFrame(tick);
      } else {
        setDisplayVal(finalVal);
        if (isCHS) setShowConfetti(true);
        setTimeout(() => setShowBreakdown(true), 200);
        setTimeout(() => setShowBadges(true), 200 + ((scores.bonuses?.length ?? 0) + 2) * 80 + 300);
      }
    };
    animFrameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animFrameRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="absolute inset-0 pointer-events-none">
      {showConfetti && <ConfettiBurst tierColor={tierClr} count={tierCode === "MOG" ? 55 : 30} />}

      {/* Score card — bottom left */}
      <div className="absolute bottom-3 left-3 glass rounded-2xl px-3 py-2.5 shadow-xl max-w-[180px] overflow-hidden">
        <p className="font-mono text-[6px] tracking-[0.3em] uppercase text-white/35 mb-1">PSL Score</p>

        {/* Animated number */}
        <div className="flex items-end gap-2 mb-1.5">
          <p className="animate-score-reveal font-sans font-black tabular-nums leading-none"
            style={{ fontSize: 52, color: "#22d3ee", lineHeight: 1 }}>
            {displayVal.toFixed(1)}
          </p>
          <div className="mb-1 flex flex-col gap-0.5">
            <span className="font-mono text-[7.5px] tracking-wider uppercase font-bold" style={{ color: tierClr }}>
              ★ {tierCode}
            </span>
            <span className="font-mono text-[6px] text-white/35 uppercase tracking-widest">{scores.level}</span>
          </div>
        </div>

        {/* Score breakdown */}
        {showBreakdown && (
          <div className="flex flex-col gap-[3px] border-t border-white/10 pt-2 mt-1">
            <div className="animate-breakdown-row flex justify-between items-center" style={{ animationDelay: "0ms" }}>
              <span className="font-mono text-[6px] text-white/30 uppercase tracking-widest">Base</span>
              <span className="font-mono text-[7px] text-white/60 tabular-nums">{baseScore.toFixed(1)}</span>
            </div>
            {(scores.bonuses ?? []).map((b, i) => (
              <div key={b.key}
                className="animate-breakdown-row flex justify-between items-center"
                style={{ animationDelay: `${(i + 1) * 80}ms` }}>
                <span className="font-mono text-[6px] text-cyan-300/70 truncate max-w-[100px]">+ {b.label}</span>
                <span className="font-mono text-[7px] text-cyan-400 tabular-nums shrink-0">+{b.delta.toFixed(2)}</span>
              </div>
            ))}
            {(scores.bonuses ?? []).length > 0 && (
              <div className="animate-breakdown-row border-t border-white/10 pt-1 flex justify-between items-center"
                style={{ animationDelay: `${((scores.bonuses?.length ?? 0) + 1) * 80}ms` }}>
                <span className="font-mono text-[6px] text-white/40 uppercase tracking-widest">Final</span>
                <span className="font-mono text-[8px] font-bold tabular-nums" style={{ color: tierClr }}>{finalVal.toFixed(1)}</span>
              </div>
            )}
          </div>
        )}

        {/* DOM / FLAW */}
        <div className="space-y-[3px] mt-2">
          <div className="flex items-center gap-1">
            <span className="font-mono text-[6px] text-white/28 w-6 uppercase tracking-widest">DOM</span>
            <span className="font-mono text-[7.5px] text-emerald-300 truncate max-w-[100px]">{scores.dom.label}</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="font-mono text-[6px] text-white/28 w-6 uppercase tracking-widest">FLAW</span>
            <span className="font-mono text-[7.5px] text-rose-400 truncate max-w-[100px]">{scores.flaw.label}</span>
          </div>
        </div>
        <TraitBars traits={scores.traits} />

        {/* Achievement badges */}
        {showBadges && (scores.badges ?? []).length > 0 && (
          <div className="mt-2 pt-1.5 border-t border-white/10 flex flex-wrap gap-1">
            {(scores.badges ?? []).map((badge: Badge, i: number) => (
              <span key={badge.id}
                className="animate-badge-slide font-mono text-[5.5px] tracking-widest uppercase
                  px-1.5 py-0.5 rounded-full ring-1"
                style={{
                  color: badge.color,
                  borderColor: `${badge.color}50`,
                  background: `${badge.color}18`,
                  animationDelay: `${i * 120}ms`,
                }}>
                {badge.label}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Top-right identity + ELO pills */}
      <div className="absolute top-3 right-3 flex flex-col items-end gap-1.5">
        <div className="glass rounded-full px-2.5 py-[4px] font-mono text-[6px] tracking-[0.28em] uppercase text-white/50">
          YOUR SCAN
        </div>
        <div className="flex items-center gap-1.5 glass rounded-xl px-2.5 py-1.5">
          <span className="font-mono font-bold text-[10px] text-white uppercase tracking-[0.08em]">{name}</span>
          <div className="w-6 h-6 rounded-full bg-gradient-to-br from-cyan-500/30 to-cyan-500/10
            ring-1 ring-cyan-400/30 flex items-center justify-center font-mono text-[9px] font-bold text-cyan-300">
            {name.charAt(0)}
          </div>
        </div>
        <div className="flex overflow-hidden rounded-xl ring-1 ring-white/12 font-mono text-[7.5px] font-bold">
          <div className="flex items-center gap-1 px-2 py-[5px] text-white"
            style={{ background: "linear-gradient(135deg, rgba(249,115,22,0.85), rgba(245,158,11,0.75))" }}>
            <span className="text-[8px]">🌹</span><span>{scores.sub}</span>
          </div>
          <div className="w-px bg-white/12 self-stretch" />
          <div className="flex items-center px-2 py-[5px] text-white"
            style={{ background: "linear-gradient(135deg, rgba(34,211,238,0.75), rgba(14,165,233,0.8))" }}>
            {scores.elo} ELO
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Live score overlay (during scanning) ─────────────────────────────────────

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
      <div className="absolute bottom-3 left-3 glass rounded-2xl px-3 py-2.5 shadow-xl max-w-[160px]">
        <p className="font-mono text-[6px] tracking-[0.3em] uppercase text-white/35 mb-1">PSL Score</p>
        <div className="flex items-end gap-2 mb-1.5">
          <p className="font-sans font-black tabular-nums leading-none"
            style={{ fontSize: 52, color: scores ? "#22d3ee" : "rgba(255,255,255,0.6)", lineHeight: 1 }}>
            {overall}
          </p>
          {scores && (
            <div className="mb-1 flex flex-col gap-0.5">
              <span className="font-mono text-[7.5px] tracking-wider uppercase font-bold" style={{ color: tierClr }}>
                ★ {tierCode}
              </span>
              <span className="font-mono text-[6px] text-white/35 uppercase tracking-widest">{level}</span>
            </div>
          )}
        </div>
        <div className="space-y-[3px]">
          <div className="flex items-center gap-1">
            <span className="font-mono text-[6px] text-white/28 w-6 uppercase tracking-widest">DOM</span>
            <span className="font-mono text-[7.5px] text-emerald-300 truncate max-w-[100px]">{domTxt}</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="font-mono text-[6px] text-white/28 w-6 uppercase tracking-widest">FLAW</span>
            <span className="font-mono text-[7.5px] text-rose-400 truncate max-w-[100px]">{flawTxt}</span>
          </div>
        </div>
        {scores && <TraitBars traits={scores.traits} />}
      </div>

      <div className="absolute top-3 right-3 flex flex-col items-end gap-1.5">
        <div className="glass rounded-full px-2.5 py-[4px] font-mono text-[6px] tracking-[0.28em] uppercase text-white/50">
          {label}
        </div>
        <div className="flex items-center gap-1.5 glass rounded-xl px-2.5 py-1.5">
          <span className="font-mono font-bold text-[10px] text-white uppercase tracking-[0.08em]">{name}</span>
          <div className="w-6 h-6 rounded-full bg-gradient-to-br from-cyan-500/30 to-cyan-500/10
            ring-1 ring-cyan-400/30 flex items-center justify-center font-mono text-[9px] font-bold text-cyan-300">
            {name.charAt(0)}
          </div>
        </div>
        {scores && (
          <div className="flex overflow-hidden rounded-xl ring-1 ring-white/12 font-mono text-[7.5px] font-bold">
            <div className="flex items-center gap-1 px-2 py-[5px] text-white"
              style={{ background: "linear-gradient(135deg, rgba(249,115,22,0.85), rgba(245,158,11,0.75))" }}>
              <span className="text-[8px]">🌹</span><span>{subStr}</span>
            </div>
            <div className="w-px bg-white/12 self-stretch" />
            <div className="flex items-center px-2 py-[5px] text-white"
              style={{ background: "linear-gradient(135deg, rgba(34,211,238,0.75), rgba(14,165,233,0.8))" }}>
              {eloStr} ELO
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Opponent panel ────────────────────────────────────────────────────────────

function OpponentPanel({ opponent, stream }: { opponent: OpponentData | null; stream: MediaStream | null }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = stream;
  }, [stream]);

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
    tier:    { code: (opponent.tierCode ?? "NRM") as Scores["tier"]["code"], starColor: opponent.tierColor ?? "#d1d5db" },
    level:   opponent.level ?? "L1",
    dom:     { label: opponent.domLabel ?? "—", value: opponent.overall ?? 0 },
    flaw:    { label: opponent.flawLabel ?? "—", value: 0 },
    traits:  {} as Scores["traits"],
  } : null;

  return (
    <div className="absolute inset-0 bg-neutral-950">
      {stream && (
        <video ref={videoRef} autoPlay playsInline
          className="absolute inset-0 w-full h-full object-cover"
          style={{ objectPosition: "center 20%" }}
        />
      )}
      {!stream && (
        <div className="absolute inset-0 opacity-[0.03]"
          style={{ backgroundImage: "repeating-linear-gradient(0deg,#fff 0px,#fff 1px,transparent 1px,transparent 40px),repeating-linear-gradient(90deg,#fff 0px,#fff 1px,transparent 1px,transparent 40px)" }} />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/30 pointer-events-none" />
      {done ? (
        <ScoreOverlay scores={scores} name={opponent.name} label="OPPONENT" />
      ) : scanning ? (
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-3 right-3 flex items-center gap-1.5 glass rounded-full px-2.5 py-1 ring-1 ring-cyan-400/30">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping shrink-0" />
            <span className="font-mono text-[7px] tracking-widest uppercase text-cyan-400">Scanning</span>
          </div>
          {opponent.liveScore !== undefined && (
            <div className="absolute bottom-3 left-3">
              <div className="flex items-end gap-1.5">
                <span className="font-sans font-black tabular-nums leading-none text-white/85 drop-shadow-lg"
                  style={{ fontSize: 52 }}>
                  {opponent.liveScore.toFixed(1)}
                </span>
                <span className="mb-1 font-mono text-[8px] text-cyan-300/80 uppercase tracking-widest">LIVE</span>
              </div>
            </div>
          )}
          {!stream && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
              <div className="w-16 h-16 rounded-full bg-cyan-500/8 ring-2 ring-cyan-400/25
                flex items-center justify-center font-mono text-2xl font-bold text-cyan-300/70">
                {opponent.name.charAt(0)}
              </div>
              <p className="font-sans font-bold text-[13px] tracking-[0.08em] uppercase text-white/55">{opponent.name}</p>
            </div>
          )}
        </div>
      ) : (
        !stream && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
            <div className="w-16 h-16 rounded-full bg-white/[0.04] ring-2 ring-white/12
              flex items-center justify-center font-mono text-2xl font-bold text-white/40">
              {opponent.name.charAt(0)}
            </div>
            <p className="font-sans font-bold text-[13px] tracking-[0.08em] uppercase text-white/40">{opponent.name}</p>
            <span className="font-mono text-[8px] tracking-widest uppercase text-white/20">Ready</span>
          </div>
        )
      )}
      <div className="absolute top-3 left-3 glass rounded-full px-2.5 py-[4px]
        font-mono text-[6.5px] tracking-[0.25em] uppercase text-white/40 ring-1 ring-white/10">
        {opponent.name.toUpperCase()}
      </div>
    </div>
  );
}

// ─── VS bar ───────────────────────────────────────────────────────────────────

function VsBar({ myScore, oppScore, phase, scanProgress }: {
  myScore: number; oppScore: number; phase: string; scanProgress: number;
}) {
  const total   = myScore + oppScore;
  const myFrac  = total > 0 ? myScore / total : 0.5;
  const mogging = myFrac > 0.52;
  const mogged  = myFrac < 0.48;
  const secsLeft = phase === "scanning" ? Math.ceil((1 - scanProgress) * 15) : null;

  return (
    <div className="flex flex-col gap-1.5 px-4 py-2.5 shrink-0 bg-black/50 border-y border-white/[0.05]">
      <div className="flex items-center gap-2">
        <div className={`flex flex-col items-start shrink-0 w-12 transition-all ${mogging ? "scale-105" : "opacity-65"}`}>
          <span className={`font-sans font-black text-[20px] tabular-nums leading-none ${mogging ? "text-cyan-400" : "text-white/70"}`}>
            {myScore > 0 ? myScore.toFixed(1) : "—"}
          </span>
          <span className="font-mono text-[5px] text-white/22 uppercase tracking-widest">YOU</span>
        </div>

        <div className="flex-1 relative h-2 rounded-full overflow-hidden bg-white/8">
          <div className="absolute left-0 top-0 h-full bg-cyan-400/75 transition-all duration-700"
            style={{ width: `${myFrac * 100}%` }} />
          <div className="absolute right-0 top-0 h-full bg-rose-500/75 transition-all duration-700"
            style={{ width: `${(1 - myFrac) * 100}%` }} />
          <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full
            bg-white shadow-[0_0_8px_rgba(255,255,255,0.65)] z-10 transition-all duration-700"
            style={{ left: `${myFrac * 100}%` }} />
        </div>

        <div className={`flex flex-col items-end shrink-0 w-12 transition-all ${mogged ? "scale-105" : "opacity-65"}`}>
          <span className={`font-sans font-black text-[20px] tabular-nums leading-none ${mogged ? "text-rose-400" : "text-white/70"}`}>
            {oppScore > 0 ? oppScore.toFixed(1) : "—"}
          </span>
          <span className="font-mono text-[5px] text-white/22 uppercase tracking-widest">OPP</span>
        </div>
      </div>

      <div className="flex items-center justify-center h-3">
        {myScore > 0 && oppScore > 0 ? (
          <span className={`font-mono text-[6px] tracking-[0.3em] uppercase font-bold
            ${mogging ? "text-cyan-400" : mogged ? "text-rose-400" : "text-white/28"}`}>
            {mogging ? "MOGGING" : mogged ? "GETTING MOGGED" : "EVEN"}
          </span>
        ) : phase === "analyzing" ? (
          <div className="flex items-center gap-1">
            <span className="w-1 h-1 rounded-full bg-cyan-400 animate-ping shrink-0" />
            <span className="font-mono text-[6px] tracking-widest uppercase text-cyan-400">AI…</span>
          </div>
        ) : secsLeft !== null ? (
          <span className="font-mono text-[6px] tracking-widest text-white/28">{secsLeft}s remaining</span>
        ) : null}
      </div>
    </div>
  );
}

// ─── Timer bar ────────────────────────────────────────────────────────────────

function TimerBar({ phase, scanProgress, myReady, oppReady }: {
  phase: string; scanProgress: number; myReady: boolean; oppReady: boolean;
}) {
  const secs     = phase === "scanning" ? Math.ceil((1 - scanProgress) * 15) : phase === "live" ? 15 : 0;
  const timerStr = `${String(Math.floor(secs / 60)).padStart(2, "0")}:${String(secs % 60).padStart(2, "0")}`;
  const urgent   = phase === "scanning" && secs <= 5;

  return (
    <div className="flex flex-col shrink-0 bg-black/85 backdrop-blur-sm border-b border-white/[0.06]">
      <div className="flex items-center justify-between px-4 pt-safe h-12">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full transition-all
            ${phase === "scanning" ? "bg-cyan-400 shadow-[0_0_6px_rgba(34,211,238,0.8)] animate-pulse"
              : myReady ? "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]"
              : "bg-white/18"}`} />
          <span className="font-mono text-[7px] tracking-widest uppercase text-white/28">You</span>
        </div>
        <div className="flex flex-col items-center">
          <span className={`font-mono font-black tabular-nums leading-none transition-all
            ${urgent ? "text-rose-400 text-[22px] animate-pulse"
              : phase === "scanning" ? "text-white text-[22px]"
              : phase === "analyzing" ? "text-cyan-400 text-[13px] tracking-widest"
              : "text-white/35 text-[20px]"}`}>
            {phase === "analyzing" ? "AI SCANNING" : timerStr}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[7px] tracking-widest uppercase text-white/28">Opp</span>
          <div className={`w-2 h-2 rounded-full transition-all
            ${oppReady ? "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]" : "bg-white/15"}`} />
        </div>
      </div>
      {phase === "scanning" && (
        <div className="h-[2px] bg-white/8 overflow-hidden">
          <div className={`h-full transition-all duration-200 ${urgent ? "bg-rose-400" : "bg-cyan-400"}`}
            style={{ width: `${scanProgress * 100}%` }} />
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function RoomScanView({ roomId, sessionId, playerName, opponent, opponentSessionId, onDone }: Props) {
  const {
    status, phase, scores, error,
    videoRef, canvasRef, streamRef,
    retry, startScan,
    scanProgress, samplesCollected, samplesSkipped,
    liveBonuses,
    rawScores, aiRating,
  } = useFaceLandmarker();

  // Start WebRTC immediately — don't wait for camera. Tracks are added once
  // streamReady flips true, which triggers the hook's track sync effect.
  const oppIds = opponentSessionId ? [opponentSessionId] : [];
  const remoteStreams = useWebRTCGroup(roomId, sessionId, oppIds, streamRef, status === "ready");
  const opponentStream = opponentSessionId ? (remoteStreams[opponentSessionId] ?? null) : null;

  const submitScore   = useMutation(api.players.submitScore);
  const saveScanData  = useMutation(api.players.saveFaceScanData);
  const setLiveScore  = useMutation(api.players.setLiveScore);
  const setPhaseMut   = useMutation(api.players.setPhase);
  const submittedRef  = useRef(false);
  const [showDone,    setShowDone]    = useState(false);
  const [showReveal,  setShowReveal]  = useState(false);

  const submitScoreRef = useRef(submitScore);
  submitScoreRef.current = submitScore;
  const roomIdRef      = useRef(roomId);
  roomIdRef.current    = roomId;
  const sessionIdRef   = useRef(sessionId);
  sessionIdRef.current = sessionId;

  const [countdown, setCountdown] = useState<number | null>(null);
  useEffect(() => {
    if (status !== "ready" || phase !== "live") return;
    let n = 5;
    setCountdown(5);
    const iv = setInterval(() => {
      n -= 1;
      if (n <= 0) {
        clearInterval(iv);
        setCountdown(null);
        startScan();
      } else {
        setCountdown(n);
      }
    }, 1000);
    return () => { clearInterval(iv); setCountdown(null); };
  }, [status, phase, startScan]);

  useEffect(() => {
    if (phase === "scanning") {
      void setPhaseMut({ roomId, sessionId, phase: "scanning" });
    }
  }, [phase, roomId, sessionId, setPhaseMut]);

  const scoresRef = useRef<typeof scores>(null);
  scoresRef.current = scores;
  useEffect(() => {
    if (phase !== "scanning") return;
    const iv = setInterval(() => {
      if (scoresRef.current) {
        void setLiveScore({ roomId, sessionId, liveScore: scoresRef.current.overall });
      }
    }, 2000);
    return () => clearInterval(iv);
  }, [phase, roomId, sessionId, setLiveScore]);

  // Auto-submit when scan complete
  useEffect(() => {
    if (phase !== "complete" || !scores || submittedRef.current) return;
    submittedRef.current = true;
    setShowDone(true);
    // Brief pause then show reveal
    setTimeout(() => setShowReveal(true), 100);

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
      setTimeout(onDone, 3500);
    });
    void saveScanData({
      roomId, sessionId,
      capturedAt: Date.now(),
      rawTraitsJson:    rawScores ? JSON.stringify(rawScores.traits) : undefined,
      rawOverall:       rawScores?.overall,
      aiTraitsJson:     aiRating ? JSON.stringify(aiRating.traits) : undefined,
      aiOverall:        aiRating ? Object.values(aiRating.traits).reduce((s, v) => s + v, 0) / 6 : undefined,
      aiDomLabel:       aiRating?.dom.label,
      aiFlawLabel:      aiRating?.flaw.label,
      finalOverall:     scores.overall,
      finalElo:         scores.elo,
      finalSub:         scores.sub,
      finalTierCode:    scores.tier.code,
      finalLevel:       scores.level,
      finalDomLabel:    scores.dom.label,
      finalFlawLabel:   scores.flaw.label,
      samplesCollected,
      samplesSkipped,
    }).catch(() => {});
  }, [phase, scores, rawScores, aiRating, roomId, sessionId, submitScore, saveScanData, onDone, samplesCollected, samplesSkipped]);

  // Forfeit on unmount if scan was not completed
  useEffect(() => {
    return () => {
      if (!submittedRef.current) {
        void submitScoreRef.current({
          roomId: roomIdRef.current,
          sessionId: sessionIdRef.current,
          overall: 1, elo: 57, sub: "SUB1",
          tierCode: "BCK", tierColor: "#6b7280",
          level: "L0", domLabel: "—", flawLabel: "Left early",
        }).catch(() => {});
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const myScore  = scores?.overall ?? 0;
  const oppScore = opponent?.overall ?? opponent?.liveScore ?? 0;
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
              {status === "denied" ? "Camera access denied"
                : status === "unsupported" ? "Camera not supported"
                : (error ?? "Scanner failed")}
            </p>
            {status !== "unsupported" && (
              <button onClick={retry}
                className="rounded-full bg-white/10 ring-1 ring-white/20 px-4 py-2
                  font-mono text-[9px] tracking-widest uppercase text-white">
                Retry Camera
              </button>
            )}
            <button onClick={onDone}
              className="rounded-full bg-rose-500/15 ring-1 ring-rose-400/30 px-4 py-2
                font-mono text-[9px] tracking-widest uppercase text-rose-300">
              Forfeit Match
            </button>
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

        {/* Live score overlay during scanning */}
        {phase !== "complete" && (
          <ScoreOverlay scores={scores} name={playerName} label="YOUR SCAN" />
        )}

        {/* Animated reveal after complete */}
        {phase === "complete" && scores && showReveal && (
          <RevealOverlay scores={scores} name={playerName} />
        )}

        {/* Live bonus callouts */}
        {phase === "scanning" && <LiveBonusStack bonuses={liveBonuses} />}

        {/* Auto-countdown overlay */}
        {countdown !== null && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/65 z-10">
            <p className="font-mono text-[8px] tracking-[0.55em] uppercase text-white/45 mb-3">Get Ready</p>
            <span key={countdown} className="font-mono font-black tabular-nums leading-none animate-countdown-pop"
              style={{ fontSize: "clamp(90px,22vw,120px)", color: "white", textShadow: "0 0 40px rgba(34,211,238,0.5)" }}>
              {countdown}
            </span>
          </div>
        )}

        {phase === "analyzing" && (
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
            <div className="flex items-center gap-2 rounded-full glass px-5 py-2.5 ring-1 ring-cyan-400/40">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping shrink-0" />
              <span className="font-mono text-[9px] tracking-[0.22em] uppercase text-cyan-300">AI Analysis…</span>
            </div>
          </div>
        )}

        {showDone && phase === "complete" && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-40">
            <div className="flex items-center gap-2 rounded-full glass px-5 py-2.5 ring-1 ring-emerald-400/40">
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
      />

      {/* Opponent panel (bottom half) */}
      <div className="flex-1 relative overflow-hidden min-h-0">
        <OpponentPanel opponent={opponent} stream={opponentStream} />
      </div>
    </div>
  );
}
