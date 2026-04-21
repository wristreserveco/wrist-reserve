/**
 * Pushes non-empty keys from .env.local to Vercel Production.
 * Run from repo root: node scripts/sync-vercel-env.cjs
 * Requires: `npx vercel link` and local login (`npx vercel login`).
 */
const { readFileSync } = require("fs");
const { join } = require("path");
const { execFileSync } = require("child_process");

const root = join(__dirname, "..");
const envPath = join(root, ".env.local");

let text;
try {
  text = readFileSync(envPath, "utf8");
} catch {
  console.error("Missing .env.local — copy from .env.example and fill in values.");
  process.exit(1);
}

function runVercelEnvAdd(key, value) {
  execFileSync(
    "npx",
    ["vercel", "env", "add", key, "production", "--value", value, "--yes", "--force"],
    { cwd: root, stdio: "inherit" }
  );
}

for (const line of text.split("\n")) {
  const trimmed = line.replace(/\r$/, "").trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eq = trimmed.indexOf("=");
  if (eq === -1) continue;
  const key = trimmed.slice(0, eq).trim();
  let val = trimmed.slice(eq + 1).trim();
  if (!val) continue;
  if (key === "NEXT_PUBLIC_SITE_URL") {
    val = "https://wristreserve.co";
  }
  console.log(`\n→ ${key}`);
  runVercelEnvAdd(key, val);
}

console.log("\nDone. Run: npx vercel env ls");
