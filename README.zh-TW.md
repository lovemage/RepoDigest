# RepoDigest（技術版）

將 GitHub 的 Issue / PR / Commit 活動整理成每日 standup 摘要。

## 語言版本

- English: `README.md`
- 繁體中文（技術版）：`README.zh-TW.md`
- 繁體中文（白話版）：`README.marketing.zh-TW.md`

## 快速開始

```bash
npm install
npm run build
npx repodigest init --quick --project
```

`init --quick` 會：
1. 建立 `.repodigest.yml`
2. 完成 GitHub 瀏覽器授權
3. 若未提供 `--repo`，在 CLI 勾選要追蹤的 repo
4. 自動執行 `validate`

## 常用指令

```bash
npx repodigest today
npx repodigest range --since monday --until today
npx repodigest validate
npx repodigest update --add-repo owner/new-repo
npx repodigest remove --yes
npx repodigest auth login
```
