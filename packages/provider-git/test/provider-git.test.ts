import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { GitProviderClient, buildCommitUrl, parseGitLogOutput, type GitCommandRunner } from "../src/index.js";

async function loadFixture(): Promise<string> {
  const url = new URL("./fixtures/git-log.fixture.txt", import.meta.url);
  const raw = await readFile(url, "utf-8");
  return raw.replaceAll("<FS>", "\u001f").replaceAll("<RS>", "\u001e");
}

describe("buildCommitUrl", () => {
  it("builds GitHub commit url", () => {
    const url = buildCommitUrl("git@github.com:owner/repo.git", "abc123");
    expect(url).toBe("https://github.com/owner/repo/commit/abc123");
  });

  it("returns undefined for unsupported remotes", () => {
    const url = buildCommitUrl("ssh://example.com/team/repo.git", "abc123");
    expect(url).toBeUndefined();
  });
});

describe("parseGitLogOutput", () => {
  it("parses git log records into commit events", async () => {
    const raw = await loadFixture();
    const events = parseGitLogOutput(raw, "owner/repo", "git@github.com:owner/repo.git");

    expect(events.length).toBe(2);
    expect(events[0]?.id).toBe("git:6f8a8a2");
    expect(events[1]?.id).toBe("git:9b7c1d3");
    expect(events[0]?.url).toContain("/commit/6f8a8a2");
    expect(events[0]?.type).toBe("commit");
  });
});

describe("GitProviderClient", () => {
  it("runs git config and git log, then normalizes events", async () => {
    const raw = await loadFixture();
    const commands: Array<{ args: string[]; cwd: string }> = [];

    const runner: GitCommandRunner = {
      async run(_command, args, cwd) {
        commands.push({ args, cwd });
        if (args[0] === "config") {
          return {
            stdout: "git@github.com:acme/repodigest.git\n",
            stderr: "",
            exitCode: 0
          };
        }
        return {
          stdout: raw,
          stderr: "",
          exitCode: 0
        };
      }
    };

    const client = new GitProviderClient(runner);
    const events = await client.fetchCommitEvents({
      repoPath: ".",
      since: "2026-02-13T00:00:00Z",
      until: "2026-02-15T00:00:00Z",
      maxCount: 20
    });

    expect(events.length).toBe(2);
    expect(events[0]?.repo).toBe("acme/repodigest");
    expect(commands[0]?.args.slice(0, 3)).toEqual(["config", "--get", "remote.origin.url"]);
    expect(commands[1]?.args[0]).toBe("log");
    expect(commands[1]?.args.some((arg) => arg.includes("--since=2026-02-13T00:00:00Z"))).toBe(true);
    expect(commands[1]?.args.some((arg) => arg.includes("--until=2026-02-15T00:00:00Z"))).toBe(true);
    expect(commands[1]?.args.some((arg) => arg.includes("--max-count=20"))).toBe(true);
  });
});

