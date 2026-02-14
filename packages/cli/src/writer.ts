import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export interface WriteDigestOptions {
  cwd: string;
  date: string;
  content: string;
}

export async function writeDigestFiles(options: WriteDigestOptions): Promise<{ dailyFile: string; latestFile: string }> {
  const outputRoot = path.join(options.cwd, "repodigest");
  const dailyDir = path.join(outputRoot, "daily");
  const dailyFile = path.join(dailyDir, `${options.date}.md`);
  const latestFile = path.join(outputRoot, "latest.md");

  await mkdir(dailyDir, { recursive: true });
  await writeFile(dailyFile, options.content, "utf-8");
  await writeFile(latestFile, options.content, "utf-8");

  return { dailyFile, latestFile };
}

export interface WriteRangeDigestOptions {
  cwd: string;
  since: string;
  until: string;
  content: string;
}

function sanitizeForFileName(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-");
}

export async function writeRangeDigestFiles(
  options: WriteRangeDigestOptions
): Promise<{ rangeFile: string; latestFile: string }> {
  const outputRoot = path.join(options.cwd, "repodigest");
  const rangeDir = path.join(outputRoot, "range");
  const rangeFile = path.join(
    rangeDir,
    `${sanitizeForFileName(options.since)}_to_${sanitizeForFileName(options.until)}.md`
  );
  const latestFile = path.join(outputRoot, "latest.md");

  await mkdir(rangeDir, { recursive: true });
  await writeFile(rangeFile, options.content, "utf-8");
  await writeFile(latestFile, options.content, "utf-8");

  return { rangeFile, latestFile };
}
