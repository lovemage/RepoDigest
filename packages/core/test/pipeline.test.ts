import { describe, expect, it } from "vitest";
import { runPipeline } from "../src/pipeline.js";
import type { Event, WorkItem } from "../src/types.js";

describe("runPipeline", () => {
  it("produces stable ordering in digest sections", async () => {
    const events: Event[] = [
      {
        id: "1",
        provider: "github",
        repo: "z/repo",
        type: "issue_closed",
        title: "Z issue",
        timestamp: "2026-02-14T01:00:00Z"
      },
      {
        id: "2",
        provider: "github",
        repo: "a/repo",
        type: "issue_closed",
        title: "A issue",
        timestamp: "2026-02-14T02:00:00Z"
      }
    ];

    const normalized: WorkItem[] = [
      {
        key: "github:z/repo#2",
        kind: "issue",
        repo: "z/repo",
        title: "Z issue",
        status: "unknown",
        highlights: [],
        evidence: [events[0]]
      },
      {
        key: "github:a/repo#1",
        kind: "issue",
        repo: "a/repo",
        title: "A issue",
        status: "unknown",
        highlights: [],
        evidence: [events[1]]
      }
    ];

    const result = await runPipeline({
      collect: () => events,
      normalize: () => normalized,
      render: (digest) => digest.sections.done.map((item) => item.key)
    });

    expect(result.output).toEqual(["github:a/repo#1", "github:z/repo#2"]);
    expect(result.digest.stats.done).toBe(2);
  });
});

