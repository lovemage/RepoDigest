import type { Digest, WorkItem } from "@repodigest/core";

function formatItem(item: WorkItem, withLinks: boolean): string {
  const dueSuffix = item.due ? ` (due ${item.due})` : "";
  const linkSuffix = withLinks && item.url ? ` - ${item.url}` : "";
  const highlights = item.highlights.length > 0 ? `: ${item.highlights.join(" / ")}` : "";
  return `- ${item.title}${dueSuffix}${highlights}${linkSuffix}`;
}

function formatSection(title: string, items: WorkItem[], withLinks: boolean): string[] {
  if (items.length === 0) {
    return [`## ${title}`, "- (none)"];
  }
  return [`## ${title}`, ...items.map((item) => formatItem(item, withLinks))];
}

export interface InternalRendererOptions {
  includeLinks?: boolean;
  includeMetrics?: boolean;
}

export function renderInternalDigest(
  digest: Digest,
  options: InternalRendererOptions = {}
): string {
  const includeLinks = options.includeLinks ?? true;
  const includeMetrics = options.includeMetrics ?? true;

  const lines: string[] = [];
  lines.push(`# RepoDigest ${digest.date}`);
  lines.push(`Timezone: ${digest.timezone}`);
  lines.push("");

  if (includeMetrics) {
    lines.push(
      `Stats: done=${digest.stats.done}, in_progress=${digest.stats.inProgress}, blocked=${digest.stats.blocked}, due_today=${digest.stats.dueToday}`
    );
    lines.push("");
  }

  lines.push(...formatSection("Due Today", digest.sections.dueToday, includeLinks));
  lines.push("");
  lines.push(...formatSection("Done", digest.sections.done, includeLinks));
  lines.push("");
  lines.push(...formatSection("In Progress", digest.sections.inProgress, includeLinks));
  lines.push("");
  lines.push(...formatSection("Blocked", digest.sections.blocked, includeLinks));
  lines.push("");
  lines.push(...formatSection("Next", digest.sections.next, includeLinks));

  return lines.join("\n");
}

