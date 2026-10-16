# 瀏覽器端到端回歸 — 第五階段重構

## 執行方式

使用 Node.js 24。首次安裝：

```bash
npm ci
npx playwright install chromium webkit
```

Linux 如缺少瀏覽器系統依賴，改用
`npx playwright install --with-deps chromium webkit`。

```bash
npm run test:all                       # Node 測試 → lint → 建置與瀏覽器測試
npm run test:e2e                       # 只執行瀏覽器測試，亦自動建置
npm run test:e2e -- --project chromium  # 只執行其中一套引擎
npm run test:e2e -- --project webkit-ipad
npm run test:e2e:ui                    # 互動選擇、除錯
npx playwright show-report            # 查看上一次 HTML 報告
```

設定依 [Playwright webServer](https://playwright.dev/docs/test-webserver)、
[Projects](https://playwright.dev/docs/test-projects) 與
[Clock](https://playwright.dev/docs/clock) 文件使用正式 API。
`@playwright/test` 與對應瀏覽器版本由 lockfile 鎖定；升級套件後需重新安裝瀏覽器。

## 測試邊界與分工

`playwright.config.cjs` 統一管理兩套引擎、時區、報告與伺服器生命週期。
第七階段補上 PWA 案例後，每套引擎執行 25 個案例，共 50 次；WebKit 使用 iPad Pro 11 的視窗與觸控設定，
Chromium 使用桌面視窗。這是瀏覽器引擎與裝置模擬，實機 iPad Safari 仍需驗收。

`scripts/serve-e2e.cjs` 僅綁定 `127.0.0.1:4192`，提供 `dist/` 建置成品，
並額外提供第四階段既有的兩個彈窗測試檔。若埠已占用，測試直接失敗，
不沿用可能指向其他版本的伺服器；執行結束後 Playwright 關閉測試伺服器。

`tests/e2e/fixtures.cjs` 建立每個案例獨立的瀏覽器 context 與 localStorage，
用既有存檔模型準備起始局，避免操作到開發時的真實存檔。
案例透過 UI 操作，從畫面與 localStorage 斷言結果，不呼叫或替換 app 的規則、
流程、渲染與彈窗函式。計時使用固定 `Date` 控制秒數，真正的頁面 timer 仍會執行，
因此不必等待幾十分鐘，也不依賴精準的實際等待時間。

第七階段將 html2canvas 改為本機固定版本，所有遊戲資產、CSS、語系與模組
都實際載入，離線案例也檢查 JPEG 下載。一般案例停用 Service Worker
以便定位 UI 失敗；離線案例單獨啟用，等待安裝與控制頁面完成，再真正斷網重載。
每個案例都收集未捕捉的頁面例外並使測試失敗。

## 涵蓋流程

| 案例 | 主要斷言 |
|---|---|
| 計時重新整理 | 未暫停跨兩次重載仍累計，暫停後重載不增加 |
| 天氣調節與確認 | 先救回天氣，再次花費的警告可點擊；Tab 圈限、取消 Enter、焦點還原、保留輸入與分數 |
| 接受救濟 | 歸零扣分同時跨單項里程，救濟在抽卡上層；未勾選不能確認，接受後補分並保存額度 |
| 取消救濟 | Escape 只取消上層救濟；抽卡仍可操作，未使用救濟額度 |
| 歷史切局 | UI 開下一局、檢視歷史、切回完整分數與狀態，捨棄未送出的調分草稿 |
| 切局取消等待 | 開局確認時跨終局倒數產生救濟；確認新局後舊救濟消失，不套用、不在重載後重現 |
| 牌組匯入 | 無效點數拒絕且保留原牌組；取消不套用，確認後重載與抽卡仍使用匯入內容 |
| 語系切換 | 簡中偏好與分數跨重新整理保存 |
| 彈窗管理器 | 在兩套瀏覽器各執行第四階段既有 7 項真實 DOM／CSS 檢查 |
| 離線重載 | SW 安裝後斷網，主頁重載、調分、彈窗及再次保存／重載仍可運作 |
| 開局表單與骰子 | 實際動畫完成、變更人數與文明目標、建立新局及停止隱藏骰子的動畫 |
| 一般雙人卡 | 相同對象被拒絕；兩位不同收受者各得到一次獎勵，只有行動者標記已行動 |
| 條件抉擇卡 | 依文明鎖分支，兩位收受者與全體文明增減依序送交原批次流程 |
| 金句預覽 | 即時更新文字與字數，重開清空草稿且不改遊戲存檔 |
| 玩家卡操作 | 改名持久化；移除確認可取消，接受後才移除 |

第七階段另加入十個 PWA 案例：更新中保存遊戲與計時、稍後更新、HTTP 失敗、
內容雜湊不符、多視窗、離線 JPEG、初次安裝重試、舊策略遷移，以及快取遺失後
恢復同版／新版。這些案例使用各自的暫存建置與伺服器，不修改主要 `dist/`。
細節見 [PWA 更新說明](pwa-updates.md)。

主頁案例使用原生鍵盤與正常點擊，不強制穿透遮擋，也不派發 click 取代使用者操作。
確認按鈕除了檢查 `aria-modal` 與 `inert`，也透過 Playwright 的點擊命中檢查，
避免只驗證 class 正確卻漏掉實際被覆蓋的問題。既有彈窗測試頁的合成鍵盤檢查
保留作為模組驗證，主頁案例補足原生鍵盤行為。

## 實跑發現與修正

離線時若請求尚未快取的外部資源，舊 `sw.js` 會把 `caches.match()` 的空值
直接交給 `respondWith()`；WebKit 因此產生未捕捉的回應錯誤。
現在快取命中仍回傳原內容，未命中則明確回傳 HTTP 503。
Node 補上快取命中／未命中回歸，兩套瀏覽器都驗證離線重載。

安裝測試工具時一併將既有 ESLint 間接依賴 `brace-expansion` 更新至
允許版本範圍內的修補版，避免保留安裝時回報的已知漏洞。

## 報告與 CI

失敗時保存截圖與 trace 至 `test-results/`，HTML 報告在 `playwright-report/`；
天氣確認另保存 `weather-confirm.png` 便於檢視重疊畫面。
這些產物均忽略於 Git，測試程式也不會複製到 `dist/` 或列入 PWA 快取。

`.github/workflows/test.yml` 在 push、PR 與手動觸發時執行相同的
`npm run test:all`，並保留報告／trace 14 天。CI 禁止遺留 `.only`，
失敗最多重試一次並顯示重試結果。本機預設不重試，方便直接定位問題。
此工作流程只做驗證，不部署網站。
