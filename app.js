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
  const pool = [];
  Object.entries(getActionDeck()).forEach(([cat, data]) => {
    data.cards.forEach(c => {
      // 抉擇卡（帶 options）：不套用分類 reward，改帶抉擇欄位過去。
      if (Array.isArray(c.options)) {
        pool.push({
          type: 'action', category: cat, name: c.name,
          scene: c.scene, options: c.options,
          both: !!c.both, conditional: c.conditional || null,
        });
        return;
      }
      pool.push({
        type: 'action',
        category: cat,
        name: c.name,
        desc: c.desc,
        side: c.side || '',
        reward: c.reward || data.reward,
        rewardText: c.rewardText || data.rewardText,
      });
    });
  });
  return pool;
}

// ─────────── Boost deck (共好加速卡) ───────────
// Each card stands alone (no categories). 「即時行動」 + 「福慧覺察」 sections.

function buildBoostPool() {
  return getBoostDeck().map(c => ({ type: 'boost', ...c }));
}

function rebuildDecks() {
  DECKS.action.pool = buildActionPool();
  DECKS.boost.pool = buildBoostPool();
}

const STORAGE_KEY = 'fuhui-dashboard-state-v2';
const LEGACY_STORAGE_KEY = 'fuhui-dashboard-state-v1';
// 遊戲時間依人數而定：4人/100 分、5人/105 分、6人/110 分（每多一人 +5 分）。
function gameMinutes() {
  const count = state.currentGame.players.length || setupTmp.count || 4;
  return 100 + Math.max(0, count - 4) * 5;
}
function maxGameSeconds() {
  return gameMinutes() * 60;
}
const SPRINT_SECONDS = () => GAME_CONFIG.ENDGAME_MINUTES * 60;
const GRAD_THRESHOLD = 30;          // 福慧雙項皆 ≥ 30 即可畢業
const CIV_PER_PLAYER = 10;          // 文明高度：白骰 × 黑骰 ＋ 玩家人數 × 此值
const DIE_MIN = 1, DIE_MAX = 6;     // 實體白/黑骰點數範圍
const MILESTONES = [30];             // 單項里程：單項 30 (不再分四階)
const NAV_THRESHOLDS = [10, 20, 30];   // 領航者際遇：場上首位福慧雙達者
const SELF_THRESHOLDS = [12, 22];      // 自我突破際遇：任一玩家福慧雙達者
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
  return (p.fortune || 0) + (p.wisdom || 0) + (p.civ || 0) * 2;
}
// ─────────── Weather System ───────────
function expectedCiv(turn, civGoal) {
  return civGoal * turn / GAME_CONFIG.EXPECTED_ROUNDS;
}

function judgeWeather(civCurrent, turn, civGoal) {
  const expected = expectedCiv(turn, civGoal);
  if (civCurrent >= expected * 1.2) return 'FAVORABLE';
  if (civCurrent <= expected * 0.8) return 'DISASTER';
  return 'NORMAL';
}

function getPhase(turn) {
  for (const ev of state.currentGame.weatherEvents) {
    if (turn === ev.targetRound - 2) return { phase: 'FORECAST', ev };
    if (turn === ev.targetRound - 1) return { phase: 'ADJUST', ev };
    if (turn === ev.targetRound) return { phase: 'REPORT', ev };
  }
  return { phase: 'NORMAL', ev: null };
}

// ─────────── Dice ───────────
function roll(sides) {
  return 1 + Math.floor(Math.random() * sides);
}
// ── Virtual 3D die (setup modal) ──
// A real ten-sided die is a pentagonal trapezohedron: two apexes and ten
// kite-shaped faces meeting at a zig-zag equator. buildD10() computes the
// solid's true geometry and lays each kite out as an SVG <polygon> placed in 3D
// via matrix3d, so the faces close cleanly into the genuine d10 silhouette.
// Each face carries its own fixed number (opposite faces sum to 11, like a real
// die). The die gently turns while idle and tumbles fast on a roll; clicking a
// player's 擲福 / 擲慧 spins it, then settles with the rolled face turned to the
// viewer and writes that value into the player's field.
let diceBusy = false;
let d10Built = false;
let d10Faces = []; // [{ el, normal, value }] — populated by buildD10()
let diceAnim = null; // the in-flight Web Animations throw, so reset can cancel it
let idleAnim = null; // the looping idle rotation
let idleRestM = null; // a face-up orientation matrix used as the idle's resting pose

// Build an SVG path for a polygon with softened corners: at each vertex, pull
// back `r` along both edges and join the two points with a quadratic arc that
// rounds off the point. Radius is clamped to half of each adjacent edge.
function roundedPath(pts, r) {
  const n = pts.length;
  let d = '';
  for (let i = 0; i < n; i++) {
    const cur = pts[i];
    const prev = pts[(i - 1 + n) % n];
    const next = pts[(i + 1) % n];
    const vp = [prev[0] - cur[0], prev[1] - cur[1]];
    const vn = [next[0] - cur[0], next[1] - cur[1]];
    const lp = Math.hypot(vp[0], vp[1]) || 1;
    const ln = Math.hypot(vn[0], vn[1]) || 1;
    const rr = Math.min(r, lp / 2, ln / 2);
    const a = [cur[0] + vp[0] / lp * rr, cur[1] + vp[1] / lp * rr];
    const b = [cur[0] + vn[0] / ln * rr, cur[1] + vn[1] / ln * rr];
    d += `${i === 0 ? 'M' : 'L'}${a[0].toFixed(2)} ${a[1].toFixed(2)} `;
    d += `Q${cur[0].toFixed(2)} ${cur[1].toFixed(2)} ${b[0].toFixed(2)} ${b[1].toFixed(2)} `;
  }
  return d + 'Z';
}

function buildD10() {
  const die = $('#die10');
  if (!die) return;
  const faces = $$('.d-face', die);
  if (faces.length < 10) return;

  // Face numbers: top kites 1–5, bottom kites arranged so each face and the one
  // opposite it (bottom kite (i+2) mod 5) sum to 11 — the standard d10 layout.
  const FACE_VALUES = [1, 2, 3, 4, 5, 7, 6, 10, 9, 8];
  d10Faces = [];

  const N = 5;
  const H = 42;             // apex distance from centre
  const Rr = 38;            // equatorial ring radius
  const zr = 0.10557 * H;   // ring half-height that makes every kite face planar
  const S = 60;             // viewBox centre (viewBox is 0 0 120 120)
  const D2R = Math.PI / 180;

  const T = [0, -H, 0];     // top apex (−y is up on screen)
  const B = [0,  H, 0];     // bottom apex
  const U = [], L = [];     // upper ring (above equator) / lower ring (below)
  for (let i = 0; i < N; i++) {
    const au = i * 72 * D2R;
    const al = (i * 72 + 36) * D2R;
    U.push([Rr * Math.cos(au), -zr, Rr * Math.sin(au)]);
    L.push([Rr * Math.cos(al),  zr, Rr * Math.sin(al)]);
  }

  // 5 top kites (apex T) then 5 bottom kites (apex B). `near` is the kite's
  // equator-side tip; text is oriented with its top pointing toward the apex.
  const defs = [];
  for (let i = 0; i < N; i++) {
    defs.push({ apex: T, near: L[i], corners: [T, U[i], L[i], U[(i + 1) % N]] });
  }
  for (let i = 0; i < N; i++) {
    defs.push({ apex: B, near: U[(i + 1) % N], corners: [B, L[i], U[(i + 1) % N], L[(i + 1) % N]] });
  }

  const sub   = (a, b) => [a[0]-b[0], a[1]-b[1], a[2]-b[2]];
  const dot   = (a, b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
  const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
  const norm  = (a) => { const m = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0]/m, a[1]/m, a[2]/m]; };

  defs.forEach((d, fi) => {
    const c = d.corners;
    const C = [ (c[0][0]+c[1][0]+c[2][0]+c[3][0]) / 4,
                (c[0][1]+c[1][1]+c[2][1]+c[3][1]) / 4,
                (c[0][2]+c[1][2]+c[2][2]+c[3][2]) / 4 ];

    // Newell normal, flipped to point outward (away from the centre).
    let nx = 0, ny = 0, nz = 0;
    for (let k = 0; k < 4; k++) {
      const p = c[k], q = c[(k + 1) % 4];
      nx += (p[1]-q[1]) * (p[2]+q[2]);
      ny += (p[2]-q[2]) * (p[0]+q[0]);
      nz += (p[0]-q[0]) * (p[1]+q[1]);
    }
    let n = norm([nx, ny, nz]);
    if (dot(n, C) < 0) n = [-n[0], -n[1], -n[2]];

    // In-plane basis: v runs apex→tip (projected onto the face), u perpendicular.
    // u = cross(v, n) keeps det([u v n]) > 0 so the number is never mirrored.
    let vr = sub(d.near, d.apex);
    const vn = dot(vr, n);
    vr = [vr[0]-n[0]*vn, vr[1]-n[1]*vn, vr[2]-n[2]*vn];
    const v = norm(vr);
    const u = norm(cross(v, n));

    const pts2d = c.map(p => {
      const e = sub(p, C);
      return [S + dot(e, u), S + dot(e, v)];
    });

    const face = faces[fi];
    $('.kface', face).setAttribute('d', roundedPath(pts2d, 6));
    $('.die10-num', face).textContent = String(FACE_VALUES[fi]);
    face.style.transform =
      `matrix3d(${u[0]},${u[1]},${u[2]},0,` +
      `${v[0]},${v[1]},${v[2]},0,` +
      `${n[0]},${n[1]},${n[2]},0,` +
      `${C[0]},${C[1]},${C[2]},1)`;

    // Store the full face frame: n (outward normal), v (apex→tip, = the number's
    // "down"), u (in-plane perpendicular). Used to lay the face flat on settle.
    d10Faces.push({ el: face, normal: n, u, v, apexDir: norm(d.apex), value: FACE_VALUES[fi] });
  });

  d10Built = true;
  idleRestM = faceUpMatrix(d10Faces[0].value); // a resting orientation for the idle
}

// Camera tilt for the resting view: rotate the whole solid forward so we look
// down onto the top face. When a real d10 settles it lies on a bottom kite and
// the antipodal kite is horizontal on top -- that top face is the result. We
// orient the rolled face there and tip the camera down to read it.
const VIEW_TILT = -54;

// Orientation that lays the given face flat on top: its outward normal points
// straight up (world up is 0,-1,0) so the kite is horizontal and the number
// reads upright once the camera tilts down. Rows [u, -n, v] map the face normal
// to up, v (apex->tip) into the table, and u to screen-right.
function faceUpMatrix(value) {
  const f = d10Faces.find(x => x.value === value);
  if (!f) return null;
  const { u, v, normal: n } = f;
  return `matrix3d(${u[0]},${-n[0]},${v[0]},0,` +
                  `${u[1]},${-n[1]},${v[1]},0,` +
                  `${u[2]},${-n[2]},${v[2]},0,0,0,0,1)`;
}

// Full resting pose: lay the rolled face flat and up, give it a random heading
// (yaw about the vertical axis keeps the face level, just turns it like a die
// settled at some angle), then tilt the camera down to read the top face.
function faceRestPose(value, yaw) {
  const m = faceUpMatrix(value);
  if (!m) return null;
  return `rotateX(${VIEW_TILT}deg) rotateY(${yaw.toFixed(1)}deg) ${m}`;
}

const DICE_THROW_MS = 1650; // full throw → bounce → settle

// Keyframes for a die that behaves like a real thrown solid: it is tossed up,
// tumbles freely on every axis, falls under "gravity" (ease-in on the way down,
// ease-out on the way up), bounces a couple of times with shrinking height, then
// locks onto the rolled face and rocks to rest with a quickly damped wobble.
function buildThrowKeyframes(rest) {
  const dir = Math.random() < 0.5 ? 1 : -1; // tumble handedness varies per throw
  // Airborne phase — free tumble, no face lock yet (random-looking spin).
  const air = (ty, tx, rx, ry, rz) =>
    `translate(${(tx * dir).toFixed(1)}px, ${ty}px) rotateX(${rx}deg) ` +
    `rotateY(${(ry * dir).toFixed(0)}deg) rotateZ(${(rz * dir).toFixed(0)}deg)`;
  // Settle phase — locked to the rest pose, with a small parent-space rock.
  const rock = (ty, nod, twist) =>
    `translateY(${ty}px) rotateX(${nod}deg) rotateZ(${twist}deg) ${rest}`;

  const G_UP   = 'cubic-bezier(0.22, 0.58, 0.40, 1)';   // rising: decelerate
  const G_DOWN = 'cubic-bezier(0.52, 0, 0.86, 0.52)';   // falling: accelerate
  const SOFT   = 'cubic-bezier(0.33, 0, 0.30, 1)';      // settle rocks

  return [
    { offset: 0.00, easing: G_UP,   transform: air(  0,   0,  -15,    0,    0) }, // launch
    { offset: 0.17, easing: G_DOWN, transform: air(-46,  -7,  165,  205,   72) }, // apex of the throw
    { offset: 0.40, easing: G_UP,   transform: air(  0,   5,  330,  430,  150) }, // first impact
    { offset: 0.55, easing: G_DOWN, transform: air(-22,   4,  430,  560,  205) }, // bounce apex
    { offset: 0.70, easing: SOFT,   transform: air(  0,   0,  520,  655,  250) }, // second impact
    { offset: 0.80, easing: G_DOWN, transform: rock(-7,  9.5,  7.5) },            // tiny hop, rock over
    { offset: 0.88, easing: SOFT,   transform: rock( 0, -5.0, -4.0) },            // rock back
    { offset: 0.94, easing: SOFT,   transform: rock( 0,  2.4,  2.0) },            // smaller
    { offset: 0.975,easing: SOFT,   transform: rock( 0, -1.1, -0.9) },            // smaller still
    { offset: 1.00, easing: SOFT,   transform: rest }                            // at rest
  ];
}

function stopDiceAnim() {
  if (diceAnim) { try { diceAnim.cancel(); } catch (_) {} diceAnim = null; }
}

function stopDieIdle() {
  if (idleAnim) { try { idleAnim.cancel(); } catch (_) {} idleAnim = null; }
}

// Idle state: the die simply lies on the table (a face flat and up, viewed from
// the tilted camera) and turns slowly about the vertical axis, like a die left
// resting on a felt mat. WAAPI drives it so it composites the same way as the
// throw; reduced motion gets a static lying pose instead.
function startDieIdle() {
  const die = $('#die10');
  if (!die || !idleRestM) return;
  stopDieIdle();
  die.style.animation = 'none';
  const tilt = `rotateX(${VIEW_TILT}deg)`;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) {
    die.style.transform = `${tilt} rotateY(0deg) ${idleRestM}`;
    return;
  }
  die.style.transform = '';
  idleAnim = die.animate([
    { transform: `${tilt} rotateY(0deg) ${idleRestM}` },
    { transform: `${tilt} rotateY(360deg) ${idleRestM}` }
  ], { duration: 18000, easing: 'linear', iterations: Infinity });
}

function resetDiceStage() {
  const die = $('#die10');
  if (!die) return;
  diceBusy = false;
  stopDiceAnim();
  die.classList.remove('fortune', 'wisdom');
  die.style.animation = 'none';
  die.style.transform = '';
  startDieIdle();             // resume the slow resting turntable
  const cap = $('#dice-caption');
  if (cap) cap.textContent = t('setup.dice_caption');
}

function rollSetupDie(stat, idx) {
  if (diceBusy) return; // one roll at a time
  const die = $('#die10');
  const cap = $('#dice-caption');
  const input = $(`.setup-player-row[data-idx="${idx}"] .roll-out.${stat}`);
  if (!die || !d10Faces.length || !input) return;

  const finalValue = roll(10);
  setupTmp.rolls[idx][stat] = finalValue;
  const name = setupTmp.rolls[idx].name || `${t('common.player')} ${idx + 1}`;
  const statLabel = stat === 'fortune' ? t('players.fortune') : t('players.wisdom');

  diceBusy = true;
  stopDieIdle();
  die.classList.remove('fortune', 'wisdom');
  die.classList.add(stat);
  cap.textContent = t('setup.dice_rolling', {name: name, statLabel: statLabel});

  // The die settles flat with the rolled face up; a random heading (yaw) makes
  // each throw come to rest at a different angle, like a real die on the table.
  const yaw = -42 + Math.random() * 84;
  const rest = faceRestPose(finalValue, yaw);
  const finish = () => {
    if (rest) { die.style.animation = 'none'; die.style.transform = rest; }
    input.value = String(finalValue);
    cap.textContent = `${name} · ${statLabel} ＝ ${finalValue}`;
    diceBusy = false;
    renderTopMarker();
  };

  // Reduced motion: skip the throw and rest on the face immediately (finish()
  // poses the die from `rest`).
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce || !rest) { finish(); return; }

  // Animate the throw with the Web Animations API so each leg can carry its own
  // gravity-like easing and the settle can rock with a damped wobble — neither
  // of which a single CSS transition can express. WAAPI also wins over the CSS
  // idle animation, so the toss isn't fighting the turntable underneath.
  stopDiceAnim();
  die.style.animation = 'none';
  die.style.transform = '';
  diceAnim = die.animate(buildThrowKeyframes(rest), {
    duration: DICE_THROW_MS,
    easing: 'linear',
    fill: 'forwards'
  });
  diceAnim.onfinish = () => { stopDiceAnim(); finish(); };
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
  return GAME_CONFIG.RELIEF || {
    RESTORE_TO: 5,
    THRESHOLD_EARLY: 0,
    THRESHOLD_LATE: 3,
    CLEAR_TAG_AT: 4,
    SHELTER_TURNS: 2
  };
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
    ? (cfg.THRESHOLD_LATE !== undefined ? cfg.THRESHOLD_LATE : 3)
    : (cfg.THRESHOLD_EARLY !== undefined ? cfg.THRESHOLD_EARLY : 0);
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

function syncMultiplierBanner(el, playerId, endgameKey) {
  if (!el) return;
  const mult = scoreMultiplier(playerId);
  if (mult.id == null) {
    el.classList.add('hidden');
    return;
  }
  el.classList.remove('hidden');
  if (mult.id === 'ENDGAME') el.textContent = t(endgameKey);
  else if (mult.id === 'SHELTER') el.textContent = t('relief.adjust_shelter');
  else el.textContent = t('relief.adjust_weather', {
    weather: getWeatherLabel(mult.id),
    gain: mult.gain,
    loss: mult.loss,
  });
}

function shelterBadgeHtml(p) {
  if (!playerInShelter(p)) {
    return '<div class="pc-shelter hidden"></div>';
  }
  const rem = shelterTurnsRemaining(p);
  return `<div class="pc-shelter">
      <span class="pc-shelter-title">${escapeHtml(t('relief.badge', { rem }))}</span>
      <span class="pc-shelter-rates">${escapeHtml(t('relief.badge_rates'))}</span>
    </div>`;
}

function syncShelterUI(card, p) {
  if (!card) return;
  let badge = card.querySelector('.pc-shelter');
  if (!badge) return;
  if (playerInShelter(p)) {
    badge.classList.remove('hidden');
    const rem = shelterTurnsRemaining(p);
    badge.innerHTML = `<span class="pc-shelter-title">${escapeHtml(t('relief.badge', { rem }))}</span>
      <span class="pc-shelter-rates">${escapeHtml(t('relief.badge_rates'))}</span>`;
  } else {
    badge.classList.add('hidden');
    badge.innerHTML = '';
  }
}

let reliefModalQueue = Promise.resolve();
let cancelReliefPrompt = null;

function enqueueReliefUi(fn) {
  const queued = reliefModalQueue.then(fn, fn);
  reliefModalQueue = queued.catch(() => {});
  return queued;
}

function reliefAnnounceText({ name, items = [], scores = {}, restore, multiPlayers }) {
  const cfg = reliefCfg();
  const rest = restore || cfg.RESTORE_TO || 5;
  if (multiPlayers && multiPlayers.length > 0) {
    const names = multiPlayers.map(m => {
      const statsStr = m.items.map(s => STAT_LABEL(s)).join('、');
      return `${m.name}（${statsStr}）`;
    }).join('、');
    return t('relief.body_multi', { names, restore: rest });
  }
  if (items.length === 2) {
    return t('relief.body_both', { name, restore: rest });
  }
  const statKey = items[0] || 'fortune';
  const scoreVal = scores[statKey] !== undefined ? scores[statKey] : 0;
  return t('relief.body_one', {
    name,
    stat: STAT_LABEL(statKey),
    score: scoreVal,
    restore: rest,
  });
}

function showReliefModal(opts) {
  const game = state.currentGame;
  return enqueueReliefUi(() => {
    if (game !== state.currentGame) return false;
    // 排隊期間分數可能已改變；在真正開啟時才準備最新的救濟對象。
    const current = typeof opts === 'function' ? opts() : opts;
    return current ? showReliefPromptNow(current) : false;
  });
}

function showReliefPromptNow(opts) {
  return new Promise((resolve) => {
    const modal = $('#relief-modal');
    const okBtn = $('#relief-ok');
    const laterBtn = $('#relief-later');
    const ackWrap = $('#relief-ack-wrap');
    const ackCb = $('#relief-ack-cb');
    const backdrop = modal ? $('.modal-backdrop', modal) : null;
    if (!modal || !okBtn) { resolve(false); return; }

    const title = $('#relief-title');
    const message = $('#relief-message');

    if (title) title.textContent = opts.title || t('relief.title');
    if (message) {
      message.textContent = opts.message || reliefAnnounceText(opts);
    }

    if (ackWrap) ackWrap.classList.remove('hidden');
    if (ackCb) ackCb.checked = false;

    okBtn.textContent = opts.okText || t('relief.offer_start');
    okBtn.disabled = true;

    if (laterBtn) {
      laterBtn.textContent = opts.laterText || t('relief.offer_later');
      laterBtn.classList.remove('hidden');
    }

    const onAckChange = () => {
      if (ackCb) okBtn.disabled = !ackCb.checked;
    };
    if (ackCb) ackCb.addEventListener('change', onAckChange);

    const cleanup = () => {
      modal.classList.add('hidden');
      okBtn.removeEventListener('click', onOk);
      if (laterBtn) laterBtn.removeEventListener('click', onLater);
      if (backdrop) backdrop.removeEventListener('click', onBackdrop);
      if (ackCb) ackCb.removeEventListener('change', onAckChange);
      document.removeEventListener('keydown', onKey);
    };

    let finished = false;
    const cancel = () => done(false);
    const done = (value) => {
      if (finished) return;
      finished = true;
      if (cancelReliefPrompt === cancel) cancelReliefPrompt = null;
      cleanup();
      resolve(value);
    };

    const onOk = () => {
      if (okBtn.disabled) return;
      done(true);
    };
    const onLater = () => done(false);
    const onBackdrop = () => onLater();
    const onKey = (e) => {
      // 通用確認視窗的圖層更高，不能一次按鍵同時確認兩個視窗。
      const confirm = $('#confirm-modal');
      if (e.defaultPrevented || (confirm && !confirm.classList.contains('hidden'))) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        onLater();
      } else if (e.key === 'Enter') {
        if (!okBtn.disabled) {
          e.preventDefault();
          onOk();
        }
      }
    };

    okBtn.addEventListener('click', onOk);
    if (laterBtn) laterBtn.addEventListener('click', onLater);
    if (backdrop) backdrop.addEventListener('click', onBackdrop);
    document.addEventListener('keydown', onKey);
    cancelReliefPrompt = cancel;
    modal.classList.remove('hidden');
    const confirm = $('#confirm-modal');
    if (ackCb && (!confirm || confirm.classList.contains('hidden'))) ackCb.focus();
  });
}

async function executeRelief(playerId, statsToRelieve = []) {
  const game = state.currentGame;
  const p = getPlayer(playerId);
  if (!p) return false;
  const cfg = reliefCfg();
  const eligibleStats = qualifyingReliefStats(p, statsToRelieve);
  if (!eligibleStats.length) return false;

  const restoreTo = cfg.RESTORE_TO || 5;
  const name = p.name || t('common.player');

  const values = {};
  eligibleStats.forEach(stat => {
    if (!p.reliefUsed) p.reliefUsed = { fortune: false, wisdom: false };
    p.reliefUsed[stat] = true;
    values[stat] = restoreTo;
  });

  // 第二項救濟只延長庇護，保留當輪仍在生效的起點。
  if (!playerInShelter(p)) p.shelterFromTurn = state.currentGame.turnNum + 1;
  const targetEnd = state.currentGame.turnNum + (cfg.SHELTER_TURNS || 2);
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
  const restore = cfg.RESTORE_TO || 5;
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
  const restore = cfg.RESTORE_TO || 5;
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

// In-app confirm dialog (replaces native confirm()). Returns a Promise<boolean>.
function confirmModal({ title = t('confirm.title'), message = '', confirmText = t('confirm.btn_ok'), cancelText = t('confirm.btn_cancel'), danger = false } = {}) {
  return new Promise((resolve) => {
    const modal = $('#confirm-modal');
    const okBtn = $('#confirm-ok');
    const cancelBtn = $('#confirm-cancel');
    const backdrop = $('.modal-backdrop', modal);
    if (!modal) { resolve(window.confirm(message || title)); return; } // graceful fallback

    $('#confirm-title').textContent = title;
    $('#confirm-message').textContent = message;
    okBtn.textContent = confirmText;
    cancelBtn.textContent = cancelText;
    okBtn.classList.toggle('btn-danger', !!danger);
    okBtn.classList.toggle('btn-primary', !danger);

    const done = (result) => {
      modal.classList.add('hidden');
      okBtn.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', onCancel);
      backdrop.removeEventListener('click', onCancel);
      document.removeEventListener('keydown', onKey);
      const relief = $('#relief-modal');
      if (relief && !relief.classList.contains('hidden')) $('#relief-ack-cb')?.focus();
      resolve(result);
    };
    const onOk = () => done(true);
    const onCancel = () => done(false);
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
      else if (e.key === 'Enter') { e.preventDefault(); onOk(); }
    };
    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);
    backdrop.addEventListener('click', onCancel);
    document.addEventListener('keydown', onKey);
    modal.classList.remove('hidden');
    okBtn.focus();
  });
}
function recordLog(text, kind = '') {
  state.currentGame.log.unshift({ text, kind, t: elapsedSeconds() });
  if (state.currentGame.log.length > 40) state.currentGame.log.pop();
}
function logEvent(text, kind = '') {
  recordLog(text, kind);
  save();
  renderLog();
}
function renderLog() {
  const ul = $('#milestone-log');
  if (!state.currentGame.log.length) {
    ul.innerHTML = `<li class="empty">${t('messages.empty_log')}</li>`;
    return;
  }
  ul.innerHTML = state.currentGame.log.map(e =>
    `<li class="${e.kind}">${escapeHtml(e.text)}<span class="ml-time">${fmt(e.t)}</span></li>`
  ).join('');
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ─────────── 待處理抽卡佇列 ───────────
// 需要主持人「去抽一張卡」的里程（領航者 / 自我突破 / 單項 55）在觸發時，
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
function renderDrawModal() {
  const modal = $('#draw-modal');
  const listEl = $('#draw-list');
  if (!modal || !listEl) return;
  const list = state.currentGame.pendingDraws || [];
  if (!list.length) { modal.classList.add('hidden'); return; }
  listEl.innerHTML = list.map(d =>
    `<li><span class="dl-text">${escapeHtml(d.text)}</span>` +
    `<button class="btn btn-primary dl-done" data-pd-id="${d.id}" type="button">已抽</button></li>`
  ).join('');
  listEl.querySelectorAll('.dl-done').forEach(btn =>
    btn.addEventListener('click', () => resolvePendingDraw(btn.dataset.pdId)));
}
function openDrawModal() {
  if (!(state.currentGame.pendingDraws || []).length) return;
  renderDrawModal();
  $('#draw-modal').classList.remove('hidden');
}
function renderPendingDraws() {
  const ul = $('#pending-draws');
  if (!ul) return;
  const list = state.currentGame.pendingDraws || [];
  const wrap = $('#pending-wrap');
  if (wrap) wrap.classList.toggle('hidden', list.length === 0);
  ul.innerHTML = list.map(d => `
    <li>
      <span class="pd-text">${escapeHtml(d.text)}</span>
      <span class="pd-time">${fmt(d.t)}</span>
      <button class="pd-done" data-pd-id="${d.id}" aria-label="已抽卡、清除待辦">已抽</button>
    </li>`).join('');
  ul.querySelectorAll('.pd-done').forEach(btn =>
    btn.addEventListener('click', () => resolvePendingDraw(btn.dataset.pdId)));
}

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
  timerEl.classList.toggle('warn', sec >= maxSec - 20 * 60 && sec < maxSec);
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
          const expected = expectedCiv(ev.targetRound - 2, state.currentGame.civGoal);
          let targetCiv = 0;
          if (ev.lockedWeather === 'DISASTER') targetCiv = Math.ceil(expected * 0.8) + 1;
          if (ev.lockedWeather === 'NORMAL') targetCiv = Math.ceil(expected * 1.2);
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
function renderPlayers() {
  const grid = $('#players');
  grid.innerHTML = '';
  grid.style.setProperty('--cols', state.currentGame.players.length <= 4 ? 2 : 3);
  // Quick-draw shortcuts only make sense with a running game
  $('#quick-draw').classList.toggle('hidden', !state.currentGame.players.length);
  if (!state.currentGame.players.length) {
    grid.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon"><svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><g stroke="#E0A331" stroke-width="2.6" stroke-linecap="round"><line x1="32" y1="17" x2="32" y2="10.5"></line><line x1="32" y1="17" x2="32" y2="10.5" transform="rotate(45 32 32)"></line><line x1="32" y1="17" x2="32" y2="10.5" transform="rotate(90 32 32)"></line><line x1="32" y1="17" x2="32" y2="10.5" transform="rotate(135 32 32)"></line><line x1="32" y1="17" x2="32" y2="10.5" transform="rotate(180 32 32)"></line><line x1="32" y1="17" x2="32" y2="10.5" transform="rotate(225 32 32)"></line><line x1="32" y1="17" x2="32" y2="10.5" transform="rotate(270 32 32)"></line><line x1="32" y1="17" x2="32" y2="10.5" transform="rotate(315 32 32)"></line></g><circle cx="32" cy="32" r="11.5" fill="#EFC158"></circle></svg></div>
        <h3>${t('messages.not_started_title')}</h3>
        <p>${t('messages.not_started_desc')}</p>
        <button class="btn btn-primary" id="empty-setup-btn">${t('ui.btn_new_game')}</button>
      </div>`;
    $('#empty-setup-btn').addEventListener('click', openSetup);
    return;
  }
  state.currentGame.players.forEach(p => grid.appendChild(buildPlayerCard(p)));
}

function buildPlayerCard(p) {
  const card = document.createElement('article');
  const acted = hasActed(p.id);
  const skipped = hasSkipped(p.id);
  card.className = 'player-card'
    + (p.graduated ? ' graduated' : '')
    + (acted ? ' acted' : '')
    + (skipped ? ' skipped' : '');
  card.dataset.playerId = p.id;

  const total = comprehensiveScore(p);
  const fw = (p.fortune || 0) + (p.wisdom || 0);
  card.innerHTML = `
    <header class="pc-head">
      <input class="pc-name" value="${escapeHtml(p.name)}" placeholder="${t('ui.player_name_placeholder')}" maxlength="10" />
      <span class="pc-hat" title="${t('ui.graduated_badge')}">${t('ui.graduated_badge')}</span>
      <div class="pc-fw" title="${t('ui.fw_full')}">
        <span>${t('ui.fw_short')}</span>
        <strong>${fw}</strong>
      </div>
      <div class="pc-total">
        <span>${t('ui.total_score')}</span>
        <strong>${total}</strong>
      </div>
    </header>

    ${STATS.map(stat => statRow(p, stat)).join('')}

    ${shelterBadgeHtml(p)}

    <div class="pc-actions">
      <button class="pc-origin-open" data-act="origin" title="${t('ui.origin_title')}">${t('ui.btn_origin')}</button>
      <button class="pc-adjust" data-act="adjust" title="${t('ui.adjust_title')}">${t('ui.btn_adjust')}</button>
      <div class="pc-turn-flags">
        <button class="pc-acted" data-act="acted" aria-pressed="${acted ? 'true' : 'false'}" title="${t('ui.acted_title')}">${acted ? t('ui.btn_acted_done') : t('ui.btn_acted')}</button>
        <button class="pc-skip" data-act="skip" aria-pressed="${skipped ? 'true' : 'false'}" title="${t('ui.skip_title')}">${skipped ? t('ui.btn_skip_done') : t('ui.btn_skip')}</button>
      </div>
    </div>

    <footer class="pc-foot">
      <span class="pc-status">${p.graduated ? t('ui.graduated_status') : statusHint(p)}</span>
      <button class="pc-remove" data-act="remove">${t('ui.btn_remove')}</button>
    </footer>
  `;

  // Event delegation
  card.addEventListener('click', (e) => {
    const el = e.target;
    if (el.closest('[data-act="origin"]')) {
      openOriginModal(p.id);
    } else if (el.closest('[data-act="adjust"]')) {
      openAdjustModal(p.id);
    } else if (el.closest('[data-act="acted"]')) {
      toggleActed(p.id);
    } else if (el.closest('[data-act="skip"]')) {
      toggleSkipped(p.id);
    } else if (el.matches('[data-act="remove"]')) {
      confirmModal({ title: t('confirm.remove_player_title'), message: t('confirm.remove_player_msg', {name: p.name || t('common.player')}), confirmText: t('confirm.remove'), danger: true })
        .then((ok) => { if (ok) removePlayer(p.id); });
    }
  });

  const nameInput = $('.pc-name', card);
  nameInput.addEventListener('change', () => {
    p.name = nameInput.value.trim();
    save();
    renderLog();
  });

  return card;
}

function statusHint(p) {
  if (p.fortune >= GRAD_THRESHOLD - 5 && p.wisdom >= GRAD_THRESHOLD - 5) return t('ui.status_near_grad');
  if (p.fortune >= 15 || p.wisdom >= 15) return t('ui.status_mid');
  return t('ui.status_training');
}

function statRow(p, stat) {
  const v = p[stat];
  const max = stat === 'civ' ? Math.max(20, state.currentGame.civGoal) : 60;
  const pct = Math.min(100, (v / max) * 100);
  const marks = stat === 'civ' ? '' : MILESTONES.map(m => {
    const pos = (m / max) * 100;
    return `<span class="stat-mark ${v >= m ? 'reached' : ''}" data-mark="${m}" style="left:${pos}%"></span>`;
  }).join('');
  const isFW = stat === 'fortune' || stat === 'wisdom';
  const quotaUsed = !!(isFW && p.reliefUsed && p.reliefUsed[stat]);
  const quotaDot = isFW
    ? `<span class="pc-quota-dot ${quotaUsed ? 'used' : 'avail'}" title="${escapeHtml(t(quotaUsed ? 'relief.quota_used' : 'relief.quota_avail'))}"></span>`
    : '';
  const selfLow = !!(isFW && p.selfSelectedLow && p.selfSelectedLow[stat]);
  const selfLowHtml = isFW
    ? `<div class="stat-self-low ${selfLow ? '' : 'hidden'}">${escapeHtml(t('relief.self_low_tag'))}</div>`
    : '';
  return `
    <div class="stat-row stat-${stat}">
      <div class="stat-label"><span>${STAT_LABEL(stat)}</span>${quotaDot}</div>
      <div class="stat-bar">
        <div class="stat-bar-fill" style="width:${pct}%"></div>
        ${marks}
      </div>
      <span class="stat-num">${v}</span>
      ${selfLowHtml}
    </div>
  `;
}

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
  $('#adjust-modal').classList.remove('hidden');
}
function closeAdjustModal() {
  $('#adjust-modal').classList.add('hidden');
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
  await settleScoreChanges([{ playerId: pid, delta: scaled }]);
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
  await settleScoreChanges([{ playerId, delta: r }]);
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
  $('#origin-modal').classList.remove('hidden');
}
function closeOriginModal() {
  $('#origin-modal').classList.add('hidden');
  originTargetId = null;
}
function pickOrigin(stop) {
  const id = originTargetId;
  closeOriginModal();      // 先關閉，若跨里程讓待抽卡 modal 乾淨地彈出
  if (id != null) scoreOrigin(id, stop);
}
async function settleScoreChanges(operations, { selfSelected = false } = {}) {
  const changes = GameRules.calculateScoreBatch(state.currentGame.players, operations);
  const events = [];
  // 全場所有分數先寫入，再檢查里程與集體勝利。
  for (const change of changes) {
    const p = getPlayer(change.playerId);
    Object.assign(p, change.after);
    for (const stat of change.changedStats.filter(stat => stat !== 'civ')) {
      if (p[stat] >= (reliefCfg().CLEAR_TAG_AT || 4)) p.selfSelectedLow[stat] = false;
      if (selfSelected && p[stat] < change.before[stat] && p[stat] <= 3) p.selfSelectedLow[stat] = true;
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
  changes.forEach(change => updatePlayerCard(getPlayer(change.playerId)));
  presentGameEvents(events);
  const boundary = processGameEvents();
  updateTopbar();
  await boundary;
  return changes;
}

function updatePlayerCard(p) {
  const card = document.querySelector(`[data-player-id="${p.id}"]`);
  if (!card) { renderPlayers(); return; }

  card.classList.toggle('graduated', !!p.graduated);
  card.querySelector('.pc-total strong').textContent = comprehensiveScore(p);
  const fwEl = card.querySelector('.pc-fw strong');
  if (fwEl) fwEl.textContent = (p.fortune || 0) + (p.wisdom || 0);

  STATS.forEach(stat => {
    const row = card.querySelector(`.stat-${stat}`);
    if (!row) return;
    const v = p[stat];
    const max = stat === 'civ' ? Math.max(20, state.currentGame.civGoal) : 60;
    const pct = Math.min(100, (v / max) * 100);
    const numEl = row.querySelector('.stat-num');
    if (numEl) numEl.textContent = v;
    row.querySelector('.stat-bar-fill').style.width = pct + '%';
    row.querySelectorAll('.stat-mark').forEach(mark => {
      mark.classList.toggle('reached', v >= +mark.dataset.mark);
    });

    if (stat === 'fortune' || stat === 'wisdom') {
      const dot = row.querySelector('.pc-quota-dot');
      if (dot) {
        const quotaUsed = !!(p.reliefUsed && p.reliefUsed[stat]);
        dot.className = `pc-quota-dot ${quotaUsed ? 'used' : 'avail'}`;
        dot.title = t(quotaUsed ? 'relief.quota_used' : 'relief.quota_avail');
      }
      const selfLowEl = row.querySelector('.stat-self-low');
      if (selfLowEl) {
        const selfLow = !!(p.selfSelectedLow && p.selfSelectedLow[stat]);
        selfLowEl.classList.toggle('hidden', !selfLow);
      }
    }
  });

  card.querySelector('.pc-status').textContent =
    p.graduated ? t('ui.graduated_status') : statusHint(p);

  syncShelterUI(card, p);
  applyTurnStatusUI(card, p.id);
}

function removePlayer(id) {
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
// Refresh the live "白 × 黑 ＋ 人數 × 10 ＝ N" readout from the two dice inputs.
function updateCivCalc() {
  const w = clampDie($('#setup-civ-white').value);
  const b = clampDie($('#setup-civ-black').value);
  const n = setupTmp.count || 4;
  $('#civ-calc-white').textContent = w;
  $('#civ-calc-black').textContent = b;
  const countEl = $('#civ-calc-count');
  if (countEl) countEl.textContent = n;
  $('#civ-calc-goal').textContent = computeCivGoal(w, b, n);
}

function openSetup(opts = {}) {
  const mode = opts.mode === 'next' ? 'next' : 'new';
  setupTmp.mode = mode;
  setupTmp.count = state.currentGame.players.length || 4;
  // Next round: carry the same players (names) but blank 福/慧 so the host
  // re-rolls each round's initial values. New game: pre-fill current values.
  setupTmp.rolls = state.currentGame.players.length
    ? state.currentGame.players.map(p => ({
        name: p.name,
        fortune: mode === 'next' ? 0 : p.fortune,
        wisdom:  mode === 'next' ? 0 : p.wisdom,
      }))
    : Array.from({ length: setupTmp.count }, () => ({ name: '', fortune: 0, wisdom: 0 }));
  $('#setup-round').value = mode === 'next' ? state.currentGame.roundNum + 1 : state.currentGame.roundNum;
  // Dice start at 1 each round; the host enters the physical roll before starting.
  $('#setup-civ-white').value = DIE_MIN;
  $('#setup-civ-black').value = DIE_MIN;
  updateCivCalc();
  const title = $('#setup-title');
  if (title) title.textContent = mode === 'next' ? t('setup.title_next') : t('setup.title');
  renderSetup();
  if (!d10Built) buildD10();
  resetDiceStage();
  $('#setup-modal').classList.remove('hidden');
}
function closeSetup() { $('#setup-modal').classList.add('hidden'); }

function setSetupCount(n) {
  setupTmp.count = n;
  while (setupTmp.rolls.length < n) setupTmp.rolls.push({ name: '', fortune: 0, wisdom: 0 });
  setupTmp.rolls.length = n;
  renderSetup();
  updateCivCalc();
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
        <input type="text" class="sp-name" value="${escapeHtml(r.name)}" placeholder="${t('common.player')} ${i + 1}" maxlength="10" />
        <button class="mini-btn" data-roll="fortune">${t('setup.btn_roll_fortune')}</button>
        <input type="number" class="roll-out fortune" data-stat="fortune" inputmode="numeric" min="0" max="10" value="${r.fortune || ''}" placeholder="" aria-label="${t('setup.aria_fortune_init')}" />
        <button class="mini-btn" data-roll="wisdom">${t('setup.btn_roll_wisdom')}</button>
        <input type="number" class="roll-out wisdom" data-stat="wisdom" inputmode="numeric" min="0" max="10" value="${r.wisdom || ''}" placeholder="" aria-label="${t('setup.aria_wisdom_init')}" />
      </div>
    `;
  }).join('');

  $$('#setup-players .setup-player-row').forEach(row => {
    const idx = +row.dataset.idx;
    $('.sp-name', row).addEventListener('input', (e) => {
      setupTmp.rolls[idx].name = e.target.value;
      renderTopMarker();
    });
    // Manual entry — type the initial 福/慧 directly (0–10)
    $$('.roll-out', row).forEach(inp => {
      const stat = inp.dataset.stat;
      inp.addEventListener('input', () => {
        let v = parseInt(inp.value, 10);
        if (!Number.isFinite(v) || v < 0) v = 0;
        if (v > 10) { v = 10; inp.value = '10'; }
        setupTmp.rolls[idx][stat] = v;
        renderTopMarker();
      });
    });
    // Dice roll — tumble the shared virtual die, then write its result here
    $$('button[data-roll]', row).forEach(b => {
      b.addEventListener('click', () => rollSetupDie(b.dataset.roll, idx));
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
function applyTurnStatusUI(card, playerId) {
  const acted = hasActed(playerId);
  const skipped = hasSkipped(playerId);
  card.classList.toggle('acted', acted);
  card.classList.toggle('skipped', skipped);
  const actedBtn = card.querySelector('[data-act="acted"]');
  if (actedBtn) {
    actedBtn.setAttribute('aria-pressed', acted ? 'true' : 'false');
    actedBtn.textContent = acted ? t('ui.btn_acted_done') : t('ui.btn_acted');
  }
  const skipBtn = card.querySelector('[data-act="skip"]');
  if (skipBtn) {
    skipBtn.setAttribute('aria-pressed', skipped ? 'true' : 'false');
    skipBtn.textContent = skipped ? t('ui.btn_skip_done') : t('ui.btn_skip');
  }
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
  $('#btn-weather-adjust').addEventListener('click', (e) => {
    e.stopPropagation();
    openWeatherAdjustModal();
  });
  $('#btn-toggle-timer').addEventListener('click', toggleTimer);
  $('#btn-next-round').addEventListener('click', () => openSetup({ mode: 'next' }));
  $('#btn-history').addEventListener('click', openHistory);
  $('#history-close').addEventListener('click', closeHistory);
  $('#btn-draw-action').addEventListener('click', () => openCardDraw('action'));
  $('#btn-draw-boost').addEventListener('click', () => openCardDraw('boost'));
  $('#btn-quick-action').addEventListener('click', () => openCardDraw('action'));
  $('#btn-quick-boost').addEventListener('click', () => openCardDraw('boost'));
  $('#btn-browse-cards').addEventListener('click', () => openCatalog('action'));
  $('#catalog-close').addEventListener('click', closeCatalog);
  $$('.catalog-tab').forEach(b => {
    b.addEventListener('click', () => renderCatalog(b.dataset.tab));
  });

  // Deck manager
  $('#btn-deck-manager').addEventListener('click', openDeckManager);
  $('#dm-close').addEventListener('click', closeDeckManager);
  $('#dm-export').addEventListener('click', exportDecks);
  $('#dm-file-btn').addEventListener('click', () => $('#dm-file').click());
  $('#dm-file').addEventListener('change', (e) => {
    const f = e.target.files && e.target.files[0];
    if (f) importDeckFile(f);
    e.target.value = '';  // allow re-selecting same file
  });
  $('#dm-paste-apply').addEventListener('click', importPastedJSON);
  $('#dm-reset').addEventListener('click', resetDecksToDefault);
  $('#card-close').addEventListener('click', closeCard);
  $('#btn-setup').addEventListener('click', openSetup);
  $('#setup-close').addEventListener('click', closeSetup);
  $('#setup-cancel').addEventListener('click', closeSetup);
  $('#setup-start').addEventListener('click', applySetup);
  $('#setup-civ-white').addEventListener('input', updateCivCalc);
  $('#setup-civ-black').addEventListener('input', updateCivCalc);

  // 起始點加分 modal
  $('#origin-close').addEventListener('click', closeOriginModal);
  $('#origin-cancel').addEventListener('click', closeOriginModal);
  $('.modal-backdrop', $('#origin-modal')).addEventListener('click', closeOriginModal);
  $('#origin-pass-btn').addEventListener('click', () => pickOrigin(false));
  $('#origin-stop-btn').addEventListener('click', () => pickOrigin(true));

  // 加減分 modal
  $('#adjust-close').addEventListener('click', closeAdjustModal);
  $('#adjust-cancel').addEventListener('click', closeAdjustModal);
  $('.modal-backdrop', $('#adjust-modal')).addEventListener('click', closeAdjustModal);
  $('#adjust-apply').addEventListener('click', applyAdjust);
  $('#adjust-rows').addEventListener('click', (e) => {
    const b = e.target.closest('.adjust-step'); if (!b) return;
    const inp = b.closest('.adjust-row').querySelector('.adjust-input');
    inp.value = String((parseInt(inp.value, 10) || 0) + parseInt(b.dataset.step, 10));
    renderAdjustPreview();
  });
  $('#adjust-rows').addEventListener('input', (e) => {
    if (e.target.classList.contains('adjust-input')) renderAdjustPreview();
  });

  // 遊戲說明 modal
  $('#btn-guide').addEventListener('click', () => $('#guide-modal').classList.remove('hidden'));
  $('#guide-close').addEventListener('click', () => $('#guide-modal').classList.add('hidden'));
  $('.modal-backdrop', $('#guide-modal')).addEventListener('click', () => $('#guide-modal').classList.add('hidden'));

  // 抽卡里程 modal：稍後再抽（保留面板待辦）/ 全部已抽（清空）
  $('#draw-later').addEventListener('click', () => $('#draw-modal').classList.add('hidden'));
  $('#draw-all-done').addEventListener('click', () => {
    state.currentGame.pendingDraws = [];
    save();
    renderPendingDraws();
    $('#draw-modal').classList.add('hidden');
  });

  $$('.player-count-pick .chip').forEach(b =>
    b.addEventListener('click', () => setSetupCount(+b.dataset.count)));

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
  if (cancelReliefPrompt) cancelReliefPrompt();
  closeCard();
  currentCard = null;
  currentDeckKey = null;
  currentChoiceOpt = null;
  closeAdjustModal();
  closeOriginModal();
  for (const id of ['draw-modal', 'weather-adjust-modal', 'highlight-modal']) {
    $('#' + id)?.classList.add('hidden');
  }
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
    title: `切回第 ${entry.roundNum} 局`,
    message: t('confirm.next_round_msg', {round: state.currentGame.roundNum}),
    confirmText: '切回此局',
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
  backToHistoryList(); // always open on the list, not a stale detail view
  $('#history-modal').classList.remove('hidden');
}
function closeHistory() {
  $('#history-modal').classList.add('hidden');
}

function renderHistoryList() {
  const ul = $('#history-list');
  if (!state.history || !state.history.length) {
    ul.innerHTML = `<li class="history-empty">${t('messages.empty_history')}</li>`;
    return;
  }
  // Newest first
  const html = state.history.map((entry, idx) => ({ entry, idx }))
    .sort((a, b) => b.entry.roundNum - a.entry.roundNum) // newest round first (array order can change after a swap)
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
          ${entry.incompleteFields?.length ? `<p class="storage-warning">${escapeHtml(t('storage.history_incomplete'))}</p>` : ''}
          <div class="hi-actions">
            <button class="btn btn-ghost" data-view="${idx}">查看</button>
            <button class="btn btn-ghost" data-restore="${idx}">切回此局</button>
          </div>
        </li>
      `;
    }).join('');
  ul.innerHTML = html;

  $$('button[data-view]', ul).forEach(b => {
    b.addEventListener('click', () => viewRound(+b.dataset.view));
  });
  $$('button[data-restore]', ul).forEach(b => {
    b.addEventListener('click', () => restoreRound(+b.dataset.restore));
  });
}

// Read-only look at a past round: shows its players, scores and event log
// without touching the live game or any other history entry.
function viewRound(idx) {
  const entry = state.history && state.history[idx];
  const detail = $('#history-detail');
  const list = $('#history-list');
  if (!entry || !detail || !list) return;

  const dur = fmt((entry.timer && entry.timer.accumulated) || 0);
  const when = entry.completedAt
    ? new Date(entry.completedAt).toLocaleString('zh-TW', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hour12: false,
      })
    : '—';
  const players = entry.players || [];
  const sum = (k) => players.reduce((s, p) => s + (p[k] || 0), 0);
  const totalCiv = sum('civ'), reached = totalCiv >= (entry.civGoal || 0);

  const playerCards = players.map(p => `
    <div class="hd-player ${p.graduated ? 'graduated' : ''}">
      <div class="hd-pname">${escapeHtml(p.name || '玩家')}</div>
      <div class="hd-pstats">
        <span><span class="dot dot-fortune"></span>福報 <b>${p.fortune || 0}</b></span>
        <span><span class="dot dot-wisdom"></span>智慧 <b>${p.wisdom || 0}</b></span>
        <span><span class="dot dot-civ"></span>文明 <b>${p.civ || 0}</b></span>
      </div>
      <div class="hd-ptotal">綜合 <strong>${comprehensiveScore(p)}</strong></div>
    </div>`).join('');

  const logItems = (entry.log && entry.log.length)
    ? entry.log.map(e => `<li class="${e.kind || ''}">${escapeHtml(e.text)}<span class="ml-time">${fmt(e.t || 0)}</span></li>`).join('')
    : '<li class="empty">（當局無事件紀錄）</li>';

  detail.innerHTML = `
    <div class="hd-head">
      <button class="btn btn-ghost" id="history-back">← 返回列表</button>
      <span class="hd-readonly">${t('ui.history_readonly')}</span>
    </div>
    <div class="hd-title">第 ${entry.roundNum} 局</div>
    ${entry.incompleteFields?.length ? `<p class="storage-warning">${escapeHtml(t('storage.history_incomplete'))}</p>` : ''}
    <div class="hd-meta">完成 ${when} · 時長 ${dur} · 文明高度 ${entry.civGoal}</div>
    <div class="hd-summary">
      <div class="hd-sum ${reached ? 'reached' : ''}"><span>集體文明</span><strong>${totalCiv} / ${entry.civGoal}</strong></div>
      <div class="hd-sum"><span>集體福報</span><strong>${sum('fortune')}</strong></div>
      <div class="hd-sum"><span>集體智慧</span><strong>${sum('wisdom')}</strong></div>
    </div>
    <div class="hd-players">${playerCards}</div>
    <div class="hd-log">
      <div class="hd-log-label">當局事件日誌</div>
      <ul class="milestone-log hd-loglist">${logItems}</ul>
    </div>
  `;

  list.classList.add('hidden');
  detail.classList.remove('hidden');
  $('#history-title').textContent = `歷史紀錄 · 第 ${entry.roundNum} 局`;
  $('#history-back').addEventListener('click', backToHistoryList);
}

function backToHistoryList() {
  const detail = $('#history-detail');
  const list = $('#history-list');
  if (detail) detail.classList.add('hidden');
  if (list) list.classList.remove('hidden');
  const title = $('#history-title');
  if (title) title.textContent = t('ui.btn_history');
}

// ─────────── Card draw ───────────
const DECKS = {
  action: { title: '行動指令牌', pool: [] },
  boost:  { title: '共好加速卡', pool: []  },
};
let currentCard = null;
let currentDeckKey = null;
let currentChoiceOpt = null;   // 抉擇卡目前選中的 option index

function openCardDraw(deckKey) {
  if (!DECKS[deckKey]) return;
  currentDeckKey = deckKey;
  currentCard = drawFromDeck(deckKey);
  currentChoiceOpt = null;
  $('#card-title').textContent = deckKey === 'action' ? t('card.title_action') : t('card.title_boost');
  renderCard();
  $('#card-modal').classList.remove('hidden');
}
function closeCard() {
  $('#card-modal').classList.add('hidden');
}

function drawFromDeck(deckKey) {
  const pool = DECKS[deckKey].pool;
  if (!pool.length) return null;
  let pick, tries = 0;
  do {
    pick = pool[Math.floor(Math.random() * pool.length)];
    tries++;
  } while (currentCard && pool.length > 1 && pick.name === currentCard.name && tries < 8);
  return pick;
}

// A compact, read-only score reference shown inside the card modal — several
// action cards ask the host to judge players (福報最低 / 總積分最低 / 分數落後…)
// but the modal covers the player cards. Scores can't change while the modal is
// open (it's a blocking overlay), so a snapshot at render time stays accurate.
function cardPlayersRefHtml() {
  if (!state.currentGame.players.length) return '';
  const items = state.currentGame.players.map(p => `
    <div class="cpr-item${p.graduated ? ' graduated' : ''}">
      <span class="cpr-name">${escapeHtml(p.name || '玩家')}</span>
      <span class="cpr-stats"><b>福</b>${p.fortune || 0} <b>慧</b>${p.wisdom || 0} <b>文</b>${p.civ || 0}</span>
      <span class="cpr-tot">綜 ${comprehensiveScore(p)}</span>
    </div>`).join('');
  return `<div class="card-players-ref">
    <div class="cpr-label">玩家現況 · 判斷對象用</div>
    <div class="cpr-list">${items}</div>
  </div>`;
}

function renderCard() {
  if (!currentCard) return;
  const c = currentCard;
  if (Array.isArray(c.options)) { renderChoiceCard(c); return; }   // 抉擇卡（文明反思／文明扣分）
  const bodyHtml = c.type === 'boost' ? renderBoostBody(c) : renderActionBody(c);
  $('#card-body').innerHTML = bodyHtml;

  const playerOpts = state.currentGame.players.map(p =>
    `<option value="${p.id}">${escapeHtml(p.name || t('common.player'))}　（福 ${p.fortune} · 慧 ${p.wisdom} · 文 ${p.civ}）</option>`
  ).join('');
  const selectHtml = (id, label) => `
      <label class="row">
        <span>${label}</span>
        <select id="${id}">
          <option value="">${t('card.lbl_select_player')}</option>
          ${playerOpts}
        </select>
      </label>`;
  // 「雙方」卡（boost）要同時套用給本人與上一家，給兩個下拉；其餘卡用單一收受者。
  const recipientControls = c.both
    ? selectHtml('card-recipient', t('card.lbl_self')) + selectHtml('card-recipient2', t('card.lbl_prev_player'))
    : selectHtml('card-recipient', t('card.lbl_apply_to'));
  $('#card-foot').innerHTML = `
    ${cardPlayersRefHtml()}
    <div class="card-actions">
      ${recipientControls}
      <div class="card-buttons">
        <button class="btn btn-ghost" id="card-redraw">${t('card.btn_redraw')}</button>
        <button class="btn btn-primary" id="card-apply">${t('card.btn_apply_reward')}</button>
      </div>
    </div>
  `;

  $('#card-redraw').addEventListener('click', () => {
    currentCard = drawFromDeck(currentDeckKey);
    renderCard();
  });
  $('#card-apply').addEventListener('click', () => {
    const pid = $('#card-recipient').value;
    if (!pid) { toast(t('messages.select_player')); return; }
    if (currentCard.both) {
      const pid2 = $('#card-recipient2').value;
      if (!pid2) { toast(t('messages.select_prev_player')); return; }
      if (pid2 === pid) { toast(t('messages.same_player_error')); return; }
      applyCardReward([pid, pid2], currentCard);
    } else {
      applyCardReward(pid, currentCard);
    }
  });
}

// The reward line on a drawn card. During the sprint it previews the doubled
// tally so the host sees what 套用獎勵 will actually grant.
function rewardLineHtml(c) {
  const mult = scoreMultiplier();
  if (mult.id !== null) {
    const doubled = describeReward(scaleReward(c.reward || {}, mult));
    return `<div class="card-reward sprint">${t('weather.card_multiplier_applied', { weather: getWeatherLabel(mult.id), doubled: escapeHtml(doubled) })}` +
           `<span class="card-reward-base">${t('card.reward_original', {reward: escapeHtml(c.rewardText)})}</span></div>`;
  }
  return `<div class="card-reward">${t('card.reward_prefix')}${escapeHtml(c.rewardText)}</div>`;
}

// The 附加 (side) line. Side effects are applied by hand, so during the sprint
// they are NOT auto-doubled — remind the host to apply this one at ×2 manually.
function sideLineHtml(c) {
  if (!c.side) return '';
  const mult = scoreMultiplier();
  const note = mult.id !== null
    ? `<span class="card-side-x2">${t('weather.card_manual_calc', { weather: getWeatherLabel(mult.id) })}</span>`
    : '';
  return `<p class="card-side">${t('card.side_prefix')}${escapeHtml(c.side)}${note}</p>`;
}

function renderActionBody(c) {
  return `
    <div class="card-display">
      <div class="card-category">${escapeHtml(c.category)}</div>
      <h3 class="card-name">${escapeHtml(c.name)}</h3>
      <p class="card-desc">${escapeHtml(c.desc)}</p>
      ${sideLineHtml(c)}
      ${rewardLineHtml(c)}
    </div>
  `;
}

function renderBoostBody(c) {
  return `
    <div class="card-display">
      <div class="card-category">${t('card.title_boost')}</div>
      <h3 class="card-name">${escapeHtml(c.name)}</h3>
      <div class="card-section">
        <div class="card-section-label">${t('card.lbl_instant_action')}</div>
        <p class="card-section-text">${escapeHtml(c.action)}</p>
      </div>
      <div class="card-section">
        <div class="card-section-label">${t('card.lbl_insight')}</div>
        <p class="card-section-text">${escapeHtml(c.insight)}</p>
      </div>
      ${sideLineHtml(c)}
      ${rewardLineHtml(c)}
    </div>
  `;
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
// 「雙方各 福報 -1 · 智慧 -1　·　全體文明 -2」— 一行描述一個選項的效果。
function describeChoiceOption(card, opt) {
  const { each, civAll } = choiceEffects(opt);
  const parts = [];
  const eachTxt = describeReward(each);
  if (eachTxt) parts.push((card.both ? '雙方各　' : '') + eachTxt);
  if (civAll) parts.push(`全體文明 ${civAll > 0 ? '+' : ''}${civAll}`);
  return parts.length ? parts.join('　·　') : '無點數變化';
}

function renderChoiceCard(c) {
  const mult = scoreMultiplier();
  const label = c.type === 'boost' ? (c.series || '共好加速卡') : (c.category || '行動指令牌');

  // 條件卡：適用分支由當前集體文明自動鎖定。
  let forced = null, condHtml = '';
  if (c.conditional && Number.isFinite(c.conditional.civGte)) {
    const total = totalCiv();
    const met = total >= c.conditional.civGte;
    forced = met ? 0 : 1;
    currentChoiceOpt = forced;
    condHtml = `<p class="dilemma-cond">${t('card.dilemma_cond_civ', { total, threshold: c.conditional.civGte, op: met ? '≥ ' : '< ' })}</p>`;
  }

  const optionsHtml = (c.options || []).map((opt, i) => {
    const selected = currentChoiceOpt === i;
    const disabled = forced !== null && forced !== i;
    return `
      <button type="button" class="dilemma-opt${selected ? ' selected' : ''}${disabled ? ' disabled' : ''}"
              data-opt="${i}" ${disabled ? 'disabled' : ''}>
        <span class="do-label">${escapeHtml(opt.label)}</span>
        <span class="do-effects">${escapeHtml(describeChoiceOption(c, opt))}</span>
        ${opt.side ? `<span class="do-side">附加：${escapeHtml(opt.side)}（手動套用）</span>` : ''}
        ${opt.insight ? `<span class="do-insight">${escapeHtml(opt.insight)}</span>` : ''}
      </button>`;
  }).join('');

  const sprintHtml = mult.id !== null
    ? `<div class="card-reward sprint">${t('weather.card_converted', { weather: getWeatherLabel(mult.id), gain: mult.gain, loss: mult.loss })}</div>` : '';

  $('#card-body').innerHTML = `
    <div class="card-display dilemma">
      <div class="card-category">${escapeHtml(label)}</div>
      <h3 class="card-name">${escapeHtml(c.name)}</h3>
      <p class="card-desc">${escapeHtml(c.scene || '')}</p>
      ${condHtml}
      <div class="dilemma-options">${optionsHtml}</div>
      ${sprintHtml}
      <p class="dilemma-note">標示「全體文明」的增減會套用到場上每一位玩家的文明。</p>
    </div>
  `;

  const playerOpts = state.currentGame.players.map(p =>
    `<option value="${p.id}">${escapeHtml(p.name || t('common.player'))}　（福 ${p.fortune} · 慧 ${p.wisdom} · 文 ${p.civ}）</option>`
  ).join('');
  const selectHtml = (id, lbl) => `
      <label class="row">
        <span>${lbl}</span>
        <select id="${id}">
          <option value="">${t('card.lbl_select_player')}</option>
          ${playerOpts}
        </select>
      </label>`;
  const recipientControls = c.both
    ? selectHtml('card-recipient', t('card.lbl_self')) + selectHtml('card-recipient2', t('card.lbl_other_player'))
    : selectHtml('card-recipient', t('card.lbl_apply_to'));
  $('#card-foot').innerHTML = `
    ${cardPlayersRefHtml()}
    <div class="card-actions">
      ${recipientControls}
      <div class="card-buttons">
        <button class="btn btn-ghost" id="card-redraw">${t('card.btn_redraw')}</button>
        <button class="btn btn-primary" id="card-apply">${t('card.btn_apply_dilemma')}</button>
      </div>
    </div>
  `;

  $$('.dilemma-opt', $('#card-body')).forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.classList.contains('disabled')) return;
      currentChoiceOpt = +btn.dataset.opt;
      $$('.dilemma-opt', $('#card-body')).forEach(b =>
        b.classList.toggle('selected', +b.dataset.opt === currentChoiceOpt));
    });
  });

  $('#card-redraw').addEventListener('click', () => {
    currentCard = drawFromDeck(currentDeckKey);
    currentChoiceOpt = null;
    renderCard();
  });
  $('#card-apply').addEventListener('click', () => {
    if (currentChoiceOpt == null) { toast(t('messages.select_choice')); return; }
    const pid = $('#card-recipient').value;
    if (!pid) { toast(t('messages.select_player')); return; }
    if (c.both) {
      const pid2 = $('#card-recipient2').value;
      if (!pid2) { toast(t('messages.select_target')); return; }
      if (pid2 === pid) { toast(t('messages.same_player_error')); return; }
      applyChoiceCard([pid, pid2], c, currentChoiceOpt);
    } else {
      applyChoiceCard([pid], c, currentChoiceOpt);
    }
  });
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
  const fx = describeChoiceOption(card, opt);
  closeCard();
  await settleScoreChanges(operations);
  if (state.currentGame !== game) return;
  const tag = table.mult.id !== null ? getWeatherLabel(table.mult.id) : '';
  const sideNote = opt.side ? `　※附加：${opt.side}（請手動套用）` : '';
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

// ─────────── Card catalog (read-only browsing) ───────────
function openCatalog(deckKey = 'action') {
  // Update tab labels with current counts
  $$('.catalog-tab').forEach(b => {
    const k = b.dataset.tab;
    const n = DECKS[k] ? DECKS[k].pool.length : 0;
    b.textContent = `${DECKS[k].title} · ${n}`;
  });
  renderCatalog(deckKey);
  $('#catalog-modal').classList.remove('hidden');
}
function closeCatalog() {
  $('#catalog-modal').classList.add('hidden');
}

function renderCatalog(deckKey) {
  $$('.catalog-tab').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === deckKey);
  });
  const body = $('#catalog-body');
  if (deckKey === 'action') {
    body.innerHTML = Object.entries(getActionDeck()).map(([cat, data]) => `
      <section class="catalog-group">
        <header class="catalog-group-head">
          <span class="catalog-group-name">${escapeHtml(cat)}</span>
          <span class="catalog-group-reward">${escapeHtml(data.rewardText)}</span>
        </header>
        ${data.cards.map(c => catalogActionCardHtml(c, data)).join('')}
      </section>
    `).join('');
  } else if (deckKey === 'boost') {
    body.innerHTML = `
      <section class="catalog-group">
        ${getBoostDeck().map(catalogBoostCardHtml).join('')}
      </section>
    `;
  }
  body.scrollTop = 0;
}

function catalogActionCardHtml(c, deckData) {
  if (Array.isArray(c.options)) return catalogChoiceCardHtml(c);
  const rewardText = c.rewardText || deckData.rewardText;
  return `
    <article class="catalog-card">
      <header class="cc-head">
        <h4 class="cc-name">${escapeHtml(c.name)}</h4>
        <span class="cc-reward">${escapeHtml(rewardText)}</span>
      </header>
      <p class="cc-desc">${escapeHtml(c.desc)}</p>
      ${c.side ? `<p class="cc-side">附加：${escapeHtml(c.side)}</p>` : ''}
    </article>
  `;
}

// 抉擇卡的目錄外觀（兩個選項，效果以基礎值顯示、不含衝刺加倍）。
function catalogChoiceCardHtml(c) {
  const opts = (c.options || []).map(o => {
    const parts = [];
    const eachTxt = describeReward(o.each || {});
    if (eachTxt) parts.push((c.both ? '雙方各　' : '') + eachTxt);
    if (o.civAll) parts.push(`全體文明 ${o.civAll > 0 ? '+' : ''}${o.civAll}`);
    const fx = parts.length ? parts.join('　·　') : '無點數變化';
    return `
      <div class="cc-opt">
        <p class="cc-line"><span class="cc-section-label">${escapeHtml(o.label)}</span>${escapeHtml(fx)}</p>
        ${o.side ? `<p class="cc-side">附加：${escapeHtml(o.side)}</p>` : ''}
        ${o.insight ? `<p class="cc-insight">${escapeHtml(o.insight)}</p>` : ''}
      </div>`;
  }).join('');
  return `
    <article class="catalog-card">
      <header class="cc-head">
        <h4 class="cc-name">${escapeHtml(c.name)}${c.both ? '　<span class="cc-both">雙人</span>' : ''}</h4>
        ${c.conditional ? `<span class="cc-reward">條件卡 · 文明 ${c.conditional.civGte}</span>` : ''}
      </header>
      <p class="cc-desc">${escapeHtml(c.scene || '')}</p>
      ${opts}
    </article>
  `;
}

// ─────────── Deck manager (import / export custom card data) ───────────
function openDeckManager() {
  renderDeckManager();
  const p = $('#dm-paste'); if (p) p.value = '';
  $('#deck-manager-modal').classList.remove('hidden');
}
function closeDeckManager() {
  $('#deck-manager-modal').classList.add('hidden');
}

function deckSourceLabel(side) {
  const custom = state.settings.customDecks && state.settings.customDecks[side];
  return custom ? '自訂' : '預設';
}
function deckCardCount(side) {
  if (side === 'action') {
    return Object.values(getActionDeck()).reduce((s, d) => s + (d.cards ? d.cards.length : 0), 0);
  }
  return getBoostDeck().length;
}

function renderDeckManager() {
  $('#dm-action-source').textContent = deckSourceLabel('action');
  $('#dm-action-count').textContent  = deckCardCount('action') + ' 張';
  $('#dm-boost-source').textContent  = deckSourceLabel('boost');
  $('#dm-boost-count').textContent   = deckCardCount('boost') + ' 張';
}

function exportDecks() {
  const data = {
    actionDeck: getActionDeck(),
    boostDeck:  getBoostDeck(),
  };
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `fuhui-decks-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 100);
  toast(t('messages.json_downloaded'));
}

function importDeckFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      applyDecksImport(data);
    } catch (err) {
      toast(t('messages.json_parse_error') + '：' + err.message);
    }
  };
  reader.onerror = () => toast(t('messages.read_fail'));
  reader.readAsText(file, 'utf-8');
}

function importPastedJSON() {
  const raw = $('#dm-paste').value.trim();
  if (!raw) { toast(t('messages.paste_json_first')); return; }
  try {
    const data = JSON.parse(raw);
    applyDecksImport(data);
  } catch (err) {
    toast(t('messages.json_parse_error') + '：' + err.message);
  }
}

function validateImport(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return t('validate.need_object');
  }
  if (data.actionDeck === undefined && data.boostDeck === undefined) {
    return t('validate.need_decks');
  }

  if (data.actionDeck !== undefined) {
    if (typeof data.actionDeck !== 'object' || Array.isArray(data.actionDeck) || data.actionDeck === null) {
      return t('validate.action_deck_object');
    }
    for (const [cat, deck] of Object.entries(data.actionDeck)) {
      if (!deck || typeof deck !== 'object') return t('validate.cat_object', {cat});
      if (!deck.reward || typeof deck.reward !== 'object') return t('validate.cat_missing_reward', {cat});
      if (typeof deck.rewardText !== 'string')             return t('validate.cat_missing_rewardText', {cat});
      if (!Array.isArray(deck.cards))                      return t('validate.cat_cards_array', {cat});
      for (const c of deck.cards) {
        if (!c || typeof c.name !== 'string' || !c.name)   return t('validate.card_missing_name', {cat});
        if (Array.isArray(c.options)) { const e = validateChoiceCard(c, cat); if (e) return e; continue; }
        if (typeof c.desc !== 'string')                    return t('validate.card_missing_desc', {cat: cat, name: c.name});
      }
    }
  }

  if (data.boostDeck !== undefined) {
    if (!Array.isArray(data.boostDeck)) return t('validate.boost_array');
    for (const c of data.boostDeck) {
      if (!c || typeof c.name !== 'string' || !c.name) return t('validate.boost_missing_name');
      if (Array.isArray(c.options)) { const e = validateChoiceCard(c, t('dm.boost_label')); if (e) return e; continue; }
      if (typeof c.action !== 'string')   return t('validate.boost_missing_action', {name: c.name});
      if (typeof c.insight !== 'string')  return t('validate.boost_missing_insight', {name: c.name});
      if (!c.reward || typeof c.reward !== 'object') return t('validate.boost_missing_reward', {name: c.name});
      if (typeof c.rewardText !== 'string') return t('validate.boost_missing_rewardText', {name: c.name});
    }
  }
  return null;
}

// 抉擇卡（帶 options）的匯入驗證。
function validateChoiceCard(c, group) {
  if (typeof c.scene !== 'string')                       return t('validate.choice_missing_scene', {group, name: c.name});
  if (!Array.isArray(c.options) || !c.options.length)    return t('validate.choice_missing_options', {group, name: c.name});
  for (const o of c.options) {
    if (!o || typeof o.label !== 'string' || !o.label)   return t('validate.choice_opt_missing_label', {name: c.name});
    if (o.each !== undefined && (typeof o.each !== 'object' || o.each === null)) return t('validate.choice_opt_each_object', {name: c.name});
    if (o.civAll !== undefined && !Number.isFinite(o.civAll)) return t('validate.choice_opt_civAll_number', {name: c.name});
  }
  return null;
}

async function applyDecksImport(data) {
  const err = validateImport(data);
  if (err) { toast(t('messages.import_fail') + '：' + err); return; }

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

function catalogBoostCardHtml(c) {
  if (Array.isArray(c.options)) return catalogChoiceCardHtml(c);
  return `
    <article class="catalog-card">
      <header class="cc-head">
        <h4 class="cc-name">${escapeHtml(c.name)}</h4>
        <span class="cc-reward">${escapeHtml(c.rewardText)}</span>
      </header>
      <p class="cc-line"><span class="cc-section-label">${t('card.lbl_instant_action')}</span>${escapeHtml(c.action)}</p>
      <p class="cc-line"><span class="cc-section-label">${t('card.lbl_insight')}</span>${escapeHtml(c.insight)}</p>
      ${c.side ? `<p class="cc-side">附加：${escapeHtml(c.side)}</p>` : ''}
    </article>
  `;
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
  await settleScoreChanges(applied.map(a => ({ playerId: a.pid, delta: a.r })));
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
  } else if (first.mult.id !== null) {
    rewardText = describeReward(first.r);
    tag = getWeatherLabel(first.mult.id);
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

// ─────────── Render all ───────────
function renderAll() {
  updateTopbar();
  renderPlayers();
  renderPendingDraws();
  renderLog();
  refreshHistoryButton();
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
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
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
  initHighlightFeature();
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
  rebuildDecks();
  renderAll();
});

// ─────────── Weather Adjust Modal ───────────
function readWeatherAdjustInputs() {
  const rate = GAME_CONFIG.WEATHER.EXCHANGE_RATE_COST;
  const contributions = [];
  let totalCost = 0;
  $$('#weather-adjust-players .weather-adj-row').forEach(row => {
    const id = row.getAttribute('data-id');
    const p = getPlayer(id);
    if (!p) return;
    const fEl = row.querySelector('.adj-fortune');
    const wEl = row.querySelector('.adj-wisdom');
    const fRaw = parseInt(fEl.value, 10);
    const wRaw = parseInt(wEl.value, 10);
    const f = Math.max(0, Math.min(Number.isFinite(fRaw) ? fRaw : 0, p.fortune | 0));
    const w = Math.max(0, Math.min(Number.isFinite(wRaw) ? wRaw : 0, p.wisdom | 0));
    if (String(f) !== fEl.value) fEl.value = f;
    if (String(w) !== wEl.value) wEl.value = w;
    contributions.push({ id, f, w, name: p.name || t('common.player') });
    totalCost += f + w;
  });
  return { contributions, totalCost, civGain: Math.floor(totalCost / rate), rate };
}

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

function openWeatherAdjustModal() {
  const { phase, ev } = getPhase(state.currentGame.turnNum);
  if (phase !== 'ADJUST' || !ev) return;
  const modal = $('#weather-adjust-modal');
  if (!modal.classList.contains('hidden')) return;
  $('#weather-adjust-current-label').textContent = getWeatherLabel(ev.lockedWeather);

  const container = $('#weather-adjust-players');
  container.innerHTML = state.currentGame.players.map(p => `
    <div class="weather-adj-row" data-id="${p.id}">
      <div class="weather-adj-name">${escapeHtml(p.name)}</div>
      <div class="adjust-row">
        <span class="adjust-label"><span class="dot dot-fortune"></span>${escapeHtml(t('players.fortune'))}</span>
        <div class="adjust-ctrl">
          <button type="button" class="adjust-step" data-step="-1" aria-label="減少">−</button>
          <input class="adjust-input adj-fortune" type="number" inputmode="numeric" min="0" max="${p.fortune}" value="0" aria-label="${escapeHtml(t('players.fortune'))}">
          <button type="button" class="adjust-step" data-step="1" aria-label="增加">＋</button>
        </div>
        <span class="adjust-preview" data-remain="fortune">${escapeHtml(t('ui.lbl_current_val', { val: p.fortune | 0 }))}</span>
      </div>
      <div class="adjust-row">
        <span class="adjust-label"><span class="dot dot-wisdom"></span>${escapeHtml(t('players.wisdom'))}</span>
        <div class="adjust-ctrl">
          <button type="button" class="adjust-step" data-step="-1" aria-label="減少">−</button>
          <input class="adjust-input adj-wisdom" type="number" inputmode="numeric" min="0" max="${p.wisdom}" value="0" aria-label="${escapeHtml(t('players.wisdom'))}">
          <button type="button" class="adjust-step" data-step="1" aria-label="增加">＋</button>
        </div>
        <span class="adjust-preview" data-remain="wisdom">${escapeHtml(t('ui.lbl_current_val', { val: p.wisdom | 0 }))}</span>
      </div>
    </div>
  `).join('');

  updateWeatherAdjust();
  modal.classList.remove('hidden');
}

function updateWeatherAdjust() {
  const { contributions, totalCost, civGain, rate } = readWeatherAdjustInputs();
  const spent = civGain * rate;
  const charged = chargeWeatherAdjust(contributions, spent);

  charged.forEach(c => {
    const row = $(`#weather-adjust-players .weather-adj-row[data-id="${c.id}"]`);
    if (!row) return;
    const p = getPlayer(c.id);
    if (!p) return;
    const fEl = row.querySelector('[data-remain="fortune"]');
    const wEl = row.querySelector('[data-remain="wisdom"]');
    if (fEl) {
      const have = p.fortune | 0;
      fEl.textContent = c.f ? `${have} → ${have - c.f}　(−${c.f})` : t('ui.lbl_current_val', { val: have });
    }
    if (wEl) {
      const have = p.wisdom | 0;
      wEl.textContent = c.w ? `${have} → ${have - c.w}　(−${c.w})` : t('ui.lbl_current_val', { val: have });
    }
  });

  $('#weather-adjust-total-cost-container').innerHTML = t('weather.total_cost', { cost: `<span id="weather-adjust-total-cost">${spent}</span>` });
  $('#weather-adjust-civ-gain-container').innerHTML = t('weather.civ_gain', { civ: `<span id="weather-adjust-civ-gain">${civGain}</span>` });

  const { ev } = getPhase(state.currentGame.turnNum);
  if (ev) {
    const currentCiv = totalCiv();
    const newCiv = currentCiv + civGain;
    const nowWeather = judgeWeather(newCiv, ev.targetRound - 2, state.currentGame.civGoal);
    const ranks = { DISASTER: 0, NORMAL: 1, FAVORABLE: 2 };

    let gapMsg;
    if (ev.upgraded) {
      gapMsg = t('weather.adjust_already_upgraded');
    } else if (ranks[nowWeather] > ranks[ev.lockedWeather]) {
      const nextRankName = Object.keys(ranks).find(k => ranks[k] === ranks[ev.lockedWeather] + 1);
      gapMsg = '✨ ' + t('weather.adjust_sub_upgraded', {
        old: getWeatherLabel(ev.lockedWeather),
        new: getWeatherLabel(nextRankName),
      });
    } else if (ranks[ev.lockedWeather] < 2) {
      const expected = expectedCiv(ev.targetRound - 2, state.currentGame.civGoal);
      let targetCiv = 0;
      if (ev.lockedWeather === 'DISASTER') targetCiv = Math.ceil(expected * 0.8) + 1;
      if (ev.lockedWeather === 'NORMAL') targetCiv = Math.ceil(expected * 1.2);

      const civShort = targetCiv - newCiv;
      gapMsg = t('weather.gap_msg', { civ: civShort, pts: civShort * rate - (totalCost % rate) });
    } else {
      gapMsg = t('weather.adjust_maxed');
    }
    $('#weather-adjust-gap').textContent = gapMsg;
  }
}

$('#weather-adjust-close')?.addEventListener('click', () => $('#weather-adjust-modal').classList.add('hidden'));
$('#weather-banner')?.addEventListener('click', (e) => {
  if (e.target.closest('#btn-weather-adjust')) return;
  if (getPhase(state.currentGame.turnNum).phase === 'ADJUST') openWeatherAdjustModal();
});
$('#weather-adjust-cancel')?.addEventListener('click', () => $('#weather-adjust-modal').classList.add('hidden'));
$('.modal-backdrop', $('#weather-adjust-modal'))?.addEventListener('click', () => $('#weather-adjust-modal').classList.add('hidden'));
$('#weather-adjust-players')?.addEventListener('click', (e) => {
  const b = e.target.closest('.adjust-step'); if (!b) return;
  const inp = b.closest('.adjust-row').querySelector('.adjust-input');
  if (!inp) return;
  const max = parseInt(inp.max, 10);
  const next = (parseInt(inp.value, 10) || 0) + parseInt(b.dataset.step, 10);
  inp.value = String(Math.max(0, Number.isFinite(max) ? Math.min(max, next) : next));
  updateWeatherAdjust();
});
$('#weather-adjust-players')?.addEventListener('input', (e) => {
  if (e.target.classList.contains('adjust-input')) updateWeatherAdjust();
});
$('#weather-adjust-submit')?.addEventListener('click', async () => {
  const game = state.currentGame;
  const { phase, ev } = getPhase(state.currentGame.turnNum);
  if (phase !== 'ADJUST' || !ev) {
    $('#weather-adjust-modal').classList.add('hidden');
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
    if (c.f && (p.fortune - c.f) <= 3) statsWarned.push(STAT_LABEL('fortune'));
    if (c.w && (p.wisdom - c.w) <= 3) statsWarned.push(STAT_LABEL('wisdom'));
    if (statsWarned.length) {
      selfLowWarnings.push(`${p.name || t('common.player')} 的〔${statsWarned.join('、')}〕`);
    }
  });

  if (selfLowWarnings.length > 0) {
    const warnMsg = t('weather.adjust_self_low_warn', { stat: selfLowWarnings.join('、') });
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

  $('#weather-adjust-modal').classList.add('hidden');
  save();
  renderAll();
});

// ─────────── 精彩時刻 金句卡 ───────────
function initHighlightFeature() {
  const highlightModal = $('#highlight-modal');
  if (!highlightModal) return;

  const btnOpen = $('#btn-highlight');
  const btnClose = $('#highlight-close');
  const btnCancel = $('#highlight-cancel');
  const btnDownload = $('#highlight-download');
  const backdrop = $('.modal-backdrop', highlightModal);

  const inputQuote = $('#highlight-quote-input');
  const inputAuthor = $('#highlight-author-input');
  const charCount = $('#highlight-char-count');
  
  const displayQuote = $('#hc-quote-display');
  const displayAuthor = $('#hc-author-display');
  const displayDate = $('#hc-date-display');
  const cardPreview = $('#highlight-card-preview');

  function openHighlight() {
    inputQuote.value = '';
    inputAuthor.value = '';
    updatePreview();
    highlightModal.classList.remove('hidden');
  }

  function closeHighlight() {
    highlightModal.classList.add('hidden');
  }

  function updatePreview() {
    displayQuote.textContent = inputQuote.value || t('highlight.quote_default');
    displayAuthor.textContent = inputAuthor.value ? `— ${inputAuthor.value}` : `— ${t('highlight.author_default')}`;
    
    if (charCount) {
      charCount.textContent = `${inputQuote.value.length} / 200`;
    }
    
    const now = new Date();
    displayDate.textContent = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, '0')}.${String(now.getDate()).padStart(2, '0')}`;
  }

  function downloadHighlightCard() {
    if (typeof html2canvas === 'undefined') {
      toast(t('highlight.msg_html2canvas_fail'));
      return;
    }
    
    // Briefly remove rounded corners from wrapper if html2canvas struggles with overflow:hidden
    // (Optional, usually fine)
    
    html2canvas(cardPreview, {
      scale: 2,
      backgroundColor: null,
      useCORS: true
    }).then(canvas => {
      const link = document.createElement('a');
      link.download = `highlight-${Date.now()}.jpg`;
      link.href = canvas.toDataURL('image/jpeg', 0.9);
      link.click();
      
      toast(t('highlight.msg_download_success'));
      closeHighlight();
    }).catch(err => {
      console.error('html2canvas error:', err);
      toast(t('highlight.msg_download_fail'));
    });
  }

  if (btnOpen) btnOpen.addEventListener('click', openHighlight);
  if (btnClose) btnClose.addEventListener('click', closeHighlight);
  if (btnCancel) btnCancel.addEventListener('click', closeHighlight);
  if (backdrop) backdrop.addEventListener('click', closeHighlight);
  
  if (inputQuote) inputQuote.addEventListener('input', updatePreview);
  if (inputAuthor) inputAuthor.addEventListener('input', updatePreview);
  
  if (btnDownload) btnDownload.addEventListener('click', downloadHighlightCard);
}
