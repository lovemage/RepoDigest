# RepoDigest Build Plan v2

## 1. Product Goal
Build a repo activity digest tool that users can install in minutes, trust in daily use, and recommend publicly.

Primary user outcomes:
- `Fast`: first useful digest in under 5 minutes.
- `Accurate`: digest sections reflect real repo state (done/in-progress/blocked/due).
- `Shareable`: output can be posted to standup, X, and Threads with minimal editing.

Project outcomes:
- Strong developer experience and clear docs.
- Positive OSS signals on GitHub (stars, issue quality, repeat contributors).

## 2. Success Metrics

### Usability KPIs
- Time-to-first-digest: <= 5 minutes from install to first `repodigest today`.
- First-run success rate: >= 90% (no manual config fix needed).
- Dry-run clarity: >= 95% of test users can explain why each item was classified.

### Quality KPIs
- Core test pass rate: 100% on CI.
- Critical path coverage (`core`, `provider-github`, `cli init`): >= 85%.
- Regression escape rate: < 1 critical bug per release.

### GitHub Reputation KPIs
- Median issue first response time: <= 48 hours.
- Docs-related issues ratio: < 20% of all issues after v1.0.
- Monthly returning contributors: >= 3 within 3 months post-launch.

## 3. Product Principles
- `Default-first`: sensible defaults; advanced options are optional.
- `Explainability`: every digest item should trace back to evidence.
- `Composable`: provider and renderer are plugin-like packages.
- `Safe publish`: never auto-post to social platforms without explicit opt-in.

## 4. Scope and Release Strategy

### Phase A (MVP): Internal standup flow done end-to-end
Target: a reliable daily workflow for individual developers.

In scope:
- `provider-github`
- `core` pipeline (`Collect -> Normalize -> Classify -> Summarize -> Render`)
- `renderer-internal`
- `cli` commands: `today`, `range`, `validate`, `init`
- File output: `repodigest/daily/YYYY-MM-DD.md` and `repodigest/latest.md`

Out of scope:
- Auto-posting to social APIs
- LLM dependency as required path
- Non-GitHub providers

### Phase B: Public sharing outputs
Target: make social-ready outputs good enough to post directly.

In scope:
- `renderer-x` with deterministic 280-char thread split
- `renderer-threads`
- Tone/language presets and output preview

### Phase C: Ecosystem and extension
Target: improve extensibility and contributor experience.

In scope:
- `provider-git`
- Optional LLM summarizer plugin
- Public plugin interface docs and examples

## 5. Workstreams

### Workstream 1: Core Reliability
- Finalize shared types (`Event`, `WorkItem`, `Digest`).
- Implement due resolver chain: milestone -> label regex -> frontmatter -> none.
- Implement status classifier with deterministic precedence rules.
- Add evidence links in digest metadata for traceability.

### Workstream 2: Onboarding UX
- Build `repodigest init` wizard with component selector:
  - CLI
  - IDE (VS Code task templates)
  - GitHub Action
  - All
- Validate token source and repo format during setup.
- Add `repodigest validate` with actionable error messages.

### Workstream 3: Output Quality
- Create consistent section ordering and formatting.
- Add golden tests for renderer outputs.
- Implement stable sorting and deduplication across events.

### Workstream 4: OSS & GitHub Reputation
- Publish high-signal docs:
  - `README.md`
  - `README.zh-TW.md`
  - `docs/ARCHITECTURE.md`
  - `docs/CONFIG.md`
- Add contributor hygiene:
  - Issue templates
  - PR template
  - `CONTRIBUTING.md`
  - `SECURITY.md`
  - `CODE_OF_CONDUCT.md`
- Set release cadence and changelog policy.

## 6. Milestones (8 Weeks)

### Milestone 1 (Week 1-2): Foundation
- Monorepo setup with npm workspaces.
- Package scaffolding for `core`, `cli`, `provider-github`, `renderer-internal`.
- CI pipeline with lint, typecheck, test.

Exit criteria:
- `npm test` green in CI.
- `repodigest validate` works with sample config.

### Milestone 2 (Week 3-5): MVP Completion
- Core pipeline complete with tests.
- GitHub provider normalized into `Event[]`.
- Internal renderer and file writer complete.
- `repodigest today --dry-run` functional.

Exit criteria:
- Golden tests for internal renderer pass.
- First-run setup works from clean machine.

### Milestone 3 (Week 6-8): Public Readiness
- `repodigest init` polished with IDE and Action generation.
- Docs bilingual pass.
- Social renderer baseline (`renderer-x`) shipped.
- Community files and templates added.

Exit criteria:
- New user can complete setup in <= 5 minutes.
- Project has clear contribution path and support policy.

## 7. Prioritized Task List

### P0 (Must)
- Root workspace and TS/Vitest setup.
- `packages/core`: types, pipeline, due resolver, status classifier, summarizer.
- `packages/provider-github`: issue/PR/milestone normalization.
- `packages/renderer-internal`: deterministic standup rendering.
- `packages/cli`: `today`, `validate`, `init`, writer.
- MVP docs and sample `.repodigest.yml`.

### P1 (Should)
- `renderer-x` with thread splitter.
- VS Code tasks generation.
- GitHub Action workflow generation.
- Better error taxonomy and troubleshooting docs.

### P2 (Could)
- `renderer-threads`
- `provider-git`
- Optional LLM summarizer plugin

## 8. Quality Gates
- Every merged PR must include:
  - Tests for behavior changes
  - Updated docs when config/CLI changes
  - Changelog fragment
- Required CI checks:
  - `lint`
  - `typecheck`
  - `test`
  - `build`
- Release blocking rules:
  - No known P0 bug open
  - No failing golden test
  - No undocumented breaking config change

## 9. GitHub Goodwill Plan
- Keep issues actionable with templates that force repro info.
- Tag and triage within 48 hours.
- Mark beginner-friendly issues (`good first issue`) weekly.
- Publish concise release notes focused on user-visible changes.
- Dogfood daily using this repo and post generated samples.

## 10. Immediate Next Actions (This Week)
1. Initialize workspace and package skeleton.
2. Implement `core` types plus due/status rules with tests.
3. Implement `provider-github` normalization fixtures.
4. Implement `renderer-internal` and golden tests.
5. Implement `cli today`, `validate`, and minimal `init`.
6. Draft bilingual README and config docs.
