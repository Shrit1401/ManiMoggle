"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery, useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { RoomScanView, type OpponentData } from "../../scan/room-scan-view";
import { useFaceLandmarker } from "../../scan/use-face-landmarker";
import { useWebRTCGroup } from "../../scan/use-webrtc-group";
import { ArenaBackdrop } from "../../../components/ui/ArenaBackdrop";
import { ScreenHeader } from "../../../components/ui/ScreenHeader";
import { Button } from "../../../components/ui/Button";
import { ResultPanel } from "../../../components/ui/ResultPanel";
import { EmojiReactionLayer } from "../../../components/ui/EmojiReactionLayer";

type RoomData = NonNullable<ReturnType<typeof useQuery<typeof api.rooms.getByCode>>>;
type Player   = RoomData["players"][number];

type TMatch   = { a: string | null; b: string | null; winner: string | null; aScore: number | null; bScore: number | null };
type Standings = Record<string, { wins: number; losses: number; totalScore: number }>;
type Bracket  = { players: string[]; rounds: TMatch[][]; currentRound: number; champion: string | null; format?: string; standings?: Standings };

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
    liveScore: p.liveScore,
  };
}

function CopyCodeRow({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => { navigator.clipboard.writeText(code).catch(() => {}); setCopied(true); setTimeout(() => setCopied(false), 1500); };
  return (
    <button onClick={copy}
      className="flex items-center gap-2 font-mono font-bold text-[15px] tracking-[0.32em]
        text-white hover:text-cyan-300 active:opacity-70 transition-colors">
      {code}
      <span className={`text-[8px] font-normal tracking-normal px-1.5 py-0.5 rounded transition-all
        ${copied ? "text-emerald-300 bg-emerald-500/15" : "text-white/35 bg-white/8"}`}>
        {copied ? "✓ copied" : "copy"}
      </span>
    </button>
  );
}

function ShareCard({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => { navigator.clipboard.writeText(code).catch(() => {}); setCopied(true); setTimeout(() => setCopied(false), 2000); };
  return (
    <div className="flex flex-col items-center gap-3 px-5 py-5 rounded-3xl
      bg-white/[0.06] ring-1 ring-white/18 text-center">
      <p className="font-mono text-[8px] tracking-[0.45em] uppercase text-white/50">
        Share this code with friends
      </p>
      <div className="font-mono font-black tracking-[0.4em] text-white select-all"
        style={{ fontSize: "clamp(32px,8vw,48px)" }}>
        {code}
      </div>
      <button onClick={copy}
        style={{ minHeight: 44 }}
        className={`w-full max-w-[220px] rounded-xl py-2.5 font-mono font-bold text-[10px] tracking-[0.22em] uppercase
          transition-all active:scale-[0.97]
          ${copied
            ? "bg-emerald-500/20 ring-1 ring-emerald-400/40 text-emerald-300"
            : "bg-cyan-500/20 ring-1 ring-cyan-400/35 text-cyan-300 hover:bg-cyan-500/30"}`}>
        {copied ? "✓ Code Copied!" : "Copy Code"}
      </button>
    </div>
  );
}

// ─── Name prompt ──────────────────────────────────────────────────────────────

function NamePrompt({ code, onDone }: { code: string; onDone: (n: string) => void }) {
  const [val, setVal] = useState("");
  return (
    <div className="flex-1 flex flex-col items-center justify-center bg-black min-h-[100dvh] gap-6 px-5 py-8 relative overflow-hidden">
      <ArenaBackdrop variant="full" />
      <div className="relative z-10 w-full max-w-sm flex flex-col items-center gap-6 animate-fade-up">
        <div className="flex flex-col items-center gap-1.5">
          <div className="flex items-center gap-3 mb-1">
            <div className="h-px w-8 bg-gradient-to-r from-transparent to-cyan-500/60" />
            <span className="font-mono text-[10px] tracking-[0.25em] uppercase text-white/35">Room · {code}</span>
            <div className="h-px w-8 bg-gradient-to-l from-transparent to-cyan-500/60" />
          </div>
          <h1 className="font-mono font-black text-[32px] tracking-[0.14em] uppercase text-white leading-none">Enter Arena</h1>
          <p className="font-mono text-[10px] tracking-[0.25em] uppercase text-white/30 mt-1">Choose your fighter name</p>
        </div>
        <div className="w-full flex flex-col gap-2">
          <label className="font-mono text-[10px] tracking-[0.25em] uppercase text-white/40 pl-1">Your Name</label>
          <div className="relative">
            <input
              autoFocus value={val}
              onChange={e => setVal(e.target.value.toUpperCase().slice(0, 14))}
              onKeyDown={e => { if (e.key === "Enter" && val.trim()) onDone(val.trim()); }}
              placeholder="ENTER NAME"
              autoCapitalize="characters"
              className="w-full bg-[var(--surface-1)] ring-1 ring-[var(--ring-1)] rounded-[var(--radius-input)] px-4 py-4 font-mono text-[15px]
                text-white placeholder:text-white/18 tracking-[0.22em] uppercase outline-none
                focus:ring-cyan-400/40 focus:bg-[var(--surface-2)] transition-all"
              style={{ minHeight: 56 }}
            />
            {val && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full
                bg-gradient-to-br from-cyan-500/35 to-cyan-500/10 ring-1 ring-[var(--ring-2)]
                flex items-center justify-center font-mono text-[12px] font-bold text-cyan-300">
                {val.charAt(0)}
              </div>
            )}
          </div>
        </div>
        <Button
          variant="primary" size="lg"
          onClick={() => { if (val.trim()) onDone(val.trim()); }}
          disabled={!val.trim()}
        >
          Enter Arena →
        </Button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// BATTLE MODE (1v1 split-screen)
// ═══════════════════════════════════════════════════════════════════════════════

function BattleView({ room, sessionId, name, onStartScan }: {
  room: RoomData; sessionId: string; name: string; onStartScan: (oppId: string | null) => void;
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

  // Auto-navigate to scan view when opponent starts scanning (so neither party needs to press a button)
  useEffect(() => {
    if (settled || !iAmFighter) return;
    const myPhase  = iAmFA ? fA?.phase : fB?.phase;
    const oppPhase = iAmFA ? fB?.phase : fA?.phase;
    if (oppPhase === "scanning" && myPhase === "lobby") {
      onStartScan(iAmFA ? (room.fighterB ?? null) : (room.fighterA ?? null));
    }
  }, [fA?.phase, fB?.phase, settled, iAmFighter, iAmFA, onStartScan, room.fighterA, room.fighterB]);

  const FighterCard = ({ player, isMe, isWin, isLose }: { player: Player | null; isMe: boolean; isWin: boolean; isLose: boolean }) => {
    if (!player) return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 rounded-2xl
        bg-white/[0.025] ring-1 ring-dashed ring-white/10 p-5 min-h-[200px]">
        <div className="w-14 h-14 rounded-full border-2 border-dashed border-white/12
          flex items-center justify-center text-white/15 text-2xl">?</div>
        <p className="font-mono text-[8px] tracking-[0.28em] uppercase text-white/20">Waiting for opponent…</p>
      </div>
    );
    const done = player.phase === "done"; const scanning = player.phase === "scanning";
    return (
      <div className={`flex-1 flex flex-col items-center gap-3 rounded-2xl p-4 transition-all min-h-[200px]
        ${isWin && settled ? "bg-gradient-to-b from-amber-400/10 to-amber-400/[0.03] ring-2 ring-amber-400/40"
          : isLose && settled ? "bg-white/[0.015] ring-1 ring-white/8 opacity-45"
          : isMe ? "bg-cyan-500/[0.05] ring-1 ring-cyan-400/25" : "bg-white/[0.04] ring-1 ring-white/10"}`}>
        {isWin && settled && <span className="text-xl drop-shadow-[0_0_8px_rgba(251,191,36,0.8)]">👑</span>}
        <div className={`w-14 h-14 rounded-full ring-2 flex items-center justify-center font-mono text-xl font-bold text-white shrink-0
          ${isWin && settled ? "bg-amber-400/20 ring-amber-400/50 shadow-[0_0_20px_rgba(251,191,36,0.25)]"
            : isMe ? "bg-cyan-500/20 ring-cyan-400/40 shadow-[0_0_16px_rgba(34,211,238,0.2)]"
            : "bg-white/8 ring-white/18"}`}>
          {player.name.charAt(0)}
        </div>
        <div className="text-center">
          <p className={`font-sans font-bold text-[14px] tracking-[0.1em] uppercase
            ${isWin && settled ? "text-amber-300" : isMe ? "text-cyan-300" : "text-white"}`}>
            {player.name}
          </p>
          <p className="font-mono text-[8px] tracking-widest text-white/25 mt-0.5">{player.wins ?? 0}W · {player.losses ?? 0}L</p>
        </div>
        {done ? (
          <div className="flex flex-col items-center gap-1">
            <span className={`font-sans font-black tabular-nums leading-none
              ${isWin && settled ? "text-[52px] text-amber-300" : "text-[46px] text-white"}`}>
              {player.overall?.toFixed(1)}
            </span>
            <span className="font-mono text-[8px] tracking-widest text-white/40 uppercase">{player.tierCode} · {player.level}</span>
            <p className="font-mono text-[7px] tracking-wider text-emerald-400/80 text-center mt-1 max-w-[120px] leading-snug">{player.domLabel}</p>
            <p className="font-mono text-[7px] tracking-wider text-rose-400/65 text-center max-w-[120px]">{player.flawLabel}</p>
          </div>
        ) : scanning ? (
          <div className="flex flex-col items-center gap-2 mt-1">
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping shrink-0" />
              <span className="font-mono text-[8px] tracking-widest uppercase text-cyan-400">Scanning…</span>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 mt-1">
            <span className="font-mono text-[8px] tracking-widest uppercase text-white/22">Ready</span>
            {isMe && !settled && (
              <button onClick={() => onStartScan(iAmFA ? (room.fighterB ?? null) : (room.fighterA ?? null))}
                className="rounded-full bg-cyan-500/20 hover:bg-cyan-500/35 ring-1 ring-cyan-400/40
                  px-5 py-2.5 font-mono text-[9px] tracking-[0.22em] uppercase text-cyan-300 transition-all active:scale-[0.97]">
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
      <ArenaBackdrop variant="calm" />
      <EmojiReactionLayer roomCode={room.code} playerName={name} />
      <ScreenHeader
        onExit={() => router.push("/")}
        title={
          <div className="flex flex-col items-center gap-0.5">
            <span className="font-mono text-[10px] tracking-[0.25em] uppercase text-white/35">⚔ 1v1 Battle</span>
            <CopyCodeRow code={room.code} />
          </div>
        }
      />

      <div className="relative z-10 flex-1 overflow-y-auto">
        <div className="max-w-lg mx-auto px-4 py-5 flex flex-col gap-4">

          {!fB && <ShareCard code={room.code} />}

          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
            <FighterCard player={fA} isMe={iAmFA} isWin={winner?.sessionId === room.fighterA} isLose={loser?.sessionId === room.fighterA} />
            <div className="flex sm:flex-col items-center justify-center gap-2 py-1 sm:py-0 sm:w-8">
              <div className="flex-1 h-px sm:w-px bg-white/8" />
              <div className="w-9 h-9 rounded-full bg-black ring-1 ring-white/15 flex items-center justify-center shrink-0">
                <span className="font-mono text-[8px] font-bold tracking-widest text-white/45">VS</span>
              </div>
              <div className="flex-1 h-px sm:w-px bg-white/8" />
            </div>
            <FighterCard player={fB} isMe={iAmFB} isWin={winner?.sessionId === room.fighterB} isLose={loser?.sessionId === room.fighterB} />
          </div>

          {settled && winner && (
            <div className="flex flex-col items-center gap-1 py-3 rounded-2xl bg-amber-400/[0.06] ring-1 ring-amber-400/20">
              <p className="font-mono text-[6.5px] tracking-[0.45em] uppercase text-amber-400/50">Winner</p>
              <p className="font-sans font-black text-[24px] tracking-[0.1em] uppercase text-amber-300">{winner.name}</p>
            </div>
          )}

          {settled && (
            <div className="flex gap-2">
              {iAmFighter && (
                <button onClick={() => rematchMutation({ roomId: room._id as Id<"rooms"> })}
                  style={{ minHeight: 48 }}
                  className="flex-1 rounded-[var(--radius-input)] bg-[var(--surface-2)] hover:bg-[var(--surface-3)] ring-1 ring-[var(--ring-2)]
                    py-3 font-mono text-[10px] tracking-[0.22em] uppercase text-white transition-all active:scale-[0.97]">
                  Rematch
                </button>
              )}
              {!iAmFighter && players.find(p => p.sessionId === sessionId) && (
                <button onClick={() => challengeMutation({ roomId: room._id as Id<"rooms">, challengerSessionId: sessionId })}
                  style={{ minHeight: 48 }}
                  className="flex-1 rounded-[var(--radius-input)] bg-cyan-500/15 hover:bg-cyan-500/25 ring-1 ring-cyan-400/30
                    py-3 font-mono text-[10px] tracking-[0.22em] uppercase text-cyan-300 transition-all active:scale-[0.97]">
                  Challenge Winner
                </button>
              )}
              <button onClick={() => router.push("/")}
                style={{ minHeight: 48 }}
                className="rounded-[var(--radius-input)] bg-[var(--surface-1)] hover:bg-[var(--surface-2)] ring-1 ring-[var(--ring-1)]
                  px-4 py-3 font-mono text-[10px] tracking-[0.18em] uppercase text-white/35 transition-all active:scale-[0.97]">
                Exit
              </button>
            </div>
          )}

          {queue.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <p className="font-mono text-[7px] tracking-[0.3em] uppercase text-white/40 px-1">
                {settled ? "Next up" : "Spectating"} · {queue.length}
              </p>
              {queue.map(p => (
                <div key={p._id} className={`flex items-center gap-3 px-4 py-3.5 rounded-2xl ring-1
                  ${p.sessionId === sessionId ? "bg-cyan-500/[0.09] ring-cyan-400/30" : "bg-white/[0.05] ring-white/12"}`}>
                  <div className={`w-9 h-9 rounded-full ring-1 flex items-center justify-center font-mono text-[13px] font-bold shrink-0
                    ${p.sessionId === sessionId ? "bg-cyan-500/25 ring-cyan-400/40 text-cyan-200" : "bg-white/12 ring-white/22 text-white"}`}>
                    {p.name.charAt(0)}
                  </div>
                  <span className={`font-sans font-bold text-[14px] tracking-[0.06em] uppercase flex-1 truncate
                    ${p.sessionId === sessionId ? "text-cyan-300" : "text-white/88"}`}>{p.name}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TOURNAMENT MODE
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Visual bracket ───────────────────────────────────────────────────────────

const SH   = 52;   // slot height px
const SW   = 138;  // slot width px
const HG   = 40;   // horizontal gap between columns (for connector lines)
const LH   = 26;   // label area height at top
const CGAP = 48;   // extra gap before champion column
const CW   = 120;  // champion column width
const CH   = 80;   // champion box height

function PillSlot({ sid, score, winner, active, players, sessionId }: {
  sid: string | null; score: number | null; winner: string | null;
  active: boolean; players: Player[]; sessionId: string;
}) {
  const player   = sid ? players.find(p => p.sessionId === sid) : null;
  const isWinner = sid !== null && winner === sid;
  const isMe     = sid === sessionId;
  const scanning = player?.phase === "scanning";
  const isEmpty  = !sid;

  return (
    <div
      style={{
        height: SH,
        borderRadius: SH / 2,
        display: "flex", alignItems: "center",
        padding: "0 16px",
        gap: 8,
        transition: "all 0.3s",
        background: isWinner
          ? "linear-gradient(135deg, rgba(251,191,36,0.22), rgba(251,191,36,0.08))"
          : isMe
            ? "linear-gradient(135deg, rgba(34,211,238,0.18), rgba(34,211,238,0.06))"
            : active
              ? "rgba(255,255,255,0.07)"
              : isEmpty
                ? "rgba(255,255,255,0.025)"
                : "rgba(255,255,255,0.04)",
        border: `1.5px solid ${
          isWinner ? "rgba(251,191,36,0.5)"
            : isMe ? "rgba(34,211,238,0.4)"
            : active ? "rgba(255,255,255,0.18)"
            : "rgba(255,255,255,0.1)"
        }`,
        opacity: winner && !isWinner ? 0.38 : 1,
        boxShadow: isWinner ? "0 0 20px rgba(251,191,36,0.15)" : isMe ? "0 0 16px rgba(34,211,238,0.12)" : "none",
      }}
    >
      {!isEmpty && (
        <div
          style={{
            width: 26, height: 26, borderRadius: "50%", flexShrink: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontFamily: "monospace", fontSize: 11, fontWeight: 700,
            background: isWinner ? "rgba(251,191,36,0.3)"
              : isMe ? "rgba(34,211,238,0.25)"
              : "rgba(255,255,255,0.1)",
            color: isWinner ? "#fbbf24" : isMe ? "#22d3ee" : "rgba(255,255,255,0.8)",
          }}
        >
          {isMe ? "Y" : (player?.name?.charAt(0) ?? "?")}
        </div>
      )}
      <span style={{
        fontFamily: "monospace", fontSize: 10, fontWeight: 700,
        textTransform: "uppercase", letterSpacing: "0.08em",
        color: isWinner ? "#fbbf24" : isMe ? "#22d3ee" : isEmpty ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.85)",
        flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>
        {isEmpty ? "TBD" : isMe ? "YOU" : (player?.name ?? "?")}
      </span>
      {score !== null && (
        <span style={{
          fontFamily: "monospace", fontSize: 12, fontWeight: 900,
          color: isWinner ? "#fbbf24" : "rgba(255,255,255,0.4)", flexShrink: 0,
        }}>
          {score.toFixed(1)}
        </span>
      )}
      {score === null && scanning && (
        <span style={{
          width: 7, height: 7, borderRadius: "50%", flexShrink: 0,
          background: "#22d3ee", animation: "ping 1s cubic-bezier(0,0,0.2,1) infinite",
        }} />
      )}
      {isWinner && score !== null && <span style={{ fontSize: 12, flexShrink: 0 }}>👑</span>}
    </div>
  );
}

function VisualBracket({ bracket, players, sessionId }: {
  bracket: Bracket; players: Player[]; sessionId: string;
}) {
  const rounds    = bracket.rounds;
  const numRounds = rounds.length;
  if (numRounds === 0) return null;
  // M = full power-of-2 count for round 0 — drives height regardless of trimming.
  const M         = Math.pow(2, numRounds) / 2;
  const totalH    = LH + M * (2 * SH + 4);
  // Whether round 0 was trimmed (byes placed in round 1 instead).
  const isTrimmed  = rounds[0].length < M;

  // Column x-starts
  const colX = (r: number) => r * (SW + HG);
  const champX = numRounds * (SW + HG) + CGAP;
  const totalW = champX + CW + 8;

  // Junction Y of match (r, i) — centre between slot A and slot B.
  // For trimmed round 0, align each match under its round-1 parent.
  const matchCY = (r: number, i: number) => {
    if (r === 0 && isTrimmed) {
      const parentIdx = Math.floor(i / 2);
      const parentCY  = LH + (2 * parentIdx + 1) * 2 * SH;
      return parentCY + (i % 2 === 0 ? -SH : SH);
    }
    return LH + (2 * i + 1) * Math.pow(2, r) * SH;
  };

  // Horizontal mid-point for connectors
  const midX = (r: number) => colX(r) + SW + HG / 2;

  const rLabel = (r: number) => {
    if (numRounds === 1) return "Final";
    if (r === numRounds - 1) return "Final";
    if (r === numRounds - 2 && numRounds >= 3) return "Semi";
    if (r === numRounds - 3 && numRounds >= 4) return "QF";
    return `R${r + 1}`;
  };

  // Champion data
  const champSid   = bracket.champion;
  const champPlayer = champSid ? players.find(p => p.sessionId === champSid) : null;
  const isComplete = !!champSid;
  const champCY    = totalH / 2;
  const finalRound = rounds[numRounds - 1];
  const finalMatch = finalRound?.[0];

  return (
    <div style={{ overflowX: "auto", overflowY: "visible", WebkitOverflowScrolling: "touch", margin: "0 -4px" }}>
      <div style={{ position: "relative", width: Math.max(totalW, 280), height: Math.max(totalH, CH + LH + 16), paddingBottom: 8 }}>

        {/* SVG connector lines */}
        <svg
          style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none", overflow: "visible" }}
          width={totalW} height={Math.max(totalH, CH + LH + 16)}
        >
          {/* Round-to-round connectors: one L-shaped line per existing match */}
          {rounds.map((round, r) => {
            if (r >= numRounds - 1) return null;
            return round.map((match, i) => {
              if (!match.a && !match.b) return null;
              const parentIdx = Math.floor(i / 2);
              if (!rounds[r + 1]?.[parentIdx]) return null;
              const cy     = matchCY(r, i);
              const nextCY = matchCY(r + 1, parentIdx);
              const rx     = colX(r) + SW;
              const mx     = midX(r);
              const nx     = colX(r + 1);
              const col    = match.winner ? "rgba(251,191,36,0.4)" : "rgba(255,255,255,0.15)";
              return (
                <g key={`cn-${r}-${i}`}>
                  <line x1={rx} y1={cy} x2={mx} y2={cy} stroke={col} strokeWidth="1.5" strokeLinecap="round" />
                  <line x1={mx} y1={cy} x2={mx} y2={nextCY} stroke={col} strokeWidth="1.5" strokeLinecap="round" />
                  <line x1={mx} y1={nextCY} x2={nx} y2={nextCY} stroke={col} strokeWidth="1.5" strokeLinecap="round" />
                </g>
              );
            });
          })}

          {/* Final round → champion connector */}
          {finalMatch && (
            (() => {
              const cy0  = matchCY(numRounds - 1, 0);
              const rx   = colX(numRounds - 1) + SW;
              const mx   = rx + CGAP / 2;
              const col  = isComplete ? "rgba(251,191,36,0.55)" : "rgba(255,255,255,0.15)";
              return (
                <g>
                  <line x1={rx} y1={cy0} x2={mx} y2={cy0} stroke={col} strokeWidth="1.5" strokeLinecap="round" />
                  <line x1={mx} y1={cy0} x2={mx} y2={champCY} stroke={col} strokeWidth="1.5" strokeLinecap="round" />
                  <line x1={mx} y1={champCY} x2={champX} y2={champCY} stroke={col} strokeWidth="1.5" strokeLinecap="round" />
                </g>
              );
            })()
          )}
        </svg>

        {/* Round labels */}
        {rounds.map((_, r) => (
          <div key={`lbl-${r}`} style={{
            position: "absolute", left: colX(r), top: 0, width: SW,
            fontFamily: "monospace", fontSize: 7, letterSpacing: "0.45em",
            textTransform: "uppercase", textAlign: "center",
            color: r === bracket.currentRound ? "rgba(34,211,238,0.75)" : "rgba(255,255,255,0.22)",
          }}>
            {rLabel(r)}
          </div>
        ))}
        <div style={{
          position: "absolute", left: champX, top: 0, width: CW,
          fontFamily: "monospace", fontSize: 7, letterSpacing: "0.45em",
          textTransform: "uppercase", textAlign: "center",
          color: isComplete ? "rgba(251,191,36,0.7)" : "rgba(255,255,255,0.15)",
        }}>
          Champion
        </div>

        {/* Match slots per round */}
        {rounds.map((round, r) => {
          const isCurr = r === bracket.currentRound;
          return round.map((match, i) => {
            if (!match.a && !match.b) return null;
            const cy      = matchCY(r, i);
            const settled = match.winner !== null;
            return (
              <div key={`m-${r}-${i}`} style={{ position: "absolute", left: colX(r), top: cy - SH, width: SW }}>
                <PillSlot sid={match.a} score={settled ? match.aScore : null}
                  winner={match.winner} active={isCurr && !settled}
                  players={players} sessionId={sessionId} />
                <div style={{ height: 4, display: "flex", alignItems: "center", padding: "0 12px" }}>
                  <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.08)" }} />
                </div>
                <PillSlot sid={match.b} score={settled ? match.bScore : null}
                  winner={match.winner} active={isCurr && !settled}
                  players={players} sessionId={sessionId} />
              </div>
            );
          });
        })}

        {/* Champion box */}
        <div style={{
          position: "absolute",
          left: champX,
          top: champCY - CH / 2,
          width: CW,
          height: CH,
          borderRadius: 16,
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4,
          background: isComplete
            ? "linear-gradient(135deg, rgba(251,191,36,0.2), rgba(251,191,36,0.06))"
            : "rgba(255,255,255,0.025)",
          border: `1.5px solid ${isComplete ? "rgba(251,191,36,0.45)" : "rgba(255,255,255,0.1)"}`,
          boxShadow: isComplete ? "0 0 30px rgba(251,191,36,0.12)" : "none",
        }}>
          {isComplete ? (
            <>
              <span style={{ fontSize: 20 }}>🏆</span>
              <span style={{
                fontFamily: "monospace", fontSize: 10, fontWeight: 700,
                textTransform: "uppercase", letterSpacing: "0.1em",
                color: "#fbbf24", textAlign: "center", padding: "0 6px",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%",
              }}>
                {champPlayer?.name ?? "?"}
              </span>
            </>
          ) : (
            <span style={{
              fontFamily: "monospace", fontSize: 9, letterSpacing: "0.25em",
              textTransform: "uppercase", color: "rgba(255,255,255,0.2)",
            }}>TBD</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── SpectateView — full-screen live video for eliminated players ─────────────

function SpectateView({ room, sessionId, onExit }: {
  room: RoomData; sessionId: string; onExit: () => void;
}) {
  const bracket: Bracket | null = room.tournamentBracket ? JSON.parse(room.tournamentBracket) : null;
  const players = room.players;

  // Compute active fighters in the current round
  const currentRound = bracket?.rounds[bracket.currentRound] ?? [];
  const activeMatches = currentRound.filter(m => m.winner === null && m.a !== null && m.b !== null);
  const activeFighterIds = activeMatches.flatMap(m => [m.a!, m.b!]);

  // Auto-exit when the local player gains a match this round (e.g. next round started)
  const myMatch = currentRound.find(
    m => (m.a === sessionId || m.b === sessionId) && m.winner === null && m.b !== null,
  );
  useEffect(() => { if (myMatch) onExit(); }, [myMatch, onExit]);

  const roundLabel = bracket
    ? `Round ${bracket.currentRound + 1} of ${bracket.rounds.length}`
    : "";

  return (
    <div className="flex flex-col bg-black min-h-[100dvh] overflow-hidden">
      <ArenaBackdrop variant="calm" />
      <ScreenHeader
        onExit={onExit}
        exitLabel="← Back"
        title={
          <div className="flex items-center gap-2">
            {activeFighterIds.length > 0 && (
              <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse shrink-0" />
            )}
            <span className="font-mono text-[10px] tracking-[0.25em] uppercase text-white/40">
              {activeFighterIds.length > 0 ? `Live · ${roundLabel}` : roundLabel}
            </span>
          </div>
        }
      />

      {/* Content */}
      {activeMatches.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 px-4">
          <span className="text-3xl opacity-40">👁</span>
          <p className="font-mono text-[8px] tracking-[0.3em] uppercase text-white/30 text-center">
            No live matches right now
          </p>
          <p className="font-mono text-[7px] tracking-wider text-white/20 text-center">
            Waiting for next round to begin…
          </p>
        </div>
      ) : (
        <div className="flex-1 min-h-0 flex flex-col gap-1 p-1 overflow-y-auto">
          {activeMatches.map((match, idx) => {
            const fighters = [match.a!, match.b!];
            return (
              <div key={idx} className="flex gap-1" style={{ flex: "1 0 0", minHeight: 0 }}>
                {fighters.map(sid => {
                  const player = players.find(p => p.sessionId === sid);
                  const snapshot = player?.snapshot;
                  const isScanning = player?.phase === "scanning";
                  const isDone = player?.phase === "done";
                  const liveScore = player?.liveScore;
                  const finalScore = player?.overall;
                  return (
                    <div key={sid} className="relative flex-1 rounded-2xl overflow-hidden bg-neutral-950 ring-1 ring-white/8"
                      style={{ minHeight: 200 }}>
                      {/* Video / snapshot */}
                      <RemoteVideo stream={null} snapshot={snapshot} name={player?.name ?? "?"} />
                      {/* Gradient */}
                      <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/90 via-black/30 to-transparent pointer-events-none" />
                      {/* Score overlay */}
                      {isScanning && liveScore !== undefined ? (
                        <div className="absolute bottom-0 inset-x-0 p-3">
                          <div className="flex items-end gap-1.5">
                            <span className="font-sans font-black text-[40px] tabular-nums leading-none text-white drop-shadow-lg">
                              {liveScore.toFixed(1)}
                            </span>
                            <span className="mb-1.5 font-mono text-[7px] font-bold tracking-widest uppercase text-cyan-400">LIVE</span>
                          </div>
                        </div>
                      ) : isDone && finalScore !== undefined ? (
                        <div className="absolute bottom-0 inset-x-0 p-3">
                          <div className="flex items-end gap-1.5">
                            <span className="font-sans font-black text-[40px] tabular-nums leading-none text-white drop-shadow-lg">
                              {finalScore.toFixed(1)}
                            </span>
                            <span className="mb-1.5 font-mono text-[7px] font-bold tracking-widest uppercase text-emerald-400">DONE</span>
                          </div>
                          <p className="font-mono text-[7px] text-emerald-300 truncate">{player?.domLabel}</p>
                        </div>
                      ) : null}
                      {/* Name + scanning indicator */}
                      <div className="absolute top-2 inset-x-2 flex items-start justify-between">
                        <span className="font-mono text-[7.5px] font-bold tracking-wider uppercase
                          px-2 py-0.5 rounded-full bg-black/50 backdrop-blur-sm text-white/75">
                          {player?.name ?? "?"}
                        </span>
                        {isScanning && (
                          <div className="flex items-center gap-1 rounded-full bg-black/50 px-1.5 py-0.5">
                            <span className="w-1 h-1 rounded-full bg-cyan-400 animate-pulse" />
                            <span className="font-mono text-[5.5px] uppercase text-cyan-400">SCAN</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MatchCard({
  match, players, sessionId, round, onReady,
}: {
  match: TMatch; players: Player[]; sessionId: string; round: number; onReady: () => void;
}) {
  const aPlayer  = players.find(p => p.sessionId === match.a);
  const bPlayer  = players.find(p => p.sessionId === match.b);
  const isMe     = match.a === sessionId || match.b === sessionId;
  const settled  = match.winner !== null;
  const isBye    = match.b === null;
  const isNullNull = !match.a && !match.b;

  // Synchronized ready-check: both must mark scanning before scan opens
  const amA = match.a === sessionId;
  const myPhase  = amA ? aPlayer?.phase : bPlayer?.phase;
  const oppPhase = amA ? bPlayer?.phase : aPlayer?.phase;
  const iAmReady  = myPhase === "scanning";
  const oppReady  = oppPhase === "scanning";

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
          pl?.liveScore !== undefined ? (
            <div className="flex flex-col items-center gap-0">
              <span className="font-sans font-bold text-[18px] tabular-nums leading-none text-cyan-300">
                {pl.liveScore.toFixed(1)}
              </span>
              <span className="font-mono text-[5.5px] text-cyan-400/70 uppercase tracking-widest">live</span>
            </div>
          ) : (
            <div className="flex items-center gap-1">
              <span className="w-1 h-1 rounded-full bg-cyan-400 animate-ping" />
              <span className="font-mono text-[7px] text-cyan-400 uppercase">scanning</span>
            </div>
          )
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
        myPhase === "done" ? (
          <div className="flex items-center gap-1.5 justify-center py-2.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
            <span className="font-mono text-[8px] tracking-widest uppercase text-emerald-400">
              Scan done — waiting for result…
            </span>
          </div>
        ) : iAmReady ? (
          <div className="flex items-center gap-1.5 justify-center py-2.5">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping shrink-0" />
            <span className="font-mono text-[8px] tracking-widest uppercase text-cyan-400">
              {oppReady ? "Both ready — starting…" : "Waiting for opponent…"}
            </span>
          </div>
        ) : (
          <button
            onClick={onReady}
            className="w-full rounded-full bg-cyan-500/20 hover:bg-cyan-500/35 active:scale-[0.97]
              ring-1 ring-cyan-400/40 py-2.5 font-mono text-[9px] tracking-[0.22em]
              uppercase text-cyan-300 transition-all">
            I'm Ready
          </button>
        )
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
  const hasNavigatedRef     = useRef(false);
  const [spectating,        setSpectating] = useState(false);

  const players  = room.players;
  const isHost   = room.hostSessionId === sessionId;
  const status   = room.tournamentStatus ?? "lobby";
  const bracket: Bracket | null = useMemo(
    () => (room.tournamentBracket ? JSON.parse(room.tournamentBracket) : null),
    [room.tournamentBracket]
  );

  // Auto-advance bracket when matches complete
  useEffect(() => {
    if (!bracket || status !== "running") return;
    const currentRound = bracket.rounds[bracket.currentRound];
    const anyResolvable = currentRound.some(m => {
      if (m.winner !== null) return false;
      if (!m.a && !m.b) return false;
      if (!m.b || !m.a) return true; // bye — always resolvable
      const pA = players.find(p => p.sessionId === m.a);
      const pB = players.find(p => p.sessionId === m.b);
      return !!(pA?.phase === "done" && pB?.phase === "done");
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

  // Reset navigation lock when round advances
  const currentRoundIdx = bracket?.currentRound ?? -1;
  const prevRoundRef = useRef(currentRoundIdx);
  useEffect(() => {
    if (currentRoundIdx !== prevRoundRef.current) {
      prevRoundRef.current = currentRoundIdx;
      hasNavigatedRef.current = false;
    }
  }, [currentRoundIdx]);

  // Auto-navigate when BOTH players in my match have clicked Ready (phase === "scanning")
  useEffect(() => {
    if (!myMatch || hasNavigatedRef.current) return;
    const aPlayer = players.find(p => p.sessionId === myMatch.a);
    const bPlayer = players.find(p => p.sessionId === myMatch.b);
    if (aPlayer?.phase === "scanning" && bPlayer?.phase === "scanning") {
      hasNavigatedRef.current = true;
      onStartScan(myOpponentId);
    }
  }, [players, myMatch, myOpponentId, onStartScan]);

  // "Ready" — only marks phase; auto-navigate effect handles actual navigation
  const handleReady = () => {
    void setPhaseMutation({ roomId: room._id as Id<"rooms">, sessionId, phase: "scanning" });
  };

  // ── Spectate ──────────────────────────────────────────────────────────────
  if (spectating && status === "running" && bracket) {
    return <SpectateView room={room} sessionId={sessionId} onExit={() => setSpectating(false)} />;
  }

  // ── Lobby ──────────────────────────────────────────────────────────────────
  if (status === "lobby") {
    const canStart = players.length >= 2;
    return (
      <div className="flex flex-col bg-black min-h-[100dvh] overflow-hidden">
        <ArenaBackdrop variant="full" />
        <ScreenHeader
          onExit={() => router.push("/")}
          title="🏆 Tournament"
        />

        <div className="flex-1 overflow-y-auto">
          <div className="max-w-lg mx-auto px-4 py-6 flex flex-col gap-5">

            <ShareCard code={room.code} />

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between px-1">
                <p className="font-mono text-[8px] tracking-[0.38em] uppercase text-white/55">Players</p>
                <p className="font-mono text-[8px] tracking-widest text-white/45">{players.length} / 32</p>
              </div>
              {players.map((p, i) => (
                <div key={p._id} className={`flex items-center gap-3 px-4 py-3.5 rounded-2xl ring-1
                  ${p.sessionId === sessionId ? "bg-cyan-500/[0.09] ring-cyan-400/30" : "bg-white/[0.05] ring-white/12"}`}>
                  <span className="font-mono text-[9px] text-white/38 w-5 shrink-0 tabular-nums">{i + 1}</span>
                  <div className={`w-9 h-9 rounded-full ring-1 flex items-center justify-center font-mono text-[13px] font-bold shrink-0
                    ${p.sessionId === sessionId ? "bg-cyan-500/25 ring-cyan-400/40 text-cyan-200" : "bg-white/12 ring-white/22 text-white"}`}>
                    {p.name.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`font-sans font-bold text-[14px] tracking-[0.06em] uppercase truncate
                      ${p.sessionId === sessionId ? "text-cyan-300" : "text-white/88"}`}>
                      {p.name}
                    </p>
                    {p.sessionId === room.hostSessionId && (
                      <span className="font-mono text-[7px] text-amber-400/75 tracking-widest uppercase">Host</span>
                    )}
                  </div>
                  {p.sessionId === sessionId && (
                    <span className="font-mono text-[7.5px] tracking-widest uppercase text-cyan-400/80 shrink-0">you</span>
                  )}
                </div>
              ))}
              {players.length < 2 && (
                <div className="flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-white/[0.03] ring-1 ring-dashed ring-white/12">
                  <div className="w-9 h-9 rounded-full border-2 border-dashed border-white/18
                    flex items-center justify-center text-white/22 text-lg shrink-0">+</div>
                  <p className="font-mono text-[8px] tracking-widest uppercase text-white/38">
                    Waiting for more players…
                  </p>
                </div>
              )}
            </div>

            {isHost ? (
              <div className="flex flex-col gap-2">
                <Button
                  variant={canStart ? "primary" : "secondary"}
                  size="lg"
                  onClick={() => startTournament({ roomId: room._id as Id<"rooms"> })}
                  disabled={!canStart}
                >
                  {canStart ? `Start Tournament · ${players.length} players` : "Need at least 2 players"}
                </Button>
                {!canStart && (
                  <p className="font-mono text-[10px] tracking-[0.25em] uppercase text-white/38 text-center">
                    Share the code above to invite friends
                  </p>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2.5 justify-center py-4 rounded-[var(--radius-card)] bg-[var(--surface-1)] ring-1 ring-[var(--ring-1)]">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400/70 animate-pulse shrink-0" />
                <p className="font-mono text-[10px] tracking-[0.25em] uppercase text-white/55">
                  Waiting for host to start…
                </p>
              </div>
            )}
          </div>
        </div>
        </div>
    );
  }

  // ── Complete ───────────────────────────────────────────────────────────────
  if (status === "complete" && bracket) {
    const champion = players.find(p => p.sessionId === bracket.champion);
    const CONFETTI = ["#22d3ee","#fbbf24","#f59e0b","#ffffff","#06b6d4"];

    return (
      <div className="flex flex-col bg-black min-h-[100dvh] overflow-hidden">
        <ArenaBackdrop variant="full" />
        <ScreenHeader
          onExit={() => router.push("/")}
          title={
            <div className="flex flex-col items-center gap-0.5">
              <span className="font-mono text-[10px] tracking-[0.25em] uppercase text-white/35">
                🏆 Tournament · Complete
              </span>
              <CopyCodeRow code={room.code} />
            </div>
          }
        />

        {/* ── Confetti (on-brand palette only) ── */}
        <div className="fixed inset-0 pointer-events-none overflow-hidden z-50">
          {Array.from({ length: 36 }, (_, i) => (
            <div key={i} className="absolute" style={{
              left: `${((i * 37.3 + Math.sin(i * 2.1) * 28) % 100 + 100) % 100}%`,
              top: "-12px",
              width:  `${8 + (i % 4) * 3}px`,
              height: `${8 + (i % 4) * 3}px`,
              background: CONFETTI[i % CONFETTI.length],
              borderRadius: i % 3 === 0 ? "50%" : "3px",
              transform: `rotate(${(i * 47) % 360}deg)`,
              animation: `confetti-fall ${2.4 + (i % 5) * 0.35}s ease-in ${(i * 0.07) % 2.4}s both`,
            }} />
          ))}
        </div>

        <div className="relative z-10 flex-1 flex flex-col items-center px-4 pb-6 gap-5 overflow-y-auto">

          {/* ── Champion hero ── */}
          <div className="relative flex flex-col items-center gap-4 pt-8 pb-4 w-full">
            <div className="absolute inset-x-0 top-0 h-48 bg-gradient-to-b from-amber-500/10 to-transparent pointer-events-none" />
            <div className="relative">
              <div className="absolute inset-0 -m-6 rounded-full bg-amber-400/20 blur-2xl animate-pulse" />
              <span className="relative text-6xl" style={{ filter: "drop-shadow(0 0 24px rgba(251,191,36,0.7))" }}>🏆</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <p className="font-mono text-[7px] tracking-[0.55em] uppercase text-amber-400/70">Champion</p>
              <p className="font-sans font-black text-[38px] tracking-[0.08em] uppercase text-amber-400 animate-score-reveal"
                style={{ textShadow: "0 0 30px rgba(251,191,36,0.55), 0 0 70px rgba(251,191,36,0.25)" }}>
                {champion?.name ?? "—"}
              </p>
              {champion?.overall && (
                <div className="flex items-baseline gap-2 bg-amber-400/10 ring-1 ring-amber-400/30 rounded-full px-4 py-1.5">
                  <span className="font-mono font-black text-[22px] text-white tabular-nums">{champion.overall.toFixed(1)}</span>
                  <span className="font-mono text-[8px] text-amber-300/70 uppercase tracking-widest">PSL</span>
                </div>
              )}
            </div>
          </div>

          {/* Final bracket */}
          <div className="w-full flex flex-col gap-2">
            <p className="font-mono text-[7px] tracking-[0.35em] uppercase text-white/30 px-1">Final Bracket</p>
            <VisualBracket bracket={bracket} players={players} sessionId={sessionId} />
          </div>

          {isHost && (
            <button
              onClick={() => resetTournament({ roomId: room._id as Id<"rooms"> })}
              className="w-full rounded-full bg-[var(--surface-2)] hover:bg-[var(--surface-3)] ring-1 ring-[var(--ring-2)]
                py-3.5 font-mono text-[10px] tracking-[0.25em] uppercase text-white transition-all">
              New Tournament
            </button>
          )}
        </div>
      </div>
    );
  }

  // ── Running ────────────────────────────────────────────────────────────────
  if (!bracket) return null;
  const currentRound   = bracket.rounds[bracket.currentRound];
  const roundLabel     = `Round ${bracket.currentRound + 1} of ${bracket.rounds.length}`;

  // Check if I have a bye this round
  const myByeMatch = currentRound.find(
    m => (m.a === sessionId && m.b === null) || (m.b === sessionId && m.a === null)
  ) ?? null;

  return (
    <div className="flex flex-col bg-black min-h-[100dvh] overflow-hidden">
      <ArenaBackdrop variant="calm" />
      <EmojiReactionLayer roomCode={room.code} playerName={name} />
      <ScreenHeader
        onExit={() => router.push("/")}
        title={
          <div className="flex flex-col items-center gap-0.5">
            <span className="font-mono text-[10px] tracking-[0.25em] uppercase text-white/35">
              🏆 Tournament · {roundLabel}
            </span>
            <CopyCodeRow code={room.code} />
          </div>
        }
      />

      <div className="relative z-10 flex-1 flex flex-col px-4 pb-6 gap-4 overflow-y-auto">

        {/* Visual bracket */}
        <div className="flex flex-col gap-2">
          <p className="font-mono text-[7px] tracking-[0.35em] uppercase text-white/30 px-1">Bracket</p>
          <VisualBracket bracket={bracket} players={players} sessionId={sessionId} />
        </div>

        {/* Bye notice */}
        {myByeMatch && (
          <div className="flex flex-col items-center gap-1.5 py-4 px-4 rounded-2xl bg-white/[0.03] ring-1 ring-white/10">
            <span className="text-2xl">😴</span>
            <p className="font-mono text-[8px] tracking-[0.25em] uppercase text-white/50 text-center">
              Bye this round — waiting for next match
            </p>
          </div>
        )}

        {/* My match prominent */}
        {myMatch && (
          <div className="flex flex-col gap-1.5">
            <p className="font-mono text-[7px] tracking-[0.35em] uppercase text-cyan-400/60 px-1">Your Match</p>
            <MatchCard
              match={myMatch}
              players={players}
              sessionId={sessionId}
              round={bracket.currentRound}
              onReady={handleReady}
            />
          </div>
        )}

        {/* No active match — spectate panel (also shown for bye players so they can watch) */}
        {!myMatch && (() => {
          const liveMatchCount = currentRound.filter(
            m => m.winner === null && m.a !== null && m.b !== null,
          ).length;
          const myPhaseNow = players.find(p => p.sessionId === sessionId)?.phase;
          return (
            <div className="flex flex-col items-center gap-3 py-6 px-4 rounded-2xl bg-white/[0.03] ring-1 ring-white/8 text-center">
              <span className="text-2xl">👁</span>
              <p className="font-mono text-[8px] tracking-[0.25em] uppercase text-white/45">
                {myPhaseNow === "done" ? "Scan complete" : "Waiting this round"}
              </p>
              {liveMatchCount > 0 ? (
                <>
                  <p className="font-mono text-[7px] tracking-wider text-white/28">
                    {liveMatchCount} match{liveMatchCount > 1 ? "es" : ""} in progress
                  </p>
                  <button
                    onClick={() => setSpectating(true)}
                    style={{ minHeight: 44 }}
                    className="w-full rounded-full bg-cyan-500/15 hover:bg-cyan-500/28 ring-1 ring-cyan-400/35
                      py-2.5 font-mono text-[9px] tracking-[0.22em] uppercase text-cyan-300 transition-all active:scale-[0.97]">
                    Spectate live matches
                  </button>
                </>
              ) : (
                <p className="font-mono text-[7px] tracking-wider text-white/25">
                  Waiting for next round…
                </p>
              )}
            </div>
          );
        })()}
      </div>
    </div>
  );
}

// ─── RemoteVideo — sets srcObject reactively so WebRTC stream renders ────────

function RemoteVideo({ stream, snapshot, name, muted = false }: {
  stream: MediaStream | null;
  snapshot?: string;
  name: string;
  muted?: boolean;
}) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);

  if (stream) {
    return (
      <video ref={ref} autoPlay playsInline muted={muted}
        className="absolute inset-0 w-full h-full"
        style={{ objectFit: "cover", objectPosition: "center 20%" }} />
    );
  }
  if (snapshot) {
    return (
      <img src={snapshot} alt={name}
        className="absolute inset-0 w-full h-full"
        style={{ objectFit: "cover", objectPosition: "center 20%" }} />
    );
  }
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
      <div className="w-12 h-12 rounded-full bg-white/8 ring-1 ring-white/12
        flex items-center justify-center font-mono text-xl font-bold text-white/25">
        {name.charAt(0)}
      </div>
      <span className="font-mono text-[7px] uppercase tracking-widest text-white/25">Connecting…</span>
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
    scanProgress, samplesCollected, samplesSkipped,
    rawScores, summaryJson, timelineJson,
  } = useFaceLandmarker();

  const submitScore      = useMutation(api.players.submitScore);
  const saveScanData     = useMutation(api.players.saveFaceScanData);
  const setSnapshotMut   = useMutation(api.players.setSnapshot);
  const startGroupMut    = useMutation(api.rooms.scheduleGroupScan);
  const resetGroup       = useMutation(api.rooms.resetGroupScan);
  const setPhaseMutation = useMutation(api.players.setPhase);
  const setLiveScore     = useMutation(api.players.setLiveScore);
  const submittedRef        = useRef(false);
  const prevGroupStarted    = useRef<boolean | undefined>(undefined);
  const [showPersonalResult, setShowPersonalResult] = useState(false);

  const [scanStartsAt, setScanStartsAt] = useState<number | null>(null);
  const [countdown, setCountdown]       = useState<number | null>(null);

  const players  = room.players;
  const otherSessionIds = players.filter(p => p.sessionId !== sessionId).map(p => p.sessionId);
  const remoteStreams = useWebRTCGroup(room._id as Id<"rooms">, sessionId, otherSessionIds, streamRef, status === "ready");
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

  // Show personal result screen when scan finishes
  useEffect(() => {
    if (phase === "complete" && scores) setShowPersonalResult(true);
  }, [phase, scores]);

  // Detect group scan reset for ALL players (not just host) — reset local scan state
  useEffect(() => {
    const curr = !!room.groupStarted;
    if (prevGroupStarted.current === true && !curr) {
      submittedRef.current = false;
      setShowPersonalResult(false);
      resetScan();
    }
    prevGroupStarted.current = curr;
  }, [room.groupStarted, resetScan]);

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

  // Mirror local scan phase → Convex so other players see status indicators
  useEffect(() => {
    if (phase === "scanning") {
      void setPhaseMutation({ roomId: room._id as Id<"rooms">, sessionId, phase: "scanning" });
    }
  }, [phase, room._id, sessionId, setPhaseMutation]);

  // Push live score to Convex every 2 s during scanning
  const liveScoresRef = useRef<typeof scores>(null);
  liveScoresRef.current = scores;
  useEffect(() => {
    if (phase !== "scanning") return;
    const iv = setInterval(() => {
      if (liveScoresRef.current) {
        void setLiveScore({ roomId: room._id as Id<"rooms">, sessionId, liveScore: liveScoresRef.current.overall });
      }
    }, 2000);
    return () => clearInterval(iv);
  }, [phase, room._id, sessionId, setLiveScore]);

  // Auto-submit when scan completes
  useEffect(() => {
    if (phase !== "complete" || !scores || submittedRef.current) return;
    submittedRef.current = true;
    const rid = room._id as Id<"rooms">;
    void submitScore({
      roomId: rid, sessionId,
      overall: scores.overall, elo: scores.elo, sub: scores.sub,
      tierCode: scores.tier.code, tierColor: scores.tier.starColor,
      level: scores.level, domLabel: scores.dom.label, flawLabel: scores.flaw.label,
    });
    // Fire-and-forget: save detailed face data for model improvement
    void saveScanData({
      roomId: rid, sessionId,
      capturedAt: Date.now(),
      rawTraitsJson:    rawScores ? JSON.stringify(rawScores.traits) : undefined,
      rawOverall:       rawScores?.overall,
      finalOverall:     scores.overall,
      finalElo:         scores.elo,
      finalSub:         scores.sub,
      finalTierCode:    scores.tier.code,
      finalLevel:       scores.level,
      finalDomLabel:    scores.dom.label,
      finalFlawLabel:   scores.flaw.label,
      samplesCollected,
      samplesSkipped,
      summaryJson:  summaryJson  ?? undefined,
      timelineJson: timelineJson ?? undefined,
    }).catch(() => {});
  }, [phase, scores, rawScores, room._id, sessionId, submitScore, saveScanData, samplesCollected, samplesSkipped]);

  const rankMedal = (i: number) => ["🥇","🥈","🥉"][i] ?? `#${i + 1}`;

  // 1-2 players: single column (stacked vertically, full width)
  // 3+ players: 2-column grid
  const n    = players.length;
  const cols = n <= 2 ? 1 : 2;
  const rows = Math.ceil(n / cols);

  return (
    <div className="relative flex flex-col bg-black h-[100dvh] overflow-hidden">

      <ArenaBackdrop variant="calm" />
      <EmojiReactionLayer roomCode={room.code} playerName={room.players.find(p => p.sessionId === sessionId)?.name ?? "?"} />
      <ScreenHeader
        onExit={() => router.push("/")}
        title={
          <div className="flex flex-col items-center gap-0.5">
            <span className="font-mono text-[10px] tracking-[0.25em] uppercase text-white/35">Group Scan</span>
            <CopyCodeRow code={room.code} />
          </div>
        }
      />

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
                      {status === "denied" ? (
                        <>
                          <p className="font-mono text-[6px] tracking-wide text-white/30 max-w-[140px] leading-relaxed normal-case">
                            Allow camera in browser settings, then reload.
                          </p>
                          <button onClick={() => window.location.reload()}
                            className="rounded-full bg-white/10 hover:bg-white/18 px-3 py-1.5
                              font-mono text-[7px] tracking-widest uppercase text-white">
                            Reload
                          </button>
                        </>
                      ) : status !== "unsupported" && (
                        <button onClick={retry}
                          className="rounded-full bg-white/10 hover:bg-white/18 px-3 py-1.5
                            font-mono text-[7px] tracking-widest uppercase text-white">
                          Retry
                        </button>
                      )}
                      {!submittedRef.current && (
                        <button onClick={() => {
                          submittedRef.current = true;
                          void submitScore({
                            roomId: room._id as Id<"rooms">, sessionId,
                            overall: 1, elo: 57, sub: "SUB1",
                            tierCode: "BCK", tierColor: "#6b7280",
                            level: "L0", domLabel: "—", flawLabel: "Skipped",
                          }).catch(() => {});
                        }}
                          className="rounded-full bg-rose-500/15 ring-1 ring-rose-400/25 px-3 py-1.5
                            font-mono text-[7px] tracking-widest uppercase text-rose-300">
                          Skip Scan
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
                    muted
                  />
                </div>
              )}

              {/* ── Dark gradient at bottom ── */}
              <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/90 via-black/30 to-transparent pointer-events-none" />

              {/* ── Score card: live during own scan, live for others during scanning, locked when done ── */}
              {isMe && scores && (phase === "scanning" || phase === "analyzing") ? (
                <div className="absolute bottom-0 inset-x-0 p-3">
                  <div className="flex items-end gap-2">
                    <span className="font-sans font-black text-[36px] tabular-nums leading-none text-white drop-shadow-lg">
                      {scores.overall.toFixed(1)}
                    </span>
                    <span className={`mb-1.5 font-mono text-[8px] font-bold tracking-widest uppercase leading-none
                      ${phase === "analyzing" ? "text-amber-300 animate-pulse" : "text-white/35"}`}>
                      {phase === "analyzing" ? "CALC..." : "LIVE"}
                    </span>
                  </div>
                  <p className="font-mono text-[8px] text-emerald-300 truncate leading-tight">{scores.dom.label}</p>
                  <p className="font-mono text-[7px] text-rose-300/70 truncate">{scores.flaw.label}</p>
                </div>
              ) : !isMe && isScanning && p.liveScore !== undefined ? (
                <div className="absolute bottom-0 inset-x-0 p-3">
                  <div className="flex items-end gap-2">
                    <span className="font-sans font-black text-[36px] tabular-nums leading-none text-white/80 drop-shadow-lg">
                      {p.liveScore.toFixed(1)}
                    </span>
                    <span className="mb-1.5 font-mono text-[8px] font-bold tracking-widest uppercase leading-none text-cyan-400/70">
                      LIVE
                    </span>
                  </div>
                </div>
              ) : isDone && myScore !== undefined ? (
                <div className="absolute bottom-0 inset-x-0 p-3">
                  <div className="flex items-end gap-2">
                    <span className="font-sans font-black text-[36px] tabular-nums leading-none text-white drop-shadow-lg">
                      {myScore.toFixed(1)}
                    </span>
                    <div className="mb-1.5 flex flex-col leading-none">
                      <span className="font-mono text-[8px] font-bold tracking-widest uppercase text-cyan-300">
                        {p.tierCode}
                      </span>
                      <span className="font-mono text-[7px] text-white/40">{p.level}</span>
                    </div>
                  </div>
                  <p className="font-mono text-[8px] text-emerald-300 truncate leading-tight">{p.domLabel}</p>
                  <p className="font-mono text-[7px] text-rose-400/80 truncate">{p.flawLabel}</p>
                </div>
              ) : null}

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

                {/* Computing pill for own tile */}
                {isMe && phase === "analyzing" && (
                  <div className="flex items-center gap-1 rounded-full bg-cyan-500/20 ring-1 ring-cyan-400/40 px-2 py-0.5">
                    <span className="w-1 h-1 rounded-full bg-cyan-400 animate-ping" />
                    <span className="font-mono text-[6px] uppercase text-cyan-300">Calc</span>
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
          <span key={countdown} className="font-mono font-black leading-none text-white tabular-nums animate-countdown-pop"
            style={{ fontSize: "clamp(80px, 20vw, 130px)", textShadow: "0 0 40px rgba(34,211,238,0.4)" }}>
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

      {/* ── Pre-scan panel: share code + start/wait ── */}
      {!started && !allDone && (
        <div className="absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black via-black/95 to-transparent pt-16 pb-safe pb-5 px-4">
          <div className="flex flex-col gap-3 max-w-sm mx-auto">
            <ShareCard code={room.code} />
            {isHost ? (
              <Button
                variant="primary" size="lg"
                onClick={() => void startGroupMut({ roomId: room._id as Id<"rooms"> })}
              >
                Start Scan
              </Button>
            ) : (
              <div className="flex items-center gap-2.5 justify-center py-3 rounded-[var(--radius-card)] bg-[var(--surface-1)] ring-1 ring-[var(--ring-1)]">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400/50 animate-pulse shrink-0" />
                <span className="font-mono text-[10px] tracking-[0.25em] uppercase text-white/50">Waiting for host…</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Personal result overlay (shown immediately after own scan finishes) ── */}
      {showPersonalResult && scores && (
        <div className="absolute inset-0 z-40 bg-black/95">
          <ResultPanel
            scores={scores}
            name={room.players.find(p => p.sessionId === sessionId)?.name ?? ""}
            summaryJson={summaryJson}
            onAction={() => setShowPersonalResult(false)}
            actionLabel="View Rankings →"
          />
        </div>
      )}

      {/* ── Rankings (show as players finish, final when all done) ── */}
      {ranked.length > 0 && (
        <div className="absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black via-black/98 to-transparent pt-24 pb-safe pb-6 px-4">
          <div className="flex flex-col gap-2 max-w-sm mx-auto">
            <p className="font-mono text-[7px] tracking-[0.45em] uppercase text-amber-400/55 text-center mb-0.5">
              {allDone ? "✦ Final Rankings" : `✦ Live Rankings · ${players.length - ranked.length} remaining`}
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
                onClick={() => void resetGroup({ roomId: room._id as Id<"rooms"> })}
                className="mt-2 w-full rounded-full bg-[var(--surface-2)] hover:bg-[var(--surface-3)] ring-1 ring-[var(--ring-2)]
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

  const room              = useQuery(api.rooms.getByCode, { code });
  const joinMutation      = useMutation(api.rooms.join);
  const setPhaseMutation  = useMutation(api.players.setPhase);

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
        opponentSessionId={opponentId}
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
          // Phase is already "scanning" (set by handleReady before this fires)
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
      onStartScan={(oppId) => {
        // Mark as scanning in Convex immediately so opponent auto-navigates to scan view
        void setPhaseMutation({ roomId: room._id as Id<"rooms">, sessionId, phase: "scanning" });
        setOpponentId(oppId);
        setScanning(true);
      }}
    />
  );
}
