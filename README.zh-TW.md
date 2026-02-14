# RepoDigest（技術版）

將 GitHub 的 Issue / PR / Commit 活動整理成每日 standup 摘要。

## 語言版本

- English: `README.md`
- 繁體中文（技術版）：`README.zh-TW.md`
- 繁體中文（白話版）：`README.marketing.zh-TW.md`

## 快速開始

```bash
npx repodigest@latest init --quick --project
```

第一次使用不需要先 `npm install` 或 `npm run build`。

若你是此 repo 的開發者，才需要：

```bash
npm install
npm run build
```

`init --quick` 會：
1. 建立 `.repodigest.yml`
2. 完成 GitHub 瀏覽器授權
3. 若未提供 `--repo`，在 CLI 勾選要追蹤的 repo（預設先勾 1 個）
4. 自動執行 `validate`

## 常用指令

```bash
npx repodigest today
npx repodigest range --since monday --until today
npx repodigest trending --wizard
npx repodigest trending --lang zh-TW --limit 10
npx repodigest sum cus
npx repodigest sum team
npx repodigest sum myboss
npx repodigest sum <profile>
npx repodigest validate
npx repodigest update --add-repo owner/new-repo
npx repodigest remove --yes
npx repodigest auth login
```

`init` 安裝精靈已擴充：
- 可設定 `sum` 預設摘要對象（`team` / `cus`）
- 可設定 GitHub 帳號（只摘要自己的 commit）
- 可選擇是否啟用 AI（OpenAI 相容 API）並設定 `baseUrl`、`model`、`apiKeyEnv`
