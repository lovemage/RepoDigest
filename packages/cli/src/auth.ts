import { readFile, writeFile } from "node:fs/promises";
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

async function loginWithGithubCli(scope: string, logger: AuthLogger, noBrowser: boolean): Promise<string | null> {
  const existing = await runCommand("gh", ["auth", "token"]);
  if (existing.notFound) {
    return null;
  }

  const existingToken = existing.stdout.trim();
  if (existing.code === 0 && existingToken) {
    return existingToken;
  }

  logger.log("GitHub CLI token not found. Starting `gh auth login`...");
  const loginArgs = ["auth", "login", "--hostname", "github.com", "--scopes", scope];
  if (!noBrowser) {
    loginArgs.push("--web");
  }

  const loginCode = await runInteractiveCommand("gh", loginArgs);
  if (loginCode !== 0) {
    throw new Error("`gh auth login` failed. Please complete GitHub CLI authentication manually.");
  }

  const tokenResult = await runCommand("gh", ["auth", "token"]);
  if (tokenResult.code !== 0 || !tokenResult.stdout.trim()) {
    throw new Error("`gh auth token` did not return a usable token.");
  }
  return tokenResult.stdout.trim();
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
