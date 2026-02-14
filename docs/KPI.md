# KPI Tracking

This project includes scripts for the KPI checklist in `task.md`.

## Prerequisites

- Node.js `>= 22`
- Built CLI (`npm run build`)
- `GITHUB_TOKEN` set (for onboarding/GitHub KPI scripts)

## 1) Usability KPIs

Measure time-to-first-digest and first-run success ratio:

```bash
npm run kpi:onboarding -- --repo owner/repo --iterations 5
```

Supported options:
- `--repo owner/repo` (or `REPODIGEST_KPI_REPO`)
- `--iterations 5`
- `--minSuccessRatio 0.9`
- `--maxMedianMs 300000` (5 minutes)

## 2) Quality KPIs

Run critical-path coverage (`core`, `provider-github`, `cli`):

```bash
npm run kpi:coverage
```

Override threshold:

```bash
node scripts/kpi/critical-path-coverage.mjs --threshold 85
```

## 3) GitHub KPIs

Track CI pass rate, issue response/docs ratio, escaped critical bugs, and returning contributors:

```bash
npm run kpi:github -- --repo owner/repo --days 30
```

Supported options:
- `--repo owner/repo` (or `REPODIGEST_KPI_REPO`)
- `--days 30`
- `--workflow CI`
- `--maxIssues 50`

## 4) Dry-Run Explainability (Manual Protocol)

Run guided session and write report:

```bash
npm run kpi:explainability -- --repo owner/repo --reviewer alice --reviewer bob --items 5
```

Offline mode (no GitHub call):
```bash
npm run kpi:explainability -- --dryRunFile examples/kpi/dry-run-sample.md --reviewer alice --reviewer bob --items 5
```

Non-interactive scoring from a prepared answers file:
```bash
npm run kpi:explainability -- --dryRunFile examples/kpi/dry-run-sample.md --answersFile examples/kpi/explainability-answers.sample.json
```

Output:
- `repodigest/kpi/explainability-YYYY-MM-DD.md`

Session flow:
1. Script runs `init` in a temp folder.
2. Script runs `today --dry-run` and samples digest items.
3. Facilitator marks each reviewer answer `pass/fail` per item.
4. Script computes overall explainability pass ratio.

Alternative lightweight protocol:

1. Run:
```bash
node packages/cli/dist/index.js today --dry-run
```
2. Pick 5 output items.
3. Ask reviewer to explain each item's section (`Done`, `In Progress`, `Blocked`, `Next`, `Due Today`) from title/highlight/link evidence.
4. Mark pass when explanation matches expected rule outcome.
5. Report pass ratio as `explained_items / total_items`.
