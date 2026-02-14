# RepoDigest Architecture

## Overview

RepoDigest is a workspace-based monorepo that turns repository activity into digest markdown.

Current pipeline:
`Collect -> Normalize -> Classify -> Summarize -> Render -> Write`

## Package Layout

- `packages/core`
- `packages/provider-github`
- `packages/renderer-internal`
- `packages/cli`

## Data Flow

1. CLI loads `.repodigest.yml` and token.
2. Provider fetches GitHub issues, PRs, and milestones.
3. Provider normalizes raw API data to `Event[]`.
4. Core groups events into `WorkItem[]`.
5. Core rules resolve due date and classify status.
6. Core summarizer produces highlights.
7. Renderer formats a `Digest` to markdown.
8. Writer saves output to `repodigest/` files.

## Core Models

- `Event`
- Provider-scoped activity record.
- Normalized fields include type, title/body excerpt, labels, milestone, timestamp, URL.

- `WorkItem`
- Aggregated unit built from related events.
- Carries status, due date, highlights, and evidence.

- `Digest`
- Final structured summary.
- Includes section buckets (`Due Today`, `Done`, `In Progress`, `Blocked`, `Next`) and stats.

## Pipeline Responsibilities

- `Collect`
- Provider fetches events in time window.

- `Normalize`
- Convert provider payloads to stable `Event[]`.

- `Classify`
- Resolve due date and infer work status.

- `Summarize`
- Generate concise highlights from title and recent evidence.

- `Render`
- Convert digest object into channel-specific text.

## Rules Engine

### Due Resolver Priority

1. Milestone due date
2. Label pattern (for example `due:YYYY-MM-DD`, `due/today`)
3. Frontmatter field in issue/PR body
4. No due date

### Status Classifier Priority

1. `done` from close/merge/release events
2. `blocked` from labels/frontmatter/blocking signals
3. `planned` from next/planned labels
4. `in_progress` from active events
5. `unknown`

## Provider Layer

`packages/provider-github` provides:

- Octokit client wrapper
- fetch options (`repos`, `since`, `until`, `assignee`, `labelsAny`)
- normalized events
- actionable token/rate-limit errors

Provider abstraction allows future providers without changing core types.

## Renderer Layer

`packages/renderer-internal` renders deterministic markdown:

- fixed section order
- optional links
- optional metrics
- golden tests for output stability

## CLI Layer

`packages/cli` handles:

- init wizard (`repodigest init`)
- schema validation (`repodigest validate`)
- run commands (`repodigest today`, `repodigest range`)
- output writing (`daily`, `range`, `latest`)

## Quality Gates

- Type safety: TypeScript strict mode
- Unit tests: core rules + pipeline
- Golden tests: renderer output lock
- Integration tests: CLI command behavior
- CI: `lint`, `typecheck`, `test`, `build`

## Extension Points

- New provider package implements event collection and normalization.
- New renderer package consumes `Digest` and outputs target format.
- Optional plugin support for advanced summarizers (planned).

