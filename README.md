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
npx repodigest init --quick --project
```

That one `init --quick` command does:
1. create config
2. run browser auth (via GitHub CLI `gh` if available)
3. let you pick repos from CLI (if `--repo` is not provided)
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
```

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

## Publish To npm (for `npx repodigest`)

1. Create npm account: https://www.npmjs.com/signup
2. Verify email and enable 2FA in npm account settings.
3. Login locally:
```bash
npm login
```
4. Publish workspace packages in order:
```bash
npm run build
npm publish --workspace packages/core --access public
npm publish --workspace packages/provider-github --access public
npm publish --workspace packages/provider-git --access public
npm publish --workspace packages/renderer-internal --access public
npm publish --workspace packages/renderer-threads --access public
npm publish --workspace packages/renderer-x --access public
npm publish --workspace packages/cli --access public
```
Note: current internal dependencies use `@oceanads/*`. You must own that npm scope (or rename scopes before publishing).
5. Verify:
```bash
npx -y repodigest --help
```

## Docs

- Config: `docs/CONFIG.md`
- Plugins: `docs/PLUGINS.md`
- KPI: `docs/KPI.md`
- npm publish guide (zh-TW): `docs/NPM_PUBLISH.zh-TW.md`

## License

MIT. See `LICENSE`.
