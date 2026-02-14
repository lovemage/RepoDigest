import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import readline from "node:readline/promises";
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
    if (args[key]) {
      const current = Array.isArray(args[key]) ? args[key] : [args[key]];
      current.push(value);
      args[key] = current;
    } else {
      args[key] = value;
    }
    i += 1;
  }
  return args;
}

function resolveList(value) {
  if (!value) {
    return [];
  }
  if (Array.isArray(value)) {
    return value;
  }
  return [value];
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

function extractItems(dryRunText, limit) {
  const lines = dryRunText.split(/\r?\n/);
  const items = [];
  let section = "";
  for (const line of lines) {
    if (line.startsWith("## ")) {
      section = line.slice(3).trim();
      continue;
    }
    if (!line.startsWith("- ")) {
      continue;
    }
    if (line.trim() === "- (none)") {
      continue;
    }
    if (!section) {
      continue;
    }
    items.push({
      section,
      line: line.slice(2).trim()
    });
    if (items.length >= limit) {
      break;
    }
  }
  return items;
}

function buildReport({
  generatedAt,
  repo,
  items,
  participants,
  overall
}) {
  const lines = [];
  lines.push("# Explainability Session Report");
  lines.push("");
  lines.push(`- Generated at: ${generatedAt}`);
  lines.push(`- Repo: ${repo}`);
  lines.push(`- Items reviewed: ${items.length}`);
  lines.push(`- Participants: ${participants.length}`);
  lines.push(`- Overall pass ratio: ${(overall.passRatio * 100).toFixed(1)}% (${overall.passed}/${overall.total})`);
  lines.push("");
  lines.push("## Items");
  lines.push("");
  for (let i = 0; i < items.length; i += 1) {
    lines.push(`${i + 1}. [${items[i].section}] ${items[i].line}`);
  }
  lines.push("");
  lines.push("## Participant Results");
  lines.push("");
  for (const participant of participants) {
    lines.push(`### ${participant.name}`);
    lines.push(`- Pass ratio: ${(participant.passRatio * 100).toFixed(1)}% (${participant.passed}/${participant.total})`);
    lines.push("- Decisions:");
    for (let i = 0; i < participant.decisions.length; i += 1) {
      const decision = participant.decisions[i];
      lines.push(`  - Item ${i + 1}: ${decision.pass ? "pass" : "fail"}${decision.note ? ` (${decision.note})` : ""}`);
    }
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

async function ensureCliBuilt(rootDir) {
  const cliPath = path.join(rootDir, "packages", "cli", "dist", "index.js");
  try {
    await readFile(cliPath, "utf-8");
    return cliPath;
  } catch {
    throw new Error("CLI build output not found. Run `npm run build` first.");
  }
}

async function collectReview(rl, reviewer, items) {
  const decisions = [];
  console.log(`\nReviewer: ${reviewer}`);
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    console.log(`${i + 1}/${items.length} [${item.section}] ${item.line}`);
    const answer = (await rl.question("Can reviewer explain why this item is in this section? (y/n): ")).trim().toLowerCase();
    const pass = answer === "y" || answer === "yes";
    const note = (await rl.question("Optional note (Enter to skip): ")).trim();
    decisions.push({ pass, note });
  }

  const passed = decisions.filter((entry) => entry.pass).length;
  return {
    name: reviewer,
    decisions,
    passed,
    total: decisions.length,
    passRatio: decisions.length > 0 ? passed / decisions.length : 0
  };
}

function parseAnswersFile(raw, items) {
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.reviewers)) {
    throw new Error("answersFile must contain { reviewers: [...] }.");
  }

  return parsed.reviewers.map((reviewer) => {
    if (!reviewer || typeof reviewer !== "object" || typeof reviewer.name !== "string") {
      throw new Error("Each reviewer entry must include a `name` string.");
    }
    if (!Array.isArray(reviewer.decisions)) {
      throw new Error(`Reviewer ${reviewer.name} must include decisions array.`);
    }

    const decisions = reviewer.decisions.slice(0, items.length).map((decision) => {
      if (!decision || typeof decision !== "object") {
        return { pass: false, note: "" };
      }
      return {
        pass: Boolean(decision.pass),
        note: typeof decision.note === "string" ? decision.note.trim() : ""
      };
    });

    while (decisions.length < items.length) {
      decisions.push({ pass: false, note: "" });
    }

    const passed = decisions.filter((entry) => entry.pass).length;
    return {
      name: reviewer.name,
      decisions,
      passed,
      total: decisions.length,
      passRatio: decisions.length > 0 ? passed / decisions.length : 0
    };
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dryRunFile = typeof args.dryRunFile === "string" ? args.dryRunFile : "";
  const repo = args.repo ?? process.env.REPODIGEST_KPI_REPO ?? "from-dry-run-file";
  if (!dryRunFile && !/^[^/\s]+\/[^/\s]+$/.test(repo)) {
    throw new Error("Missing or invalid --repo owner/name (or REPODIGEST_KPI_REPO).");
  }

  const reviewers = resolveList(args.reviewer);
  const answersFile = typeof args.answersFile === "string" ? args.answersFile : "";

  const itemLimit = Number.parseInt(args.items ?? "5", 10);
  if (!Number.isFinite(itemLimit) || itemLimit <= 0) {
    throw new Error("--items must be a positive integer.");
  }

  const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
  const runDir = await mkdtemp(path.join(os.tmpdir(), "repodigest-explainability-"));

  try {
    let dryRunOutput = "";
    if (dryRunFile) {
      dryRunOutput = await readFile(path.resolve(rootDir, dryRunFile), "utf-8");
    } else {
      if (!process.env.GITHUB_TOKEN) {
        throw new Error("GITHUB_TOKEN is required when --dryRunFile is not provided.");
      }
      const cliPath = await ensureCliBuilt(rootDir);
      const initResult = await runNode(
        cliPath,
        ["init", "--project", "--yes", "--repo", repo],
        runDir,
        process.env
      );
      if (initResult.code !== 0) {
        throw new Error(`init failed: ${initResult.stderr || initResult.stdout}`);
      }

      const dryRun = await runNode(
        cliPath,
        ["today", "--dry-run"],
        runDir,
        process.env
      );
      if (dryRun.code !== 0) {
        throw new Error(`today --dry-run failed: ${dryRun.stderr || dryRun.stdout}`);
      }
      dryRunOutput = dryRun.stdout;
    }

    const items = extractItems(dryRunOutput, itemLimit);
    if (items.length === 0) {
      throw new Error("No digest items found in dry-run output.");
    }

    let participants = [];
    if (answersFile) {
      const rawAnswers = await readFile(path.resolve(rootDir, answersFile), "utf-8");
      participants = parseAnswersFile(rawAnswers, items);
      if (reviewers.length > 0) {
        const allowed = new Set(reviewers);
        participants = participants.filter((participant) => allowed.has(participant.name));
      }
      if (participants.length === 0) {
        throw new Error("No participant records found from answersFile after reviewer filtering.");
      }
    } else {
      if (reviewers.length === 0) {
        throw new Error("At least one --reviewer is required unless --answersFile is used.");
      }

      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });

      try {
        for (const reviewer of reviewers) {
          participants.push(await collectReview(rl, reviewer, items));
        }
      } finally {
        rl.close();
      }
    }

    const passed = participants.reduce((sum, participant) => sum + participant.passed, 0);
    const total = participants.reduce((sum, participant) => sum + participant.total, 0);
    const overall = {
      passed,
      total,
      passRatio: total > 0 ? passed / total : 0
    };

    const now = new Date();
    const stamp = now.toISOString().slice(0, 10);
    const outDir = path.join(rootDir, "repodigest", "kpi");
    await mkdir(outDir, { recursive: true });
    const outPath = path.join(outDir, `explainability-${stamp}.md`);
    const report = buildReport({
      generatedAt: now.toISOString(),
      repo,
      items,
      participants,
      overall
    });
    await writeFile(outPath, report, "utf-8");

    console.log(`\nExplainability report written: ${outPath}`);
    console.log(`Overall pass ratio: ${(overall.passRatio * 100).toFixed(1)}% (${overall.passed}/${overall.total})`);
  } finally {
    await rm(runDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  process.exitCode = 1;
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Explainability session failed: ${message}`);
});
