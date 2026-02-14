import type { WorkItem } from "../types.js";

export interface DueResolveOptions {
  referenceDate?: Date;
  timezone?: string;
}

export interface DueResolution {
  due: string | null;
  source: "milestone" | "label" | "frontmatter" | "none";
}

const DATE_PATTERN = /(20\d{2}-\d{2}-\d{2})/;

function formatDateInTimeZone(date: Date, timezone: string): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  const parts = formatter.formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value ?? "1970";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

function parseFrontmatter(body: string): Record<string, string> {
  const match = body.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!match) {
    return {};
  }
  const content = match[1];
  if (!content) {
    return {};
  }

  return content
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((acc, line) => {
      const sep = line.indexOf(":");
      if (sep <= 0) {
        return acc;
      }
      const key = line.slice(0, sep).trim();
      const value = line.slice(sep + 1).trim();
      if (key.length > 0 && value.length > 0) {
        acc[key] = value;
      }
      return acc;
    }, {});
}

function resolveByMilestone(item: WorkItem): string | null {
  for (const event of item.evidence) {
    const raw = event.milestone?.dueOn;
    if (!raw) {
      continue;
    }
    const m = raw.match(DATE_PATTERN);
    if (m) {
      return m[1] ?? null;
    }
  }
  return null;
}

function resolveByLabel(item: WorkItem, today: string): string | null {
  const labels = item.labels ?? [];
  for (const label of labels) {
    const normalized = label.trim().toLowerCase();
    if (normalized === "due/today") {
      return today;
    }

    const m = normalized.match(/^(?:due|deadline):\s*(20\d{2}-\d{2}-\d{2})$/);
    if (m) {
      return m[1] ?? null;
    }
  }
  return null;
}

function resolveByFrontmatter(item: WorkItem): string | null {
  for (const event of item.evidence) {
    if (!event.body) {
      continue;
    }
    const frontmatter = parseFrontmatter(event.body);
    const due = frontmatter.due;
    if (!due) {
      continue;
    }
    const m = due.match(DATE_PATTERN);
    if (m) {
      return m[1] ?? null;
    }
  }
  return null;
}

export function resolveDue(item: WorkItem, options: DueResolveOptions = {}): DueResolution {
  const timezone = options.timezone ?? "UTC";
  const referenceDate = options.referenceDate ?? new Date();
  const today = formatDateInTimeZone(referenceDate, timezone);

  const byMilestone = resolveByMilestone(item);
  if (byMilestone) {
    return { due: byMilestone, source: "milestone" };
  }

  const byLabel = resolveByLabel(item, today);
  if (byLabel) {
    return { due: byLabel, source: "label" };
  }

  const byFrontmatter = resolveByFrontmatter(item);
  if (byFrontmatter) {
    return { due: byFrontmatter, source: "frontmatter" };
  }

  return { due: null, source: "none" };
}
