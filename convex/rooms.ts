import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

function genCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

export const create = mutation({
  args: { sessionId: v.string(), name: v.string() },
  handler: async (ctx, { sessionId, name }) => {
    let code = genCode();
    for (let i = 0; i < 10; i++) {
      const exists = await ctx.db.query("rooms").withIndex("by_code", q => q.eq("code", code)).first();
      if (!exists) break;
      code = genCode();
    }
    const roomId = await ctx.db.insert("rooms", {
      code,
      hostSessionId: sessionId,
      createdAt: Date.now(),
      fighterA: sessionId,
      fighterB: undefined,
      battleSettled: false,
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

    // Auto-assign as fighterB if slot is open
    if (!room.fighterB && room.fighterA !== sessionId) {
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

// After both fighters are done — record wins/losses (idempotent)
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

// Rematch: same fighters, reset scores
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

// Challenger steps up: replaces one of the fighters after battle
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

    // Challenger replaces the loser
    const loser = (fA.overall ?? 0) >= (fB.overall ?? 0) ? fB : fA;
    const loserSlot: "fighterA" | "fighterB" = loser.sessionId === room.fighterA ? "fighterA" : "fighterB";

    // Reset all players' scan state
    for (const p of players) {
      await ctx.db.patch(p._id, {
        phase: "lobby",
        overall: undefined, elo: undefined, sub: undefined,
        tierCode: undefined, tierColor: undefined, level: undefined,
        domLabel: undefined, flawLabel: undefined,
      });
    }
    await ctx.db.patch(roomId, {
      [loserSlot]: challengerSessionId,
      battleSettled: false,
    });
  },
});
