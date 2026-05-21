'use strict';

// ─────────────────────────────────────────────────────────────────────────
// 福慧大富翁 Dashboard
// ─────────────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'fuhui-dashboard-state-v1';
const MAX_GAME_SECONDS = 100 * 60;
const GRAD_THRESHOLD = 50;
const MILESTONES = [25, 35, 45, 50];
const NAV_THRESHOLDS = [15, 35, 55];   // 領航者際遇：場上首位福慧雙達者
const SELF_THRESHOLDS = [25, 45];      // 自我突破際遇：任一玩家福慧雙達者
const STATS = ['fortune', 'wisdom', 'civ'];
const STAT_LABEL = { fortune: '福報', wisdom: '智慧', civ: '文明' };

function emptyNavClaim() {
  return NAV_THRESHOLDS.reduce((o, n) => (o[n] = null, o), {});
}

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

// ─────────── State ───────────
const defaultState = () => ({
  roundNum: 1,
  civGoal: 30,
  timer: { accumulated: 0, lastStartedAt: null, running: false },
  players: [],
  log: [],
  history: [],
  navigatorClaimed: emptyNavClaim(),
});

let state = defaultState();

function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_) {}
}
function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.players)) return false;
    state = Object.assign(defaultState(), parsed);
    // Migrate v1 single-snapshot undo to v2 history array
    if (!Array.isArray(state.history)) state.history = [];
    if (state.previousRound) {
      state.history.push(state.previousRound);
      delete state.previousRound;
    }
    // Ensure navigatorClaimed shape (older saves predate this field)
    state.navigatorClaimed = Object.assign(emptyNavClaim(), state.navigatorClaimed || {});
    if (state.timer.running) {
      state.timer.lastStartedAt = Date.now();
    }
    return state.players.length > 0;
  } catch (_) { return false; }
}

// ─────────── Players ───────────
let nextPlayerId = 1;
function makePlayer({ name = '', fortune = 0, wisdom = 0 } = {}) {
  return {
    id: 'p' + (nextPlayerId++),
    name,
    fortune,
    wisdom,
    civ: 0,
    graduated: false,
    notified: {},
  };
}

function totalCiv() {
  return state.players.reduce((s, p) => s + (p.civ || 0), 0);
}
function totalFortune() {
  return state.players.reduce((s, p) => s + (p.fortune || 0), 0);
}
function totalWisdom() {
  return state.players.reduce((s, p) => s + (p.wisdom || 0), 0);
}
function comprehensiveScore(p) {
  return (p.fortune || 0) + (p.wisdom || 0) + (p.civ || 0) * 2;
}

// ─────────── Dice ───────────
function roll(sides) {
  return 1 + Math.floor(Math.random() * sides);
}
function animateNumber(el, finalValue, durationMs = 400) {
  const ticks = 8;
  const interval = durationMs / ticks;
  let i = 0;
  el.classList.add('rolling');
  const id = setInterval(() => {
    i++;
    if (i >= ticks) {
      clearInterval(id);
      el.textContent = String(finalValue);
      el.classList.remove('rolling');
    } else {
      el.textContent = String(1 + Math.floor(Math.random() * Math.max(2, finalValue + 2)));
    }
  }, interval);
}

// ─────────── Time ───────────
function elapsedSeconds() {
  const t = state.timer;
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
  if (state.timer.running) return;
  state.timer.running = true;
  state.timer.lastStartedAt = Date.now();
  save();
  updateTopbar();
}
function pauseTimer() {
  if (!state.timer.running) return;
  const now = Date.now();
  state.timer.accumulated = (state.timer.accumulated || 0) +
    Math.floor((now - state.timer.lastStartedAt) / 1000);
  state.timer.lastStartedAt = null;
  state.timer.running = false;
  save();
  updateTopbar();
}
function toggleTimer() {
  state.timer.running ? pauseTimer() : startTimer();
}
function resetTimer() {
  state.timer = { accumulated: 0, lastStartedAt: null, running: false };
}

// ─────────── Toasts & log ───────────
let toastTimer;
function toast(msg, kind = '') {
  const el = $('#toast');
  el.textContent = msg;
  el.className = 'toast ' + kind;
  void el.offsetWidth;
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 3200);
}
function logEvent(text, kind = '') {
  state.log.unshift({ text, kind, t: elapsedSeconds() });
  if (state.log.length > 40) state.log.pop();
  renderLog();
}
function renderLog() {
  const ul = $('#milestone-log');
  if (!state.log.length) {
    ul.innerHTML = '<li class="empty">尚無觸發</li>';
    return;
  }
  ul.innerHTML = state.log.map(e =>
    `<li class="${e.kind}">${escapeHtml(e.text)}<span class="ml-time">${fmt(e.t)}</span></li>`
  ).join('');
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ─────────── Milestones & Graduation ───────────
function key(stat, m) { return stat[0] + m; } // e.g. f25, w50

function processStatChange(player, stat, oldVal, newVal) {
  if (stat === 'civ') return;
  for (const m of MILESTONES) {
    const k = key(stat, m);
    if (oldVal < m && newVal >= m && !player.notified[k]) {
      player.notified[k] = true;
      const msg = m === 50
        ? `${player.name || '玩家'} ${STAT_LABEL[stat]} 達 50　抽卡、可宣告畢業`
        : `${player.name || '玩家'} ${STAT_LABEL[stat]} 達 ${m}　抽里程際遇卡`;
      toast(msg, m === 50 ? 'grad' : '');
      logEvent(msg, m === 50 ? 'grad' : 'milestone');
      flashCard(player.id);
    }
    if (oldVal >= m && newVal < m && player.notified[k] && m !== 50) {
      player.notified[k] = false;
    }
  }
  checkGraduation(player);
}

// Dual-stat milestones (福 AND 慧 both ≥ N)
function checkDualMilestones(player) {
  const both = Math.min(player.fortune || 0, player.wisdom || 0);

  // 領航者際遇 — first player in the round to satisfy each threshold claims it
  for (const n of NAV_THRESHOLDS) {
    if (both >= n && state.navigatorClaimed[n] == null) {
      state.navigatorClaimed[n] = player.id;
      const msg = `領航者際遇　${player.name || '玩家'} 率先 福慧雙達 ${n}　抽 1 張`;
      toast(msg, 'grad');
      logEvent(msg, 'grad');
      flashCard(player.id, 'grad');
    }
  }

  // 自我突破際遇 — every player who crosses; can re-fire after dropping below
  for (const n of SELF_THRESHOLDS) {
    const k = 'self' + n;
    if (both >= n && !player.notified[k]) {
      player.notified[k] = true;
      const msg = `自我突破際遇　${player.name || '玩家'} 福慧雙達 ${n}　抽 1 張`;
      toast(msg);
      logEvent(msg, 'milestone');
      flashCard(player.id);
    } else if (both < n && player.notified[k]) {
      player.notified[k] = false;
    }
  }
}

function checkGraduation(player) {
  const meets = player.fortune >= GRAD_THRESHOLD && player.wisdom >= GRAD_THRESHOLD;
  if (meets && !player.graduated) {
    player.graduated = true;
    const msg = `${player.name || '玩家'} 完成福慧雙修、畢業`;
    toast(msg, 'grad');
    logEvent(msg, 'grad');
    flashCard(player.id, 'grad');
  } else if (!meets && player.graduated) {
    player.graduated = false;
    const msg = `${player.name || '玩家'} 資格降級（福或慧 < 50）`;
    toast(msg);
    logEvent(msg);
  }
}

function flashCard(playerId, cls = 'pulse') {
  const card = document.querySelector(`[data-player-id="${playerId}"]`);
  if (!card) return;
  card.classList.remove(cls);
  void card.offsetWidth;
  card.classList.add(cls);
  setTimeout(() => card.classList.remove(cls), 1400);
}

// ─────────── Render: Topbar & civ bar ───────────
function updateTopbar() {
  $('#round-num').textContent = state.roundNum;
  $('#civ-goal').textContent = state.civGoal;
  const total = totalCiv();
  $('#civ-total').textContent = total;

  const pct = Math.min(100, (total / Math.max(1, state.civGoal)) * 100);
  $('#civ-bar-fill').style.width = pct + '%';

  $('#fortune-total').textContent = totalFortune();
  $('#wisdom-total').textContent = totalWisdom();

  const sec = elapsedSeconds();
  $('#timer').textContent = fmt(sec);
  const timerEl = $('.timer-item .timer');
  timerEl.classList.toggle('warn', sec >= 80 * 60 && sec < MAX_GAME_SECONDS);
  timerEl.classList.toggle('over', sec >= MAX_GAME_SECONDS);

  const btn = $('#btn-toggle-timer');
  btn.textContent = state.timer.running ? '暫停' : '開始';

  if (sec >= MAX_GAME_SECONDS && !state._timeUpNoticed) {
    state._timeUpNoticed = true;
    pauseTimer();
    toast('100 分鐘到、請進行最終結算', 'grad');
    logEvent('時間到 — 進行最終結算', 'grad');
  }
}

// ─────────── Render: Player cards ───────────
function renderPlayers() {
  const grid = $('#players');
  grid.innerHTML = '';
  grid.style.setProperty('--cols', state.players.length <= 4 ? 2 : 3);
  if (!state.players.length) {
    grid.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">○</div>
        <h3>尚未開局</h3>
        <p>點右上「設定」開始新一局《福慧大富翁》。</p>
        <button class="btn btn-primary" id="empty-setup-btn">開新局</button>
      </div>`;
    $('#empty-setup-btn').addEventListener('click', openSetup);
    return;
  }
  state.players.forEach(p => grid.appendChild(buildPlayerCard(p)));
}

function buildPlayerCard(p) {
  const card = document.createElement('article');
  card.className = 'player-card' + (p.graduated ? ' graduated' : '');
  card.dataset.playerId = p.id;

  const total = comprehensiveScore(p);
  const milestoneAlert = nextActiveMilestone(p);

  card.innerHTML = `
    ${milestoneAlert ? `<div class="milestone-flag">${milestoneAlert}</div>` : ''}
    <header class="pc-head">
      <input class="pc-name" value="${escapeHtml(p.name)}" placeholder="玩家名稱" maxlength="10" />
      <span class="pc-hat" title="已畢業">畢業</span>
      <div class="pc-total">
        <span>綜合</span>
        <strong>${total}</strong>
      </div>
    </header>

    ${STATS.map(stat => statRow(p, stat)).join('')}

    <footer class="pc-foot">
      <span class="pc-status">${p.graduated ? '已畢業　持續共好' : statusHint(p)}</span>
      <button class="pc-remove" data-act="remove">移除</button>
    </footer>
  `;

  // Event delegation
  card.addEventListener('click', (e) => {
    const t = e.target;
    if (t.matches('.tap')) {
      const stat = t.dataset.stat;
      const delta = parseInt(t.dataset.delta, 10);
      adjustStat(p.id, stat, delta);
    } else if (t.matches('[data-act="remove"]')) {
      if (confirm(`移除「${p.name || '玩家'}」？`)) removePlayer(p.id);
    }
  });

  const nameInput = $('.pc-name', card);
  nameInput.addEventListener('change', () => {
    p.name = nameInput.value.trim();
    save();
    renderLog();
  });

  STATS.forEach(stat => {
    const numEl = $(`.stat-${stat} .stat-num`, card);
    numEl.addEventListener('focus', () => numEl.select());
    numEl.addEventListener('change', () => {
      const v = parseInt(numEl.value, 10);
      if (Number.isFinite(v)) setStat(p.id, stat, v);
      else numEl.value = String(p[stat]);
    });
  });

  return card;
}

function nextActiveMilestone(p) {
  // Show a small badge if fortune or wisdom is at exactly a milestone and not yet 50
  for (const stat of ['fortune', 'wisdom']) {
    for (const m of [25, 35, 45]) {
      const k = key(stat, m);
      if (p[stat] >= m && p[stat] < m + 5 && p.notified[k]) {
        return `${STAT_LABEL[stat]} ${m}　抽卡`;
      }
    }
  }
  return null;
}

function statusHint(p) {
  if (p.fortune >= 45 && p.wisdom >= 45) return '即將畢業';
  if (p.fortune >= 35 || p.wisdom >= 35) return '中段修煉';
  return '修煉中';
}

function statRow(p, stat) {
  const v = p[stat];
  const max = stat === 'civ' ? Math.max(20, state.civGoal) : 60;
  const pct = Math.min(100, (v / max) * 100);
  const marks = stat === 'civ' ? '' : MILESTONES.map(m => {
    const pos = (m / max) * 100;
    return `<span class="stat-mark ${v >= m ? 'reached' : ''}" data-mark="${m}" style="left:${pos}%"></span>`;
  }).join('');
  return `
    <div class="stat-row stat-${stat}">
      <div class="stat-label">${STAT_LABEL[stat]}</div>
      <div class="stat-bar">
        <div class="stat-bar-fill" style="width:${pct}%"></div>
        ${marks}
      </div>
      <button class="tap tap-minus" data-stat="${stat}" data-delta="-1" aria-label="減少">−</button>
      <input class="stat-num" type="number" inputmode="numeric" value="${v}" />
      <button class="tap tap-plus" data-stat="${stat}" data-delta="1" aria-label="增加">＋</button>
    </div>
  `;
}

// ─────────── Stat mutations ───────────
function getPlayer(id) { return state.players.find(p => p.id === id); }

function adjustStat(playerId, stat, delta) {
  const p = getPlayer(playerId); if (!p) return;
  setStat(playerId, stat, (p[stat] || 0) + delta);
}
function setStat(playerId, stat, value) {
  const p = getPlayer(playerId); if (!p) return;
  const old = p[stat] || 0;
  p[stat] = Math.max(0, value | 0);
  if (stat !== 'civ') {
    processStatChange(p, stat, old, p[stat]);
    checkDualMilestones(p);
  }
  save();
  updatePlayerCard(p);
  updateTopbar();
}

function updatePlayerCard(p) {
  const card = document.querySelector(`[data-player-id="${p.id}"]`);
  if (!card) { renderPlayers(); return; }

  card.classList.toggle('graduated', !!p.graduated);
  card.querySelector('.pc-total strong').textContent = comprehensiveScore(p);

  STATS.forEach(stat => {
    const row = card.querySelector(`.stat-${stat}`);
    if (!row) return;
    const v = p[stat];
    const max = stat === 'civ' ? Math.max(20, state.civGoal) : 60;
    const pct = Math.min(100, (v / max) * 100);
    const numEl = row.querySelector('.stat-num');
    if (document.activeElement !== numEl) numEl.value = v;
    row.querySelector('.stat-bar-fill').style.width = pct + '%';
    row.querySelectorAll('.stat-mark').forEach(mark => {
      mark.classList.toggle('reached', v >= +mark.dataset.mark);
    });
  });

  card.querySelector('.pc-status').textContent =
    p.graduated ? '已畢業　持續共好' : statusHint(p);

  const existingFlag = card.querySelector('.milestone-flag');
  const flagText = nextActiveMilestone(p);
  if (existingFlag) existingFlag.remove();
  if (flagText) {
    const div = document.createElement('div');
    div.className = 'milestone-flag';
    div.textContent = flagText;
    card.insertBefore(div, card.firstChild);
  }
}

function removePlayer(id) {
  state.players = state.players.filter(p => p.id !== id);
  save();
  renderPlayers();
  updateTopbar();
}

// ─────────── Setup Modal ───────────
const setupTmp = {
  count: 4,
  rolls: [], // [{ name, fortune, wisdom }]
};

function openSetup(opts = {}) {
  setupTmp.count = state.players.length || 4;
  setupTmp.rolls = state.players.length
    ? state.players.map(p => ({ name: p.name, fortune: p.fortune, wisdom: p.wisdom }))
    : Array.from({ length: setupTmp.count }, () => ({ name: '', fortune: 0, wisdom: 0 }));
  $('#setup-round').value = state.roundNum;
  $('#setup-civ-goal-input').value = state.civGoal || 30;
  renderSetup();
  $('#setup-modal').classList.remove('hidden');
}
function closeSetup() { $('#setup-modal').classList.add('hidden'); }

function setSetupCount(n) {
  setupTmp.count = n;
  while (setupTmp.rolls.length < n) setupTmp.rolls.push({ name: '', fortune: 0, wisdom: 0 });
  setupTmp.rolls.length = n;
  renderSetup();
}

function renderSetup() {
  $$('.player-count-pick .chip').forEach(c =>
    c.classList.toggle('active', +c.dataset.count === setupTmp.count));

  const top = topSetupPlayer();
  const wrap = $('#setup-players');
  wrap.innerHTML = setupTmp.rolls.map((r, i) => {
    const isTop = top && top.i === i;
    return `
      <div class="setup-player-row ${isTop ? 'top' : ''}" data-idx="${i}">
        <input type="text" class="sp-name" value="${escapeHtml(r.name)}" placeholder="玩家 ${i + 1}" maxlength="10" />
        <button class="mini-btn" data-roll="fortune">擲福</button>
        <div class="roll-out fortune">${r.fortune || '—'}</div>
        <button class="mini-btn" data-roll="wisdom">擲慧</button>
        <div class="roll-out wisdom">${r.wisdom || '—'}</div>
      </div>
    `;
  }).join('');

  $$('#setup-players .setup-player-row').forEach(row => {
    const idx = +row.dataset.idx;
    $('.sp-name', row).addEventListener('input', (e) => {
      setupTmp.rolls[idx].name = e.target.value;
      renderTopMarker();
    });
    $$('button[data-roll]', row).forEach(b => {
      b.addEventListener('click', () => {
        const stat = b.dataset.roll;
        const v = roll(10);
        const out = $(`.roll-out.${stat}`, row);
        animateNumber(out, v, 320);
        setTimeout(() => {
          setupTmp.rolls[idx][stat] = v;
          renderTopMarker();
        }, 340);
      });
    });
  });

  renderTopMarker();
}

function topSetupPlayer() {
  let best = null;
  setupTmp.rolls.forEach((r, i) => {
    const s = (r.fortune || 0) + (r.wisdom || 0);
    if (!best || s > best.score) best = { i, score: s, name: r.name };
  });
  if (!best || best.score === 0) return null;
  return best;
}

function renderTopMarker() {
  const top = topSetupPlayer();
  $('#setup-top-player').textContent = top ? (setupTmp.rolls[top.i].name || `玩家 ${top.i + 1}`) : '—';
  $('#setup-top-score').textContent = top ? top.score : '—';
  $$('#setup-players .setup-player-row').forEach((row, i) => {
    row.classList.toggle('top', !!top && top.i === i);
  });
}


function applySetup() {
  if (setupTmp.rolls.some(r => (r.fortune || 0) === 0 || (r.wisdom || 0) === 0)) {
    if (!confirm('有玩家尚未擲福慧初始值，仍要開始嗎？')) return;
  }
  state.roundNum = Math.max(1, parseInt($('#setup-round').value, 10) || 1);
  state.players = setupTmp.rolls.map((r, i) => makePlayer({
    name: r.name || `玩家 ${i + 1}`,
    fortune: r.fortune || 0,
    wisdom: r.wisdom || 0,
  }));
  // Pre-mark milestones already reached so we don't spam toasts on game start
  state.players.forEach(p => {
    ['fortune', 'wisdom'].forEach(stat => {
      MILESTONES.forEach(m => { if (p[stat] >= m) p.notified[key(stat, m)] = true; });
    });
    // Self-Breakthrough: silent pre-mark for any player starting above dual threshold
    SELF_THRESHOLDS.forEach(n => {
      if (Math.min(p.fortune, p.wisdom) >= n) p.notified['self' + n] = true;
    });
    if (p.fortune >= GRAD_THRESHOLD && p.wisdom >= GRAD_THRESHOLD) p.graduated = true;
  });
  const inputGoal = parseInt($('#setup-civ-goal-input').value, 10);
  if (Number.isFinite(inputGoal) && inputGoal > 0) {
    state.civGoal = inputGoal;
  }
  resetTimer();
  state._timeUpNoticed = false;
  state.history = [];
  state.navigatorClaimed = emptyNavClaim();
  // Navigator: silent pre-claim if any player already starts above each threshold (player array order = priority)
  NAV_THRESHOLDS.forEach(n => {
    const first = state.players.find(p => Math.min(p.fortune, p.wisdom) >= n);
    if (first) state.navigatorClaimed[n] = first.id;
  });
  state.log = [];
  logEvent(`第 ${state.roundNum} 局開局 · 文明高度 ${state.civGoal}`, 'grad');
  save();
  closeSetup();
  renderAll();
}

// ─────────── Topbar / sidebar bindings ───────────
function bindEvents() {
  $('#btn-toggle-timer').addEventListener('click', toggleTimer);
  $('#btn-next-round').addEventListener('click', nextRound);
  $('#btn-history').addEventListener('click', openHistory);
  $('#history-close').addEventListener('click', closeHistory);
  $('#btn-setup').addEventListener('click', openSetup);
  $('#setup-close').addEventListener('click', closeSetup);
  $('#setup-cancel').addEventListener('click', closeSetup);
  $('#setup-start').addEventListener('click', applySetup);

  $$('.player-count-pick .chip').forEach(b =>
    b.addEventListener('click', () => setSetupCount(+b.dataset.count)));

  $('#btn-reset-game').addEventListener('click', () => {
    if (!confirm('重置所有積分、計時與設定，確定？')) return;
    state = defaultState();
    save();
    renderAll();
    openSetup();
  });
}

// ─────────── Round navigation (history archive + restore) ───────────
function snapshotRound() {
  return JSON.parse(JSON.stringify({
    roundNum: state.roundNum,
    civGoal: state.civGoal,
    timer: state.timer,
    players: state.players,
    log: state.log,
    navigatorClaimed: state.navigatorClaimed,
  }));
}

function nextRound() {
  const msg = `進入第 ${state.roundNum + 1} 局？\n所有玩家積分將歸零、計時器重置、紀錄清空。\n（可從右上「歷史紀錄」復原任一過往局）`;
  if (!confirm(msg)) return;

  // Pause first so accumulated elapsed time is finalized in the snapshot
  if (state.timer.running) pauseTimer();
  const snap = snapshotRound();
  snap.completedAt = Date.now();
  state.history.push(snap);

  state.roundNum += 1;
  state.players.forEach(p => {
    p.civ = 0;
    p.fortune = 0;
    p.wisdom = 0;
    p.graduated = false;
    p.notified = {};
  });
  resetTimer();
  state._timeUpNoticed = false;
  state.navigatorClaimed = emptyNavClaim();
  state.log = [];
  logEvent(`進入第 ${state.roundNum} 局（積分歸零）`, 'grad');
  save();
  renderAll();
  toast(`已進入第 ${state.roundNum} 局 — 上一局已存入歷史紀錄`);
}

function restoreRound(idx) {
  if (!state.history || !state.history[idx]) return;
  const entry = state.history[idx];
  const tail = state.history.length - idx - 1;
  const tailNote = tail > 0 ? `，第 ${entry.roundNum} 局之後的 ${tail} 局歷史也會一併丟失` : '';
  if (!confirm(`復原到第 ${entry.roundNum} 局？\n當前第 ${state.roundNum} 局所有變更將遺失${tailNote}。`)) return;

  state.roundNum = entry.roundNum;
  state.civGoal = entry.civGoal;
  state.timer = entry.timer;
  state.players = entry.players;
  state.log = entry.log;
  state.navigatorClaimed = Object.assign(emptyNavClaim(), entry.navigatorClaimed || {});
  state.history = state.history.slice(0, idx);
  state._timeUpNoticed = elapsedSeconds() >= MAX_GAME_SECONDS;
  save();
  renderAll();
  closeHistory();
  toast(`已復原至第 ${state.roundNum} 局`, 'grad');
}

function refreshHistoryButton() {
  const btn = document.getElementById('btn-history');
  if (!btn) return;
  const n = (state.history || []).length;
  if (n > 0) {
    btn.hidden = false;
    btn.textContent = `歷史 · ${n}`;
  } else {
    btn.hidden = true;
  }
}

function openHistory() {
  renderHistoryList();
  $('#history-modal').classList.remove('hidden');
}
function closeHistory() {
  $('#history-modal').classList.add('hidden');
}

function renderHistoryList() {
  const ul = $('#history-list');
  if (!state.history || !state.history.length) {
    ul.innerHTML = `<li class="history-empty">尚無歷史紀錄。按右上「下一局」結束本局時會自動存檔。</li>`;
    return;
  }
  // Newest first
  const html = state.history.map((entry, idx) => ({ entry, idx }))
    .reverse()
    .map(({ entry, idx }) => {
      const dur = fmt(entry.timer && entry.timer.accumulated || 0);
      const when = entry.completedAt
        ? new Date(entry.completedAt).toLocaleString('zh-TW', {
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', hour12: false,
          })
        : '—';
      const players = entry.players.map(p => `
        <div class="hi-player ${p.graduated ? 'graduated' : ''}">
          <div class="hp-name">${escapeHtml(p.name || '玩家')}</div>
          <div class="hp-scores">福 ${p.fortune} · 慧 ${p.wisdom} · 文明 ${p.civ}</div>
          <div class="hp-total">綜合 <strong>${comprehensiveScore(p)}</strong></div>
        </div>
      `).join('');
      return `
        <li class="history-item">
          <div class="hi-head">
            <div class="hi-title">第 ${entry.roundNum} 局 · 文明高度 ${entry.civGoal}</div>
            <div class="hi-time">${when} · 時長 ${dur}</div>
          </div>
          <div class="hi-players">${players}</div>
          <div class="hi-actions">
            <button class="btn btn-ghost" data-restore="${idx}">復原到此局</button>
          </div>
        </li>
      `;
    }).join('');
  ul.innerHTML = html;

  $$('button[data-restore]', ul).forEach(b => {
    b.addEventListener('click', () => restoreRound(+b.dataset.restore));
  });
}

// ─────────── Render all ───────────
function renderAll() {
  updateTopbar();
  renderPlayers();
  renderLog();
  refreshHistoryButton();
}

// ─────────── Timer loop ───────────
function startTimerLoop() {
  setInterval(() => {
    if (state.timer.running) updateTopbar();
  }, 1000);
}

// ─────────── Service worker ───────────
function registerSW() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    });
  }
}

// ─────────── Init ───────────
function init() {
  const hasGame = load();
  // Bump nextPlayerId past existing ids so new players don't collide
  if (state.players.length) {
    const maxId = state.players.reduce((m, p) => {
      const n = parseInt(String(p.id).replace(/^p/, ''), 10);
      return Number.isFinite(n) ? Math.max(m, n) : m;
    }, 0);
    nextPlayerId = maxId + 1;
  }
  bindEvents();
  renderAll();
  startTimerLoop();
  registerSW();
  if (!hasGame) openSetup();
}

document.addEventListener('DOMContentLoaded', init);
