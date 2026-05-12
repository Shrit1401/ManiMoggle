import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const sendSignal = mutation({
  args: {
    roomId:  v.id("rooms"),
    from:    v.string(),
    to:      v.string(),
    type:    v.string(),
    payload: v.string(),
  },
  handler: async (ctx, args) => {
    // For offers/answers keep only the latest — delete stale ones
    if (args.type !== "ice") {
      const old = await ctx.db
        .query("webrtcSignals")
        .withIndex("by_room_from_to", q =>
          q.eq("roomId", args.roomId).eq("from", args.from).eq("to", args.to)
        )
        .filter(q => q.eq(q.field("type"), args.type))
        .collect();
      for (const o of old) {
        try { await ctx.db.delete(o._id); } catch { /* concurrent deleteSignal beat us — fine */ }
      }
    }
    await ctx.db.insert("webrtcSignals", { ...args, ts: Date.now() });
  },
});

export const getSignals = query({
  args: { roomId: v.id("rooms"), to: v.string() },
  handler: async (ctx, { roomId, to }) => {
    return ctx.db
      .query("webrtcSignals")
      .withIndex("by_room_to", q => q.eq("roomId", roomId).eq("to", to))
      .order("asc")
      .collect();
  },
});

export const deleteSignal = mutation({
  args: { id: v.id("webrtcSignals") },
  handler: async (ctx, { id }) => {
    // Wrapped in try/catch: sendSignal's dedup loop may have already deleted this
    try { await ctx.db.delete(id); } catch { /* already gone — safe to ignore */ }
  },
});

export const clearRoomSignals = mutation({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, { roomId }) => {
    const all = await ctx.db
      .query("webrtcSignals")
      .withIndex("by_room_to", q => q.eq("roomId", roomId))
      .collect();
    for (const s of all) {
      try { await ctx.db.delete(s._id); } catch { /* concurrent delete — fine */ }
    }
  },
});
