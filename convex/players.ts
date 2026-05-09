import { mutation } from "./_generated/server";
import { v } from "convex/values";

export const setPhase = mutation({
  args: {
    roomId: v.id("rooms"),
    sessionId: v.string(),
    phase: v.union(v.literal("lobby"), v.literal("scanning"), v.literal("done")),
  },
  handler: async (ctx, { roomId, sessionId, phase }) => {
    const p = await ctx.db
      .query("players")
      .withIndex("by_room_session", q => q.eq("roomId", roomId).eq("sessionId", sessionId))
      .first();
    if (p) await ctx.db.patch(p._id, { phase });
  },
});

export const submitScore = mutation({
  args: {
    roomId: v.id("rooms"),
    sessionId: v.string(),
    overall: v.number(),
    elo: v.number(),
    sub: v.string(),
    tierCode: v.string(),
    tierColor: v.string(),
    level: v.string(),
    domLabel: v.string(),
    flawLabel: v.string(),
  },
  handler: async (ctx, { roomId, sessionId, ...scores }) => {
    const p = await ctx.db
      .query("players")
      .withIndex("by_room_session", q => q.eq("roomId", roomId).eq("sessionId", sessionId))
      .first();
    if (p) await ctx.db.patch(p._id, { phase: "done", ...scores });
  },
});
