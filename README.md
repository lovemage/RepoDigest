# RepoDigest

Turn GitHub activity into a standup report in minutes.
Now includes `commit` events (useful for solo workflows without Issues/PRs).

`RepoDigest` auto-summarizes your Issues/PRs into:
- `Due Today`
- `Done`
- `In Progress`
- `Blocked`
- `Next`

It can render:
- internal markdown
- X thread preview
- Threads preview

## Language Versions

- English (this file): `README.md`
- Traditional Chinese (technical): `README.zh-TW.md`
- Traditional Chinese (plain language): `README.marketing.zh-TW.md`

## Prerequisites

- Node.js `>=22`
- GitHub account
- Optional: GitHub CLI `gh` (recommended for browser auth)

## One-Line Setup

```bash
npx repodigest@latest init --quick --project
```

No `npm install` and no local build required for first-time use.

For contributors developing this repo locally:

```bash
npm install
npm run build
```

That one `init --quick` command does:
1. create config
2. run browser auth (via GitHub CLI `gh` if available)
3. let you pick repos from CLI (if `--repo` is not provided; default preselects one repo)
4. validate setup

Optional (skip selection prompt):
```bash
npx repodigest init --quick --project --repo owner/repo
```

If an existing install is detected, CLI will let you choose reinstall interactively.
For non-interactive environments, use:
```bash
npx repodigest init --quick --project --reinstall
```

## No Manual Token Copy

Browser auth only.

```bash
npx repodigest auth login
```

CLI shows the device code first, then waits for `Enter` before opening your browser.

If `gh` is not available on your machine, use OAuth app fallback:

```bash
npx repodigest auth login --client-id <GITHUB_OAUTH_CLIENT_ID>
```

## Daily Usage

```bash
# generate today report
npx repodigest today

# preview only (no file write)
npx repodigest today --dry-run

# weekly window
npx repodigest range --since monday --until today

# discover today's new GitHub repos with summary
npx repodigest trending --wizard

# non-interactive
npx repodigest trending --lang en --limit 10

# summarize today's commits for customer
npx repodigest sum cus

# summarize today's commits for team/leadership
npx repodigest sum team

# custom profile from config.summaries.profiles
npx repodigest sum myboss

# or pass any configured profile key
npx repodigest sum <profile>
```

`init` wizard now includes optional AI setup for `sum` command:
- choose default summary profile (`team` or `cus`)
- optional GitHub login for "my commits" filter
- optional OpenAI-compatible endpoint (`baseUrl`, `model`, `apiKeyEnv`)

## Output Files

- `repodigest/latest.md`
- `repodigest/daily/YYYY-MM-DD.md`
- `repodigest/range/YYYY-MM-DD_to_YYYY-MM-DD.md`

## Useful Commands

```bash
# update config
npx repodigest update --add-repo owner/new-repo --lang zh-TW

# remove RepoDigest files
npx repodigest remove --yes

# verify auth + config
npx repodigest validate
```

## Docs

- Config: `docs/CONFIG.md`
- Plugins: `docs/PLUGINS.md`
- KPI: `docs/KPI.md`

## License

MIT. See `LICENSE`.
