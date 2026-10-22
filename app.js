'use strict';

// ─────────────────────────────────────────────────────────────────────────
// 福慧大富翁 Dashboard
// ─────────────────────────────────────────────────────────────────────────

// ─────────── Card decks ───────────
// Host-updated deck content (4 categories). Each category carries a base reward;
// a card may override it via its own `reward` / `rewardText`, and `side` notes a
// manual extra effect that the host applies by hand.

function getActionDeck() {
  return (state.settings.customDecks && state.settings.customDecks.action) || window.i18n.cards.actionDeck;
}
function getBoostDeck() {
  return (state.settings.customDecks && state.settings.customDecks.boost) || window.i18n.cards.boostDeck;
}

function buildActionPool() {
  return DeckModel.buildActionPool(getActionDeck());
}

// ─────────── Boost deck (共好加速卡) ───────────
// Each card stands alone (no categories). 「即時行動」 + 「福慧覺察」 sections.

function buildBoostPool() {
  return DeckModel.buildBoostPool(getBoostDeck());
}

function rebuildDecks() {
  DECKS.action.title = t('dm.action_label');
  DECKS.boost.title = t('dm.boost_label');
  DECKS.action.pool = buildActionPool();
  DECKS.boost.pool = buildBoostPool();
}

const STORAGE_KEY = 'fuhui-dashboard-state-v2';
const LEGACY_STORAGE_KEY = 'fuhui-dashboard-state-v1';
// 遊戲時間依人數而定：4人/100 分、5人/105 分、6人/110 分（每多一人 +5 分）。
function gameMinutes() {
  const count = state.currentGame.players.length || setupTmp.count || 4;
  return GameRules.gameMinutes(count, GAME_CONFIG);
}
function maxGameSeconds() {
  return gameMinutes() * 60;
}
const SPRINT_SECONDS = () => GAME_CONFIG.ENDGAME_MINUTES * 60;
const GRAD_THRESHOLD = GAME_CONFIG.PROGRESSION.GRADUATION;          // 福慧雙項皆 ≥ 30 即可畢業
const CIV_PER_PLAYER = GAME_CONFIG.SCORING.CIV_GOAL_PER_PLAYER;          // 文明高度：白骰 × 黑骰 ＋ 玩家人數 × 此值
const DIE_MIN = 1, DIE_MAX = 6;     // 實體白/黑骰點數範圍
const MILESTONES = [GRAD_THRESHOLD];             // 單項里程：單項 30 (不再分四階)
const NAV_THRESHOLDS = GAME_CONFIG.PROGRESSION.NAVIGATOR;   // 領航者際遇：場上首位福慧雙達者
const SELF_THRESHOLDS = GAME_CONFIG.PROGRESSION.SELF;      // 自我突破際遇：任一玩家福慧雙達者
const STATS = ['fortune', 'wisdom', 'civ'];
const STAT_LABEL = (stat) => t('players.' + stat);

function emptyNavClaim() {
  return NAV_THRESHOLDS.reduce((o, n) => (o[n] = null, o), {});
}

// Display string from version.js (APP_SEMVER / APP_BUILD).
const APP_VERSION = APP_SEMVER + ' (build ' + APP_BUILD + ')';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

// ─────────── State ───────────
function stateModelOptions() {
  return {
    now: Date.now(), weatherSchedule: GAME_CONFIG.WEATHER.SCHEDULE,
    navigatorThresholds: NAV_THRESHOLDS, graduationThreshold: GRAD_THRESHOLD,
    endgameMinutes: GAME_CONFIG.ENDGAME_MINUTES,
  };
}
const defaultState = () => GameState.createState(stateModelOptions());
let state = defaultState();

const modals = ModalManager.create({ document, getScope: () => state.currentGame });
const modalOptions = {
  'setup-modal': { initialFocus: '.setup-player-row input', onClose: () => setupUI.stopAnimations() },
  'deck-manager-modal': { initialFocus: '#dm-close' },
  'catalog-modal': { initialFocus: '#catalog-close' },
  'card-modal': { initialFocus: '#card-recipient' },
  'history-modal': { initialFocus: '#history-close' },
  'confirm-modal': { priority: 2, initialFocus: '#confirm-ok', closeOnBackdrop: true },
  'relief-modal': { priority: 1, initialFocus: '#relief-ack-cb', closeOnBackdrop: true },
  'origin-modal': { initialFocus: '#origin-pass-btn', closeOnBackdrop: true, onClose: () => { originTargetId = null; } },
  'adjust-modal': { initialFocus: '#adjust-rows input', closeOnBackdrop: true, onClose: () => { adjustTargetId = null; } },
  'guide-modal': { initialFocus: '#guide-close', closeOnBackdrop: true },
  'draw-modal': { initialFocus: '#draw-later' },
  'highlight-modal': { initialFocus: '#highlight-quote-input', closeOnBackdrop: true },
  'weather-adjust-modal': { initialFocus: '.adj-fortune', closeOnBackdrop: true },
  'exchange-modal': { initialFocus: '#exchange-player', closeOnBackdrop: true },
  'exchange-open-modal': { priority: 1, initialFocus: '#exchange-open-close' },
};
for (const [id, options] of Object.entries(modalOptions)) modals.register(id, options);

const persistence = GameStorage.create({ storage: localStorage, key: STORAGE_KEY, legacyKey: LEGACY_STORAGE_KEY, model: GameState, options: stateModelOptions });
let storageWarningKey = null;
function showStorageWarning(key) {
  storageWarningKey = key;
  const banner = $('#storage-warning');
  if (banner) {
    banner.textContent = key ? t(key) : '';
    banner.hidden = !key;
    banner.classList.toggle('hidden', !key);
  }
}

let saveScheduled = false;
function saveNow() {
  saveScheduled = false;
  const result = persistence.write(state);
  showStorageWarning(result.ok ? null : (result.blocked ? 'storage.read_failed' : 'storage.write_failed'));
  return result.ok;
}
function save() {
  if (saveScheduled) return;
  saveScheduled = true;
  if (typeof queueMicrotask === 'function') {
    queueMicrotask(saveNow);
  } else {
    Promise.resolve().then(saveNow);
  }
}
window.addEventListener('pagehide', () => {
  if (saveScheduled) saveNow();
});
window.addEventListener('beforeunload', () => {
  if (saveScheduled) saveNow();
});
function load() {
  const result = persistence.read();
  if (result.status === 'invalid') {
    showStorageWarning('storage.read_failed');
    return false;
  }
  if (result.status === 'empty') return false;
  // 所有資料驗證與遷移完成後才替換狀態，避免局部載入。
  state = result.state;
  syncNextPlayerId();
  save();
  return state.currentGame.players.length > 0;
}
async function allowReplacingUnreadableSave() {
  if (!persistence.blocked) return true;
  const ok = await confirmModal({
    title: t('storage.replace_title'), message: t('storage.replace_message'),
    confirmText: t('confirm.btn_ok'), danger: true,
  });
  if (!ok) return false;
  const result = persistence.replaceUnreadable();
  if (!result.ok) showStorageWarning('storage.write_failed');
  return result.ok;
}

// ─────────── Players ───────────
let nextPlayerId = 1;
function syncNextPlayerId() {
  const players = [state.currentGame, ...state.history].flatMap(game => game.players);
  const maxId = players.reduce((max, player) => Math.max(max, Number(player.id.slice(1)) || 0), 0);
  nextPlayerId = Math.max(nextPlayerId, maxId + 1);
}
function makePlayer({ name = '', fortune = 0, wisdom = 0 } = {}) {
  return GameState.createPlayer({ id: 'p' + (nextPlayerId++), name, fortune, wisdom }, stateModelOptions());
}

function totalCiv() {
  return state.currentGame.players.reduce((s, p) => s + (p.civ || 0), 0);
}
// 把文明加到集體高度：均分給每位玩家，餘數由前往後補，避免全灌在 players[0]。
function collectiveCivChanges(amount) {
  const n = state.currentGame.players.length;
  if (!amount || !n) return [];
  let rem = amount % n;
  const each = (amount - rem) / n;
  return state.currentGame.players.map(p => {
    const add = each + (rem > 0 ? 1 : 0);
    if (rem > 0) rem--;
    return { playerId: p.id, delta: { civ: add } };
  });
}
function totalFortune() {
  return state.currentGame.players.reduce((s, p) => s + (p.fortune || 0), 0);
}
function totalWisdom() {
  return state.currentGame.players.reduce((s, p) => s + (p.wisdom || 0), 0);
}
function comprehensiveScore(p) {
  return (p.fortune || 0) + (p.wisdom || 0) + (p.civ || 0) * GAME_CONFIG.SCORING.CIV_WEIGHT;
}
// ─────────── Weather System ───────────
function expectedCiv(turn, civGoal) {
  return GameRules.expectedCiv(turn, civGoal, GAME_CONFIG);
}
function judgeWeather(civCurrent, turn, civGoal) {
  return GameRules.judgeWeather(civCurrent, turn, civGoal, GAME_CONFIG);
}
function getPhase(turn) {
  return GameRules.weatherPhase(turn, state.currentGame.weatherEvents);
}

// ─────────── Dice ───────────
function roll(sides) {
  return 1 + Math.floor(Math.random() * sides);
}
// ─────────── Time ───────────
function elapsedSeconds() {
  const t = state.currentGame.timer;
  let acc = t.accumulated || 0;
  if (t.running && t.lastStartedAt) {
    acc += Math.floor((Date.now() - t.lastStartedAt) / 1000);
  }
  return Math.max(0, acc);
}
function fmt(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
function startTimer() {
  if (state.currentGame.timer.running) return;
  state.currentGame.timer.running = true;
  state.currentGame.timer.lastStartedAt = Date.now();
  save();
  processGameEvents();
  updateTopbar();
}
function pauseTimerState() {
  if (!state.currentGame.timer.running) return;
  const now = Date.now();
  state.currentGame.timer.accumulated = (state.currentGame.timer.accumulated || 0) +
    Math.floor((now - state.currentGame.timer.lastStartedAt) / 1000);
  state.currentGame.timer.lastStartedAt = null;
  state.currentGame.timer.running = false;
}
function pauseTimer() {
  if (!state.currentGame.timer.running) return;
  pauseTimerState();
  processGameEvents();
  save();
  updateTopbar();
}
function toggleTimer() {
  state.currentGame.timer.running ? pauseTimer() : startTimer();
}
function resetTimer() {
  state.currentGame.timer = { accumulated: 0, lastStartedAt: null, running: false };
}

// ─────────── 倒數衝刺：無常與恩典齊發 ───────────
function sprintActive() {
  return elapsedSeconds() >= maxGameSeconds() - SPRINT_SECONDS();
}
function getWeatherLabel(w) {
  return w && GAME_CONFIG.MULTIPLIERS[w] ? t(GAME_CONFIG.MULTIPLIERS[w].labelKey) : '';
}

function scoreMultiplier(playerId) {
  if (sprintActive() && GAME_CONFIG.MULTIPLIERS.ENDGAME) {
    return Object.assign({ id: 'ENDGAME' }, GAME_CONFIG.MULTIPLIERS.ENDGAME);
  }
  const p = playerId != null ? getPlayer(playerId) : null;
  if (playerInShelter(p) && GAME_CONFIG.MULTIPLIERS.SHELTER) {
    return Object.assign({ id: 'SHELTER' }, GAME_CONFIG.MULTIPLIERS.SHELTER);
  }
  const { phase, ev } = getPhase(state.currentGame.turnNum);
  const w = phase === 'REPORT' && ev ? ev.lockedWeather : null;
  if (w && GAME_CONFIG.MULTIPLIERS[w]) return Object.assign({ id: w }, GAME_CONFIG.MULTIPLIERS[w]);
  return { gain: 1, loss: 1, id: null };
}

function reliefCfg() {
  return GAME_CONFIG.RELIEF;
}

function getFirstForecastTurn() {
  const events = state.currentGame.weatherEvents || [];
  if (events.length > 0 && typeof events[0].targetRound === 'number') {
    return Math.max(1, events[0].targetRound - 2);
  }
  return 4;
}

function isLateReliefPhase() {
  if (sprintActive()) return true;
  return state.currentGame.turnNum >= getFirstForecastTurn();
}

function currentReliefThreshold() {
  const cfg = reliefCfg();
  return isLateReliefPhase()
    ? cfg.THRESHOLD_LATE
    : cfg.THRESHOLD_EARLY;
}

function reliefEligible(p, stat) {
  if (!p) return false;
  if (stat) {
    if (p.reliefUsed && p.reliefUsed[stat]) return false;
    if (p.selfSelectedLow && p.selfSelectedLow[stat]) return false;
    return true;
  }
  return reliefEligible(p, 'fortune') || reliefEligible(p, 'wisdom');
}

function qualifyingReliefStats(p, stats = ['fortune', 'wisdom']) {
  if (!p) return [];
  const threshold = currentReliefThreshold();
  return stats.filter(stat => (stat === 'fortune' || stat === 'wisdom') &&
    (p[stat] ?? 0) <= threshold && reliefEligible(p, stat));
}

function playerInShelter(p) {
  if (!p) return false;
  const from = p.shelterFromTurn;
  const to = p.shelterToTurn;
  if (typeof from !== 'number' || typeof to !== 'number') return false;
  const n = state.currentGame.turnNum;
  return n >= from && n <= to;
}

function shelterTurnsRemaining(p) {
  if (!playerInShelter(p)) return 0;
  return Math.max(0, p.shelterToTurn - state.currentGame.turnNum + 1);
}

function snapshotFw(p) {
  return { fortune: p.fortune || 0, wisdom: p.wisdom || 0 };
}

async function executeRelief(playerId, statsToRelieve = []) {
  const game = state.currentGame;
  const p = getPlayer(playerId);
  if (!p) return false;
  const cfg = reliefCfg();
  const eligibleStats = qualifyingReliefStats(p, statsToRelieve);
  if (!eligibleStats.length) return false;

  const restoreTo = cfg.RESTORE_TO;
  const name = p.name || t('common.player');

  const values = {};
  eligibleStats.forEach(stat => {
    if (!p.reliefUsed) p.reliefUsed = { fortune: false, wisdom: false };
    p.reliefUsed[stat] = true;
    values[stat] = restoreTo;
  });

  // 第二項救濟只延長庇護，保留當輪仍在生效的起點。
  if (!playerInShelter(p)) p.shelterFromTurn = state.currentGame.turnNum + 1;
  const targetEnd = state.currentGame.turnNum + (cfg.SHELTER_TURNS);
  p.shelterToTurn = typeof p.shelterToTurn === 'number' ? Math.max(p.shelterToTurn, targetEnd) : targetEnd;
  await settleScoreChanges([{ playerId, values }]);
  if (state.currentGame !== game) return false;

  const itemsLabel = eligibleStats.length === 2 ? t('relief.items_both') : STAT_LABEL(eligibleStats[0]);
  const msg = t('messages.relief_log', {
    name,
    items: itemsLabel,
    restore: restoreTo,
    from: p.shelterFromTurn,
    to: p.shelterToTurn,
  });
  logEvent(msg, 'grad');
  save();
  return true;
}

async function maybeCheckReliefAfterForcedLoss(playerId, oldStats) {
  const game = state.currentGame;
  const p = getPlayer(playerId);
  if (!p || !oldStats) return;
  const threshold = currentReliefThreshold();
  const qualifying = GameRules.qualifyingReliefStats(p, oldStats, threshold);
  if (!qualifying.length) return;

  const cfg = reliefCfg();
  const restore = cfg.RESTORE_TO;
  const ok = await showReliefModal(() => {
    if (getPlayer(playerId) !== p) return null;
    const items = qualifyingReliefStats(p, qualifying);
    if (!items.length) return null;
    return {
      name: p.name || t('common.player'),
      items,
      scores: Object.fromEntries(items.map(stat => [stat, p[stat] ?? 0])),
      restore,
    };
  });

  if (ok && state.currentGame === game && getPlayer(playerId) === p) {
    await executeRelief(playerId, qualifying);
  }
}

async function sweepReliefOnBoundary() {
  const game = state.currentGame;
  const players = game.players;
  const candidates = [];
  players.forEach(p => {
    const pQual = qualifyingReliefStats(p);
    if (pQual.length > 0) {
      candidates.push({ player: p, items: pQual });
    }
  });

  if (!candidates.length) return;

  const cfg = reliefCfg();
  const restore = cfg.RESTORE_TO;
  let activeCandidates = [];
  const ok = await showReliefModal(() => {
    if (state.currentGame !== game || game.players !== players) return null;
    activeCandidates = candidates.map(c => ({
      player: c.player,
      items: qualifyingReliefStats(c.player, c.items),
    })).filter(c => getPlayer(c.player.id) === c.player && c.items.length);
    if (!activeCandidates.length) return null;
    const multiList = activeCandidates.map(c => ({
      name: c.player.name || t('common.player'),
      items: c.items,
      scores: Object.fromEntries(c.items.map(stat => [stat, c.player[stat] ?? 0])),
    }));
    return {
      multiPlayers: multiList.length > 1 ? multiList : null,
      name: multiList[0].name,
      items: multiList[0].items,
      scores: multiList[0].scores,
      restore,
    };
  });

  if (ok) {
    for (const c of activeCandidates) {
      if (state.currentGame !== game || game.players !== players) return;
      if (getPlayer(c.player.id) === c.player) await executeRelief(c.player.id, c.items);
    }
  }
}

function applyMult(val, stat, multObj) {
  return GameRules.applyMultiplier(val, stat, multObj);
}

function scaleReward(base = {}, mult = { gain: 1, loss: 1 }) {
  const out = {};
  STATS.forEach(stat => { out[stat] = applyMult(base[stat] || 0, stat, mult); });
  return out;
}
// 把 reward 物件描述成 "福報 +4 · 智慧 +2"（保留正負號、略過 0）。
function describeReward(r = {}) {
  return STATS
    .filter(stat => r[stat])
    .map(stat => `${STAT_LABEL(stat)} ${r[stat] > 0 ? '+' : ''}${r[stat]}`)
    .join(' · ');
}

// ─────────── Toasts & log ───────────

// In-app confirm dialog (replaces native confirm()). Returns a Promise<boolean>.

function recordLog(text, kind = '') {
  state.currentGame.log.unshift({ text, kind, t: elapsedSeconds() });
  if (state.currentGame.log.length > 40) state.currentGame.log.pop();
}
function logEvent(text, kind = '') {
  recordLog(text, kind);
  save();
  renderLog();
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ─────────── 待處理抽卡佇列 ───────────
// 需要主持人「去抽一張卡」的里程（領航者 / 自我突破 / 單項畢業門檻）在觸發時，
// 除了 toast + log，還在面板上留一條待辦；主持人抽完卡點「已抽」才消失，避免漏抽。
function addPendingDraw(text, playerId) {
  state.currentGame.pendingDraws.push({
    id: 'pd_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
    text, playerId, t: elapsedSeconds(),
  });
}
function resolvePendingDraw(id) {
  state.currentGame.pendingDraws = state.currentGame.pendingDraws.filter(d => d.id !== id);
  save();
  renderPendingDraws();
  renderDrawModal();
}
// 置中強制 modal：任一「抽卡里程」觸發即彈出，列出所有待抽卡。

// ─────────── Milestones & Graduation ───────────
function key(stat, m) { return stat[0] + m; } // e.g. f25, w50

// 規則回傳事件；通知與日誌集中在這裡呈現，不再逐項計分時觸發。
function presentGameEvents(events) {
  const drawCount = state.currentGame.pendingDraws.length;
  for (const event of events) {
    const player = event.playerId ? getPlayer(event.playerId) : null;
    const name = player ? (player.name || t('common.player')) : '';
    let message, logMessage, kind = 'grad', draw = false, flash = 'grad';
    switch (event.type) {
      case 'single':
        message = t('messages.grad_draw', { name, stat: STAT_LABEL(event.stat), val: event.threshold });
        draw = true;
        flash = 'pulse';
        break;
      case 'navigator':
        message = t('messages.leader_encounter', { name, val: event.threshold });
        draw = true;
        break;
      case 'breakthrough':
        message = t('messages.breakthrough_encounter', { name, val: event.threshold });
        kind = 'milestone';
        draw = true;
        flash = 'pulse';
        break;
      case 'graduated':
        message = t('messages.graduated_msg', { name });
        break;
      case 'downgraded':
        message = t('messages.downgrade_msg', { name, threshold: event.threshold });
        kind = '';
        flash = null;
        break;
      case 'civGoal':
        message = t('messages.civ_goal_reached', { goal: event.goal });
        logMessage = t('messages.civ_goal_reached_log', { goal: event.goal });
        break;
      case 'allGraduated':
        message = t('messages.all_graduated');
        logMessage = t('messages.all_graduated_log');
        break;
      case 'sprint':
        message = t('messages.sprint_started');
        logMessage = t('messages.sprint_started_log');
        break;
      case 'timeUp':
        message = t('messages.time_up', { min: event.minutes });
        logMessage = t('messages.time_up_log');
        break;
      default: continue;
    }
    toast(message, kind === 'milestone' ? '' : kind);
    recordLog(logMessage || message, kind);
    if (draw) addPendingDraw(message, event.playerId);
    if (player && flash) flashCard(player.id, flash);
  }
  if (events.length) {
    save();
    renderLog();
  }
  if (state.currentGame.pendingDraws.length !== drawCount) {
    renderPendingDraws();
    openDrawModal();
  }
}

// 由操作流程與計時 tick 呼叫；renderAll / updateTopbar 只讀取狀態。
async function processGameEvents() {
  checkExchangeOpening();
  const result = GameRules.evaluateGameStatus(state.currentGame, {
    elapsed: elapsedSeconds(), maxSeconds: maxGameSeconds(), sprintSeconds: SPRINT_SECONDS(),
  });
  const flagsChanged = Object.entries(result.flags).some(([key, value]) => state.currentGame[key] !== value);
  Object.assign(state.currentGame, result.flags);
  if (result.stopTimer) pauseTimerState();
  if (flagsChanged || result.stopTimer) save();
  presentGameEvents(result.events);

  if (state.currentGame.players.length && isLateReliefPhase() && !state.currentGame.reliefSweepDone) {
    // 先記錄盤點，再等待主持人確認，避免下一個 tick 重複開啟。
    state.currentGame.reliefSweepDone = true;
    save();
    await sweepReliefOnBoundary();
  }
}

// ─────────── Render: Topbar & civ bar ───────────
function updateTopbar() {
  $('#round-num').textContent = state.currentGame.roundNum;
  if ($('#turn-num-container')) $('#turn-num-container').textContent = t('ui.turn_value', { n: state.currentGame.turnNum });
  const actedEl = $('#turn-acted');
  if (actedEl) {
    if (!state.currentGame.players.length) {
      actedEl.hidden = true;
    } else {
      const acted = actedCount();
      const skipped = skippedCount();
      const pending = pendingPlayers().length;
      actedEl.hidden = false;
      actedEl.textContent = t('ui.turn_status', { acted, skipped, pending });
      actedEl.classList.toggle('is-complete', pending === 0);
    }
  }
  const started = state.currentGame.players.length > 0;
  // 開局前尚未骰出文明高度目標，顯示破折號而非佔位數字。
  $('#civ-goal').textContent = started ? state.currentGame.civGoal : '—';
  const total = totalCiv();
  $('#civ-total').textContent = total;

  const pct = Math.min(100, (total / Math.max(1, state.currentGame.civGoal)) * 100);
  $('#civ-bar-fill').style.width = pct + '%';

  const goalReached = started && total >= state.currentGame.civGoal;
  $('.civ-bar').classList.toggle('reached', goalReached);
  const civLabel = $('.civ-progress-label');
  civLabel.classList.toggle('reached', goalReached);
  civLabel.textContent = goalReached
    ? t('civ.progress_reached', { total, goal: state.currentGame.civGoal })
    : t('civ.progress_label');
  $('#fortune-total').textContent = totalFortune();
  $('#wisdom-total').textContent = totalWisdom();

  const sec = elapsedSeconds();
  $('#timer').textContent = fmt(sec);
  const timerEl = $('.timer-item .timer');
  const maxSec = maxGameSeconds();
  $('#timer-max').textContent = '/ ' + fmt(maxSec);
  timerEl.classList.toggle('warn', sec >= maxSec - GAME_CONFIG.TIME.WARNING_MINUTES * 60 && sec < maxSec);
  timerEl.classList.toggle('over', sec >= maxSec);

  // Final-15-minute sprint: surface it in the timer and a top banner.
  const sprint = sprintActive();
  timerEl.classList.toggle('sprint', sprint);
  const sprintBanner = $('#sprint-banner');
  if (sprintBanner) sprintBanner.classList.toggle('hidden', !sprint);

  const weatherBanner = $('#weather-banner');
  if (weatherBanner) {
    if (sprint || !started) {
      weatherBanner.classList.add('hidden');
    } else {
      const { phase, ev } = getPhase(state.currentGame.turnNum);
      const title = $('#weather-banner-title');
      const sub = $('#weather-banner-sub');
      const btnAdjust = $('#btn-weather-adjust');
      weatherBanner.className = 'weather-banner';
      
      if (phase === 'FORECAST' && ev && ev.lockedWeather) {
        weatherBanner.classList.remove('hidden');
        weatherBanner.classList.add('weather-forecast');
        title.textContent = t('weather.forecast_title');
        
        const expected = expectedCiv(ev.targetRound - 2, state.currentGame.civGoal);
        sub.textContent = t('weather.forecast_sub', { current: totalCiv(), expected: Math.ceil(expected) });
        btnAdjust.classList.add('hidden');
      } else if (phase === 'ADJUST' && ev && ev.lockedWeather) {
        weatherBanner.classList.remove('hidden');
        weatherBanner.classList.add(`weather-${ev.lockedWeather.toLowerCase()}`, 'is-adjust');
        title.textContent = t('weather.adjust_title');
        
        if (ev.upgraded) {
          sub.textContent = t('weather.adjust_sub_upgraded', {
            old: getWeatherLabel(ev.oldWeather) || t('weather.worse_weather'),
            new: getWeatherLabel(ev.lockedWeather),
          });
        } else {
          const ranks = { DISASTER: 0, NORMAL: 1, FAVORABLE: 2 };
          const targetCiv = GameRules.weatherUpgradeTarget(ev.lockedWeather, ev.targetRound - 2, state.currentGame.civGoal, GAME_CONFIG);
          const short = ranks[ev.lockedWeather] < 2 ? Math.max(0, targetCiv - totalCiv()) : 0;
          sub.textContent = t('weather.adjust_sub_pending', { short });
        }
        
        btnAdjust.classList.remove('hidden');
      } else if (phase === 'REPORT' && ev && ev.lockedWeather) {
        weatherBanner.classList.remove('hidden');
        weatherBanner.classList.add(`weather-${ev.lockedWeather.toLowerCase()}`);
        title.textContent = t('weather.report_heading', { weather: getWeatherLabel(ev.lockedWeather) });
        sub.textContent = t(`weather.report_${ev.lockedWeather.toLowerCase()}`);
        btnAdjust.classList.add('hidden');
      } else {
        weatherBanner.classList.add('hidden');
      }
    }
  }

  const btn = $('#btn-toggle-timer');
  btn.textContent = state.currentGame.timer.running ? t('ui.btn_pause_timer') : t('ui.btn_start_timer');

}

// ─────────── Render: Player cards ───────────

// ─────────── Stat mutations ───────────
function getPlayer(id) { return state.currentGame.players.find(p => p.id === id); }

// ─────────── 加減分 ───────────
// 一次設定 福/慧/文明 的增減量，送出後套用；衝刺階段三項自動 ×2。
let adjustTargetId = null;
function adjustInputs() {
  const out = {};
  STATS.forEach(stat => {
    const inp = document.querySelector(`#adjust-rows .adjust-row[data-stat="${stat}"] .adjust-input`);
    out[stat] = inp ? (parseInt(inp.value, 10) || 0) : 0;
  });
  return out;
}
function renderAdjustPreview() {
  const p = getPlayer(adjustTargetId); if (!p) return;
  const mult = scoreMultiplier(adjustTargetId);
  const raw = adjustInputs();
  const scaled = scaleReward(raw, mult);
  syncMultiplierBanner($('#adjust-sprint'), adjustTargetId, 'adjust.sprint');
  STATS.forEach(stat => {
    const row = document.querySelector(`#adjust-rows .adjust-row[data-stat="${stat}"]`);
    if (!row) return;
    const applied = scaled[stat] || 0;
    const next = Math.max(0, (p[stat] || 0) + applied);
    const prev = row.querySelector('.adjust-preview');
    if (raw[stat] === 0) {
      prev.textContent = t('ui.lbl_current_val', {val: p[stat] || 0});
    } else {
      const sign = applied > 0 ? '+' : '';
      prev.textContent = `${p[stat] || 0} → ${next}　(${sign}${applied})`;
    }
  });
}
function syncAdjustAsTurn(playerId) {
  const wrap = $('#adjust-as-turn-wrap');
  const box = $('#adjust-as-turn');
  if (!wrap || !box) return;
  if (hasActed(playerId)) {
    wrap.hidden = true;
    box.checked = false;
  } else {
    wrap.hidden = false;
    box.checked = true;
  }
}
function openAdjustModal(id) {
  const p = getPlayer(id); if (!p) return;
  adjustTargetId = id;
  $('#adjust-sub').textContent = p.name || t('common.player');
  STATS.forEach(stat => {
    const inp = document.querySelector(`#adjust-rows .adjust-row[data-stat="${stat}"] .adjust-input`);
    if (inp) inp.value = '0';
  });
  syncMultiplierBanner($('#adjust-sprint'), id, 'adjust.sprint');
  syncAdjustAsTurn(id);
  renderAdjustPreview();
  modals.open('adjust-modal');
}
function closeAdjustModal() {
  modals.close('adjust-modal');
  adjustTargetId = null;
}
async function applyAdjust() {
  const game = state.currentGame;
  const p = getPlayer(adjustTargetId); if (!p) { closeAdjustModal(); return; }
  const pid = p.id;
  const name = p.name || t('common.player');
  const mult = scoreMultiplier(pid);
  const scaled = scaleReward(adjustInputs(), mult);
  const hasChange = STATS.some(stat => scaled[stat]);
  if (!hasChange) { closeAdjustModal(); return; }
  const alreadyResolved = isResolved(pid);
  const markTurn = !hasActed(pid) && !!($('#adjust-as-turn') && $('#adjust-as-turn').checked);
  closeAdjustModal();   // 先關閉，若跨里程讓待抽卡 modal 乾淨地彈出
  const old = snapshotFw(p);
  const changes = await settleScoreChanges([{ playerId: pid, delta: scaled }], { source: 'normal', offerShield: true });
  if (!changes) return;
  if (changes.shieldedPlayerIds.includes(pid)) ['fortune', 'wisdom'].forEach(stat => { if (scaled[stat] < 0) scaled[stat] = 0; });
  if (state.currentGame !== game) return;
  const tag = mult.id !== null ? getWeatherLabel(mult.id) : '';
  const msg = t('messages.batch_adjust_msg', {name: name, reward: describeReward(scaled), tag: tag});
  toast(msg, 'grad');
  logEvent(msg, 'grad');
  await maybeCheckReliefAfterForcedLoss(pid, old);
  if (state.currentGame !== game) return;
  if (markTurn) markActed(pid);
  if (alreadyResolved) await maybeOfferSkipLeftover(pid);
}

// 起始點 · 回歸初心 快捷加分（基本表）。停格＝經過兩倍（福/慧）；畢業才加文明（自動判斷）。
// 卡片加成（豐盛/覺醒）此版不處理，若玩家持有請主持人手動補。
// 起始點加分的基礎獎勵（停格＝經過兩倍福慧；畢業才加文明）。
function originReward(p, stop) {
  const graduated = !!p.graduated;
  return {
    fortune: stop ? 2 : 1,
    wisdom:  stop ? 2 : 1,
    civ:     (stop ? 1 : 0) + (graduated ? 1 : 0),
  };
}
async function scoreOrigin(playerId, stop) {
  const game = state.currentGame;
  const p = getPlayer(playerId); if (!p) return;
  const mult = scoreMultiplier(playerId);
  const r = scaleReward(originReward(p, stop), mult);
  await settleScoreChanges([{ playerId, delta: r }], { source: 'normal' });
  if (state.currentGame !== game) return;
  const tag = mult.id !== null ? getWeatherLabel(mult.id) : '';
  const msg = stop
    ? t('messages.origin_stop_msg', {name: p.name || t('common.player'), reward: describeReward(r), tag: tag})
    : t('messages.origin_pass_msg', {name: p.name || t('common.player'), reward: describeReward(r), tag: tag});
  toast(msg, 'grad');
  logEvent(msg, 'grad');
  await markCardActor(playerId);
}

async function markCardActor(actorId) {
  if (!getPlayer(actorId)) return;
  const alreadyActed = hasActed(actorId);
  markActed(actorId);
  if (alreadyActed) await maybeOfferSkipLeftover(actorId);
}

// 起始點加分 modal：選 經過／停格，衝刺階段顯示 ×2 提示與加倍後的獎勵。
let originTargetId = null;
function openOriginModal(id) {
  const p = getPlayer(id); if (!p) return;
  originTargetId = id;
  const mult = scoreMultiplier(id);
  $('#origin-sub').textContent = p.name || '玩家';
  syncMultiplierBanner($('#origin-sprint'), id, 'origin.sprint');
  $('#origin-pass-desc').textContent = describeReward(scaleReward(originReward(p, false), mult));
  $('#origin-stop-desc').textContent = describeReward(scaleReward(originReward(p, true), mult));
  modals.open('origin-modal');
}
function closeOriginModal() {
  modals.close('origin-modal');
  originTargetId = null;
}
function pickOrigin(stop) {
  const id = originTargetId;
  closeOriginModal();      // 先關閉，若跨里程讓待抽卡 modal 乾淨地彈出
  if (id != null) scoreOrigin(id, stop);
}
const pendingShieldGames = new WeakSet();
async function settleScoreChanges(operations, { selfSelected = false, source = 'system', offerShield = false } = {}) {
  const game = state.currentGame;
  if (pendingShieldGames.has(game)) return null;
  let changes = GameRules.calculateScoreBatch(game.players, operations);
  const shieldedPlayerIds = [];
  if (offerShield || ['fate', 'impermanence'].includes(source)) {
    pendingShieldGames.add(game);
    try {
      for (const change of changes) {
        const p = getPlayer(change.playerId);
        if (!p.shieldTokens || !['fortune', 'wisdom'].some(stat => change.after[stat] < change.before[stat])) continue;
        const damage = Object.fromEntries(['fortune', 'wisdom'].filter(stat => change.after[stat] < change.before[stat])
          .map(stat => [stat, change.after[stat] - change.before[stat]]));
        const use = await confirmModal({ title: t('exchange.shield_prompt_title'),
          message: t(offerShield ? 'exchange.shield_adjust_prompt' : 'exchange.shield_prompt', { name: p.name, count: p.shieldTokens, reward: describeReward(damage) }),
          confirmText: t('exchange.use_shield'), cancelText: t(offerShield ? 'exchange.apply_loss' : 'exchange.keep_shield'),
          presentation: offerShield ? 'toast' : 'dialog' });
        if (state.currentGame !== game || getPlayer(p.id) !== p) return null;
        if (use && p.shieldTokens > 0) shieldedPlayerIds.push(p.id);
      }
    } finally { pendingShieldGames.delete(game); }
    operations = operations.map(op => {
      if (!shieldedPlayerIds.includes(op.playerId)) return op;
      const p = getPlayer(op.playerId);
      const next = { ...op, delta: { ...op.delta }, values: { ...op.values } };
      for (const stat of ['fortune', 'wisdom']) {
        if (next.delta[stat] < 0) next.delta[stat] = 0;
        if (next.values[stat] < p[stat]) next.values[stat] = p[stat];
      }
      return next;
    });
    changes = GameRules.calculateScoreBatch(game.players, operations);
  }
  const growth = source === 'normal' || source === 'fate' || source === 'impermanence'
    ? GameRules.evaluateInvestmentGrowth(game, changes) : { investments: game.exchange.investments, operations: [], events: [] };
  changes = GameRules.calculateScoreBatch(game.players, [...operations, ...growth.operations]);
  game.exchange.investments = growth.investments;
  for (const id of shieldedPlayerIds) {
    getPlayer(id).shieldTokens--;
    logEvent(t('exchange.shield_used', { name: getPlayer(id).name }), 'milestone');
  }
  const events = [];
  // 全場所有分數先寫入，再檢查里程與集體勝利。
  for (const change of changes) {
    const p = getPlayer(change.playerId);
    Object.assign(p, change.after);
    for (const stat of change.changedStats.filter(stat => stat !== 'civ')) {
      if (p[stat] >= reliefCfg().CLEAR_TAG_AT) p.selfSelectedLow[stat] = false;
      if (selfSelected && p[stat] < change.before[stat] && p[stat] <= reliefCfg().THRESHOLD_LATE) p.selfSelectedLow[stat] = true;
    }
  }
  for (const change of changes) {
    const p = getPlayer(change.playerId);
    if (change.changedStats.some(stat => stat !== 'civ')) {
      const progress = GameRules.evaluatePlayerProgress(p, change.before, state.currentGame.navigatorClaimed, {
        graduation: GRAD_THRESHOLD, navigator: NAV_THRESHOLDS, self: SELF_THRESHOLDS,
      });
      p.notified = progress.notified;
      p.graduated = progress.graduated;
      state.currentGame.navigatorClaimed = progress.navigatorClaimed;
      events.push(...progress.events);
    }
  }
  save();
  new Set([...changes.map(change => change.playerId), ...shieldedPlayerIds]).forEach(id => updatePlayerCard(getPlayer(id)));
  for (const event of growth.events) logEvent(t('exchange.growth_log', { name: getPlayer(event.investorId).name, target: getPlayer(event.targetId).name, count: event.quantity, turn: event.turn }), 'milestone');
  presentGameEvents(events);
  const boundary = processGameEvents();
  updateTopbar();
  exchangeUI.refresh();
  await boundary;
  changes.shieldedPlayerIds = shieldedPlayerIds;
  return changes;
}

function removePlayer(id) {
  if (state.currentGame.exchange.investments.some(item => !item.closed && [item.investorId, item.targetId].includes(id))) {
    toast(t('exchange.active_player')); return;
  }
  state.currentGame.exchange.investments = state.currentGame.exchange.investments.filter(item => ![item.investorId, item.targetId].includes(id));
  delete state.currentGame.exchange.movementThisTurn[id];
  state.currentGame.players = state.currentGame.players.filter(p => p.id !== id);
  delete actedSet()[id];
  delete skippedSet()[id];
  save();
  if (allPlayersResolved()) {
    nextTurn();
    return;
  }
  renderPlayers();
  processGameEvents();
  updateTopbar();
}

// ─────────── Setup Modal ───────────
const setupTmp = {
  count: 4,
  rolls: [], // [{ name, fortune, wisdom }]
  mode: 'new', // 'new' = brand-new game (clears history); 'next' = next round (archives current)
};

// 文明高度 ＝ 白骰 × 黑骰 ＋ 玩家人數 × 10（骰點鉗制在 1–6）
function clampDie(v) {
  const n = parseInt(v, 10);
  if (!Number.isFinite(n)) return DIE_MIN;
  return Math.min(DIE_MAX, Math.max(DIE_MIN, n));
}
function computeCivGoal(white, black, playerCount) {
  const n = playerCount || setupTmp.count || state.currentGame.players.length || 4;
  return clampDie(white) * clampDie(black) + n * CIV_PER_PLAYER;
}
async function applySetup() {
  if (setupTmp.rolls.some(r => (r.fortune || 0) === 0 || (r.wisdom || 0) === 0)) {
    const ok = await confirmModal({ title: t('setup.warn_incomplete_title'), message: t('setup.warn_incomplete_msg'), confirmText: t('setup.warn_incomplete_btn') });
    if (!ok) return;
  }
  if (!await allowReplacingUnreadableSave()) return;
  const isNext = setupTmp.mode === 'next';
  // 下一局：先把目前這一局存進歷史（之後可從歷史檢視／切回），再建立新的一局。
  if (isNext && state.currentGame.players.length) {
    const snap = snapshotRound();
    state.history.push(snap);
  }
  clearGameUi();
  state.currentGame = GameState.createGame(stateModelOptions());
  state.currentGame.roundNum = Math.max(1, parseInt($('#setup-round').value, 10) || 1);
  state.currentGame.turnNum = 1;
  state.currentGame.weatherEvents = GAME_CONFIG.WEATHER.SCHEDULE.map(ev => Object.assign({}, ev, { lockedWeather: null, upgraded: false, civAtLock: null }));
  state.currentGame.players = setupTmp.rolls.map((r, i) => makePlayer({
    name: r.name || `玩家 ${i + 1}`,
    fortune: r.fortune || 0,
    wisdom: r.wisdom || 0,
  }));
  // Pre-mark milestones already reached so we don't spam toasts on game start
  state.currentGame.players.forEach(p => {
    if (Math.max(p.fortune, p.wisdom) >= GRAD_THRESHOLD) p.notified['single_' + GRAD_THRESHOLD] = true;
    ['fortune', 'wisdom'].forEach(stat => {
      MILESTONES.forEach(m => { if (p[stat] >= m) p.notified[key(stat, m)] = true; });
    });
    // Self-Breakthrough: silent pre-mark for any player starting above dual threshold
    SELF_THRESHOLDS.forEach(n => {
      if (Math.min(p.fortune, p.wisdom) >= n) p.notified['self' + n] = true;
    });
    if (p.fortune >= GRAD_THRESHOLD && p.wisdom >= GRAD_THRESHOLD) p.graduated = true;
  });
  state.currentGame.civGoal = computeCivGoal($('#setup-civ-white').value, $('#setup-civ-black').value, setupTmp.count);
  resetTimer();
  state.currentGame._timeUpNoticed = false;
  state.currentGame._sprintNoticed = false;
  state.currentGame._civGoalNoticed = false;
  state.currentGame._allGradNoticed = false;
  state.currentGame.reliefSweepDone = false;
  if (!isNext) state.history = [];   // only a brand-new game clears history; 下一局 keeps it
  state.currentGame.navigatorClaimed = emptyNavClaim();
  // Navigator: silent pre-claim if any player already starts above each threshold (player array order = priority)
  NAV_THRESHOLDS.forEach(n => {
    const first = state.currentGame.players.find(p => Math.min(p.fortune, p.wisdom) >= n);
    if (first) state.currentGame.navigatorClaimed[n] = first.id;
  });
  state.currentGame.log = [];
  state.currentGame.pendingDraws = [];
  state.currentGame.actedThisTurn = {};
  state.currentGame.skippedThisTurn = {};
  resetSkipLeftoverPrompt();
  logEvent(isNext
    ? t('messages.round_started_log', {round: state.currentGame.roundNum, goal: state.currentGame.civGoal})
    : t('messages.round_restored_log', {round: state.currentGame.roundNum, goal: state.currentGame.civGoal}), 'grad');
  save();
  closeSetup();
  processGameEvents();
  renderAll();
  if (isNext) toast(t('messages.round_started', {round: state.currentGame.roundNum}));
}

function flagMap(key) {
  if (!state.currentGame[key] || typeof state.currentGame[key] !== 'object' || Array.isArray(state.currentGame[key])) {
    state.currentGame[key] = {};
  }
  return state.currentGame[key];
}
function actedSet() { return flagMap('actedThisTurn'); }
function skippedSet() { return flagMap('skippedThisTurn'); }
function hasActed(id) { return !!state.currentGame.actedThisTurn?.[id]; }
function hasSkipped(id) { return !!state.currentGame.skippedThisTurn?.[id]; }
function isResolved(id) { return hasActed(id) || hasSkipped(id); }
function actedCount() { return state.currentGame.players.filter(p => hasActed(p.id)).length; }
function skippedCount() { return state.currentGame.players.filter(p => hasSkipped(p.id)).length; }
function pendingPlayers() { return state.currentGame.players.filter(p => !isResolved(p.id)); }
function allPlayersResolved() {
  return state.currentGame.players.length > 0 && state.currentGame.players.every(p => isResolved(p.id));
}
function sameIdSet(a, b) {
  if (!b || a.length !== b.length) return false;
  const set = new Set(b);
  return a.every(id => set.has(id));
}
let skipLeftoverAskedIds = [];
function resetSkipLeftoverPrompt() {
  skipLeftoverAskedIds = [];
}
async function maybeOfferSkipLeftover(fromResolvedId) {
  const game = state.currentGame;
  if (!fromResolvedId || !isResolved(fromResolvedId)) return;
  const leftover = pendingPlayers();
  if (leftover.length !== 1) return;
  const leftoverIds = leftover.map(p => p.id);
  if (sameIdSet(leftoverIds, skipLeftoverAskedIds)) return;
  const names = leftover.map(p => p.name || t('common.player')).join('、');
  const ok = await confirmModal({
    title: t('confirm.skip_leftover_title'),
    message: t('confirm.skip_leftover_msg', { names, n: leftover.length }),
    confirmText: t('confirm.skip_leftover_btn'),
    cancelText: t('confirm.skip_leftover_wait'),
  });
  if (state.currentGame !== game) return;
  if (ok) {
    leftover.forEach(p => {
      delete actedSet()[p.id];
      skippedSet()[p.id] = true;
    });
    nextTurn();
    return;
  }
  skipLeftoverAskedIds = leftoverIds;
}

function refreshTurnFlags(playerId) {
  save();
  if (allPlayersResolved()) {
    nextTurn();
    return;
  }
  const card = document.querySelector(`[data-player-id="${playerId}"]`);
  if (card) applyTurnStatusUI(card, playerId);
  updateTopbar();
}
function markActed(playerId) {
  if (!getPlayer(playerId) || hasActed(playerId)) return;
  delete skippedSet()[playerId];
  actedSet()[playerId] = true;
  refreshTurnFlags(playerId);
}
function markSkipped(playerId) {
  if (!getPlayer(playerId) || hasSkipped(playerId)) return;
  delete actedSet()[playerId];
  skippedSet()[playerId] = true;
  refreshTurnFlags(playerId);
}
function toggleActed(playerId) {
  if (!getPlayer(playerId)) return;
  if (hasActed(playerId)) {
    delete actedSet()[playerId];
    refreshTurnFlags(playerId);
    return;
  }
  markActed(playerId);
}
function toggleSkipped(playerId) {
  if (!getPlayer(playerId)) return;
  if (hasSkipped(playerId)) {
    delete skippedSet()[playerId];
    refreshTurnFlags(playerId);
    return;
  }
  markSkipped(playerId);
}
async function nextTurn() {
  const game = state.currentGame;
  if (pendingShieldGames.has(game)) return;
  const closing = GameRules.closeInvestments(game, game.turnNum);
  // Settle while still in the completed round; refunds never count as growth.
  GameRules.calculateScoreBatch(game.players, closing.operations);
  game.exchange.investments = closing.investments;
  if (closing.operations.length) await settleScoreChanges(closing.operations);
  if (state.currentGame !== game) return;
  closing.events.filter(event => event.refund).forEach(event => logEvent(t('exchange.refund_log', { name: getPlayer(event.investorId).name, amount: event.refund }), 'milestone'));
  game.exchange.movementThisTurn = {};
  state.currentGame.actedThisTurn = {};
  state.currentGame.skippedThisTurn = {};
  resetSkipLeftoverPrompt();
  state.currentGame.turnNum++;
  const { phase, ev } = getPhase(state.currentGame.turnNum);
  
  if (phase === 'FORECAST' && ev && ev.lockedWeather === null) {
    ev.lockedWeather = judgeWeather(totalCiv(), state.currentGame.turnNum, state.currentGame.civGoal);
    ev.civAtLock = totalCiv();
    toast(t('weather.toast_forecast'), 'grad');
    logEvent(t('weather.toast_forecast_log'), 'grad');
  } else if (phase === 'ADJUST' && ev) {
    // 氣候調節以視窗為公告，不另 toast
  } else if (phase === 'REPORT' && ev) {
    const label = getWeatherLabel(ev.lockedWeather);
    toast(t('weather.toast_report', { weather: label }), 'grad');
    logEvent(t('weather.toast_report_log', { weather: label }), 'grad');
  } else {
    toast(t('messages.enter_turn', { n: state.currentGame.turnNum }));
  }
  const boundary = processGameEvents();
  save();
  renderAll();
  await boundary;
  if (state.currentGame !== game) return;
  if (phase === 'ADJUST' && ev) openWeatherAdjustModal();
}

// ─────────── Topbar / sidebar bindings ───────────
function bindEvents() {
  feedbackUI.bind();
  playersUI.bind();
  setupUI.bind();
  historyUI.bind();
  cardsUI.bind();
  weatherUI.bind();
  highlightUI.bind();
  exchangeUI.bind();
  $('#btn-toggle-timer').addEventListener('click', toggleTimer);
  $('#btn-next-round').addEventListener('click', () => openSetup({ mode: 'next' }));
  // 遊戲說明 modal
  $('#btn-guide').addEventListener('click', () => modals.open('guide-modal'));
  $('#guide-close').addEventListener('click', () => modals.close('guide-modal'));

  $('#btn-reset-game').addEventListener('click', async () => {
    const ok = await confirmModal({ title: t('confirm.reset_game_title'), message: t('confirm.reset_game_msg'), confirmText: t('confirm.reset'), danger: true });
    if (!ok) return;
    if (!await allowReplacingUnreadableSave()) return;
    clearGameUi();
    state = defaultState();
    save();
    processGameEvents();
    renderAll();
    openSetup();
  });
}

// ─────────── Round navigation (history archive + restore) ───────────
function snapshotRound() {
  return GameState.snapshotGame(state.currentGame, stateModelOptions());
}

// UI 草稿與待確認回呼只屬於當前局，不進入存檔或歷史。
function clearGameUi() {
  modals.cancelScope(state.currentGame);
  closeCard();
  cardDraft.currentCard = null;
  cardDraft.currentDeckKey = null;
  cardDraft.currentChoiceOpt = null;
  closeAdjustModal();
  closeOriginModal();
  resetSkipLeftoverPrompt();
}

// Switch the live game to a past round without losing the current one. The round
// you're leaving is archived into the slot the chosen round vacated (a swap), so
// every round stays available and you can switch back any time — nothing is lost.
async function restoreRound(idx) {
  const entry = state.history && state.history[idx];
  if (!entry) return;
  const currentGame = state.currentGame;
  const ok = await confirmModal({
    title: t('history.restore_title', { round: entry.roundNum }),
    message: t('confirm.next_round_msg', {round: state.currentGame.roundNum}),
    confirmText: t('history.restore_action'),
  });
  if (!ok || state.currentGame !== currentGame || state.history[idx] !== entry) return;
  const oldRound = currentGame.roundNum;
  const restored = GameState.swapHistory(state, idx, stateModelOptions());
  if (!restored) return;
  clearGameUi();
  state = restored;
  syncNextPlayerId();
  save();
  closeHistory();
  processGameEvents();
  renderAll();
  const message = t('messages.round_restored', {round: state.currentGame.roundNum, oldRound});
  toast(message + (state.currentGame.incompleteFields.length ? ' ' + t('storage.history_incomplete') : ''), 'grad');
}

// ─────────── Card draw ───────────
const DECKS = {
  action: { title: '行動指令牌', pool: [] },
  boost:  { title: '共好加速卡', pool: []  },
};
const cardDraft = { currentCard: null, currentDeckKey: null, currentChoiceOpt: null };

function drawFromDeck(deckKey) {
  const pool = DECKS[deckKey].pool;
  if (!pool.length) return null;
  let pick, tries = 0;
  do {
    pick = pool[Math.floor(Math.random() * pool.length)];
    tries++;
  } while (cardDraft.currentCard && pool.length > 1 && pick.name === cardDraft.currentCard.name && tries < 8);
  return pick;
}

// ─────────── 抉擇卡（文明反思／文明扣分）渲染與套用 ───────────
// 每張卡兩個選項；主持人依玩家實際抉擇點選其一再套用。`each` 套到每位收受者
// （含個人文明 each.civ），`civAll` 為套用到場上所有玩家的文明增減。條件卡（生態紅利）
// 依當前集體文明自動鎖定分支。衝刺階段所有增減自動 ×2。

// 一個選項在目前衝刺倍率下的實際效果。civAll＝套用到「場上所有玩家」的文明增減。
function choiceEffects(opt, playerId) {
  const mult = scoreMultiplier(playerId);
  // civAll 是數字；scoreMultiplier() 回的是 {gain,loss,id}。文明不吃天氣／終局／庇護倍率（見 applyMult）。
  return { each: scaleReward(opt.each || {}, mult), civAll: applyMult(opt.civAll || 0, 'civAll', mult), mult };
}
// 套用抉擇：`each`（含個人文明 each.civ）給每位收受者；`civAll` 套用到場上所有玩家的文明。
// 全部變更合併後夾到零。
async function applyChoiceCard(playerIds, card, optIdx) {
  const game = state.currentGame;
  const opt = (card.options || [])[optIdx];
  if (!opt) return;
  const ids = Array.isArray(playerIds) ? playerIds : [playerIds];
  const table = choiceEffects(opt);
  const names = [];
  const pending = [];
  const operations = [];
  ids.forEach(pid => {
    const p = getPlayer(pid);
    if (!p) return;
    const old = snapshotFw(p);
    const { each } = choiceEffects(opt, pid);
    operations.push({ playerId: pid, delta: each });
    names.push(p.name || t('common.player'));
    pending.push({ pid, old });
  });
  if (!names.length) return;
  const civAll = table.civAll;
  if (civAll) {
    state.currentGame.players.forEach(p => operations.push({ playerId: p.id, delta: { civ: civAll } }));
  }
  let fx = describeChoiceOption(card, opt);
  closeCard();
  const changes = await settleScoreChanges(operations, { source: card.damageSource || 'normal' });
  if (!changes) return;
  if (state.currentGame !== game) return;
  if (changes.shieldedPlayerIds.length) {
    fx = pending.map(item => {
      const { each } = choiceEffects(opt, item.pid);
      if (changes.shieldedPlayerIds.includes(item.pid)) for (const stat of ['fortune', 'wisdom']) if (each[stat] < 0) each[stat] = 0;
      return getPlayer(item.pid).name + ' ' + (describeReward(each) || t('card.no_score_change'));
    }).join('、');
    if (civAll) fx += ' · ' + t('card.collective_civ', { delta: (civAll > 0 ? '+' : '') + civAll });
  }
  const tag = table.mult.id !== null ? getWeatherLabel(table.mult.id) : '';
  const sideNote = opt.side ? '　※' + t('card.manual_side', { side: opt.side }) : '';
  const positive = describeReward(table.each).indexOf('-') === -1 && civAll >= 0;
  const msg = `${names.join('、')}「${card.name}」→ ${opt.label}　${fx}${tag}${sideNote}`;
  toast(msg, positive ? 'grad' : '');
  logEvent(msg, 'milestone');
  for (const item of pending) {
    if (state.currentGame !== game) return;
    await maybeCheckReliefAfterForcedLoss(item.pid, item.old);
  }
  if (state.currentGame !== game) return;
  await markCardActor(ids[0]);
}

// ─────────── Deck manager (import / export custom card data) ───────────

async function applyDecksImport(data) {
  const checked = DeckModel.inspect(data);
  if (!checked.ok) {
    toast(t('messages.import_fail') + '：' + t('deckValidation.location', { path: checked.error.path, reason: t(checked.error.key) }));
    return;
  }
  // 使用驗證後的獨立副本，等待確認期間呼叫者不能改動待匯入內容。
  data = checked.data;

  const actionCount = data.actionDeck
    ? Object.values(data.actionDeck).reduce((s, d) => s + d.cards.length, 0)
    : null;
  const boostCount  = data.boostDeck ? data.boostDeck.length : null;

  const parts = [];
  if (actionCount !== null) parts.push(`${t('dm.action_label')} ${actionCount} ${t('dm.count_suffix').trim()}`);
  if (boostCount  !== null) parts.push(`${t('dm.boost_label')} ${boostCount} ${t('dm.count_suffix').trim()}`);
  const ok = await confirmModal({ title: t('confirm.import_deck_title'), message: t('confirm.import_deck_msg', {parts: parts.join(' · ')}), confirmText: t('confirm.import') });
  if (!ok) return;

  const next = Object.assign({ action: null, boost: null }, state.settings.customDecks || {});
  if (data.actionDeck) next.action = data.actionDeck;
  if (data.boostDeck)  next.boost  = data.boostDeck;
  state.settings.customDecks = next;

  rebuildDecks();
  save();
  renderDeckManager();
  toast(t('messages.cards_updated'), 'grad');
}

async function resetDecksToDefault() {
  if (!state.settings.customDecks || (!state.settings.customDecks.action && !state.settings.customDecks.boost)) {
    toast(t('messages.already_default_deck'));
    return;
  }
  const ok = await confirmModal({ title: t('confirm.reset_deck_title'), message: t('confirm.reset_deck_msg'), confirmText: t('confirm.reset'), danger: true });
  if (!ok) return;
  state.settings.customDecks = { action: null, boost: null };
  rebuildDecks();
  save();
  renderDeckManager();
  toast(t('messages.reset_to_default'), 'grad');
}

// Apply a card's reward to one player, or — for 「雙方」boost cards — to several
// at once (each recipient gets the full per-player reward).
async function applyCardReward(playerIds, card) {
  const game = state.currentGame;
  if (!card) return;
  const ids = Array.isArray(playerIds) ? playerIds : [playerIds];
  const applied = [];
  ids.forEach(pid => {
    const p = getPlayer(pid);
    if (!p) return;
    const old = snapshotFw(p);
    const mult = scoreMultiplier(pid);
    const r = scaleReward(card.reward || {}, mult);
    applied.push({ p, r, mult, old, pid });
  });
  if (!applied.length) return;
  closeCard();
  const changes = await settleScoreChanges(applied.map(a => ({ playerId: a.pid, delta: a.r })), { source: card.damageSource || 'normal' });
  if (!changes) return;
  for (const a of applied) if (changes.shieldedPlayerIds.includes(a.pid)) ['fortune', 'wisdom'].forEach(stat => { if (a.r[stat] < 0) a.r[stat] = 0; });
  if (state.currentGame !== game) return;
  const names = applied.map(a => a.p.name || t('common.player'));
  const first = applied[0];
  const sameReward = applied.every(a => describeReward(a.r) === describeReward(first.r) && a.mult.id === first.mult.id);
  let rewardText;
  let tag = '';
  if (!sameReward) {
    rewardText = applied.map(a =>
      `${a.p.name || t('common.player')} ${describeReward(a.r) || card.rewardText || ''}`
    ).join('　');
  } else if (first.mult.id !== null || changes.shieldedPlayerIds.length) {
    rewardText = describeReward(first.r);
    tag = first.mult.id !== null ? getWeatherLabel(first.mult.id) : '';
  } else {
    rewardText = ids.length > 1 ? t('messages.both_receive', {reward: describeReward(first.r)}) : card.rewardText;
  }
  const msg = t('messages.card_completed', {names: names.join('、'), card: card.name, reward: rewardText, tag: tag});
  toast(msg, 'grad');
  logEvent(msg, 'grad');
  for (const a of applied) {
    if (state.currentGame !== game) return;
    await maybeCheckReliefAfterForcedLoss(a.pid, a.old);
  }
  if (state.currentGame !== game) return;
  await markCardActor(ids[0]);
}

// ─────────── 福慧交易所 ───────────
function checkExchangeOpening() {
  const game = state.currentGame;
  if (game.exchange.opened) return;
  const threshold = GAME_CONFIG.EXCHANGE.OPEN_THRESHOLD;
  const player = game.players.find(p => (p.fortune >= threshold && p.wisdom >= threshold) || p.notified['self' + threshold] === true);
  if (!player) return;
  Object.assign(game.exchange, { opened: true, openerId: player.id, openedTurn: game.turnNum });
  save();
  logEvent(t('exchange.open_message', { name: player.name }), 'milestone');
  exchangeUI.announce(player);
  renderPlayers();
  exchangeUI.refresh();
}

const pendingPurchases = new WeakSet();
async function purchaseExchange(playerId, cart) {
  const game = state.currentGame, turn = game.turnNum;
  if (pendingPurchases.has(game) || pendingShieldGames.has(game)) return false;
  pendingPurchases.add(game);
  try {
    let plan = GameRules.planExchangePurchase(game, playerId, cart);
    const p = getPlayer(playerId);
    const low = ['fortune', 'wisdom'].filter(stat => plan.cost[stat] && p[stat] - plan.cost[stat] <= reliefCfg().THRESHOLD_LATE);
    if (low.length && !await confirmModal({ title: t('confirm.title'), message: t('exchange.low_warning', { stats: low.map(STAT_LABEL).join('、') }), danger: true })) return false;
    if (state.currentGame !== game || game.turnNum !== turn || pendingShieldGames.has(game)) return false;
    // Revalidate after confirmation; commit inventory and score without an intervening await.
    plan = GameRules.planExchangePurchase(game, playerId, cart);
    p.navigationTokens += plan.navigation;
    p.shieldTokens += plan.shield;
    p.investmentTokens += plan.investment;
    await settleScoreChanges(plan.operations, { selfSelected: true });
    if (state.currentGame !== game) return false;
    logEvent(t('exchange.purchase_log', { name: p.name, navigation: plan.navigation, shield: plan.shield, investment: plan.investment }), 'milestone');
    renderAll();
    return true;
  } catch (error) {
    if (!error.message.startsWith('exchange.')) throw error;
    toast(t(error.message));
    return false;
  } finally { pendingPurchases.delete(game); }
}

async function activateInvestment(playerId, targetId, quantity) {
  const game = state.currentGame;
  if (pendingPurchases.has(game) || pendingShieldGames.has(game)) return false;
  pendingPurchases.add(game);
  try {
    const plan = GameRules.planInvestmentActivation(game, playerId, targetId, quantity);
    const p = getPlayer(playerId);
    p.investmentTokens -= quantity;
    game.exchange.investments.push({ id: game.exchange.nextInvestmentId++, investorId: playerId, targetId,
      quantity, startTurn: game.turnNum, rewardedTurns: [], closed: false });
    // The gift is a service effect, not normal game growth. The fee was paid when buying inventory.
    await settleScoreChanges(plan.operations);
    if (state.currentGame !== game) return false;
    logEvent(t('exchange.activation_log', { name: p.name, target: getPlayer(targetId).name, count: quantity, turn: game.turnNum }), 'milestone');
    renderAll();
    return true;
  } catch (error) {
    if (!error.message.startsWith('exchange.')) throw error;
    toast(t(error.message)); return false;
  } finally { pendingPurchases.delete(game); }
}

function useNavigation(playerId, steps) {
  const game = state.currentGame, p = getPlayer(playerId);
  if (!GameRules.canTrade(game, playerId) || !p.navigationTokens || !Number.isInteger(steps) || steps < 1 || steps > 6 || pendingPurchases.has(game) || pendingShieldGames.has(game)) return false;
  p.navigationTokens--;
  game.exchange.movementThisTurn[playerId] = { mode: 'navigation', steps };
  logEvent(t('exchange.navigation_log', { name: p.name, steps }), 'milestone');
  save();
  modals.close('exchange-modal');
  renderAll();
  toast(t('exchange.navigation_log', { name: p.name, steps }), 'grad');
  return true;
}

// ─────────── Render all ───────────
function renderAll() {
  updateTopbar();
  renderPlayers();
  renderPendingDraws();
  renderLog();
  refreshHistoryButton();
  exchangeUI.refresh();
}

// ─────────── Timer loop ───────────
function startTimerLoop() {
  setInterval(() => {
    if (state.currentGame.timer.running) {
      processGameEvents();
      updateTopbar();
    }
  }, 1000);
}

// ─────────── Service worker ───────────
function registerSW() {
  pwaUI.bind();
  return pwaClient.start();
}

// ─────────── App version ───────────
// Stamp APP_VERSION into every spot tagged with [data-app-version].
function renderVersion() {
  $$('[data-app-version]').forEach((el) => { el.textContent = 'v' + APP_VERSION; });
}

// ─────────── Init ───────────
function init() {
  const hasGame = load();
  // Rebuild deck pools from possibly-custom state.settings.customDecks
  rebuildDecks();
  syncNextPlayerId();
  renderVersion();
  bindEvents();
  processGameEvents();
  renderAll();
  startTimerLoop();
  registerSW();
  if (!hasGame) openSetup();
}

document.addEventListener('DOMContentLoaded', async () => {
  await window.i18n.init();
  init();
});

window.addEventListener('languageChanged', () => {
  showStorageWarning(storageWarningKey);
  pwaUI.render(pwaClient.status());
  rebuildDecks();
  renderAll();
});

// ─────────── Weather Adjust Modal ───────────

function chargeWeatherAdjust(contributions, spent) {
  let remain = spent;
  return contributions.map(c => {
    const f = Math.min(c.f, remain);
    remain -= f;
    const w = Math.min(c.w, remain);
    remain -= w;
    return { id: c.id, name: c.name, f, w };
  });
}

async function submitWeatherAdjust() {
  const game = state.currentGame;
  const { phase, ev } = getPhase(state.currentGame.turnNum);
  if (phase !== 'ADJUST' || !ev) {
    modals.close('weather-adjust-modal');
    return;
  }

  const { contributions, civGain, rate } = readWeatherAdjustInputs();
  if (civGain <= 0) {
    toast(t('weather.adjust_none', { rate }));
    return;
  }

  const spent = civGain * rate;
  const charged = chargeWeatherAdjust(contributions, spent);

  // v2.1: 自選低點防策略警告 — 若花費會讓分數降至 3 點以下（含 3），跳出確認提醒
  const selfLowWarnings = [];
  charged.forEach(c => {
    const p = getPlayer(c.id);
    if (!p) return;
    const statsWarned = [];
    if (c.f && (p.fortune - c.f) <= reliefCfg().THRESHOLD_LATE) statsWarned.push(STAT_LABEL('fortune'));
    if (c.w && (p.wisdom - c.w) <= reliefCfg().THRESHOLD_LATE) statsWarned.push(STAT_LABEL('wisdom'));
    if (statsWarned.length) {
      selfLowWarnings.push(t('weather.player_low_stats', { name: p.name || t('common.player'), stats: statsWarned.join(t('common.list_separator')) }));
    }
  });

  if (selfLowWarnings.length > 0) {
    const warnMsg = t('weather.adjust_self_low_warn', { stat: selfLowWarnings.join(t('common.list_separator')) });
    const proceed = await confirmModal({
      title: t('confirm.title'),
      message: warnMsg,
      confirmText: t('confirm.btn_ok'),
      cancelText: t('confirm.btn_cancel'),
      danger: true
    });
    if (!proceed || state.currentGame !== game) return;
  }

  await settleScoreChanges([
    ...charged.map(c => ({ playerId: c.id, delta: { fortune: -c.f, wisdom: -c.w } })),
    ...collectiveCivChanges(civGain),
  ], { selfSelected: true });
  if (state.currentGame !== game) return;

  const names = charged.filter(c => c.f || c.w).map(c => c.name).join('、');
  logEvent(t('weather.adjust_spent_log', { names, cost: spent, civ: civGain }), 'milestone');

  const now = judgeWeather(totalCiv(), ev.targetRound - 2, state.currentGame.civGoal);
  const ranks = { DISASTER: 0, NORMAL: 1, FAVORABLE: 2 };
  if (!ev.upgraded && ranks[now] > ranks[ev.lockedWeather]) {
    const nextRank = Math.min(ranks[ev.lockedWeather] + 1, 2);
    ev.oldWeather = ev.lockedWeather;
    ev.lockedWeather = Object.keys(ranks).find(k => ranks[k] === nextRank);
    ev.upgraded = true;
    const msg = t('weather.adjust_sub_upgraded', { old: getWeatherLabel(ev.oldWeather), new: getWeatherLabel(ev.lockedWeather) });
    toast(msg, 'grad');
    logEvent(msg, 'grad');
  } else if (ev.upgraded) {
    toast(t('weather.adjust_spent_log', { names, cost: spent, civ: civGain }));
  } else {
    const msg = t('weather.adjust_fail', { cost: spent });
    toast(msg);
    logEvent(msg);
  }

  modals.close('weather-adjust-modal');
  save();
  renderAll();
}


function renamePlayer(id, name) {
  const p = getPlayer(id); if (!p) return;
  p.name = name; save(); renderLog();
}
async function requestRemovePlayer(id) {
  const game = state.currentGame, p = getPlayer(id); if (!p) return;
  const ok = await confirmModal({ title: t('confirm.remove_player_title'), message: t('confirm.remove_player_msg', {name: p.name || t('common.player')}), confirmText: t('confirm.remove'), danger: true });
  if (ok && state.currentGame === game && getPlayer(id) === p) removePlayer(id);
}
function resolveAllDraws() {
  state.currentGame.pendingDraws = []; save(); renderPendingDraws();
}
// UI 入口只轉交呈現；流程仍透過同一入口呼叫。
function showReliefModal(...args) { return feedbackUI.showReliefModal(...args); }
function toast(...args) { return feedbackUI.toast(...args); }
function confirmModal(...args) { return feedbackUI.confirmModal(...args); }
function renderLog(...args) { return feedbackUI.renderLog(...args); }
function renderDrawModal(...args) { return feedbackUI.renderDrawModal(...args); }
function openDrawModal(...args) { return feedbackUI.openDrawModal(...args); }
function renderPendingDraws(...args) { return feedbackUI.renderPendingDraws(...args); }
function syncMultiplierBanner(...args) { return playersUI.syncMultiplierBanner(...args); }
function flashCard(...args) { return playersUI.flashCard(...args); }
function renderPlayers(...args) { return playersUI.renderPlayers(...args); }
function updatePlayerCard(...args) { return playersUI.updatePlayerCard(...args); }
function applyTurnStatusUI(...args) { return playersUI.applyTurnStatusUI(...args); }
function openSetup(...args) { return setupUI.openSetup(...args); }
function closeSetup(...args) { return setupUI.closeSetup(...args); }
function refreshHistoryButton(...args) { return historyUI.refreshHistoryButton(...args); }
function closeHistory(...args) { return historyUI.closeHistory(...args); }
function closeCard(...args) { return cardsUI.closeCard(...args); }
function describeChoiceOption(...args) { return cardsUI.describeChoiceOption(...args); }
function renderDeckManager(...args) { return cardsUI.renderDeckManager(...args); }
function readWeatherAdjustInputs(...args) { return weatherUI.readWeatherAdjustInputs(...args); }
function openWeatherAdjustModal(...args) { return weatherUI.openWeatherAdjustModal(...args); }

// ─────────── Feature UI composition ───────────
const feedbackUI = FeedbackUI.create({
  reliefCfg: (...args) => reliefCfg(...args),
  STAT_LABEL: (...args) => STAT_LABEL(...args),
  t: (...args) => t(...args),
  getGame: () => state.currentGame,
  modals,
  $: (...args) => $(...args),
  clearTimeout,
  setTimeout,
  window,
  escapeHtml: (...args) => escapeHtml(...args),
  fmt: (...args) => fmt(...args),
  resolvePendingDraw: (...args) => resolvePendingDraw(...args),
  resolveAllDraws
});

const playersUI = PlayersUI.create({
  scoreMultiplier: (...args) => scoreMultiplier(...args),
  t: (...args) => t(...args),
  getWeatherLabel: (...args) => getWeatherLabel(...args),
  playerInShelter: (...args) => playerInShelter(...args),
  shelterTurnsRemaining: (...args) => shelterTurnsRemaining(...args),
  escapeHtml: (...args) => escapeHtml(...args),
  document,
  setTimeout,
  $: (...args) => $(...args),
  getGame: () => state.currentGame,
  openSetup: (...args) => openSetup(...args),
  hasActed: (...args) => hasActed(...args),
  hasSkipped: (...args) => hasSkipped(...args),
  comprehensiveScore: (...args) => comprehensiveScore(...args),
  STATS,
  openOriginModal: (...args) => openOriginModal(...args),
  openAdjustModal: (...args) => openAdjustModal(...args),
  toggleActed: (...args) => toggleActed(...args),
  toggleSkipped: (...args) => toggleSkipped(...args),
  requestRemovePlayer,
  renamePlayer,
  GRAD_THRESHOLD,
  MILESTONES,
  STAT_LABEL: (...args) => STAT_LABEL(...args),
  closeOriginModal, closeAdjustModal, pickOrigin, applyAdjust, renderAdjustPreview,
  openExchange: id => exchangeUI.open(id)
});

const exchangeUI = ExchangeUI.create({ $, t: (...args) => t(...args), escapeHtml, modals, getGame: () => state.currentGame,
  canTrade: (game, id) => GameRules.canTrade(game, id), config: GAME_CONFIG.EXCHANGE,
  purchase: purchaseExchange, activateInvestment, useNavigation });

const setupUI = SetupUI.create({
  $: (...args) => $(...args),
  $$: (...args) => $$(...args),
  window,
  t: (...args) => t(...args),
  roll: (...args) => roll(...args),
  getSetup: () => setupTmp,
  clampDie: (...args) => clampDie(...args),
  computeCivGoal: (...args) => computeCivGoal(...args),
  getGame: () => state.currentGame,
  DIE_MIN,
  modals,
  escapeHtml: (...args) => escapeHtml(...args),
  applySetup: (...args) => applySetup(...args)
});

const historyUI = HistoryUI.create({
  document,
  getState: () => state,
  modals,
  $: (...args) => $(...args),
  t: (...args) => t(...args),
  fmt: (...args) => fmt(...args),
  window,
  escapeHtml: (...args) => escapeHtml(...args),
  comprehensiveScore: (...args) => comprehensiveScore(...args),
  $$: (...args) => $$(...args),
  restoreRound: (...args) => restoreRound(...args)
});

const cardsUI = CardsUI.create({
  getDecks: () => DECKS,
  draft: cardDraft,
  drawFromDeck: (...args) => drawFromDeck(...args),
  $: (...args) => $(...args),
  t: (...args) => t(...args),
  modals,
  getGame: () => state.currentGame,
  escapeHtml: (...args) => escapeHtml(...args),
  comprehensiveScore: (...args) => comprehensiveScore(...args),
  toast: (...args) => toast(...args),
  applyCardReward: (...args) => applyCardReward(...args),
  scoreMultiplier: (...args) => scoreMultiplier(...args),
  describeReward: (...args) => describeReward(...args),
  scaleReward: (...args) => scaleReward(...args),
  getWeatherLabel: (...args) => getWeatherLabel(...args),
  choiceEffects: (...args) => choiceEffects(...args),
  totalCiv: (...args) => totalCiv(...args),
  $$: (...args) => $$(...args),
  applyChoiceCard: (...args) => applyChoiceCard(...args),
  getActionDeck: (...args) => getActionDeck(...args),
  getBoostDeck: (...args) => getBoostDeck(...args),
  getState: () => state,
  document,
  setTimeout,
  applyDecksImport: (...args) => applyDecksImport(...args),
  resetDecksToDefault: (...args) => resetDecksToDefault(...args)
});

const weatherUI = WeatherUI.create({
  GAME_CONFIG,
  $$: (...args) => $$(...args),
  getPlayer: (...args) => getPlayer(...args),
  t: (...args) => t(...args),
  getPhase: (...args) => getPhase(...args),
  getGame: () => state.currentGame,
  modals,
  $: (...args) => $(...args),
  getWeatherLabel: (...args) => getWeatherLabel(...args),
  escapeHtml: (...args) => escapeHtml(...args),
  chargeWeatherAdjust: (...args) => chargeWeatherAdjust(...args),
  totalCiv: (...args) => totalCiv(...args),
  judgeWeather: (...args) => judgeWeather(...args),
  GameRules,
  submitWeatherAdjust
});

const highlightUI = HighlightUI.create({
  $: (...args) => $(...args),
  modals,
  t: (...args) => t(...args),
  getRenderer: () => window.html2canvas,
  toast: (...args) => toast(...args),
  document
});

const pwaUI = PwaUI.create({ $, t: (...args) => t(...args),
  apply: () => pwaClient.apply(), defer: () => pwaClient.defer(), retry: () => pwaClient.check() });
const pwaClient = PwaClient.create({
  serviceWorker: typeof navigator === 'object' ? navigator.serviceWorker : null,
  release: typeof PWA_RELEASE === 'object' ? PWA_RELEASE : null,
  events: window, canReload: () => modals.stack().length === 0,
  beforeReload: () => saveNow(), onStatus: status => pwaUI.render(status),
  reload: () => window.location.reload(), setTimeout, clearTimeout,
});
