# RepoDigest（白話版）

每天都在看 GitHub，卻還要手動整理 standup？  
`RepoDigest` 幫你把 Issue / PR 活動自動整理成「今天做了什麼、卡在哪、接下來要做什麼」。

你可以把它當成：
- 你的每日工作摘要機
- standup 前 30 秒快速整理器
- 發 X / Threads 的草稿產生器

## 你會得到什麼

- 不再手抄進度：自動從 GitHub 拉資料
- 重點分類好：`Due Today`、`Done`、`In Progress`、`Blocked`、`Next`
- 一次產出多版本：內部摘要、X、Threads
- 新手也能上手：一行指令就能初始化

## 3 分鐘上手

### 1) 安裝

```bash
npm install
npm run build
```

### 2) 一行初始化（專案內）

```bash
node packages/cli/dist/index.js init --project --yes --repo owner/repo
```

如果你不想手動貼 Token，可以在安裝流程直接授權：

```bash
node packages/cli/dist/index.js init --project --yes --repo owner/repo --token-source browser --client-id <GITHUB_OAUTH_CLIENT_ID>
```

### 3) 驗證設定

```bash
node packages/cli/dist/index.js validate
```

### 3.5) 不想手貼 Token？用瀏覽器登入

```bash
node packages/cli/dist/index.js auth login --client-id <GITHUB_OAUTH_CLIENT_ID>
```

### 4) 產生今天摘要

```bash
node packages/cli/dist/index.js today
```

完成後你會在這裡看到結果：
- `repodigest/latest.md`
- `repodigest/daily/YYYY-MM-DD.md`

## 每天怎麼用（超簡單）

```bash
# 看今天重點
node packages/cli/dist/index.js today

# 更新設定（新增 repo / 調整語言）
node packages/cli/dist/index.js update --add-repo owner/new-repo --lang zh-TW

# 只預覽，不寫檔
node packages/cli/dist/index.js today --dry-run

# 產生社群貼文預覽（X）
node packages/cli/dist/index.js today --preview --target x --tone calm --lang zh-TW
```

## 想看一整週

```bash
node packages/cli/dist/index.js range --since monday --until today
```

## 常見情境

- 早會前：先跑 `today`，直接貼到 standup
- 週報前：跑 `range`，快速回顧一週
- 對外分享：用 `--preview --target x` 先看貼文草稿
- 專案改版：用 `update` 快速改設定，不用手改 YAML
- 停用工具：用 `remove --yes` 一鍵移除
- 新機重裝：用 `auth login` 快速用瀏覽器完成授權

## 適合誰

- 個人開發者：每天快速回顧工作
- 小團隊：統一 standup 格式，減少溝通成本
- 開源維護者：把進度整理成可分享內容

## 下一步

- 技術版說明：`README.md`
- 繁中完整設定：`README.zh-TW.md`
- 設定細節：`docs/CONFIG.zh-TW.md`
- KPI 與驗證流程：`docs/KPI.md`

### 移除安裝（可選）

```bash
node packages/cli/dist/index.js remove --yes
```
