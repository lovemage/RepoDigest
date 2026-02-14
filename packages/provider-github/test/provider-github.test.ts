import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import type { GithubApi, GithubIssue, GithubMilestone, GithubPullRequest } from "../src/index.js";
import { GithubProviderClient, normalizeGithubData } from "../src/index.js";

async function loadFixture<T>(name: string): Promise<T> {
  const url = new URL(`./fixtures/${name}`, import.meta.url);
  const raw = await readFile(url, "utf-8");
  return JSON.parse(raw) as T;
}

describe("normalizeGithubData", () => {
  it("normalizes issues and pull requests into sorted events", async () => {
    const issues = await loadFixture<GithubIssue[]>("issues.json");
    const pullRequests = await loadFixture<GithubPullRequest[]>("pulls.json");

    const events = normalizeGithubData({
      repo: "acme/repo",
      issues,
      pullRequests
    });

    expect(events.map((event) => event.type)).toContain("issue_created");
    expect(events.map((event) => event.type)).toContain("issue_closed");
    expect(events.map((event) => event.type)).toContain("pr_opened");
    expect(events.map((event) => event.type)).toContain("pr_merged");
    expect(events[0]?.timestamp <= events[events.length - 1]?.timestamp).toBe(true);
  });
});

describe("GithubProviderClient", () => {
  it("fetches events with filters and milestone due fallback", async () => {
    const issues = await loadFixture<GithubIssue[]>("issues.json");
    const pullRequests = await loadFixture<GithubPullRequest[]>("pulls.json");
    const milestones = await loadFixture<GithubMilestone[]>("milestones.json");

    const api: GithubApi = {
      async listIssues() {
        return issues;
      },
      async listPullRequests() {
        return pullRequests;
      },
      async listMilestones() {
        return milestones;
      }
    };

    const provider = new GithubProviderClient({ api });
    const events = await provider.fetchEvents({
      repos: ["acme/repo"],
      since: "2026-02-10T00:00:00Z",
      until: "2026-02-14T00:00:00Z",
      labelsAny: ["bug", "enhancement"]
    });

    const closedIssue = events.find((event) => event.id === "issue:101:closed");
    expect(closedIssue).toBeDefined();
    expect(closedIssue?.milestone?.dueOn).toBe("2026-02-14T00:00:00Z");

    const hasUnmatchedLabel = events.some((event) => event.id.includes("102"));
    expect(hasUnmatchedLabel).toBe(false);
  });
});

