"use client";

import { useState, useEffect } from "react";

// Deterministic pseudo-random — avoids SSR/hydration mismatch
const det = (i: number, lo = 0, hi = 1) => {
  const v = (Math.sin(i * 127.1 + 311.7) * 43758.5453) % 1;
  return lo + Math.abs(v) * (hi - lo);
};

function ClientOnly({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return <>{children}</>;
}

const METEORS = Array.from({ length: 16 }, (_, i) => ({
  id: i,
  top:   det(i * 3 + 1, -5, 50),
  left:  det(i * 3 + 2, 0,  95),
  dur:   det(i * 3 + 3, 5,  12),
  delay: det(i * 3 + 4, 0,  10),
  len:   det(i * 3 + 5, 60, 160),
}));

function Meteors() {
  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
      {METEORS.map(m => (
        <span key={m.id} className="absolute rounded-full"
          style={{
            top: `${m.top}%`, left: `${m.left}%`,
            width: `${m.len}px`, height: "1.5px",
            background: "linear-gradient(to right, rgba(255,255,255,0.95), rgba(34,211,238,0.8), rgba(34,211,238,0))",
            boxShadow: "0 0 6px 1px rgba(34,211,238,0.5)",
            animationName: "meteor", animationDuration: `${m.dur}s`,
            animationTimingFunction: "linear", animationDelay: `${m.delay}s`,
            animationIterationCount: "infinite", animationFillMode: "both",
          }} />
      ))}
    </div>
  );
}

const SPARKLES = Array.from({ length: 26 }, (_, i) => ({
  id: i, x: det(i * 5 + 1, 2, 98), y: det(i * 5 + 2, 2, 98),
  size: det(i * 5 + 3, 1, 3), dur: det(i * 5 + 4, 2, 5), del: det(i * 5 + 5, 0, 4),
}));

function Sparkles() {
  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
      {SPARKLES.map(s => (
        <div key={s.id} className="absolute rounded-full"
          style={{
            left: `${s.x}%`, top: `${s.y}%`,
            width: `${s.size}px`, height: `${s.size}px`,
            background: "rgba(34,211,238,0.9)",
            boxShadow: `0 0 ${s.size * 3}px rgba(34,211,238,0.7)`,
            animationName: "twinkle", animationDuration: `${s.dur}s`,
            animationTimingFunction: "ease-in-out", animationDelay: `${s.del}s`,
            animationIterationCount: "infinite", animationFillMode: "both",
          }} />
      ))}
    </div>
  );
}

function ScanBeam() {
  return (
    <div className="fixed inset-x-0 top-0 pointer-events-none z-0 overflow-hidden h-screen">
      <div className="absolute inset-x-0 h-[2px]"
        style={{
          background: "linear-gradient(90deg,transparent 0%,rgba(34,211,238,0.12) 20%,rgba(34,211,238,0.5) 50%,rgba(34,211,238,0.12) 80%,transparent 100%)",
          boxShadow: "0 0 20px rgba(34,211,238,0.35), 0 0 60px rgba(34,211,238,0.12)",
          animationName: "scan-down", animationDuration: "7s",
          animationTimingFunction: "linear", animationDelay: "0.5s",
          animationIterationCount: "infinite", animationFillMode: "both",
        }} />
    </div>
  );
}

function HudCorners() {
  return (
    <>
      <div className="fixed top-4 left-4 pointer-events-none z-10">
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
          <path d="M2 18 L2 2 L18 2" stroke="rgba(34,211,238,0.35)" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
        <div className="absolute top-1 left-1 w-1.5 h-1.5 rounded-full bg-cyan-400/60 animate-pulse-ring" />
        <div className="absolute top-1 left-1 w-1.5 h-1.5 rounded-full bg-cyan-400/80" />
      </div>
      <div className="fixed top-4 right-4 pointer-events-none z-10">
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
          <path d="M14 2 L30 2 L30 18" stroke="rgba(34,211,238,0.35)" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
        <div className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-cyan-400/40 animate-pulse" />
      </div>
      <div className="fixed bottom-4 left-4 pointer-events-none z-10">
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
          <path d="M2 14 L2 30 L18 30" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      </div>
      <div className="fixed bottom-4 right-4 pointer-events-none z-10">
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
          <path d="M14 30 L30 30 L30 14" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      </div>
    </>
  );
}

interface ArenaBackdropProps {
  /** "full" = all layers including meteors, sparkles, scan beam (landing/lobby/result)
   *  "calm" = grid + vignette only (active gameplay/scan screens) */
  variant?: "full" | "calm";
}

export function ArenaBackdrop({ variant = "full" }: ArenaBackdropProps) {
  return (
    <>
      {/* Drifting cyan grid */}
      <div className="fixed inset-0 pointer-events-none z-0 opacity-[0.030]"
        style={{
          backgroundImage: "linear-gradient(rgba(34,211,238,1) 1px,transparent 1px),linear-gradient(90deg,rgba(34,211,238,1) 1px,transparent 1px)",
          backgroundSize: "40px 40px",
          animation: "grid-drift 12s linear infinite",
        }} />
      {/* Radial vignette */}
      <div className="fixed inset-0 pointer-events-none z-0"
        style={{ background: "radial-gradient(ellipse 80% 70% at 50% 50%, transparent 30%, rgba(0,0,0,0.7) 100%)" }} />
      {/* Top ambient glow */}
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[800px] h-[350px] pointer-events-none z-0"
        style={{ background: "radial-gradient(ellipse at 50% 0%, rgba(34,211,238,0.09) 0%, transparent 65%)" }} />
      {variant === "full" && (
        <>
          <ClientOnly>
            <Meteors />
            <Sparkles />
            <ScanBeam />
          </ClientOnly>
          <HudCorners />
        </>
      )}
    </>
  );
}
