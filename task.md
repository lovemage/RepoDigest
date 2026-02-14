# RepoDigest Execution Taskboard (Aligned with Build Plan v2)

## 0. Tracking Rules
- [ ] Use this file as the single source of truth for implementation progress.
- [ ] Only mark done when code, tests, and docs are all updated.
- [ ] Link every completed item to a PR number in commit/PR description.

## 1. Phase A (MVP): Reliable Internal Standup Flow
Target: ship end-to-end `GitHub -> Digest -> Internal Markdown` workflow.

### 1.1 Foundation (Week 1-2)
- [x] Root workspace setup (`package.json`, npm workspaces, scripts).
- [x] Root TypeScript setup (`tsconfig.json`, Node 22+, NodeNext).
- [x] Root test setup (`vitest.config.ts`, shared test scripts).
- [x] Package skeletons: `packages/core`, `packages/cli`, `packages/provider-github`, `packages/renderer-internal`.
- [x] CI checks: `lint`, `typecheck`, `test`, `build`.

Definition of done:
- [x] `npm test` passes in CI.
- [x] All packages can build from clean install.

### 1.2 Core Reliability
- [x] Implement `packages/core/src/types.ts` (`Event`, `WorkItem`, `Digest`).
- [x] Implement `packages/core/src/pipeline.ts` (`Collect -> Normalize -> Classify -> Summarize -> Render`).
- [x] Implement `packages/core/src/rules/due-resolver.ts`.
- [x] Implement `packages/core/src/rules/status-classifier.ts` with deterministic precedence.
- [x] Implement `packages/core/src/summarizer.ts` (rule-based highlights).
- [x] Add unit tests for due resolver rules.
- [x] Add unit tests for status classifier rules.
- [x] Add pipeline integration tests for stable output ordering.

Definition of done:
- [x] Core tests cover critical flows and pass in CI.
- [x] Each rendered work item contains traceable evidence metadata.

### 1.3 Provider GitHub
- [x] Implement Octokit client wrapper in `packages/provider-github`.
- [x] Fetch issues, PRs, and milestones.
- [x] Normalize provider data to `Event[]`.
- [x] Add mock fixture tests for API normalization.
- [x] Add retry and rate-limit safe handling for non-fatal failures.

Definition of done:
- [x] Provider outputs stable `Event[]` shape for fixture scenarios.
- [x] Error messages are actionable (token, permission, rate limit).

### 1.4 Renderer Internal
- [x] Implement standup renderer in `packages/renderer-internal/src/index.ts`.
- [x] Enforce section order: `Due Today`, `Done`, `In Progress`, `Blocked`, `Next`.
- [x] Include optional links and metrics based on config.
- [x] Add golden tests for renderer output.

Definition of done:
- [x] Golden tests pass and avoid flaky timestamp ordering.

### 1.5 CLI and Onboarding UX
- [x] Implement `repodigest today`.
- [x] Implement `repodigest range --since --until`.
- [x] Implement config loader (`.repodigest.yml` + Zod validation).
- [x] Implement writer (`repodigest/daily/YYYY-MM-DD.md`, `repodigest/latest.md`).
- [x] Implement `repodigest validate` with actionable validation errors.
- [x] Implement `repodigest init` interactive wizard.
- [x] `init`: component selector (CLI / IDE / GitHub Action / All).
- [x] `init`: token source setup.
- [x] `init`: tracked repos setup.
- [x] `init`: output language/timezone setup.
- [x] `init`: generate `.repodigest.yml`.
- [x] `init`: append `.vscode/tasks.json` (optional).
- [x] `init`: generate `.github/workflows/repodigest.yml` (optional).
- [x] Add CLI integration tests for `today`, `validate`, `init`.

Definition of done:
- [x] Fresh user can run first digest in <= 5 minutes.
- [x] First-run flow succeeds without manual file edits in most cases.

### 1.6 Docs (Bilingual)
- [x] Write `README.md`.
- [x] Write `README.zh-TW.md`.
- [x] Write `docs/ARCHITECTURE.md`.
- [x] Write `docs/ARCHITECTURE.zh-TW.md`.
- [x] Write `docs/CONFIG.md`.
- [x] Write `docs/CONFIG.zh-TW.md`.
- [x] Add example `examples/.repodigest.yml`.
- [x] Add troubleshooting section for top setup failures.

Definition of done:
- [x] Docs cover install, first run, config, troubleshooting, contribution path.

## 2. Phase B: Public Sharing Output
Target: make generated social content post-ready with minimal editing.

### 2.1 Renderer X
- [x] Create `packages/renderer-x`.
- [x] Implement deterministic 280-char thread splitter.
- [x] Implement numbering format (e.g., `1/3`).
- [x] Add tests for split logic and length limits.
- [x] Add golden tests for typical digest scenarios.

### 2.2 Renderer Threads
- [x] Create `packages/renderer-threads`.
- [x] Implement build-in-public style formatting.
- [x] Add tests for readability and section mapping.

### 2.3 Output UX
- [x] Add tone presets (`calm`, `playful`, `hacker`, `formal`).
- [x] Add language switch (`zh-TW`, `en`).
- [x] Add CLI output preview mode for public renderers.

Definition of done:
- [x] User can generate `internal`, `x`, `threads` outputs from same digest input.

## 3. Phase C: Extensions and Ecosystem
Target: improve extensibility and long-term contributor velocity.

### 3.1 Provider Extensions
- [x] Create `packages/provider-git`.
- [x] Normalize local git commits into `Event[]`.
- [x] Add fixtures and parser tests.

### 3.2 Optional LLM Summarizer
- [x] Define optional summarizer plugin interface.
- [x] Implement plugin loading without hard dependency.
- [x] Add fallback to rule-based summarizer on missing key/errors.
- [x] Add safety docs for token handling and cost control.

### 3.3 Plugin Docs
- [x] Document provider interface contract.
- [x] Document renderer interface contract.
- [x] Add minimal plugin examples.

Definition of done:
- [x] New provider/renderer can be added without core changes.

## 4. OSS Reputation and Community Operations
- [x] Add `.github/ISSUE_TEMPLATE/bug_report.yml`.
- [x] Add `.github/ISSUE_TEMPLATE/feature_request.yml`.
- [x] Add `.github/pull_request_template.md`.
- [x] Add `CONTRIBUTING.md`.
- [x] Add `SECURITY.md`.
- [x] Add `CODE_OF_CONDUCT.md`.
- [x] Define triage SLA (first response <= 48 hours).
- [x] Define release note template and changelog policy.
- [x] Add and maintain `good first issue` labels.

Definition of done:
- [x] New contributors can open quality issues/PRs without extra guidance.

## 5. KPI Validation Checklist

### 5.1 Usability KPI Checks
- [x] Measure time-to-first-digest from clean environment.
- [x] Track first-run success ratio for onboarding sessions.
- [ ] Run dry-run explainability tests with sample users.

### 5.2 Quality KPI Checks
- [x] Track CI pass rate.
- [x] Report critical path coverage (`core`, `provider-github`, `cli init`).
- [x] Track escaped critical bugs per release.

### 5.3 GitHub KPI Checks
- [x] Track median issue first-response time.
- [x] Track docs-related issue ratio.
- [x] Track returning contributors per month.

## 6. Current Sprint Recommendation
- [x] Complete all items in `1.1 Foundation`.
- [x] Complete all items in `1.2 Core Reliability`.
- [x] Complete first 3 items in `1.5 CLI and Onboarding UX` (`today`, config loader, writer).
