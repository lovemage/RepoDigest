import { describe, expect, it } from "vitest";
import type { Digest, Event, WorkItem } from "@repodigest/core";
import { renderXDigest, splitThread } from "../src/index.js";

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
      done: 2,
      inProgress: 1,
      blocked: 1,
      dueToday: 1
    },
    sections: {
      dueToday: [item({ title: "Fix login timeout", status: "in_progress", evidence: [event("e1", "issue_created")] })],
      done: [
        item({ title: "Add digest writer abstraction", status: "done", evidence: [event("e2", "pr_merged")] }),
        item({ title: "Stabilize CI workflow", status: "done", evidence: [event("e3", "issue_closed")] })
      ],
      inProgress: [
        item({ title: "Refactor status classifier", status: "in_progress", evidence: [event("e4", "commit")] })
      ],
      blocked: [item({ title: "Waiting on external API", status: "blocked", evidence: [event("e5", "issue_commented")] })],
      next: [item({ title: "Draft release notes", status: "planned", evidence: [event("e6", "issue_created")] })],
      notes: []
    }
  };
}

describe("splitThread", () => {
  it("keeps blocks deterministic and within limit", () => {
    const blocks = splitThread(
      [
        "Line 1 summary",
        "Line 2 with additional content",
        "Line 3 with very very very very very very very very very very very long content"
      ],
      50
    );

    expect(blocks.length).toBeGreaterThan(1);
    expect(blocks.every((block) => block.length <= 50)).toBe(true);
  });
});

describe("renderXDigest", () => {
  it("renders numbered blocks within 280 chars", () => {
    const result = renderXDigest(digestFixture(), {
      maxLength: 280,
      numbering: true,
      tone: "calm",
      lang: "en"
    });

    expect(result.blocks.length).toBeGreaterThan(0);
    expect(result.blocks.every((block) => block.length <= 280)).toBe(true);
    if (result.blocks.length > 1) {
      expect(result.blocks[0]).toMatch(/\(1\/\d+\)$/);
      expect(result.blocks[result.blocks.length - 1]).toMatch(new RegExp(`\\(${result.blocks.length}/${result.blocks.length}\\)$`));
    }
  });

  it("supports zh-TW tone rendering", () => {
    const result = renderXDigest(digestFixture(), {
      tone: "playful",
      lang: "zh-TW",
      numbering: false
    });

    expect(result.blocks[0]).toContain("TW playful update");
  });
});
