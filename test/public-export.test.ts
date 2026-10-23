// @vitest-environment node
import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), "askolia-public-check-"));
  mkdirSync(path.join(root, "scripts"));
  mkdirSync(path.join(root, "src"));
  copyFileSync(fileURLToPath(new URL("../scripts/check-public.mjs", import.meta.url)), path.join(root, "scripts/check-public.mjs"));
  writeFileSync(path.join(root, ".gitignore"), ".env*\n.DS_Store\n.convex/\n");
  execFileSync("git", ["init", "-q"], { cwd: root });
  return root;
}

function check(root: string) {
  return spawnSync(process.execPath, ["scripts/check-public.mjs"], { cwd: root, encoding: "utf8" });
}

test("allows gitignored local configuration but rejects files outside the public export", () => {
  const root = fixture();
  writeFileSync(path.join(root, ".env.local"), "LOCAL_SETTING=private-local-value\n");
  writeFileSync(path.join(root, ".DS_Store"), "local metadata");
  mkdirSync(path.join(root, ".convex"));
  writeFileSync(path.join(root, ".convex/state"), "local state");
  writeFileSync(path.join(root, "src/title.ts"), "export const title = 'ask-questions-about-delivery';\n");
  expect(check(root).status).toBe(0);
  mkdirSync(path.join(root, "backend"));
  writeFileSync(path.join(root, "backend/private.ts"), "export const privateCode = true;\n");
  const result = check(root);
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("outside the public export allowlist");
});

test("checks staged blobs even when the working file no longer contains the credential", () => {
  const root = fixture();
  const secret = "askolia_" + "a".repeat(64);
  const file = path.join(root, "src/probe.ts");
  writeFileSync(file, `export const token = ${JSON.stringify(secret)};\n`);
  execFileSync("git", ["add", "src/probe.ts"], { cwd: root });
  writeFileSync(file, "export const token = undefined;\n");
  const result = check(root);
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("possible credential");
  expect(result.stderr).not.toContain(secret);
});
