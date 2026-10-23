import { paginationOptsValidator } from "convex/server";
import { v, type Infer } from "convex/values";
import { internal } from "./_generated/api.js";
import { internalAction, internalMutation, mutation, query, type MutationCtx } from "./_generated/server.js";
import { ApiError, request } from "./transport.js";
import { acknowledgment, operation, syncState } from "./validators.js";

const MAX_ATTEMPTS = 8;
const LEASE_MS = 60_000;
const MAX_KEYS = 2_000;

function validateKey(key: string) {
  if (!key.trim() || key.length > 200) throw new Error("Document key must contain 1 to 200 characters.");
}

async function enqueue(ctx: MutationCtx, args: { key: string; operation: "upsert" | "remove"; title?: string; content?: string }) {
  validateKey(args.key);
  const existing = await ctx.db.query("documents").withIndex("by_key", (q) => q.eq("key", args.key)).unique();
  if (!existing) {
    const count = await ctx.db.query("settings").withIndex("by_name", (q) => q.eq("name", "keyCount")).unique();
    const keys = Number(count?.value ?? "0");
    if (keys >= MAX_KEYS) throw new Error("This component has reached its 2000-document key limit.");
    if (count) await ctx.db.patch(count._id, { value: String(keys + 1) });
    else await ctx.db.insert("settings", { name: "keyCount", value: "1" });
  }
  let settings = await ctx.db.query("settings").withIndex("by_name", (q) => q.eq("name", "namespace")).unique();
  if (!settings) {
    const id = await ctx.db.insert("settings", { name: "namespace", value: crypto.randomUUID() });
    settings = await ctx.db.get(id);
  }
  const revision = (existing?.revision ?? 0) + 1;
  const fields = {
    key: args.key, revision, operation: args.operation,
    title: args.title, content: args.content,
    status: "pending" as const, attempts: 0,
    attemptSerial: existing?.attemptSerial ?? 0,
    leaseUntil: undefined, nextAttemptAt: Date.now(), lastError: undefined,
  };
  if (existing) await ctx.db.patch(existing._id, fields);
  else await ctx.db.insert("documents", fields);
  await ctx.scheduler.runAfter(0, internal.sync.push, { key: args.key, revision });
  return revision;
}

export const syncDocument = mutation({
  args: { key: v.string(), title: v.string(), content: v.string() },
  returns: v.number(),
  handler: async (ctx, args) => {
    const title = args.title.trim();
    const content = args.content.trim();
    if (!title || title.length > 200) throw new Error("Document title must contain 1 to 200 characters.");
    if (!content || new TextEncoder().encode(content).length > 100_000) throw new Error("Document content must contain 1 to 100000 UTF-8 bytes.");
    return await enqueue(ctx, { key: args.key, operation: "upsert", title, content });
  },
});

export const removeDocument = mutation({
  args: { key: v.string() },
  returns: v.number(),
  handler: async (ctx, args) => await enqueue(ctx, { key: args.key, operation: "remove" }),
});

export const getSyncState = query({
  args: { key: v.string() },
  returns: v.union(syncState, v.null()),
  handler: async (ctx, args) => {
    const row = await ctx.db.query("documents").withIndex("by_key", (q) => q.eq("key", args.key)).unique();
    if (!row) return null;
    return {
      key: row.key, revision: row.revision, operation: row.operation, status: row.status, attempts: row.attempts,
      ...(row.nextAttemptAt !== undefined ? { nextAttemptAt: row.nextAttemptAt } : {}),
      ...(row.lastError !== undefined ? { lastError: row.lastError } : {}),
      ...(row.lastSyncedAt !== undefined ? { lastSyncedAt: row.lastSyncedAt } : {}),
      ...(row.documentId !== undefined ? { documentId: row.documentId } : {}),
    };
  },
});

export const retrySync = mutation({
  args: { key: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.query("documents").withIndex("by_key", (q) => q.eq("key", args.key)).unique();
    if (!row || row.status !== "failed") return null;
    await ctx.db.patch(row._id, { status: "pending", attempts: 0, lastError: undefined, nextAttemptAt: Date.now(), leaseUntil: undefined });
    await ctx.scheduler.runAfter(0, internal.sync.push, { key: row.key, revision: row.revision });
    return null;
  },
});

export const listFailed = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: v.object({ page: v.array(syncState), isDone: v.boolean(), continueCursor: v.string() }),
  handler: async (ctx, { paginationOpts }) => {
    if (!Number.isInteger(paginationOpts.numItems) || paginationOpts.numItems < 1 || paginationOpts.numItems > 10) {
      throw new Error("Request 1 to 10 failed documents per page.");
    }
    const result = await ctx.db.query("documents").withIndex("by_status", (q) => q.eq("status", "failed")).paginate(paginationOpts);
    return { isDone: result.isDone, continueCursor: result.continueCursor, page: result.page.map((row) => ({
      key: row.key, revision: row.revision, operation: row.operation, status: row.status, attempts: row.attempts,
      ...(row.lastError !== undefined ? { lastError: row.lastError } : {}),
      ...(row.lastSyncedAt !== undefined ? { lastSyncedAt: row.lastSyncedAt } : {}),
      ...(row.documentId !== undefined ? { documentId: row.documentId } : {}),
    })) };
  },
});

const claimResult = v.object({
  namespace: v.string(), key: v.string(), revision: v.number(), operation,
  title: v.optional(v.string()), content: v.optional(v.string()), attempt: v.number(),
});

export const claim = internalMutation({
  args: { key: v.string(), revision: v.number() },
  returns: v.union(claimResult, v.null()),
  handler: async (ctx, args) => {
    const row = await ctx.db.query("documents").withIndex("by_key", (q) => q.eq("key", args.key)).unique();
    const now = Date.now();
    if (!row || row.revision !== args.revision || row.status === "synced" || row.status === "failed") return null;
    if ((row.leaseUntil ?? 0) > now || (row.nextAttemptAt ?? 0) > now) return null;
    if (row.attempts >= MAX_ATTEMPTS) {
      await ctx.db.patch(row._id, { status: "failed", lastError: "Synchronization worker did not complete after 8 attempts.", leaseUntil: undefined, nextAttemptAt: undefined });
      return null;
    }
    const settings = await ctx.db.query("settings").withIndex("by_name", (q) => q.eq("name", "namespace")).unique();
    if (!settings) throw new Error("Component namespace is missing.");
    const attempt = row.attemptSerial + 1;
    await ctx.db.patch(row._id, { status: "syncing", attempts: row.attempts + 1, attemptSerial: attempt, leaseUntil: now + LEASE_MS, nextAttemptAt: undefined });
    // A durable watchdog also handles an action that crashes before recording its result.
    await ctx.scheduler.runAfter(LEASE_MS + 1, internal.sync.push, args);
    return { namespace: settings.value, key: row.key, revision: row.revision, operation: row.operation, title: row.title, content: row.content, attempt };
  },
});

export const complete = internalMutation({
  args: {
    key: v.string(), revision: v.number(), attempt: v.number(),
    result: v.optional(acknowledgment), retryable: v.optional(v.boolean()), throttled: v.optional(v.boolean()), error: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.query("documents").withIndex("by_key", (q) => q.eq("key", args.key)).unique();
    if (!row || row.revision !== args.revision || row.attemptSerial !== args.attempt || row.status !== "syncing") return null;
    if (args.result) {
      await ctx.db.patch(row._id, {
        status: "synced", title: undefined, content: undefined, leaseUntil: undefined, nextAttemptAt: undefined,
        lastError: undefined, lastSyncedAt: Date.now(), documentId: args.result.documentId ?? undefined,
      });
    } else {
      const throttled = args.throttled === true;
      const retry = throttled || (args.retryable === true && row.attempts < MAX_ATTEMPTS);
      const delay = throttled ? 60_000 + Math.floor(Math.random() * 15_000) : Math.min(5_000 * 2 ** (row.attempts - 1), 300_000);
      await ctx.db.patch(row._id, {
        status: retry ? "pending" : "failed", leaseUntil: undefined,
        attempts: throttled ? row.attempts - 1 : row.attempts,
        nextAttemptAt: retry ? Date.now() + delay : undefined,
        lastError: args.error ?? "Synchronization failed.",
      });
      if (retry) await ctx.scheduler.runAfter(delay, internal.sync.push, { key: row.key, revision: row.revision });
    }
    return null;
  },
});

function isAcknowledgment(value: unknown): value is Infer<typeof acknowledgment> {
  if (!value || typeof value !== "object") return false;
  const result = value as Record<string, unknown>;
  return Number.isSafeInteger(result.revision) && typeof result.deleted === "boolean" &&
    (typeof result.documentId === "string" || result.documentId === null);
}

export const push = internalAction({
  args: { key: v.string(), revision: v.number() },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const claimed = await ctx.runMutation(internal.sync.claim, args);
    if (!claimed) return null;
    try {
      const body = { namespace: claimed.namespace, key: claimed.key, revision: claimed.revision,
        ...(claimed.operation === "upsert" ? { title: claimed.title, content: claimed.content } : {}) };
      const result = await request(`/api/v1/documents/${claimed.operation === "upsert" ? "sync" : "remove"}`, body);
      if (!isAcknowledgment(result) || result.revision !== claimed.revision || result.deleted !== (claimed.operation === "remove") ||
        (claimed.operation === "upsert" && !result.documentId) || (claimed.operation === "remove" && result.documentId !== null)) {
        await ctx.runMutation(internal.sync.complete, { ...args, attempt: claimed.attempt, retryable: false, error: "Askolia returned an inconsistent document acknowledgment." });
        return null;
      }
      await ctx.runMutation(internal.sync.complete, { ...args, attempt: claimed.attempt, result });
    } catch (error) {
      const retryable = !(error instanceof ApiError) || error.status >= 500 || error.status === 429 || error.status === 408;
      // Remote bodies, request payloads and credentials never enter queryable error state.
      const message = error instanceof ApiError ? error.message : "Askolia could not be reached or its configuration/response is invalid.";
      await ctx.runMutation(internal.sync.complete, { ...args, attempt: claimed.attempt, retryable, throttled: error instanceof ApiError && error.status === 429, error: message });
    }
    return null;
  },
});
