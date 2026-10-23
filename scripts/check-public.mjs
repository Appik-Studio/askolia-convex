import { lstat, readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
const rootFiles = new Set([".gitignore", ".env.example", "LICENSE", "README.md", "SECURITY.md", "convex.json", "package.json", "bun.lock", "tsconfig.json", "tsconfig.build.json", "vitest.config.ts"]);
const directories = new Set(["src", "test", "example", "docs", "scripts", ".github"]);
const failures = [];
let count = 0;

const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
const staged = new Map(git("ls-files", "--stage", "-z").split("\0").filter(Boolean).map((entry) => {
  const [metadata, relative] = entry.split("\t");
  return [relative, metadata.split(" ")[0]];
}));
const files = new Set(git("ls-files", "--cached", "--others", "--exclude-standard", "-z").split("\0").filter(Boolean));

async function inspect(relative) {
  const absolute = path.join(root, relative);
  const name = path.basename(relative);
  if (!rootFiles.has(relative) && !directories.has(relative.split("/")[0])) {
    failures.push(`${relative}: outside the public export allowlist`);
    return;
  }
  if ((/^\.env(?:\.|$)/.test(name) && name !== ".env.example") || name.endsWith(".log")) {
    failures.push(`${relative}: environment or log file`);
    return;
  }
  const stat = await lstat(absolute).catch((error) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  if (["120000", "160000"].includes(staged.get(relative)) || stat?.isSymbolicLink()) {
    failures.push(`${relative}: symbolic links and submodules are not permitted`);
    return;
  }
  const versions = [];
  if (staged.has(relative)) versions.push(git("show", `:${relative}`));
  if (stat?.isFile()) versions.push(await readFile(absolute, "utf8"));
  count++;
  for (const text of versions) {
    if (/(?:ghp_|github_pat_|sk_live_|sk_test_|rk_live_|rk_test_)[A-Za-z0-9_]{20,}|(?<![A-Za-z0-9])sk-[A-Za-z0-9_-]{20,}|(?:prod|dev):[a-z][a-z0-9-]+\|[A-Za-z0-9+/=_-]{20,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|askolia_[a-f0-9]{64}/.test(text)) failures.push(`${relative}: possible credential`);
    if (/\.\.\/\.\.\/backend\/|workspace:\*|github\.com\/Appik-Studio\/askolia(?:\.git|\/tree\/|\/blob\/)/.test(text)) failures.push(`${relative}: private application dependency or link`);
  }
}

for (const file of files) await inspect(file);
if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Public export check passed for ${count} files.`);
}
