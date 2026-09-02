// 福慧大富翁 — 全域平衡與遊戲設定
// 在這裡修改數值可直接調整遊戲節奏與難度，無需更改核心邏輯。

window.GAME_CONFIG = {
  // 總局數 (預設 16 局)
  EXPECTED_ROUNDS: 16,

  // 天氣系統設定
  WEATHER: {
    // 觸發輪次設定：[氣象情報生效輪次]
    // 預設第 6 輪 (N-2=預報, N-1=調節, N=生效)
    SCHEDULE: [
      { id: 'W1', targetRound: 6 },
      { id: 'W2', targetRound: 12 }
    ],
    // 氣候調節的兌換率：幾點福慧可換 1 點文明
    EXCHANGE_RATE_COST: 3
  },

  // 終局倒數分鐘數 (預設最後 15 分鐘)
  ENDGAME_MINUTES: 15,

  // 點數倍率表
  MULTIPLIERS: {
    FAVORABLE: { gain: 2.0, loss: 1.0, labelKey: 'ui.weather_favorable' },
    NORMAL:    { gain: 1.3, loss: 1.3, labelKey: 'ui.weather_normal' },
    DISASTER:  { gain: 1.0, loss: 2.0, labelKey: 'ui.weather_disaster' },
    ENDGAME:   { gain: 2.0, loss: 2.0, labelKey: 'weather.endgame_banner' }
  }
};
