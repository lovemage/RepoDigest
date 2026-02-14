# RepoDigest

敺?GitHub ?脣?摨急暑???湔?冽 standup ??Markdown ????
## 隞晶

RepoDigest ??????GitHub ??Issue / PR 瘣餃?嚗?憿極雿???銝西撓?箸?霈???交?閬?
?桀????函帘摰? CLI 瘚?嚗?- ????獢身摰?- 撽?閮剖???Token
- ?Ｙ? `today` ??`range` ??

## ?

- 雿輻 `repodigest init` 鈭?撘?憪?
- 隞?Zod 撽?閮剖?瑼?`.repodigest.yml`嚗?- GitHub provider嚗ssue / PR / Milestone 甇????
- Internal renderer嚗帘摰撓??+ golden tests嚗?- X renderer嚗摰?280 摮?銝莎?
- Threads renderer嚗uild-in-public 憸冽嚗?- ?????閬?
  - `today`嚗?閮剜?餈?24 撠?嚗?  - `range`嚗閮?`--since/--until`嚗?
## ?啣??瘙?
- Node.js `>= 22`
- npm `>= 10`
- ?瑕? repo 霈???? GitHub Token

## 摰?嚗???蝣潘?

```bash
npm install
npm run build
```

## 敹恍?憪?
1. ???身摰??舫頛瑼?嚗?```bash
node packages/cli/dist/index.js init
```

銝銵翰??鋆?init + ?汗?冽?甈?+ validate嚗?
```bash
node packages/cli/dist/index.js init --quick --project --repo owner/repo --token-source browser --client-id <GITHUB_OAUTH_CLIENT_ID>
```

銝銵?隞歹?project 摰?嚗?
```bash
node packages/cli/dist/index.js init --project --yes --repo owner/repo --token-source browser --client-id <GITHUB_OAUTH_CLIENT_ID>
```

銝銵?隞歹?摰?瘚??湔韏啁汗?冽?甈?嚗?```bash
node packages/cli/dist/index.js init --project --yes --repo owner/repo --token-source browser --client-id <GITHUB_OAUTH_CLIENT_ID>
```

銝銵?隞歹?agentrule ?典?摰?嚗?
```bash
node packages/cli/dist/index.js init --agentrule --yes --repo owner/repo
```

2. 撽?閮剖???Token嚗?```bash
node packages/cli/dist/index.js validate
```

?舫嚗汗?函??GitHub嚗Auth device flow嚗?
```bash
node packages/cli/dist/index.js auth login --client-id <GITHUB_OAUTH_CLIENT_ID>
```

3. ?Ｙ?隞??嚗?```bash
node packages/cli/dist/index.js today
```

4. ?Ｙ????閬?
```bash
node packages/cli/dist/index.js range --since monday --until today
```

5. 敹恍?啗身摰?靘??啣? repo嚗?
```bash
node packages/cli/dist/index.js update --add-repo owner/new-repo --lang zh-TW
```

6. 蝘駁撌脣?鋆?獢?project ?格?嚗?
```bash
node packages/cli/dist/index.js remove --yes
```

## 雿輻?孵?

### `today`

?Ｙ?餈?瘣餃???嚗?閮剜?餈?24 撠?嚗?
```bash
node packages/cli/dist/index.js today
node packages/cli/dist/index.js today --dry-run
node packages/cli/dist/index.js today --preview --target x --tone playful --lang zh-TW
node packages/cli/dist/index.js today --since yesterday --until now
```

### `range`

?Ｙ?????蝭?????
```bash
node packages/cli/dist/index.js range --since 2026-02-10 --until 2026-02-14
node packages/cli/dist/index.js range --since monday --until now --preview --target threads
node packages/cli/dist/index.js range --since monday --until today --dry-run
```

### `update`

銝?瑼?嚗?交??`.repodigest.yml`??
```bash
node packages/cli/dist/index.js update --add-repo owner/repo-b --lang zh-TW
node packages/cli/dist/index.js update --remove-repo owner/repo-old --target x --tone playful
node packages/cli/dist/index.js update --agentrule --add-repo owner/global-repo
```

### `remove`

蝘駁 RepoDigest 蝞∠???獢??閬?`--yes` 摰??嚗?
```bash
node packages/cli/dist/index.js remove --yes
node packages/cli/dist/index.js remove --agentrule --yes --keep-output
```

### `auth`

雿輻?汗?典???GitHub OAuth 鋆蔭瘚??餃嚗?箝?
```bash
node packages/cli/dist/index.js auth login --client-id <GITHUB_OAUTH_CLIENT_ID>
node packages/cli/dist/index.js auth logout
```

鋆?嚗?- ?舐 `--token-env <KEY>` ??閬神?交?蝘駁?憓??詨?蝔晞?- ?舐 `--project` ??`--agentrule` ???格?頝臬???- 銋隞亙?閮剖? `REPODIGEST_GITHUB_CLIENT_ID`嚗停銝?瘥活撣?`--client-id`??- ?臬 `init` ?湔雿輻 `--token-source browser`嚗?鋆?撠勗???甈?
`--since/--until` ?舀敹急?潘?
- `now`
- `today`
- `yesterday`
- `monday`

## 頛詨瑼?

- Daily嚗?  - `repodigest/daily/YYYY-MM-DD.md`
  - `repodigest/latest.md`
- Range嚗?  - `repodigest/range/YYYY-MM-DD_to_YYYY-MM-DD.md`
  - `repodigest/latest.md`

## 閮剖?瑼?
摰閮剖?隢? `docs/CONFIG.md`?? 
Plugin ?????
- `docs/PLUGINS.md`
- `docs/LLM_PLUGIN.md`
- `docs/KPI.md`

?典?摰?頝臬?嚗?- ?身嚗~/.agentrule/repodigest`
- ?舐?啣?霈閬神嚗AGENTRULE_HOME`

## ??圾

撣貉?擐活????嚗?
- `Missing GitHub token`
  - ?函憓??豢? `.env` 閮剖? `.repodigest.yml` ??`providers.github.tokenEnv` ????key??- `scope.repos must include at least one owner/repo`
  - ??`.repodigest.yml` ?喳??銝??repo嚗?憒?`scope.repos: [owner/repo]`
- `Invalid date value`嚗range`嚗?  - 雿輻 ISO ??嚗? `2026-02-14T00:00:00Z`嚗?敹急?潘?`monday`?today`?yesterday`?now`嚗?
## ?

?祆?瑼Ｘ嚗?
```bash
npm run typecheck
npm test
npm run build
```

?詨? workspace 憟辣嚗?- `packages/core`
- `packages/provider-github`
- `packages/renderer-internal`
- `packages/cli`

## 頝舐???
- X ??Threads ??renderer ???芸?
- ?游? provider嚗?憒?local git嚗?- ?舫??LLM summarizer plugin

## 鞎Ｙ

甇∟?鞎Ｙ??
隢???`CONTRIBUTING.md`嚗?- ?瘚?
- triage SLA
- release note / changelog ?輻?

## ??

MIT嚗?閬?`LICENSE`??
