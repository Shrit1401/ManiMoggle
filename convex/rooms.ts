import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

type TMatch = { a: string | null; b: string | null; winner: string | null; aScore: number | null; bScore: number | null };
type Bracket = { players: string[]; rounds: TMatch[][]; currentRound: number; champion: string | null };

function genCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

function buildBracket(playerIds: string[]): Bracket {
  const N = playerIds.length;
  const numRounds = Math.ceil(Math.log2(Math.max(N, 2)));
  const P = Math.pow(2, numRounds); // next power of 2 >= N

  // Shuffle and pad to P with null
  const shuffled = [...playerIds].sort(() => Math.random() - 0.5);
  const slots: (string | null)[] = [...shuffled];
  while (slots.length < P) slots.push(null);

  // Pre-build all round structures with empty matches
  const rounds: TMatch[][] = [];
  for (let r = 0; r < numRounds; r++) {
    const count = P / Math.pow(2, r + 1);
    rounds.push(Array.from({ length: count }, () => ({
      a: null, b: null, winner: null, aScore: null, bScore: null,
    })));
  }

  // Fill round 0 from slots and auto-resolve byes
  for (let i = 0; i < rounds[0].length; i++) {
    const a = slots[i * 2] ?? null;
    const b = slots[i * 2 + 1] ?? null;
    rounds[0][i].a = a;
    rounds[0][i].b = b;
    if (!a && !b)   rounds[0][i].winner = null;
    else if (!b)    rounds[0][i].winner = a;
    else if (!a)    rounds[0][i].winner = b;
  }

  // Skip forward if entire round 0 is all byes (edge case: N=1)
  return { players: playerIds, rounds, currentRound: 0, champion: null };
}

export const create = mutation({
  args: { sessionId: v.string(), name: v.string(), mode: v.optional(v.string()) },
  handler: async (ctx, { sessionId, name, mode }) => {
    let code = genCode();
    for (let i = 0; i < 10; i++) {
      const exists = await ctx.db.query("rooms").withIndex("by_code", q => q.eq("code", code)).first();
      if (!exists) break;
      code = genCode();
    }
    const isBattle = !mode || mode === "battle";
    const roomId = await ctx.db.insert("rooms", {
      code,
      hostSessionId: sessionId,
      createdAt: Date.now(),
      mode: mode ?? "battle",
      fighterA:        isBattle ? sessionId : undefined,
      fighterB:        undefined,
      battleSettled:   isBattle ? false : undefined,
      tournamentStatus: mode === "tournament" ? "lobby" : undefined,
      groupStarted:    mode === "group" ? false : undefined,
      groupComplete:   mode === "group" ? false : undefined,
    });
    await ctx.db.insert("players", {
      roomId,
      sessionId,
      name,
      phase: "lobby",
      wins: 0, losses: 0,
      joinedAt: Date.now(),
    });
    return { roomId, code };
  },
});

export const join = mutation({
  args: { code: v.string(), sessionId: v.string(), name: v.string() },
  handler: async (ctx, { code, sessionId, name }) => {
    const room = await ctx.db
      .query("rooms")
      .withIndex("by_code", q => q.eq("code", code.toUpperCase()))
      .first();
    if (!room) return { error: "Room not found" } as const;

    const existing = await ctx.db
      .query("players")
      .withIndex("by_room_session", q => q.eq("roomId", room._id).eq("sessionId", sessionId))
      .first();
    if (!existing) {
      await ctx.db.insert("players", {
        roomId: room._id,
        sessionId,
        name,
        phase: "lobby",
        wins: 0,
        losses: 0,
        joinedAt: Date.now(),
      });
    }

    // Auto-assign fighterB only in battle mode
    if ((!room.mode || room.mode === "battle") && !room.fighterB && room.fighterA !== sessionId) {
      await ctx.db.patch(room._id, { fighterB: sessionId });
    }

    return { roomId: room._id, code: room.code } as const;
  },
});

export const getByCode = query({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const room = await ctx.db
      .query("rooms")
      .withIndex("by_code", q => q.eq("code", code.toUpperCase()))
      .first();
    if (!room) return null;
    const players = await ctx.db
      .query("players")
      .withIndex("by_room", q => q.eq("roomId", room._id))
      .order("asc")
      .collect();
    return { ...room, players };
  },
});

// ─── Battle mode mutations ────────────────────────────────────────────────────

export const settleBattle = mutation({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, { roomId }) => {
    const room = await ctx.db.get(roomId);
    if (!room || room.battleSettled === true || !room.fighterA || !room.fighterB) return;

    const players = await ctx.db
      .query("players")
      .withIndex("by_room", q => q.eq("roomId", roomId))
      .collect();

    const fA = players.find(p => p.sessionId === room.fighterA);
    const fB = players.find(p => p.sessionId === room.fighterB);
    if (!fA || !fB || fA.phase !== "done" || fB.phase !== "done") return;

    const winner = (fA.overall ?? 0) >= (fB.overall ?? 0) ? fA : fB;
    const loser  = winner._id === fA._id ? fB : fA;
    await ctx.db.patch(winner._id, { wins: (winner.wins ?? 0) + 1 });
    await ctx.db.patch(loser._id,  { losses: (loser.losses ?? 0) + 1 });
    await ctx.db.patch(roomId, { battleSettled: true });
  },
});

export const rematch = mutation({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, { roomId }) => {
    const room = await ctx.db.get(roomId);
    if (!room) return;
    const players = await ctx.db
      .query("players")
      .withIndex("by_room", q => q.eq("roomId", roomId))
      .collect();
    for (const p of players) {
      await ctx.db.patch(p._id, {
        phase: "lobby",
        overall: undefined, elo: undefined, sub: undefined,
        tierCode: undefined, tierColor: undefined, level: undefined,
        domLabel: undefined, flawLabel: undefined,
      });
    }
    await ctx.db.patch(roomId, { battleSettled: false });
  },
});

export const challenge = mutation({
  args: { roomId: v.id("rooms"), challengerSessionId: v.string() },
  handler: async (ctx, { roomId, challengerSessionId }) => {
    const room = await ctx.db.get(roomId);
    if (!room || room.battleSettled !== true) return;
    const players = await ctx.db
      .query("players")
      .withIndex("by_room", q => q.eq("roomId", roomId))
      .collect();
    const fA = players.find(p => p.sessionId === room.fighterA);
    const fB = players.find(p => p.sessionId === room.fighterB);
    if (!fA || !fB) return;
    const loser = (fA.overall ?? 0) >= (fB.overall ?? 0) ? fB : fA;
    const loserSlot: "fighterA" | "fighterB" = loser.sessionId === room.fighterA ? "fighterA" : "fighterB";
    for (const p of players) {
      await ctx.db.patch(p._id, {
        phase: "lobby",
        overall: undefined, elo: undefined, sub: undefined,
        tierCode: undefined, tierColor: undefined, level: undefined,
        domLabel: undefined, flawLabel: undefined,
      });
    }
    await ctx.db.patch(roomId, { [loserSlot]: challengerSessionId, battleSettled: false });
  },
});

// ─── Tournament mode mutations ────────────────────────────────────────────────

export const startTournament = mutation({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, { roomId }) => {
    const room = await ctx.db.get(roomId);
    if (!room || room.mode !== "tournament" || room.tournamentStatus !== "lobby") return;

    const players = await ctx.db
      .query("players")
      .withIndex("by_room", q => q.eq("roomId", roomId))
      .order("asc")
      .collect();

    const N = Math.min(players.length, 32);
    if (N < 2) return;

    const slots = players.slice(0, N).map(p => p.sessionId);
    const bracket = buildBracket(slots);

    await ctx.db.patch(roomId, {
      tournamentBracket: JSON.stringify(bracket),
      tournamentStatus: "running",
    });
  },
});

export const advanceTournamentBracket = mutation({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, { roomId }) => {
    const room = await ctx.db.get(roomId);
    if (!room || !room.tournamentBracket || room.tournamentStatus !== "running") return;

    const bracket = JSON.parse(room.tournamentBracket) as Bracket;
    const players = await ctx.db
      .query("players")
      .withIndex("by_room", q => q.eq("roomId", roomId))
      .collect();

    const currentMatches = bracket.rounds[bracket.currentRound];

    // Resolve any unsettled matches
    let changed = false;
    for (const match of currentMatches) {
      if (match.winner !== null) continue;
      if (match.b === null) {
        // Bye: a auto-wins
        const pA = players.find(p => p.sessionId === match.a);
        match.winner = match.a;
        match.aScore = pA?.overall ?? null;
        changed = true;
      } else {
        const pA = players.find(p => p.sessionId === match.a);
        const pB = players.find(p => p.sessionId === match.b);
        if (pA?.phase === "done" && pB?.phase === "done") {
          match.aScore = pA.overall ?? 0;
          match.bScore = pB.overall ?? 0;
          match.winner = match.aScore >= match.bScore ? match.a : match.b;
          const winnerDoc = match.winner === match.a ? pA : pB;
          const loserDoc  = match.winner === match.a ? pB : pA;
          await ctx.db.patch(winnerDoc._id, { wins: (winnerDoc.wins ?? 0) + 1 });
          await ctx.db.patch(loserDoc._id,  { losses: (loserDoc.losses ?? 0) + 1 });
          changed = true;
        }
      }
    }

    if (!changed) return;

    // Check if entire current round is settled
    const allSettled = currentMatches.every(m => m.winner !== null);
    if (!allSettled) {
      await ctx.db.patch(roomId, { tournamentBracket: JSON.stringify(bracket) });
      return;
    }

    const winners = currentMatches.map(m => m.winner!);

    // Final round complete → set champion (last non-null winner)
    if (bracket.currentRound === bracket.rounds.length - 1) {
      bracket.champion = winners.filter(Boolean).pop() ?? null;
      await ctx.db.patch(roomId, {
        tournamentBracket: JSON.stringify(bracket),
        tournamentStatus: "complete",
      });
      return;
    }

    // Advance to next round
    bracket.currentRound += 1;
    const nextMatches = bracket.rounds[bracket.currentRound];

    // Fill next round slots with this round's winners (non-null winners only)
    const nonNullWinners = winners.filter((w): w is string => w !== null);
    let wi = 0;
    for (const match of nextMatches) {
      match.a = nonNullWinners[wi++] ?? null;
      match.b = nonNullWinners[wi++] ?? null;
      // Auto-resolve byes in next round
      if (!match.a && !match.b) match.winner = null;
      else if (!match.b) match.winner = match.a;
      else if (!match.a) match.winner = match.b;
    }

    // Reset players in next round matches to lobby (fresh scan)
    const nextPlayers = new Set<string>();
    for (const m of nextMatches) {
      if (m.a) nextPlayers.add(m.a);
      if (m.b) nextPlayers.add(m.b);
    }
    for (const p of players) {
      if (nextPlayers.has(p.sessionId)) {
        await ctx.db.patch(p._id, {
          phase: "lobby",
          overall: undefined, elo: undefined, sub: undefined,
          tierCode: undefined, tierColor: undefined, level: undefined,
          domLabel: undefined, flawLabel: undefined,
        });
      }
    }

    await ctx.db.patch(roomId, { tournamentBracket: JSON.stringify(bracket) });
  },
});

export const resetTournament = mutation({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, { roomId }) => {
    const room = await ctx.db.get(roomId);
    if (!room || room.mode !== "tournament") return;
    const players = await ctx.db
      .query("players")
      .withIndex("by_room", q => q.eq("roomId", roomId))
      .collect();
    for (const p of players) {
      await ctx.db.patch(p._id, {
        phase: "lobby",
        overall: undefined, elo: undefined, sub: undefined,
        tierCode: undefined, tierColor: undefined, level: undefined,
        domLabel: undefined, flawLabel: undefined,
      });
    }
    await ctx.db.patch(roomId, {
      tournamentBracket: undefined,
      tournamentStatus: "lobby",
    });
  },
});

// ─── Group scan mode mutations ────────────────────────────────────────────────

export const scheduleGroupScan = mutation({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, { roomId }) => {
    const room = await ctx.db.get(roomId);
    if (!room || room.mode !== "group") return;
    // 4-second countdown so all clients can synchronize
    await ctx.db.patch(roomId, { groupScanStartAt: Date.now() + 4000, groupStarted: true });
  },
});

export const startGroupScan = mutation({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, { roomId }) => {
    const room = await ctx.db.get(roomId);
    if (!room || room.mode !== "group") return;
    await ctx.db.patch(roomId, { groupStarted: true });
  },
});

export const resetGroupScan = mutation({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, { roomId }) => {
    const room = await ctx.db.get(roomId);
    if (!room || room.mode !== "group") return;
    const players = await ctx.db
      .query("players")
      .withIndex("by_room", q => q.eq("roomId", roomId))
      .collect();
    for (const p of players) {
      await ctx.db.patch(p._id, {
        phase: "lobby",
        overall: undefined, elo: undefined, sub: undefined,
        tierCode: undefined, tierColor: undefined, level: undefined,
        domLabel: undefined, flawLabel: undefined, snapshot: undefined,
      });
    }
    await ctx.db.patch(roomId, { groupStarted: false, groupComplete: false, groupScanStartAt: undefined });
  },
});
