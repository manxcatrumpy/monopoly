# 福慧大富翁 Dashboard

iPad 主持人控制台 — 純前端 PWA，無後端、可離線、可加到主畫面。規則對齊 **v1.4.0**。

## 功能

- 開新局：4–6 人、十面骰決定每人初始福/慧、最高者擲白×黑訂文明高度（白骰 × 黑骰 ＋ 玩家人數 × 10）
- 玩家卡：福報 / 智慧 / 文明只讀顯示；改分走批次調分（可勾「這是本輪行動」）；起始點經過／停格一鍵加分（同時標記本輪已行動）
- 里程提醒（達標跳 Toast、記日誌、列入待抽卡）：
  - 領航者：全場首位福慧雙達 15 / 35 / 55，各抽 1 張
  - 自我突破：任一玩家福慧雙達 25 / 45，各抽 1 張
  - 單項 55：抽卡、可宣告畢業（單項 25 / 35 / 45 不抽卡）
- 畢業：福慧皆 ≥ 55（戴帽 + 金色光暈）；回落自動降級
- 勝利：集體文明達標，或全員畢業；綜合分 ＝ 福 ＋ 慧 ＋ 文明×2
- 輪次：已行動或本輪跳過皆算處理完，全員完成自動進下一輪；只剩一位未走卻還在改已走完的人時會問一次要不要跳過
- 計時：4 人 100 分、5 人 105 分、6 人 110 分；結束前 20 分鐘變黃；最後 15 分鐘「無常與恩典齊發」福慧加減 ×2（文明不吃倍率）；時間到變紅並提醒結算
- 天氣（第 6、12 輪）：N−2 預報鎖定但不公布、N−1 以 3 福慧換 1 文明調節、N 套用倍率（風調雨順 / 歲事如常 / 災害交加）
- 抽卡：行動指令牌、共好加速卡；抉擇卡兩選一；雙方卡可同時套兩人；生態紅利依集體文明鎖分支
- 歷史局可檢視／切回；牌組可匯入 JSON；介面繁／簡切換
- 狀態存 `localStorage`，重新整理不掉資料

## 本機開發

```bash
python3 -m http.server 8080
# 或：npx serve .
```

Service Worker 需要透過 http(s) 才能註冊。直接 `file://` 打開卡片功能會動，但 PWA 安裝 / 離線會失效。SW 採 network-first：有網就拿新檔，離線才用 cache。

## 部署到 GitHub Pages

1. 在 GitHub 建立一個 repo（例如 `fuhui-dashboard`），把這個資料夾整個 push 上去：

   ```bash
   git init && git add . && git commit -m "init"
   git branch -M main
   git remote add origin git@github.com:<you>/fuhui-dashboard.git
   git push -u origin main
   ```

2. 到 repo Settings → Pages → Source 設為 `Deploy from a branch`，分支選 `main`、資料夾選 `/ (root)`，存檔。

3. 約 1–2 分鐘後到 `https://<you>.github.io/fuhui-dashboard/` 開啟即可。

4. 在 iPad Safari 打開該網址 → 分享 → 加入主畫面，就會以 PWA 模式啟動（全螢幕、可離線）。

> `.nojekyll` 檔已包含，避免 GitHub Pages 嘗試用 Jekyll 處理。

## 檔案

| 檔案 | 用途 |
|---|---|
| `index.html` | 主頁面結構、說明 modal |
| `styles.css` / `components.css` | 樣式（iPad 優先） |
| `config.js` | 天氣時程、兌換率、倍率等規則旋鈕 |
| `version.js` | 版號單一來源（畫面 + SW cache） |
| `app.js` | 遊戲狀態、計分、天氣、抽卡、計時、Toast |
| `i18n.js` + `locales/` | 繁／簡／英文案與卡牌內容 |
| `sw.js` | Service Worker（network-first） |
| `manifest.webmanifest` | PWA 安裝 manifest |
| `icons/` | App icon（iOS 用 PNG） |
| `.nojekyll` | 關閉 GitHub Pages 的 Jekyll 處理 |

---
Copyright (c) 2026 JHIH-WEI WU. All Rights Reserved.
