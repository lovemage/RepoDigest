# RepoDigest（白話版）

每天一鍵，把你在 GitHub 做的事變成可貼到 standup 的摘要。

## 語言版本

- English: `README.md`
- 繁體中文（技術版）：`README.zh-TW.md`
- 繁體中文（白話版）：`README.marketing.zh-TW.md`

## 3 分鐘上手

```bash
npm install
npm run build
node packages/cli/dist/index.js init --quick --project
```

這個指令會自動做完：
1. 建好設定檔
2. 開瀏覽器完成 GitHub 授權
3. 在 CLI 直接勾選你要追蹤的 repo（可不先輸入 repo 名稱）
4. 幫你檢查設定可用

如果偵測到你之前裝過，CLI 會直接問你要不要「重新安裝並清掉舊的產出檔」。
非互動環境可用：

```bash
node packages/cli/dist/index.js init --quick --project --reinstall
```

## 每天使用

```bash
node packages/cli/dist/index.js today
```

你會拿到：
- `Due Today`
- `Done`
- `In Progress`
- `Blocked`
- `Next`

## 常用指令

```bash
# 檢查設定
node packages/cli/dist/index.js validate

# 加 repo
node packages/cli/dist/index.js update --add-repo owner/new-repo

# 移除安裝檔
node packages/cli/dist/index.js remove --yes
```

授權時，CLI 會先顯示要輸入到瀏覽器的驗證碼，按 Enter 才會開瀏覽器。
