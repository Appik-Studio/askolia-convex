import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { internal } from "../example/convex/_generated/api.js";
import hostSchema from "../example/convex/schema.js";
import componentSchema from "../src/component/schema.js";

const hostModules = import.meta.glob("../example/convex/**/*.{js,ts}");
const componentModules = import.meta.glob("../src/component/**/*.ts");
const demo = internal.demo;

function setup() {
  const t = convexTest(hostSchema, hostModules);
  t.registerComponent("askolia", componentSchema, componentModules);
  return t;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv("ASKOLIA_URL", "https://askolia-test.convex.site");
  vi.stubEnv("ASKOLIA_API_KEY", "demo-test-key");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("internal CLI demo", () => {
  test("syncs, searches and removes across reruns using the same key and namespace", async () => {
    const t = setup();
    const source = {
      _id: "demo-document",
      question: "Demo shipping policy",
      answer: "Demo orders ship within two business days. Demo shipping is free.",
    };
    let published = false;
    const identities = new Set<string>();
    const fetcher = vi.fn(async (url: unknown, init: RequestInit) => {
      expect(init.headers).toMatchObject({ Authorization: "Bearer demo-test-key" });
      const body = JSON.parse(String(init.body));
      const path = new URL(String(url)).pathname;
      if (path === "/api/v1/search") {
        expect(body).toEqual({ query: "demo shipping", locale: "en", limit: 5 });
        return Response.json(published ? [source] : []);
      }
      expect(["/api/v1/documents/sync", "/api/v1/documents/remove"]).toContain(path);
      identities.add(`${body.namespace}/${body.key}`);
      expect(body.key).toBe("demo:shipping");
      published = path.endsWith("/sync");
      if (published) expect(body).toMatchObject({ title: source.question, content: source.answer });
      return Response.json({
        revision: body.revision,
        documentId: published ? source._id : null,
        deleted: !published,
      });
    });
    vi.stubGlobal("fetch", fetcher);

    expect(await t.query(demo.status, {})).toBeNull();
    await expect(t.query(demo.verifyCleanup, { revision: 1 })).rejects.toThrow("not acknowledged");
    for (const revision of [1, 3]) {
      expect(await t.mutation(demo.sync, {})).toEqual({ key: "demo:shipping", revision });
      expect(await t.query(demo.status, {})).toMatchObject({ revision, operation: "upsert", status: "pending" });
      await t.finishAllScheduledFunctions(vi.runAllTimers);
      expect(await t.query(demo.status, {})).toMatchObject({ revision, operation: "upsert", status: "synced", documentId: source._id });
      expect(await t.action(demo.search, { query: "demo shipping" })).toEqual([source]);
      expect(await t.mutation(demo.remove, {})).toEqual({ key: "demo:shipping", revision: revision + 1 });
      await expect(t.query(demo.verifyCleanup, { revision: revision + 1 })).rejects.toThrow("not acknowledged");
      await t.finishAllScheduledFunctions(vi.runAllTimers);
      const removed = await t.query(demo.verifyCleanup, { revision: revision + 1 });
      expect(removed).toMatchObject({ revision: revision + 1, operation: "remove", status: "synced" });
      expect(removed).not.toHaveProperty("documentId");
      await expect(t.query(demo.verifyCleanup, { revision })).rejects.toThrow("not acknowledged");
      expect(await t.action(demo.search, { query: "demo shipping" })).toEqual([]);
    }
    expect(identities.size).toBe(1);
    expect(await t.run((ctx) => ctx.db.query("articles").take(1))).toEqual([]);
  });

  test("retries failed sync and removal without advancing their revisions", async () => {
    const t = setup();
    let fail = true;
    const fetcher = vi.fn(async (url: unknown, init: RequestInit) => {
      if (fail) return new Response(null, { status: 401 });
      const body = JSON.parse(String(init.body));
      const deleted = String(url).endsWith("/remove");
      return Response.json({ revision: body.revision, documentId: deleted ? null : "demo-document", deleted });
    });
    vi.stubGlobal("fetch", fetcher);

    for (const [operation, revision] of [["upsert", 1], ["remove", 2]] as const) {
      fail = true;
      await t.mutation(operation === "upsert" ? demo.sync : demo.remove, {});
      await t.finishAllScheduledFunctions(vi.runAllTimers);
      expect(await t.query(demo.status, {})).toMatchObject({ revision, operation, status: "failed", attempts: 1 });
      await expect(t.query(demo.verifyCleanup, { revision })).rejects.toThrow("not acknowledged");
      fail = false;
      expect(await t.mutation(demo.retry, {})).toBeNull();
      await t.finishAllScheduledFunctions(vi.runAllTimers);
      expect(await t.query(demo.status, {})).toMatchObject({ revision, operation, status: "synced", attempts: 1 });
    }
    expect(await t.query(demo.verifyCleanup, { revision: 2 })).toMatchObject({ operation: "remove", status: "synced" });
    expect(fetcher).toHaveBeenCalledTimes(4);
    await t.mutation(demo.retry, {});
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(fetcher).toHaveBeenCalledTimes(4);
  });

  test("preserves answer, abstain and unavailable, and propagates transport errors", async () => {
    const t = setup();
    const sources = [{ _id: "demo-document", question: "Demo shipping policy", answer: "Two business days." }];
    for (const result of [
      { kind: "answer", answer: "Two business days [1].", sources },
      { kind: "abstain", sources: [] },
      { kind: "unavailable", sources: [] },
    ]) {
      const fetcher = vi.fn(async (url: unknown, init: RequestInit) => {
        expect(String(url)).toBe("https://askolia-test.convex.site/api/v1/ask");
        expect(JSON.parse(String(init.body))).toEqual({ query: "When do demo orders ship?", locale: "en", clientId: "askolia-cli-demo" });
        return Response.json(result);
      });
      vi.stubGlobal("fetch", fetcher);
      expect(await t.action(demo.ask, { query: "When do demo orders ship?" })).toEqual(result);
    }
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 503 })));
    await expect(t.action(demo.ask, { query: "When do demo orders ship?" })).rejects.toThrow("HTTP 503");
  });
});
