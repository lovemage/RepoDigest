import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import type { Digest, Event, WorkItem } from "@oceanads/core";
import { renderInternalDigest } from "../src/index.js";

function createEvent(id: string, type: Event["type"]): Event {
  return {
    id,
    provider: "github",
    repo: "acme/repo",
    type,
    timestamp: "2026-02-14T09:00:00Z"
  };
}

function createItem(partial: Partial<WorkItem>): WorkItem {
  return {
    key: "github:acme/repo#1",
    kind: "issue",
    title: "Untitled",
    status: "unknown",
    highlights: [],
    evidence: [],
    ...partial
  };
}

function normalizeEol(input: string): string {
  return input.replace(/\r\n/g, "\n").trimEnd();
}

async function readGoldenFile(name: string): Promise<string> {
  const url = new URL(`./fixtures/${name}`, import.meta.url);
  const raw = await readFile(url, "utf-8");
  return normalizeEol(raw);
}

describe("renderInternalDigest golden tests", () => {
  it("renders full digest with links and metrics", async () => {
    const digest: Digest = {
      date: "2026-02-14",
      timezone: "Asia/Taipei",
      scope: { repos: ["acme/repo"] },
      stats: {
        done: 1,
        inProgress: 1,
        blocked: 1,
        dueToday: 1
      },
      sections: {
        dueToday: [
          createItem({
            key: "github:acme/repo#12",
            title: "Fix login bug",
            url: "https://github.com/acme/repo/issues/12",
            due: "2026-02-14",
            highlights: ["Tighten token validation."],
            status: "in_progress",
            evidence: [createEvent("e1", "issue_created")]
          })
        ],
        done: [
          createItem({
            key: "github:acme/repo#44",
            kind: "pr",
            title: "Add digest writer abstraction",
            url: "https://github.com/acme/repo/pull/44",
            highlights: ["Refactor file output path handling."],
            status: "done",
            evidence: [createEvent("e2", "pr_merged")]
          })
        ],
        inProgress: [
          createItem({
            key: "github:acme/repo#45",
            kind: "pr",
            title: "Refactor classify pipeline",
            url: "https://github.com/acme/repo/pull/45",
            highlights: ["Split classifier into deterministic rules."],
            status: "in_progress",
            evidence: [createEvent("e3", "pr_opened")]
          })
        ],
        blocked: [
          createItem({
            key: "github:acme/repo#16",
            title: "Investigate flaky CI",
            url: "https://github.com/acme/repo/issues/16",
            highlights: ["Waiting on upstream API quota reset."],
            status: "blocked",
            evidence: [createEvent("e4", "issue_commented")]
          })
        ],
        next: [
          createItem({
            key: "github:acme/repo#18",
            title: "Prepare release notes",
            url: "https://github.com/acme/repo/issues/18",
            highlights: ["Draft highlights for v0.1.0."],
            status: "planned",
            evidence: [createEvent("e5", "issue_created")]
          })
        ],
        notes: []
      }
    };

    const rendered = normalizeEol(renderInternalDigest(digest, { includeLinks: true, includeMetrics: true }));
    const golden = await readGoldenFile("full-with-links.md");
    expect(rendered).toBe(golden);
  });

  it("renders empty digest without links and metrics", async () => {
    const digest: Digest = {
      date: "2026-02-15",
      timezone: "UTC",
      scope: {},
      stats: {
        done: 0,
        inProgress: 0,
        blocked: 0,
        dueToday: 0
      },
      sections: {
        dueToday: [],
        done: [],
        inProgress: [],
        blocked: [],
        next: [],
        notes: []
      }
    };

    const rendered = normalizeEol(renderInternalDigest(digest, { includeLinks: false, includeMetrics: false }));
    const golden = await readGoldenFile("empty-no-metrics.md");
    expect(rendered).toBe(golden);
  });
});

