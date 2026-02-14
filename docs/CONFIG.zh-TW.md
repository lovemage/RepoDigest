# RepoDigest 設定參考

## 設定檔位置

- 預設設定檔：`.repodigest.yml`
- 執行摘要前先驗證設定：

```bash
npx repodigest validate
```

## 最小設定

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

## 完整 schema（目前實作）

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
```

## 欄位規則

- `scope.repos`：必填，格式必須是 `owner/name`。
- `providers.github.tokenEnv`：GitHub token 的環境變數名稱。
- `providers.github.query.assignee`：可選，傳給 GitHub issues query 的 assignee 條件。
- `providers.github.query.labelsAny`：可選，label 的 OR 篩選條件。
- `output.include.links`：是否在摘要中顯示連結。
- `output.include.metrics`：是否在摘要中顯示統計列。
- `output.summarizerPlugin`：可選的自訂 summarizer plugin 模組路徑或套件名稱。

## Token 解析順序

RepoDigest 會依以下優先序讀取 GitHub token：

1. `providers.github.tokenEnv` 指定的 process env
2. 專案根目錄 `.env`

範例：

```bash
export GITHUB_TOKEN=ghp_xxx
npx repodigest validate
```

或在 `.env`：

```dotenv
GITHUB_TOKEN=ghp_xxx
```

## CLI 指令

### `init`

互動式初始化：

```bash
npx repodigest init
```

一行本專案安裝：

```bash
npx repodigest init --project --yes --repo owner/repo
```

一行 `agentrule` 全域安裝：

```bash
npx repodigest init --agentrule --yes --repo owner/repo
```

`init` 參數：

- `--project`：安裝到目前專案。
- `--agentrule`：安裝到全域 agentrule 位置。
- `--yes`：非互動模式。
- `--repo <owner/repo>`：可重複，非互動模式必填。
- `--lang <en|zh-TW|both>`
- `--timezone <IANA timezone>`
- `--token-source <env|input>`
- `--token <value>`：`--yes` 且 `--token-source input` 時必填。
- `--components <cli|ide|action|all>`：僅 project target 支援。

全域安裝根目錄：
- 預設：`~/.agentrule/repodigest`
- 可透過 `AGENTRULE_HOME` 覆寫

### `today`

預設抓最近 24 小時活動。

```bash
npx repodigest today
```

參數：

- `--dry-run`：只輸出到終端，不寫檔。
- `--preview`：預覽輸出 blocks（特別適合 `x` / `threads`）。
- `--since <value>`：覆寫起始時間。
- `--until <value>`：覆寫結束時間。
- `--target <value>`：`internal|x|threads|markdown`
- `--tone <value>`：`calm|playful|hacker|formal`
- `--lang <value>`：`en|zh-TW|both`

範例：

```bash
npx repodigest today --dry-run
npx repodigest today --preview --target x --tone playful --lang zh-TW
npx repodigest today --since 2026-02-14T00:00:00Z --until 2026-02-14T23:59:59Z
npx repodigest today --since yesterday --until now
```

輸出檔案：

- `repodigest/daily/YYYY-MM-DD.md`
- `repodigest/latest.md`

### `range`

抓取自訂時間區間。`--since` 為必填。

```bash
npx repodigest range --since 2026-02-10 --until 2026-02-14
```

參數：

- `--since <value>`：必填起始時間。
- `--until <value>`：可選結束時間（預設 `now`）。
- `--dry-run`：只輸出到終端，不寫檔。
- `--preview`：預覽輸出 blocks。
- `--target <value>`：`internal|x|threads|markdown`
- `--tone <value>`：`calm|playful|hacker|formal`
- `--lang <value>`：`en|zh-TW|both`

範例：

```bash
npx repodigest range --since monday --until today
npx repodigest range --since monday --until now --preview --target threads
npx repodigest range --since 2026-02-01T00:00:00Z --until 2026-02-14T23:59:59Z --dry-run
```

輸出檔案：

- `repodigest/range/YYYY-MM-DD_to_YYYY-MM-DD.md`
- `repodigest/latest.md`

## 日期快捷字

`--since` / `--until` 目前支援：

- `now`
- `today`
- `yesterday`
- `monday`

在自動化環境建議使用 ISO 時間（例如 `2026-02-14T00:00:00Z`）以確保可重現性。

## Plugin 文件

- `docs/PLUGINS.md`
- `docs/LLM_PLUGIN.md`
- `docs/KPI.md`
