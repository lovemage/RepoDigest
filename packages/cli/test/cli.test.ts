import { mkdtemp, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runCli } from "../src/index.js";
import type { GithubDeviceAuthClientLike } from "../src/auth.js";
import type { PromptAdapter } from "../src/init.js";
import type { Event } from "@repodigest/core";

const tempDirs: string[] = [];
let originalGithubToken: string | undefined;
let originalAgentruleHome: string | undefined;

beforeEach(() => {
  originalGithubToken = process.env.GITHUB_TOKEN;
  originalAgentruleHome = process.env.AGENTRULE_HOME;
});

afterEach(async () => {
  const { rm } = await import("node:fs/promises");
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs.length = 0;

  if (typeof originalGithubToken === "undefined") {
    delete process.env.GITHUB_TOKEN;
  } else {
    process.env.GITHUB_TOKEN = originalGithubToken;
  }

  if (typeof originalAgentruleHome === "undefined") {
    delete process.env.AGENTRULE_HOME;
  } else {
    process.env.AGENTRULE_HOME = originalAgentruleHome;
  }
});

function createMockIO() {
  const logs: string[] = [];
  const errors: string[] = [];
  return {
    io: {
      log: (message: string) => logs.push(message),
      error: (message: string) => errors.push(message)
    },
    logs,
    errors
  };
}

function createPromptAdapter(values: {
  installTarget?: "project" | "agentrule";
  components: string[];
  tokenSource: "env" | "input" | "browser";
  repos: string[];
  lang: "zh-TW" | "en" | "both";
  timezone: string;
  token?: string;
}): PromptAdapter {
  let inputCount = 0;
  return {
    checkbox: async () => values.components,
    select: async (options) => {
      const message = typeof options.message === "string" ? options.message : "";
      if (message.includes("Install target")) {
        return values.installTarget ?? "project";
      }
      if (message.includes("token")) {
        return values.tokenSource;
      }
      return values.lang;
    },
    input: async (options) => {
      const message = typeof options.message === "string" ? options.message : "";
      if (message.includes("Repository")) {
        const next = values.repos[inputCount] ?? "";
        inputCount += 1;
        return next;
      }
      return values.timezone;
    },
    password: async () => values.token ?? ""
  };
}

describe("runCli", () => {
  it("validates existing config", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "repodigest-cli-"));
    tempDirs.push(dir);

    const { writeFile } = await import("node:fs/promises");
    await writeFile(
      path.join(dir, ".repodigest.yml"),
      "timezone: UTC\nscope:\n  repos:\n    - owner/repo\n",
      "utf-8"
    );

    process.env.GITHUB_TOKEN = "ghp_token";
    const { io, logs } = createMockIO();
    const code = await runCli(["validate"], dir, { io });
    expect(code).toBe(0);
    expect(logs[0]).toBe("Config is valid.");
  });

  it("runs init wizard and generates selected files", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "repodigest-cli-"));
    tempDirs.push(dir);

    const prompts = createPromptAdapter({
      installTarget: "project",
      components: ["all"],
      tokenSource: "input",
      repos: ["owner/repo-a", "owner/repo-b"],
      lang: "zh-TW",
      timezone: "Asia/Taipei",
      token: "ghp_test_token"
    });

    const { io } = createMockIO();
    const code = await runCli(["init"], dir, { io, prompts });
    expect(code).toBe(0);

    const config = await readFile(path.join(dir, ".repodigest.yml"), "utf-8");
    const env = await readFile(path.join(dir, ".env"), "utf-8");
    const tasks = await readFile(path.join(dir, ".vscode", "tasks.json"), "utf-8");
    const workflow = await readFile(path.join(dir, ".github", "workflows", "repodigest.yml"), "utf-8");

    expect(config).toMatch("timezone: Asia/Taipei");
    expect(config).toMatch("- owner/repo-a");
    expect(config).toMatch("- owner/repo-b");
    expect(env).toMatch("GITHUB_TOKEN=ghp_test_token");
    expect(tasks).toMatch("RepoDigest: Today");
    expect(workflow).toMatch("RepoDigest Daily");
  });

  it("creates digest files with today command", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "repodigest-cli-"));
    tempDirs.push(dir);
    const { writeFile } = await import("node:fs/promises");

    await writeFile(
      path.join(dir, ".repodigest.yml"),
      "timezone: UTC\nscope:\n  repos:\n    - owner/repo\n",
      "utf-8"
    );

    process.env.GITHUB_TOKEN = "ghp_token";

    const mockEvents: Event[] = [
      {
        id: "issue:101:created",
        provider: "github",
        repo: "owner/repo",
        type: "issue_created",
        title: "Implement provider integration",
        url: "https://github.com/owner/repo/issues/101",
        timestamp: "2026-02-14T09:00:00Z",
        labels: ["enhancement"]
      }
    ];

    const { io } = createMockIO();
    const code = await runCli(["today"], dir, {
      io,
      createGithubProvider: () => ({
        fetchEvents: async () => mockEvents
      })
    });
    expect(code).toBe(0);

    const latest = await readFile(path.join(dir, "repodigest", "latest.md"), "utf-8");
    expect(latest).toMatch("# RepoDigest");
    expect(latest).toMatch("Implement provider integration");
  });

  it("supports one-line project init in non-interactive mode", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "repodigest-cli-"));
    tempDirs.push(dir);

    const { io } = createMockIO();
    const code = await runCli(
      ["init", "--project", "--yes", "--repo", "owner/repo-a", "--repo", "owner/repo-b"],
      dir,
      { io }
    );

    expect(code).toBe(0);
    const config = await readFile(path.join(dir, ".repodigest.yml"), "utf-8");
    expect(config).toMatch("owner/repo-a");
    expect(config).toMatch("owner/repo-b");
  });

  it("supports one-line global init to agentrule home", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "repodigest-cli-"));
    tempDirs.push(dir);
    const globalHome = path.join(dir, "global-home");
    process.env.AGENTRULE_HOME = globalHome;

    const { io } = createMockIO();
    const code = await runCli(
      ["init", "--agentrule", "--yes", "--repo", "owner/repo-global"],
      dir,
      { io }
    );

    expect(code).toBe(0);
    const configPath = path.join(globalHome, "repodigest", ".repodigest.yml");
    const config = await readFile(configPath, "utf-8");
    expect(config).toMatch("owner/repo-global");
  });

  it("runs browser auth during init when token-source is browser", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "repodigest-cli-"));
    tempDirs.push(dir);

    const mockAuthClient: GithubDeviceAuthClientLike = {
      requestDeviceCode: async () => ({
        deviceCode: "device-code",
        userCode: "ABCD-EFGH",
        verificationUri: "https://github.com/login/device",
        expiresIn: 120,
        interval: 0
      }),
      pollAccessToken: async () => ({
        status: "token",
        accessToken: "gho_browser_token"
      })
    };

    const { io } = createMockIO();
    const code = await runCli(
      [
        "init",
        "--project",
        "--yes",
        "--repo",
        "owner/repo-browser",
        "--token-source",
        "browser",
        "--client-id",
        "Iv1.test",
        "--no-browser"
      ],
      dir,
      {
        io,
        createGithubDeviceAuthClient: () => mockAuthClient
      }
    );

    expect(code).toBe(0);
    const env = await readFile(path.join(dir, ".env"), "utf-8");
    expect(env).toMatch("GITHUB_TOKEN=gho_browser_token");
  });

  it("delivers first digest from clean setup in one flow", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "repodigest-cli-"));
    tempDirs.push(dir);
    process.env.GITHUB_TOKEN = "ghp_token";

    const start = Date.now();
    const { io, logs } = createMockIO();

    const initCode = await runCli(
      ["init", "--project", "--yes", "--repo", "owner/repo"],
      dir,
      { io }
    );
    expect(initCode).toBe(0);

    const mockEvents: Event[] = [
      {
        id: "issue:401:created",
        provider: "github",
        repo: "owner/repo",
        type: "issue_created",
        title: "First digest onboarding",
        url: "https://github.com/owner/repo/issues/401",
        timestamp: "2026-02-14T09:00:00Z"
      }
    ];

    const todayCode = await runCli(["today", "--dry-run"], dir, {
      io,
      createGithubProvider: () => ({
        fetchEvents: async () => mockEvents
      })
    });
    expect(todayCode).toBe(0);
    expect(Date.now() - start).toBeLessThan(5 * 60 * 1000);
    expect(logs.join("\n")).toMatch("First digest onboarding");
  });

  it("creates range digest files with monday shortcut", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "repodigest-cli-"));
    tempDirs.push(dir);
    const { writeFile } = await import("node:fs/promises");

    await writeFile(
      path.join(dir, ".repodigest.yml"),
      "timezone: UTC\nscope:\n  repos:\n    - owner/repo\n",
      "utf-8"
    );

    process.env.GITHUB_TOKEN = "ghp_token";

    const mockEvents: Event[] = [
      {
        id: "pr:201:opened",
        provider: "github",
        repo: "owner/repo",
        type: "pr_opened",
        title: "Add range command support",
        url: "https://github.com/owner/repo/pull/201",
        timestamp: "2026-02-14T09:00:00Z",
        labels: ["enhancement"]
      }
    ];

    let capturedSince = "";
    let capturedUntil = "";
    const { io } = createMockIO();
    const code = await runCli(["range", "--since", "monday", "--until", "today"], dir, {
      io,
      createGithubProvider: () => ({
        fetchEvents: async (options) => {
          capturedSince = options.since ?? "";
          capturedUntil = options.until ?? "";
          return mockEvents;
        }
      })
    });
    expect(code).toBe(0);

    expect(capturedSince).not.toBe("");
    expect(capturedUntil).not.toBe("");
    expect(new Date(capturedSince).getTime()).toBeLessThanOrEqual(new Date(capturedUntil).getTime());

    const rangeDir = path.join(dir, "repodigest", "range");
    const files = await readdir(rangeDir);
    expect(files.length).toBe(1);

    const rangeOutput = await readFile(path.join(rangeDir, files[0]), "utf-8");
    expect(rangeOutput).toMatch("Add range command support");
  });

  it("fails range when --since is missing", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "repodigest-cli-"));
    tempDirs.push(dir);
    const { writeFile } = await import("node:fs/promises");

    await writeFile(
      path.join(dir, ".repodigest.yml"),
      "timezone: UTC\nscope:\n  repos:\n    - owner/repo\n",
      "utf-8"
    );

    process.env.GITHUB_TOKEN = "ghp_token";
    const { io, errors } = createMockIO();
    const code = await runCli(["range"], dir, { io });

    expect(code).toBe(1);
    expect(errors.join("\n")).toMatch("Missing required option: --since");
  });

  it("supports preview mode for x target without writing files", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "repodigest-cli-"));
    tempDirs.push(dir);
    const { writeFile, access } = await import("node:fs/promises");
    const { constants } = await import("node:fs");

    await writeFile(
      path.join(dir, ".repodigest.yml"),
      "timezone: UTC\nscope:\n  repos:\n    - owner/repo\noutput:\n  target: internal\n",
      "utf-8"
    );
    process.env.GITHUB_TOKEN = "ghp_token";

    const mockEvents: Event[] = [
      {
        id: "issue:301:created",
        provider: "github",
        repo: "owner/repo",
        type: "issue_created",
        title: "Ship preview mode",
        url: "https://github.com/owner/repo/issues/301",
        timestamp: "2026-02-14T09:00:00Z",
        labels: ["enhancement"]
      }
    ];

    const { io, logs } = createMockIO();
    const code = await runCli(
      ["today", "--preview", "--target", "x", "--tone", "playful", "--lang", "zh-TW"],
      dir,
      {
        io,
        createGithubProvider: () => ({
          fetchEvents: async () => mockEvents
        })
      }
    );

    expect(code).toBe(0);
    expect(logs.join("\n")).toMatch("Preview target: x");
    expect(logs.join("\n")).toMatch("[Block 1/");

    await expect(access(path.join(dir, "repodigest", "latest.md"), constants.F_OK)).rejects.toBeDefined();
  });

  it("falls back to rule summarizer when plugin cannot be loaded", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "repodigest-cli-"));
    tempDirs.push(dir);
    const { writeFile } = await import("node:fs/promises");

    await writeFile(
      path.join(dir, ".repodigest.yml"),
      "timezone: UTC\nscope:\n  repos:\n    - owner/repo\noutput:\n  summarizerPlugin: ./missing-plugin.mjs\n",
      "utf-8"
    );
    process.env.GITHUB_TOKEN = "ghp_token";

    const mockEvents: Event[] = [
      {
        id: "issue:302:created",
        provider: "github",
        repo: "owner/repo",
        type: "issue_created",
        title: "Fallback summarizer still works",
        url: "https://github.com/owner/repo/issues/302",
        timestamp: "2026-02-14T09:00:00Z"
      }
    ];

    const { io, logs, errors } = createMockIO();
    const code = await runCli(["today", "--dry-run"], dir, {
      io,
      createGithubProvider: () => ({
        fetchEvents: async () => mockEvents
      })
    });

    expect(code).toBe(0);
    expect(errors.join("\n")).toMatch("Summarizer plugin disabled");
    expect(logs.join("\n")).toMatch("Fallback summarizer still works");
  });

  it("updates config values with update command", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "repodigest-cli-"));
    tempDirs.push(dir);
    const { writeFile } = await import("node:fs/promises");

    await writeFile(
      path.join(dir, ".repodigest.yml"),
      "timezone: UTC\nscope:\n  repos:\n    - owner/repo-a\noutput:\n  target: internal\n  lang: en\n  tone: calm\n",
      "utf-8"
    );

    const { io } = createMockIO();
    const code = await runCli(
      [
        "update",
        "--add-repo",
        "owner/repo-b",
        "--lang",
        "zh-TW",
        "--target",
        "x",
        "--tone",
        "playful",
        "--timezone",
        "Asia/Taipei"
      ],
      dir,
      { io }
    );

    expect(code).toBe(0);
    const updated = await readFile(path.join(dir, ".repodigest.yml"), "utf-8");
    expect(updated).toMatch("timezone: Asia/Taipei");
    expect(updated).toMatch("- owner/repo-a");
    expect(updated).toMatch("- owner/repo-b");
    expect(updated).toMatch("target: x");
    expect(updated).toMatch("lang: zh-TW");
    expect(updated).toMatch("tone: playful");
  });

  it("removes tracked repo with update command", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "repodigest-cli-"));
    tempDirs.push(dir);
    const { writeFile } = await import("node:fs/promises");

    await writeFile(
      path.join(dir, ".repodigest.yml"),
      "timezone: UTC\nscope:\n  repos:\n    - owner/repo-a\n    - owner/repo-b\n",
      "utf-8"
    );

    const { io } = createMockIO();
    const code = await runCli(["update", "--remove-repo", "owner/repo-a"], dir, { io });
    expect(code).toBe(0);

    const updated = await readFile(path.join(dir, ".repodigest.yml"), "utf-8");
    expect(updated).not.toMatch("- owner/repo-a");
    expect(updated).toMatch("- owner/repo-b");
  });

  it("requires --yes for remove command", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "repodigest-cli-"));
    tempDirs.push(dir);
    const { writeFile } = await import("node:fs/promises");

    await writeFile(
      path.join(dir, ".repodigest.yml"),
      "timezone: UTC\nscope:\n  repos:\n    - owner/repo\n",
      "utf-8"
    );

    const { io, errors } = createMockIO();
    const code = await runCli(["remove"], dir, { io });
    expect(code).toBe(1);
    expect(errors.join("\n")).toMatch("Refusing to remove files without --yes");
  });

  it("removes installed files with remove command", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "repodigest-cli-"));
    tempDirs.push(dir);
    const { writeFile, mkdir, access } = await import("node:fs/promises");
    const { constants } = await import("node:fs");

    await writeFile(
      path.join(dir, ".repodigest.yml"),
      "timezone: UTC\nscope:\n  repos:\n    - owner/repo\n",
      "utf-8"
    );
    await mkdir(path.join(dir, "repodigest"), { recursive: true });
    await writeFile(path.join(dir, "repodigest", "latest.md"), "# sample\n", "utf-8");
    await mkdir(path.join(dir, ".github", "workflows"), { recursive: true });
    await writeFile(path.join(dir, ".github", "workflows", "repodigest.yml"), "name: x\n", "utf-8");

    const { io } = createMockIO();
    const code = await runCli(["remove", "--yes"], dir, { io });
    expect(code).toBe(0);

    await expect(access(path.join(dir, ".repodigest.yml"), constants.F_OK)).rejects.toBeDefined();
    await expect(access(path.join(dir, "repodigest"), constants.F_OK)).rejects.toBeDefined();
    await expect(access(path.join(dir, ".github", "workflows", "repodigest.yml"), constants.F_OK)).rejects.toBeDefined();
  });

  it("stores token in .env with auth login device flow", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "repodigest-cli-"));
    tempDirs.push(dir);
    const { writeFile } = await import("node:fs/promises");
    await writeFile(
      path.join(dir, ".repodigest.yml"),
      "timezone: UTC\nscope:\n  repos:\n    - owner/repo\nproviders:\n  github:\n    tokenEnv: TEST_GH_TOKEN\n",
      "utf-8"
    );

    let pollCount = 0;
    const mockAuthClient: GithubDeviceAuthClientLike = {
      requestDeviceCode: async () => ({
        deviceCode: "device-code",
        userCode: "ABCD-EFGH",
        verificationUri: "https://github.com/login/device",
        verificationUriComplete: "https://github.com/login/device?user_code=ABCD-EFGH",
        expiresIn: 120,
        interval: 0
      }),
      pollAccessToken: async () => {
        pollCount += 1;
        if (pollCount === 1) {
          return { status: "pending" };
        }
        return { status: "token", accessToken: "gho_test_token" };
      }
    };

    const { io } = createMockIO();
    const code = await runCli(
      ["auth", "login", "--client-id", "Iv1.test", "--no-browser"],
      dir,
      {
        io,
        createGithubDeviceAuthClient: () => mockAuthClient
      }
    );

    expect(code).toBe(0);
    const env = await readFile(path.join(dir, ".env"), "utf-8");
    expect(env).toMatch("TEST_GH_TOKEN=gho_test_token");
  });

  it("removes token from .env with auth logout", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "repodigest-cli-"));
    tempDirs.push(dir);
    const { writeFile } = await import("node:fs/promises");
    await writeFile(
      path.join(dir, ".env"),
      "TEST_GH_TOKEN=gho_test_token\nOTHER_TOKEN=keep_me\n",
      "utf-8"
    );
    await writeFile(
      path.join(dir, ".repodigest.yml"),
      "timezone: UTC\nscope:\n  repos:\n    - owner/repo\nproviders:\n  github:\n    tokenEnv: TEST_GH_TOKEN\n",
      "utf-8"
    );

    const { io } = createMockIO();
    const code = await runCli(["auth", "logout"], dir, { io });
    expect(code).toBe(0);

    const env = await readFile(path.join(dir, ".env"), "utf-8");
    expect(env).not.toMatch("TEST_GH_TOKEN=");
    expect(env).toMatch("OTHER_TOKEN=keep_me");
  });

  it("fails auth login when client id is missing", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "repodigest-cli-"));
    tempDirs.push(dir);
    const { io, errors } = createMockIO();
    const code = await runCli(["auth", "login", "--no-browser"], dir, { io });
    expect(code).toBe(1);
    expect(errors.join("\n")).toMatch("Missing GitHub OAuth client id");
  });
});
