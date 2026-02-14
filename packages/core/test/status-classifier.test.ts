import { describe, expect, it } from "vitest";
import { classifyStatus } from "../src/rules/status-classifier.js";
import type { WorkItem } from "../src/types.js";

function createItem(partial: Partial<WorkItem>): WorkItem {
  return {
    key: "github:owner/repo#2",
    kind: "issue",
    title: "Test item",
    status: "unknown",
    highlights: [],
    evidence: [],
    ...partial
  };
}

describe("classifyStatus", () => {
  it("classifies done for closed issue events", () => {
    const item = createItem({
      evidence: [
        {
          id: "e1",
          provider: "github",
          type: "issue_closed",
          timestamp: "2026-02-14T01:00:00Z"
        }
      ]
    });
    expect(classifyStatus(item)).toBe("done");
  });

  it("classifies blocked from labels", () => {
    const item = createItem({
      labels: ["Blocked"],
      evidence: [
        {
          id: "e2",
          provider: "github",
          type: "issue_commented",
          timestamp: "2026-02-14T01:00:00Z"
        }
      ]
    });
    expect(classifyStatus(item)).toBe("blocked");
  });

  it("classifies planned from next label", () => {
    const item = createItem({ labels: ["next"] });
    expect(classifyStatus(item)).toBe("planned");
  });

  it("classifies in progress from commit activity", () => {
    const item = createItem({
      kind: "commit",
      evidence: [
        {
          id: "e3",
          provider: "git",
          type: "commit",
          timestamp: "2026-02-14T01:00:00Z"
        }
      ]
    });
    expect(classifyStatus(item)).toBe("in_progress");
  });
});

