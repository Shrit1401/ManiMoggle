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

const MODES: { id: Mode; label: string; sub: string; players: string }[] = [
  { id: "battle",     label: "1v1 BATTLE",     sub: "Split-screen duel",        players: "2 players"   },
  { id: "tournament", label: "TOURNAMENT",      sub: "Bracket · best face wins", players: "2–4 players" },
  { id: "group",      label: "GROUP SCAN",      sub: "All scan · ranked by PSL", players: "2–8 players" },
];

export default function Home() {
  const router    = useRouter();
  const sessionId = useSessionId();
  const [name, setName]      = useLocalStorage("manimoggle_name");
  const [joinCode, setJoinCode] = useState("");
  const [mode, setMode]      = useState<Mode>("tournament");
  const [error, setError]    = useState("");
  const [loading, setLoading] = useState<"create" | "join" | null>(null);

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
    <main className="flex-1 flex flex-col items-center justify-center bg-black min-h-[100dvh] px-5">
      {/* corner brackets */}
      {["top-4 left-4 border-t-2 border-l-2","top-4 right-4 border-t-2 border-r-2",
        "bottom-4 left-4 border-b-2 border-l-2","bottom-4 right-4 border-b-2 border-r-2"].map(c => (
        <span key={c} className={`fixed ${c} w-6 h-6 border-white/15 pointer-events-none`} />
      ))}

      <div className="w-full max-w-sm flex flex-col items-center gap-5">
        {/* logo */}
        <div className="text-center mb-1">
          <div className="flex items-center justify-center gap-2 mb-2">
            <div className="w-6 h-[1px] bg-white/20" />
            <span className="font-mono text-[8px] tracking-[0.4em] uppercase text-white/30">PSL · Face · Arena</span>
            <div className="w-6 h-[1px] bg-white/20" />
          </div>
          <h1 className="font-mono font-black text-[32px] sm:text-[38px] tracking-[0.3em] uppercase text-white leading-none">
            MANIMOGGLE
          </h1>
        </div>

        {/* name */}
        <div className="w-full flex flex-col gap-1.5">
          <label className="font-mono text-[8px] tracking-[0.3em] uppercase text-white/35 pl-1">Your Name</label>
          <input
            value={name}
            onChange={e => setName(e.target.value.toUpperCase().slice(0, 14))}
            onKeyDown={e => { if (e.key === "Enter") handleCreate(); }}
            placeholder="ENTER NAME"
            autoCapitalize="characters"
            className="w-full bg-white/[0.05] ring-1 ring-white/15 rounded-xl px-4 py-3.5 font-mono text-sm
              text-white placeholder:text-white/20 tracking-[0.15em] uppercase outline-none
              focus:ring-white/35 transition-all"
          />
        </div>

        {/* mode selector */}
        <div className="w-full flex flex-col gap-1.5">
          <label className="font-mono text-[8px] tracking-[0.3em] uppercase text-white/35 pl-1">Mode</label>
          <div className="grid grid-cols-3 gap-1.5">
            {MODES.map(m => (
              <button
                key={m.id}
                onClick={() => setMode(m.id)}
                className={`flex flex-col items-center gap-1 rounded-xl px-2 py-3 transition-all
                  ${mode === m.id
                    ? "bg-cyan-500/15 ring-1 ring-cyan-400/40 text-cyan-300"
                    : "bg-white/[0.03] ring-1 ring-white/10 text-white/35 hover:text-white/55 hover:bg-white/[0.06]"
                  }`}
              >
                <span className={`font-mono text-[8px] font-bold tracking-[0.1em] uppercase leading-tight text-center
                  ${mode === m.id ? "text-cyan-300" : "text-white/45"}`}>
                  {m.label}
                </span>
                <span className="font-mono text-[6.5px] tracking-wide text-center leading-tight" style={{ color: "rgba(255,255,255,0.22)" }}>
                  {m.players}
                </span>
              </button>
            ))}
          </div>
          <p className="font-mono text-[7px] tracking-widest text-white/20 pl-1 text-center">
            {MODES.find(m => m.id === mode)?.sub}
          </p>
        </div>

        {/* create */}
        <button
          onClick={handleCreate}
          disabled={!name.trim() || !sessionId || !!loading}
          className="w-full rounded-full py-4 font-mono text-[11px] tracking-[0.28em] uppercase transition-all
            bg-cyan-500/20 hover:bg-cyan-500/30 active:scale-[0.98] ring-1 ring-cyan-400/35 text-cyan-300
            disabled:opacity-25 disabled:cursor-not-allowed disabled:active:scale-100
            shadow-[0_0_30px_rgba(34,211,238,0.07)]"
        >
          {loading === "create" ? "Creating…" : "Create Room"}
        </button>

        {/* divider */}
        <div className="flex items-center gap-3 w-full">
          <div className="flex-1 h-px bg-white/8" />
          <span className="font-mono text-[8px] tracking-[0.3em] uppercase text-white/20">or join</span>
          <div className="flex-1 h-px bg-white/8" />
        </div>

        {/* join */}
        <div className="w-full flex gap-2">
          <input
            value={joinCode}
            onChange={e => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))}
            onKeyDown={e => { if (e.key === "Enter") handleJoin(); }}
            placeholder="ABC123"
            autoCapitalize="characters"
            className="flex-1 bg-white/[0.05] ring-1 ring-white/15 rounded-xl px-4 py-3.5 font-mono text-sm
              text-white placeholder:text-white/20 tracking-[0.3em] uppercase outline-none
              focus:ring-white/35 transition-all"
          />
          <button
            onClick={handleJoin}
            disabled={!name.trim() || joinCode.length < 6 || !sessionId || !!loading}
            className="rounded-xl bg-white/[0.07] hover:bg-white/[0.13] active:scale-[0.97] ring-1 ring-white/15
              px-5 font-mono text-[11px] tracking-[0.18em] uppercase text-white transition-all
              disabled:opacity-25 disabled:cursor-not-allowed disabled:active:scale-100"
          >
            {loading === "join" ? "···" : "Join"}
          </button>
        </div>

        {error && (
          <p className="font-mono text-[9px] tracking-[0.2em] uppercase text-rose-400 -mt-2">{error}</p>
        )}
      </div>
    </main>
  );
}
