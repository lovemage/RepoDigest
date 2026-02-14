import path from "node:path";
import { pathToFileURL } from "node:url";
import type { WorkItem } from "@repodigest/core";

export interface SummarizerPlugin {
  summarizeWorkItem: (item: WorkItem) => Promise<string[] | null | undefined> | string[] | null | undefined;
}

function resolveImportSpecifier(specifier: string, cwd: string): string {
  if (specifier.startsWith(".") || specifier.startsWith("/") || /^[A-Za-z]:\\/.test(specifier)) {
    return pathToFileURL(path.resolve(cwd, specifier)).href;
  }
  return specifier;
}

export async function loadSummarizerPlugin(
  specifier: string,
  cwd: string
): Promise<SummarizerPlugin> {
  const resolved = resolveImportSpecifier(specifier, cwd);
  const mod = (await import(resolved)) as Record<string, unknown>;

  const direct = mod.summarizeWorkItem;
  if (typeof direct === "function") {
    return { summarizeWorkItem: direct as SummarizerPlugin["summarizeWorkItem"] };
  }

  const pluginObj = mod.default as { summarizeWorkItem?: unknown } | undefined;
  if (pluginObj && typeof pluginObj.summarizeWorkItem === "function") {
    return { summarizeWorkItem: pluginObj.summarizeWorkItem as SummarizerPlugin["summarizeWorkItem"] };
  }

  throw new Error("Plugin module must export `summarizeWorkItem(item)` or default.summarizeWorkItem(item).");
}

