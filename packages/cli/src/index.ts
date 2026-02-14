#!/usr/bin/env node
import { checkbox as promptCheckbox, input as promptInput, select as promptSelect } from "@inquirer/prompts";
import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { runPipeline, type Event, type WorkItem } from "@oceanads/core";
import { GithubProviderClient, type GithubFetchOptions } from "@oceanads/provider-github";
import { renderInternalDigest } from "@oceanads/renderer-internal";
import { renderThreadsDigest } from "@oceanads/renderer-threads";
import { renderXDigest } from "@oceanads/renderer-x";
import { runAuthLogin, runAuthLogout, type GithubDeviceAuthClientLike } from "./auth.js";
import { formatConfigError, loadConfig, serializeConfig, type RepoDigestConfig } from "./config.js";
import {
  resolveInstallRoot,
  runInitPreset,
  runInitWizard,
  type Component,
  type InstallTarget,
  type OutputLanguage,
  type PromptAdapter,
  type TokenSource
} from "./init.js";
import { loadSummarizerPlugin } from "./summarizer-plugin.js";
import { writeDigestFiles, writeRangeDigestFiles } from "./writer.js";

type CliCommand = "today" | "range" | "validate" | "init" | "update" | "remove" | "auth" | "trending" | "sum" | "help";
type TimeBoundary = "start" | "end";
type RenderTarget = "internal" | "x" | "threads" | "markdown";
type PublicTone = "calm" | "playful" | "hacker" | "formal";

export interface CliIO {
  log: (message: string) => void;
  error: (message: string) => void;
}

export interface GithubProviderLike {
  fetchEvents: (options: GithubFetchOptions) => Promise<Event[]>;
}

export interface CliRuntimeOptions {
  prompts?: PromptAdapter;
  io?: CliIO;
  createGithubProvider?: (token: string) => GithubProviderLike;
  createGithubDeviceAuthClient?: () => GithubDeviceAuthClientLike;
  listGithubRepos?: (token: string) => Promise<string[]>;
  fetchGithubTrendingRepos?: (options: TrendingFetchOptions) => Promise<TrendingRepo[]>;
}

interface ParsedCommand {
  command: CliCommand;
  args: string[];
}

interface WindowArgs {
  dryRun: boolean;
  preview: boolean;
  since?: string;
  until?: string;
  target?: RenderTarget;
  tone?: PublicTone;
  language?: OutputLanguage;
}

interface InitArgs {
  target?: InstallTarget;
  yes: boolean;
  quick: boolean;
  reinstall: boolean;
  repos: string[];
  language?: OutputLanguage;
  timezone?: string;
  tokenSource?: TokenSource;
  components?: Component[];
  clientId?: string;
  authScope?: string;
  noBrowser: boolean;
}

interface UpdateArgs {
  target?: InstallTarget;
  addRepos: string[];
  removeRepos: string[];
  language?: OutputLanguage;
  timezone?: string;
  renderTarget?: RenderTarget;
  tone?: PublicTone;
}

interface RemoveArgs {
  target?: InstallTarget;
  yes: boolean;
  keepOutput: boolean;
}

interface AuthArgs {
  action: "login" | "logout" | "help";
  target?: InstallTarget;
  tokenEnv?: string;
  clientId?: string;
  scope: string;
  noBrowser: boolean;
}

interface TrendingArgs {
  language: OutputLanguage;
  limit: number;
  wizard: boolean;
}

interface TrendingRepo {
  fullName: string;
  description: string;
  language?: string;
  stars: number;
  forks: number;
  url: string;
  topics: string[];
  createdAt: string;
}

interface TrendingFetchOptions {
  day: string;
  limit: number;
  token?: string;
}

type SummaryStyle = "professional" | "natural";

interface SumArgs {
  profile?: string;
  language?: OutputLanguage;
  dryRun: boolean;
  useAi: boolean;
}

interface SummaryProfile {
  audience: string;
  style: SummaryStyle;
  includeTechnicalDetails: boolean;
  language: OutputLanguage;
}

interface ResolvedTimeWindow {
  since: Date;
  until: Date;
  sinceIso: string;
  untilIso: string;
  sinceLabel: string;
  untilLabel: string;
}

interface RenderedOutput {
  target: RenderTarget;
  content: string;
  blocks?: string[];
}

const repoPattern = /^[^/\s]+\/[^/\s]+$/;

function defaultIO(): CliIO {
  return {
    log: (message) => console.log(message),
    error: (message) => console.error(message)
  };
}

function parseCommand(argv: string[]): ParsedCommand {
  const command = argv[0] ?? "help";
  const args = argv.slice(1);
  if (
    command === "today" ||
    command === "range" ||
    command === "validate" ||
    command === "init" ||
    command === "update" ||
    command === "remove" ||
    command === "auth" ||
    command === "trending" ||
    command === "sum"
  ) {
    return { command, args };
  }
  return { command: "help", args: [] };
}

function parseWindowArgs(args: string[], options: { requireSince: boolean }): WindowArgs {
  const result: WindowArgs = { dryRun: false, preview: false };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (!arg) {
      continue;
    }
    if (arg === "--dry-run") {
      result.dryRun = true;
      continue;
    }

    if (arg === "--preview") {
      result.preview = true;
      continue;
    }

    if (arg === "--since") {
      const value = args[i + 1];
      if (!value) {
        throw new Error("Missing value for --since");
      }
      result.since = value;
      i += 1;
      continue;
    }

    if (arg === "--until") {
      const value = args[i + 1];
      if (!value) {
        throw new Error("Missing value for --until");
      }
      result.until = value;
      i += 1;
      continue;
    }

    if (arg === "--target") {
      const value = args[i + 1];
      if (!value) {
        throw new Error("Missing value for --target");
      }
      if (value !== "internal" && value !== "x" && value !== "threads" && value !== "markdown") {
        throw new Error(`Invalid --target value: ${value}`);
      }
      result.target = value;
      i += 1;
      continue;
    }

    if (arg === "--tone") {
      const value = args[i + 1];
      if (!value) {
        throw new Error("Missing value for --tone");
      }
      if (value !== "calm" && value !== "playful" && value !== "hacker" && value !== "formal") {
        throw new Error(`Invalid --tone value: ${value}`);
      }
      result.tone = value;
      i += 1;
      continue;
    }

    if (arg === "--lang") {
      const value = args[i + 1];
      if (!value) {
        throw new Error("Missing value for --lang");
      }
      if (value !== "en" && value !== "zh-TW" && value !== "both") {
        throw new Error(`Invalid --lang value: ${value}`);
      }
      result.language = value;
      i += 1;
      continue;
    }

    if (arg.startsWith("--")) {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  if (options.requireSince && !result.since) {
    throw new Error("Missing required option: --since");
  }

  return result;
}

function parseInitArgs(args: string[]): InitArgs {
  const result: InitArgs = {
    yes: false,
    quick: false,
    reinstall: false,
    repos: [],
    noBrowser: false
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (!arg) {
      continue;
    }

    if (arg === "--yes") {
      result.yes = true;
      continue;
    }

    if (arg === "--quick") {
      result.quick = true;
      continue;
    }

    if (arg === "--reinstall") {
      result.reinstall = true;
      continue;
    }

    if (arg === "--project") {
      result.target = "project";
      continue;
    }

    if (arg === "--agentrule" || arg === "--global") {
      result.target = "agentrule";
      continue;
    }

    if (arg === "--repo") {
      const value = args[i + 1];
      if (!value) {
        throw new Error("Missing value for --repo");
      }
      result.repos.push(value);
      i += 1;
      continue;
    }

    if (arg === "--lang") {
      const value = args[i + 1];
      if (!value) {
        throw new Error("Missing value for --lang");
      }
      if (value !== "en" && value !== "zh-TW" && value !== "both") {
        throw new Error(`Invalid --lang value: ${value}`);
      }
      result.language = value;
      i += 1;
      continue;
    }

    if (arg === "--timezone") {
      const value = args[i + 1];
      if (!value) {
        throw new Error("Missing value for --timezone");
      }
      result.timezone = value;
      i += 1;
      continue;
    }

    if (arg === "--token-source") {
      const value = args[i + 1];
      if (!value) {
        throw new Error("Missing value for --token-source");
      }
      if (value !== "browser") {
        throw new Error(`Invalid --token-source value: ${value}`);
      }
      result.tokenSource = value;
      i += 1;
      continue;
    }

    if (arg === "--token") {
      throw new Error("--token is no longer supported. Use browser auth only.");
    }

    if (arg === "--client-id") {
      const value = args[i + 1];
      if (!value) {
        throw new Error("Missing value for --client-id");
      }
      result.clientId = value;
      i += 1;
      continue;
    }

    if (arg === "--scope") {
      const value = args[i + 1];
      if (!value) {
        throw new Error("Missing value for --scope");
      }
      result.authScope = value;
      i += 1;
      continue;
    }

    if (arg === "--no-browser") {
      result.noBrowser = true;
      continue;
    }

    if (arg === "--components") {
      const value = args[i + 1];
      if (!value) {
        throw new Error("Missing value for --components");
      }
      const normalized = value
        .split(",")
        .map((entry) => entry.trim().toLowerCase())
        .filter(Boolean);

      const componentSet = new Set<Component>();
      for (const entry of normalized) {
        if (entry === "all") {
          componentSet.add("cli");
          componentSet.add("ide");
          componentSet.add("action");
          continue;
        }
        if (entry === "cli" || entry === "ide" || entry === "action") {
          componentSet.add(entry);
          continue;
        }
        throw new Error(`Invalid component value: ${entry}`);
      }

      result.components = Array.from(componentSet);
      i += 1;
      continue;
    }

    throw new Error(`Unknown option: ${arg}`);
  }

  return result;
}

function parseUpdateArgs(args: string[]): UpdateArgs {
  const result: UpdateArgs = {
    addRepos: [],
    removeRepos: []
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (!arg) {
      continue;
    }

    if (arg === "--project") {
      result.target = "project";
      continue;
    }

    if (arg === "--agentrule" || arg === "--global") {
      result.target = "agentrule";
      continue;
    }

    if (arg === "--add-repo") {
      const value = args[i + 1];
      if (!value) {
        throw new Error("Missing value for --add-repo");
      }
      result.addRepos.push(value);
      i += 1;
      continue;
    }

    if (arg === "--remove-repo") {
      const value = args[i + 1];
      if (!value) {
        throw new Error("Missing value for --remove-repo");
      }
      result.removeRepos.push(value);
      i += 1;
      continue;
    }

    if (arg === "--lang") {
      const value = args[i + 1];
      if (!value) {
        throw new Error("Missing value for --lang");
      }
      if (value !== "en" && value !== "zh-TW" && value !== "both") {
        throw new Error(`Invalid --lang value: ${value}`);
      }
      result.language = value;
      i += 1;
      continue;
    }

    if (arg === "--timezone") {
      const value = args[i + 1];
      if (!value) {
        throw new Error("Missing value for --timezone");
      }
      result.timezone = value;
      i += 1;
      continue;
    }

    if (arg === "--target") {
      const value = args[i + 1];
      if (!value) {
        throw new Error("Missing value for --target");
      }
      if (value !== "internal" && value !== "x" && value !== "threads" && value !== "markdown") {
        throw new Error(`Invalid --target value: ${value}`);
      }
      result.renderTarget = value;
      i += 1;
      continue;
    }

    if (arg === "--tone") {
      const value = args[i + 1];
      if (!value) {
        throw new Error("Missing value for --tone");
      }
      if (value !== "calm" && value !== "playful" && value !== "hacker" && value !== "formal") {
        throw new Error(`Invalid --tone value: ${value}`);
      }
      result.tone = value;
      i += 1;
      continue;
    }

    throw new Error(`Unknown option: ${arg}`);
  }

  const hasChange =
    result.addRepos.length > 0 ||
    result.removeRepos.length > 0 ||
    typeof result.language !== "undefined" ||
    typeof result.timezone !== "undefined" ||
    typeof result.renderTarget !== "undefined" ||
    typeof result.tone !== "undefined";

  if (!hasChange) {
    throw new Error(
      "No update options provided. Use at least one of --add-repo, --remove-repo, --lang, --timezone, --target, --tone."
    );
  }

  return result;
}

function parseRemoveArgs(args: string[]): RemoveArgs {
  const result: RemoveArgs = {
    yes: false,
    keepOutput: false
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (!arg) {
      continue;
    }

    if (arg === "--project") {
      result.target = "project";
      continue;
    }

    if (arg === "--agentrule" || arg === "--global") {
      result.target = "agentrule";
      continue;
    }

    if (arg === "--yes") {
      result.yes = true;
      continue;
    }

    if (arg === "--keep-output") {
      result.keepOutput = true;
      continue;
    }

    throw new Error(`Unknown option: ${arg}`);
  }

  return result;
}

function parseAuthArgs(args: string[]): AuthArgs {
  const actionRaw = args[0];
  const action: AuthArgs["action"] =
    actionRaw === "login" || actionRaw === "logout" ? actionRaw : "help";
  const result: AuthArgs = {
    action,
    scope: "repo",
    noBrowser: false
  };

  const options = action === "help" ? args : args.slice(1);
  for (let i = 0; i < options.length; i += 1) {
    const arg = options[i];
    if (!arg) {
      continue;
    }

    if (arg === "--project") {
      result.target = "project";
      continue;
    }
    if (arg === "--agentrule" || arg === "--global") {
      result.target = "agentrule";
      continue;
    }
    if (arg === "--token-env") {
      const value = options[i + 1];
      if (!value) {
        throw new Error("Missing value for --token-env");
      }
      result.tokenEnv = value;
      i += 1;
      continue;
    }
    if (arg === "--client-id") {
      const value = options[i + 1];
      if (!value) {
        throw new Error("Missing value for --client-id");
      }
      result.clientId = value;
      i += 1;
      continue;
    }
    if (arg === "--scope") {
      const value = options[i + 1];
      if (!value) {
        throw new Error("Missing value for --scope");
      }
      result.scope = value;
      i += 1;
      continue;
    }
    if (arg === "--no-browser") {
      result.noBrowser = true;
      continue;
    }
    if (arg === "login" || arg === "logout") {
      continue;
    }
    throw new Error(`Unknown option: ${arg}`);
  }

  return result;
}

function parseTrendingArgs(args: string[]): TrendingArgs {
  const result: TrendingArgs = {
    language: "en",
    limit: 10,
    wizard: false
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (!arg) {
      continue;
    }

    if (arg === "--lang") {
      const value = args[i + 1];
      if (!value) {
        throw new Error("Missing value for --lang");
      }
      if (value !== "en" && value !== "zh-TW" && value !== "both") {
        throw new Error(`Invalid --lang value: ${value}`);
      }
      result.language = value;
      i += 1;
      continue;
    }

    if (arg === "--limit") {
      const value = args[i + 1];
      if (!value) {
        throw new Error("Missing value for --limit");
      }
      const parsedLimit = Number(value);
      if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 30) {
        throw new Error("Invalid --limit value. Expected an integer between 1 and 30.");
      }
      result.limit = parsedLimit;
      i += 1;
      continue;
    }

    if (arg === "--wizard") {
      result.wizard = true;
      continue;
    }

    throw new Error(`Unknown option: ${arg}`);
  }

  return result;
}

function parseSumArgs(args: string[]): SumArgs {
  const result: SumArgs = {
    dryRun: false,
    useAi: false
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (!arg) {
      continue;
    }

    if (!arg.startsWith("--") && !result.profile) {
      result.profile = arg;
      continue;
    }

    if (arg === "--profile") {
      const value = args[i + 1];
      if (!value) {
        throw new Error("Missing value for --profile");
      }
      result.profile = value;
      i += 1;
      continue;
    }

    if (arg === "--lang") {
      const value = args[i + 1];
      if (!value) {
        throw new Error("Missing value for --lang");
      }
      if (value !== "en" && value !== "zh-TW" && value !== "both") {
        throw new Error(`Invalid --lang value: ${value}`);
      }
      result.language = value;
      i += 1;
      continue;
    }

    if (arg === "--dry-run") {
      result.dryRun = true;
      continue;
    }

    if (arg === "--ai") {
      result.useAi = true;
      continue;
    }

    throw new Error(`Unknown option: ${arg}`);
  }

  return result;
}

function startOfDay(input: Date): Date {
  return new Date(input.getFullYear(), input.getMonth(), input.getDate(), 0, 0, 0, 0);
}

function endOfDay(input: Date): Date {
  return new Date(input.getFullYear(), input.getMonth(), input.getDate(), 23, 59, 59, 999);
}

function resolveMonday(input: Date): Date {
  const day = input.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(input);
  monday.setDate(input.getDate() + diff);
  return monday;
}

function resolveDateInput(value: string, boundary: TimeBoundary, referenceNow: Date): Date {
  const normalized = value.trim().toLowerCase();
  if (normalized === "now") {
    return new Date(referenceNow);
  }
  if (normalized === "today") {
    return boundary === "start" ? startOfDay(referenceNow) : endOfDay(referenceNow);
  }
  if (normalized === "yesterday") {
    const yesterday = new Date(referenceNow);
    yesterday.setDate(yesterday.getDate() - 1);
    return boundary === "start" ? startOfDay(yesterday) : endOfDay(yesterday);
  }
  if (normalized === "monday") {
    const monday = resolveMonday(referenceNow);
    return boundary === "start" ? startOfDay(monday) : endOfDay(monday);
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid date value: ${value}`);
  }
  return parsed;
}

function toDateLabel(input: Date): string {
  return input.toISOString().slice(0, 10);
}

function resolveTimeWindow(
  args: WindowArgs,
  defaults: { since: string; until: string },
  referenceNow: Date
): ResolvedTimeWindow {
  const sinceRaw = args.since ?? defaults.since;
  const untilRaw = args.until ?? defaults.until;

  const since = resolveDateInput(sinceRaw, "start", referenceNow);
  const until = resolveDateInput(untilRaw, "end", referenceNow);

  if (since.getTime() > until.getTime()) {
    throw new Error("--since must be earlier than --until");
  }

  return {
    since,
    until,
    sinceIso: since.toISOString(),
    untilIso: until.toISOString(),
    sinceLabel: toDateLabel(since),
    untilLabel: toDateLabel(until)
  };
}

function readEnvText(raw: string): Record<string, string> {
  const envMap: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const eq = trimmed.indexOf("=");
    if (eq <= 0) {
      continue;
    }

    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    const unquoted = value.replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");
    envMap[key] = unquoted;
  }
  return envMap;
}

async function loadDotEnv(cwd: string): Promise<Record<string, string>> {
  const envPath = path.join(cwd, ".env");
  try {
    const raw = await readFile(envPath, "utf-8");
    return readEnvText(raw);
  } catch {
    return {};
  }
}

function normalizeWorkKind(event: Event): WorkItem["kind"] {
  if (event.type.startsWith("issue_")) {
    return "issue";
  }
  if (event.type.startsWith("pr_")) {
    return "pr";
  }
  if (event.type === "commit") {
    return "commit";
  }
  if (event.type === "release") {
    return "release";
  }
  return "note";
}

function deriveItemKey(event: Event): string {
  const url = event.url ?? "";
  const issueMatch = url.match(/\/issues\/(\d+)(?:$|[?#/])/);
  if (event.repo && issueMatch?.[1]) {
    return `github:${event.repo}#${issueMatch[1]}`;
  }

  const prMatch = url.match(/\/pull\/(\d+)(?:$|[?#/])/);
  if (event.repo && prMatch?.[1]) {
    return `github:${event.repo}#${prMatch[1]}`;
  }

  return `${event.provider}:${event.id}`;
}

function normalizeEventsToWorkItems(events: Event[]): WorkItem[] {
  const grouped = new Map<
    string,
    {
      kind: WorkItem["kind"];
      repo?: string;
      title: string;
      url?: string;
      labels: Set<string>;
      evidence: Event[];
    }
  >();

  for (const event of events) {
    const key = deriveItemKey(event);
    const existing = grouped.get(key);
    if (existing) {
      if (event.title && (!existing.title || existing.title === "(untitled)")) {
        existing.title = event.title;
      }
      if (event.url && !existing.url) {
        existing.url = event.url;
      }
      if (!existing.repo && event.repo) {
        existing.repo = event.repo;
      }
      for (const label of event.labels ?? []) {
        existing.labels.add(label);
      }
      existing.evidence.push(event);
      continue;
    }

    grouped.set(key, {
      kind: normalizeWorkKind(event),
      ...(event.repo ? { repo: event.repo } : {}),
      title: event.title ?? "(untitled)",
      ...(event.url ? { url: event.url } : {}),
      labels: new Set(event.labels ?? []),
      evidence: [event]
    });
  }

  return Array.from(grouped.entries()).map(([key, value]) => ({
    key,
    kind: value.kind,
    ...(value.repo ? { repo: value.repo } : {}),
    title: value.title,
    ...(value.url ? { url: value.url } : {}),
    labels: Array.from(value.labels),
    status: "unknown",
    highlights: [],
    evidence: value.evidence.sort((a, b) => a.timestamp.localeCompare(b.timestamp))
  }));
}

function applyWindowOverrides(config: RepoDigestConfig, args: WindowArgs): RepoDigestConfig {
  return {
    ...config,
    output: {
      ...config.output,
      ...(args.target ? { target: args.target } : {}),
      ...(args.tone ? { tone: args.tone } : {}),
      ...(args.language ? { lang: args.language } : {})
    }
  };
}

function printRenderedPreview(io: CliIO, output: RenderedOutput): void {
  if (output.blocks && output.blocks.length > 0) {
    io.log(`Preview target: ${output.target}`);
    output.blocks.forEach((block, index) => {
      io.log(`[Block ${index + 1}/${output.blocks?.length}]`);
      io.log(block);
    });
    return;
  }
  io.log(output.content);
}

async function loadToken(cwd: string, tokenKey: string): Promise<string | undefined> {
  const envFile = await loadDotEnv(cwd);
  return process.env[tokenKey] ?? envFile[tokenKey];
}

interface GithubRepoListItem {
  full_name?: string;
  private?: boolean;
}

async function fetchGithubRepos(token: string): Promise<string[]> {
  const repos: string[] = [];
  let page = 1;

  while (page <= 3) {
    const response = await fetch(
      `https://api.github.com/user/repos?per_page=100&page=${page}&sort=updated&affiliation=owner,collaborator,organization_member`,
      {
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "User-Agent": "repodigest/0.1.0"
        }
      }
    );

    if (!response.ok) {
      throw new Error(`Unable to fetch repositories from GitHub (HTTP ${response.status}).`);
    }

    const data = (await response.json()) as GithubRepoListItem[];
    if (!Array.isArray(data) || data.length === 0) {
      break;
    }

    for (const repo of data) {
      if (repo && typeof repo.full_name === "string" && repo.full_name.includes("/")) {
        repos.push(repo.full_name);
      }
    }

    if (data.length < 100) {
      break;
    }
    page += 1;
  }

  return Array.from(new Set(repos));
}

function toUtcDayLabel(input: Date): string {
  return input.toISOString().slice(0, 10);
}

function formatTrendingRepo(repo: TrendingRepo, language: "en" | "zh-TW"): string {
  const langLabel = repo.language ?? (language === "zh-TW" ? "未知" : "unknown");
  const topicText = repo.topics.length > 0 ? repo.topics.slice(0, 3).join(", ") : language === "zh-TW" ? "無" : "none";
  const createdDate = repo.createdAt.slice(0, 10);

  if (language === "zh-TW") {
    return [
      `### ${repo.fullName}`,
      `- 摘要: ${repo.description || "無描述"}`,
      `- 指標: ⭐ ${repo.stars} | 🍴 ${repo.forks} | 語言 ${langLabel}`,
      `- 主題: ${topicText}`,
      `- 建立日: ${createdDate}`,
      `- 連結: ${repo.url}`
    ].join("\n");
  }

  return [
    `### ${repo.fullName}`,
    `- Summary: ${repo.description || "No description"}`,
    `- Metrics: ⭐ ${repo.stars} | 🍴 ${repo.forks} | Language ${langLabel}`,
    `- Topics: ${topicText}`,
    `- Created: ${createdDate}`,
    `- URL: ${repo.url}`
  ].join("\n");
}

function renderTrendingSummary(repos: TrendingRepo[], day: string, language: OutputLanguage): string {
  const headerEn = `# GitHub Today Repos (${day})\n\nTop ${repos.length} repositories created today and ranked by stars.`;
  const headerZh = `# GitHub 今日 Repo (${day})\n\n依照星數排序的今日新建 repository（前 ${repos.length} 名）。`;

  if (language === "both") {
    const zhBlock = repos.map((repo) => formatTrendingRepo(repo, "zh-TW")).join("\n\n");
    const enBlock = repos.map((repo) => formatTrendingRepo(repo, "en")).join("\n\n");
    return [headerZh, "", zhBlock, "", "---", "", headerEn, "", enBlock, ""].join("\n");
  }

  if (language === "zh-TW") {
    return [headerZh, "", repos.map((repo) => formatTrendingRepo(repo, "zh-TW")).join("\n\n"), ""].join("\n");
  }

  return [headerEn, "", repos.map((repo) => formatTrendingRepo(repo, "en")).join("\n\n"), ""].join("\n");
}

interface GithubSearchRepoItem {
  full_name?: string;
  description?: string | null;
  language?: string | null;
  stargazers_count?: number;
  forks_count?: number;
  html_url?: string;
  topics?: string[];
  created_at?: string;
}

interface GithubSearchRepoResponse {
  items?: GithubSearchRepoItem[];
}

async function fetchGithubTrendingRepos(options: TrendingFetchOptions): Promise<TrendingRepo[]> {
  const q = encodeURIComponent(`created:>=${options.day}`);
  const response = await fetch(
    `https://api.github.com/search/repositories?q=${q}&sort=stars&order=desc&per_page=${options.limit}`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
        "User-Agent": "repodigest/0.1.1"
      }
    }
  );

  if (!response.ok) {
    if (response.status === 403) {
      throw new Error("GitHub API rate limit reached. Set GITHUB_TOKEN to increase limits.");
    }
    throw new Error(`Unable to fetch trending repositories from GitHub (HTTP ${response.status}).`);
  }

  const data = (await response.json()) as GithubSearchRepoResponse;
  const items = Array.isArray(data.items) ? data.items : [];

  return items
    .filter((item) => typeof item.full_name === "string" && typeof item.html_url === "string")
    .map((item) => ({
      fullName: item.full_name ?? "",
      description: item.description ?? "",
      ...(item.language ? { language: item.language } : {}),
      stars: typeof item.stargazers_count === "number" ? item.stargazers_count : 0,
      forks: typeof item.forks_count === "number" ? item.forks_count : 0,
      url: item.html_url ?? "",
      topics: Array.isArray(item.topics) ? item.topics : [],
      createdAt: item.created_at ?? `${options.day}T00:00:00Z`
    }));
}

function buildFallbackProfile(name: string): SummaryProfile {
  if (name === "cus") {
    return {
      audience: "customer",
      style: "natural",
      includeTechnicalDetails: false,
      language: "zh-TW"
    };
  }
  if (name === "team") {
    return {
      audience: "team",
      style: "professional",
      includeTechnicalDetails: true,
      language: "en"
    };
  }
  return {
    audience: name,
    style: "professional",
    includeTechnicalDetails: true,
    language: "en"
  };
}

function resolveSummaryProfile(config: RepoDigestConfig, profileName?: string): { name: string; profile: SummaryProfile } {
  const selected = profileName?.trim() || config.summaries.defaultProfile || "team";
  const profile = config.summaries.profiles[selected] ?? buildFallbackProfile(selected);
  return {
    name: selected,
    profile: {
      audience: profile.audience,
      style: profile.style,
      includeTechnicalDetails: profile.includeTechnicalDetails,
      language: profile.language
    }
  };
}

function sanitizeProfileName(profileName: string): string {
  return profileName.replace(/[^a-zA-Z0-9_-]/g, "-").toLowerCase();
}

function languageHeader(language: "en" | "zh-TW", profileName: string, audience: string, day: string): string {
  if (language === "zh-TW") {
    return `# 今日 Commit 摘要 (${day})\n\n- 受眾: ${audience}\n- 檔案配置: ${profileName}`;
  }
  return `# Today's Commit Summary (${day})\n\n- Audience: ${audience}\n- Profile: ${profileName}`;
}

function buildSummaryLines(
  events: Event[],
  profile: SummaryProfile,
  language: "en" | "zh-TW",
  githubLogin?: string
): string[] {
  const filteredByAuthor = githubLogin
    ? events.filter((event) => event.author?.toLowerCase() === githubLogin.toLowerCase())
    : events;
  const source = filteredByAuthor.length > 0 ? filteredByAuthor : events;

  const byRepo = new Map<string, Event[]>();
  for (const event of source) {
    const repo = event.repo ?? (language === "zh-TW" ? "未知 repo" : "unknown-repo");
    const list = byRepo.get(repo) ?? [];
    list.push(event);
    byRepo.set(repo, list);
  }

  const lines: string[] = [];
  for (const [repo, repoEvents] of byRepo.entries()) {
    lines.push(language === "zh-TW" ? `## ${repo}（${repoEvents.length} commits）` : `## ${repo} (${repoEvents.length} commits)`);
    for (const event of repoEvents.slice(0, 12)) {
      const raw = event.title ?? "(commit)";
      if (profile.includeTechnicalDetails) {
        lines.push(`- ${raw}${event.url ? ` (${event.url})` : ""}`);
      } else {
        const simplified = raw
          .replace(/^feat\s*:\s*/i, language === "zh-TW" ? "新增功能: " : "Added feature: ")
          .replace(/^fix\s*:\s*/i, language === "zh-TW" ? "修正問題: " : "Fixed issue: ")
          .replace(/^refactor\s*:\s*/i, language === "zh-TW" ? "調整內容: " : "Improved: ")
          .replace(/^docs\s*:\s*/i, language === "zh-TW" ? "文件更新: " : "Documentation: ");
        lines.push(`- ${simplified}`);
      }
    }
  }

  if (lines.length === 0) {
    lines.push(language === "zh-TW" ? "- 今天沒有可摘要的 commit。" : "- No commits found for today.");
  }

  if (profile.style === "professional") {
    lines.push(
      language === "zh-TW"
        ? "\n> 本摘要供主管與團隊同步，聚焦可追蹤的開發進展。"
        : "\n> This summary is intended for leadership/team status alignment and traceable engineering progress."
    );
  } else {
    lines.push(
      language === "zh-TW"
        ? "\n> 本摘要已轉為較自然敘述，方便客戶快速掌握今日進度。"
        : "\n> This summary is simplified in natural language for customer-facing updates."
    );
  }

  return lines;
}

async function tryGenerateAiSummary(params: {
  content: string;
  profileName: string;
  profile: SummaryProfile;
  language: OutputLanguage;
  config: RepoDigestConfig;
  cwd: string;
}): Promise<string | null> {
  const ai = params.config.summaries.ai;
  if (!ai.enabled) {
    return null;
  }

  const envFile = await loadDotEnv(params.cwd);
  const apiKey = process.env[ai.apiKeyEnv] ?? envFile[ai.apiKeyEnv];
  if (!apiKey) {
    return null;
  }

  const targetLanguage = params.language === "both" ? "Traditional Chinese and English" : params.language;
  const systemPrompt = [
    "You are a software delivery summarizer.",
    `Audience profile: ${params.profileName} (${params.profile.audience}).`,
    `Writing style: ${params.profile.style}.`,
    `Technical detail level: ${params.profile.includeTechnicalDetails ? "high" : "low"}.`,
    `Output language: ${targetLanguage}.`
  ].join(" ");

  const response = await fetch(`${ai.baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: ai.model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Summarize the following commit digest:\n\n${params.content}` }
      ],
      temperature: 0.2
    })
  });

  if (!response.ok) {
    return null;
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = data.choices?.[0]?.message?.content?.trim();
  return text && text.length > 0 ? text : null;
}

async function ensureReposConfigured(
  installRoot: string,
  io: CliIO,
  runtimeOptions: CliRuntimeOptions
): Promise<number> {
  const config = await loadConfig(installRoot);
  if (config.scope.repos.length > 0) {
    return 0;
  }

  const tokenKey = config.providers.github.tokenEnv;
  const token = await loadToken(installRoot, tokenKey);
  if (!token) {
    throw new Error(`Repository selection requires ${tokenKey}. Run auth login first.`);
  }

  const repoList =
    runtimeOptions.listGithubRepos ? await runtimeOptions.listGithubRepos(token) : await fetchGithubRepos(token);

  if (repoList.length === 0) {
    throw new Error("No accessible GitHub repositories found. Use `update --add-repo owner/name`.");
  }

  if (!runtimeOptions.prompts && !process.stdin.isTTY) {
    throw new Error("No interactive terminal for repository selection. Pass --repo owner/name.");
  }

  const askCheckbox =
    runtimeOptions.prompts?.checkbox ??
    ((options: { message: string; choices: Array<{ name: string; value: string; checked?: boolean }> }) =>
      promptCheckbox(options));

  const selected = await askCheckbox({
    message: "Select repositories to track",
    choices: repoList.slice(0, 50).map((repo, index) => ({
      name: repo,
      value: repo,
      checked: index < 1
    }))
  });

  if (!selected || selected.length === 0) {
    throw new Error("At least one repository must be selected.");
  }

  const nextConfig: RepoDigestConfig = {
    ...config,
    scope: {
      ...config.scope,
      repos: selected
    }
  };

  const configPath = path.join(installRoot, ".repodigest.yml");
  await writeFile(configPath, serializeConfig(nextConfig), "utf-8");
  io.log(`Updated ${configPath} with ${selected.length} selected repos.`);
  return 0;
}

async function runDigestPipeline(
  cwd: string,
  config: RepoDigestConfig,
  timeWindow: ResolvedTimeWindow,
  runtimeOptions: CliRuntimeOptions,
  io: CliIO
): Promise<{ rendered: RenderedOutput; statsLine: string; digestDate: string }> {
  const token = await loadToken(cwd, config.providers.github.tokenEnv);
  if (!token) {
    throw new Error(`Missing GitHub token. Set ${config.providers.github.tokenEnv} in environment or .env`);
  }

  const provider =
    runtimeOptions.createGithubProvider?.(token) ??
    new GithubProviderClient({ token });

  const fetchOptions: GithubFetchOptions = {
    repos: config.scope.repos,
    since: timeWindow.sinceIso,
    until: timeWindow.untilIso
  };

  const query = config.providers.github.query;
  if (query?.assignee) {
    fetchOptions.assignee = query.assignee;
  }
  if (query?.labelsAny) {
    fetchOptions.labelsAny = query.labelsAny;
  }

  let plugin:
    | {
        summarizeWorkItem: (item: WorkItem) => Promise<string[] | null | undefined> | string[] | null | undefined;
      }
    | null = null;
  const pluginSpecifier = config.output.summarizerPlugin ?? process.env.REPODIGEST_SUMMARIZER_PLUGIN;
  if (pluginSpecifier) {
    try {
      plugin = await loadSummarizerPlugin(pluginSpecifier, cwd);
      io.log(`Loaded summarizer plugin: ${pluginSpecifier}`);
    } catch (error: unknown) {
      io.error(`Summarizer plugin disabled: ${formatConfigError(error)}`);
    }
  }

  const hooks: {
    summarizeWorkItem?: (item: WorkItem) => Promise<string[] | null | undefined> | string[] | null | undefined;
  } = {};
  if (plugin) {
    hooks.summarizeWorkItem = (item) => plugin?.summarizeWorkItem(item);
  }

  const pipelineResult = await runPipeline<RenderedOutput>(
    {
      collect: async () => provider.fetchEvents(fetchOptions),
      normalize: (events) => normalizeEventsToWorkItems(events),
      render: (digest) => {
        const target = config.output.target;
        if (target === "x") {
          const rendered = renderXDigest(digest, {
            tone: config.output.tone,
            lang: config.output.lang,
            includeMetrics: config.output.include.metrics,
            numbering: true
          });
          return {
            target,
            blocks: rendered.blocks,
            content: rendered.blocks.join("\n\n")
          };
        }

        if (target === "threads") {
          const rendered = renderThreadsDigest(digest, {
            tone: config.output.tone,
            lang: config.output.lang,
            includeMetrics: config.output.include.metrics
          });
          return {
            target,
            blocks: rendered.blocks,
            content: rendered.blocks.join("\n\n")
          };
        }

        const internal = renderInternalDigest(digest, {
          includeLinks: config.output.include.links,
          includeMetrics: config.output.include.metrics
        });
        return {
          target,
          content: internal
        };
      }
    },
    {
      date: timeWindow.until,
      timezone: config.timezone,
      scope: { repos: config.scope.repos }
    },
    hooks
  );

  const statsLine = `Stats: done=${pipelineResult.digest.stats.done}, in_progress=${pipelineResult.digest.stats.inProgress}, blocked=${pipelineResult.digest.stats.blocked}, due_today=${pipelineResult.digest.stats.dueToday}`;
  return {
    rendered: pipelineResult.output,
    statsLine,
    digestDate: pipelineResult.digest.date
  };
}

async function loadValidatedConfig(cwd: string, io: CliIO): Promise<RepoDigestConfig | null> {
  try {
    const config = await loadConfig(cwd);
    if (config.scope.repos.length === 0) {
      io.error("Configuration error: scope.repos must include at least one owner/repo.");
      return null;
    }
    return config;
  } catch (error: unknown) {
    io.error("Cannot load .repodigest.yml");
    io.error(formatConfigError(error));
    return null;
  }
}

async function runToday(
  cwd: string,
  io: CliIO,
  args: string[],
  runtimeOptions: CliRuntimeOptions
): Promise<number> {
  const config = await loadValidatedConfig(cwd, io);
  if (!config) {
    return 1;
  }

  let parsedArgs: WindowArgs;
  try {
    parsedArgs = parseWindowArgs(args, { requireSince: false });
  } catch (error: unknown) {
    io.error(formatConfigError(error));
    return 1;
  }

  const now = new Date();
  const defaults = {
    since: new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString(),
    until: now.toISOString()
  };

  let timeWindow: ResolvedTimeWindow;
  try {
    timeWindow = resolveTimeWindow(parsedArgs, defaults, now);
  } catch (error: unknown) {
    io.error(formatConfigError(error));
    return 1;
  }

  try {
    const effectiveConfig = applyWindowOverrides(config, parsedArgs);
    const output = await runDigestPipeline(cwd, effectiveConfig, timeWindow, runtimeOptions, io);
    if (parsedArgs.dryRun || parsedArgs.preview) {
      printRenderedPreview(io, output.rendered);
      return 0;
    }

    const files = await writeDigestFiles({
      cwd,
      date: output.digestDate,
      content: output.rendered.content
    });
    io.log(`Created ${files.dailyFile}`);
    io.log(`Updated ${files.latestFile}`);
    io.log(output.statsLine);
    return 0;
  } catch (error: unknown) {
    io.error(formatConfigError(error));
    return 1;
  }
}

async function runRange(
  cwd: string,
  io: CliIO,
  args: string[],
  runtimeOptions: CliRuntimeOptions
): Promise<number> {
  const config = await loadValidatedConfig(cwd, io);
  if (!config) {
    return 1;
  }

  let parsedArgs: WindowArgs;
  try {
    parsedArgs = parseWindowArgs(args, { requireSince: true });
  } catch (error: unknown) {
    io.error(formatConfigError(error));
    return 1;
  }

  const now = new Date();
  let timeWindow: ResolvedTimeWindow;
  try {
    timeWindow = resolveTimeWindow(parsedArgs, { since: "monday", until: "now" }, now);
  } catch (error: unknown) {
    io.error(formatConfigError(error));
    return 1;
  }

  try {
    const effectiveConfig = applyWindowOverrides(config, parsedArgs);
    const output = await runDigestPipeline(cwd, effectiveConfig, timeWindow, runtimeOptions, io);
    if (parsedArgs.dryRun || parsedArgs.preview) {
      printRenderedPreview(io, output.rendered);
      return 0;
    }

    const files = await writeRangeDigestFiles({
      cwd,
      since: timeWindow.sinceLabel,
      until: timeWindow.untilLabel,
      content: output.rendered.content
    });
    io.log(`Created ${files.rangeFile}`);
    io.log(`Updated ${files.latestFile}`);
    io.log(output.statsLine);
    return 0;
  } catch (error: unknown) {
    io.error(formatConfigError(error));
    return 1;
  }
}

async function runValidate(cwd: string, io: CliIO): Promise<number> {
  try {
    const config = await loadConfig(cwd);
    if (config.scope.repos.length === 0) {
      io.error("Config validation failed.");
      io.error("scope.repos must include at least one owner/repo.");
      return 1;
    }

    const tokenKey = config.providers.github.tokenEnv;
    const token = await loadToken(cwd, tokenKey);
    if (!token) {
      io.error("Config validation failed.");
      io.error(`Missing token value for ${tokenKey} in environment or .env.`);
      return 1;
    }

    io.log("Config is valid.");
    io.log(`Timezone: ${config.timezone}`);
    io.log(`Tracked repos: ${config.scope.repos.length}`);
    return 0;
  } catch (error: unknown) {
    io.error("Config validation failed.");
    io.error(formatConfigError(error));
    return 1;
  }
}

async function runInit(
  cwd: string,
  io: CliIO,
  args: string[],
  runtimeOptions: CliRuntimeOptions
): Promise<number> {
  try {
    const parsed = parseInitArgs(args);
    const resolveClientId = (): string | undefined =>
      parsed.clientId ?? process.env.REPODIGEST_GITHUB_CLIENT_ID;

    const completeBrowserAuth = async (installRoot: string): Promise<number> => {
      const clientId = resolveClientId();
      await mkdir(installRoot, { recursive: true });

      const tokenEnv = await resolveTokenEnvKey(installRoot);
      if (!parsed.yes && !parsed.quick) {
        const askSelect =
          runtimeOptions.prompts?.select ??
          ((options: { message: string; choices: Array<{ name: string; value: string }> }) =>
            promptSelect(options));
        const decision = await askSelect({
          message: "GitHub browser is ready. Authorize now?",
          choices: [
            { name: "Yes, open browser now", value: "yes" },
            { name: "Skip for now", value: "no" }
          ]
        });
        if (decision !== "yes") {
          io.log("Skipped browser authorization. Run `repodigest auth login` when ready.");
          return 0;
        }
      }

      return runAuthLogin(installRoot, io, {
        tokenEnv,
        scope: parsed.authScope ?? "repo",
        noBrowser: parsed.noBrowser || Boolean(runtimeOptions.createGithubDeviceAuthClient),
        ...(clientId ? { clientId } : {}),
        ...(runtimeOptions.createGithubDeviceAuthClient
          ? { client: runtimeOptions.createGithubDeviceAuthClient() }
          : {})
      });
    };

    const completeRepoSelection = async (installRoot: string): Promise<number> => {
      await ensureReposConfigured(installRoot, io, runtimeOptions);
      return 0;
    };

    const ensureTargetIsReady = async (target: InstallTarget): Promise<boolean> => {
      const installRoot = resolveInstallRoot(cwd, target);
      const configPath = path.join(installRoot, ".repodigest.yml");
      if (!(await pathExists(configPath))) {
        return true;
      }

      if (!parsed.reinstall) {
        const canPrompt = Boolean(runtimeOptions.prompts) || Boolean(process.stdin.isTTY);
        if (!canPrompt) {
          throw new Error("RepoDigest is already installed. Re-run with --reinstall to replace the install.");
        }

        const askSelect =
          runtimeOptions.prompts?.select ??
          ((options: { message: string; choices: Array<{ name: string; value: string }> }) =>
            promptSelect(options));
        const decision = await askSelect({
          message: "Existing RepoDigest installation detected. Reinstall now?",
          choices: [
            { name: "Reinstall (remove generated files and continue)", value: "reinstall" },
            { name: "Cancel", value: "cancel" }
          ]
        });
        if (decision !== "reinstall") {
          io.log("Initialization cancelled.");
          return false;
        }
        parsed.reinstall = true;
      }

      const removeArgs = ["--yes", ...(target === "agentrule" ? ["--agentrule"] : ["--project"])];
      const removeCode = await runRemove(cwd, io, removeArgs);
      if (removeCode !== 0) {
        return false;
      }
      io.log("Previous installation removed. Continuing with reinstall...");
      return true;
    };

    if (parsed.quick) {
      const target = parsed.target ?? "project";
      const tokenSource = parsed.tokenSource ?? "browser";

      if (tokenSource === "browser") {
        const installRoot = resolveInstallRoot(cwd, target);
        const authCode = await completeBrowserAuth(installRoot);
        if (authCode !== 0) {
          return authCode;
        }
      }

      const ready = await ensureTargetIsReady(target);
      if (!ready) {
        return 1;
      }

      const result = await runInitPreset({
        cwd,
        target,
        repos: parsed.repos,
        tokenSource,
        reinstall: parsed.reinstall,
        ...(parsed.language ? { outputLanguage: parsed.language } : {}),
        ...(parsed.timezone ? { timezone: parsed.timezone } : {}),
        ...(parsed.components ? { components: parsed.components } : {})
      });

      io.log(`Install target: ${result.installTarget}`);
      io.log(`Install root: ${result.installRoot}`);
      for (const file of result.createdFiles) {
        io.log(`Created ${file}`);
      }
      const repoCode = await completeRepoSelection(result.installRoot);
      if (repoCode !== 0) {
        return repoCode;
      }

      const validateCode = await runValidate(result.installRoot, io);
      if (validateCode === 0) {
        io.log("Quick setup complete.");
      }
      return validateCode;
    }

    if (parsed.yes) {
      const target = parsed.target ?? "project";
      const tokenSource = parsed.tokenSource ?? "browser";

      if (tokenSource === "browser") {
        const installRoot = resolveInstallRoot(cwd, target);
        const authCode = await completeBrowserAuth(installRoot);
        if (authCode !== 0) {
          return authCode;
        }
      }

      const ready = await ensureTargetIsReady(target);
      if (!ready) {
        return 1;
      }

      const result = await runInitPreset({
        cwd,
        target,
        repos: parsed.repos,
        reinstall: parsed.reinstall,
        ...(parsed.language ? { outputLanguage: parsed.language } : {}),
        ...(parsed.timezone ? { timezone: parsed.timezone } : {}),
        ...(parsed.tokenSource ? { tokenSource: parsed.tokenSource } : {}),
        ...(parsed.components ? { components: parsed.components } : {})
      });

      io.log(`Install target: ${result.installTarget}`);
      io.log(`Install root: ${result.installRoot}`);
      for (const file of result.createdFiles) {
        io.log(`Created ${file}`);
      }
      return completeRepoSelection(result.installRoot);
    }

    const initOptions: {
      cwd: string;
      prompts?: PromptAdapter;
      defaults?: { target?: InstallTarget };
    } = {
      cwd,
      defaults: { ...(parsed.target ? { target: parsed.target } : {}) }
    };
    if (runtimeOptions.prompts) {
      initOptions.prompts = runtimeOptions.prompts;
    }

    const result = await runInitWizard(initOptions);
    io.log(`Install target: ${result.installTarget}`);
    io.log(`Install root: ${result.installRoot}`);
    for (const file of result.createdFiles) {
      io.log(`Created ${file}`);
    }

    if (result.tokenSource === "browser") {
      const authCode = await completeBrowserAuth(result.installRoot);
      if (authCode !== 0) {
        return authCode;
      }
    }
    return completeRepoSelection(result.installRoot);
  } catch (error: unknown) {
    io.error("Initialization failed.");
    io.error(formatConfigError(error));
    return 1;
  }
}

async function resolveTokenEnvKey(cwd: string, explicit?: string): Promise<string> {
  if (explicit) {
    return explicit;
  }
  try {
    const config = await loadConfig(cwd);
    return config.providers.github.tokenEnv;
  } catch {
    return "GITHUB_TOKEN";
  }
}

async function runAuth(
  cwd: string,
  io: CliIO,
  args: string[],
  runtimeOptions: CliRuntimeOptions
): Promise<number> {
  try {
    const parsed = parseAuthArgs(args);
    if (parsed.action === "help") {
      io.log("Auth commands:");
      io.log("  repodigest auth login [--client-id <id>] [--scope <scopes>] [--token-env <key>]");
      io.log("  repodigest auth logout [--token-env <key>]");
      io.log("Options:");
      io.log("  --project|--agentrule   target root for .env file");
      io.log("  --client-id <id>        optional OAuth app client id (fallback when `gh` is unavailable)");
      io.log("  --scope <value>         default: repo");
      io.log("  --token-env <key>       default: providers.github.tokenEnv or GITHUB_TOKEN");
      io.log("  --no-browser            print URL only, do not auto-open browser");
      return 0;
    }

    const install = resolveTargetRoot(cwd, parsed.target);
    const tokenEnv = await resolveTokenEnvKey(install.root, parsed.tokenEnv);

    if (parsed.action === "logout") {
      return runAuthLogout(install.root, io, tokenEnv);
    }

    const clientId = parsed.clientId ?? process.env.REPODIGEST_GITHUB_CLIENT_ID;

    return await runAuthLogin(install.root, io, {
      tokenEnv,
      scope: parsed.scope,
      noBrowser: parsed.noBrowser,
      ...(clientId ? { clientId } : {}),
      ...(runtimeOptions.createGithubDeviceAuthClient
        ? { client: runtimeOptions.createGithubDeviceAuthClient() }
        : {})
    });
  } catch (error: unknown) {
    io.error("Auth failed.");
    io.error(formatConfigError(error));
    return 1;
  }
}

async function runTrending(
  cwd: string,
  io: CliIO,
  args: string[],
  runtimeOptions: CliRuntimeOptions
): Promise<number> {
  try {
    const parsed = parseTrendingArgs(args);
    let language = parsed.language;
    let limit = parsed.limit;

    if (parsed.wizard) {
      if (!runtimeOptions.prompts && !process.stdin.isTTY) {
        throw new Error("No interactive terminal for wizard mode.");
      }

      const askSelect =
        runtimeOptions.prompts?.select ??
        ((options: { message: string; choices: Array<{ name: string; value: string }> }) => promptSelect(options));
      const askInput =
        runtimeOptions.prompts?.input ??
        ((options: { message: string; default?: string }) => promptInput(options));

      language = (await askSelect({
        message: "Summary language",
        choices: [
          { name: "English", value: "en" },
          { name: "zh-TW", value: "zh-TW" },
          { name: "Both", value: "both" }
        ]
      })) as OutputLanguage;

      const limitRaw = (await askInput({ message: "How many repos (1-30)?", default: String(limit) })).trim();
      const parsedLimit = Number(limitRaw);
      if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 30) {
        throw new Error("Invalid limit in wizard mode. Expected an integer between 1 and 30.");
      }
      limit = parsedLimit;
    }

    const day = toUtcDayLabel(new Date());
    const envFile = await loadDotEnv(cwd);
    const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN ?? envFile.GITHUB_TOKEN ?? envFile.GH_TOKEN;

    const repos = runtimeOptions.fetchGithubTrendingRepos
      ? await runtimeOptions.fetchGithubTrendingRepos({ day, limit, ...(token ? { token } : {}) })
      : await fetchGithubTrendingRepos({ day, limit, ...(token ? { token } : {}) });

    if (repos.length === 0) {
      io.error("No repositories found for today.");
      return 1;
    }

    const content = renderTrendingSummary(repos, day, language);
    const outputRoot = path.join(cwd, "repodigest", "trending");
    const dailyFile = path.join(outputRoot, `${day}.md`);
    const latestFile = path.join(cwd, "repodigest", "latest-trending.md");

    await mkdir(outputRoot, { recursive: true });
    await writeFile(dailyFile, content, "utf-8");
    await writeFile(latestFile, content, "utf-8");

    io.log(`Created ${dailyFile}`);
    io.log(`Updated ${latestFile}`);
    io.log(`Fetched ${repos.length} repos (day=${day}, lang=${language}).`);
    return 0;
  } catch (error: unknown) {
    io.error("Trending fetch failed.");
    io.error(formatConfigError(error));
    return 1;
  }
}

async function runSum(cwd: string, io: CliIO, args: string[], runtimeOptions: CliRuntimeOptions): Promise<number> {
  try {
    const config = await loadValidatedConfig(cwd, io);
    if (!config) {
      return 1;
    }

    const parsed = parseSumArgs(args);
    const { name: profileName, profile } = resolveSummaryProfile(config, parsed.profile);
    const selectedLanguage = parsed.language ?? profile.language;

    const now = new Date();
    const timeWindow = resolveTimeWindow(
      { dryRun: false, preview: false, since: "today", until: "now" },
      { since: "today", until: "now" },
      now
    );

    const token = await loadToken(cwd, config.providers.github.tokenEnv);
    if (!token) {
      throw new Error(`Missing GitHub token. Set ${config.providers.github.tokenEnv} in environment or .env`);
    }

    const provider = runtimeOptions.createGithubProvider?.(token) ?? new GithubProviderClient({ token });
    const fetchOptions: GithubFetchOptions = {
      repos: config.scope.repos,
      since: timeWindow.sinceIso,
      until: timeWindow.untilIso
    };

    const query = config.providers.github.query;
    if (query?.assignee) {
      fetchOptions.assignee = query.assignee;
    }
    if (query?.labelsAny) {
      fetchOptions.labelsAny = query.labelsAny;
    }

    const events = await provider.fetchEvents(fetchOptions);
    const commitEvents = events.filter((event) => event.type === "commit");
    const day = toUtcDayLabel(now);

    const makeText = (lang: "en" | "zh-TW"): string => {
      const header = languageHeader(lang, profileName, profile.audience, day);
      const lines = buildSummaryLines(commitEvents, profile, lang, config.summaries.identity.githubLogin);
      return [header, "", ...lines, ""].join("\n");
    };

    const fallbackContent =
      selectedLanguage === "both" ? `${makeText("zh-TW")}\n---\n\n${makeText("en")}` : makeText(selectedLanguage);

    let content = fallbackContent;
    const aiEnabled = parsed.useAi || config.summaries.ai.enabled;
    if (aiEnabled) {
      const aiContent = await tryGenerateAiSummary({
        content: fallbackContent,
        profileName,
        profile,
        language: selectedLanguage,
        config,
        cwd
      });
      if (aiContent) {
        content = aiContent;
      }
    }

    if (parsed.dryRun) {
      io.log(content);
      return 0;
    }

    const safeProfile = sanitizeProfileName(profileName);
    const outputRoot = path.join(cwd, "repodigest", "sum", safeProfile);
    const dailyFile = path.join(outputRoot, `${day}.md`);
    const latestFile = path.join(cwd, "repodigest", `latest-sum-${safeProfile}.md`);
    await mkdir(outputRoot, { recursive: true });
    await writeFile(dailyFile, content, "utf-8");
    await writeFile(latestFile, content, "utf-8");

    io.log(`Created ${dailyFile}`);
    io.log(`Updated ${latestFile}`);
    io.log(`Summarized ${commitEvents.length} commits using profile '${profileName}' (lang=${selectedLanguage}).`);
    return 0;
  } catch (error: unknown) {
    io.error("Summary failed.");
    io.error(formatConfigError(error));
    return 1;
  }
}

function resolveTargetRoot(cwd: string, target?: InstallTarget): { target: InstallTarget; root: string } {
  const resolvedTarget = target ?? "project";
  return {
    target: resolvedTarget,
    root: resolveInstallRoot(cwd, resolvedTarget)
  };
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function runUpdate(cwd: string, io: CliIO, args: string[]): Promise<number> {
  try {
    const parsed = parseUpdateArgs(args);
    const install = resolveTargetRoot(cwd, parsed.target);

    const config = await loadConfig(install.root);
    const nextConfig: RepoDigestConfig = {
      ...config,
      scope: {
        ...config.scope,
        repos: Array.from(new Set(config.scope.repos))
      },
      output: {
        ...config.output
      }
    };

    if (parsed.addRepos.length > 0) {
      for (const repo of parsed.addRepos) {
        if (!repoPattern.test(repo)) {
          throw new Error(`Invalid repo format: ${repo}. Expected owner/name.`);
        }
        if (!nextConfig.scope.repos.includes(repo)) {
          nextConfig.scope.repos.push(repo);
        }
      }
    }

    if (parsed.removeRepos.length > 0) {
      for (const repo of parsed.removeRepos) {
        if (!repoPattern.test(repo)) {
          throw new Error(`Invalid repo format: ${repo}. Expected owner/name.`);
        }
      }
      const removing = new Set(parsed.removeRepos);
      nextConfig.scope.repos = nextConfig.scope.repos.filter((repo) => !removing.has(repo));
    }

    if (nextConfig.scope.repos.length === 0) {
      throw new Error("At least one repo must remain in scope.repos.");
    }

    if (parsed.language) {
      nextConfig.output.lang = parsed.language;
    }
    if (parsed.timezone) {
      nextConfig.timezone = parsed.timezone;
    }
    if (parsed.renderTarget) {
      nextConfig.output.target = parsed.renderTarget;
    }
    if (parsed.tone) {
      nextConfig.output.tone = parsed.tone;
    }

    const configPath = path.join(install.root, ".repodigest.yml");
    await writeFile(configPath, serializeConfig(nextConfig), "utf-8");

    io.log(`Updated ${configPath}`);
    io.log(`Install target: ${install.target}`);
    io.log(`Tracked repos: ${nextConfig.scope.repos.length}`);
    return 0;
  } catch (error: unknown) {
    io.error("Update failed.");
    io.error(formatConfigError(error));
    return 1;
  }
}

async function runRemove(cwd: string, io: CliIO, args: string[]): Promise<number> {
  try {
    const parsed = parseRemoveArgs(args);
    if (!parsed.yes) {
      throw new Error("Refusing to remove files without --yes.");
    }

    const install = resolveTargetRoot(cwd, parsed.target);
    const removedPaths: string[] = [];

    const configPath = path.join(install.root, ".repodigest.yml");
    if (await pathExists(configPath)) {
      await rm(configPath, { force: true });
      removedPaths.push(configPath);
    }

    if (!parsed.keepOutput) {
      const outputPath = path.join(install.root, "repodigest");
      if (await pathExists(outputPath)) {
        await rm(outputPath, { recursive: true, force: true });
        removedPaths.push(outputPath);
      }
    }

    if (install.target === "project") {
      const workflowPath = path.join(install.root, ".github", "workflows", "repodigest.yml");
      if (await pathExists(workflowPath)) {
        await rm(workflowPath, { force: true });
        removedPaths.push(workflowPath);
      }
    }

    if (removedPaths.length === 0) {
      io.log(`No RepoDigest files found under ${install.root}`);
      return 0;
    }

    io.log(`Install target: ${install.target}`);
    for (const entry of removedPaths) {
      io.log(`Removed ${entry}`);
    }
    return 0;
  } catch (error: unknown) {
    io.error("Remove failed.");
    io.error(formatConfigError(error));
    return 1;
  }
}

function printHelp(io: CliIO): void {
  io.log("RepoDigest CLI");
  io.log("Usage: repodigest <today|range|trending|sum|validate|init|update|remove|auth>");
  io.log("Commands:");
  io.log("  init      interactive or one-line setup");
  io.log("  update    update existing .repodigest.yml values");
  io.log("  remove    remove RepoDigest-managed files from target");
  io.log("  auth      GitHub browser login/logout (OAuth device flow)");
  io.log("  validate  validate .repodigest.yml and token availability");
  io.log("  today     fetch last 24h GitHub activity and generate daily digest");
  io.log("  range     fetch GitHub activity in a custom time window");
  io.log("  trending  fetch today's GitHub repositories and generate summary");
  io.log("  sum       summarize today's commits for customer/team/custom audience");
  io.log("Window options:");
  io.log("  --dry-run           print digest to stdout without writing files");
  io.log("  --preview           preview rendered posts/blocks without writing files");
  io.log("  --since <value>     ISO date/time or shortcut (monday|today|yesterday|now)");
  io.log("  --until <value>     ISO date/time or shortcut (today|yesterday|now)");
  io.log("  --target <value>    internal|x|threads|markdown");
  io.log("  --tone <value>      calm|playful|hacker|formal");
  io.log("  --lang <value>      en|zh-TW|both");
  io.log("Trending options:");
  io.log("  --lang <value>      en|zh-TW|both");
  io.log("  --limit <number>    1..30, default 10");
  io.log("  --wizard            interactive language + limit prompts");
  io.log("Sum options:");
  io.log("  sum <profile>       profile key, e.g. cus|team|myboss");
  io.log("  --profile <value>   profile key from config.summaries.profiles");
  io.log("  --lang <value>      en|zh-TW|both (override profile language)");
  io.log("  --dry-run           print summary only");
  io.log("  --ai                force AI summarization if API key is available");
  io.log("Init options:");
  io.log("  --project           install to current project");
  io.log("  --agentrule         install to global agentrule location");
  io.log("  --yes               non-interactive mode");
  io.log("  --quick             one-command setup (init + browser auth + validate)");
  io.log("  --reinstall         reinstall if existing config is found");
  io.log("  --repo <owner/repo> repeatable (optional; can select after auth)");
  io.log("  --lang <en|zh-TW|both>");
  io.log("  --timezone <IANA timezone>");
  io.log("  --token-source <browser>  browser auth only");
  io.log("  --client-id <id>    optional GitHub OAuth client id");
  io.log("  --scope <value>     OAuth scope for browser auth (default: repo)");
  io.log("  --no-browser        print auth URL only; do not auto-open browser");
  io.log("  --components <cli|ide|action|all>");
  io.log("Update options:");
  io.log("  --project           update config in current project (default)");
  io.log("  --agentrule         update config in global agentrule location");
  io.log("  --add-repo <owner/repo>     repeatable");
  io.log("  --remove-repo <owner/repo>  repeatable");
  io.log("  --lang <en|zh-TW|both>");
  io.log("  --timezone <IANA timezone>");
  io.log("  --target <internal|x|threads|markdown>");
  io.log("  --tone <calm|playful|hacker|formal>");
  io.log("Remove options:");
  io.log("  --project           remove files in current project (default)");
  io.log("  --agentrule         remove files in global agentrule location");
  io.log("  --yes               required safety flag for removal");
  io.log("  --keep-output       keep generated repodigest output files");
  io.log("Auth options:");
  io.log("  auth login [--client-id <id>] [--scope repo] [--token-env GITHUB_TOKEN]");
  io.log("  auth logout [--token-env GITHUB_TOKEN]");
  io.log("  auth ... --project|--agentrule");
  io.log("Example one-line project install:");
  io.log("  repodigest init --quick --project");
}

export async function runCli(
  argv: string[],
  cwd = process.cwd(),
  runtimeOptions: CliRuntimeOptions = {}
): Promise<number> {
  const io = runtimeOptions.io ?? defaultIO();
  const parsed = parseCommand(argv);

  switch (parsed.command) {
    case "today":
      return runToday(cwd, io, parsed.args, runtimeOptions);
    case "range":
      return runRange(cwd, io, parsed.args, runtimeOptions);
    case "validate":
      return runValidate(cwd, io);
    case "init":
      return runInit(cwd, io, parsed.args, runtimeOptions);
    case "update":
      return runUpdate(cwd, io, parsed.args);
    case "remove":
      return runRemove(cwd, io, parsed.args);
    case "auth":
      return runAuth(cwd, io, parsed.args, runtimeOptions);
    case "trending":
      return runTrending(cwd, io, parsed.args, runtimeOptions);
    case "sum":
      return runSum(cwd, io, parsed.args, runtimeOptions);
    default:
      printHelp(io);
      return 0;
  }
}

