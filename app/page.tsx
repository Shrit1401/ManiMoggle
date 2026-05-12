"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "convex/react";
import { api } from "../convex/_generated/api";

function useLocalStorage(key: string) {
  const [value, setValue] = useState("");
  useEffect(() => { setValue(localStorage.getItem(key) ?? ""); }, [key]);
  const set = (v: string) => { localStorage.setItem(key, v); setValue(v); };
  return [value, set] as const;
}

function useSessionId() {
  const [id, setId] = useState("");
  useEffect(() => {
    let s = localStorage.getItem("manimoggle_session");
    if (!s) { s = crypto.randomUUID(); localStorage.setItem("manimoggle_session", s); }
    setId(s);
  }, []);
  return id;
}

type Mode = "battle" | "tournament" | "group";

const MODES: { id: Mode; icon: string; label: string; sub: string; players: string }[] = [
  { id: "battle",     icon: "⚔️",  label: "1V1 BATTLE",   sub: "Split-screen duel",          players: "2 PLAYERS" },
  { id: "tournament", icon: "🏆",  label: "TOURNAMENT",   sub: "Round-robin · best face wins", players: "UP TO 32"  },
  { id: "group",      icon: "👥",  label: "GROUP SCAN",   sub: "All scan, ranked by PSL",     players: "UP TO 8"   },
];

// ─── Deterministic pseudo-random (avoids SSR/hydration mismatch) ─────────────
const det = (i: number, lo = 0, hi = 1) => {
  const v = (Math.sin(i * 127.1 + 311.7) * 43758.5453) % 1;
  return lo + Math.abs(v) * (hi - lo);
};

// ─── Client-only wrapper (avoids SSR/hydration mismatch for random visuals) ──
function ClientOnly({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return <>{children}</>;
}

// ─── Meteors ─────────────────────────────────────────────────────────────────
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
        <span key={m.id}
          className="absolute rounded-full"
          style={{
            top:   `${m.top}%`,
            left:  `${m.left}%`,
            width: `${m.len}px`,
            height: "1.5px",
            background: "linear-gradient(to right, rgba(255,255,255,0.95), rgba(34,211,238,0.8), rgba(34,211,238,0))",
            boxShadow: "0 0 6px 1px rgba(34,211,238,0.5)",
            animationName: "meteor",
            animationDuration: `${m.dur}s`,
            animationTimingFunction: "linear",
            animationDelay: `${m.delay}s`,
            animationIterationCount: "infinite",
            animationFillMode: "both",
          }}
        />
      ))}
    </div>
  );
}

// ─── Sparkles ─────────────────────────────────────────────────────────────────
const SPARKLES = Array.from({ length: 26 }, (_, i) => ({
  id: i,
  x:    det(i * 5 + 1, 2, 98),
  y:    det(i * 5 + 2, 2, 98),
  size: det(i * 5 + 3, 1, 3),
  dur:  det(i * 5 + 4, 2, 5),
  del:  det(i * 5 + 5, 0, 4),
}));

function Sparkles() {
  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
      {SPARKLES.map(s => (
        <div key={s.id}
          className="absolute rounded-full"
          style={{
            left:   `${s.x}%`,
            top:    `${s.y}%`,
            width:  `${s.size}px`,
            height: `${s.size}px`,
            background: "rgba(34,211,238,0.9)",
            boxShadow:  `0 0 ${s.size * 3}px rgba(34,211,238,0.7)`,
            animationName: "twinkle",
            animationDuration: `${s.dur}s`,
            animationTimingFunction: "ease-in-out",
            animationDelay: `${s.del}s`,
            animationIterationCount: "infinite",
            animationFillMode: "both",
          }}
        />
      ))}
    </div>
  );
}

// ─── Scan beam ────────────────────────────────────────────────────────────────
function ScanBeam() {
  return (
    <div className="fixed inset-x-0 top-0 pointer-events-none z-0 overflow-hidden h-screen">
      <div className="absolute inset-x-0 h-[2px]"
        style={{
          background: "linear-gradient(90deg, transparent 0%, rgba(34,211,238,0.12) 20%, rgba(34,211,238,0.5) 50%, rgba(34,211,238,0.12) 80%, transparent 100%)",
          boxShadow: "0 0 20px rgba(34,211,238,0.35), 0 0 60px rgba(34,211,238,0.12)",
          animationName: "scan-down",
          animationDuration: "7s",
          animationTimingFunction: "linear",
          animationDelay: "0.5s",
          animationIterationCount: "infinite",
          animationFillMode: "both",
        }}
      />
    </div>
  );
}

// ─── HUD corners ─────────────────────────────────────────────────────────────
function HudCorners() {
  return (
    <>
      {/* Top-left */}
      <div className="fixed top-4 left-4 pointer-events-none z-10">
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
          <path d="M2 18 L2 2 L18 2" stroke="rgba(34,211,238,0.35)" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
        <div className="absolute top-1 left-1 w-1.5 h-1.5 rounded-full bg-cyan-400/60 animate-pulse-ring" />
        <div className="absolute top-1 left-1 w-1.5 h-1.5 rounded-full bg-cyan-400/80" />
      </div>
      {/* Top-right */}
      <div className="fixed top-4 right-4 pointer-events-none z-10">
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
          <path d="M14 2 L30 2 L30 18" stroke="rgba(34,211,238,0.35)" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
        <div className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-cyan-400/40 animate-pulse" />
      </div>
      {/* Bottom-left */}
      <div className="fixed bottom-4 left-4 pointer-events-none z-10">
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
          <path d="M2 14 L2 30 L18 30" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      </div>
      {/* Bottom-right */}
      <div className="fixed bottom-4 right-4 pointer-events-none z-10">
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
          <path d="M14 30 L30 30 L30 14" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      </div>
    </>
  );
}

// ─── Glitch title ─────────────────────────────────────────────────────────────
function GlitchTitle() {
  const text = "MANIMOGGLE";
  return (
    <div className="relative select-none" style={{ lineHeight: 1 }}>
      {/* Cyan ghost */}
      <span aria-hidden className="absolute inset-0 font-mono font-black tracking-[0.12em] uppercase pointer-events-none"
        style={{
          fontSize: "clamp(36px,10vw,62px)",
          background: "linear-gradient(180deg,#22d3ee 0%,#06b6d4 100%)",
          WebkitBackgroundClip: "text", backgroundClip: "text", WebkitTextFillColor: "transparent",
          animation: "glitch-cyan 9s steps(1) 2s infinite",
          opacity: 0,
        }}>
        {text}
      </span>
      {/* Rose ghost */}
      <span aria-hidden className="absolute inset-0 font-mono font-black tracking-[0.12em] uppercase pointer-events-none"
        style={{
          fontSize: "clamp(36px,10vw,62px)",
          background: "linear-gradient(180deg,#fb7185 0%,#f43f5e 100%)",
          WebkitBackgroundClip: "text", backgroundClip: "text", WebkitTextFillColor: "transparent",
          animation: "glitch-rose 9s steps(1) 2s infinite",
          opacity: 0,
        }}>
        {text}
      </span>
      {/* Main */}
      <h1 className="font-mono font-black tracking-[0.12em] uppercase"
        style={{
          fontSize: "clamp(36px,10vw,62px)",
          background: "linear-gradient(180deg,#ffffff 0%,#c8f5ff 60%,#7de8f8 100%)",
          WebkitBackgroundClip: "text", backgroundClip: "text", WebkitTextFillColor: "transparent",
          animation: "glitch-main 9s steps(1) 2s infinite",
        }}>
        {text}
      </h1>
    </div>
  );
}

// ─── Spotlight card wrapper ───────────────────────────────────────────────────
function SpotlightCards({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  const onMove = (e: React.MouseEvent) => {
    const r = ref.current?.getBoundingClientRect();
    if (r) setPos({ x: e.clientX - r.left, y: e.clientY - r.top });
  };

  return (
    <div ref={ref} onMouseMove={onMove} onMouseLeave={() => setPos(null)} className={className}>
      {/* Spotlight overlay — covers the whole cards area */}
      <div className="absolute inset-0 pointer-events-none rounded-xl transition-opacity duration-300 z-10"
        style={{
          background: pos
            ? `radial-gradient(280px circle at ${pos.x}px ${pos.y}px, rgba(34,211,238,0.10), transparent 70%)`
            : "none",
        }}
      />
      {children}
    </div>
  );
}

// ─── Main ────────────────────────────────────────────────────────────────────
export default function Home() {
  const router    = useRouter();
  const sessionId = useSessionId();
  const [name, setName]         = useLocalStorage("manimoggle_name");
  const [joinCode, setJoinCode] = useState("");
  const [mode, setMode]         = useState<Mode>("tournament");
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState<"create" | "join" | null>(null);
  const [tab, setTab]           = useState<"create" | "join">("create");

  const createRoom = useMutation(api.rooms.create);
  const joinRoom   = useMutation(api.rooms.join);

  const handleCreate = async () => {
    if (!name.trim() || !sessionId) return;
    setLoading("create"); setError("");
    try {
      const { code } = await createRoom({ sessionId, name: name.trim().toUpperCase(), mode });
      router.push(`/room/${code}`);
    } catch { setError("Failed to create room"); setLoading(null); }
  };

  const handleJoin = async () => {
    if (!name.trim() || joinCode.length < 6 || !sessionId) return;
    setLoading("join"); setError("");
    try {
      const result = await joinRoom({ code: joinCode.trim().toUpperCase(), sessionId, name: name.trim().toUpperCase() });
      if ("error" in result) { setError(result.error ?? "Room not found"); setLoading(null); }
      else router.push(`/room/${result.code}`);
    } catch { setError("Failed to join room"); setLoading(null); }
  };

  return (
    <main className="bg-black min-h-[100dvh] relative overflow-x-hidden flex flex-col items-center justify-center px-4 py-10 pt-safe pb-safe sm:px-6">

      {/* ── Background layers ── */}
      {/* Grid */}
      <div className="fixed inset-0 pointer-events-none z-0 opacity-[0.030]"
        style={{
          backgroundImage: "linear-gradient(rgba(34,211,238,1) 1px,transparent 1px),linear-gradient(90deg,rgba(34,211,238,1) 1px,transparent 1px)",
          backgroundSize: "40px 40px",
          animation: "grid-drift 12s linear infinite",
        }}
      />
      {/* Radial vignette */}
      <div className="fixed inset-0 pointer-events-none z-0"
        style={{ background: "radial-gradient(ellipse 80% 70% at 50% 50%, transparent 30%, rgba(0,0,0,0.7) 100%)" }}
      />
      {/* Top ambient */}
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[800px] h-[350px] pointer-events-none z-0"
        style={{ background: "radial-gradient(ellipse at 50% 0%, rgba(34,211,238,0.09) 0%, transparent 65%)" }}
      />

      <ClientOnly>
        <Meteors />
        <Sparkles />
        <ScanBeam />
      </ClientOnly>
      <HudCorners />

      {/* ── Content ── */}
      <div className="relative z-10 w-full max-w-[460px] flex flex-col items-center gap-4">

        {/* Glass block */}
        <div className="w-full flex flex-col gap-5 px-5 py-7 rounded-2xl
          bg-black/70 backdrop-blur-2xl
          ring-1 ring-white/[0.09]
          shadow-[0_0_80px_rgba(0,0,0,0.85),inset_0_1px_0_rgba(255,255,255,0.05)]
          sm:px-7 sm:py-8">

          {/* Wordmark */}
          <div className="flex flex-col items-center gap-3 text-center">
            <GlitchTitle />
            <p className="font-sans text-[13px] leading-relaxed text-white/50 max-w-[300px]">
              An AI-powered face battle game. Create a room, share the code with friends, and let the scanner rank everyone's look — live.
            </p>
          </div>

          {/* Form */}
          <div className="w-full flex flex-col gap-3">

          {/* Name */}
          <div className="flex flex-col gap-1.5">
            <label className="font-mono text-[7.5px] tracking-[0.42em] uppercase text-white/45 pl-0.5">Your Name</label>
            <div className="relative group">
              {/* Glow on focus */}
              <div className="absolute -inset-px rounded-xl opacity-0 group-focus-within:opacity-100 transition-opacity duration-300 pointer-events-none"
                style={{ background: "radial-gradient(ellipse at 50% 0%, rgba(34,211,238,0.25), transparent 70%)", filter: "blur(4px)" }}
              />
              <input
                value={name}
                onChange={e => setName(e.target.value.toUpperCase().slice(0, 14))}
                onKeyDown={e => { if (e.key === "Enter") tab === "create" ? handleCreate() : handleJoin(); }}
                placeholder="ENTER YOUR NAME"
                autoCapitalize="characters"
                style={{ minHeight: 52 }}
                className="relative w-full bg-white/[0.06] ring-1 ring-white/12 rounded-xl px-4 py-3.5 font-mono text-[13px]
                  text-white placeholder:text-white/22 tracking-[0.18em] uppercase outline-none
                  focus:ring-cyan-400/50 focus:bg-white/[0.08] transition-all"
              />
            </div>
          </div>

          {/* Tabs */}
          <div className="flex rounded-xl bg-white/[0.05] ring-1 ring-white/10 p-1 gap-1">
            {(["create", "join"] as const).map(t => (
              <button key={t} onClick={() => setTab(t)}
                style={{ minHeight: 40 }}
                className={`flex-1 py-2 rounded-lg font-mono text-[8.5px] tracking-[0.2em] uppercase transition-all
                  ${tab === t
                    ? "bg-white/[0.10] ring-1 ring-white/18 text-white shadow-[0_0_12px_rgba(34,211,238,0.12)]"
                    : "text-white/38 hover:text-white/60"}`}>
                {t === "create" ? "Create Room" : "Join Room"}
              </button>
            ))}
          </div>

          {/* Create */}
          {tab === "create" && (
            <div className="flex flex-col gap-2.5">
              <label className="font-mono text-[7.5px] tracking-[0.42em] uppercase text-white/45 pl-0.5">Game Mode</label>

              <SpotlightCards className="relative flex flex-col gap-1.5">
                {MODES.map(m => {
                  const sel = mode === m.id;
                  return (
                    <button key={m.id} onClick={() => setMode(m.id)}
                      style={{ minHeight: 52 }}
                      className={`relative flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-left overflow-hidden
                        ${sel
                          ? "bg-cyan-900/30 ring-1 ring-cyan-400/28"
                          : "bg-white/[0.04] ring-1 ring-white/8 hover:bg-white/[0.07] hover:ring-white/14"}`}>
                      {/* Selected shimmer sweep */}
                      {sel && (
                        <div className="absolute inset-0 pointer-events-none shine-sweep opacity-60" />
                      )}
                      <span className="text-[18px] shrink-0 w-6 text-center relative z-10">{m.icon}</span>
                      <div className="flex-1 min-w-0 relative z-10">
                        <p className={`font-mono font-bold text-[11px] tracking-[0.12em]
                          ${sel ? "text-cyan-300" : "text-white/75"}`}>
                          {m.label}
                        </p>
                        <p className="font-mono text-[8px] text-white/35 mt-0.5 tracking-wide">{m.sub}</p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0 relative z-10">
                        <span className={`font-mono text-[7px] px-2 py-1 rounded-full tracking-widest transition-all
                          ${sel ? "bg-cyan-500/25 text-cyan-300 ring-1 ring-cyan-400/30" : "bg-white/[0.06] text-white/30"}`}>
                          {m.players}
                        </span>
                        {sel && (
                          <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-400" />
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </SpotlightCards>

              {/* CTA with glow */}
              <div className="relative mt-1 group">
                <div className="absolute -inset-[1px] rounded-xl opacity-70 group-hover:opacity-100 transition-opacity pointer-events-none"
                  style={{
                    background: "linear-gradient(135deg, rgba(34,211,238,0.5), rgba(6,182,212,0.3), rgba(34,211,238,0.5))",
                    filter: "blur(6px)",
                  }}
                />
                <button onClick={handleCreate}
                  disabled={!name.trim() || !sessionId || !!loading}
                  style={{ minHeight: 52 }}
                  className="relative w-full rounded-xl py-3.5 font-mono font-bold text-[11px] tracking-[0.28em] uppercase
                    transition-all active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed
                    bg-gradient-to-r from-cyan-600 to-cyan-500 hover:from-cyan-500 hover:to-cyan-400
                    text-white overflow-hidden shine-sweep">
                  {loading === "create" ? "Creating…" : "Create Room →"}
                </button>
              </div>
            </div>
          )}

          {/* Join */}
          {tab === "join" && (
            <div className="flex flex-col gap-2.5">
              <label className="font-mono text-[7.5px] tracking-[0.42em] uppercase text-white/45 pl-0.5">Room Code</label>
              <div className="relative group">
                <div className="absolute -inset-px rounded-xl opacity-0 group-focus-within:opacity-100 transition-opacity duration-300 pointer-events-none"
                  style={{ background: "radial-gradient(ellipse at 50% 100%, rgba(34,211,238,0.2), transparent 70%)", filter: "blur(4px)" }}
                />
                <input
                  value={joinCode}
                  onChange={e => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))}
                  onKeyDown={e => { if (e.key === "Enter") handleJoin(); }}
                  placeholder="ABC123"
                  autoCapitalize="characters"
                  autoFocus
                  style={{ minHeight: 64 }}
                  className="relative w-full bg-white/[0.06] ring-1 ring-white/12 rounded-xl px-4 py-4 font-mono text-[26px]
                    text-white placeholder:text-white/22 tracking-[0.55em] uppercase text-center outline-none
                    focus:ring-cyan-400/50 focus:bg-white/[0.08] transition-all"
                />
              </div>
              <p className="font-mono text-[7px] tracking-widest text-white/30 text-center">
                6-character code from your host
              </p>
              <div className="relative group">
                <div className="absolute -inset-[1px] rounded-xl opacity-70 group-hover:opacity-100 transition-opacity pointer-events-none"
                  style={{ background: "linear-gradient(135deg,rgba(34,211,238,0.5),rgba(6,182,212,0.3),rgba(34,211,238,0.5))", filter: "blur(6px)" }}
                />
                <button onClick={handleJoin}
                  disabled={!name.trim() || joinCode.length < 6 || !sessionId || !!loading}
                  style={{ minHeight: 52 }}
                  className="relative w-full rounded-xl py-3.5 font-mono font-bold text-[11px] tracking-[0.28em] uppercase
                    transition-all active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed
                    bg-gradient-to-r from-cyan-600 to-cyan-500 hover:from-cyan-500 hover:to-cyan-400
                    text-white overflow-hidden shine-sweep">
                  {loading === "join" ? "Joining…" : "Join Room →"}
                </button>
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-xl bg-rose-500/10 ring-1 ring-rose-400/25 px-4 py-3 text-center">
              <p className="font-mono text-[8px] tracking-[0.2em] uppercase text-rose-300">{error}</p>
            </div>
          )}
          </div>
        </div>{/* end glass block */}

      </div>

    </main>
  );
}
