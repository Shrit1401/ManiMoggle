"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { Scores, Badge } from "../../app/scan/face-rating";
import { RadarChart } from "./RadarChart";
import { ScoreCard } from "./ScoreCard";

interface ResultPanelProps {
  scores: Scores;
  name: string;
  summaryJson?: string | null;
  onAction: () => void;
  actionLabel?: string;
}

export function ResultPanel({
  scores, name, onAction, actionLabel = "Continue →",
}: ResultPanelProps) {
  const [displayVal, setDisplayVal] = useState(1.0);
  const [showDetail, setShowDetail] = useState(false);
  const [sharing, setSharing] = useState(false);
  const animRef   = useRef<number>(0);
  const cardRef   = useRef<HTMLDivElement>(null);

  const finalVal  = scores.overall;
  const tierClr   = scores.tier.starColor;
  const tierCode  = scores.tier.code;
  const baseScore = Math.max(1, finalVal - (scores.bonuses ?? []).reduce((s, b) => s + b.delta, 0));

  useEffect(() => {
    const start = performance.now();
    const tick  = (now: number) => {
      const t = Math.min((now - start) / 1200, 1);
      const e = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
      setDisplayVal(1 + (finalVal - 1) * e);
      if (t < 1) { animRef.current = requestAnimationFrame(tick); }
      else        { setDisplayVal(finalVal); setTimeout(() => setShowDetail(true), 150); }
    };
    animRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleShare = useCallback(async () => {
    if (!cardRef.current || sharing) return;
    setSharing(true);
    try {
      const { toPng } = await import("html-to-image");
      const dataUrl = await toPng(cardRef.current, { pixelRatio: 2, cacheBust: true });
      const blob = await fetch(dataUrl).then(r => r.blob());
      const file = new File([blob], `manimoggle-${name}-${scores.overall.toFixed(1)}.png`, { type: "image/png" });

      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: `${name} — PSL ${scores.overall.toFixed(1)}` });
      } else {
        const a = document.createElement("a");
        a.href = dataUrl;
        a.download = file.name;
        a.click();
      }
    } catch {
      // user cancelled or share failed — no-op
    } finally {
      setSharing(false);
    }
  }, [sharing, name, scores.overall]);

  return (
    <div className="flex flex-col h-full bg-black overflow-y-auto">
      {/* Hidden score card for sharing — rendered off-screen */}
      <div style={{ position: "fixed", left: -9999, top: 0, pointerEvents: "none" }}>
        <ScoreCard ref={cardRef} scores={scores} name={name} />
      </div>

      {/* Header */}
      <div className="shrink-0 flex items-center justify-between px-4 pt-safe pt-3 pb-2.5 border-b border-[var(--ring-1)]">
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
          <span className="font-mono text-[10px] tracking-[0.25em] uppercase text-emerald-400">Score Locked</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="font-mono font-bold text-[10px] text-white/80 uppercase tracking-[0.06em]">{name}</span>
          <div className="w-6 h-6 rounded-full bg-cyan-500/20 ring-1 ring-[var(--ring-2)]
            flex items-center justify-center font-mono text-[9px] font-bold text-cyan-300">
            {name.charAt(0)}
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center px-4 pt-5 pb-6 gap-5 overflow-y-auto">

        {/* Big score + tier */}
        <div className="flex flex-col items-center gap-1">
          <p className="font-mono text-[10px] tracking-[0.25em] uppercase text-white/28">PSL Score</p>
          <p className="font-sans font-black tabular-nums leading-none"
            style={{ fontSize: 76, color: "#22d3ee", textShadow: `0 0 40px ${tierClr}55` }}>
            {displayVal.toFixed(1)}
          </p>
          <div className="flex items-center gap-2">
            <span className="font-mono text-[11px] tracking-wider uppercase font-bold" style={{ color: tierClr }}>
              ★ {tierCode}
            </span>
            <span className="font-mono text-[10px] text-white/35 uppercase tracking-[0.2em]">{scores.level}</span>
          </div>
          <div className="flex overflow-hidden rounded-full ring-1 ring-[var(--ring-1)] font-mono text-[7.5px] font-bold mt-1">
            <div className="flex items-center gap-1 px-2.5 py-1 text-white"
              style={{ background: "linear-gradient(135deg, rgba(249,115,22,0.85), rgba(245,158,11,0.75))" }}>
              <span>🌹</span><span>{scores.sub}</span>
            </div>
            <div className="w-px bg-[var(--ring-1)] self-stretch" />
            <div className="flex items-center px-2.5 py-1 text-white"
              style={{ background: "linear-gradient(135deg, rgba(34,211,238,0.75), rgba(14,165,233,0.8))" }}>
              {scores.elo} ELO
            </div>
          </div>
        </div>

        {/* DOM / FLAW */}
        <div className="flex gap-6">
          <div className="flex flex-col items-center gap-0.5">
            <span className="font-mono text-[10px] text-white/28 uppercase tracking-[0.2em]">Dominant</span>
            <span className="font-mono text-[10px] text-emerald-300">{scores.dom.label}</span>
          </div>
          <div className="w-px bg-white/10 self-stretch" />
          <div className="flex flex-col items-center gap-0.5">
            <span className="font-mono text-[10px] text-white/28 uppercase tracking-[0.2em]">Weakness</span>
            <span className="font-mono text-[10px] text-rose-400">{scores.flaw.label}</span>
          </div>
        </div>

        {showDetail && (
          <>
            {/* Radar chart */}
            <div className="flex flex-col items-center gap-1">
              <p className="font-mono text-[10px] tracking-[0.25em] uppercase text-white/28">Trait Breakdown</p>
              <RadarChart traits={scores.traits} />
            </div>

            {/* Bonus breakdown */}
            {(scores.bonuses ?? []).length > 0 && (
              <div className="w-full flex flex-col gap-1.5 bg-[var(--surface-1)] rounded-[var(--radius-card)] px-4 py-3">
                <p className="font-mono text-[10px] tracking-[0.25em] uppercase text-white/28 mb-0.5">Score Breakdown</p>
                <div className="flex justify-between">
                  <span className="font-mono text-[10px] text-white/38 uppercase">Base</span>
                  <span className="font-mono text-[10px] text-white/55 tabular-nums">{baseScore.toFixed(1)}</span>
                </div>
                {(scores.bonuses ?? []).map(b => (
                  <div key={b.key} className="flex justify-between">
                    <span className="font-mono text-[10px] text-cyan-300/65">+ {b.label}</span>
                    <span className="font-mono text-[10px] text-cyan-400 tabular-nums">+{b.delta.toFixed(2)}</span>
                  </div>
                ))}
                <div className="flex justify-between border-t border-[var(--ring-1)] pt-1.5 mt-0.5">
                  <span className="font-mono text-[10px] text-white/40 uppercase">Final</span>
                  <span className="font-mono text-[10px] font-bold tabular-nums" style={{ color: tierClr }}>
                    {finalVal.toFixed(1)}
                  </span>
                </div>
              </div>
            )}

            {/* Badges */}
            {(scores.badges ?? []).length > 0 && (
              <div className="flex flex-wrap gap-1.5 justify-center">
                {(scores.badges ?? []).map((badge: Badge) => (
                  <span key={badge.id}
                    className="font-mono text-[10px] tracking-[0.2em] uppercase px-2.5 py-1 rounded-full ring-1"
                    style={{ color: badge.color, borderColor: `${badge.color}50`, background: `${badge.color}18` }}>
                    {badge.label}
                  </span>
                ))}
              </div>
            )}

            {/* Action + share row */}
            <div className="w-full flex gap-2">
              <button onClick={onAction}
                className="flex-1 rounded-full bg-[var(--surface-2)] hover:bg-[var(--surface-3)] active:scale-[0.97]
                  ring-1 ring-[var(--ring-2)] py-4 font-mono text-[10px] tracking-[0.25em]
                  uppercase text-white transition-all">
                {actionLabel}
              </button>
              <button
                onClick={handleShare}
                disabled={sharing}
                className="rounded-full bg-cyan-500/15 hover:bg-cyan-500/25 active:scale-[0.97]
                  ring-1 ring-cyan-400/35 px-4 py-4 font-mono text-[10px] tracking-[0.25em]
                  uppercase text-cyan-300 transition-all disabled:opacity-50"
              >
                {sharing ? "…" : "Share ↗"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
