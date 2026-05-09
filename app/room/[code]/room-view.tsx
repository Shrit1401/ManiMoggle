"use client";

import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { RoomScanView } from "../../scan/room-scan-view";

type RoomData = NonNullable<ReturnType<typeof useQuery<typeof api.rooms.getByCode>>>;
type Player   = RoomData["players"][number];

function useSessionId() {
  const [id, setId] = useState("");
  useEffect(() => {
    let s = localStorage.getItem("manimoggle_session");
    if (!s) { s = crypto.randomUUID(); localStorage.setItem("manimoggle_session", s); }
    setId(s);
  }, []);
  return id;
}

function useStoredName() {
  const [name, setNameState] = useState("");
  useEffect(() => { setNameState(localStorage.getItem("manimoggle_name") ?? ""); }, []);
  const setName = (n: string) => { localStorage.setItem("manimoggle_name", n); setNameState(n); };
  return [name, setName] as const;
}

// ─── Fighter card (responsive: stacks vertically on mobile) ──────────────────

function FighterCard({
  player, isMe, isWinner, isLoser, settled, onScan,
}: {
  player: Player | null;
  isMe: boolean;
  isWinner: boolean;
  isLoser: boolean;
  settled: boolean;
  onScan?: () => void;
}) {
  if (!player) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 rounded-2xl
        bg-white/[0.025] ring-1 ring-dashed ring-white/10 p-5 min-h-[180px] sm:min-h-[220px]">
        <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full border-2 border-dashed border-white/12
          flex items-center justify-center text-white/15 text-xl">
          ?
        </div>
        <p className="font-mono text-[8px] tracking-[0.28em] uppercase text-white/20">Waiting for opponent</p>
      </div>
    );
  }

  const done     = player.phase === "done";
  const scanning = player.phase === "scanning";
  const wins     = player.wins ?? 0;
  const losses   = player.losses ?? 0;

  return (
    <div className={`flex-1 flex flex-col items-center gap-2.5 rounded-2xl p-4 sm:p-5 transition-all min-h-[180px] sm:min-h-[220px]
      ${isWinner && settled
        ? "bg-amber-400/[0.06] ring-2 ring-amber-400/35 shadow-[0_0_40px_rgba(251,191,36,0.10)]"
        : isLoser && settled
        ? "bg-white/[0.015] ring-1 ring-white/8 opacity-55"
        : isMe
        ? "bg-cyan-500/[0.04] ring-1 ring-cyan-400/20"
        : "bg-white/[0.04] ring-1 ring-white/10"}`}
    >
      {/* crown */}
      {isWinner && settled && (
        <span className="text-base leading-none">👑</span>
      )}

      {/* avatar */}
      <div className={`w-12 h-12 sm:w-14 sm:h-14 rounded-full ring-2 flex items-center justify-center
        font-mono text-lg font-bold text-white shrink-0
        ${isWinner && settled ? "bg-amber-400/20 ring-amber-400/45"
          : isMe ? "bg-cyan-500/20 ring-cyan-400/35"
          : "bg-white/8 ring-white/18"}`}
      >
        {player.name.charAt(0)}
      </div>

      {/* name + record */}
      <div className="text-center leading-tight">
        <p className={`font-sans font-bold text-[13px] sm:text-[14px] tracking-[0.1em] uppercase
          ${isMe ? "text-cyan-300" : "text-white"}`}>
          {player.name}
        </p>
        <p className="font-mono text-[8px] tracking-widest text-white/25 mt-0.5">
          {wins}W · {losses}L
        </p>
      </div>

      {/* score or status */}
      {done ? (
        <div className="flex flex-col items-center gap-0.5 mt-0.5">
          <span className="font-sans font-black text-[32px] sm:text-[38px] text-white tabular-nums leading-none">
            {player.overall?.toFixed(1)}
          </span>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px]" style={{ color: player.tierColor ?? "#9ca3af" }}>★</span>
            <span className="font-mono text-[8px] tracking-widest text-white/45 uppercase">
              {player.tierCode} · {player.level}
            </span>
          </div>
          <p className="font-mono text-[7px] sm:text-[8px] tracking-wider text-emerald-400/75 text-center mt-1 leading-tight">
            {player.domLabel}
          </p>
          <p className="font-mono text-[7px] sm:text-[8px] tracking-wider text-rose-400/65 text-center leading-tight">
            {player.flawLabel}
          </p>
        </div>
      ) : scanning ? (
        <div className="flex items-center gap-1.5 mt-1">
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping shrink-0" />
          <span className="font-mono text-[8px] tracking-widest uppercase text-cyan-400">Scanning…</span>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2 mt-1">
          <span className="font-mono text-[8px] tracking-widest uppercase text-white/25">Ready</span>
          {isMe && !settled && onScan && (
            <button
              onClick={onScan}
              className="rounded-full bg-cyan-500/20 hover:bg-cyan-500/35 active:scale-[0.97]
                ring-1 ring-cyan-400/40 px-4 py-2 font-mono text-[9px] tracking-[0.22em]
                uppercase text-cyan-300 transition-all"
            >
              Start Scan
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Queue / spectator row ────────────────────────────────────────────────────

function QueueRow({
  player, isMe, settled, onChallenge,
}: {
  player: Player;
  isMe: boolean;
  settled: boolean;
  onChallenge?: () => void;
}) {
  const wins   = player.wins ?? 0;
  const losses = player.losses ?? 0;
  return (
    <div className={`flex items-center gap-3 px-3 sm:px-4 py-3 rounded-xl transition-colors
      ${isMe ? "bg-white/[0.05] ring-1 ring-white/12" : "bg-white/[0.02]"}`}>
      <div className="w-8 h-8 rounded-full bg-white/8 ring-1 ring-white/15 flex items-center justify-center
        font-mono text-[11px] text-white/55 shrink-0">
        {player.name.charAt(0)}
      </div>
      <div className="flex-1 min-w-0">
        <span className={`font-sans font-semibold text-[12px] tracking-[0.08em] uppercase
          ${isMe ? "text-cyan-300" : "text-white/65"}`}>
          {player.name}
        </span>
        <span className="font-mono text-[8px] text-white/22 ml-1.5">{wins}W {losses}L</span>
      </div>
      {settled && isMe && onChallenge ? (
        <button
          onClick={onChallenge}
          className="rounded-full bg-amber-400/15 hover:bg-amber-400/25 active:scale-[0.97]
            ring-1 ring-amber-400/30 px-3 py-1.5 font-mono text-[8px] tracking-widest
            uppercase text-amber-300 transition-all shrink-0"
        >
          Challenge
        </button>
      ) : (
        <span className="font-mono text-[7px] tracking-widest uppercase text-white/18 shrink-0">
          {settled ? "Queue" : "Watching"}
        </span>
      )}
    </div>
  );
}

// ─── Name prompt ──────────────────────────────────────────────────────────────

function NamePrompt({ code, onDone }: { code: string; onDone: (n: string) => void }) {
  const [val, setVal] = useState("");
  return (
    <div className="flex-1 flex flex-col items-center justify-center bg-black min-h-[100dvh] gap-5 px-5">
      <p className="font-mono text-[8px] tracking-[0.3em] uppercase text-white/30">
        Room · {code}
      </p>
      <h2 className="font-mono font-bold text-[20px] tracking-[0.18em] uppercase text-white">
        Enter your name
      </h2>
      <input
        autoFocus
        value={val}
        onChange={e => setVal(e.target.value.toUpperCase().slice(0, 14))}
        onKeyDown={e => { if (e.key === "Enter" && val.trim()) onDone(val.trim()); }}
        placeholder="YOUR NAME"
        autoCapitalize="characters"
        className="bg-white/[0.05] ring-1 ring-white/18 rounded-xl px-4 py-3.5 font-mono text-sm
          text-white placeholder:text-white/20 tracking-widest uppercase outline-none
          focus:ring-white/35 transition-all w-full max-w-xs"
      />
      <button
        onClick={() => { if (val.trim()) onDone(val.trim()); }}
        disabled={!val.trim()}
        className="rounded-full bg-cyan-500/20 hover:bg-cyan-500/30 ring-1 ring-cyan-400/35
          px-8 py-3.5 font-mono text-[11px] tracking-[0.25em] uppercase text-cyan-300 disabled:opacity-25"
      >
        Enter Arena
      </button>
    </div>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export function RoomView({ code }: { code: string }) {
  const router       = useRouter();
  const sessionId    = useSessionId();
  const [name, setName] = useStoredName();
  const [scanning, setScanning]   = useState(false);
  const [copied, setCopied]       = useState(false);
  const joinCalled     = useRef(false);
  const settleCalled   = useRef(false);

  const room              = useQuery(api.rooms.getByCode, { code });
  const joinMutation      = useMutation(api.rooms.join);
  const setPhaseMutation  = useMutation(api.players.setPhase);
  const settleMutation    = useMutation(api.rooms.settleBattle);
  const rematchMutation   = useMutation(api.rooms.rematch);
  const challengeMutation = useMutation(api.rooms.challenge);

  useEffect(() => {
    if (!sessionId || !name || joinCalled.current) return;
    joinCalled.current = true;
    joinMutation({ code, sessionId, name }).catch(() => {});
  }, [sessionId, name, code, joinMutation]);

  // Auto-settle when both fighters done
  useEffect(() => {
    if (!room || settleCalled.current || room.battleSettled === true) return;
    const fA = room.players.find(p => p.sessionId === room.fighterA);
    const fB = room.players.find(p => p.sessionId === room.fighterB);
    if (fA?.phase === "done" && fB?.phase === "done") {
      settleCalled.current = true;
      void settleMutation({ roomId: room._id as Id<"rooms"> }).finally(() => {
        settleCalled.current = false;
      });
    }
  }, [room, settleMutation]);

  const myPlayer = room?.players.find(p => p.sessionId === sessionId);
  const fA       = room?.players.find(p => p.sessionId === room?.fighterA) ?? null;
  const fB       = room?.players.find(p => p.sessionId === room?.fighterB) ?? null;
  const queue    = room?.players.filter(p =>
    p.sessionId !== room?.fighterA && p.sessionId !== room?.fighterB
  ) ?? [];

  const settled  = room?.battleSettled === true;
  const bothDone = fA?.phase === "done" && fB?.phase === "done";
  const winner   = settled && bothDone && fA && fB
    ? ((fA.overall ?? 0) >= (fB.overall ?? 0) ? fA : fB) : null;
  const loser    = winner ? (winner.sessionId === fA?.sessionId ? fB : fA) : null;

  const iAmFighterA = sessionId === room?.fighterA;
  const iAmFighterB = sessionId === room?.fighterB;
  const iAmFighter  = iAmFighterA || iAmFighterB;

  const handleStartScan = () => {
    if (!room || !sessionId) return;
    void setPhaseMutation({ roomId: room._id as Id<"rooms">, sessionId, phase: "scanning" });
    setScanning(true);
  };

  const handleRematch = () => {
    if (!room) return;
    void rematchMutation({ roomId: room._id as Id<"rooms"> });
  };

  const handleChallenge = () => {
    if (!room || !sessionId) return;
    void challengeMutation({ roomId: room._id as Id<"rooms">, challengerSessionId: sessionId });
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(code).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  // ── Guards ──────────────────────────────────────────────────────────────────
  if (sessionId && !name) {
    return <NamePrompt code={code} onDone={n => { setName(n); joinCalled.current = false; }} />;
  }

  if (scanning && room) {
    return (
      <RoomScanView
        roomId={room._id as Id<"rooms">}
        sessionId={sessionId}
        playerName={name}
        onDone={() => setScanning(false)}
      />
    );
  }

  if (!room || !sessionId) {
    return (
      <div className="flex-1 flex items-center justify-center bg-black min-h-[100dvh]">
        <div className="w-7 h-7 rounded-full border-2 border-white/15 border-t-white/60 animate-spin" />
      </div>
    );
  }

  if (room === null) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-black min-h-[100dvh] gap-4">
        <p className="font-mono text-[10px] tracking-[0.25em] uppercase text-white/45">Room not found</p>
        <button onClick={() => router.push("/")}
          className="font-mono text-[10px] tracking-widest uppercase text-cyan-400 hover:text-cyan-300">
          ← Back
        </button>
      </div>
    );
  }

  // ── Main render ─────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col bg-black min-h-[100dvh] overflow-hidden">

      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-safe pt-5 pb-3 shrink-0">
        <button onClick={() => router.push("/")}
          className="font-mono text-[8px] tracking-[0.25em] uppercase text-white/28
            hover:text-white/55 transition-colors active:opacity-60 p-1">
          ← Exit
        </button>

        <div className="flex flex-col items-center">
          <span className="font-mono text-[7px] tracking-[0.35em] uppercase text-white/25">
            Battle Room
          </span>
          <button onClick={handleCopy}
            className="flex items-center gap-1.5 font-mono font-bold text-[14px] tracking-[0.3em]
              text-white hover:text-cyan-300 active:opacity-70 transition-colors">
            {code}
            <span className={`text-[8px] font-normal tracking-normal transition-colors
              ${copied ? "text-emerald-400" : "text-white/25"}`}>
              {copied ? "✓" : "copy"}
            </span>
          </button>
        </div>

        <div className="w-10" />
      </div>

      {/* VS arena — vertical stack on mobile, side-by-side on sm+ */}
      <div className="flex-1 flex flex-col px-4 gap-3 overflow-y-auto pb-4">

        {/* Fighter cards */}
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
          <FighterCard
            player={fA}
            isMe={iAmFighterA}
            isWinner={winner?.sessionId === room.fighterA}
            isLoser={loser?.sessionId === room.fighterA}
            settled={settled}
            onScan={iAmFighterA ? handleStartScan : undefined}
          />

          {/* VS divider */}
          <div className="flex sm:flex-col items-center justify-center gap-2 py-1 sm:py-0 sm:w-8">
            <div className="flex-1 sm:flex-none sm:flex-1 h-px sm:h-auto sm:w-px bg-white/8" />
            <span className="font-mono text-[10px] sm:text-[11px] font-bold tracking-widest text-white/35">
              VS
            </span>
            <div className="flex-1 sm:flex-none sm:flex-1 h-px sm:h-auto sm:w-px bg-white/8" />
          </div>

          <FighterCard
            player={fB}
            isMe={iAmFighterB}
            isWinner={winner?.sessionId === room.fighterB}
            isLoser={loser?.sessionId === room.fighterB}
            settled={settled}
            onScan={iAmFighterB ? handleStartScan : undefined}
          />
        </div>

        {/* Share nudge when waiting for opponent */}
        {!fB && (
          <div className="flex flex-col items-center gap-1.5 py-2">
            <p className="font-mono text-[8px] tracking-[0.25em] uppercase text-white/28">
              Share the code to start
            </p>
            <button onClick={handleCopy}
              className="font-mono text-[12px] font-bold tracking-[0.35em] text-cyan-400/70
                hover:text-cyan-400 transition-colors">
              {code}
            </button>
          </div>
        )}

        {/* Winner banner */}
        {settled && winner && (
          <div className="flex flex-col items-center gap-0.5 py-2">
            <p className="font-mono text-[7px] tracking-[0.4em] uppercase text-amber-400/55">
              Winner
            </p>
            <p className="font-sans font-black text-[20px] sm:text-[24px] tracking-[0.12em] uppercase text-amber-400">
              {winner.name}
            </p>
          </div>
        )}

        {/* Battle actions */}
        {settled && (
          <div className="flex gap-2">
            {iAmFighter && (
              <button onClick={handleRematch}
                className="flex-1 rounded-full bg-white/8 hover:bg-white/14 active:scale-[0.98]
                  ring-1 ring-white/15 py-3.5 font-mono text-[10px] tracking-[0.22em]
                  uppercase text-white transition-all">
                Rematch
              </button>
            )}
            {!iAmFighter && myPlayer && (
              <button onClick={handleChallenge}
                className="flex-1 rounded-full bg-amber-400/15 hover:bg-amber-400/22 active:scale-[0.98]
                  ring-1 ring-amber-400/30 py-3.5 font-mono text-[10px] tracking-[0.22em]
                  uppercase text-amber-300 transition-all">
                Challenge Winner
              </button>
            )}
            <button onClick={() => router.push("/")}
              className="rounded-full bg-white/[0.03] hover:bg-white/8 active:scale-[0.97]
                ring-1 ring-white/10 px-4 py-3.5 font-mono text-[10px] tracking-[0.18em]
                uppercase text-white/38 transition-all">
              Exit
            </button>
          </div>
        )}

        {/* Queue */}
        {queue.length > 0 && (
          <div className="flex flex-col gap-1.5 pt-1">
            <p className="font-mono text-[7px] tracking-[0.3em] uppercase text-white/22 px-1">
              {settled ? "Next up" : "Spectating"} · {queue.length}
            </p>
            {queue.map(p => (
              <QueueRow
                key={p._id}
                player={p}
                isMe={p.sessionId === sessionId}
                settled={settled}
                onChallenge={p.sessionId === sessionId ? handleChallenge : undefined}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
