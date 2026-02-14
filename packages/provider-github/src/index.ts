import { Octokit } from "@octokit/rest";
import type { Event } from "@repodigest/core";

export interface GithubLabel {
  name: string;
}

export interface GithubMilestone {
  id: number;
  title: string;
  due_on?: string | null;
}

export interface GithubIssue {
  id: number;
  number: number;
  title: string;
  body?: string;
  state: "open" | "closed";
  html_url: string;
  labels?: Array<GithubLabel | string>;
  created_at: string;
  updated_at?: string;
  closed_at?: string | null;
  user?: { login: string };
  milestone?: { title: string; due_on?: string | null };
}

export interface GithubPullRequest {
  id: number;
  number: number;
  title: string;
  body?: string;
  state: "open" | "closed";
  html_url: string;
  labels?: Array<GithubLabel | string>;
  created_at: string;
  updated_at?: string;
  merged_at?: string | null;
  user?: { login: string };
}

export interface GithubCommit {
  sha: string;
  html_url?: string;
  commit: {
    message: string;
    author?: { name?: string; date?: string | null };
    committer?: { name?: string; date?: string | null };
  };
  author?: { login: string } | null;
  committer?: { login: string } | null;
}

export interface GithubNormalizeInput {
  repo: string;
  issues?: GithubIssue[];
  pullRequests?: GithubPullRequest[];
  commits?: GithubCommit[];
}

export interface GithubFetchOptions {
  repos: string[];
  since?: string;
  until?: string;
  assignee?: string;
  labelsAny?: string[];
}

export interface GithubApi {
  listIssues(params: {
    owner: string;
    repo: string;
    since?: string;
    assignee?: string;
  }): Promise<GithubIssue[]>;
  listPullRequests(params: {
    owner: string;
    repo: string;
    since?: string;
    until?: string;
  }): Promise<GithubPullRequest[]>;
  listMilestones(params: { owner: string; repo: string }): Promise<GithubMilestone[]>;
  listCommits?: (params: {
    owner: string;
    repo: string;
    since?: string;
    until?: string;
  }) => Promise<GithubCommit[]>;
}

export interface GithubProviderClientOptions {
  token?: string;
  userAgent?: string;
  api?: GithubApi;
}

function normalizeLabels(labels?: Array<GithubLabel | string>): string[] {
  return (labels ?? []).map((label) => (typeof label === "string" ? label : label.name));
}

function parseRepoRef(repoRef: string): { owner: string; repo: string } {
  const trimmed = repoRef.trim();
  const parts = trimmed.split("/");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error(`Invalid repo reference: ${repoRef}. Expected owner/repo.`);
  }

  return { owner: parts[0], repo: parts[1] };
}

function inRange(value: string, since?: Date, until?: Date): boolean {
  const ts = new Date(value).getTime();
  if (!Number.isFinite(ts)) {
    return false;
  }

  if (since && ts < since.getTime()) {
    return false;
  }

  if (until && ts > until.getTime()) {
    return false;
  }

  return true;
}

function hasAnyLabel(labels: string[], filter: string[]): boolean {
  if (filter.length === 0) {
    return true;
  }
  const normalized = new Set(labels.map((label) => label.toLowerCase()));
  return filter.some((label) => normalized.has(label.toLowerCase()));
}

function withMilestoneDueFallback(
  issues: GithubIssue[],
  milestones: GithubMilestone[]
): GithubIssue[] {
  const dueByTitle = new Map(
    milestones.map((milestone) => [milestone.title, milestone.due_on ?? null] as const)
  );

  return issues.map((issue) => {
    const milestone = issue.milestone;
    if (!milestone) {
      return issue;
    }

    if (milestone.due_on) {
      return issue;
    }

    const fallback = dueByTitle.get(milestone.title);
    if (!fallback) {
      return issue;
    }

    return {
      ...issue,
      milestone: {
        ...milestone,
        due_on: fallback
      }
    };
  });
}

function formatProviderError(error: unknown, repo: string): Error {
  if (error && typeof error === "object") {
    const status = "status" in error ? String((error as { status?: unknown }).status ?? "") : "";
    const message = "message" in error ? String((error as { message?: unknown }).message ?? "") : "";
    const lower = message.toLowerCase();

    if (status === "403" && lower.includes("rate limit")) {
      return new Error(`GitHub rate limit reached for ${repo}. Retry later or use a higher quota token.`);
    }

    if (status === "401") {
      return new Error(`GitHub authentication failed for ${repo}. Check token permissions and value.`);
    }

    if (message) {
      return new Error(`GitHub provider error for ${repo}: ${message}`);
    }
  }

  return new Error(`GitHub provider error for ${repo}: ${String(error)}`);
}

export function normalizeGithubData(input: GithubNormalizeInput): Event[] {
  const issueEvents = (input.issues ?? []).flatMap<Event>((issue) => {
    const labels = normalizeLabels(issue.labels);
    const baseEvent: Event = {
      id: `issue:${issue.id}:created`,
      provider: "github",
      repo: input.repo,
      type: "issue_created",
      title: issue.title,
      url: issue.html_url,
      timestamp: issue.created_at,
      labels,
      ...(issue.body ? { body: issue.body } : {}),
      ...(issue.user?.login ? { author: issue.user.login } : {}),
      ...(issue.milestone
        ? { milestone: { title: issue.milestone.title, dueOn: issue.milestone.due_on ?? null } }
        : {})
    };

    if (issue.state === "closed" && issue.closed_at) {
      return [
        baseEvent,
        {
          ...baseEvent,
          id: `issue:${issue.id}:closed`,
          type: "issue_closed",
          timestamp: issue.closed_at
        }
      ];
    }

    return [baseEvent];
  });

  const prEvents = (input.pullRequests ?? []).flatMap<Event>((pr) => {
    const labels = normalizeLabels(pr.labels);
    const baseEvent: Event = {
      id: `pr:${pr.id}:opened`,
      provider: "github",
      repo: input.repo,
      type: "pr_opened",
      title: pr.title,
      url: pr.html_url,
      timestamp: pr.created_at,
      labels,
      ...(pr.body ? { body: pr.body } : {}),
      ...(pr.user?.login ? { author: pr.user.login } : {})
    };

    if (pr.merged_at) {
      return [
        baseEvent,
        {
          ...baseEvent,
          id: `pr:${pr.id}:merged`,
          type: "pr_merged",
          timestamp: pr.merged_at
        }
      ];
    }

    return [baseEvent];
  });

  const commitEvents = (input.commits ?? []).map<Event>((entry) => {
    const rawMessage = entry.commit.message ?? "";
    const title = rawMessage.split(/\r?\n/)[0]?.trim() || "(commit)";
    const timestamp =
      entry.commit.author?.date ??
      entry.commit.committer?.date ??
      new Date().toISOString();
    const author =
      entry.author?.login ??
      entry.committer?.login ??
      entry.commit.author?.name ??
      entry.commit.committer?.name;

    return {
      id: `commit:${entry.sha}`,
      provider: "github",
      repo: input.repo,
      type: "commit",
      title,
      ...(rawMessage ? { body: rawMessage } : {}),
      ...(entry.html_url ? { url: entry.html_url } : {}),
      ...(author ? { author } : {}),
      timestamp,
      fields: { sha: entry.sha }
    };
  });

  return [...issueEvents, ...prEvents, ...commitEvents].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
}

class OctokitGithubApi implements GithubApi {
  constructor(private readonly octokit: Octokit) {}

  async listIssues(params: {
    owner: string;
    repo: string;
    since?: string;
    assignee?: string;
  }): Promise<GithubIssue[]> {
    const query: {
      owner: string;
      repo: string;
      state: "all";
      per_page: number;
      sort: "updated";
      direction: "desc";
      since?: string;
      assignee?: string;
    } = {
      owner: params.owner,
      repo: params.repo,
      state: "all",
      per_page: 100,
      sort: "updated",
      direction: "desc"
    };

    if (params.since) {
      query.since = params.since;
    }
    if (params.assignee) {
      query.assignee = params.assignee;
    }

    const data = await this.octokit.paginate(this.octokit.rest.issues.listForRepo, query);
    const issues = data.filter((item) => !item.pull_request);

    return issues.map((item) => ({
      id: item.id,
      number: item.number,
      title: item.title,
      state: item.state as "open" | "closed",
      html_url: item.html_url,
      created_at: item.created_at,
      updated_at: item.updated_at,
      closed_at: item.closed_at,
      labels: item.labels.map((label) =>
        typeof label === "string" ? label : (label.name ?? "")
      ),
      ...(item.body ? { body: item.body } : {}),
      ...(item.user?.login ? { user: { login: item.user.login } } : {}),
      ...(item.milestone
        ? { milestone: { title: item.milestone.title, due_on: item.milestone.due_on } }
        : {})
    }));
  }

  async listPullRequests(params: {
    owner: string;
    repo: string;
    since?: string;
    until?: string;
  }): Promise<GithubPullRequest[]> {
    const data = await this.octokit.paginate(this.octokit.rest.pulls.list, {
      owner: params.owner,
      repo: params.repo,
      state: "all",
      per_page: 100,
      sort: "updated",
      direction: "desc"
    });

    return data
      .filter((item) => {
        const updated = item.updated_at;
        if (!updated) {
          return false;
        }
        const sinceDate = params.since ? new Date(params.since) : undefined;
        const untilDate = params.until ? new Date(params.until) : undefined;
        return inRange(updated, sinceDate, untilDate);
      })
      .map((item) => ({
        id: item.id,
        number: item.number,
        title: item.title,
        state: item.state as "open" | "closed",
        html_url: item.html_url,
        created_at: item.created_at,
        updated_at: item.updated_at,
        merged_at: item.merged_at,
        labels: [],
        ...(item.body ? { body: item.body } : {}),
        ...(item.user?.login ? { user: { login: item.user.login } } : {})
      }));
  }

  async listMilestones(params: { owner: string; repo: string }): Promise<GithubMilestone[]> {
    const data = await this.octokit.paginate(this.octokit.rest.issues.listMilestones, {
      owner: params.owner,
      repo: params.repo,
      state: "all",
      per_page: 100
    });

    return data.map((milestone) => ({
      id: milestone.id,
      title: milestone.title,
      due_on: milestone.due_on
    }));
  }

  async listCommits(params: {
    owner: string;
    repo: string;
    since?: string;
    until?: string;
  }): Promise<GithubCommit[]> {
    const data = await this.octokit.paginate(this.octokit.rest.repos.listCommits, {
      owner: params.owner,
      repo: params.repo,
      per_page: 100,
      ...(params.since ? { since: params.since } : {}),
      ...(params.until ? { until: params.until } : {})
    });

    return data.map((item) => {
      const commitAuthor =
        item.commit.author && (item.commit.author.name || item.commit.author.date)
          ? {
              ...(item.commit.author.name ? { name: item.commit.author.name } : {}),
              ...(item.commit.author.date ? { date: item.commit.author.date } : {})
            }
          : undefined;

      const commitCommitter =
        item.commit.committer && (item.commit.committer.name || item.commit.committer.date)
          ? {
              ...(item.commit.committer.name ? { name: item.commit.committer.name } : {}),
              ...(item.commit.committer.date ? { date: item.commit.committer.date } : {})
            }
          : undefined;

      return {
        sha: item.sha,
        ...(item.html_url ? { html_url: item.html_url } : {}),
        commit: {
          message: item.commit.message,
          ...(commitAuthor ? { author: commitAuthor } : {}),
          ...(commitCommitter ? { committer: commitCommitter } : {})
        },
        ...(item.author?.login ? { author: { login: item.author.login } } : {}),
        ...(item.committer?.login ? { committer: { login: item.committer.login } } : {})
      };
    });
  }
}

export function createGithubApi(token: string, userAgent = "repodigest/0.1.0"): GithubApi {
  const octokit = new Octokit({ auth: token, userAgent });
  return new OctokitGithubApi(octokit);
}

export class GithubProviderClient {
  private readonly api: GithubApi;

  constructor(options: GithubProviderClientOptions) {
    if (options.api) {
      this.api = options.api;
      return;
    }

    if (!options.token) {
      throw new Error("GithubProviderClient requires either `api` or `token`.");
    }

    this.api = createGithubApi(options.token, options.userAgent);
  }

  async fetchEvents(options: GithubFetchOptions): Promise<Event[]> {
    const sinceDate = options.since ? new Date(options.since) : undefined;
    const untilDate = options.until ? new Date(options.until) : undefined;
    const labelFilter = (options.labelsAny ?? []).map((label) => label.toLowerCase());

    const batches = await Promise.all(
      options.repos.map(async (repoRef) => {
        const { owner, repo } = parseRepoRef(repoRef);
        try {
          const [issues, pullRequests, milestones, commits] = await Promise.all([
            this.api.listIssues({
              owner,
              repo,
              ...(options.since ? { since: options.since } : {}),
              ...(options.assignee ? { assignee: options.assignee } : {})
            }),
            this.api.listPullRequests({
              owner,
              repo,
              ...(options.since ? { since: options.since } : {}),
              ...(options.until ? { until: options.until } : {})
            }),
            this.api.listMilestones({ owner, repo }),
            this.api.listCommits
              ? this.api.listCommits({
                  owner,
                  repo,
                  ...(options.since ? { since: options.since } : {}),
                  ...(options.until ? { until: options.until } : {})
                })
              : Promise.resolve([])
          ]);

          const filteredIssues = withMilestoneDueFallback(issues, milestones).filter((issue) => {
            const marker = issue.updated_at ?? issue.created_at;
            if (!inRange(marker, sinceDate, untilDate)) {
              return false;
            }
            return hasAnyLabel(normalizeLabels(issue.labels), labelFilter);
          });

          const filteredPRs = pullRequests.filter((pr) => {
            const marker = pr.updated_at ?? pr.created_at;
            if (!inRange(marker, sinceDate, untilDate)) {
              return false;
            }
            return hasAnyLabel(normalizeLabels(pr.labels), labelFilter);
          });

          const filteredCommits = commits.filter((commit) => {
            const marker =
              commit.commit.author?.date ?? commit.commit.committer?.date ?? "";
            return marker ? inRange(marker, sinceDate, untilDate) : false;
          });

          return normalizeGithubData({
            repo: `${owner}/${repo}`,
            issues: filteredIssues,
            pullRequests: filteredPRs,
            commits: filteredCommits
          });
        } catch (error: unknown) {
          throw formatProviderError(error, repoRef);
        }
      })
    );

    return batches.flat().sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }
}
