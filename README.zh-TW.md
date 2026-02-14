# RepoDigest（技術版）

把 GitHub 的 Issue / PR 活動整理成每日 standup 摘要。

## 語言版本

- English: `README.md`
- 繁體中文（技術版）：`README.zh-TW.md`
- 繁體中文（白話版）：`README.marketing.zh-TW.md`

## 快速安裝

```bash
npm install
npm run build
node packages/cli/dist/index.js init --quick --project
```

`init --quick` 會：
1. 建立 `.repodigest.yml`
2. 走瀏覽器授權（優先使用 `gh`）
3. 若未提供 `--repo`，直接在 CLI 選擇要追蹤的 repo
4. 自動執行 `validate`

若你要跳過 repo 選單，也可直接傳入：

```bash
node packages/cli/dist/index.js init --quick --project --repo owner/repo
```

若偵測到已安裝，CLI 會讓你互動式選擇是否重新安裝。
在非互動環境可改用：

```bash
node packages/cli/dist/index.js init --quick --project --reinstall
```

## 驗證與產出

```bash
node packages/cli/dist/index.js validate
node packages/cli/dist/index.js today
node packages/cli/dist/index.js range --since monday --until today
```

輸出檔案：
- `repodigest/latest.md`
- `repodigest/daily/YYYY-MM-DD.md`
- `repodigest/range/YYYY-MM-DD_to_YYYY-MM-DD.md`

## 其他常用指令

```bash
node packages/cli/dist/index.js update --add-repo owner/new-repo
node packages/cli/dist/index.js remove --yes
node packages/cli/dist/index.js auth login
```

CLI 會先顯示瀏覽器要輸入的驗證碼，再等待你按 Enter 後開啟瀏覽器。
