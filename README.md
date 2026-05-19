# 福慧大富翁 Dashboard

iPad 主持人控制台 — 純前端 PWA，無後端、可離線、可加到主畫面。

## 功能

- 開新局：4–6 人動態、擲十面骰決定每人初始 福/慧、最高者擲 白×黑 訂文明高度（最低 30）
- 玩家卡：福報 / 智慧 / 文明 三種積分，±1 觸控按鈕、可直接點數字改值
- 自動偵測 25 / 35 / 45 / 50 里程，跳 Toast 並記錄到右側日誌
- 福 ≥ 50 且 慧 ≥ 50 自動畢業（戴帽 + 金色光暈）；若回落自動降級
- 計時器：開始 / 暫停，80 分鐘變黃、100 分鐘變紅並提醒結算
- 共用骰：d6、d10、2d6
- 所有狀態自動存到 `localStorage`，重新整理不掉資料

## 本機開發

```bash
cd /Users/wuandy/Projects/monopoly
python3 -m http.server 8080
# 或：npx serve .
```

Service Worker 需要透過 http(s) 才能註冊。直接 `file://` 打開卡片功能會動，但 PWA 安裝 / 離線會失效。

## 部署到 GitHub Pages

1. 在 GitHub 建立一個 repo（例如 `fuhui-dashboard`），把這個資料夾整個 push 上去：

   ```bash
   cd /Users/wuandy/Projects/monopoly
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
| `index.html` | 主頁面結構 |
| `styles.css` | 全部樣式（iPad 優先） |
| `app.js` | 遊戲狀態、玩家邏輯、骰子、計時器、Toast |
| `sw.js` | Service Worker（cache-first） |
| `manifest.webmanifest` | PWA 安裝 manifest |
| `icons/icon.svg` | App icon |
| `.nojekyll` | 關閉 GitHub Pages 的 Jekyll 處理 |
