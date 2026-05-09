"use client";

import { useState, useEffect } from "react";
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

const MODES: { id: Mode; emoji: string; label: string; sub: string; players: string }[] = [
  { id: "battle",     emoji: "⚔️",  label: "1v1 BATTLE",  sub: "Split-screen duel",       players: "2 players"    },
  { id: "tournament", emoji: "🏆",  label: "TOURNAMENT",  sub: "Bracket · best face wins", players: "up to 32"     },
  { id: "group",      emoji: "👥",  label: "GROUP SCAN",  sub: "All scan, ranked by PSL",  players: "up to 8"      },
];

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
    } catch {
      setError("Failed to create room"); setLoading(null);
    }
  };

  const handleJoin = async () => {
    if (!name.trim() || joinCode.length < 6 || !sessionId) return;
    setLoading("join"); setError("");
    try {
      const result = await joinRoom({ code: joinCode.trim().toUpperCase(), sessionId, name: name.trim().toUpperCase() });
      if ("error" in result) { setError(result.error ?? "Room not found"); setLoading(null); }
      else router.push(`/room/${result.code}`);
    } catch {
      setError("Failed to join room"); setLoading(null);
    }
  };

  return (
    <main className="relative flex-1 flex flex-col items-center justify-center bg-black min-h-[100dvh] overflow-hidden px-5">

      {/* ── Background decoration ── */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        {/* Central glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] rounded-full animate-glow-pulse"
          style={{ background: "radial-gradient(ellipse at center, rgba(34,211,238,0.07) 0%, rgba(99,102,241,0.04) 40%, transparent 70%)" }} />
        {/* Top-right accent */}
        <div className="absolute -top-20 -right-20 w-80 h-80 rounded-full opacity-30"
          style={{ background: "radial-gradient(ellipse, rgba(99,102,241,0.15) 0%, transparent 70%)" }} />
        {/* Bottom-left accent */}
        <div className="absolute -bottom-20 -left-20 w-80 h-80 rounded-full opacity-30"
          style={{ background: "radial-gradient(ellipse, rgba(34,211,238,0.08) 0%, transparent 70%)" }} />
        {/* Subtle grid */}
        <div className="absolute inset-0 opacity-[0.025]"
          style={{ backgroundImage: "linear-gradient(rgba(255,255,255,1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,1) 1px, transparent 1px)", backgroundSize: "40px 40px" }} />
        {/* Scanline sweep */}
        <div className="absolute left-0 right-0 h-px animate-scanline"
          style={{ background: "linear-gradient(90deg, transparent, rgba(34,211,238,0.4), transparent)" }} />
      </div>

      {/* ── Corner brackets ── */}
      {(["top-5 left-5","top-5 right-5","bottom-5 left-5","bottom-5 right-5"] as const).map((pos, i) => (
        <span key={i} className={`fixed ${pos} pointer-events-none`}
          style={{
            width: 20, height: 20,
            borderTop:    i < 2 ? "1.5px solid rgba(34,211,238,0.25)" : undefined,
            borderBottom: i >= 2 ? "1.5px solid rgba(34,211,238,0.25)" : undefined,
            borderLeft:   i % 2 === 0 ? "1.5px solid rgba(34,211,238,0.25)" : undefined,
            borderRight:  i % 2 === 1 ? "1.5px solid rgba(34,211,238,0.25)" : undefined,
          }} />
      ))}

      <div className="relative z-10 w-full max-w-sm flex flex-col items-center gap-6">

        {/* ── Logo ── */}
        <div className="flex flex-col items-center gap-2 animate-fade-up">
          <div className="flex items-center gap-2.5 mb-1">
            <div className="h-px w-8 bg-gradient-to-r from-transparent to-cyan-500/50" />
            <span className="font-mono text-[7px] tracking-[0.45em] uppercase text-white/35">
              PSL · AI Face Scanner
            </span>
            <div className="h-px w-8 bg-gradient-to-l from-transparent to-cyan-500/50" />
          </div>
          <h1 className="text-gradient-cyan font-mono font-black text-[38px] sm:text-[48px] tracking-[0.25em] uppercase leading-none select-none">
            MANIMOGGLE
          </h1>
          <p className="font-mono text-[8px] tracking-[0.3em] uppercase text-white/25">
            Scan · Battle · Rank
          </p>
        </div>

        {/* ── Name input ── */}
        <div className="w-full flex flex-col gap-2 animate-fade-up delay-100">
          <label className="font-mono text-[7.5px] tracking-[0.35em] uppercase text-white/35 pl-1">
            Your Name
          </label>
          <div className="relative">
            <input
              value={name}
              onChange={e => setName(e.target.value.toUpperCase().slice(0, 14))}
              onKeyDown={e => { if (e.key === "Enter" && tab === "create") handleCreate(); else if (e.key === "Enter" && tab === "join") handleJoin(); }}
              placeholder="ENTER YOUR NAME"
              autoCapitalize="characters"
              className="w-full bg-white/[0.05] ring-1 ring-white/12 rounded-2xl px-4 py-4 font-mono text-[13px]
                text-white placeholder:text-white/18 tracking-[0.18em] uppercase outline-none
                focus:ring-cyan-400/35 focus:bg-white/[0.07] transition-all"
            />
            {name && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full
                bg-gradient-to-br from-cyan-500/30 to-cyan-500/10 ring-1 ring-cyan-400/30
                flex items-center justify-center font-mono text-[11px] font-bold text-cyan-300">
                {name.charAt(0)}
              </div>
            )}
          </div>
        </div>

        {/* ── Tab switcher ── */}
        <div className="w-full animate-fade-up delay-200">
          <div className="flex rounded-2xl bg-white/[0.04] ring-1 ring-white/8 p-1">
            {(["create", "join"] as const).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`flex-1 py-2.5 rounded-xl font-mono text-[9px] tracking-[0.22em] uppercase transition-all
                  ${tab === t ? "bg-white/10 ring-1 ring-white/15 text-white shadow-sm" : "text-white/35 hover:text-white/55"}`}>
                {t === "create" ? "Create Room" : "Join Room"}
              </button>
            ))}
          </div>
        </div>

        {/* ── Create tab ── */}
        {tab === "create" && (
          <div className="w-full flex flex-col gap-4 animate-fade-up">
            {/* Mode selector */}
            <div className="flex flex-col gap-2">
              <label className="font-mono text-[7.5px] tracking-[0.35em] uppercase text-white/35 pl-1">
                Game Mode
              </label>
              <div className="flex flex-col gap-1.5">
                {MODES.map(m => (
                  <button key={m.id} onClick={() => setMode(m.id)}
                    className={`flex items-center gap-3 px-4 py-3 rounded-2xl transition-all text-left
                      ${mode === m.id
                        ? "bg-cyan-500/10 ring-1 ring-cyan-400/35 shadow-[inset_0_0_20px_rgba(34,211,238,0.03)]"
                        : "bg-white/[0.025] ring-1 ring-white/8 hover:bg-white/[0.05] hover:ring-white/14"
                      }`}>
                    <span className="text-[18px] w-7 text-center shrink-0">{m.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <p className={`font-mono text-[9px] font-bold tracking-[0.15em] uppercase
                        ${mode === m.id ? "text-cyan-300" : "text-white/55"}`}>
                        {m.label}
                      </p>
                      <p className="font-mono text-[7px] tracking-wide text-white/25 mt-0.5">{m.sub}</p>
                    </div>
                    <div className={`flex items-center gap-1 shrink-0 px-2 py-1 rounded-full
                      ${mode === m.id ? "bg-cyan-400/10 ring-1 ring-cyan-400/25" : "bg-white/[0.04] ring-1 ring-white/8"}`}>
                      <span className={`font-mono text-[6.5px] tracking-widest uppercase
                        ${mode === m.id ? "text-cyan-400" : "text-white/25"}`}>
                        {m.players}
                      </span>
                    </div>
                    {mode === m.id && (
                      <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 shrink-0 shadow-[0_0_6px_rgba(34,211,238,0.8)]" />
                    )}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={handleCreate}
              disabled={!name.trim() || !sessionId || !!loading}
              className="w-full rounded-2xl py-4 font-mono font-bold text-[11px] tracking-[0.22em] uppercase
                transition-all active:scale-[0.98] disabled:opacity-30 disabled:cursor-not-allowed disabled:active:scale-100
                bg-gradient-to-r from-cyan-500 to-cyan-400 hover:from-cyan-400 hover:to-cyan-300
                text-black shadow-[0_0_40px_rgba(34,211,238,0.25)] hover:shadow-[0_0_55px_rgba(34,211,238,0.35)]"
            >
              {loading === "create" ? "Creating…" : "Create Room →"}
            </button>
          </div>
        )}

        {/* ── Join tab ── */}
        {tab === "join" && (
          <div className="w-full flex flex-col gap-4 animate-fade-up">
            <div className="flex flex-col gap-2">
              <label className="font-mono text-[7.5px] tracking-[0.35em] uppercase text-white/35 pl-1">
                Room Code
              </label>
              <input
                value={joinCode}
                onChange={e => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))}
                onKeyDown={e => { if (e.key === "Enter") handleJoin(); }}
                placeholder="ABC123"
                autoCapitalize="characters"
                autoFocus
                className="w-full bg-white/[0.05] ring-1 ring-white/12 rounded-2xl px-4 py-4 font-mono text-[20px]
                  text-white placeholder:text-white/18 tracking-[0.5em] uppercase text-center outline-none
                  focus:ring-cyan-400/35 focus:bg-white/[0.07] transition-all"
              />
              <p className="font-mono text-[7px] tracking-widest text-white/20 text-center">
                Enter the 6-character code shared by your host
              </p>
            </div>

            <button
              onClick={handleJoin}
              disabled={!name.trim() || joinCode.length < 6 || !sessionId || !!loading}
              className="w-full rounded-2xl py-4 font-mono font-bold text-[11px] tracking-[0.22em] uppercase
                transition-all active:scale-[0.98] disabled:opacity-30 disabled:cursor-not-allowed disabled:active:scale-100
                bg-gradient-to-r from-cyan-500 to-cyan-400 hover:from-cyan-400 hover:to-cyan-300
                text-black shadow-[0_0_40px_rgba(34,211,238,0.25)] hover:shadow-[0_0_55px_rgba(34,211,238,0.35)]"
            >
              {loading === "join" ? "Joining…" : "Join Room →"}
            </button>
          </div>
        )}

        {error && (
          <div className="w-full rounded-xl bg-rose-500/10 ring-1 ring-rose-500/25 px-4 py-3 text-center animate-fade-up">
            <p className="font-mono text-[8.5px] tracking-[0.2em] uppercase text-rose-400">{error}</p>
          </div>
        )}

        {/* ── Bottom feature tags ── */}
        <div className="flex items-center gap-2 flex-wrap justify-center pt-1 animate-fade-up delay-400">
          {["AI PSL Scoring", "Real-time scan", "Multiplayer"].map(tag => (
            <span key={tag} className="font-mono text-[6.5px] tracking-[0.25em] uppercase text-white/20
              px-2.5 py-1 rounded-full ring-1 ring-white/8 bg-white/[0.02]">
              {tag}
            </span>
          ))}
        </div>
      </div>
    </main>
  );
}
