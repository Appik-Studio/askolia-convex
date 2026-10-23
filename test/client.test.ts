import { convexTest } from "convex-test";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { Askolia } from "../src/client/index.js";
import schema from "../src/component/schema.js";
import { components } from "../example/convex/_generated/api.js";

const modules = import.meta.glob("../src/component/**/*.ts");
const hostModules = import.meta.glob("../example/convex/**/*.{js,ts}");
const hostSchema = defineSchema({ posts: defineTable({ title: v.string() }) });

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv("ASKOLIA_URL", "https://askolia-test.convex.site");
  vi.stubEnv("ASKOLIA_API_KEY", "server-key");
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers(); });

function setup() {
  const t = convexTest(hostSchema, hostModules);
  t.registerComponent("askolia", schema, modules);
  return { t, askolia: new Askolia(components.askolia) };
}

describe("host application client", () => {
  test("rejects invalid search and ask inputs before making HTTP requests", async () => {
    const { t, askolia } = setup();
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    await expect(t.action((ctx) => askolia.search(ctx, { query: " " }))).rejects.toThrow("Query");
    await expect(t.action((ctx) => askolia.search(ctx, { query: "delivery", limit: 1.5 }))).rejects.toThrow("limit");
    await expect(t.action((ctx) => askolia.ask(ctx, { query: "delivery", clientId: "short" }))).rejects.toThrow("Client ID");
    expect(fetcher).not.toHaveBeenCalled();
    expect(await t.query((ctx) => askolia.listFailed(ctx, { paginationOpts: { numItems: 10, cursor: null } }))).toMatchObject({ page: [], isDone: true });
  });

  test("rolls back the outbox when the enclosing application mutation fails", async () => {
    const { t, askolia } = setup();
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    await expect(t.mutation(async (ctx) => {
      await ctx.db.insert("posts", { title: "Must roll back" });
      await askolia.syncDocument(ctx, { key: "a", title: "A", content: "Must roll back" });
      throw new Error("Host mutation failed");
    })).rejects.toThrow("Host mutation failed");
    expect(await t.query((ctx) => askolia.getSyncState(ctx, { key: "a" }))).toBeNull();
    expect(await t.run((ctx) => ctx.db.query("posts").collect())).toEqual([]);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(fetcher).not.toHaveBeenCalled();
  });

  test("forwards search and ask from actions with server-only credentials", async () => {
    const { t, askolia } = setup();
    const sources = [{ _id: "faq", question: "Delivery", answer: "Two days", url: "https://example.com/shipping" }];
    const fetcher = vi.fn(async (url: string | URL | Request, init: RequestInit) => {
      expect(init.headers).toMatchObject({ Authorization: "Bearer server-key" });
      expect(init.redirect).toBe("error");
      return Response.json(String(url).endsWith("/search") ? sources : { kind: "answer", answer: "Two days [1]", sources });
    });
    vi.stubGlobal("fetch", fetcher);
    expect(await t.action((ctx) => askolia.search(ctx, { query: "delivery", locale: "fr", limit: 4 }))).toEqual(sources);
    expect(await t.action((ctx) => askolia.ask(ctx, { query: "delivery", locale: "de", clientId: "visitor-1" }))).toEqual({ kind: "answer", answer: "Two days [1]", sources });
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1].body))).toEqual({ query: "delivery", locale: "fr", limit: 4 });
  });

  test("preserves abstention and unavailable outcomes", async () => {
    const { t, askolia } = setup();
    for (const kind of ["abstain", "unavailable"] as const) {
      vi.stubGlobal("fetch", vi.fn(async () => Response.json({ kind, sources: [] })));
      expect(await t.action((ctx) => askolia.ask(ctx, { query: "missing", clientId: "visitor-1" }))).toEqual({ kind, sources: [] });
    }
  });

  test("rejects redirects and unsafe or incomplete configuration", async () => {
    const { t, askolia } = setup();
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    vi.stubEnv("ASKOLIA_URL", "http://example.com");
    await expect(t.action((ctx) => askolia.search(ctx, { query: "delivery" }))).rejects.toThrow("HTTPS origin");
    expect(fetcher).not.toHaveBeenCalled();
  });
});
