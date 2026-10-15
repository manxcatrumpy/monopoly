// 福慧大富翁 — 全域平衡與遊戲設定
// 在這裡修改數值可直接調整遊戲節奏與難度，無需更改核心邏輯。

const gameConfig = {
  PROGRESSION: { GRADUATION: 30, NAVIGATOR: [10, 20, 30], SELF: [12, 22] },
  SCORING: { CIV_GOAL_PER_PLAYER: 10, CIV_WEIGHT: 2 },
  TIME: { BASE_PLAYERS: 4, BASE_MINUTES: 100, EXTRA_PLAYER_MINUTES: 5, WARNING_MINUTES: 20 },
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
    EXCHANGE_RATE_COST: 3,
    DISASTER_RATIO: 0.8,
    FAVORABLE_RATIO: 1.2
  },

  // 終局倒數分鐘數 (預設最後 15 分鐘)
  ENDGAME_MINUTES: 15,

  // 社會福利救濟（防護網，不是獎勵 — v2.1 規格）
  RELIEF: {
    RESTORE_TO: 5,        // 補到 5 點（非加 5）
    THRESHOLD_EARLY: 0,   // 開局期救濟線（歸零才救）
    THRESHOLD_LATE: 3,    // 預報後期救濟線（<= 3 就救）
    CLEAR_TAG_AT: 4,      // 回升至 >= 4 點清除自選低點標記
    SHELTER_TURNS: 2      // 庇護長度：救濟輪次 N 的 N+1 … N+SHELTER_TURNS
  },

  // 點數倍率表
  MULTIPLIERS: {
    FAVORABLE: { gain: 2.0, loss: 1.0, labelKey: 'ui.weather_favorable' },
    NORMAL:    { gain: 1.3, loss: 1.3, labelKey: 'ui.weather_normal' },
    DISASTER:  { gain: 1.0, loss: 2.0, labelKey: 'ui.weather_disaster' },
    ENDGAME:   { gain: 2.0, loss: 2.0, labelKey: 'weather.endgame_banner' },
    SHELTER:   { gain: 1.5, loss: 0.5, labelKey: 'relief.shelter_label' }
  }
};

(function deepFreeze(obj) {
  Object.keys(obj).forEach((prop) => {
    if (typeof obj[prop] === 'object' && obj[prop] !== null) {
      deepFreeze(obj[prop]);
    }
  });
  return Object.freeze(obj);
})(gameConfig);

if (typeof module === 'object' && module.exports) module.exports = gameConfig;
else window.GAME_CONFIG = gameConfig;

