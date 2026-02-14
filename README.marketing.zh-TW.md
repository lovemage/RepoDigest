# RepoDigest（白話版）

每天一鍵，把你在 GitHub 做的事變成 standup 摘要。  
就算你沒有 Issue / PR，只用 Commit 也能用。

## 語言版本

- English: `README.md`
- 繁體中文（技術版）：`README.zh-TW.md`
- 繁體中文（白話版）：`README.marketing.zh-TW.md`

## 3 分鐘上手

```bash
npm install
npm run build
npx repodigest init --quick --project
```

這個流程會自動完成：
1. 建立設定檔
2. GitHub 瀏覽器授權
3. 在 CLI 勾選追蹤 repo
4. 驗證設定可用

## 每天使用

```bash
npx repodigest today
```

## 其他常用

```bash
npx repodigest validate
npx repodigest update --add-repo owner/new-repo
npx repodigest remove --yes
```
