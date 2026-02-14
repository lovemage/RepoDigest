import { spawn } from "node:child_process";
import { access, mkdtemp, rm } from "node:fs/promises";
import { constants } from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { performance } from "node:perf_hooks";
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

function percentile(sortedValues, p) {
  if (sortedValues.length === 0) {
    return 0;
  }
  const idx = Math.min(sortedValues.length - 1, Math.max(0, Math.ceil(sortedValues.length * p) - 1));
  return sortedValues[idx];
}

function runNode(scriptPath, scriptArgs, cwd, env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [scriptPath, ...scriptArgs], {
      cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });

    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });

    child.on("close", (code) => {
      resolve({
        code: code ?? 1,
        stdout,
        stderr
      });
    });
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const repo = args.repo ?? process.env.REPODIGEST_KPI_REPO;
  if (!repo || !/^[^/\s]+\/[^/\s]+$/.test(repo)) {
    throw new Error("Missing or invalid --repo owner/name (or REPODIGEST_KPI_REPO).");
  }

  if (!process.env.GITHUB_TOKEN) {
    throw new Error("GITHUB_TOKEN is required for onboarding KPI runs.");
  }

  const iterations = Number.parseInt(args.iterations ?? "5", 10);
  if (!Number.isFinite(iterations) || iterations <= 0) {
    throw new Error("--iterations must be a positive integer.");
  }

  const passRateGoal = Number.parseFloat(args.minSuccessRatio ?? "0.9");
  const maxMedianMs = Number.parseInt(args.maxMedianMs ?? "300000", 10);

  const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
  const cliPath = path.join(rootDir, "packages", "cli", "dist", "index.js");

  try {
    await access(cliPath, constants.F_OK);
  } catch {
    throw new Error("CLI build output not found. Run `npm run build` first.");
  }

  const durations = [];
  const failures = [];
  let successCount = 0;

  for (let i = 0; i < iterations; i += 1) {
    const sessionDir = await mkdtemp(path.join(os.tmpdir(), "repodigest-kpi-"));
    const start = performance.now();
    let success = false;
    let failureReason = "";

    try {
      const initResult = await runNode(
        cliPath,
        ["init", "--project", "--yes", "--repo", repo],
        sessionDir,
        process.env
      );

      if (initResult.code !== 0) {
        failureReason = `init failed (${initResult.code})`;
      } else {
        const todayResult = await runNode(
          cliPath,
          ["today", "--dry-run"],
          sessionDir,
          process.env
        );
        if (todayResult.code !== 0) {
          failureReason = `today failed (${todayResult.code})`;
        } else {
          success = true;
        }
      }
    } finally {
      const elapsedMs = Math.round(performance.now() - start);
      durations.push(elapsedMs);
      if (success) {
        successCount += 1;
      } else {
        failures.push(`run ${i + 1}: ${failureReason || "unknown failure"}`);
      }
      await rm(sessionDir, { recursive: true, force: true });
    }
  }

  const sortedDurations = [...durations].sort((a, b) => a - b);
  const medianMs = percentile(sortedDurations, 0.5);
  const p95Ms = percentile(sortedDurations, 0.95);
  const successRatio = successCount / iterations;

  console.log(`Onboarding KPI (${repo})`);
  console.log(`- Runs: ${iterations}`);
  console.log(`- Success ratio: ${(successRatio * 100).toFixed(1)}%`);
  console.log(`- Median time-to-first-digest: ${(medianMs / 1000).toFixed(2)}s`);
  console.log(`- P95 time-to-first-digest: ${(p95Ms / 1000).toFixed(2)}s`);

  if (failures.length > 0) {
    console.log("- Failures:");
    for (const entry of failures) {
      console.log(`  ${entry}`);
    }
  }

  if (successRatio < passRateGoal) {
    process.exitCode = 1;
    console.error(
      `Success ratio ${successRatio.toFixed(2)} is below target ${passRateGoal.toFixed(2)}.`
    );
    return;
  }

  if (medianMs > maxMedianMs) {
    process.exitCode = 1;
    console.error(
      `Median time ${medianMs}ms exceeds target ${maxMedianMs}ms.`
    );
  }
}

main().catch((error) => {
  process.exitCode = 1;
  const message = error instanceof Error ? error.message : String(error);
  console.error(`KPI onboarding check failed: ${message}`);
});
