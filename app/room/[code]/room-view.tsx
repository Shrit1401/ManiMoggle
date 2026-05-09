"use client";

import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { RoomScanView, type OpponentData } from "../../scan/room-scan-view";
import { useFaceLandmarker } from "../../scan/use-face-landmarker";
import { useWebRTCGroup } from "../../scan/use-webrtc-group";

type RoomData = NonNullable<ReturnType<typeof useQuery<typeof api.rooms.getByCode>>>;
type Player   = RoomData["players"][number];

type TMatch  = { a: string | null; b: string | null; winner: string | null; aScore: number | null; bScore: number | null };
type Bracket = { players: string[]; rounds: TMatch[][]; currentRound: number; champion: string | null };

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

// ─── Shared helpers ───────────────────────────────────────────────────────────

function playerName(players: Player[], sessionId: string | null) {
  return players.find(p => p.sessionId === sessionId)?.name ?? "?";
}

function opponentData(players: Player[], sessionId: string | null): OpponentData | null {
  const p = players.find(pl => pl.sessionId === sessionId);
  if (!p) return null;
  return {
    name: p.name, phase: p.phase,
    overall: p.overall, elo: p.elo, sub: p.sub,
    tierCode: p.tierCode, tierColor: p.tierColor, level: p.level,
    domLabel: p.domLabel, flawLabel: p.flawLabel,
    wins: p.wins ?? 0, losses: p.losses ?? 0,
  };
}

function CopyCodeRow({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(code).catch(() => {}); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      className="flex items-center gap-1.5 font-mono font-bold text-[14px] tracking-[0.3em]
        text-white hover:text-cyan-300 active:opacity-70 transition-colors">
      {code}
      <span className={`text-[8px] font-normal tracking-normal transition-colors ${copied ? "text-emerald-400" : "text-white/25"}`}>
        {copied ? "✓" : "copy"}
      </span>
    </button>
  );
}

// ─── Name prompt ──────────────────────────────────────────────────────────────

function NamePrompt({ code, onDone }: { code: string; onDone: (n: string) => void }) {
  const [val, setVal] = useState("");
  return (
    <div className="flex-1 flex flex-col items-center justify-center bg-black min-h-[100dvh] gap-5 px-5">
      <p className="font-mono text-[8px] tracking-[0.3em] uppercase text-white/30">Room · {code}</p>
      <h2 className="font-mono font-bold text-[20px] tracking-[0.18em] uppercase text-white">Enter your name</h2>
      <input
        autoFocus value={val}
        onChange={e => setVal(e.target.value.toUpperCase().slice(0, 14))}
        onKeyDown={e => { if (e.key === "Enter" && val.trim()) onDone(val.trim()); }}
        placeholder="YOUR NAME" autoCapitalize="characters"
        className="bg-white/[0.05] ring-1 ring-white/18 rounded-xl px-4 py-3.5 font-mono text-sm
          text-white placeholder:text-white/20 tracking-widest uppercase outline-none
          focus:ring-white/35 transition-all w-full max-w-xs"
      />
      <button onClick={() => { if (val.trim()) onDone(val.trim()); }} disabled={!val.trim()}
        className="rounded-full bg-cyan-500/20 hover:bg-cyan-500/30 ring-1 ring-cyan-400/35
          px-8 py-3.5 font-mono text-[11px] tracking-[0.25em] uppercase text-cyan-300 disabled:opacity-25">
        Enter Arena
      </button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// BATTLE MODE (1v1 split-screen)
// ═══════════════════════════════════════════════════════════════════════════════

function BattleView({ room, sessionId, name, onStartScan }: {
  room: RoomData; sessionId: string; name: string; onStartScan: () => void;
}) {
  const router          = useRouter();
  const settleMutation  = useMutation(api.rooms.settleBattle);
  const rematchMutation = useMutation(api.rooms.rematch);
  const challengeMutation = useMutation(api.rooms.challenge);
  const settleCalled    = useRef(false);
  const [copied, setCopied] = useState(false);

  const players  = room.players;
  const fA = players.find(p => p.sessionId === room.fighterA) ?? null;
  const fB = players.find(p => p.sessionId === room.fighterB) ?? null;
  const queue = players.filter(p => p.sessionId !== room.fighterA && p.sessionId !== room.fighterB);
  const settled  = room.battleSettled === true;
  const bothDone = fA?.phase === "done" && fB?.phase === "done";
  const winner   = settled && bothDone && fA && fB
    ? ((fA.overall ?? 0) >= (fB.overall ?? 0) ? fA : fB) : null;
  const loser    = winner ? (winner.sessionId === fA?.sessionId ? fB : fA) : null;
  const iAmFA    = sessionId === room.fighterA;
  const iAmFB    = sessionId === room.fighterB;
  const iAmFighter = iAmFA || iAmFB;

  useEffect(() => {
    if (!room || settleCalled.current || room.battleSettled === true) return;
    if (fA?.phase === "done" && fB?.phase === "done") {
      settleCalled.current = true;
      void settleMutation({ roomId: room._id as Id<"rooms"> }).finally(() => { settleCalled.current = false; });
    }
  }, [room, fA, fB, settleMutation]);

  const FighterCard = ({ player, isMe, isWin, isLose }: { player: Player | null; isMe: boolean; isWin: boolean; isLose: boolean }) => {
    if (!player) return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 rounded-2xl
        bg-white/[0.025] ring-1 ring-dashed ring-white/10 p-5 min-h-[180px]">
        <div className="w-12 h-12 rounded-full border-2 border-dashed border-white/12
          flex items-center justify-center text-white/15 text-xl">?</div>
        <p className="font-mono text-[8px] tracking-[0.28em] uppercase text-white/20">Waiting…</p>
      </div>
    );
    const done = player.phase === "done"; const scanning = player.phase === "scanning";
    return (
      <div className={`flex-1 flex flex-col items-center gap-2.5 rounded-2xl p-4 transition-all min-h-[180px]
        ${isWin && settled ? "bg-amber-400/[0.06] ring-2 ring-amber-400/35"
          : isLose && settled ? "bg-white/[0.015] ring-1 ring-white/8 opacity-55"
          : isMe ? "bg-cyan-500/[0.04] ring-1 ring-cyan-400/20" : "bg-white/[0.04] ring-1 ring-white/10"}`}>
        {isWin && settled && <span className="text-base">👑</span>}
        <div className={`w-12 h-12 rounded-full ring-2 flex items-center justify-center font-mono text-lg font-bold text-white shrink-0
          ${isWin && settled ? "bg-amber-400/20 ring-amber-400/45" : isMe ? "bg-cyan-500/20 ring-cyan-400/35" : "bg-white/8 ring-white/18"}`}>
          {player.name.charAt(0)}
        </div>
        <div className="text-center">
          <p className={`font-sans font-bold text-[13px] tracking-[0.1em] uppercase ${isMe ? "text-cyan-300" : "text-white"}`}>{player.name}</p>
          <p className="font-mono text-[8px] tracking-widest text-white/25">{player.wins ?? 0}W · {player.losses ?? 0}L</p>
        </div>
        {done ? (
          <div className="flex flex-col items-center gap-0.5">
            <span className="font-sans font-black text-[32px] text-white tabular-nums leading-none">{player.overall?.toFixed(1)}</span>
            <span className="font-mono text-[8px] tracking-widest text-white/45 uppercase">{player.tierCode} · {player.level}</span>
            <p className="font-mono text-[7px] tracking-wider text-emerald-400/75 text-center mt-1">{player.domLabel}</p>
            <p className="font-mono text-[7px] tracking-wider text-rose-400/65 text-center">{player.flawLabel}</p>
          </div>
        ) : scanning ? (
          <div className="flex items-center gap-1.5 mt-1">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping shrink-0" />
            <span className="font-mono text-[8px] tracking-widest uppercase text-cyan-400">Scanning…</span>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 mt-1">
            <span className="font-mono text-[8px] tracking-widest uppercase text-white/25">Ready</span>
            {isMe && !settled && (
              <button onClick={onStartScan}
                className="rounded-full bg-cyan-500/20 hover:bg-cyan-500/35 ring-1 ring-cyan-400/40
                  px-4 py-2 font-mono text-[9px] tracking-[0.22em] uppercase text-cyan-300 transition-all">
                Start Scan
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col bg-black min-h-[100dvh] overflow-hidden">
      <div className="flex items-center justify-between px-4 pt-safe pt-5 pb-3 shrink-0">
        <button onClick={() => router.push("/")} className="font-mono text-[8px] tracking-[0.25em] uppercase text-white/28 hover:text-white/55 transition-colors p-1">← Exit</button>
        <div className="flex flex-col items-center">
          <span className="font-mono text-[7px] tracking-[0.35em] uppercase text-white/25">1v1 Battle</span>
          <CopyCodeRow code={room.code} />
        </div>
        <div className="w-10" />
      </div>

      <div className="flex-1 flex flex-col px-4 gap-3 overflow-y-auto pb-4">
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
          <FighterCard player={fA} isMe={iAmFA} isWin={winner?.sessionId === room.fighterA} isLose={loser?.sessionId === room.fighterA} />
          <div className="flex sm:flex-col items-center justify-center gap-2 py-1 sm:py-0 sm:w-8">
            <div className="flex-1 h-px sm:w-px bg-white/8" />
            <span className="font-mono text-[10px] font-bold tracking-widest text-white/35">VS</span>
            <div className="flex-1 h-px sm:w-px bg-white/8" />
          </div>
          <FighterCard player={fB} isMe={iAmFB} isWin={winner?.sessionId === room.fighterB} isLose={loser?.sessionId === room.fighterB} />
        </div>

        {!fB && (
          <div className="flex flex-col items-center gap-1.5 py-2">
            <p className="font-mono text-[8px] tracking-[0.25em] uppercase text-white/28">Share to challenge</p>
            <CopyCodeRow code={room.code} />
          </div>
        )}

        {settled && winner && (
          <div className="flex flex-col items-center gap-0.5 py-2">
            <p className="font-mono text-[7px] tracking-[0.4em] uppercase text-amber-400/55">Winner</p>
            <p className="font-sans font-black text-[20px] tracking-[0.12em] uppercase text-amber-400">{winner.name}</p>
          </div>
        )}

        {settled && (
          <div className="flex gap-2">
            {iAmFighter && (
              <button onClick={() => rematchMutation({ roomId: room._id as Id<"rooms"> })}
                className="flex-1 rounded-full bg-white/8 hover:bg-white/14 ring-1 ring-white/15
                  py-3.5 font-mono text-[10px] tracking-[0.22em] uppercase text-white transition-all">
                Rematch
              </button>
            )}
            {!iAmFighter && players.find(p => p.sessionId === sessionId) && (
              <button onClick={() => challengeMutation({ roomId: room._id as Id<"rooms">, challengerSessionId: sessionId })}
                className="flex-1 rounded-full bg-amber-400/15 hover:bg-amber-400/22 ring-1 ring-amber-400/30
                  py-3.5 font-mono text-[10px] tracking-[0.22em] uppercase text-amber-300 transition-all">
                Challenge Winner
              </button>
            )}
            <button onClick={() => router.push("/")}
              className="rounded-full bg-white/[0.03] hover:bg-white/8 ring-1 ring-white/10
                px-4 py-3.5 font-mono text-[10px] tracking-[0.18em] uppercase text-white/38 transition-all">
              Exit
            </button>
          </div>
        )}

        {queue.length > 0 && (
          <div className="flex flex-col gap-1.5 pt-1">
            <p className="font-mono text-[7px] tracking-[0.3em] uppercase text-white/22 px-1">
              {settled ? "Next up" : "Spectating"} · {queue.length}
            </p>
            {queue.map(p => (
              <div key={p._id} className={`flex items-center gap-3 px-3 py-3 rounded-xl
                ${p.sessionId === sessionId ? "bg-white/[0.05] ring-1 ring-white/12" : "bg-white/[0.02]"}`}>
                <div className="w-8 h-8 rounded-full bg-white/8 ring-1 ring-white/15
                  flex items-center justify-center font-mono text-[11px] text-white/55 shrink-0">
                  {p.name.charAt(0)}
                </div>
                <span className={`font-sans font-semibold text-[12px] tracking-[0.08em] uppercase flex-1
                  ${p.sessionId === sessionId ? "text-cyan-300" : "text-white/65"}`}>{p.name}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TOURNAMENT MODE
// ═══════════════════════════════════════════════════════════════════════════════

function MatchCard({
  match, players, sessionId, round, onScan,
}: {
  match: TMatch; players: Player[]; sessionId: string; round: number; onScan: () => void;
}) {
  const aName    = playerName(players, match.a);
  const bName    = playerName(players, match.b ?? null);
  const aPlayer  = players.find(p => p.sessionId === match.a);
  const bPlayer  = players.find(p => p.sessionId === match.b);
  const isMe     = match.a === sessionId || match.b === sessionId;
  const settled  = match.winner !== null;
  const isBye    = match.b === null;
  const isNullNull = !match.a && !match.b;

  if (isNullNull) return null; // skip phantom matches

  const renderSlot = (sid: string | null, score: number | null, side: "a" | "b") => {
    const pl = players.find(p => p.sessionId === sid);
    const isWinner = match.winner === sid;
    const isScanning = pl?.phase === "scanning";
    const isDone = pl?.phase === "done";
    return (
      <div className={`flex-1 flex flex-col items-center gap-1 py-2 px-2 rounded-xl transition-all
        ${isWinner && settled ? "bg-amber-400/10 ring-1 ring-amber-400/30"
          : settled && !isWinner ? "opacity-40"
          : sid === sessionId ? "bg-cyan-500/10 ring-1 ring-cyan-400/20"
          : "bg-white/[0.03]"}`}>
        <div className="w-8 h-8 rounded-full bg-white/10 ring-1 ring-white/20
          flex items-center justify-center font-mono text-[11px] font-bold text-white">
          {sid ? (sid === sessionId ? "YOU" : (pl?.name.charAt(0) ?? "?")) : "—"}
        </div>
        <p className={`font-mono text-[9px] tracking-[0.08em] font-bold uppercase truncate max-w-[70px] text-center
          ${sid === sessionId ? "text-cyan-300" : "text-white"}`}>
          {sid ? (sid === sessionId ? "YOU" : pl?.name ?? "?") : "TBD"}
        </p>
        {settled && score !== null ? (
          <span className={`font-sans font-black text-[18px] tabular-nums leading-none
            ${isWinner ? "text-amber-400" : "text-white/40"}`}>
            {score.toFixed(1)}
          </span>
        ) : isScanning ? (
          <div className="flex items-center gap-1">
            <span className="w-1 h-1 rounded-full bg-cyan-400 animate-ping" />
            <span className="font-mono text-[7px] text-cyan-400 uppercase">scanning</span>
          </div>
        ) : isDone ? (
          <span className="font-sans font-bold text-[14px] text-white/60">{pl?.overall?.toFixed(1)}</span>
        ) : (
          <span className="font-mono text-[7px] text-white/25 uppercase">ready</span>
        )}
        {isWinner && settled && <span className="text-[10px]">👑</span>}
      </div>
    );
  };

  return (
    <div className={`flex flex-col gap-2 rounded-2xl p-3 transition-all
      ${isMe && !settled ? "bg-white/[0.05] ring-1 ring-white/15" : "bg-white/[0.025] ring-1 ring-white/8"}`}>
      <div className="flex items-center gap-2">
        {renderSlot(match.a, match.aScore, "a")}
        <div className="flex flex-col items-center gap-0.5 shrink-0">
          {isBye ? (
            <span className="font-mono text-[7px] tracking-widest uppercase text-white/25">BYE</span>
          ) : (
            <span className="font-mono text-[8px] font-bold text-white/35">VS</span>
          )}
        </div>
        {!isBye && renderSlot(match.b, match.bScore, "b")}
        {isBye && (
          <div className="flex-1 flex items-center justify-center">
            <span className="font-mono text-[7px] uppercase text-white/20">Auto-advance</span>
          </div>
        )}
      </div>
      {isMe && !settled && !isBye && (
        <button
          onClick={onScan}
          className="w-full rounded-full bg-cyan-500/20 hover:bg-cyan-500/35 active:scale-[0.97]
            ring-1 ring-cyan-400/40 py-2.5 font-mono text-[9px] tracking-[0.22em]
            uppercase text-cyan-300 transition-all">
          Start Scan
        </button>
      )}
    </div>
  );
}

function TournamentView({ room, sessionId, name, onStartScan }: {
  room: RoomData; sessionId: string; name: string;
  onStartScan: (opponentSessionId: string | null) => void;
}) {
  const router              = useRouter();
  const startTournament     = useMutation(api.rooms.startTournament);
  const resetTournament     = useMutation(api.rooms.resetTournament);
  const advanceMutation     = useMutation(api.rooms.advanceTournamentBracket);
  const setPhaseMutation    = useMutation(api.players.setPhase);
  const advanceCalled       = useRef(false);

  const players  = room.players;
  const isHost   = room.hostSessionId === sessionId;
  const status   = room.tournamentStatus ?? "lobby";
  const bracket: Bracket | null = room.tournamentBracket ? JSON.parse(room.tournamentBracket) : null;

  // Auto-advance bracket when matches complete
  useEffect(() => {
    if (!bracket || status !== "running") return;
    const currentRound = bracket.rounds[bracket.currentRound];
    const realMatches  = currentRound.filter(m => m.a && m.b);
    const anyResolvable = realMatches.some(m => {
      if (m.winner !== null) return false;
      const pA = players.find(p => p.sessionId === m.a);
      const pB = players.find(p => p.sessionId === m.b);
      return pA?.phase === "done" && pB?.phase === "done";
    });
    if (anyResolvable && !advanceCalled.current) {
      advanceCalled.current = true;
      void advanceMutation({ roomId: room._id as Id<"rooms"> }).finally(() => { advanceCalled.current = false; });
    }
  }, [room, bracket, status, players, advanceMutation]);

  // Find my current match
  const myMatch = bracket?.rounds[bracket.currentRound]?.find(
    m => (m.a === sessionId || m.b === sessionId) && m.winner === null && m.b !== null
  ) ?? null;

  const myOpponentId = myMatch
    ? (myMatch.a === sessionId ? myMatch.b : myMatch.a)
    : null;

  const handleScan = () => {
    void setPhaseMutation({ roomId: room._id as Id<"rooms">, sessionId, phase: "scanning" });
    onStartScan(myOpponentId);
  };

  // ── Lobby ──────────────────────────────────────────────────────────────────
  if (status === "lobby") {
    return (
      <div className="flex flex-col bg-black min-h-[100dvh] overflow-hidden">
        <div className="flex items-center justify-between px-4 pt-safe pt-5 pb-3 shrink-0">
          <button onClick={() => router.push("/")} className="font-mono text-[8px] tracking-[0.25em] uppercase text-white/28 hover:text-white/55 p-1">← Exit</button>
          <div className="flex flex-col items-center">
            <span className="font-mono text-[7px] tracking-[0.35em] uppercase text-white/25">Tournament</span>
            <CopyCodeRow code={room.code} />
          </div>
          <div className="w-10" />
        </div>

        <div className="flex-1 flex flex-col px-4 pb-6 gap-4 overflow-y-auto">
          <div className="flex flex-col items-center gap-1 pt-4">
            <p className="font-mono text-[7px] tracking-[0.35em] uppercase text-white/30">
              {players.length} / 32 players
            </p>
            <p className="font-mono text-[8px] tracking-widest uppercase text-white/20">
              Waiting for players · share code
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            {players.map((p, i) => (
              <div key={p._id} className={`flex items-center gap-3 px-3 py-3 rounded-xl
                ${p.sessionId === sessionId ? "bg-white/[0.06] ring-1 ring-white/15" : "bg-white/[0.025] ring-1 ring-white/8"}`}>
                <span className="font-mono text-[8px] text-white/25 w-4 shrink-0">{i + 1}</span>
                <div className="w-8 h-8 rounded-full bg-white/10 ring-1 ring-white/20
                  flex items-center justify-center font-mono text-[11px] font-bold text-white shrink-0">
                  {p.name.charAt(0)}
                </div>
                <span className={`font-sans font-semibold text-[12px] tracking-[0.08em] uppercase flex-1
                  ${p.sessionId === sessionId ? "text-cyan-300" : "text-white/70"}`}>
                  {p.name}
                  {p.sessionId === room.hostSessionId && (
                    <span className="ml-1.5 font-mono text-[7px] text-white/25 tracking-widest">HOST</span>
                  )}
                </span>
                {p.sessionId === sessionId && (
                  <span className="font-mono text-[7px] tracking-widest uppercase text-cyan-400/60">you</span>
                )}
              </div>
            ))}
          </div>

          {isHost ? (
            <button
              onClick={() => startTournament({ roomId: room._id as Id<"rooms"> })}
              disabled={players.length < 2}
              className="w-full rounded-full bg-cyan-500/20 hover:bg-cyan-500/30 active:scale-[0.98]
                ring-1 ring-cyan-400/35 py-4 font-mono text-[11px] tracking-[0.28em]
                uppercase text-cyan-300 transition-all disabled:opacity-25"
            >
              Start Tournament ({players.length} players)
            </button>
          ) : (
            <p className="font-mono text-[8px] tracking-[0.25em] uppercase text-white/25 text-center py-2">
              Waiting for host to start…
            </p>
          )}
        </div>
      </div>
    );
  }

  // ── Complete ───────────────────────────────────────────────────────────────
  if (status === "complete" && bracket) {
    const champion = players.find(p => p.sessionId === bracket.champion);
    return (
      <div className="flex flex-col bg-black min-h-[100dvh] overflow-hidden">
        <div className="flex items-center justify-between px-4 pt-safe pt-5 pb-3 shrink-0">
          <button onClick={() => router.push("/")} className="font-mono text-[8px] tracking-[0.25em] uppercase text-white/28 hover:text-white/55 p-1">← Exit</button>
          <div className="flex flex-col items-center">
            <span className="font-mono text-[7px] tracking-[0.35em] uppercase text-white/25">Tournament · Final</span>
            <CopyCodeRow code={room.code} />
          </div>
          <div className="w-10" />
        </div>

        <div className="flex-1 flex flex-col items-center px-4 pb-6 gap-5 overflow-y-auto">
          <div className="flex flex-col items-center gap-3 py-6">
            <span className="text-5xl">🏆</span>
            <p className="font-mono text-[7px] tracking-[0.45em] uppercase text-amber-400/60">Champion</p>
            <p className="font-sans font-black text-[32px] tracking-[0.12em] uppercase text-amber-400">
              {champion?.name ?? "—"}
            </p>
            {champion?.overall && (
              <p className="font-sans font-bold text-[22px] text-white/70 tabular-nums">
                {champion.overall.toFixed(1)} PSL
              </p>
            )}
          </div>

          {/* Bracket summary */}
          <div className="w-full flex flex-col gap-3">
            {bracket.rounds.map((round, ri) => {
              const realMatches = round.filter(m => m.a || m.b);
              if (realMatches.length === 0) return null;
              return (
                <div key={ri} className="flex flex-col gap-2">
                  <p className="font-mono text-[7px] tracking-[0.35em] uppercase text-white/30 px-1">
                    Round {ri + 1}{ri === bracket.rounds.length - 1 ? " · Final" : ""}
                  </p>
                  {realMatches.map((m, mi) => {
                    if (!m.a && !m.b) return null;
                    const aP = players.find(p => p.sessionId === m.a);
                    const bP = players.find(p => p.sessionId === m.b);
                    return (
                      <div key={mi} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/[0.025] ring-1 ring-white/8">
                        <span className={`font-mono text-[9px] font-bold flex-1 uppercase
                          ${m.winner === m.a ? "text-amber-400" : "text-white/40"}`}>
                          {aP?.name ?? "—"}{m.aScore !== null && ` · ${m.aScore.toFixed(1)}`}
                        </span>
                        <span className="font-mono text-[7px] text-white/20">VS</span>
                        <span className={`font-mono text-[9px] font-bold flex-1 text-right uppercase
                          ${m.winner === m.b ? "text-amber-400" : "text-white/40"}`}>
                          {bP?.name ?? "BYE"}{m.bScore !== null && ` · ${m.bScore.toFixed(1)}`}
                        </span>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>

          {isHost && (
            <button
              onClick={() => resetTournament({ roomId: room._id as Id<"rooms"> })}
              className="w-full rounded-full bg-white/8 hover:bg-white/14 ring-1 ring-white/15
                py-3.5 font-mono text-[10px] tracking-[0.22em] uppercase text-white transition-all">
              New Tournament
            </button>
          )}
        </div>
      </div>
    );
  }

  // ── Running ────────────────────────────────────────────────────────────────
  if (!bracket) return null;
  const currentRound = bracket.rounds[bracket.currentRound];
  const visibleMatches = currentRound.filter(m => m.a || m.b);
  const roundLabel = bracket.currentRound === bracket.rounds.length - 1
    ? "Final"
    : bracket.currentRound === bracket.rounds.length - 2
    ? "Semi-Finals"
    : `Round ${bracket.currentRound + 1} of ${bracket.rounds.length}`;

  return (
    <div className="flex flex-col bg-black min-h-[100dvh] overflow-hidden">
      <div className="flex items-center justify-between px-4 pt-safe pt-5 pb-3 shrink-0">
        <button onClick={() => router.push("/")} className="font-mono text-[8px] tracking-[0.25em] uppercase text-white/28 hover:text-white/55 p-1">← Exit</button>
        <div className="flex flex-col items-center">
          <span className="font-mono text-[7px] tracking-[0.35em] uppercase text-white/25">Tournament · {roundLabel}</span>
          <CopyCodeRow code={room.code} />
        </div>
        <div className="w-10" />
      </div>

      <div className="flex-1 flex flex-col px-4 pb-6 gap-3 overflow-y-auto">
        {/* My match prominent at top */}
        {myMatch && (
          <div className="flex flex-col gap-1.5">
            <p className="font-mono text-[7px] tracking-[0.35em] uppercase text-cyan-400/60 px-1">Your Match</p>
            <MatchCard
              match={myMatch}
              players={players}
              sessionId={sessionId}
              round={bracket.currentRound}
              onScan={handleScan}
            />
          </div>
        )}

        {/* Other matches */}
        {visibleMatches.some(m => m !== myMatch && (m.a || m.b)) && (
          <div className="flex flex-col gap-1.5">
            <p className="font-mono text-[7px] tracking-[0.35em] uppercase text-white/25 px-1">
              {roundLabel} · {visibleMatches.filter(m => m.a && m.b).length} matches
            </p>
            {visibleMatches.map((m, i) => {
              if (m === myMatch) return null;
              if (!m.a && !m.b) return null;
              return (
                <MatchCard
                  key={i}
                  match={m}
                  players={players}
                  sessionId={sessionId}
                  round={bracket.currentRound}
                  onScan={handleScan}
                />
              );
            })}
          </div>
        )}

        {/* No active match notice */}
        {!myMatch && (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <p className="font-mono text-[8px] tracking-[0.25em] uppercase text-white/35">
              {players.find(p => p.sessionId === sessionId)?.phase === "done"
                ? "Scan complete — waiting for round to finish"
                : "You are not in this round"}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── RemoteVideo — sets srcObject reactively so WebRTC stream renders ────────

function RemoteVideo({ stream, snapshot, name }: {
  stream: MediaStream | null;
  snapshot?: string;
  name: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);

  if (stream) {
    return (
      <video ref={ref} autoPlay playsInline muted
        className="absolute inset-0 w-full h-full object-cover" />
    );
  }
  if (snapshot) {
    return <img src={snapshot} className="absolute inset-0 w-full h-full object-cover" alt={name} />;
  }
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
      <div className="w-12 h-12 rounded-full bg-white/8 ring-1 ring-white/12
        flex items-center justify-center font-mono text-xl font-bold text-white/25">
        {name.charAt(0)}
      </div>
      <span className="font-mono text-[7px] uppercase tracking-widest text-white/25">Waiting…</span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// GROUP SCAN MODE — camera grid, synchronized scan, snapshot sharing
// ═══════════════════════════════════════════════════════════════════════════════

function GroupScanView({ room, sessionId }: {
  room: RoomData; sessionId: string;
}) {
  const router = useRouter();
  const {
    status, phase, scores, error,
    videoRef, canvasRef, streamRef,
    retry, startScan, resetScan,
    scanProgress, samplesCollected,
  } = useFaceLandmarker();

  const submitScore    = useMutation(api.players.submitScore);
  const setSnapshotMut = useMutation(api.players.setSnapshot);
  const startGroupMut  = useMutation(api.rooms.scheduleGroupScan);
  const resetGroup     = useMutation(api.rooms.resetGroupScan);
  const submittedRef   = useRef(false);

  const [scanStartsAt, setScanStartsAt] = useState<number | null>(null);
  const [countdown, setCountdown]       = useState<number | null>(null);

  const players  = room.players;
  const otherSessionIds = players.filter(p => p.sessionId !== sessionId).map(p => p.sessionId);
  const remoteStreams = useWebRTCGroup(room._id as Id<"rooms">, sessionId, otherSessionIds, streamRef);
  const isHost   = room.hostSessionId === sessionId;
  const started  = !!room.groupStarted;
  const allDone  = players.length >= 1 && players.every(p => p.phase === "done");
  const ranked   = [...players]
    .filter(p => p.phase === "done" && p.overall !== undefined)
    .sort((a, b) => (b.overall ?? 0) - (a.overall ?? 0));

  // Sync server scan timestamp → local state (all clients derive from the same absolute time)
  useEffect(() => {
    if (room.groupScanStartAt) {
      setScanStartsAt(room.groupScanStartAt);
    } else {
      setScanStartsAt(null);
    }
  }, [room.groupScanStartAt]);

  // Tick countdown
  useEffect(() => {
    if (!scanStartsAt) { setCountdown(null); return; }
    const tick = () => {
      const rem = Math.ceil((scanStartsAt - Date.now()) / 1000);
      setCountdown(rem > 0 ? rem : null);
    };
    tick();
    const iv = setInterval(tick, 150);
    return () => clearInterval(iv);
  }, [scanStartsAt]);

  // Fire startScan when countdown expires (re-runs when camera becomes ready too)
  useEffect(() => {
    if (!scanStartsAt || phase !== "live" || status !== "ready") return;
    const delay = scanStartsAt - Date.now();
    if (delay <= 0) { startScan(); return; }
    const t = setTimeout(startScan, delay);
    return () => clearTimeout(t);
  }, [scanStartsAt, phase, status, startScan]);

  // Send snapshots every 1.5 s while camera active
  useEffect(() => {
    if (status !== "ready") return;
    const send = () => {
      const video = videoRef.current;
      if (!video || video.readyState < 2 || video.videoWidth === 0) return;
      const c = document.createElement("canvas");
      c.width = 200; c.height = 150;
      const ctx = c.getContext("2d");
      if (!ctx) return;
      ctx.save(); ctx.scale(-1, 1); ctx.drawImage(video, -200, 0, 200, 150); ctx.restore();
      setSnapshotMut({ roomId: room._id as Id<"rooms">, sessionId, snapshot: c.toDataURL("image/jpeg", 0.3) }).catch(() => {});
    };
    send();
    const iv = setInterval(send, 1500);
    return () => clearInterval(iv);
  }, [status, videoRef, room._id, sessionId, setSnapshotMut]);

  // Auto-submit when scan completes
  useEffect(() => {
    if (phase !== "complete" || !scores || submittedRef.current) return;
    submittedRef.current = true;
    void submitScore({
      roomId: room._id as Id<"rooms">, sessionId,
      overall: scores.overall, elo: scores.elo, sub: scores.sub,
      tierCode: scores.tier.code, tierColor: scores.tier.starColor,
      level: scores.level, domLabel: scores.dom.label, flawLabel: scores.flaw.label,
    });
  }, [phase, scores, room._id, sessionId, submitScore]);

  const rankMedal = (i: number) => ["🥇","🥈","🥉"][i] ?? `#${i + 1}`;

  // Grid: fill screen with no empty cells — dynamic rows + cols
  const n    = players.length;
  const cols = n <= 1 ? 1 : 2;
  const rows = Math.ceil(n / cols);

  return (
    <div className="relative flex flex-col bg-black h-[100dvh] overflow-hidden">

      {/* ── Minimal header ── */}
      <div className="flex items-center justify-between px-4 pt-safe pt-3 pb-2 shrink-0 z-10">
        <button onClick={() => router.push("/")}
          className="font-mono text-[8px] tracking-[0.25em] uppercase text-white/30 hover:text-white/60 transition-colors">
          ← Exit
        </button>
        <CopyCodeRow code={room.code} />
        {isHost && !started && !allDone ? (
          <button
            onClick={() => void startGroupMut({ roomId: room._id as Id<"rooms"> })}
            className="rounded-full px-4 py-2 font-mono text-[9px] tracking-[0.2em] uppercase
              font-bold text-black transition-all active:scale-[0.96]
              bg-gradient-to-r from-cyan-400 to-cyan-500 shadow-[0_0_24px_rgba(34,211,238,0.45)]"
          >
            Start Scan
          </button>
        ) : (
          <div className="w-20" />
        )}
      </div>

      {/* ── Camera grid — fills remaining height perfectly ── */}
      <div
        className="flex-1 min-h-0 grid gap-1 p-1"
        style={{
          gridTemplateColumns: `repeat(${cols}, 1fr)`,
          gridTemplateRows: `repeat(${rows}, 1fr)`,
        }}
      >
        {players.map(p => {
          const isMe      = p.sessionId === sessionId;
          const isDone    = p.phase === "done";
          const isScanning = p.phase === "scanning";
          const myScore   = isDone ? p.overall : undefined;

          return (
            <div key={p._id}
              className={`relative rounded-2xl overflow-hidden bg-neutral-950
                ${isMe ? "ring-2 ring-cyan-400/70" : "ring-1 ring-white/8"}`}>

              {/* ── Background: live camera or snapshot ── */}
              {isMe ? (
                <>
                  <video ref={videoRef} autoPlay muted playsInline
                    className="absolute inset-0 w-full h-full object-cover"
                    style={{ transform: "scaleX(-1)" }}
                  />
                  <canvas ref={canvasRef}
                    className="absolute inset-0 w-full h-full object-cover pointer-events-none"
                    style={{ transform: "scaleX(-1)" }}
                  />
                  {/* Camera loading / error */}
                  {status === "requesting" && (
                    <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center gap-2">
                      <div className="w-7 h-7 rounded-full border-2 border-white/20 border-t-cyan-400 animate-spin" />
                      <span className="font-mono text-[7px] tracking-widest uppercase text-white/30">Camera…</span>
                    </div>
                  )}
                  {(status === "denied" || status === "error" || status === "unsupported") && (
                    <div className="absolute inset-0 bg-black/90 flex flex-col items-center justify-center gap-2 px-3 text-center">
                      <span className="text-2xl">📷</span>
                      <p className="font-mono text-[7px] tracking-widest uppercase text-white/40">
                        {status === "denied" ? "Camera denied" : "Camera error"}
                      </p>
                      {status !== "unsupported" && (
                        <button onClick={retry}
                          className="rounded-full bg-white/10 hover:bg-white/18 px-3 py-1.5
                            font-mono text-[7px] tracking-widest uppercase text-white">
                          Retry
                        </button>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <div className="absolute inset-0 bg-neutral-900">
                  <RemoteVideo
                    stream={remoteStreams[p.sessionId] ?? null}
                    snapshot={p.snapshot}
                    name={p.name}
                  />
                </div>
              )}

              {/* ── Dark gradient at bottom ── */}
              <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/90 via-black/30 to-transparent pointer-events-none" />

              {/* ── Score card (when done) ── */}
              {isDone && myScore !== undefined && (
                <div className="absolute bottom-0 inset-x-0 p-2.5">
                  <div className="flex items-end gap-1.5">
                    <span className="font-sans font-black text-[30px] tabular-nums leading-none text-white">
                      {myScore.toFixed(1)}
                    </span>
                    <div className="mb-1 flex flex-col leading-none">
                      <span className="font-mono text-[8px] font-bold tracking-widest uppercase text-cyan-300">
                        {p.tierCode}
                      </span>
                      <span className="font-mono text-[7px] text-white/40">{p.level}</span>
                    </div>
                  </div>
                  <p className="font-mono text-[7px] text-emerald-300 truncate">{p.domLabel}</p>
                  <p className="font-mono text-[6.5px] text-rose-400/80 truncate">{p.flawLabel}</p>
                </div>
              )}

              {/* ── Status indicators ── */}
              <div className="absolute top-2 inset-x-2 flex items-start justify-between">
                {/* Name */}
                <span className={`font-mono text-[7.5px] font-bold tracking-wider uppercase
                  px-2 py-0.5 rounded-full bg-black/50 backdrop-blur-sm
                  ${isMe ? "text-cyan-300" : "text-white/70"}`}>
                  {isMe ? "YOU" : p.name}
                </span>

                {/* Scan ring for own tile */}
                {isMe && phase === "scanning" && (
                  <svg width="28" height="28" className="rotate-[-90deg] shrink-0">
                    <circle cx="14" cy="14" r="11" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="2.5" />
                    <circle cx="14" cy="14" r="11" fill="none" stroke="#22d3ee" strokeWidth="2.5"
                      strokeDasharray={`${2 * Math.PI * 11 * scanProgress} ${2 * Math.PI * 11}`}
                      strokeLinecap="round" style={{ transition: "stroke-dasharray 0.2s linear" }} />
                  </svg>
                )}

                {/* AI pill for own tile */}
                {isMe && phase === "analyzing" && (
                  <div className="flex items-center gap-1 rounded-full bg-cyan-500/20 ring-1 ring-cyan-400/40 px-2 py-0.5">
                    <span className="w-1 h-1 rounded-full bg-cyan-400 animate-ping" />
                    <span className="font-mono text-[6px] uppercase text-cyan-300">AI</span>
                  </div>
                )}

                {/* Scanning pill for others */}
                {!isMe && isScanning && (
                  <div className="flex items-center gap-1 rounded-full bg-black/50 px-1.5 py-0.5">
                    <span className="w-1 h-1 rounded-full bg-cyan-400 animate-pulse" />
                    <span className="font-mono text-[5.5px] uppercase text-cyan-400">scan</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Countdown overlay ── */}
      {countdown !== null && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 z-30 pointer-events-none">
          <p className="font-mono text-[9px] tracking-[0.5em] uppercase text-white/40 mb-2">Get ready</p>
          <span className="font-mono font-black leading-none text-white tabular-nums"
            style={{ fontSize: "clamp(80px, 20vw, 130px)" }}>
            {countdown}
          </span>
        </div>
      )}

      {/* ── Scanning bar ── */}
      {phase === "scanning" && (
        <div className="absolute bottom-4 inset-x-4 z-10 pointer-events-none">
          <div className="flex items-center gap-2 rounded-full glass px-4 py-2">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping shrink-0" />
            <div className="flex-1 h-[3px] rounded-full bg-white/10 overflow-hidden">
              <div className="h-full bg-cyan-400 rounded-full transition-all duration-200"
                style={{ width: `${scanProgress * 100}%` }} />
            </div>
            <span className="font-mono text-[7px] tracking-widest uppercase text-cyan-300 shrink-0">
              {Math.ceil((1 - scanProgress) * 15)}s
            </span>
          </div>
        </div>
      )}

      {/* ── Waiting pill ── */}
      {!started && !isHost && phase === "live" && !allDone && (
        <div className="absolute bottom-5 inset-x-0 flex justify-center pointer-events-none z-10">
          <div className="glass rounded-full px-4 py-2 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-white/25 animate-pulse shrink-0" />
            <span className="font-mono text-[7px] tracking-[0.25em] uppercase text-white/35">
              Waiting for host…
            </span>
          </div>
        </div>
      )}

      {/* ── Rankings (slide up when all done) ── */}
      {allDone && ranked.length > 0 && (
        <div className="absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black via-black/98 to-transparent pt-24 pb-safe pb-6 px-4">
          <div className="flex flex-col gap-2 max-w-sm mx-auto">
            <p className="font-mono text-[7px] tracking-[0.45em] uppercase text-amber-400/55 text-center mb-0.5">
              ✦ Final Rankings
            </p>
            {ranked.map((p, i) => (
              <div key={p._id} className={`flex items-center gap-3 px-3.5 py-3 rounded-2xl ring-1
                ${i === 0 ? "bg-amber-400/10 ring-amber-400/30"
                  : p.sessionId === sessionId ? "bg-cyan-500/8 ring-cyan-400/20"
                  : "bg-white/[0.04] ring-white/10"}`}>
                <span className="text-base w-5 text-center shrink-0">{rankMedal(i)}</span>
                <div className="w-8 h-8 rounded-full ring-1 ring-white/20 bg-white/8 shrink-0
                  flex items-center justify-center font-mono text-[11px] font-bold text-white">
                  {p.name.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`font-sans font-bold text-[12px] tracking-[0.06em] uppercase truncate
                    ${i === 0 ? "text-amber-400" : p.sessionId === sessionId ? "text-cyan-300" : "text-white/75"}`}>
                    {p.name}
                    {p.sessionId === sessionId && (
                      <span className="ml-1.5 font-mono text-[6.5px] text-white/30 tracking-widest normal-case">you</span>
                    )}
                  </p>
                  <p className="font-mono text-[7px] text-white/30 uppercase truncate">
                    {p.domLabel} · {p.tierCode}
                  </p>
                </div>
                <span className="font-sans font-black text-[22px] text-white tabular-nums shrink-0 leading-none">
                  {p.overall?.toFixed(1)}
                </span>
              </div>
            ))}
            {isHost && (
              <button
                onClick={() => {
                  submittedRef.current = false;
                  resetScan();
                  void resetGroup({ roomId: room._id as Id<"rooms"> });
                }}
                className="mt-2 w-full rounded-full bg-white/8 hover:bg-white/14 ring-1 ring-white/12
                  py-3.5 font-mono text-[10px] tracking-[0.25em] uppercase text-white/80 transition-all">
                Scan Again
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROOT ROOM VIEW
// ═══════════════════════════════════════════════════════════════════════════════

export function RoomView({ code }: { code: string }) {
  const sessionId           = useSessionId();
  const [name, setName]     = useStoredName();
  const [scanning, setScanning] = useState(false);
  const [opponentId, setOpponentId] = useState<string | null>(null);
  const joinCalled          = useRef(false);

  const room           = useQuery(api.rooms.getByCode, { code });
  const joinMutation   = useMutation(api.rooms.join);
  const setPhaseMutation = useMutation(api.players.setPhase);

  useEffect(() => {
    if (!sessionId || !name || joinCalled.current) return;
    joinCalled.current = true;
    joinMutation({ code, sessionId, name }).catch(() => {});
  }, [sessionId, name, code, joinMutation]);

  // ── Guards ──────────────────────────────────────────────────────────────────
  if (sessionId && !name) {
    return <NamePrompt code={code} onDone={n => { setName(n); joinCalled.current = false; }} />;
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
      </div>
    );
  }

  // ── Scanning mode ───────────────────────────────────────────────────────────
  if (scanning) {
    const oppData = opponentId ? opponentData(room.players, opponentId) : null;
    return (
      <RoomScanView
        roomId={room._id as Id<"rooms">}
        sessionId={sessionId}
        playerName={name}
        opponent={oppData}
        onDone={() => {
          setScanning(false);
          setOpponentId(null);
        }}
      />
    );
  }

  const mode = room.mode ?? "battle";

  if (mode === "tournament") {
    return (
      <TournamentView
        room={room}
        sessionId={sessionId}
        name={name}
        onStartScan={(oppId) => {
          setOpponentId(oppId);
          setScanning(true);
        }}
      />
    );
  }

  if (mode === "group") {
    return (
      <GroupScanView
        room={room}
        sessionId={sessionId}
      />
    );
  }

  // default: battle
  return (
    <BattleView
      room={room}
      sessionId={sessionId}
      name={name}
      onStartScan={() => setScanning(true)}
    />
  );
}
