import { resolveDue } from "./rules/due-resolver.js";
import { classifyStatus } from "./rules/status-classifier.js";
import { summarizeWorkItem } from "./summarizer.js";
import type { Digest, Event, PipelineContext, WorkItem } from "./types.js";

export interface PipelineSteps<TRenderResult> {
  collect: (ctx: PipelineContext) => Promise<Event[]> | Event[];
  normalize: (events: Event[], ctx: PipelineContext) => Promise<WorkItem[]> | WorkItem[];
  render: (digest: Digest, ctx: PipelineContext) => Promise<TRenderResult> | TRenderResult;
}

export interface PipelineHooks {
  summarizeWorkItem?: (item: WorkItem) => Promise<string[] | null | undefined> | string[] | null | undefined;
}

export interface PipelineRunResult<TRenderResult> {
  digest: Digest;
  output: TRenderResult;
}

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

export function sortWorkItems(items: WorkItem[]): WorkItem[] {
  return [...items].sort((a, b) => {
    const repoA = a.repo ?? "";
    const repoB = b.repo ?? "";
    if (repoA !== repoB) {
      return repoA.localeCompare(repoB);
    }

    if (a.title !== b.title) {
      return a.title.localeCompare(b.title);
    }

    return a.key.localeCompare(b.key);
  });
}

export function createDigest(items: WorkItem[], ctx: PipelineContext = {}): Digest {
  const timezone = ctx.timezone ?? "UTC";
  const now = ctx.date ?? new Date();
  const currentDate = formatDateInTimeZone(now, timezone);

  const dueToday = sortWorkItems(items.filter((item) => item.due === currentDate));
  const done = sortWorkItems(items.filter((item) => item.status === "done"));
  const inProgress = sortWorkItems(items.filter((item) => item.status === "in_progress"));
  const blocked = sortWorkItems(items.filter((item) => item.status === "blocked"));
  const next = sortWorkItems(items.filter((item) => item.status === "planned"));

  const stack = Array.from(new Set(items.flatMap((item) => item.stackHints ?? [])));

  return {
    date: currentDate,
    timezone,
    scope: ctx.scope ?? {},
    stats: {
      done: done.length,
      inProgress: inProgress.length,
      blocked: blocked.length,
      dueToday: dueToday.length
    },
    sections: {
      dueToday,
      done,
      inProgress,
      blocked,
      next,
      notes: []
    },
    ...(stack.length > 0 ? { stack } : {})
  };
}

export async function runPipeline<TRenderResult>(
  steps: PipelineSteps<TRenderResult>,
  ctx: PipelineContext = {},
  hooks: PipelineHooks = {}
): Promise<PipelineRunResult<TRenderResult>> {
  const events = await steps.collect(ctx);
  const normalized = await steps.normalize(events, ctx);

  const enriched: WorkItem[] = [];
  for (const item of normalized) {
    const dueOptions: { referenceDate?: Date; timezone?: string } = {};
    if (ctx.date) {
      dueOptions.referenceDate = ctx.date;
    }
    if (ctx.timezone) {
      dueOptions.timezone = ctx.timezone;
    }

    const due = resolveDue(item, dueOptions).due;
    const status = classifyStatus(item);
    let highlights = summarizeWorkItem(item);

    if (hooks.summarizeWorkItem) {
      try {
        const pluginHighlights = await hooks.summarizeWorkItem(item);
        if (Array.isArray(pluginHighlights) && pluginHighlights.length > 0) {
          highlights = pluginHighlights
            .map((entry) => entry.trim())
            .filter(Boolean)
            .slice(0, 5);
        }
      } catch {
        highlights = summarizeWorkItem(item);
      }
    }

    enriched.push({
      ...item,
      due,
      status,
      highlights
    });
  }

  const digest = createDigest(enriched, ctx);
  const output = await steps.render(digest, ctx);
  return { digest, output };
}
