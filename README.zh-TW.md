# RepoDigest（繁中技術版）

將 GitHub 活動自動整理成 standup 摘要。

## 版本導覽

- 英文版（首頁）: `README.md`
- 繁中技術版（本頁）: `README.zh-TW.md`
- 繁中白話版: `README.marketing.zh-TW.md`

## 功能摘要

- 從 GitHub 收集 Issue / PR 活動
- 自動分類：`Due Today`、`Done`、`In Progress`、`Blocked`、`Next`
- 多輸出目標：`internal`、`x`、`threads`
- CLI 指令：`init`、`validate`、`today`、`range`、`update`、`remove`、`auth`

## 安裝

```bash
npm install
npm run build
```

## 最快啟用（推薦）

```bash
node packages/cli/dist/index.js init --quick --project --repo owner/repo
```

這個流程會自動：
1. 產生 `.repodigest.yml`
2. 走瀏覽器授權（優先使用 `gh`）
3. 執行 `validate`

## 授權（僅瀏覽器）

```bash
node packages/cli/dist/index.js auth login
```

若你未安裝 `gh`，可改用：

```bash
node packages/cli/dist/index.js auth login --client-id <GITHUB_OAUTH_CLIENT_ID>
```

## 驗證與執行

```bash
node packages/cli/dist/index.js validate
node packages/cli/dist/index.js today
node packages/cli/dist/index.js range --since monday --until today
```

## 其他常用指令

```bash
node packages/cli/dist/index.js update --add-repo owner/new-repo --lang zh-TW
node packages/cli/dist/index.js remove --yes
```

## 文件

- 設定：`docs/CONFIG.md`
- Plugin：`docs/PLUGINS.md`
- KPI：`docs/KPI.md`

## 授權條款

MIT，請見 `LICENSE`。
