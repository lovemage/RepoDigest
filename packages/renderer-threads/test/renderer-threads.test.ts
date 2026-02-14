import { describe, expect, it } from "vitest";
import type { Digest, Event, WorkItem } from "@repodigest/core";
import { renderThreadsDigest } from "../src/index.js";

function event(id: string, type: Event["type"]): Event {
  return {
    id,
    provider: "github",
    repo: "acme/repo",
    type,
    timestamp: "2026-02-14T12:00:00Z"
  };
}

function item(partial: Partial<WorkItem>): WorkItem {
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

function digestFixture(): Digest {
  return {
    date: "2026-02-14",
    timezone: "UTC",
    scope: { repos: ["acme/repo"] },
    stats: {
      done: 1,
      inProgress: 1,
      blocked: 1,
      dueToday: 1
    },
    sections: {
      dueToday: [item({ title: "Fix login timeout", evidence: [event("e1", "issue_created")] })],
      done: [item({ title: "Ship setup wizard", evidence: [event("e2", "pr_merged")] })],
      inProgress: [item({ title: "Refactor classifier", evidence: [event("e3", "commit")] })],
      blocked: [item({ title: "Waiting on API response", evidence: [event("e4", "issue_commented")] })],
      next: [item({ title: "Prepare release notes", evidence: [event("e5", "issue_created")] })],
      notes: []
    }
  };
}

describe("renderThreadsDigest", () => {
  it("maps digest sections into readable blocks", () => {
    const result = renderThreadsDigest(digestFixture(), {
      tone: "calm",
      lang: "en"
    });

    expect(result.blocks.length).toBeGreaterThanOrEqual(6);
    expect(result.blocks.some((block) => block.includes("Due Today"))).toBe(true);
    expect(result.blocks.some((block) => block.includes("Done"))).toBe(true);
    expect(result.blocks.some((block) => block.includes("In Progress"))).toBe(true);
  });

  it("supports zh-TW output", () => {
    const result = renderThreadsDigest(digestFixture(), {
      tone: "playful",
      lang: "zh-TW"
    });
    expect(result.blocks[0]).toContain("build in public");
    expect(result.blocks.some((block) => block.includes("已完成"))).toBe(true);
  });
});

