0) 專案定位與命名
一句話

RepoDigest：把今天的 repo 狀態自動整理成 Standup + 社群貼文（X/Threads）可直接貼上的摘要。

GitHub repo 名稱（推薦）

repodigest（首選，最像產品名）

repo-digest（同義、也 OK）

npm package 建議避開撞名：@repodigest/cli 或 repodigest-cli

1) 核心理念：Pipeline 架構（收集 → 標準化 → 分類 → 摘要 → 渲染）

整個系統是一條可組裝 pipeline：

Collect：從多個 Provider 拉資料（GitHub / git / …）

Normalize：轉成統一事件格式（Event）

Classify：用 Rules 判斷 done / in-progress / blocked / next / due-today

Summarize：把事件轉成可讀的 bullets（可選 LLM、也可純規則）

Render：輸出成 target 格式（internal / X / Threads / Markdown）

關鍵：Provider 只負責拿資料；Renderer 只負責排版；中間靠 Core 資料模型與規則引擎串起來，擴充最不痛。

2) 目錄與套件分層（Monorepo 推薦）
repodigest/
  packages/
    core/                 # 資料模型 + pipeline + rule engine
    cli/                  # 指令列入口、讀 config、組 pipeline
    provider-github/      # GitHub provider (GraphQL/REST)
    provider-git/         # local git provider
    renderer-internal/    # internal standup renderer
    renderer-x/           # X renderer + thread splitter
    renderer-threads/     # Threads renderer
    renderer-markdown/    # 可選：輸出到 md (README/daily log)
  examples/
    repodigest.yml
  docs/
    ARCHITECTURE.md
    CONFIG.md
  .github/workflows/
  README.md
  LICENSE


這樣開源協作最好：別人想加 Jira provider、就新增 provider-jira package，不會動到 core。

3) Core 資料模型（最重要，先定死，後面都好做）
3.1 Event：所有來源統一格式
type EventType =
  | "issue_created" | "issue_closed" | "issue_commented"
  | "pr_opened" | "pr_merged" | "pr_reviewed"
  | "commit" | "release"
  | "note"; // 手動補充

type Event = {
  id: string;                 // provider scoped
  provider: string;           // github / git / ...
  repo?: string;              // owner/name
  type: EventType;
  title?: string;             // issue/pr title
  body?: string;              // excerpt
  url?: string;
  author?: string;
  timestamp: string;          // ISO
  labels?: string[];
  milestone?: { title: string; dueOn?: string | null };
  fields?: Record<string, any>; // provider-specific
};

3.2 WorkItem：把事件聚合成「工作單位」

同一個 issue/PR 的多個事件要合併（不然很吵）。

type WorkKind = "issue" | "pr" | "commit" | "release" | "note";

type WorkItem = {
  key: string;        // e.g. github:owner/repo#123 或 git:sha
  kind: WorkKind;
  repo?: string;
  title: string;
  url?: string;
  labels?: string[];
  due?: string | null;
  status: "done" | "in_progress" | "blocked" | "planned" | "unknown";
  highlights: string[];     // 重要變更摘要（短句）
  evidence: Event[];        // 原始事件
  stackHints?: string[];    // 推測技術棧（可關閉）
};

3.3 Digest：輸出前的統一摘要
type Digest = {
  date: string;              // local date (Asia/Taipei)
  timezone: string;
  scope: { repos?: string[]; user?: string; team?: string };
  stats: { done: number; inProgress: number; blocked: number; dueToday: number };
  sections: {
    dueToday: WorkItem[];
    done: WorkItem[];
    inProgress: WorkItem[];
    blocked: WorkItem[];
    next: WorkItem[];
    notes: string[];
  };
  stack?: string[];          // 最終要不要顯示由 renderer 決定
};

4) Rule Engine：怎麼判斷「今日截止 / done / blocked」
4.1 due 的來源（可多個策略併用）

你要支援「開發階段下達指令 → 今日截止摘要」，所以 due 判定要很彈性：

DueResolver（策略鏈）

milestone due date（GitHub milestone 的 dueOn）

label pattern：due:YYYY-MM-DD、due/today、deadline:YYYY-MM-DD

issue/pr body frontmatter（建議你推）：

---
due: 2026-02-14
stack: [nextjs, postgres]
status: blocked
---


fallback：無 due

實務上我最推 label + frontmatter，對開源用戶最容易上手。

4.2 Status 的判斷（可覆寫）

StatusClassifier

done：issue closed、PR merged、release published

in_progress：有最近 commit/PR 更新但未 close

blocked：label blocked / frontmatter status: blocked / 有 comment 含關鍵詞（可選）

planned/next：label next / milestone upcoming / project board（後續再加）

規則引擎設計成「可配置的規則優先序」：

type Rule = (item: WorkItem, ctx: Context) => Partial<WorkItem> | null;

5) Summarizer：摘要生成（規則版 + 可選 LLM）

你開源要好用，不能強依賴 LLM，所以做兩層：

5.1 Rule-based Summarizer（預設）

highlights 來源：

PR title

commit message top 1–3

issue title + last comment excerpt

句型模板（可多語系）：

Fix ...

Add ...

Refactor ...

Investigate ...

5.2 LLM Summarizer（可選）

只有在使用者提供 OPENAI_API_KEY 或其他 provider 才啟用

只餵「已清洗過的內容」避免 token 爆炸

支援 tone、語言、技術棧顯示等指示

必須可完全關閉

開源最佳做法：LLM 是 plugin，不要寫死 core。

6) Renderer：internal / X / Threads 三條輸出線

Renderer input 永遠是 Digest，output 是字串（或多段）。

type RenderResult = { blocks: string[]; meta?: any };
type Renderer = (digest: Digest, options: RenderOptions) => RenderResult;

6.1 Internal renderer（standup）

格式建議固定欄位（方便團隊看）：

✅ Done

⏳ In progress

🚧 Blocked

🎯 Next

⏰ Due today（放最前）

可選：附連結（issue/pr URL）

6.2 X renderer（280 限制 + Thread splitter）

核心是 thread 切分器：

先把 blocks 依序組成段落

超過 280 就切成多則

每則可加 (1/3) 之類（可設定）

6.3 Threads renderer（較長 + 更口語）

允許更像「build in public」的敘事

可加：

今天學到什麼（如果 notes 或 LLM 有）

明天要做什麼

仍然維持 digest 的 sections 對應

7) Config 設計（.repodigest.yml）

你要做到「可自定義是否要寫出技術棧 / 語氣 /」，config 必須能控制：

provider（來源）

due / status 規則

mode + target

tone + lang + length

include/exclude（stack、links、metrics）

範例：

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
      labelsAny: ["today", "standup"]
  git:
    enabled: true
    repoPath: "."

rules:
  due:
    - milestone
    - label: "due:(\\d{4}-\\d{2}-\\d{2})"
    - frontmatter: "due"
  status:
    blockedLabels: ["blocked", "stuck"]
    nextLabels: ["next"]

output:
  mode: public         # internal|public
  target: x            # x|threads|internal|markdown
  lang: zh-TW
  tone: calm           # calm|playful|hacker|formal
  length: short        # short|medium|long
  include:
    stack: false
    links: true
    metrics: true
  thread:
    enabled: true
    numbering: "1/3"

8) CLI 設計（指令就是產品）
8.1 核心命令

repodigest today

repodigest range --since 2026-02-01 --until 2026-02-14

repodigest config init（生成範例 config）

repodigest validate（檢查 token、query、regex）

8.2 參數覆寫（CLI > config）

--mode internal|public

--target x|threads|internal|markdown

--tone ...

--include stack|links|metrics

--lang zh-TW|en

--dry-run（不呼叫 LLM、不寫檔）

--output file（輸出到檔案）

9) GitHub Action（官方範例，但不幫你發文）

Action 做三件事：

scheduled cron 每天跑

產生 daily/YYYY-MM-DD.md 或 comment 到固定 issue

上傳 artifact（讓你 copy）

發文（X/Threads API）留給使用者自己串，避免權限與濫用風險。

10) 測試與品質：開源一定要硬

Core：

due resolver regex 測試

thread splitter 測試（280 邊界）

classifier 規則優先序

Provider：

GitHub API 用 mock fixtures

Golden tests：

給固定輸入 events → 期待輸出文字完全一致（非常重要）

11) 發布與版本策略

npm：@repodigest/cli

版本：SemVer

Release notes：用 renderer-markdown 產出 changelog（順便 dogfood）

12) 開源治理：讓人敢用、敢 PR

LICENSE：MIT（工具類最普遍）

CONTRIBUTING.md：如何加 provider / renderer

SECURITY.md：token 使用注意、回報方式

Code of Conduct（可選）

13) 你可以照這個 Roadmap 做（完整架構，但分階段落地）
Phase 1（架構落地）

core（Event/WorkItem/Digest + pipeline）

provider-github（issues/pr/milestone）

renderer-internal + renderer-x

config loader + validate

Phase 2（雙定位完整）

renderer-threads

thread splitter 強化（標點/emoji/連結計算）

rule-based summarizer 完整

Phase 3（擴充）

provider-git

LLM summarizer plugin（可選）

GitHub Action 範例

如果你要我下一步直接把「專案骨架」也一口氣定下來（包含 package.json、tsconfig、CLI entry、core interface、plugin 註冊方式、config schema、測試框架選擇），我可以直接把：

✅ ARCHITECTURE.md

✅ CONFIG.md

✅ .repodigest.yml example

✅ CLI command spec（含參數表）

✅ package layout（每個 package 的責任與 public API）

整理成可以直接貼進 repo 的文本。