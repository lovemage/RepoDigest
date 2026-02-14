# RepoDigest

Generate standup-ready markdown digests from GitHub repository activity.

## About

RepoDigest collects recent GitHub issue/PR activity, classifies work status, and renders a readable digest for daily standups.

The current implementation focuses on a reliable CLI workflow:
- initialize project config
- validate config/token setup
- generate `today` and `range` digests

## Features

- Interactive setup with `repodigest init`
- Config validation with Zod (`.repodigest.yml`)
- GitHub provider with issue/PR/milestone normalization
- Internal renderer with deterministic output + golden tests
- X renderer with deterministic thread splitting (280 chars)
- Threads renderer for build-in-public style posts
- Time-window digests:
  - `today` (last 24 hours by default)
  - `range` (custom `--since/--until`)

## Requirements

- Node.js `>= 22`
- npm `>= 10`
- A GitHub token with repo read access

## Installation (From Source)

```bash
npm install
npm run build
```

## Quick Start

1. Initialize config and optional helper files:
```bash
node packages/cli/dist/index.js init
```

One-line non-interactive install (project):
```bash
node packages/cli/dist/index.js init --project --yes --repo owner/repo
```

One-line install with browser auth in init:
```bash
node packages/cli/dist/index.js init --project --yes --repo owner/repo --token-source browser --client-id <GITHUB_OAUTH_CLIENT_ID>
```

One-line non-interactive install (agentrule global):
```bash
node packages/cli/dist/index.js init --agentrule --yes --repo owner/repo
```

2. Validate config and token:
```bash
node packages/cli/dist/index.js validate
```

Browser login (OAuth device flow, optional):
```bash
node packages/cli/dist/index.js auth login --client-id <GITHUB_OAUTH_CLIENT_ID>
```

3. Generate today digest:
```bash
node packages/cli/dist/index.js today
```

4. Generate range digest:
```bash
node packages/cli/dist/index.js range --since monday --until today
```

5. Update config quickly (for example, add repo):
```bash
node packages/cli/dist/index.js update --add-repo owner/new-repo --lang zh-TW
```

6. Remove installed files (project target):
```bash
node packages/cli/dist/index.js remove --yes
```

## Usage

### `today`

Generate a digest for recent activity (default: last 24 hours).

```bash
node packages/cli/dist/index.js today
node packages/cli/dist/index.js today --dry-run
node packages/cli/dist/index.js today --preview --target x --tone playful --lang zh-TW
node packages/cli/dist/index.js today --since yesterday --until now
```

### `range`

Generate a digest for a custom time window.

```bash
node packages/cli/dist/index.js range --since 2026-02-10 --until 2026-02-14
node packages/cli/dist/index.js range --since monday --until now --preview --target threads
node packages/cli/dist/index.js range --since monday --until today --dry-run
```

### `update`

Update `.repodigest.yml` without editing file manually.

```bash
node packages/cli/dist/index.js update --add-repo owner/repo-b --lang zh-TW
node packages/cli/dist/index.js update --remove-repo owner/repo-old --target x --tone playful
node packages/cli/dist/index.js update --agentrule --add-repo owner/global-repo
```

### `remove`

Remove RepoDigest-managed files from target (`--yes` required).

```bash
node packages/cli/dist/index.js remove --yes
node packages/cli/dist/index.js remove --agentrule --yes --keep-output
```

### `auth`

Login/logout GitHub token via browser OAuth device flow.

```bash
node packages/cli/dist/index.js auth login --client-id <GITHUB_OAUTH_CLIENT_ID>
node packages/cli/dist/index.js auth logout
```

Notes:
- Use `--token-env <KEY>` to store/remove a custom env key.
- Use `--project` or `--agentrule` to choose target root.
- You can set `REPODIGEST_GITHUB_CLIENT_ID` instead of passing `--client-id`.
- `init --token-source browser` can complete authorization during installation.

Accepted shortcuts for `--since/--until`:
- `now`
- `today`
- `yesterday`
- `monday`

## Output Files

- Daily:
  - `repodigest/daily/YYYY-MM-DD.md`
  - `repodigest/latest.md`
- Range:
  - `repodigest/range/YYYY-MM-DD_to_YYYY-MM-DD.md`
  - `repodigest/latest.md`

## Configuration

See full config reference in `docs/CONFIG.md`.
Plugin references:
- `docs/PLUGINS.md`
- `docs/LLM_PLUGIN.md`
- `docs/KPI.md`

Global install target path:
- default: `~/.agentrule/repodigest`
- override via environment variable: `AGENTRULE_HOME`

## Troubleshooting

Common first-run issues:

- `Missing GitHub token`
  - Set the token key defined in `.repodigest.yml` (`providers.github.tokenEnv`) in environment variables or `.env`.
- `scope.repos must include at least one owner/repo`
  - Add at least one repo to `.repodigest.yml`:
    `scope.repos: [owner/repo]`
- `Invalid date value` in `range`
  - Use ISO timestamp (`2026-02-14T00:00:00Z`) or supported shortcuts (`monday`, `today`, `yesterday`, `now`).

## Development

Run checks locally:

```bash
npm run typecheck
npm test
npm run build
```

Core workspace packages:
- `packages/core`
- `packages/provider-github`
- `packages/renderer-internal`
- `packages/cli`

## Roadmap

- Renderer targets for X and Threads
- Additional providers (for example, local git)
- Optional LLM summarizer plugin

## Contributing

Contributions are welcome.

See `CONTRIBUTING.md` for:
- development workflow
- triage SLA
- release note/changelog policy

## License

MIT. See `LICENSE`.
