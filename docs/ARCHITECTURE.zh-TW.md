# RepoDigest 架構說明

## 概觀

RepoDigest 是以 workspace 組成的 monorepo，目標是把 repo 活動轉成可讀的摘要 Markdown。

目前管線：
`Collect -> Normalize -> Classify -> Summarize -> Render -> Write`

## 套件結構

- `packages/core`
- `packages/provider-github`
- `packages/renderer-internal`
- `packages/cli`

## 資料流程

1. CLI 讀取 `.repodigest.yml` 與 token。
2. Provider 抓取 GitHub issues、PR、milestones。
3. Provider 將 API 回傳正規化為 `Event[]`。
4. Core 將事件聚合為 `WorkItem[]`。
5. Core 規則處理 due date 與 status。
6. Core summarizer 產生 highlights。
7. Renderer 將 `Digest` 轉成 markdown。
8. Writer 寫入 `repodigest/` 輸出檔案。

## 核心資料模型

- `Event`
- Provider 層級的活動紀錄。
- 正規化欄位包含 type、title/body、labels、milestone、timestamp、URL。

- `WorkItem`
- 由多個相關 events 聚合出的工作單位。
- 含 status、due、highlights 與 evidence。

- `Digest`
- 最終結構化摘要。
- 包含區塊（`Due Today`、`Done`、`In Progress`、`Blocked`、`Next`）與統計數字。

## Pipeline 職責

- `Collect`
- Provider 在指定時間區間抓取事件。

- `Normalize`
- 將 provider payload 轉成穩定的 `Event[]`。

- `Classify`
- 解析 due 並推斷工作狀態。

- `Summarize`
- 由標題與近期 evidence 產生簡短重點。

- `Render`
- 將 digest 轉換為目標輸出文字。

## 規則引擎

### Due Resolver 優先序

1. Milestone due date
2. Label pattern（例如 `due:YYYY-MM-DD`、`due/today`）
3. Issue/PR 內文 frontmatter
4. 無 due

### Status Classifier 優先序

1. `done`：close/merge/release 事件
2. `blocked`：label/frontmatter/阻塞關鍵訊號
3. `planned`：next/planned labels
4. `in_progress`：一般活躍事件
5. `unknown`

## Provider 層

`packages/provider-github` 目前提供：

- Octokit client wrapper
- fetch 參數（`repos`、`since`、`until`、`assignee`、`labelsAny`）
- 正規化事件輸出
- 具體可行的 token / rate-limit 錯誤訊息

Provider 抽象可支援後續擴充，不需要修改 core 型別。

## Renderer 層

`packages/renderer-internal` 提供穩定輸出：

- 固定 section 順序
- 可選 link
- 可選 metrics
- golden tests 鎖定格式回歸

## CLI 層

`packages/cli` 負責：

- 初始化精靈（`repodigest init`）
- 設定驗證（`repodigest validate`）
- 執行命令（`repodigest today`、`repodigest range`）
- 輸出寫檔（`daily`、`range`、`latest`）

## 品質門檻

- 型別：TypeScript strict mode
- 單元測試：core rules + pipeline
- Golden tests：renderer 格式鎖定
- 整合測試：CLI 指令行為
- CI：`lint`、`typecheck`、`test`、`build`

## 擴充點

- 新 provider：實作事件收集與正規化
- 新 renderer：消費 `Digest` 並輸出目標格式
- 可選 plugin：未來支援進階 summarizer

