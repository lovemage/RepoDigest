#!/usr/bin/env node
import { input as promptInput, select as promptSelect } from "@inquirer/prompts";
import { access, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runPipeline, type Event, type WorkItem } from "@repodigest/core";
import { GithubProviderClient, type GithubFetchOptions } from "@repodigest/provider-github";
import { renderInternalDigest } from "@repodigest/renderer-internal";
import { renderThreadsDigest } from "@repodigest/renderer-threads";
import { renderXDigest } from "@repodigest/renderer-x";
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

type CliCommand = "today" | "range" | "validate" | "init" | "update" | "remove" | "auth" | "help";
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
  repos: string[];
  language?: OutputLanguage;
  timezone?: string;
  tokenSource?: TokenSource;
  token?: string;
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
    command === "auth"
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
      if (value !== "env" && value !== "input" && value !== "browser") {
        throw new Error(`Invalid --token-source value: ${value}`);
      }
      result.tokenSource = value;
      i += 1;
      continue;
    }

    if (arg === "--token") {
      const value = args[i + 1];
      if (!value) {
        throw new Error("Missing value for --token");
      }
      result.token = value;
      i += 1;
      continue;
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
    const resolveClientId = async (): Promise<string | undefined> => {
      const configured = parsed.clientId ?? process.env.REPODIGEST_GITHUB_CLIENT_ID;
      if (configured) {
        return configured;
      }
      if (parsed.yes || parsed.quick) {
        return undefined;
      }

      const askInput =
        runtimeOptions.prompts?.input ??
        ((options: { message: string; default?: string }) => promptInput(options));
      const provided = (
        await askInput({
          message: "GitHub OAuth client id (required for browser login)",
          default: ""
        })
      ).trim();
      return provided || undefined;
    };

    const completeBrowserAuth = async (installRoot: string): Promise<number> => {
      const clientId = await resolveClientId();
      if (!clientId) {
        io.error(
          "Initialization completed, but browser auth was skipped: missing GitHub OAuth client id."
        );
        io.error("Set REPODIGEST_GITHUB_CLIENT_ID or pass --client-id, then run `repodigest auth login`.");
        return 1;
      }

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
        clientId,
        scope: parsed.authScope ?? "repo",
        noBrowser: parsed.noBrowser,
        ...(runtimeOptions.createGithubDeviceAuthClient
          ? { client: runtimeOptions.createGithubDeviceAuthClient() }
          : {})
      });
    };

    if (parsed.quick) {
      const target = parsed.target ?? "project";
      const tokenSource = parsed.tokenSource ?? "browser";
      if (parsed.repos.length === 0) {
        throw new Error("Missing required option: --repo owner/repo (repeatable) for --quick mode.");
      }

      const result = await runInitPreset({
        cwd,
        target,
        repos: parsed.repos,
        tokenSource,
        ...(parsed.language ? { outputLanguage: parsed.language } : {}),
        ...(parsed.timezone ? { timezone: parsed.timezone } : {}),
        ...(parsed.token ? { token: parsed.token } : {}),
        ...(parsed.components ? { components: parsed.components } : {})
      });

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

      const validateCode = await runValidate(result.installRoot, io);
      if (validateCode === 0) {
        io.log("Quick setup complete.");
      }
      return validateCode;
    }

    if (parsed.yes) {
      const target = parsed.target ?? "project";
      const result = await runInitPreset({
        cwd,
        target,
        repos: parsed.repos,
        ...(parsed.language ? { outputLanguage: parsed.language } : {}),
        ...(parsed.timezone ? { timezone: parsed.timezone } : {}),
        ...(parsed.tokenSource ? { tokenSource: parsed.tokenSource } : {}),
        ...(parsed.token ? { token: parsed.token } : {}),
        ...(parsed.components ? { components: parsed.components } : {})
      });

      io.log(`Install target: ${result.installTarget}`);
      io.log(`Install root: ${result.installRoot}`);
      for (const file of result.createdFiles) {
        io.log(`Created ${file}`);
      }

      if (result.tokenSource === "browser") {
        return completeBrowserAuth(result.installRoot);
      }
      return 0;
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
      return completeBrowserAuth(result.installRoot);
    }
    return 0;
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
      io.log("  --client-id <id>        GitHub OAuth app client id");
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
    if (!clientId) {
      throw new Error(
        "Missing GitHub OAuth client id. Use --client-id or set REPODIGEST_GITHUB_CLIENT_ID."
      );
    }

    return runAuthLogin(install.root, io, {
      tokenEnv,
      clientId,
      scope: parsed.scope,
      noBrowser: parsed.noBrowser,
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
  io.log("Usage: repodigest <today|range|validate|init|update|remove|auth>");
  io.log("Commands:");
  io.log("  init      interactive or one-line setup");
  io.log("  update    update existing .repodigest.yml values");
  io.log("  remove    remove RepoDigest-managed files from target");
  io.log("  auth      GitHub browser login/logout (OAuth device flow)");
  io.log("  validate  validate .repodigest.yml and token availability");
  io.log("  today     fetch last 24h GitHub activity and generate daily digest");
  io.log("  range     fetch GitHub activity in a custom time window");
  io.log("Window options:");
  io.log("  --dry-run           print digest to stdout without writing files");
  io.log("  --preview           preview rendered posts/blocks without writing files");
  io.log("  --since <value>     ISO date/time or shortcut (monday|today|yesterday|now)");
  io.log("  --until <value>     ISO date/time or shortcut (today|yesterday|now)");
  io.log("  --target <value>    internal|x|threads|markdown");
  io.log("  --tone <value>      calm|playful|hacker|formal");
  io.log("  --lang <value>      en|zh-TW|both");
  io.log("Init options:");
  io.log("  --project           install to current project");
  io.log("  --agentrule         install to global agentrule location");
  io.log("  --yes               non-interactive mode");
  io.log("  --quick             one-command setup (init + optional browser auth + validate)");
  io.log("  --repo <owner/repo> repeatable");
  io.log("  --lang <en|zh-TW|both>");
  io.log("  --timezone <IANA timezone>");
  io.log("  --token-source <env|input|browser>");
  io.log("  --token <value>     required when --token-source input in --yes mode");
  io.log("  --client-id <id>    GitHub OAuth client id for --token-source browser");
  io.log("  --scope <value>     OAuth scope for --token-source browser (default: repo)");
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
  io.log("  auth login --client-id <id> [--scope repo] [--token-env GITHUB_TOKEN]");
  io.log("  auth logout [--token-env GITHUB_TOKEN]");
  io.log("  auth ... --project|--agentrule");
  io.log("Example one-line project install:");
  io.log("  repodigest init --project --yes --repo owner/repo");
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
    default:
      printHelp(io);
      return 0;
  }
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  runCli(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error: unknown) => {
      console.error(error);
      process.exitCode = 1;
    });
}
