import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const add = mutation({
  args: { roomCode: v.string(), emoji: v.string(), senderName: v.string() },
  handler: async (ctx, { roomCode, emoji, senderName }) => {
    await ctx.db.insert("reactions", { roomCode, emoji, senderName, createdAt: Date.now() });
  },
});

export const recent = query({
  args: { roomCode: v.string() },
  handler: async (ctx, { roomCode }) => {
    const cutoff = Date.now() - 12_000;
    return ctx.db
      .query("reactions")
      .withIndex("by_room_created", q => q.eq("roomCode", roomCode).gte("createdAt", cutoff))
      .collect();
  },
});

export const cleanup = mutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - 60_000;
    const stale = await ctx.db
      .query("reactions")
      .filter(q => q.lt(q.field("createdAt"), cutoff))
      .take(200);
    await Promise.all(stale.map(r => ctx.db.delete(r._id)));
  },
});
