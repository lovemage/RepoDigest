# LLM Summarizer Plugin Safety

## Overview

RepoDigest supports an optional summarizer plugin loaded at runtime.

The core pipeline keeps rule-based summarization as default and fallback.
If plugin loading or execution fails, RepoDigest continues with rule-based highlights.

## Enable a plugin

Set one of:

- `.repodigest.yml`:
```yaml
output:
  summarizerPlugin: ./examples/plugins/sample-summarizer.mjs
```

- Environment variable:
```bash
export REPODIGEST_SUMMARIZER_PLUGIN=./examples/plugins/sample-summarizer.mjs
```

## Token handling guidance

- Never commit API keys or tokens to git.
- Store secrets in environment variables or local `.env`.
- Limit key scope to the minimum required permissions.
- Rotate keys immediately if they are exposed.

## Cost control guidance

- Set hard budgets in your LLM provider account.
- Keep prompts short and deterministic.
- Add truncation and max-token limits in plugin code.
- Cache repeated summaries when possible.
- Start with dry-run and small time windows before scaling.

## Failure behavior

- Plugin import failure: warning is logged, rule-based summarizer is used.
- Plugin runtime failure per item: that item falls back to rule-based summary.
- No plugin configured: rule-based summarizer only.

