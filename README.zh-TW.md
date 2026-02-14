# RepoDigest

從 GitHub 儲存庫活動產生可直接用於 standup 的 Markdown 摘要。

## 介紹

RepoDigest 會蒐集近期 GitHub 的 Issue / PR 活動，分類工作狀態，並輸出易讀的每日摘要。

目前版本聚焦在穩定的 CLI 流程：
- 初始化專案設定
- 驗證設定與 Token
- 產生 `today` 與 `range` 摘要

## 功能

- 使用 `repodigest init` 互動式初始化
- 以 Zod 驗證設定檔（`.repodigest.yml`）
- GitHub provider（Issue / PR / Milestone 正規化）
- Internal renderer（穩定輸出 + golden tests）
- X renderer（固定 280 字拆串）
- Threads renderer（build-in-public 風格）
- 時間區間摘要：
  - `today`（預設最近 24 小時）
  - `range`（自訂 `--since/--until`）

## 環境需求

- Node.js `>= 22`
- npm `>= 10`
- 具備 repo 讀取權限的 GitHub Token

## 安裝（從原始碼）

```bash
npm install
npm run build
```

## 快速開始

1. 初始化設定與可選輔助檔案：
```bash
node packages/cli/dist/index.js init
```

一行快速安裝（init + 瀏覽器授權 + validate）：
```bash
node packages/cli/dist/index.js init --quick --project --repo owner/repo --token-source browser --client-id <GITHUB_OAUTH_CLIENT_ID>
```

一行指令（project 安裝）：
```bash
node packages/cli/dist/index.js init --project --yes --repo owner/repo
```

一行指令（安裝流程直接走瀏覽器授權）：
```bash
node packages/cli/dist/index.js init --project --yes --repo owner/repo --token-source browser --client-id <GITHUB_OAUTH_CLIENT_ID>
```

一行指令（agentrule 全域安裝）：
```bash
node packages/cli/dist/index.js init --agentrule --yes --repo owner/repo
```

2. 驗證設定與 Token：
```bash
node packages/cli/dist/index.js validate
```

可選：瀏覽器登入 GitHub（OAuth device flow）：
```bash
node packages/cli/dist/index.js auth login --client-id <GITHUB_OAUTH_CLIENT_ID>
```

3. 產生今日摘要：
```bash
node packages/cli/dist/index.js today
```

4. 產生區間摘要：
```bash
node packages/cli/dist/index.js range --since monday --until today
```

5. 快速更新設定（例如新增 repo）：
```bash
node packages/cli/dist/index.js update --add-repo owner/new-repo --lang zh-TW
```

6. 移除已安裝檔案（project 目標）：
```bash
node packages/cli/dist/index.js remove --yes
```

## 使用方式

### `today`

產生近期活動摘要（預設最近 24 小時）。

```bash
node packages/cli/dist/index.js today
node packages/cli/dist/index.js today --dry-run
node packages/cli/dist/index.js today --preview --target x --tone playful --lang zh-TW
node packages/cli/dist/index.js today --since yesterday --until now
```

### `range`

產生指定時間範圍摘要。

```bash
node packages/cli/dist/index.js range --since 2026-02-10 --until 2026-02-14
node packages/cli/dist/index.js range --since monday --until now --preview --target threads
node packages/cli/dist/index.js range --since monday --until today --dry-run
```

### `update`

不用手改檔案，直接更新 `.repodigest.yml`。

```bash
node packages/cli/dist/index.js update --add-repo owner/repo-b --lang zh-TW
node packages/cli/dist/index.js update --remove-repo owner/repo-old --target x --tone playful
node packages/cli/dist/index.js update --agentrule --add-repo owner/global-repo
```

### `remove`

移除 RepoDigest 管理的檔案（需要 `--yes` 安全旗標）。

```bash
node packages/cli/dist/index.js remove --yes
node packages/cli/dist/index.js remove --agentrule --yes --keep-output
```

### `auth`

使用瀏覽器完成 GitHub OAuth 裝置流程登入／登出。

```bash
node packages/cli/dist/index.js auth login --client-id <GITHUB_OAUTH_CLIENT_ID>
node packages/cli/dist/index.js auth logout
```

補充：
- 可用 `--token-env <KEY>` 指定要寫入或移除的環境變數名稱。
- 可用 `--project` 或 `--agentrule` 指定目標路徑。
- 也可以先設定 `REPODIGEST_GITHUB_CLIENT_ID`，就不必每次帶 `--client-id`。
- 可在 `init` 直接使用 `--token-source browser`，安裝時就完成授權。

`--since/--until` 支援快捷值：
- `now`
- `today`
- `yesterday`
- `monday`

## 輸出檔案

- Daily：
  - `repodigest/daily/YYYY-MM-DD.md`
  - `repodigest/latest.md`
- Range：
  - `repodigest/range/YYYY-MM-DD_to_YYYY-MM-DD.md`
  - `repodigest/latest.md`

## 設定檔

完整設定請見 `docs/CONFIG.md`。  
Plugin 與擴充參考：
- `docs/PLUGINS.md`
- `docs/LLM_PLUGIN.md`
- `docs/KPI.md`

全域安裝路徑：
- 預設：`~/.agentrule/repodigest`
- 可用環境變數覆寫：`AGENTRULE_HOME`

## 疑難排解

常見首次啟動問題：

- `Missing GitHub token`
  - 在環境變數或 `.env` 設定 `.repodigest.yml` 內 `providers.github.tokenEnv` 指定的 key。
- `scope.repos must include at least one owner/repo`
  - 在 `.repodigest.yml` 至少加入一個 repo，例如：`scope.repos: [owner/repo]`
- `Invalid date value`（`range`）
  - 使用 ISO 時間（如 `2026-02-14T00:00:00Z`）或快捷值（`monday`、`today`、`yesterday`、`now`）。

## 開發

本機檢查：

```bash
npm run typecheck
npm test
npm run build
```

核心 workspace 套件：
- `packages/core`
- `packages/provider-github`
- `packages/renderer-internal`
- `packages/cli`

## 路線圖

- X 與 Threads 的 renderer 持續優化
- 更多 provider（例如 local git）
- 可選的 LLM summarizer plugin

## 貢獻

歡迎貢獻。

請參考 `CONTRIBUTING.md`：
- 開發流程
- triage SLA
- release note / changelog 政策

## 授權

MIT，請見 `LICENSE`。
