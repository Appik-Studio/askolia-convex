import { v } from "convex/values";

export const locale = v.union(v.literal("en"), v.literal("fr"), v.literal("de"), v.literal("es"), v.literal("it"));
export const operation = v.union(v.literal("upsert"), v.literal("remove"));
export const status = v.union(v.literal("pending"), v.literal("syncing"), v.literal("synced"), v.literal("failed"));
export const source = v.object({
  _id: v.string(), question: v.string(), answer: v.string(),
  group: v.optional(v.string()), url: v.optional(v.string()),
});
export const answer = v.union(
  v.object({ kind: v.literal("answer"), answer: v.string(), sources: v.array(source) }),
  v.object({ kind: v.literal("abstain"), sources: v.array(source) }),
  v.object({ kind: v.literal("unavailable"), sources: v.array(source) }),
);
export const syncState = v.object({
  key: v.string(), revision: v.number(), operation, status, attempts: v.number(),
  nextAttemptAt: v.optional(v.number()), lastError: v.optional(v.string()),
  lastSyncedAt: v.optional(v.number()), documentId: v.optional(v.string()),
});
export const acknowledgment = v.object({ revision: v.number(), documentId: v.union(v.string(), v.null()), deleted: v.boolean() });
