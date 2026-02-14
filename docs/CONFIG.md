# RepoDigest Config Reference

## Config file path
- Default config file: `.repodigest.yml`
- Validate config before running digests:
```bash
npx repodigest validate
```

## Minimal config
```yaml
timezone: UTC
scope:
  repos:
    - owner/repo
providers:
  github:
    tokenEnv: GITHUB_TOKEN
output:
  target: internal
  lang: en
```

## Full schema (current implementation)
```yaml
timezone: Asia/Taipei

scope:
  repos:
    - owner1/repoA
    - owner2/repoB

providers:
  github:
    tokenEnv: GITHUB_TOKEN
    query:
      assignee: "@me"
      labelsAny:
        - today
        - standup

output:
  mode: internal         # internal | public
  target: internal       # internal | x | threads | markdown
  lang: en               # en | zh-TW | both
  tone: calm             # calm | playful | hacker | formal
  length: short          # short | medium | long
  include:
    stack: false
    links: true
    metrics: true
  thread:
    enabled: false
    numbering: "1/1"
  summarizerPlugin: ./examples/plugins/sample-summarizer.mjs

summaries:
  defaultProfile: team
  profiles:
    team:
      audience: team
      style: professional
      includeTechnicalDetails: true
      language: en
    cus:
      audience: customer
      style: natural
      includeTechnicalDetails: false
      language: zh-TW
  identity:
    githubLogin: your-github-login
  ai:
    enabled: false
    baseUrl: https://api.openai.com/v1
    model: gpt-4o-mini
    apiKeyEnv: OPENAI_API_KEY
```

## Field rules
- `scope.repos`: required, format must be `owner/name`.
- `providers.github.tokenEnv`: environment variable key name used to read GitHub token.
- `providers.github.query.assignee`: optional filter passed to GitHub issues query.
- `providers.github.query.labelsAny`: optional label OR-filter.
- `output.include.links`: include item links in rendered markdown.
- `output.include.metrics`: include stats line in rendered markdown.
- `output.summarizerPlugin`: optional module path/package for custom summarize hook.
- `summaries.defaultProfile`: default profile key used by `repodigest sum`.
- `summaries.profiles.<key>`: audience-specific summary style.
- `summaries.identity.githubLogin`: optional filter to prioritize your own commits.
- `summaries.ai`: optional OpenAI-compatible AI summarizer settings.

## Token resolution
RepoDigest resolves GitHub token in this order:
1. Process environment variable named by `providers.github.tokenEnv`
2. `.env` in project root

Example:
```bash
export GITHUB_TOKEN=ghp_xxx
npx repodigest validate
```

Or in `.env`:
```dotenv
GITHUB_TOKEN=ghp_xxx
```

## CLI commands

### `init`

Interactive setup:

```bash
npx repodigest init
```

One-line project install:

```bash
npx repodigest init --project --yes
```

One-command quick setup:

```bash
npx repodigest init --quick --project
```

One-line global install to `agentrule`:

```bash
npx repodigest init --agentrule --yes --repo owner/repo
```

`init` options:
- `--project`: install to current project.
- `--agentrule`: install to global agentrule location.
- `--yes`: non-interactive mode.
- `--quick`: run init + optional browser auth + validate in one command.
- `--reinstall`: if already installed, remove managed files and reinstall.
- `--repo <owner/repo>`: repeatable, optional. If omitted, CLI prompts repo selection after browser auth.
- `--lang <en|zh-TW|both>`
- `--timezone <IANA timezone>`
- `--token-source <browser>`: browser auth only.
- `--client-id <id>`: optional GitHub OAuth client id (needed only when GitHub CLI `gh` is unavailable).
- `--scope <value>`: OAuth scopes for browser auth (default `repo`).
- `--no-browser`: do not auto-open browser; print URL/code only.

If existing install is detected and you did not pass `--reinstall`, CLI asks whether to reinstall.
- `--components <cli|ide|action|all>`: only for project target.

Global install root:
- default: `~/.agentrule/repodigest`
- override: set `AGENTRULE_HOME`

### `today`
Fetches the latest 24 hours by default.

```bash
npx repodigest today
```

Options:
- `--dry-run`: print digest to stdout, no files written.
- `--preview`: preview rendered blocks (useful for `x` / `threads`).
- `--since <value>`: override start time.
- `--until <value>`: override end time.
- `--target <value>`: `internal|x|threads|markdown`
- `--tone <value>`: `calm|playful|hacker|formal`
- `--lang <value>`: `en|zh-TW|both`

Examples:
```bash
npx repodigest today --dry-run
npx repodigest today --preview --target x --tone playful --lang zh-TW
npx repodigest today --since 2026-02-14T00:00:00Z --until 2026-02-14T23:59:59Z
npx repodigest today --since yesterday --until now
```

Output files:
- `repodigest/daily/YYYY-MM-DD.md`
- `repodigest/latest.md`

### `range`
Fetches a custom time window. `--since` is required.

```bash
npx repodigest range --since 2026-02-10 --until 2026-02-14
```

Options:
- `--since <value>`: required start time.
- `--until <value>`: optional end time (defaults to `now`).
- `--dry-run`: print digest to stdout, no files written.
- `--preview`: preview rendered blocks.
- `--target <value>`: `internal|x|threads|markdown`
- `--tone <value>`: `calm|playful|hacker|formal`
- `--lang <value>`: `en|zh-TW|both`

Examples:
```bash
npx repodigest range --since monday --until today
npx repodigest range --since monday --until now --preview --target threads
npx repodigest range --since 2026-02-01T00:00:00Z --until 2026-02-14T23:59:59Z --dry-run
```

Output files:
- `repodigest/range/YYYY-MM-DD_to_YYYY-MM-DD.md`
- `repodigest/latest.md`

### `trending`
Fetches repositories created today on GitHub, ranked by stars, then writes a bilingual-ready summary.

```bash
npx repodigest trending --wizard
```

Options:
- `--lang <value>`: `en|zh-TW|both` (default `en`)
- `--limit <number>`: `1..30` (default `10`)
- `--wizard`: interactive prompts for language and limit

Examples:
```bash
npx repodigest trending
npx repodigest trending --lang zh-TW --limit 15
npx repodigest trending --lang both --limit 8
```

Output files:
- `repodigest/trending/YYYY-MM-DD.md`
- `repodigest/latest-trending.md`

### `sum`
Summarizes today's commits for specific audiences.

```bash
npx repodigest sum cus
```

Profiles:
- `cus`: customer-friendly natural language (less technical details)
- `team`: professional tone for leadership/team updates
- custom key: any profile in `summaries.profiles.<key>`

Options:
- positional `<profile>`: profile key, e.g. `cus`, `team`, `myboss`
- `--profile <value>`: profile key (same as positional)
- `--lang <value>`: `en|zh-TW|both` override
- `--dry-run`: print summary only
- `--ai`: force AI summarization if configured and API key exists

Examples:
```bash
npx repodigest sum cus
npx repodigest sum team --lang en
npx repodigest sum myboss --dry-run
npx repodigest sum cus --ai
```

Output files:
- `repodigest/sum/<profile>/YYYY-MM-DD.md`
- `repodigest/latest-sum-<profile>.md`

### `update`
Updates existing `.repodigest.yml` in project or global target.

```bash
npx repodigest update --add-repo owner/repo-b --lang zh-TW
```

Options:
- `--project`: update project config (default).
- `--agentrule`: update global agentrule config.
- `--add-repo <owner/repo>`: repeatable.
- `--remove-repo <owner/repo>`: repeatable.
- `--lang <value>`: `en|zh-TW|both`
- `--timezone <IANA timezone>`
- `--target <value>`: `internal|x|threads|markdown`
- `--tone <value>`: `calm|playful|hacker|formal`

### `remove`
Removes RepoDigest-managed files from target.

```bash
npx repodigest remove --yes
```

Options:
- `--project`: remove from project target (default).
- `--agentrule`: remove from global agentrule target.
- `--yes`: required safety flag.
- `--keep-output`: keep `repodigest/` output folder.

### `auth`
GitHub browser login/logout (OAuth device flow).

```bash
npx repodigest auth login
npx repodigest auth logout
```

Options:
- `--project`: auth against project target (default).
- `--agentrule`: auth against global agentrule target.
- `--client-id <id>`: optional; use only if you do not use GitHub CLI `gh`.
- `--scope <value>`: OAuth scope list, default `repo`.
- `--token-env <key>`: env key to write/remove in `.env`.
- `--no-browser`: do not auto-open browser; print URL/code only.

During `auth login`, CLI prints the device code first, then waits for Enter before opening browser.

## Date value shortcuts
Accepted shortcuts in `--since` / `--until`:
- `now`
- `today`
- `yesterday`
- `monday`

For reproducible automation, prefer ISO timestamps such as `2026-02-14T00:00:00Z`.

## Plugin docs

- `docs/PLUGINS.md`
- `docs/LLM_PLUGIN.md`
- `docs/KPI.md`
