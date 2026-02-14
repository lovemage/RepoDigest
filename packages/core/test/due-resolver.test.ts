import { describe, expect, it } from "vitest";
import { resolveDue } from "../src/rules/due-resolver.js";
import type { WorkItem } from "../src/types.js";

function createItem(partial: Partial<WorkItem>): WorkItem {
  return {
    key: "github:owner/repo#1",
    kind: "issue",
    title: "Test item",
    status: "unknown",
    highlights: [],
    evidence: [],
    ...partial
  };
}

describe("resolveDue", () => {
  it("uses milestone due date first", () => {
    const item = createItem({
      evidence: [
        {
          id: "e1",
          provider: "github",
          type: "issue_created",
          timestamp: "2026-02-14T01:00:00Z",
          milestone: { title: "Sprint", dueOn: "2026-02-20T00:00:00Z" }
        }
      ]
    });

    expect(resolveDue(item)).toEqual({ due: "2026-02-20", source: "milestone" });
  });

  it("resolves due/today label with timezone", () => {
    const item = createItem({ labels: ["due/today"] });
    const result = resolveDue(item, {
      referenceDate: new Date("2026-02-14T09:00:00Z"),
      timezone: "Asia/Taipei"
    });
    expect(result).toEqual({ due: "2026-02-14", source: "label" });
  });

  it("reads due date from frontmatter", () => {
    const item = createItem({
      evidence: [
        {
          id: "e2",
          provider: "github",
          type: "issue_created",
          timestamp: "2026-02-14T01:00:00Z",
          body: "---\ndue: 2026-03-01\nstatus: blocked\n---\nBody text"
        }
      ]
    });

    expect(resolveDue(item)).toEqual({ due: "2026-03-01", source: "frontmatter" });
  });
});

