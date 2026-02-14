import type { Event, WorkItem, WorkStatus } from "../types.js";

export interface StatusClassifierOptions {
  blockedLabels?: string[];
  nextLabels?: string[];
}

function isDoneEvent(event: Event): boolean {
  return event.type === "issue_closed" || event.type === "pr_merged" || event.type === "release";
}

function parseFrontmatterStatus(body: string): string | null {
  const frontmatter = body.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!frontmatter) {
    return null;
  }
  const content = frontmatter[1];
  if (!content) {
    return null;
  }
  const statusLine = content
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.toLowerCase().startsWith("status:"));

  if (!statusLine) {
    return null;
  }
  return statusLine.split(":")[1]?.trim().toLowerCase() ?? null;
}

function hasBlockedSignals(item: WorkItem, blockedLabels: Set<string>): boolean {
  const labels = item.labels ?? [];
  if (labels.some((label) => blockedLabels.has(label.toLowerCase()))) {
    return true;
  }

  for (const event of item.evidence) {
    if (event.body) {
      const parsedStatus = parseFrontmatterStatus(event.body);
      if (parsedStatus === "blocked") {
        return true;
      }
    }

    const text = `${event.title ?? ""} ${event.body ?? ""}`.toLowerCase();
    if (text.includes("blocked") || text.includes("stuck") || text.includes("waiting on")) {
      return true;
    }
  }

  return false;
}

function hasPlannedSignals(item: WorkItem, nextLabels: Set<string>): boolean {
  return (item.labels ?? []).some((label) => nextLabels.has(label.toLowerCase()));
}

function hasInProgressSignals(item: WorkItem): boolean {
  return item.evidence.some((event) =>
    ["issue_created", "issue_commented", "pr_opened", "pr_reviewed", "commit"].includes(event.type)
  );
}

export function classifyStatus(
  item: WorkItem,
  options: StatusClassifierOptions = {}
): WorkStatus {
  const blockedLabels = new Set((options.blockedLabels ?? ["blocked", "stuck"]).map((s) => s.toLowerCase()));
  const nextLabels = new Set((options.nextLabels ?? ["next", "planned", "todo"]).map((s) => s.toLowerCase()));

  if (item.evidence.some(isDoneEvent)) {
    return "done";
  }

  if (hasBlockedSignals(item, blockedLabels)) {
    return "blocked";
  }

  if (hasPlannedSignals(item, nextLabels)) {
    return "planned";
  }

  if (hasInProgressSignals(item)) {
    return "in_progress";
  }

  return "unknown";
}
