# Contributing to RepoDigest

Thanks for contributing. This document describes the minimum workflow for issues, PRs, and releases.

## Development Setup

```bash
npm install
npm run typecheck
npm test
npm run build
```

## Pull Request Guidelines

- Keep PRs focused on one problem.
- Include tests for behavior changes.
- Update docs when CLI/config/output behavior changes.
- Use the PR template and include a short release note summary.

## Issue Triage SLA

- Maintainers target first response within 48 hours.
- Security-sensitive reports should go through `SECURITY.md`.

## Labeling Policy

- `bug`: confirmed defects
- `enhancement`: user-facing improvements
- `good first issue`: suitable for first-time contributors

## Changelog and Release Notes Policy

- Each PR should include a release note summary in its description.
- Release notes are grouped by:
  - Added
  - Changed
  - Fixed
- Breaking changes must include migration notes.

## Commit/PR Quality Gate

Before requesting review, run:

```bash
npm run typecheck
npm test
npm run build
```

## Code of Conduct

By participating, you agree to `CODE_OF_CONDUCT.md`.

