import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import type { AnswerResult, SearchResult } from "@appik-studio/askolia-convex";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { components } from "../example/convex/_generated/api.js";
import hostSchema from "../example/convex/schema.js";
import componentSchema from "../src/component/schema.js";

const hostModules = import.meta.glob("../example/convex/**/*.{js,ts}");
const componentModules = import.meta.glob("../src/component/**/*.ts");
const search = makeFunctionReference<"action", { query: string }, SearchResult[]>("webDemo:search");
const ask = makeFunctionReference<"action", { query: string }, AnswerResult>("webDemo:ask");
const reserve = makeFunctionReference<"mutation", {}, boolean>("webDemo:reserve");
const seed = makeFunctionReference<"mutation", {}, { key: string; revision: number }[]>("webDemo:seed");
const status = makeFunctionReference<"query", {}, {
  key: string;
  title: string;
  status: "not_synced" | "pending" | "syncing" | "synced" | "failed";
  revision: number;
  lastSyncedAt?: number;
}[]>("webDemo:status");
const keys = ["demo:convex:overview", "demo:convex:synchronization", "demo:convex:limits"];
const minute = 60_000;
const day = 86_400_000;

function setup() {
  const t = convexTest(hostSchema, hostModules);
  t.registerComponent("askolia", componentSchema, componentModules);
  return t;
}

function stubSearchAndAsk() {
  const fetcher = vi.fn(async (url: unknown) => Response.json(
    String(url).endsWith("/ask") ? { kind: "unavailable", sources: [] } : [],
  ));
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
  vi.stubEnv("ASKOLIA_DEMO_ENABLED", "1");
  vi.stubEnv("ASKOLIA_URL", "https://askolia-test.convex.site");
  vi.stubEnv("ASKOLIA_API_KEY", "web-demo-server-test-key");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("bounded interactive web demo", () => {
  test.each([undefined, "", "0", "true"])("is disabled unless explicitly enabled (%s)", async (enabled) => {
    const t = setup();
    const fetcher = stubSearchAndAsk();
    vi.stubEnv("ASKOLIA_DEMO_ENABLED", enabled);
    await expect(t.action(search, { query: "Convex component" })).rejects.toThrow("disabled");
    await expect(t.action(ask, { query: "What is Askolia?" })).rejects.toThrow("disabled");
    await expect(t.query(status, {})).rejects.toThrow("disabled");
    await expect(t.mutation(seed, {})).rejects.toThrow("disabled");
    await expect(t.mutation(reserve, {})).rejects.toThrow("disabled");
    expect(fetcher).not.toHaveBeenCalled();
    expect(await t.run((ctx) => ctx.db.query("rateLimits").collect())).toEqual([]);
  });

  test("validates trimmed queries before spending budget and fixes upstream arguments", async () => {
    const t = setup();
    const fetcher = vi.fn(async (url: unknown, init: RequestInit) => {
      expect(init.headers).toMatchObject({ Authorization: "Bearer web-demo-server-test-key" });
      const body = JSON.parse(String(init.body));
      if (String(url).endsWith("/search")) {
        expect(body).toEqual({ query: "ab", locale: "en", limit: 5 });
        return Response.json([]);
      }
      expect(body).toEqual({ query: "x".repeat(200), locale: "en", clientId: "askolia-web-demo" });
      return Response.json({ kind: "abstain", sources: [] });
    });
    vi.stubGlobal("fetch", fetcher);
    for (const query of ["", "  ", "a", " a ", "x".repeat(201)]) {
      await expect(t.action(search, { query })).rejects.toThrow("2 to 200");
      await expect(t.action(ask, { query })).rejects.toThrow("2 to 200");
    }
    expect(fetcher).not.toHaveBeenCalled();
    expect(await t.run((ctx) => ctx.db.query("rateLimits").collect())).toEqual([]);
    expect(await t.action(search, { query: "  ab\n" })).toEqual([]);
    expect(await t.action(ask, { query: `  ${"x".repeat(200)}  ` })).toEqual({ kind: "abstain", sources: [] });
    const rows = await t.run((ctx) => ctx.db.query("rateLimits").collect());
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.key === "askolia-web-demo" && row.action === "request" && row.expiresAt === row.timestamp + day)).toBe(true);
  });

  test("rejects caller-controlled identifiers, limits and status keys", async () => {
    const t = setup();
    const fetcher = stubSearchAndAsk();
    await expect(t.action(search, { query: "Convex", key: "another-budget", limit: 20 } as { query: string })).rejects.toThrow();
    await expect(t.action(ask, { query: "Convex", clientId: "another-client" } as { query: string })).rejects.toThrow();
    await expect(t.query(status, { key: "unrelated-document" } as never)).rejects.toThrow();
    await expect(t.mutation(reserve, { key: "another-budget", action: "ask" } as never)).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
    expect(await t.run((ctx) => ctx.db.query("rateLimits").collect())).toEqual([]);
  });

  test("shares the 12-request rolling minute across search and ask at the exact boundary", async () => {
    const t = setup();
    const fetcher = stubSearchAndAsk();
    const start = Date.now();
    for (let i = 0; i < 12; i++) {
      if (i % 2) await t.action(ask, { query: "What is Askolia?" });
      else await t.action(search, { query: "Convex component" });
    }
    for (const endpoint of [search, ask]) {
      await expect(t.action(endpoint, { query: "Convex component" })).rejects.toThrow("demo request limit");
    }
    vi.setSystemTime(start + minute - 1);
    await expect(t.action(search, { query: "Convex component" })).rejects.toThrow("demo request limit");
    expect(fetcher).toHaveBeenCalledTimes(12);
    vi.setSystemTime(start + minute);
    await t.action(ask, { query: "What is Askolia?" });
    expect(fetcher).toHaveBeenCalledTimes(13);
    expect(await t.run((ctx) => ctx.db.query("rateLimits").collect())).toHaveLength(13);
  });

  test("enforces 100 requests per rolling day, cleans expired rows and preserves other buckets", async () => {
    const t = setup();
    const fetcher = stubSearchAndAsk();
    const start = Date.now();
    const unrelated = await t.run((ctx) => ctx.db.insert("rateLimits", {
      key: "another-feature", action: "request", timestamp: start - day, expiresAt: start,
    }));
    for (let i = 0; i < 100; i++) {
      vi.setSystemTime(start + Math.floor(i / 12) * minute);
      if (i % 2) await t.action(ask, { query: "What is Askolia?" });
      else await t.action(search, { query: "Convex component" });
    }
    vi.setSystemTime(start + day - 1);
    await expect(t.action(search, { query: "Convex component" })).rejects.toThrow("demo request limit");
    await expect(t.action(ask, { query: "What is Askolia?" })).rejects.toThrow("demo request limit");
    expect(fetcher).toHaveBeenCalledTimes(100);
    vi.setSystemTime(start + day);
    await t.action(search, { query: "Convex component" });
    expect(await t.run((ctx) => ctx.db.query("rateLimits").collect())).toHaveLength(90);
    vi.setSystemTime(start + 2 * day);
    await t.action(search, { query: "Convex component" });
    const rows = await t.run((ctx) => ctx.db.query("rateLimits").collect());
    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row._id === unrelated)).toBeDefined();
    expect(rows.filter((row) => row.key === "askolia-web-demo")).toHaveLength(1);
  });

  test("fails closed on oversized buckets and commits only bounded expired-row cleanup", async () => {
    const t = setup();
    const fetcher = stubSearchAndAsk();
    await t.run(async (ctx) => {
      for (let i = 0; i < 104; i++) {
        await ctx.db.insert("rateLimits", {
          key: "askolia-web-demo", action: "request", timestamp: Date.now() - day, expiresAt: Date.now(),
        });
      }
    });
    await expect(t.action(search, { query: "Convex component" })).rejects.toThrow("demo request limit");
    expect(fetcher).not.toHaveBeenCalled();
    expect(await t.run((ctx) => ctx.db.query("rateLimits").collect())).toHaveLength(3);
    await t.action(search, { query: "Convex component" });
    expect(await t.run((ctx) => ctx.db.query("rateLimits").collect())).toHaveLength(1);
  });

  test("preserves search sources, answer, abstain and unavailable, and charges failed calls", async () => {
    const t = setup();
    const sources = [{ _id: "public-document", question: "License", answer: "MIT", url: "https://github.com/Appik-Studio/askolia-convex" }];
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(sources)));
    expect(await t.action(search, { query: "License" })).toEqual(sources);
    for (const result of [
      { kind: "answer", answer: "The component uses the MIT license [1].", sources },
      { kind: "abstain", sources: [] },
      { kind: "unavailable", sources: [] },
    ]) {
      vi.stubGlobal("fetch", vi.fn(async () => Response.json(result)));
      expect(await t.action(ask, { query: "What is the license?" })).toEqual(result);
    }
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 503 })));
    await expect(t.action(ask, { query: "What is the license?" })).rejects.toThrow("HTTP 503");
    expect(await t.run((ctx) => ctx.db.query("rateLimits").collect())).toHaveLength(5);
  });

  test("seeds stable public documents and projects only their latest safe states", async () => {
    const t = setup();
    const initial = await t.query(status, {});
    expect(initial.map((state) => state.key)).toEqual(keys);
    expect(initial.every((state) => state.status === "not_synced" && state.revision === 0)).toBe(true);
    const deliveries: Record<string, unknown>[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: unknown, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      deliveries.push(body);
      return Response.json({ revision: body.revision, documentId: "remote-document-do-not-expose", deleted: false });
    }));
    for (const revision of [1, 2]) {
      expect(await t.mutation(seed, {})).toEqual(keys.map((key) => ({ key, revision })));
      expect((await t.query(status, {})).every((state) => state.status === "pending" && state.revision === revision)).toBe(true);
      await t.finishAllScheduledFunctions(vi.runAllTimers);
    }
    expect(deliveries).toHaveLength(6);
    expect(new Set(deliveries.map((body) => `${body.namespace}/${body.key}`)).size).toBe(3);
    for (const body of deliveries) {
      expect(String(body.content)).toContain("https://github.com/Appik-Studio/askolia-convex");
      expect(body).not.toHaveProperty("url");
    }
    await t.run(async (ctx) => {
      await ctx.runMutation(components.askolia.sync.syncDocument, { key: "unrelated-document", title: "Private title", content: "Private content" });
      await ctx.runMutation(components.askolia.sync.syncDocument, { key: "demo:convex:unlisted", title: "Unlisted title", content: "Unlisted content" });
    });
    const synced = await t.query(status, {});
    expect(synced).toHaveLength(3);
    for (const state of synced) {
      expect(Object.keys(state).sort()).toEqual(["key", "lastSyncedAt", "revision", "status", "title"]);
      expect(state).toMatchObject({ revision: 2, status: "synced" });
      expect(state.lastSyncedAt).toBeTypeOf("number");
    }
    expect(JSON.stringify(synced)).not.toMatch(/remote-document|Private|Unlisted|namespace|lastError|documentId|API_KEY|projectId/);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 401 })));
    await t.mutation(seed, {});
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const failed = await t.query(status, {});
    expect(failed.every((state) => state.status === "failed" && state.revision === 3)).toBe(true);
    expect(failed.every((state) => !Object.hasOwn(state, "lastError"))).toBe(true);
    expect(await t.run((ctx) => ctx.db.query("rateLimits").collect())).toEqual([]);
  });
});
