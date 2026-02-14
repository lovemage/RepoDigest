import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) {
      continue;
    }
    const key = token.slice(2);
    const value = argv[i + 1];
    if (!value || value.startsWith("--")) {
      args[key] = "true";
      continue;
    }
    args[key] = value;
    i += 1;
  }
  return args;
}

function toPosix(filePath) {
  return filePath.replaceAll("\\", "/");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const hasThreshold = typeof args.threshold === "string";
  const threshold = hasThreshold ? Number.parseFloat(args.threshold) : 0;
  if (hasThreshold && (!Number.isFinite(threshold) || threshold <= 0 || threshold > 100)) {
    throw new Error("--threshold must be between 0 and 100.");
  }

  const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
  const summaryPath = path.join(rootDir, "coverage", "coverage-summary.json");
  const raw = await readFile(summaryPath, "utf-8");
  const summary = JSON.parse(raw);

  const targets = [
    { name: "core", match: "/packages/core/" },
    { name: "provider-github", match: "/packages/provider-github/" },
    { name: "cli", match: "/packages/cli/" }
  ];

  const aggregates = new Map(targets.map((target) => [target.name, { covered: 0, total: 0 }]));
  for (const [filePath, stats] of Object.entries(summary)) {
    if (filePath === "total") {
      continue;
    }

    const normalizedPath = `/${toPosix(filePath)}`;
    for (const target of targets) {
      if (!normalizedPath.includes(target.match)) {
        continue;
      }
      const bucket = aggregates.get(target.name);
      if (!bucket) {
        continue;
      }
      const lineStats = stats?.lines;
      if (!lineStats || typeof lineStats.covered !== "number" || typeof lineStats.total !== "number") {
        continue;
      }
      bucket.covered += lineStats.covered;
      bucket.total += lineStats.total;
    }
  }

  console.log(
    hasThreshold
      ? `Critical Path Coverage (threshold ${threshold.toFixed(1)}%)`
      : "Critical Path Coverage"
  );
  let hasFailure = false;
  for (const target of targets) {
    const bucket = aggregates.get(target.name);
    const total = bucket?.total ?? 0;
    const covered = bucket?.covered ?? 0;
    const percent = total > 0 ? (covered / total) * 100 : 0;
    const status = !hasThreshold || percent >= threshold ? "PASS" : "FAIL";
    console.log(`- ${target.name}: ${percent.toFixed(2)}% (${covered}/${total}) [${status}]`);
    if (hasThreshold && percent < threshold) {
      hasFailure = true;
    }
  }

  if (hasFailure) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  process.exitCode = 1;
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Coverage KPI failed: ${message}`);
});
