import { readFile } from "node:fs/promises";
import path from "node:path";
import { parse, stringify } from "yaml";
import { z } from "zod";

const repoPattern = /^[^/\s]+\/[^/\s]+$/;

const includeSchema = z
  .object({
    stack: z.boolean().default(false),
    links: z.boolean().default(true),
    metrics: z.boolean().default(true)
  })
  .default({});

const outputSchema = z
  .object({
    mode: z.enum(["internal", "public"]).default("internal"),
    target: z.enum(["internal", "x", "threads", "markdown"]).default("internal"),
    lang: z.enum(["zh-TW", "en", "both"]).default("en"),
    tone: z.enum(["calm", "playful", "hacker", "formal"]).default("calm"),
    length: z.enum(["short", "medium", "long"]).default("short"),
    include: includeSchema,
    thread: z
      .object({
        enabled: z.boolean().default(false),
        numbering: z.string().default("1/1")
      })
      .optional(),
    summarizerPlugin: z.string().optional()
  })
  .default({});

export const repoDigestConfigSchema = z.object({
  timezone: z.string().min(1).default("UTC"),
  scope: z
    .object({
      repos: z.array(z.string().regex(repoPattern, "Repo format must be owner/name")).default([])
    })
    .default({}),
  providers: z
    .object({
      github: z
        .object({
          tokenEnv: z.string().min(1).default("GITHUB_TOKEN"),
          query: z
            .object({
              assignee: z.string().optional(),
              labelsAny: z.array(z.string()).optional()
            })
            .optional()
        })
        .default({})
    })
    .default({}),
  output: outputSchema
});

export type RepoDigestConfig = z.infer<typeof repoDigestConfigSchema>;

export function createDefaultConfig(): RepoDigestConfig {
  return repoDigestConfigSchema.parse({});
}

export function parseConfigString(raw: string): RepoDigestConfig {
  const doc = (parse(raw) ?? {}) as unknown;
  return repoDigestConfigSchema.parse(doc);
}

export async function loadConfig(cwd: string, fileName = ".repodigest.yml"): Promise<RepoDigestConfig> {
  const configPath = path.join(cwd, fileName);
  const raw = await readFile(configPath, "utf-8");
  return parseConfigString(raw);
}

export function serializeConfig(config: RepoDigestConfig): string {
  return stringify(config, {
    lineWidth: 0,
    defaultStringType: "PLAIN"
  });
}

export function formatConfigError(error: unknown): string {
  if (error instanceof z.ZodError) {
    return error.issues
      .map((issue) => {
        const where = issue.path.length > 0 ? issue.path.join(".") : "(root)";
        return `${where}: ${issue.message}`;
      })
      .join("\n");
  }

  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
