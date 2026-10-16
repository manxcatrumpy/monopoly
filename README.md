# 福慧大富翁 Dashboard

iPad 主持人控制台 — 純前端 PWA，無後端、可離線、可加到主畫面。目前版本 **v1.7.6（build 68）**。

## 功能

- 開新局：4–6 人、十面骰決定每人初始福/慧、最高者擲白×黑訂文明高度（白骰 × 黑骰 ＋ 玩家人數 × 10）
- 玩家卡：福報 / 智慧 / 文明只讀顯示；改分走加減分（可勾「這是本輪行動」）；起始點經過／停格一鍵加分（同時標記本輪已行動）
- 里程提醒（達標跳 Toast、記日誌、列入待抽卡）：
  - 領航者：全場首位福慧雙達 10 / 20 / 30，各抽 1 張
  - 自我突破：任一玩家福慧雙達 12 / 22，各抽 1 張
  - 單項 30：每人首次單項達標抽 1 張卡；畢業需雙項皆達標
- 畢業：福慧皆 ≥ 30（戴帽 + 金色光暈）；回落自動降級
- 勝利：集體文明達標，或全員畢業；綜合分 ＝ 福 ＋ 慧 ＋ 文明×2
- 輪次：已行動或本輪跳過皆算處理完，全員完成自動進下一輪；只剩一位未走卻還在改已走完的人時會問一次要不要跳過
- 計時：4 人 100 分、5 人 105 分、6 人 110 分；結束前 20 分鐘變黃；最後 15 分鐘「無常與恩典齊發」福慧加減 ×2（文明不吃倍率）；時間到變紅並提醒結算
- 天氣（第 6、12 輪）：N−2 預報鎖定但不公布、N−1 以 3 福慧換 1 文明調節、N 套用倍率（風調雨順 / 歲事如常 / 災害交加）
- 社會福利救濟 v2.1：預報前歸零可救，首次預報或更早的終局倒數後救濟線為 ≤ 3；福報與智慧各一次，補到 5，下兩輪幸運庇護 ×1.5／×0.5；自選低點不救，回升至 4 解除標記
- 抽卡：行動指令牌、共好加速卡；抉擇卡兩選一；雙方卡可同時套兩人；生態紅利依集體文明鎖分支
- 歷史局可檢視／切回；牌組可匯入 JSON；介面繁／簡切換
- 狀態存 `localStorage`，重新整理不掉資料

## 本機開發

```bash
npm ci
npm run build
python3 -m http.server 8080 --directory dist
```

PWA 需要透過 http(s) 開啟建置後的 `dist/`。每次建置產生內容指紋，下載完整版本後才提示更新；更新前先存檔，並保留運行中的計時。
單純開發畫面可直接以 HTTP 提供原始碼，但原始碼的 `pwa-manifest.js` 是開發占位檔，不安裝離線版本。

修改規則或遊戲流程後執行 `npm test`、`npm run lint` 與 `npm run build`。
第五階段加入瀏覽器端到端驗證：首次執行 `npm ci`、
`npx playwright install chromium webkit`，之後執行 `npm run test:all`。
測試會自動建置並啟動獨立伺服器；操作方式、涵蓋範圍與報告見
[第五階段測試說明](docs/browser-regression.md)。
計分結算與畫面更新的分工見 [第一階段重構說明](docs/score-flow.md)。
存檔格式、舊資料遷移及歷史局切換見 [第二階段重構說明](docs/game-storage.md)。
規則設定、牌組驗證與語系／樣式邊界見 [第三階段重構說明](docs/rules-decks.md)。
彈窗堆疊、焦點、鍵盤、切局取消及瀏覽器測試方式見 [第四階段重構說明](docs/modal-management.md)。
功能 UI 模組、資料讀取與操作回呼的分工見 [第六階段重構說明](docs/feature-ui.md)。
版本快取、更新確認、失敗重試與部署要求見 [第七階段重構說明](docs/pwa-updates.md)。

## 部署到 GitHub Pages

1. 在 GitHub 建立一個 repo（例如 `fuhui-dashboard`），把這個資料夾整個 push 上去：

   ```bash
   git init && git add . && git commit -m "init"
   git branch -M main
   git remote add origin git@github.com:<you>/fuhui-dashboard.git
   git push -u origin main
   ```

2. 到 repo Settings → Pages → Source 選 `GitHub Actions`。專案的 `pages.yml` 會驗證、建置並部署 `dist/`，不要直接部署原始碼目錄。

3. 約 1–2 分鐘後到 `https://<you>.github.io/fuhui-dashboard/` 開啟即可。

4. 在 iPad Safari 打開該網址 → 分享 → 加入主畫面，就會以 PWA 模式啟動（全螢幕、可離線）。

> 建置會產生 `.nojekyll`；Cloudflare Pages 同樣使用 `npm run build`，輸出目錄為 `dist`。

## 檔案

| 檔案 | 用途 |
|---|---|
| `index.html` | 主頁面結構、說明 modal |
| `styles.css` / `components.css` | 樣式（iPad 優先） |
| `config.js` | 里程、時間、文明權重、天氣與救濟的共用規則設定 |
| `deck-model.js` | 牌組 schema、匯入／存檔驗證、舊 dual 欄位相容與抽卡池 |
| `docs/social-welfare-relief.md` | 社會福利救濟可實作規格 |
| `version.js` | 顯示版號單一來源與預覽部署註記 |
| `game-rules.js` | 純規則：批次分數、里程、勝利與時間界線、天氣門檻、倍率、救濟資格 |
| `game-state.js` | 存檔與歷史共用模型：建立、驗證、遷移、完整快照與局交換 |
| `storage.js` | localStorage adapter：舊存檔備份、格式隔離與儲存失敗處理 |
| `modal-manager.js` | 13 個彈窗的堆疊、焦點、鍵盤、確認佇列與切局取消 |
| `tests/e2e/` / `playwright.config.cjs` | Chromium 與 WebKit iPad 情境的瀏覽器回歸測試 |
| `app.js` | 遊戲流程、狀態套用、存檔與 UI 模組組裝；所有分數經同一批次入口結算 |
| `ui-*.js` | 玩家、開局與骰子、卡牌、歷史、天氣、通知及金句的畫面與事件 |
| `pwa-client.js` / `ui-pwa.js` | 更新等待、套用前存檔、重試與提示介面 |
| `pwa-manifest.js` / `scripts/build.cjs` | 建置產生的版本指紋、資產 SHA-256 與固定版本 URL |
| `vendor/` | 固定版本 html2canvas 與 MIT 授權，可離線產圖 |
| `i18n.js` + `locales/` | 繁／簡／英文案與卡牌內容 |
| `sw.js` | 整版驗證與快取、更新接管、同 App 範圍清理及快取遺失修復 |
| `manifest.webmanifest` | PWA 安裝 manifest |
| `icons/` | App icon（iOS 用 PNG） |
| `.nojekyll` | 關閉 GitHub Pages 的 Jekyll 處理 |

---
Copyright (c) 2026 JHIH-WEI WU. All Rights Reserved.
