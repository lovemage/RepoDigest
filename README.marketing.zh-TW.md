# RepoDigest（白話版）

每天一鍵，把你在 GitHub 做的事變成 standup 摘要。  
就算你沒有 Issue / PR，只用 Commit 也能用。

## 語言版本

- English: `README.md`
- 繁體中文（技術版）：`README.zh-TW.md`
- 繁體中文（白話版）：`README.marketing.zh-TW.md`

## 一行就能安裝

```bash
npx repodigest@latest init --quick --project
```

不用先安裝套件、不用先 build，直接一行開始。

（只有在你要開發這個專案本身時，才需要 `npm install` + `npm run build`）

這個流程會自動完成：
1. 建立設定檔
2. GitHub 瀏覽器授權
3. 在 CLI 勾選追蹤 repo（預設先選 1 個）
4. 驗證設定可用

## 每天使用

```bash
npx repodigest today

# 今天熱門新 repo 摘要
npx repodigest trending --wizard

# 今天 commit 給客戶看（自然語氣）
npx repodigest sum cus

# 今天 commit 給團隊/主管看（專業語氣）
npx repodigest sum team

# 你自己的自訂對象
npx repodigest sum <profile>
```

## 其他常用

```bash
npx repodigest validate
npx repodigest update --add-repo owner/new-repo
npx repodigest remove --yes
```
