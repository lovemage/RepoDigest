import type { Digest, WorkItem } from "@repodigest/core";

export type PublicTone = "calm" | "playful" | "hacker" | "formal";
export type PublicLang = "en" | "zh-TW" | "both";

export interface XRenderOptions {
  tone?: PublicTone;
  lang?: PublicLang;
  maxLength?: number;
  numbering?: boolean;
  includeMetrics?: boolean;
}

export interface XRenderResult {
  blocks: string[];
  meta: {
    maxLength: number;
    totalBlocks: number;
  };
}

const DEFAULT_MAX_LENGTH = 280;

function normalizeLang(lang: PublicLang | undefined): "en" | "zh-TW" {
  return lang === "zh-TW" ? "zh-TW" : "en";
}

function headerText(date: string, tone: PublicTone, lang: "en" | "zh-TW"): string {
  if (lang === "zh-TW") {
    switch (tone) {
      case "playful":
        return `TW playful update ${date}`;
      case "hacker":
        return `TW build log ${date}`;
      case "formal":
        return `TW status report ${date}`;
      default:
        return `TW daily update ${date}`;
    }
  }

  switch (tone) {
    case "playful":
      return `Ship log for ${date}`;
    case "hacker":
      return `Build log ${date}`;
    case "formal":
      return `Status report ${date}`;
    default:
      return `Daily update ${date}`;
  }
}

function compactItems(items: WorkItem[], maxItems = 4): string {
  if (items.length === 0) {
    return "-";
  }
  return items
    .slice(0, maxItems)
    .map((item) => item.title.trim())
    .filter(Boolean)
    .join("; ");
}

function createChunks(digest: Digest, tone: PublicTone, lang: "en" | "zh-TW", includeMetrics: boolean): string[] {
  const chunks: string[] = [headerText(digest.date, tone, lang)];

  if (includeMetrics) {
    if (lang === "zh-TW") {
      chunks.push(
        `TW stats: done ${digest.stats.done}, in-progress ${digest.stats.inProgress}, blocked ${digest.stats.blocked}, due ${digest.stats.dueToday}`
      );
    } else {
      chunks.push(
        `Stats: done ${digest.stats.done}, in-progress ${digest.stats.inProgress}, blocked ${digest.stats.blocked}, due today ${digest.stats.dueToday}`
      );
    }
  }

  if (lang === "zh-TW") {
    chunks.push(`TW due today: ${compactItems(digest.sections.dueToday)}`);
    chunks.push(`TW done: ${compactItems(digest.sections.done)}`);
    chunks.push(`TW in progress: ${compactItems(digest.sections.inProgress)}`);
    chunks.push(`TW blocked: ${compactItems(digest.sections.blocked)}`);
    chunks.push(`TW next: ${compactItems(digest.sections.next)}`);
  } else {
    chunks.push(`Due today: ${compactItems(digest.sections.dueToday)}`);
    chunks.push(`Done: ${compactItems(digest.sections.done)}`);
    chunks.push(`In progress: ${compactItems(digest.sections.inProgress)}`);
    chunks.push(`Blocked: ${compactItems(digest.sections.blocked)}`);
    chunks.push(`Next: ${compactItems(digest.sections.next)}`);
  }

  return chunks;
}

function splitLongText(text: string, maxLength: number): string[] {
  if (text.length <= maxLength) {
    return [text];
  }

  const words = text.split(/\s+/).filter(Boolean);
  const blocks: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxLength) {
      current = candidate;
      continue;
    }

    if (current) {
      blocks.push(current);
      current = word;
      continue;
    }

    let remaining = word;
    while (remaining.length > maxLength) {
      blocks.push(remaining.slice(0, maxLength));
      remaining = remaining.slice(maxLength);
    }
    current = remaining;
  }

  if (current) {
    blocks.push(current);
  }
  return blocks;
}

export function splitThread(chunks: string[], maxLength: number): string[] {
  const blocks: string[] = [];
  let current = "";

  for (const chunk of chunks) {
    const normalized = chunk.trim();
    if (!normalized) {
      continue;
    }

    const candidate = current ? `${current}\n${normalized}` : normalized;
    if (candidate.length <= maxLength) {
      current = candidate;
      continue;
    }

    if (current) {
      blocks.push(current);
      current = "";
    }

    const split = splitLongText(normalized, maxLength);
    if (split.length === 1) {
      current = split[0] ?? "";
    } else {
      blocks.push(...split.slice(0, -1));
      current = split[split.length - 1] ?? "";
    }
  }

  if (current) {
    blocks.push(current);
  }

  return blocks;
}

function applyNumbering(blocks: string[], maxLength: number): string[] {
  const total = blocks.length;
  if (total <= 1) {
    return blocks;
  }

  return blocks.map((block, index) => {
    const suffix = ` (${index + 1}/${total})`;
    const limit = maxLength - suffix.length;
    const trimmed = block.length > limit ? block.slice(0, Math.max(0, limit - 1)).trimEnd() : block;
    return `${trimmed}${suffix}`;
  });
}

export function renderXDigest(digest: Digest, options: XRenderOptions = {}): XRenderResult {
  const tone = options.tone ?? "calm";
  const lang = normalizeLang(options.lang);
  const maxLength = options.maxLength ?? DEFAULT_MAX_LENGTH;
  const numbering = options.numbering ?? true;
  const includeMetrics = options.includeMetrics ?? true;

  const reservedMax = numbering ? Math.max(20, maxLength - 10) : maxLength;
  const chunks = createChunks(digest, tone, lang, includeMetrics);
  const rawBlocks = splitThread(chunks, reservedMax);
  const blocks = numbering ? applyNumbering(rawBlocks, maxLength) : rawBlocks;

  return {
    blocks,
    meta: {
      maxLength,
      totalBlocks: blocks.length
    }
  };
}

