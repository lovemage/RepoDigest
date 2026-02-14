export type EventType =
  | "issue_created"
  | "issue_closed"
  | "issue_commented"
  | "pr_opened"
  | "pr_merged"
  | "pr_reviewed"
  | "commit"
  | "release"
  | "note";

export type WorkKind = "issue" | "pr" | "commit" | "release" | "note";
export type WorkStatus = "done" | "in_progress" | "blocked" | "planned" | "unknown";

export interface Event {
  id: string;
  provider: string;
  repo?: string;
  type: EventType;
  title?: string;
  body?: string;
  url?: string;
  author?: string;
  timestamp: string;
  labels?: string[];
  milestone?: { title: string; dueOn?: string | null };
  fields?: Record<string, unknown>;
}

export interface WorkItem {
  key: string;
  kind: WorkKind;
  repo?: string;
  title: string;
  url?: string;
  labels?: string[];
  due?: string | null;
  status: WorkStatus;
  highlights: string[];
  evidence: Event[];
  stackHints?: string[];
}

export interface DigestScope {
  repos?: string[];
  user?: string;
  team?: string;
}

export interface DigestStats {
  done: number;
  inProgress: number;
  blocked: number;
  dueToday: number;
}

export interface DigestSections {
  dueToday: WorkItem[];
  done: WorkItem[];
  inProgress: WorkItem[];
  blocked: WorkItem[];
  next: WorkItem[];
  notes: string[];
}

export interface Digest {
  date: string;
  timezone: string;
  scope: DigestScope;
  stats: DigestStats;
  sections: DigestSections;
  stack?: string[];
}

export interface PipelineContext {
  date?: Date;
  timezone?: string;
  scope?: DigestScope;
}

