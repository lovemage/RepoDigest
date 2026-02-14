# Security Policy

## Supported Versions

RepoDigest is pre-1.0. Security fixes are applied to the latest main branch.

## Reporting a Vulnerability

Do not open public issues for security vulnerabilities.

Please report privately with:
- affected version or commit SHA
- impact summary
- reproduction steps
- proof-of-concept (if available)

Response targets:
- Acknowledgment within 48 hours
- Initial assessment within 7 days

## Secret Handling

- Never commit real tokens to repository files.
- Use environment variables or local `.env` only.
- Rotate compromised tokens immediately.

