import { checkbox, input, select } from "@inquirer/prompts";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createDefaultConfig, serializeConfig } from "./config.js";

export type Component = "cli" | "ide" | "action";
export type TokenSource = "browser";
export type OutputLanguage = "zh-TW" | "en" | "both";
export type InstallTarget = "project" | "agentrule";

interface CheckboxOption {
  name: string;
  value: string;
  checked?: boolean;
}

interface SelectOption {
  name: string;
  value: string;
}

export interface PromptAdapter {
  checkbox: (options: { message: string; choices: CheckboxOption[] }) => Promise<string[]>;
  select: (options: { message: string; choices: SelectOption[] }) => Promise<string>;
  input: (options: { message: string; default?: string }) => Promise<string>;
}

interface InitDefaults {
  target?: InstallTarget;
}

export interface InitWizardOptions {
  cwd: string;
  prompts?: PromptAdapter;
  agentruleHome?: string;
  defaults?: InitDefaults;
}

export interface InitPresetOptions {
  cwd: string;
  target: InstallTarget;
  repos: string[];
  outputLanguage?: OutputLanguage;
  timezone?: string;
  tokenSource?: TokenSource;
  components?: Component[];
  reinstall?: boolean;
  agentruleHome?: string;
}

export interface InitWizardResult {
  configPath: string;
  createdFiles: string[];
  installTarget: InstallTarget;
  installRoot: string;
  tokenSource: TokenSource;
}

interface InitPlan {
  cwd: string;
  installTarget: InstallTarget;
  installRoot: string;
  components: Set<Component>;
  tokenSource: TokenSource;
  repos: string[];
  outputLanguage: OutputLanguage;
  timezone: string;
  summaryDefaultProfile: string;
  summaryGithubLogin?: string;
  aiEnabled: boolean;
  aiBaseUrl: string;
  aiModel: string;
  aiApiKeyEnv: string;
}

const actionWorkflowTemplate = `name: RepoDigest Daily
on:
  schedule:
    - cron: "0 1 * * *"
  workflow_dispatch:
jobs:
  digest:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm ci
      - run: npx repodigest today
`;

function defaultPrompts(): PromptAdapter {
  return {
    checkbox: (options) => checkbox(options),
    select: (options) => select(options),
    input: (options) => input(options)
  };
}

function normalizeComponents(choices: string[]): Set<Component> {
  if (choices.includes("all")) {
    return new Set<Component>(["cli", "ide", "action"]);
  }
  const selected = new Set<Component>();
  for (const choice of choices) {
    if (choice === "cli" || choice === "ide" || choice === "action") {
      selected.add(choice);
    }
  }
  return selected;
}

function isValidRepo(value: string): boolean {
  return /^[^/\s]+\/[^/\s]+$/.test(value);
}

function resolveAgentruleHome(agentruleHome?: string): string {
  if (agentruleHome) {
    return agentruleHome;
  }

  if (process.env.AGENTRULE_HOME) {
    return process.env.AGENTRULE_HOME;
  }

  return path.join(os.homedir(), ".agentrule");
}

export function resolveInstallRoot(
  cwd: string,
  target: InstallTarget,
  agentruleHome?: string
): string {
  if (target === "project") {
    return cwd;
  }
  return path.join(resolveAgentruleHome(agentruleHome), "repodigest");
}

async function promptRepos(promptImpl: PromptAdapter): Promise<string[]> {
  const repos: string[] = [];

  while (true) {
    const value = (
      await promptImpl.input({
        message: "Repository (owner/name), press Enter to finish",
        default: ""
      })
    ).trim();

    if (!value) {
      break;
    }

    if (!isValidRepo(value)) {
      throw new Error(`Invalid repo format: ${value}. Expected owner/name.`);
    }

    repos.push(value);
  }

  return repos;
}

function buildVsCodeTaskSnippet(): Record<string, unknown>[] {
  return [
    {
      label: "RepoDigest: Today",
      type: "shell",
      command: "npx repodigest today",
      problemMatcher: []
    },
    {
      label: "RepoDigest: This Week",
      type: "shell",
      command: "npx repodigest range --since monday",
      problemMatcher: []
    }
  ];
}

async function mergeVsCodeTasks(projectRoot: string): Promise<string> {
  const vscodeDir = path.join(projectRoot, ".vscode");
  const tasksPath = path.join(vscodeDir, "tasks.json");
  await mkdir(vscodeDir, { recursive: true });

  let current: Record<string, unknown> = { version: "2.0.0", tasks: [] };
  try {
    const raw = await readFile(tasksPath, "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object") {
      current = parsed as Record<string, unknown>;
    }
  } catch {
    current = { version: "2.0.0", tasks: [] };
  }

  const existingTasks = Array.isArray(current.tasks)
    ? (current.tasks as Array<Record<string, unknown>>)
    : [];
  const existingLabels = new Set(
    existingTasks
      .map((task) => (typeof task.label === "string" ? task.label : ""))
      .filter((label) => label.length > 0)
  );

  const toAppend = buildVsCodeTaskSnippet().filter(
    (task) => typeof task.label === "string" && !existingLabels.has(task.label)
  );

  const merged = {
    ...current,
    version: "2.0.0",
    tasks: [...existingTasks, ...toAppend]
  };

  await writeFile(tasksPath, `${JSON.stringify(merged, null, 2)}\n`, "utf-8");
  return tasksPath;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await readFile(filePath, "utf-8");
    return true;
  } catch {
    return false;
  }
}

async function removeExistingInstall(installRoot: string, installTarget: InstallTarget): Promise<void> {
  await rm(path.join(installRoot, ".repodigest.yml"), { force: true });
  await rm(path.join(installRoot, "repodigest"), { recursive: true, force: true });
  if (installTarget === "project") {
    await rm(path.join(installRoot, ".github", "workflows", "repodigest.yml"), { force: true });
  }
}

function validatePlan(plan: InitPlan): void {
  if (plan.components.size === 0) {
    throw new Error("No components selected.");
  }

  if (plan.installTarget === "agentrule") {
    if (plan.components.has("ide") || plan.components.has("action")) {
      throw new Error("IDE and GitHub Action components are only supported for project install target.");
    }
  }

  for (const repo of plan.repos) {
    if (!isValidRepo(repo)) {
      throw new Error(`Invalid repo format: ${repo}. Expected owner/name.`);
    }
  }
}

async function applyInitPlan(plan: InitPlan): Promise<InitWizardResult> {
  validatePlan(plan);

  const createdFiles: string[] = [];
  const configPath = path.join(plan.installRoot, ".repodigest.yml");
  if (await fileExists(configPath)) {
    throw new Error(`.repodigest.yml already exists at ${configPath}`);
  }

  await mkdir(plan.installRoot, { recursive: true });

  const config = createDefaultConfig();
  config.timezone = plan.timezone || "UTC";
  config.scope.repos = plan.repos;
  config.output.lang = plan.outputLanguage;
  config.summaries.defaultProfile = plan.summaryDefaultProfile;
  if (plan.summaryGithubLogin) {
    config.summaries.identity.githubLogin = plan.summaryGithubLogin;
  }
  config.summaries.ai.enabled = plan.aiEnabled;
  config.summaries.ai.baseUrl = plan.aiBaseUrl;
  config.summaries.ai.model = plan.aiModel;
  config.summaries.ai.apiKeyEnv = plan.aiApiKeyEnv;

  await writeFile(configPath, serializeConfig(config), "utf-8");
  createdFiles.push(configPath);

  const outputDir = path.join(plan.installRoot, "repodigest");
  await mkdir(outputDir, { recursive: true });
  createdFiles.push(outputDir);

  if (plan.installTarget === "project") {
    if (plan.components.has("ide")) {
      const tasksPath = await mergeVsCodeTasks(plan.installRoot);
      createdFiles.push(tasksPath);
    }

    if (plan.components.has("action")) {
      const workflowPath = path.join(plan.installRoot, ".github", "workflows", "repodigest.yml");
      await mkdir(path.dirname(workflowPath), { recursive: true });
      await writeFile(workflowPath, actionWorkflowTemplate, "utf-8");
      createdFiles.push(workflowPath);
    }
  }

  return {
    configPath,
    createdFiles,
    installTarget: plan.installTarget,
    installRoot: plan.installRoot,
    tokenSource: plan.tokenSource
  };
}

export async function runInitWizard(options: InitWizardOptions): Promise<InitWizardResult> {
  const promptImpl = options.prompts ?? defaultPrompts();
  const defaultTarget = options.defaults?.target ?? "project";

  const installTarget = (await promptImpl.select({
    message: "Install target",
    choices: [
      { name: "This project (local)", value: "project" },
      { name: "agentrule (global)", value: "agentrule" }
    ]
  })) as InstallTarget;

  const target = installTarget || defaultTarget;
  const installRoot = resolveInstallRoot(options.cwd, target, options.agentruleHome);

  const configPath = path.join(installRoot, ".repodigest.yml");
  if (await fileExists(configPath)) {
    const action = await promptImpl.select({
      message: "Existing RepoDigest install detected. What do you want to do?",
      choices: [
        { name: "Reinstall (remove generated files and continue)", value: "reinstall" },
        { name: "Cancel", value: "cancel" }
      ]
    });
    if (action !== "reinstall") {
      throw new Error("Initialization cancelled.");
    }
    await removeExistingInstall(installRoot, target);
  }

  const components =
    target === "project"
      ? normalizeComponents(
          await promptImpl.checkbox({
            message: "Select components to install",
            choices: [
              { name: "CLI", value: "cli", checked: true },
              { name: "IDE (VS Code Tasks)", value: "ide" },
              { name: "GitHub Action", value: "action" },
              { name: "All", value: "all" }
            ]
          })
        )
      : new Set<Component>(["cli"]);

  const tokenSource: TokenSource = "browser";

  const repos = await promptRepos(promptImpl);
  const outputLanguage = (await promptImpl.select({
    message: "Output language",
    choices: [
      { name: "zh-TW", value: "zh-TW" },
      { name: "English", value: "en" },
      { name: "Both", value: "both" }
    ]
  })) as OutputLanguage;

  const autoTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const timezone = (
    await promptImpl.input({
      message: "Timezone",
      default: autoTimezone
    })
  ).trim();

  const summaryDefaultProfile = await promptImpl.select({
    message: "Default summary profile for `repodigest sum`",
    choices: [
      { name: "Team (professional)", value: "team" },
      { name: "Customer (natural language)", value: "cus" }
    ]
  });

  const summaryGithubLogin = (
    await promptImpl.input({
      message: "GitHub login for 'my commits' filter (optional)",
      default: ""
    })
  ).trim();

  const enableAi =
    (await promptImpl.select({
      message: "Enable optional AI summarizer setup now?",
      choices: [
        { name: "No (use built-in summary fallback)", value: "no" },
        { name: "Yes (OpenAI-compatible endpoint)", value: "yes" }
      ]
    })) === "yes";

  let aiBaseUrl = "https://api.openai.com/v1";
  let aiModel = "gpt-4o-mini";
  let aiApiKeyEnv = "OPENAI_API_KEY";
  if (enableAi) {
    aiBaseUrl = (
      await promptImpl.input({
        message: "AI base URL (OpenAI-compatible)",
        default: aiBaseUrl
      })
    ).trim();
    aiModel = (
      await promptImpl.input({
        message: "AI model",
        default: aiModel
      })
    ).trim();
    aiApiKeyEnv = (
      await promptImpl.input({
        message: "API key env var name",
        default: aiApiKeyEnv
      })
    ).trim();
  }

  return applyInitPlan({
    cwd: options.cwd,
    installTarget: target,
    installRoot,
    components,
    tokenSource,
    repos,
    outputLanguage,
    timezone,
    summaryDefaultProfile,
    ...(summaryGithubLogin ? { summaryGithubLogin } : {}),
    aiEnabled: enableAi,
    aiBaseUrl,
    aiModel,
    aiApiKeyEnv
  });
}

export async function runInitPreset(options: InitPresetOptions): Promise<InitWizardResult> {
  const installRoot = resolveInstallRoot(options.cwd, options.target, options.agentruleHome);
  const components = new Set<Component>(options.components ?? ["cli"]);
  const tokenSource = options.tokenSource ?? "browser";
  const outputLanguage = options.outputLanguage ?? "en";
  const timezone = options.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC";

  if (tokenSource !== "browser") {
    throw new Error("Only token-source=browser is supported.");
  }

  const configPath = path.join(installRoot, ".repodigest.yml");
  if ((await fileExists(configPath)) && !options.reinstall) {
    throw new Error("RepoDigest is already installed. Re-run with --reinstall to replace the install.");
  }
  if (options.reinstall) {
    await removeExistingInstall(installRoot, options.target);
  }

  return applyInitPlan({
    cwd: options.cwd,
    installTarget: options.target,
    installRoot,
    components,
    tokenSource,
    repos: options.repos,
    outputLanguage,
    timezone,
    summaryDefaultProfile: "team",
    aiEnabled: false,
    aiBaseUrl: "https://api.openai.com/v1",
    aiModel: "gpt-4o-mini",
    aiApiKeyEnv: "OPENAI_API_KEY"
  });
}
