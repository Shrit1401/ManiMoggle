import { mutation } from "./_generated/server";
import { v } from "convex/values";

export const setLiveScore = mutation({
  args: { roomId: v.id("rooms"), sessionId: v.string(), liveScore: v.number() },
  handler: async (ctx, { roomId, sessionId, liveScore }) => {
    const p = await ctx.db
      .query("players")
      .withIndex("by_room_session", q => q.eq("roomId", roomId).eq("sessionId", sessionId))
      .first();
    if (p) await ctx.db.patch(p._id, { liveScore });
  },
});

export const saveFaceScanData = mutation({
  args: {
    roomId:           v.id("rooms"),
    sessionId:        v.string(),
    capturedAt:       v.number(),
    rawTraitsJson:    v.optional(v.string()),
    rawOverall:       v.optional(v.number()),
    aiTraitsJson:     v.optional(v.string()),
    aiOverall:        v.optional(v.number()),
    aiDomLabel:       v.optional(v.string()),
    aiFlawLabel:      v.optional(v.string()),
    finalOverall:     v.number(),
    finalElo:         v.number(),
    finalSub:         v.string(),
    finalTierCode:    v.string(),
    finalLevel:       v.string(),
    finalDomLabel:    v.string(),
    finalFlawLabel:   v.string(),
    samplesCollected: v.optional(v.number()),
    samplesSkipped:   v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("faceScanData", args);
  },
});

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

export const setSnapshot = mutation({
  args: { roomId: v.id("rooms"), sessionId: v.string(), snapshot: v.string() },
  handler: async (ctx, { roomId, sessionId, snapshot }) => {
    const p = await ctx.db
      .query("players")
      .withIndex("by_room_session", q => q.eq("roomId", roomId).eq("sessionId", sessionId))
      .first();
    if (p) await ctx.db.patch(p._id, { snapshot });
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
