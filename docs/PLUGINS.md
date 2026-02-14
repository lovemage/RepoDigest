# RepoDigest Plugin Contracts

## Provider contract

Provider goal: collect source activity and normalize to `Event[]`.

Type shape (from `@oceanads/core`):

```ts
type Event = {
  id: string;
  provider: string;
  repo?: string;
  type:
    | "issue_created"
    | "issue_closed"
    | "issue_commented"
    | "pr_opened"
    | "pr_merged"
    | "pr_reviewed"
    | "commit"
    | "release"
    | "note";
  title?: string;
  body?: string;
  url?: string;
  author?: string;
  timestamp: string;
  labels?: string[];
  milestone?: { title: string; dueOn?: string | null };
  fields?: Record<string, unknown>;
};
```

Provider package examples:

- `packages/provider-github`
- `packages/provider-git`

## Renderer contract

Renderer goal: transform `Digest` into target output text/blocks.

Common pattern:

```ts
type RenderResult = { blocks: string[]; meta?: Record<string, unknown> };
type Renderer = (digest: Digest, options?: Record<string, unknown>) => RenderResult;
```

Renderer package examples:

- `packages/renderer-internal`
- `packages/renderer-x`
- `packages/renderer-threads`

## Summarizer plugin contract

Optional external plugin contract:

```ts
export function summarizeWorkItem(
  item: WorkItem
): Promise<string[] | null | undefined> | string[] | null | undefined;
```

or default export object:

```ts
export default {
  summarizeWorkItem(item: WorkItem) {
    return [item.title];
  }
};
```

If plugin loading/execution fails, RepoDigest falls back to built-in rule summarizer.

## Minimal plugin example

See `examples/plugins/sample-summarizer.mjs`.

