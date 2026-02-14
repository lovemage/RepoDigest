import { spawn } from "node:child_process";
import path from "node:path";
import type { Event } from "@repodigest/core";

const FIELD_SEPARATOR = "\u001f";
const RECORD_SEPARATOR = "\u001e";

export interface GitCommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface GitCommandRunner {
  run(command: string, args: string[], cwd: string): Promise<GitCommandResult>;
}

export interface GitFetchOptions {
  repoPath?: string;
  since?: string;
  until?: string;
  author?: string;
  maxCount?: number;
}

function defaultGitRunner(): GitCommandRunner {
  return {
    run(command, args, cwd) {
      return new Promise<GitCommandResult>((resolve, reject) => {
        const child = spawn(command, args, {
          cwd,
          stdio: ["ignore", "pipe", "pipe"]
        });

        let stdout = "";
        let stderr = "";

        child.stdout.on("data", (chunk: Buffer) => {
          stdout += chunk.toString("utf-8");
        });

        child.stderr.on("data", (chunk: Buffer) => {
          stderr += chunk.toString("utf-8");
        });

        child.on("error", (error) => {
          reject(error);
        });

        child.on("close", (exitCode) => {
          resolve({
            stdout,
            stderr,
            exitCode: exitCode ?? 1
          });
        });
      });
    }
  };
}

function normalizeRepoFromRemote(remoteUrl: string): string | null {
  const normalized = remoteUrl.trim();
  const patterns = [
    /github\.com[:/](?<owner>[^/]+)\/(?<repo>[^/\s]+?)(?:\.git)?$/,
    /gitlab\.com[:/](?<owner>[^/]+)\/(?<repo>[^/\s]+?)(?:\.git)?$/,
    /bitbucket\.org[:/](?<owner>[^/]+)\/(?<repo>[^/\s]+?)(?:\.git)?$/
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    const owner = match?.groups?.owner;
    const repo = match?.groups?.repo;
    if (owner && repo) {
      return `${owner}/${repo}`;
    }
  }

  return null;
}

function repoFromPath(repoPath: string): string {
  return path.basename(path.resolve(repoPath));
}

export function buildCommitUrl(remoteUrl: string | null, sha: string): string | undefined {
  if (!remoteUrl) {
    return undefined;
  }

  const gh = remoteUrl.match(/github\.com[:/](?<owner>[^/]+)\/(?<repo>[^/\s]+?)(?:\.git)?$/);
  if (gh?.groups?.owner && gh.groups.repo) {
    return `https://github.com/${gh.groups.owner}/${gh.groups.repo}/commit/${sha}`;
  }

  const gl = remoteUrl.match(/gitlab\.com[:/](?<owner>[^/]+)\/(?<repo>[^/\s]+?)(?:\.git)?$/);
  if (gl?.groups?.owner && gl.groups.repo) {
    return `https://gitlab.com/${gl.groups.owner}/${gl.groups.repo}/-/commit/${sha}`;
  }

  return undefined;
}

export function parseGitLogOutput(
  raw: string,
  repo: string,
  remoteUrl: string | null = null
): Event[] {
  const records = raw
    .split(RECORD_SEPARATOR)
    .map((line) => line.trim())
    .filter(Boolean);

  const events: Event[] = [];
  for (const record of records) {
    const [sha, author, authoredAt, subject, body] = record.split(FIELD_SEPARATOR);
    if (!sha || !authoredAt || !subject) {
      continue;
    }

    const ts = new Date(authoredAt).toISOString();
    const url = buildCommitUrl(remoteUrl, sha);
    events.push({
      id: `git:${sha}`,
      provider: "git",
      repo,
      type: "commit",
      title: subject,
      ...(body?.trim() ? { body: body.trim() } : {}),
      ...(url ? { url } : {}),
      ...(author ? { author } : {}),
      timestamp: ts,
      fields: { sha }
    });
  }

  return events.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

async function runGitOrThrow(
  runner: GitCommandRunner,
  args: string[],
  cwd: string
): Promise<string> {
  const result = await runner.run("git", args, cwd);
  if (result.exitCode !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr.trim() || "unknown error"}`);
  }
  return result.stdout;
}

export class GitProviderClient {
  constructor(private readonly runner: GitCommandRunner = defaultGitRunner()) {}

  async fetchCommitEvents(options: GitFetchOptions = {}): Promise<Event[]> {
    const repoPath = options.repoPath ?? ".";

    let remoteUrl: string | null = null;
    try {
      const remoteRaw = await runGitOrThrow(this.runner, ["config", "--get", "remote.origin.url"], repoPath);
      const trimmed = remoteRaw.trim();
      remoteUrl = trimmed.length > 0 ? trimmed : null;
    } catch {
      remoteUrl = null;
    }

    const repo = remoteUrl ? normalizeRepoFromRemote(remoteUrl) ?? repoFromPath(repoPath) : repoFromPath(repoPath);

    const logArgs = [
      "log",
      "--date=iso-strict",
      `--pretty=format:%H${FIELD_SEPARATOR}%an${FIELD_SEPARATOR}%aI${FIELD_SEPARATOR}%s${FIELD_SEPARATOR}%b${RECORD_SEPARATOR}`
    ];

    if (options.since) {
      logArgs.push(`--since=${options.since}`);
    }
    if (options.until) {
      logArgs.push(`--until=${options.until}`);
    }
    if (options.author) {
      logArgs.push(`--author=${options.author}`);
    }
    if (options.maxCount && options.maxCount > 0) {
      logArgs.push(`--max-count=${options.maxCount}`);
    }

    const raw = await runGitOrThrow(this.runner, logArgs, repoPath);
    return parseGitLogOutput(raw, repo, remoteUrl);
  }
}

