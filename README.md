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

## 3-Minute Setup

```bash
npm install
npm run build
node packages/cli/dist/index.js init --quick --project
```

That one `init --quick` command does:
1. create config
2. run browser auth (via GitHub CLI `gh` if available)
3. let you pick repos from CLI (if `--repo` is not provided)
4. validate setup

Optional (skip selection prompt):
```bash
node packages/cli/dist/index.js init --quick --project --repo owner/repo
```

If an existing install is detected, CLI will let you choose reinstall interactively.
For non-interactive environments, use:
```bash
node packages/cli/dist/index.js init --quick --project --reinstall
```

## No Manual Token Copy

Browser auth only.

```bash
node packages/cli/dist/index.js auth login
```

CLI shows the device code first, then waits for `Enter` before opening your browser.

If `gh` is not available on your machine, use OAuth app fallback:

```bash
node packages/cli/dist/index.js auth login --client-id <GITHUB_OAUTH_CLIENT_ID>
```

## Daily Usage

```bash
# generate today report
node packages/cli/dist/index.js today

# preview only (no file write)
node packages/cli/dist/index.js today --dry-run

# weekly window
node packages/cli/dist/index.js range --since monday --until today
```

## Output Files

- `repodigest/latest.md`
- `repodigest/daily/YYYY-MM-DD.md`
- `repodigest/range/YYYY-MM-DD_to_YYYY-MM-DD.md`

## Useful Commands

```bash
# update config
node packages/cli/dist/index.js update --add-repo owner/new-repo --lang zh-TW

# remove RepoDigest files
node packages/cli/dist/index.js remove --yes

# verify auth + config
node packages/cli/dist/index.js validate
```

## Docs

- Config: `docs/CONFIG.md`
- Plugins: `docs/PLUGINS.md`
- KPI: `docs/KPI.md`

## License

MIT. See `LICENSE`.
