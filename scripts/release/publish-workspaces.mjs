#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { copyFile, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const workspaceOrder = [
  "packages/core",
  "packages/provider-github",
  "packages/provider-git",
  "packages/renderer-internal",
  "packages/renderer-threads",
  "packages/renderer-x",
  "packages/cli"
];
const npmRegistry = "https://registry.npmjs.org/";

function parseArgs(argv) {
  const result = {
    dryRun: false,
    skipChecks: false,
    strictAuthCheck: false,
    skipAuthCheck: false,
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
    if (arg === "--strict-auth-check") {
      result.strictAuthCheck = true;
      continue;
    }
    if (arg === "--skip-auth-check") {
      result.skipAuthCheck = true;
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
  return "npm";
}

function toInvocation(command, args) {
  if (process.platform === "win32") {
    return {
      cmd: "cmd",
      args: ["/c", command, ...args]
    };
  }
  return { cmd: command, args };
}

function run(command, args, options = {}) {
  const printable = `${command} ${args.join(" ")}`;
  const prefix = options.cwd ? `${options.cwd}> ` : "";
  console.log(`\n> ${prefix}${printable}`);
  if (options.dryRun) {
    return { status: 0 };
  }

  const invocation = toInvocation(command, args);
  const result = spawnSync(invocation.cmd, invocation.args, {
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf-8",
    shell: false,
    ...(options.cwd ? { cwd: options.cwd } : {})
  });
  if (result.stdout) {
    process.stdout.write(result.stdout);
  }
  if (result.stderr) {
    process.stderr.write(result.stderr);
  }
  return result;
}

function runOrThrow(command, args, options = {}) {
  const result = run(command, args, options);
  if (result.error) {
    throw new Error(
      `Command failed: ${command} ${args.join(" ")} (${result.error.message})`
    );
  }
  if ((result.status ?? 1) !== 0) {
    throw new Error(
      `Command failed: ${command} ${args.join(" ")} (exit=${result.status ?? "unknown"})`
    );
  }
}

function isAlreadyPublished(result) {
  const combined = `${result.stdout ?? ""}\n${result.stderr ?? ""}`.toLowerCase();
  return combined.includes("cannot publish over the previously published versions");
}

function runPublishOrThrow(command, args, options = {}) {
  const result = run(command, args, options);
  if (result.error) {
    throw new Error(
      `Command failed: ${command} ${args.join(" ")} (${result.error.message})`
    );
  }
  if ((result.status ?? 1) === 0) {
    return;
  }
  if (isAlreadyPublished(result)) {
    console.log("Version already published; skipping this workspace.");
    return;
  }
  throw new Error(
    `Command failed: ${command} ${args.join(" ")} (exit=${result.status ?? "unknown"})`
  );
}

function parsePackFilename(stdout) {
  const text = stdout ?? "";
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed) && parsed[0] && typeof parsed[0].filename === "string") {
      return parsed[0].filename;
    }
  } catch {
    // fallback below
  }

  const match = text.match(/([A-Za-z0-9._-]+\.tgz)/g);
  if (match && match.length > 0) {
    return match[match.length - 1];
  }
  throw new Error("Unable to determine npm pack filename.");
}

function checkWhoami(command) {
  const invocation = toInvocation(command, ["whoami", "--registry", npmRegistry]);

  const result = spawnSync(invocation.cmd, invocation.args, {
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf-8",
    shell: false,
    timeout: 15000
  });

  if (result.error) {
    return {
      ok: false,
      reason: `whoami check error: ${result.error.message}`
    };
  }

  if ((result.status ?? 1) !== 0) {
    const stderr = (result.stderr ?? "").trim();
    return {
      ok: false,
      reason: stderr || "whoami returned non-zero exit code"
    };
  }

  return { ok: true };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const npm = npmExecutable();
  const repoRoot = process.cwd();

  console.log("RepoDigest release publish helper");
  console.log(`Dry run: ${options.dryRun ? "yes" : "no"}`);
  console.log(`Tag: ${options.tag}`);

  if (!options.skipAuthCheck) {
    console.log(`\n> ${npm} whoami --registry ${npmRegistry}`);
    const authCheck = checkWhoami(npm);
    if (!authCheck.ok) {
      const message =
        `npm whoami check failed for ${npmRegistry} (${authCheck.reason}). ` +
        "Will continue and let npm publish return the real auth error if any.";
      if (options.strictAuthCheck) {
        throw new Error(
          `${message} Run \`npm login --registry ${npmRegistry}\` and retry, or remove --strict-auth-check.`
        );
      }
      console.warn(`\nWarning: ${message}`);
    }
  } else {
    console.log("\nSkipping npm whoami auth check.");
  }

  if (!options.skipChecks) {
    runOrThrow(npm, ["run", "test"], options);
    runOrThrow(npm, ["run", "typecheck"], options);
    runOrThrow(npm, ["run", "build"], options);
  } else {
    console.log("\nSkipping test/typecheck/build checks.");
  }

  for (const workspace of workspaceOrder) {
    if (workspace === "packages/cli") {
      const packResult = run(npm, ["pack", "--json", "--workspaces=false"], {
        ...options,
        cwd: workspace
      });
      if (packResult.error) {
        throw new Error(`Command failed: npm pack (${packResult.error.message})`);
      }
      if ((packResult.status ?? 1) !== 0) {
        throw new Error(`Command failed: npm pack (exit=${packResult.status ?? "unknown"})`);
      }

      const tarball = parsePackFilename(packResult.stdout);
      const tarballPath = `${workspace}/${tarball}`;
      const tarballAbsolutePath = path.resolve(repoRoot, tarballPath);
      const publishCwd = await mkdtemp(path.join(os.tmpdir(), "repodigest-publish-"));
      const isolatedTarball = path.join(publishCwd, tarball);
      if (!options.dryRun) {
        await copyFile(tarballAbsolutePath, isolatedTarball);
      }
      const publishArgs = [
        "publish",
        tarball,
        "--tag",
        options.tag,
        "--registry",
        npmRegistry,
        "--workspaces=false"
      ];
      if (options.otp) {
        publishArgs.push("--otp", options.otp);
      }
      runPublishOrThrow(npm, publishArgs, { ...options, cwd: publishCwd });

      if (!options.dryRun) {
        try {
          await rm(tarballAbsolutePath, { force: true });
        } catch {
          // best-effort cleanup
        }
        try {
          await rm(publishCwd, { recursive: true, force: true });
        } catch {
          // best-effort cleanup
        }
      }
      continue;
    }

    const args = [
      "publish",
      "--access",
      "public",
      "--tag",
      options.tag,
      "--registry",
      npmRegistry,
      "--workspaces=false"
    ];
    if (options.otp) {
      args.push("--otp", options.otp);
    }
    runPublishOrThrow(npm, args, { ...options, cwd: workspace });
  }

  console.log("\nPublish flow completed.");
}

main().catch((error) => {
  console.error("\nPublish flow failed.");
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
