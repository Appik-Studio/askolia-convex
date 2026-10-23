import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import schema from "../src/component/schema.js";
import { api, internal } from "../src/component/_generated/api.js";

const modules = import.meta.glob("../src/component/**/*.ts");
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv("ASKOLIA_URL", "https://askolia-test.convex.site");
  vi.stubEnv("ASKOLIA_API_KEY", "server-secret-for-tests");
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers(); });

function acknowledge(body: Record<string, unknown>, deleted = false) {
  return Response.json({ revision: body.revision, documentId: deleted ? null : "document-1", deleted });
}

describe("durable document synchronization", () => {
  test("waits for rate limits without exhausting the error budget", async () => {
    const t = convexTest(schema, modules);
    let requests = 0;
    vi.stubGlobal("fetch", vi.fn(async (_url: unknown, init: RequestInit) => {
      requests++;
      return requests <= 9 ? new Response(null, { status: 429 }) : acknowledge(JSON.parse(String(init.body)));
    }));
    await t.mutation(api.sync.syncDocument, { key: "limited", title: "Limited", content: "Public content" });
    const now = Date.now();
    await t.action(internal.sync.push, { key: "limited", revision: 1 });
    const state = await t.query(api.sync.getSyncState, { key: "limited" });
    expect(state).toMatchObject({ status: "pending", attempts: 0 });
    expect(state!.nextAttemptAt!).toBeGreaterThanOrEqual(now + 60_000);
    expect(state!.nextAttemptAt!).toBeLessThan(now + 75_000);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(requests).toBe(10);
    expect(await t.query(api.sync.getSyncState, { key: "limited" })).toMatchObject({ status: "synced", attempts: 1 });
  });

  test("lists failed deliveries in bounded pages without their content", async () => {
    const t = convexTest(schema, modules);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 401 })));
    for (const key of ["a", "b", "c"]) await t.mutation(api.sync.syncDocument, { key, title: key, content: "Private outbox payload" });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const first = await t.query(api.sync.listFailed, { paginationOpts: { numItems: 2, cursor: null } });
    expect(first.page).toHaveLength(2);
    expect(first.isDone).toBe(false);
    const last = await t.query(api.sync.listFailed, { paginationOpts: { numItems: 2, cursor: first.continueCursor } });
    expect(last.page).toHaveLength(1);
    expect(last.isDone).toBe(true);
    expect(new Set([...first.page, ...last.page].map((item) => item.key)).size).toBe(3);
    expect(JSON.stringify(first)).not.toContain("payload");
    await expect(t.query(api.sync.listFailed, { paginationOpts: { numItems: 11, cursor: null } })).rejects.toThrow("1 to 10");
  });

  test("fences late completions across a manual retry of the same revision", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.sync.syncDocument, { key: "a", title: "A", content: "Content" });
    const first = await t.mutation(internal.sync.claim, { key: "a", revision: 1 });
    await t.mutation(internal.sync.complete, { key: "a", revision: 1, attempt: first!.attempt, retryable: false });
    await t.mutation(api.sync.retrySync, { key: "a" });
    const next = await t.mutation(internal.sync.claim, { key: "a", revision: 1 });
    expect(next!.attempt).toBeGreaterThan(first!.attempt);
    await t.mutation(internal.sync.complete, { key: "a", revision: 1, attempt: first!.attempt, result: { revision: 1, documentId: "stale", deleted: false } });
    expect(await t.query(api.sync.getSyncState, { key: "a" })).toMatchObject({ status: "syncing", attempts: 1 });
  });

  test("retries transient failures, then clears delivered content from the outbox", async () => {
    const t = convexTest(schema, modules);
    let attempts = 0;
    const fetcher = vi.fn(async (_url: unknown, init: RequestInit) => {
      attempts++;
      expect(init.headers).toMatchObject({ Authorization: "Bearer server-secret-for-tests" });
      const body = JSON.parse(String(init.body));
      expect(body.namespace).toBeTypeOf("string");
      expect(body.title).toBe("Delivery");
      return attempts === 1 ? new Response("upstream secret", { status: 503 }) : acknowledge(body);
    });
    vi.stubGlobal("fetch", fetcher);
    expect(await t.mutation(api.sync.syncDocument, { key: "delivery", title: "Delivery", content: "We deliver in two days." })).toBe(1);
    await t.action(internal.sync.push, { key: "delivery", revision: 1 });
    const pending = await t.query(api.sync.getSyncState, { key: "delivery" });
    expect(pending).toMatchObject({ status: "pending", attempts: 1, nextAttemptAt: Date.now() + 5000 });
    expect(JSON.stringify(pending)).not.toContain("secret");
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(await t.query(api.sync.getSyncState, { key: "delivery" })).toMatchObject({ status: "synced", attempts: 2, documentId: "document-1" });
    const rows = await t.run((ctx) => ctx.db.query("documents").collect());
    expect(rows[0]).not.toHaveProperty("content");
    expect(rows[0]).not.toHaveProperty("title");
  });

  test("stops on authentication errors and supports explicit retry after credentials are fixed", async () => {
    const t = convexTest(schema, modules);
    const fetcher = vi.fn(async () => new Response("never expose this", { status: 401 }));
    vi.stubGlobal("fetch", fetcher);
    await t.mutation(api.sync.syncDocument, { key: "a", title: "A", content: "Public content" });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(await t.query(api.sync.getSyncState, { key: "a" })).toMatchObject({ status: "failed", attempts: 1 });
    fetcher.mockImplementation(async () => Response.json({ revision: 1, documentId: "doc", deleted: false }));
    await t.mutation(api.sync.retrySync, { key: "a" });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(await t.query(api.sync.getSyncState, { key: "a" })).toMatchObject({ revision: 1, status: "synced", attempts: 1 });
  });

  test("caps retryable failures at eight attempts and retains the pending payload", async () => {
    const t = convexTest(schema, modules);
    const fetcher = vi.fn(async () => { throw new Error("secret request details"); });
    vi.stubGlobal("fetch", fetcher);
    await t.mutation(api.sync.syncDocument, { key: "a", title: "A", content: "Retain this content" });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(fetcher).toHaveBeenCalledTimes(8);
    const state = await t.query(api.sync.getSyncState, { key: "a" });
    expect(state).toMatchObject({ status: "failed", attempts: 8 });
    expect(state?.lastError).not.toContain("secret");
    const rows = await t.run((ctx) => ctx.db.query("documents").collect());
    expect(rows[0]?.content).toBe("Retain this content");
  });

  test("supersedes queued writes with a deletion and keeps a local tombstone", async () => {
    const t = convexTest(schema, modules);
    const fetcher = vi.fn(async (url: string | URL | Request, init: RequestInit) => {
      expect(String(url)).toContain("/documents/remove");
      return acknowledge(JSON.parse(String(init.body)), true);
    });
    vi.stubGlobal("fetch", fetcher);
    await t.mutation(api.sync.syncDocument, { key: "a", title: "A", content: "Old" });
    expect(await t.mutation(api.sync.removeDocument, { key: "a" })).toBe(2);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(await t.query(api.sync.getSyncState, { key: "a" })).toMatchObject({ revision: 2, operation: "remove", status: "synced" });
    expect(await t.mutation(api.sync.syncDocument, { key: "a", title: "A", content: "New" })).toBe(3);
  });

  test("ignores an old in-flight acknowledgment after a newer deletion", async () => {
    const t = convexTest(schema, modules);
    let started!: () => void;
    const firstStarted = new Promise<void>((resolve) => { started = resolve; });
    let release!: (response: Response) => void;
    const firstResponse = new Promise<Response>((resolve) => { release = resolve; });
    vi.stubGlobal("fetch", vi.fn(async (_url: unknown, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      if (body.revision === 1) { started(); return await firstResponse; }
      return acknowledge(body, true);
    }));
    await t.mutation(api.sync.syncDocument, { key: "a", title: "A", content: "Old" });
    const pending = t.action(internal.sync.push, { key: "a", revision: 1 });
    await firstStarted;
    await t.mutation(api.sync.removeDocument, { key: "a" });
    await t.action(internal.sync.push, { key: "a", revision: 2 });
    release(Response.json({ revision: 1, documentId: "old", deleted: false }));
    await pending;
    expect(await t.query(api.sync.getSyncState, { key: "a" })).toMatchObject({ revision: 2, operation: "remove", status: "synced" });
    expect(await t.query(api.sync.getSyncState, { key: "a" })).not.toHaveProperty("documentId");
    await t.finishAllScheduledFunctions(vi.runAllTimers);
  });

  test("recovers an abandoned lease and rejects a late completion from the old attempt", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.sync.syncDocument, { key: "a", title: "A", content: "Content" });
    expect(await t.mutation(internal.sync.claim, { key: "a", revision: 1 })).toMatchObject({ attempt: 1 });
    expect(await t.mutation(internal.sync.claim, { key: "a", revision: 1 })).toBeNull();
    vi.setSystemTime(Date.now() + 60_001);
    expect(await t.mutation(internal.sync.claim, { key: "a", revision: 1 })).toMatchObject({ attempt: 2 });
    await t.mutation(internal.sync.complete, { key: "a", revision: 1, attempt: 1, result: { revision: 1, documentId: "old", deleted: false } });
    expect(await t.query(api.sync.getSyncState, { key: "a" })).toMatchObject({ status: "syncing", attempts: 2 });
  });

  test("rejects inconsistent remote acknowledgments without discarding local content", async () => {
    const t = convexTest(schema, modules);
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ revision: 99, documentId: "wrong", deleted: false })));
    await t.mutation(api.sync.syncDocument, { key: "a", title: "A", content: "Content" });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(await t.query(api.sync.getSyncState, { key: "a" })).toMatchObject({ status: "failed", attempts: 1 });
  });

  test("bounds document size in UTF-8 and does not create invalid intents", async () => {
    const t = convexTest(schema, modules);
    await expect(t.mutation(api.sync.syncDocument, { key: "a", title: "A", content: "é".repeat(50_001) })).rejects.toThrow("UTF-8");
    await expect(t.mutation(api.sync.removeDocument, { key: " " })).rejects.toThrow("key");
    expect(await t.query(api.sync.getSyncState, { key: "a" })).toBeNull();
  });
});
