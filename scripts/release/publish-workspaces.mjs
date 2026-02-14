#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const workspaceOrder = [
  "packages/core",
  "packages/provider-github",
  "packages/provider-git",
  "packages/renderer-internal",
  "packages/renderer-threads",
  "packages/renderer-x",
  "packages/cli"
];

function parseArgs(argv) {
  const result = {
    dryRun: false,
    skipChecks: false,
    otp: process.env.NPM_OTP ?? "",
    tag: "latest"
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg) {
      continue;
    }
    if (arg === "--dry-run") {
      result.dryRun = true;
      continue;
    }
    if (arg === "--skip-checks") {
      result.skipChecks = true;
      continue;
    }
    if (arg === "--otp") {
      const value = argv[i + 1];
      if (!value) {
        throw new Error("Missing value for --otp");
      }
      result.otp = value;
      i += 1;
      continue;
    }
    if (arg === "--tag") {
      const value = argv[i + 1];
      if (!value) {
        throw new Error("Missing value for --tag");
      }
      result.tag = value;
      i += 1;
      continue;
    }

    throw new Error(`Unknown option: ${arg}`);
  }

  return result;
}

function npmExecutable() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function run(command, args, options = {}) {
  const printable = `${command} ${args.join(" ")}`;
  console.log(`\n> ${printable}`);
  if (options.dryRun) {
    return { status: 0 };
  }

  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: false
  });
  return result;
}

function runOrThrow(command, args, options = {}) {
  const result = run(command, args, options);
  if ((result.status ?? 1) !== 0) {
    throw new Error(`Command failed: ${command} ${args.join(" ")}`);
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const npm = npmExecutable();

  console.log("RepoDigest release publish helper");
  console.log(`Dry run: ${options.dryRun ? "yes" : "no"}`);
  console.log(`Tag: ${options.tag}`);

  runOrThrow(npm, ["whoami"], options);

  if (!options.skipChecks) {
    runOrThrow(npm, ["run", "test"], options);
    runOrThrow(npm, ["run", "typecheck"], options);
    runOrThrow(npm, ["run", "build"], options);
  } else {
    console.log("\nSkipping test/typecheck/build checks.");
  }

  for (const workspace of workspaceOrder) {
    const args = ["publish", "--workspace", workspace, "--access", "public", "--tag", options.tag];
    if (options.otp) {
      args.push("--otp", options.otp);
    }
    runOrThrow(npm, args, options);
  }

  console.log("\nPublish flow completed.");
}

main().catch((error) => {
  console.error("\nPublish flow failed.");
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
