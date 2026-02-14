import { mkdtemp, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runCli } from "../src/index.js";
import type { GithubDeviceAuthClientLike } from "../src/auth.js";
import type { PromptAdapter } from "../src/init.js";
import type { Event } from "@oceanads/core";

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
  repos: string[];
  repoSelection?: string[];
  lang: "zh-TW" | "en" | "both";
  timezone: string;
  clientId?: string;
  authorizeNow?: "yes" | "no";
  reinstallDecision?: "reinstall" | "cancel";
  summaryDefaultProfile?: "team" | "cus";
  enableAiSetup?: "yes" | "no";
  githubLogin?: string;
  aiBaseUrl?: string;
  aiModel?: string;
  aiApiKeyEnv?: string;
}): PromptAdapter {
  let inputCount = 0;
  return {
    checkbox: async (options) => {
      const message = typeof options.message === "string" ? options.message : "";
      if (message.includes("Select repositories to track")) {
        return values.repoSelection ?? [];
      }
      return values.components;
    },
    select: async (options) => {
      const message = typeof options.message === "string" ? options.message : "";
      if (message.includes("Install target")) {
        return values.installTarget ?? "project";
      }
      if (message.includes("Authorize now")) {
        return values.authorizeNow ?? "yes";
      }
      if (message.includes("Existing RepoDigest installation") || message.includes("Existing RepoDigest install")) {
        return values.reinstallDecision ?? "reinstall";
      }
      if (message.includes("Default summary profile")) {
        return values.summaryDefaultProfile ?? "team";
      }
      if (message.includes("Enable optional AI summarizer")) {
        return values.enableAiSetup ?? "no";
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
      if (message.includes("OAuth client id")) {
        return values.clientId ?? "";
      }
      if (message.includes("GitHub login for 'my commits' filter")) {
        return values.githubLogin ?? "";
      }
      if (message.includes("AI base URL")) {
        return values.aiBaseUrl ?? "https://api.openai.com/v1";
      }
      if (message.includes("AI model")) {
        return values.aiModel ?? "gpt-4o-mini";
      }
      if (message.includes("API key env var name")) {
        return values.aiApiKeyEnv ?? "OPENAI_API_KEY";
      }
      return values.timezone;
    }
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
        accessToken: "gho_test_token"
      })
    };

    const prompts = createPromptAdapter({
      installTarget: "project",
      components: ["all"],
      repos: ["owner/repo-a", "owner/repo-b"],
      lang: "zh-TW",
      timezone: "Asia/Taipei",
      clientId: "Iv1.test",
      authorizeNow: "yes"
    });

    const { io } = createMockIO();
    const code = await runCli(["init"], dir, {
      io,
      prompts,
      createGithubDeviceAuthClient: () => mockAuthClient
    });
    expect(code).toBe(0);

    const config = await readFile(path.join(dir, ".repodigest.yml"), "utf-8");
    const env = await readFile(path.join(dir, ".env"), "utf-8");
    const tasks = await readFile(path.join(dir, ".vscode", "tasks.json"), "utf-8");
    const workflow = await readFile(path.join(dir, ".github", "workflows", "repodigest.yml"), "utf-8");

    expect(config).toMatch("timezone: Asia/Taipei");
    expect(config).toMatch("- owner/repo-a");
    expect(config).toMatch("- owner/repo-b");
    expect(env).toMatch("GITHUB_TOKEN=gho_test_token");
    expect(tasks).toMatch("RepoDigest: Today");
    expect(workflow).toMatch("RepoDigest Daily");
    expect(config).toMatch("defaultProfile: team");
    expect(config).toMatch("enabled: false");
  });

  it("captures AI setup values during init wizard", async () => {
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
        accessToken: "gho_test_token"
      })
    };

    const prompts = createPromptAdapter({
      installTarget: "project",
      components: ["cli"],
      repos: ["owner/repo-a"],
      lang: "en",
      timezone: "UTC",
      authorizeNow: "yes",
      summaryDefaultProfile: "cus",
      enableAiSetup: "yes",
      githubLogin: "alice",
      aiBaseUrl: "https://example.ai/v1",
      aiModel: "gpt-oss-20b",
      aiApiKeyEnv: "MY_AI_KEY"
    });

    const { io } = createMockIO();
    const code = await runCli(["init"], dir, {
      io,
      prompts,
      createGithubDeviceAuthClient: () => mockAuthClient
    });
    expect(code).toBe(0);

    const config = await readFile(path.join(dir, ".repodigest.yml"), "utf-8");
    expect(config).toMatch("defaultProfile: cus");
    expect(config).toMatch("githubLogin: alice");
    expect(config).toMatch("enabled: true");
    expect(config).toMatch("baseUrl: https://example.ai/v1");
    expect(config).toMatch("model: gpt-oss-20b");
    expect(config).toMatch("apiKeyEnv: MY_AI_KEY");
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

  it("creates trending summary files for today's GitHub repos", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "repodigest-cli-"));
    tempDirs.push(dir);

    const { io } = createMockIO();
    const code = await runCli(["trending", "--lang", "zh-TW", "--limit", "2"], dir, {
      io,
      fetchGithubTrendingRepos: async () => [
        {
          fullName: "owner/repo-one",
          description: "A fast CLI starter",
          language: "TypeScript",
          stars: 120,
          forks: 10,
          url: "https://github.com/owner/repo-one",
          topics: ["cli", "typescript"],
          createdAt: "2026-02-14T00:00:00Z"
        },
        {
          fullName: "owner/repo-two",
          description: "Minimal utility toolkit",
          language: "Go",
          stars: 90,
          forks: 8,
          url: "https://github.com/owner/repo-two",
          topics: ["tooling"],
          createdAt: "2026-02-14T00:00:00Z"
        }
      ]
    });

    expect(code).toBe(0);
    const latest = await readFile(path.join(dir, "repodigest", "latest-trending.md"), "utf-8");
    expect(latest).toMatch("GitHub 今日 Repo");
    expect(latest).toMatch("owner/repo-one");
    expect(latest).toMatch("A fast CLI starter");
  });

  it("supports trending wizard mode", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "repodigest-cli-"));
    tempDirs.push(dir);

    const prompts: PromptAdapter = {
      checkbox: async () => [],
      select: async (options) => {
        const message = typeof options.message === "string" ? options.message : "";
        if (message.includes("Summary language")) {
          return "both";
        }
        return "en";
      },
      input: async (options) => {
        const message = typeof options.message === "string" ? options.message : "";
        if (message.includes("How many repos")) {
          return "1";
        }
        return "UTC";
      }
    };

    const { io } = createMockIO();
    const code = await runCli(["trending", "--wizard"], dir, {
      io,
      prompts,
      fetchGithubTrendingRepos: async () => [
        {
          fullName: "owner/repo-wizard",
          description: "Wizard generated summary",
          language: "TypeScript",
          stars: 40,
          forks: 2,
          url: "https://github.com/owner/repo-wizard",
          topics: [],
          createdAt: "2026-02-14T00:00:00Z"
        }
      ]
    });

    expect(code).toBe(0);
    const latest = await readFile(path.join(dir, "repodigest", "latest-trending.md"), "utf-8");
    expect(latest).toMatch("GitHub 今日 Repo");
    expect(latest).toMatch("GitHub Today Repos");
    expect(latest).toMatch("owner/repo-wizard");
  });

  it("summarizes today's commits for customer profile", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "repodigest-cli-"));
    tempDirs.push(dir);
    const { writeFile } = await import("node:fs/promises");

    await writeFile(
      path.join(dir, ".repodigest.yml"),
      [
        "timezone: UTC",
        "scope:",
        "  repos:",
        "    - owner/repo",
        "summaries:",
        "  defaultProfile: team",
        "  profiles:",
        "    team:",
        "      audience: team",
        "      style: professional",
        "      includeTechnicalDetails: true",
        "      language: en",
        "    cus:",
        "      audience: customer",
        "      style: natural",
        "      includeTechnicalDetails: false",
        "      language: zh-TW"
      ].join("\n") + "\n",
      "utf-8"
    );

    process.env.GITHUB_TOKEN = "ghp_token";
    const { io, logs } = createMockIO();
    const code = await runCli(["sum", "cus", "--dry-run"], dir, {
      io,
      createGithubProvider: () => ({
        fetchEvents: async () => [
          {
            id: "commit:1",
            provider: "github",
            repo: "owner/repo",
            type: "commit",
            title: "feat: add shared dashboard widget",
            url: "https://github.com/owner/repo/commit/1",
            timestamp: "2026-02-14T09:00:00Z",
            author: "alice"
          }
        ]
      })
    });

    expect(code).toBe(0);
    expect(logs.join("\n")).toMatch("今日 Commit 摘要");
    expect(logs.join("\n")).toMatch("新增功能:");
  });

  it("supports custom summary profile from config", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "repodigest-cli-"));
    tempDirs.push(dir);
    const { writeFile } = await import("node:fs/promises");

    await writeFile(
      path.join(dir, ".repodigest.yml"),
      [
        "timezone: UTC",
        "scope:",
        "  repos:",
        "    - owner/repo",
        "summaries:",
        "  defaultProfile: team",
        "  profiles:",
        "    boss:",
        "      audience: executive",
        "      style: professional",
        "      includeTechnicalDetails: true",
        "      language: en"
      ].join("\n") + "\n",
      "utf-8"
    );

    process.env.GITHUB_TOKEN = "ghp_token";
    const { io } = createMockIO();
    const code = await runCli(["sum", "boss"], dir, {
      io,
      createGithubProvider: () => ({
        fetchEvents: async () => [
          {
            id: "commit:2",
            provider: "github",
            repo: "owner/repo",
            type: "commit",
            title: "fix: stabilize export pipeline",
            url: "https://github.com/owner/repo/commit/2",
            timestamp: "2026-02-14T10:00:00Z",
            author: "alice"
          }
        ]
      })
    });

    expect(code).toBe(0);
    const latest = await readFile(path.join(dir, "repodigest", "latest-sum-boss.md"), "utf-8");
    expect(latest).toMatch("Today's Commit Summary");
    expect(latest).toMatch("stabilize export pipeline");
  });

  it("supports one-line project init in non-interactive mode", async () => {
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
        accessToken: "gho_project_token"
      })
    };

    const { io } = createMockIO();
    const code = await runCli(
      [
        "init",
        "--project",
        "--yes",
        "--repo",
        "owner/repo-a",
        "--repo",
        "owner/repo-b",
        "--token-source",
        "browser",
        "--client-id",
        "Iv1.test",
        "--no-browser"
      ],
      dir,
      { io, createGithubDeviceAuthClient: () => mockAuthClient }
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
        accessToken: "gho_global_token"
      })
    };

    const { io } = createMockIO();
    const code = await runCli(
      [
        "init",
        "--agentrule",
        "--yes",
        "--repo",
        "owner/repo-global",
        "--token-source",
        "browser",
        "--client-id",
        "Iv1.test",
        "--no-browser"
      ],
      dir,
      { io, createGithubDeviceAuthClient: () => mockAuthClient }
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

  it("supports quick setup flow in one command without --repo", async () => {
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
        accessToken: "gho_quick_token"
      })
    };

    const prompts = createPromptAdapter({
      components: ["cli"],
      repos: [],
      repoSelection: ["owner/repo-quick"],
      lang: "en",
      timezone: "UTC"
    });

    const { io, logs } = createMockIO();
    const code = await runCli(
      [
        "init",
        "--quick",
        "--project",
        "--token-source",
        "browser",
        "--client-id",
        "Iv1.test",
        "--no-browser"
      ],
      dir,
      {
        io,
        prompts,
        listGithubRepos: async () => ["owner/repo-quick", "owner/repo-other"],
        createGithubDeviceAuthClient: () => mockAuthClient
      }
    );

    expect(code).toBe(0);
    expect(logs.join("\n")).toMatch("Config is valid.");
    expect(logs.join("\n")).toMatch("Quick setup complete.");
  });

  it("allows reinstall from init quick flow when existing install is detected", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "repodigest-cli-"));
    tempDirs.push(dir);
    const { writeFile, mkdir } = await import("node:fs/promises");

    await writeFile(path.join(dir, ".repodigest.yml"), "timezone: UTC\nscope:\n  repos:\n    - old/repo\n", "utf-8");
    await mkdir(path.join(dir, "repodigest"), { recursive: true });
    await writeFile(path.join(dir, "repodigest", "latest.md"), "# old\n", "utf-8");

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
        accessToken: "gho_reinstall_token"
      })
    };

    const prompts = createPromptAdapter({
      components: ["cli"],
      repos: [],
      repoSelection: ["owner/repo-fresh"],
      lang: "en",
      timezone: "UTC",
      reinstallDecision: "reinstall"
    });

    const { io } = createMockIO();
    const code = await runCli(
      ["init", "--quick", "--project", "--client-id", "Iv1.test", "--no-browser"],
      dir,
      {
        io,
        prompts,
        listGithubRepos: async () => ["owner/repo-fresh"],
        createGithubDeviceAuthClient: () => mockAuthClient
      }
    );

    expect(code).toBe(0);
    const config = await readFile(path.join(dir, ".repodigest.yml"), "utf-8");
    expect(config).toMatch("- owner/repo-fresh");
  });

  it("does not remove existing install when browser auth prerequisites are missing", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "repodigest-cli-"));
    tempDirs.push(dir);
    const { writeFile, mkdir } = await import("node:fs/promises");

    await writeFile(path.join(dir, ".repodigest.yml"), "timezone: UTC\nscope:\n  repos:\n    - keep/repo\n", "utf-8");
    await mkdir(path.join(dir, "repodigest"), { recursive: true });
    await writeFile(path.join(dir, "repodigest", "latest.md"), "# keep\n", "utf-8");

    const { io, errors } = createMockIO();
    const code = await runCli(["init", "--quick", "--project", "--reinstall"], dir, { io });
    expect(code).toBe(1);
    expect(errors.join("\n")).toMatch("Missing GitHub OAuth client id");

    const config = await readFile(path.join(dir, ".repodigest.yml"), "utf-8");
    expect(config).toMatch("- keep/repo");
  });

  it("allows interactive init to select repos after browser auth", async () => {
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
        accessToken: "gho_repo_select_token"
      })
    };

    const prompts = createPromptAdapter({
      installTarget: "project",
      components: ["cli"],
      repos: [],
      repoSelection: ["owner/repo-picked"],
      lang: "zh-TW",
      timezone: "Asia/Taipei",
      authorizeNow: "yes"
    });

    const { io } = createMockIO();
    const code = await runCli(["init", "--client-id", "Iv1.test", "--no-browser"], dir, {
      io,
      prompts,
      listGithubRepos: async () => ["owner/repo-picked", "owner/repo-other"],
      createGithubDeviceAuthClient: () => mockAuthClient
    });
    expect(code).toBe(0);
    const config = await readFile(path.join(dir, ".repodigest.yml"), "utf-8");
    expect(config).toMatch("- owner/repo-picked");
  });

  it("rejects non-browser token source in init", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "repodigest-cli-"));
    tempDirs.push(dir);
    const { io, errors } = createMockIO();
    const code = await runCli(
      ["init", "--project", "--yes", "--repo", "owner/repo", "--token-source", "env"],
      dir,
      { io }
    );
    expect(code).toBe(1);
    expect(errors.join("\n")).toMatch("Invalid --token-source value");
  });

  it("delivers first digest from clean setup in one flow", async () => {
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
        accessToken: "gho_onboarding_token"
      })
    };

    const start = Date.now();
    const { io, logs } = createMockIO();

    const initCode = await runCli(
      [
        "init",
        "--project",
        "--yes",
        "--repo",
        "owner/repo",
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
