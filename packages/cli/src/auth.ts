import { access, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline/promises";

export interface AuthLogger {
  log: (message: string) => void;
  error: (message: string) => void;
}

export interface DeviceCodePayload {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  verificationUriComplete?: string;
  expiresIn: number;
  interval: number;
}

export interface DeviceTokenResponse {
  status: "pending" | "slow_down" | "token" | "denied" | "expired";
  accessToken?: string;
  errorDescription?: string;
}

export interface GithubDeviceAuthClientLike {
  requestDeviceCode: (options: { clientId: string; scope: string }) => Promise<DeviceCodePayload>;
  pollAccessToken: (options: { clientId: string; deviceCode: string }) => Promise<DeviceTokenResponse>;
}

interface CommandResult {
  code: number;
  stdout: string;
  stderr: string;
  notFound: boolean;
}

function toFormBody(values: Record<string, string>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    params.set(key, value);
  }
  return params.toString();
}

export function createGithubDeviceAuthClient(): GithubDeviceAuthClientLike {
  return {
    async requestDeviceCode(options) {
      const response = await fetch("https://github.com/login/device/code", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: toFormBody({
          client_id: options.clientId,
          scope: options.scope
        })
      });

      if (!response.ok) {
        throw new Error(`GitHub device code request failed: HTTP ${response.status}`);
      }

      const data = (await response.json()) as Record<string, unknown>;
      const deviceCode = typeof data.device_code === "string" ? data.device_code : "";
      const userCode = typeof data.user_code === "string" ? data.user_code : "";
      const verificationUri =
        typeof data.verification_uri === "string" ? data.verification_uri : "";
      const expiresIn =
        typeof data.expires_in === "number" ? data.expires_in : Number(data.expires_in ?? 0);
      const interval =
        typeof data.interval === "number" ? data.interval : Number(data.interval ?? 5);

      if (!deviceCode || !userCode || !verificationUri || !Number.isFinite(expiresIn)) {
        throw new Error("GitHub device code response is missing required fields.");
      }

      return {
        deviceCode,
        userCode,
        verificationUri,
        ...(typeof data.verification_uri_complete === "string"
          ? { verificationUriComplete: data.verification_uri_complete }
          : {}),
        expiresIn,
        interval: Number.isFinite(interval) && interval > 0 ? interval : 5
      };
    },

    async pollAccessToken(options) {
      const response = await fetch("https://github.com/login/oauth/access_token", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: toFormBody({
          client_id: options.clientId,
          device_code: options.deviceCode,
          grant_type: "urn:ietf:params:oauth:grant-type:device_code"
        })
      });

      if (!response.ok) {
        throw new Error(`GitHub access token request failed: HTTP ${response.status}`);
      }

      const data = (await response.json()) as Record<string, unknown>;
      const token = typeof data.access_token === "string" ? data.access_token : "";
      if (token) {
        return {
          status: "token",
          accessToken: token
        };
      }

      const error = typeof data.error === "string" ? data.error : "";
      const errorDescription =
        typeof data.error_description === "string" ? data.error_description : undefined;

      if (error === "authorization_pending") {
        return {
          status: "pending",
          ...(errorDescription ? { errorDescription } : {})
        };
      }
      if (error === "slow_down") {
        return {
          status: "slow_down",
          ...(errorDescription ? { errorDescription } : {})
        };
      }
      if (error === "expired_token") {
        return {
          status: "expired",
          ...(errorDescription ? { errorDescription } : {})
        };
      }
      if (error === "access_denied") {
        return {
          status: "denied",
          ...(errorDescription ? { errorDescription } : {})
        };
      }

      throw new Error(
        `GitHub access token request failed: ${errorDescription ?? error ?? "unknown error"}`
      );
    }
  };
}

async function upsertEnvVar(cwd: string, key: string, value: string): Promise<string> {
  const envPath = path.join(cwd, ".env");
  let lines: string[] = [];

  try {
    const raw = await readFile(envPath, "utf-8");
    lines = raw.split(/\r?\n/);
  } catch {
    lines = [];
  }

  const targetLine = `${key}=${value}`;
  let replaced = false;
  const nextLines = lines.map((line) => {
    if (line.startsWith(`${key}=`)) {
      replaced = true;
      return targetLine;
    }
    return line;
  });

  if (!replaced) {
    nextLines.push(targetLine);
  }

  await writeFile(envPath, `${nextLines.filter(Boolean).join("\n")}\n`, "utf-8");
  return envPath;
}

async function removeEnvVar(cwd: string, key: string): Promise<{ envPath: string; removed: boolean }> {
  const envPath = path.join(cwd, ".env");
  let raw = "";
  try {
    raw = await readFile(envPath, "utf-8");
  } catch {
    return { envPath, removed: false };
  }

  const lines = raw.split(/\r?\n/);
  let removed = false;
  const filtered = lines.filter((line) => {
    if (line.startsWith(`${key}=`)) {
      removed = true;
      return false;
    }
    return Boolean(line);
  });

  await writeFile(envPath, filtered.length > 0 ? `${filtered.join("\n")}\n` : "", "utf-8");
  return { envPath, removed };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForEnterToOpenBrowser(logger: AuthLogger): Promise<void> {
  if (!process.stdin.isTTY || !process.stdout.isTTY || process.env.VITEST) {
    return;
  }

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout
  });

  try {
    await rl.question("Press Enter to open browser for GitHub authorization...");
  } catch {
    logger.log("Skipping browser open confirmation prompt.");
  } finally {
    rl.close();
  }
}

function runCommand(command: string, args: string[]): Promise<CommandResult> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";
    let notFound = false;

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });

    child.on("error", (error) => {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
        notFound = true;
      }
    });

    child.on("close", (code) => {
      resolve({
        code: code ?? 1,
        stdout,
        stderr,
        notFound
      });
    });
  });
}

function runInteractiveCommand(command: string, args: string[]): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      stdio: "inherit"
    });

    child.on("error", () => resolve(1));
    child.on("close", (code) => resolve(code ?? 1));
  });
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function looksLikeMissingCommand(message: string): boolean {
  return /not recognized as an internal or external command|command not found|no such file or directory/i.test(
    message
  );
}

async function resolveWindowsGhPath(): Promise<string | null> {
  const programFiles = process.env.ProgramFiles ?? "C:\\Program Files";
  const localAppData = process.env.LOCALAPPDATA ?? "";
  const candidates = [
    path.join(programFiles, "GitHub CLI", "gh.exe"),
    path.join(localAppData, "Programs", "GitHub CLI", "gh.exe"),
    path.join(localAppData, "Microsoft", "WinGet", "Links", "gh.exe")
  ];

  for (const candidate of candidates) {
    if (await fileExists(candidate)) {
      return candidate;
    }
  }
  return null;
}

async function runGhCommand(args: string[]): Promise<CommandResult> {
  const direct = await runCommand("gh", args);
  if (!direct.notFound && !looksLikeMissingCommand(`${direct.stdout}\n${direct.stderr}`)) {
    return direct;
  }

  if (process.platform === "win32") {
    const ghPath = await resolveWindowsGhPath();
    if (ghPath) {
      const viaPath = await runCommand(ghPath, args);
      if (!viaPath.notFound) {
        return viaPath;
      }
    }

    const viaCmd = await runCommand("cmd", ["/c", "gh", ...args]);
    if (!looksLikeMissingCommand(`${viaCmd.stdout}\n${viaCmd.stderr}`)) {
      return viaCmd;
    }
  }

  return {
    code: 1,
    stdout: "",
    stderr: "GitHub CLI command `gh` is not available in this environment.",
    notFound: true
  };
}

async function runGhInteractiveCommand(args: string[]): Promise<number> {
  let code = await runInteractiveCommand("gh", args);
  if (code === 0 || process.platform !== "win32") {
    return code;
  }

  const ghPath = await resolveWindowsGhPath();
  if (ghPath) {
    return runInteractiveCommand(ghPath, args);
  }

  return runInteractiveCommand("cmd", ["/c", "gh", ...args]);
}

function extractTokenFromGhStatus(raw: string): string | null {
  const line = raw
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .find((entry) => /^(?:-\s*)?token:\s+/i.test(entry));
  if (!line) {
    return null;
  }
  const value = line.replace(/^(?:-\s*)?token:\s+/i, "").trim();
  if (!value || value.includes("*")) {
    return null;
  }
  return value;
}

function parseGithubHostToken(hostsRaw: string): string | null {
  const lines = hostsRaw.split(/\r?\n/);
  let inGithubCom = false;
  for (const line of lines) {
    const topLevel = line.match(/^([^\s#][^:]*):\s*$/);
    if (topLevel?.[1]) {
      inGithubCom = topLevel[1] === "github.com";
      continue;
    }
    if (!inGithubCom) {
      continue;
    }
    const tokenMatch = line.match(/^\s*oauth_token:\s*(.+?)\s*$/);
    if (!tokenMatch?.[1]) {
      continue;
    }
    const token = tokenMatch[1].replace(/^['"]|['"]$/g, "").trim();
    if (token) {
      return token;
    }
  }
  return null;
}

async function readGhHostsToken(): Promise<string | null> {
  const candidates: string[] = [];
  if (process.env.GH_CONFIG_DIR) {
    candidates.push(path.join(process.env.GH_CONFIG_DIR, "hosts.yml"));
  }
  if (process.platform === "win32" && process.env.APPDATA) {
    candidates.push(path.join(process.env.APPDATA, "GitHub CLI", "hosts.yml"));
  }
  candidates.push(path.join(os.homedir(), ".config", "gh", "hosts.yml"));

  for (const candidate of candidates) {
    try {
      const raw = await readFile(candidate, "utf-8");
      const token = parseGithubHostToken(raw);
      if (token) {
        return token;
      }
    } catch {
      continue;
    }
  }
  return null;
}

async function resolveGithubCliToken(): Promise<string | null> {
  const tokenResult = await runGhCommand(["auth", "token", "--hostname", "github.com"]);
  const token = tokenResult.stdout.trim();
  if (tokenResult.code === 0 && token) {
    return token;
  }

  const statusResult = await runGhCommand(["auth", "status", "--hostname", "github.com", "--show-token"]);
  const fromStatus = extractTokenFromGhStatus(`${statusResult.stdout}\n${statusResult.stderr}`);
  if (fromStatus) {
    return fromStatus;
  }

  return readGhHostsToken();
}

async function loginWithGithubCli(scope: string, logger: AuthLogger, noBrowser: boolean): Promise<string | null> {
  const existing = await resolveGithubCliToken();
  if (existing) {
    return existing;
  }

  const ghAvailability = await runGhCommand(["--version"]);
  if (ghAvailability.notFound) {
    return null;
  }

  logger.log("GitHub CLI token not found. Starting `gh auth login`...");
  const loginArgs = ["auth", "login", "--hostname", "github.com", "--scopes", scope];
  if (!noBrowser) {
    loginArgs.push("--web");
  }

  const loginCode = await runGhInteractiveCommand(loginArgs);
  if (loginCode !== 0) {
    throw new Error("`gh auth login` failed. Please complete GitHub CLI authentication manually.");
  }

  const token = await resolveGithubCliToken();
  if (token) {
    return token;
  }

  logger.log("`gh auth token` could not return a token. Retrying with insecure storage fallback...");
  const fallbackArgs = ["auth", "login", "--hostname", "github.com", "--scopes", scope, "--insecure-storage"];
  if (!noBrowser) {
    fallbackArgs.push("--web");
  }
  const fallbackCode = await runGhInteractiveCommand(fallbackArgs);
  if (fallbackCode !== 0) {
    throw new Error("`gh auth login --insecure-storage` failed. Please retry login in GitHub CLI.");
  }

  const fallbackToken = await resolveGithubCliToken();
  if (fallbackToken) {
    return fallbackToken;
  }

  throw new Error(
    "GitHub CLI login succeeded, but no token could be read. Run `gh auth token --hostname github.com` and ensure it prints a token."
  );
}

export function openBrowser(url: string): boolean {
  try {
    if (process.platform === "win32") {
      const child = spawn("cmd", ["/c", "start", "", url], {
        detached: true,
        stdio: "ignore"
      });
      child.unref();
      return true;
    }

    if (process.platform === "darwin") {
      const child = spawn("open", [url], {
        detached: true,
        stdio: "ignore"
      });
      child.unref();
      return true;
    }

    const child = spawn("xdg-open", [url], {
      detached: true,
      stdio: "ignore"
    });
    child.unref();
    return true;
  } catch {
    return false;
  }
}

export async function runAuthLogin(
  cwd: string,
  logger: AuthLogger,
  options: {
    tokenEnv: string;
    clientId?: string;
    scope: string;
    noBrowser?: boolean;
    client?: GithubDeviceAuthClientLike;
  }
): Promise<number> {
  const noBrowser = Boolean(options.noBrowser || process.env.VITEST);
  const clientId = options.clientId ?? (options.client ? "test-client-id" : undefined);

  if (!clientId) {
    if (process.env.VITEST) {
      throw new Error("Missing GitHub OAuth client id. Use --client-id.");
    }

    const ghToken = await loginWithGithubCli(options.scope, logger, noBrowser);
    if (!ghToken) {
      throw new Error(
        "No OAuth client id provided and GitHub CLI (`gh`) is not available. Install `gh` or pass --client-id."
      );
    }

    const envPath = await upsertEnvVar(cwd, options.tokenEnv, ghToken);
    logger.log(`Saved ${options.tokenEnv} to ${envPath}`);
    logger.log("Login complete. Run `repodigest validate` to verify setup.");
    return 0;
  }

  const client = options.client ?? createGithubDeviceAuthClient();
  const payload = await client.requestDeviceCode({
    clientId,
    scope: options.scope
  });

  const openUrl = payload.verificationUriComplete ?? payload.verificationUri;
  logger.log(`GitHub device code: ${payload.userCode}`);
  logger.log(`Verification URL: ${openUrl}`);

  if (!noBrowser) {
    await waitForEnterToOpenBrowser(logger);
    const opened = openBrowser(openUrl);
    if (opened) {
      logger.log(`Opened browser for GitHub login: ${openUrl}`);
    } else {
      logger.log(`Please open this URL in your browser: ${openUrl}`);
    }
  } else {
    logger.log(`Open this URL in your browser: ${openUrl}`);
  }

  logger.log("Waiting for GitHub authorization...");

  const deadline = Date.now() + payload.expiresIn * 1000;
  let pollMs = payload.interval * 1000;
  while (Date.now() < deadline) {
    await sleep(pollMs);
    const result = await client.pollAccessToken({
      clientId,
      deviceCode: payload.deviceCode
    });

    if (result.status === "pending") {
      continue;
    }
    if (result.status === "slow_down") {
      pollMs += 5000;
      continue;
    }
    if (result.status === "denied") {
      throw new Error(result.errorDescription ?? "GitHub authorization was denied.");
    }
    if (result.status === "expired") {
      throw new Error(result.errorDescription ?? "GitHub device code expired.");
    }
    if (result.status === "token" && result.accessToken) {
      const envPath = await upsertEnvVar(cwd, options.tokenEnv, result.accessToken);
      logger.log(`Saved ${options.tokenEnv} to ${envPath}`);
      logger.log("Login complete. Run `repodigest validate` to verify setup.");
      return 0;
    }
  }

  throw new Error("GitHub authorization timed out.");
}

export async function runAuthLogout(
  cwd: string,
  logger: AuthLogger,
  tokenEnv: string
): Promise<number> {
  const result = await removeEnvVar(cwd, tokenEnv);
  if (!result.removed) {
    logger.log(`No ${tokenEnv} entry found in ${result.envPath}`);
    return 0;
  }

  logger.log(`Removed ${tokenEnv} from ${result.envPath}`);
  return 0;
}
