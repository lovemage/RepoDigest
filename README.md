# RepoDigest

Generate standup-ready markdown digests from GitHub repository activity.

## What It Does

RepoDigest collects recent GitHub issue/PR activity, classifies status (`Done`, `In Progress`, `Blocked`, `Next`, `Due Today`), and renders output for:
- internal markdown standups
- X threads
- Threads posts

## System Dependencies

Install these first:
- Git
- Node.js `>= 22`
- npm `>= 10` (usually bundled with Node.js)

Version checks:
```bash
git --version
node --version
npm --version
```

## Project Setup (From Source)

1. Clone:
```bash
git clone https://github.com/lovemage/RepoDigest.git
cd RepoDigest
```

2. Install workspace dependencies:
```bash
npm install
```

3. Build:
```bash
npm run build
```

4. (Optional but recommended) verify local quality checks:
```bash
npm run typecheck
npm test
```

## Fastest Install Flow

One command for init + browser auth + config validation:
```bash
node packages/cli/dist/index.js init --quick --project --repo owner/repo --token-source browser --client-id <GITHUB_OAUTH_CLIENT_ID>
```

## GitHub Token: How To Obtain And Verify

### Option A (Recommended): Browser OAuth login from CLI

Use OAuth Device Flow:
```bash
node packages/cli/dist/index.js auth login --client-id <GITHUB_OAUTH_CLIENT_ID>
```

Or do it directly during init:
```bash
node packages/cli/dist/index.js init --project --yes --repo owner/repo --token-source browser --client-id <GITHUB_OAUTH_CLIENT_ID>
```

### Option B: Personal Access Token (PAT)

1. Go to GitHub settings and create a token with repo read permission.
2. Put token in `.env`:
```dotenv
GITHUB_TOKEN=ghp_xxx_or_github_pat_xxx
```
3. Ensure `.repodigest.yml` uses the same key:
```yaml
providers:
  github:
    tokenEnv: GITHUB_TOKEN
```

### Verify Token Is Actually Working

Run:
```bash
node packages/cli/dist/index.js validate
```

Expected result:
- `Config is valid.`
- no missing token error

Then run a real fetch:
```bash
node packages/cli/dist/index.js today --dry-run
```

If token or repo permission is wrong, this command will fail with actionable errors.

## Quick Start

Interactive setup:
```bash
node packages/cli/dist/index.js init
```

Non-interactive project install:
```bash
node packages/cli/dist/index.js init --project --yes --repo owner/repo
```

Generate digest:
```bash
node packages/cli/dist/index.js today
node packages/cli/dist/index.js range --since monday --until today
```

## CLI Commands

`today`:
```bash
node packages/cli/dist/index.js today
node packages/cli/dist/index.js today --dry-run
node packages/cli/dist/index.js today --preview --target x --tone playful --lang zh-TW
```

`range`:
```bash
node packages/cli/dist/index.js range --since 2026-02-10 --until 2026-02-14
node packages/cli/dist/index.js range --since monday --until now --preview --target threads
```

`update`:
```bash
node packages/cli/dist/index.js update --add-repo owner/repo-b --lang zh-TW
node packages/cli/dist/index.js update --remove-repo owner/repo-old --target x --tone playful
```

`remove`:
```bash
node packages/cli/dist/index.js remove --yes
node packages/cli/dist/index.js remove --agentrule --yes --keep-output
```

`auth`:
```bash
node packages/cli/dist/index.js auth login --client-id <GITHUB_OAUTH_CLIENT_ID>
node packages/cli/dist/index.js auth logout
```

## Date Shortcuts

Supported for `--since` / `--until`:
- `now`
- `today`
- `yesterday`
- `monday`

## Output Files

Daily output:
- `repodigest/daily/YYYY-MM-DD.md`
- `repodigest/latest.md`

Range output:
- `repodigest/range/YYYY-MM-DD_to_YYYY-MM-DD.md`
- `repodigest/latest.md`

## Documentation

- `docs/CONFIG.md`
- `docs/PLUGINS.md`
- `docs/LLM_PLUGIN.md`
- `docs/KPI.md`
- `README.zh-TW.md`
- `README.marketing.zh-TW.md`

## Troubleshooting

`Missing GitHub token`:
- set token in environment or `.env`
- check key matches `providers.github.tokenEnv`

`scope.repos must include at least one owner/repo`:
- add at least one repo in `.repodigest.yml`

`Invalid date value`:
- use ISO timestamp like `2026-02-14T00:00:00Z`
- or supported shortcuts (`monday`, `today`, `yesterday`, `now`)

## Contributing

See `CONTRIBUTING.md`.

## License

MIT. See `LICENSE`.
