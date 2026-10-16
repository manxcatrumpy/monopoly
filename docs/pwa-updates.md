# PWA 快取與更新 — 第七階段重構

## 使用與部署

```bash
npm ci
npm run build
python3 -m http.server 8080 --directory dist
```

正式部署必須提供整個 `dist/`。GitHub Pages 的 Source 使用 GitHub Actions，
`.github/workflows/pages.yml` 執行驗證、建置並上傳 `dist/`；Cloudflare Pages
使用 `npm run build` 與 `dist` 輸出目錄。這些是設定變更，本次沒有執行遠端部署。

原始碼的 `pwa-manifest.js` 是 `null` 占位，直接提供原始碼可開發線上畫面，
不安裝未建置的離線版本。原始碼與 PWA 測試可使用不同的本機埠，避免已安裝的
Service Worker 遮蔽開發檔案。PWA 驗收使用 HTTPS 或 localhost。

## 版本與完整下載

`scripts/build.cjs` 取代 shell 複製指令，清理後產生靜態成品。
先套用 Cloudflare 預覽分支的 commit 註記，再對交付內容產生穩定指紋。
相同內容重建取得同一 id；即使沒有修改顯示版號，修改 JS、CSS、語系或
worker 政策也會取得不同 id。`version.js` 仍是使用者看到的版號來源。

建置後的 `pwa-manifest.js` 記錄 id、版號與每個資產的 SHA-256；
HTML 的本機資產 URL 與語系請求附上 `rev`，固定使用同一版本。
worker 先下載並核對所有資產，再寫入該版本的快取；缺檔、HTTP 錯誤或內容
與清單不符，都不能完成安裝，也不會覆寫目前可用的版本。
新寫入快取失敗時清除不完整的新版本，已存在版本的修復不刪除原有內容。

已安裝資產從指定版本讀取，不再以 network-first 將新 JS 或新語系寫進舊快取。
未知 URL、其他網域與非 GET 請求不加入快取；指定版本缺檔回傳 503，
不拿別版的檔案補上。瀏覽器回收快取後，線上的導覽會重新取得清單並驗證
一整套版本，再回傳其 HTML；若伺服器已部署新版，也能恢復到完整新版。
離線且快取已遺失時仍需恢復連線。

`vendor/html2canvas.min.js` 固定為 1.4.1，保留 `html2canvas.LICENSE` 的 MIT 授權。
圖片產生器與其他資產一起安裝，不再依賴 CDN，金句可以離線下載。

## 更新流程與遊戲保護

`pwa-client.js` 處理註冊、等待、套用、重試與控制權變更；`ui-pwa.js` 只處理提示。
註冊使用 `updateViaCache: 'none'`；回到視窗或恢復連線時檢查更新，沒有定時輪詢。

1. 新版本完整下載後進入 waiting，顯示「更新並重新整理」與「稍後」。
2. 開著的遊戲不會因為安裝完成就被強制更新；稍後會隱藏本頁的提示。
3. 選擇更新時，先確認沒有未關閉的彈窗，再同步存檔；等待中的 worker
   也確認沒有另一個同 App 視窗，才接受啟用要求。
4. 取得新控制權後再檢查一次彈窗與存檔，成功才重載，而且只重載一次。
5. 若存檔失敗或期間開啟了彈窗，保留頁面，讓主持人完成操作後再試。
   更新逾時也不會在稍後突然強制重載。

PWA 模組不修改分數、歷史或計時狀態。存檔沿用 `saveNow()` 與原本的
localStorage 格式；運行中的計時保留起算時間，重載耗時也會繼續累計。
初次離線安裝失敗會提供重試，線上遊戲可繼續；更新失敗則繼續使用舊版。
如果所有舊視窗都已關閉，瀏覽器可自然啟用等待版本，下一次開啟使用新版。

## 快取所有權與遷移

快取名稱包含 App 的 scope 路徑與內容指紋，不會刪除同網域其他 App 的快取。
還有舊頁面時保留舊資產；新版頁面就緒、只剩本 App 的一個視窗且沒有
其他版本正在安裝／等待時，才清除本 scope 的舊版本。
這也避免舊頁面的就緒訊息誤刪待更新版本。

舊 `fuhui-dashboard-v…` 快取沒有 scope 標記，無法可靠判斷所有權，因此保留，
新政策不再讀取它們。舊 network-first 頁面可透過重新整理載入新更新介面，
再套用隔離版本；不會清除原有的遊戲 localStorage。

## 驗證與限制

`npm run test:all` 保留原有遊戲流程與功能 UI 測試，並加入建置重現性、
預覽版指紋、整版安裝、缺檔／雜湊／儲存失敗、scope 清理、等待版本保護、
套用前後存檔、重複點擊、逾時、首次安裝重試與開發模式等 Node 測試。

PWA 瀏覽器案例以獨立測試伺服器，在 `/game/` 子路徑交替提供兩份真實建置，
驗證更新中計時與完整存檔、稍後、HTTP／內容錯誤重試、多視窗、離線 JPEG、
初次安裝失敗、舊快取策略遷移，以及快取被回收後恢復同版／新版。
它們與既有十五個案例一併在 Chromium 及 WebKit iPad 模擬執行。
實機 Safari 的安裝、背景回收與平台儲存限制仍需實機驗收。

設計依據：[Service worker lifecycle](https://web.dev/articles/service-worker-lifecycle)、
[register 與 updateViaCache](https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerContainer/register)、
[SHA-256 digest](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/digest)。
