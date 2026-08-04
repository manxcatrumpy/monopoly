'use strict';

// ─────────────────────────────────────────────────────────────────────────
// 福慧大富翁 Dashboard
// ─────────────────────────────────────────────────────────────────────────

// ─────────── Card decks ───────────
// Host-updated deck content (4 categories). Each category carries a base reward;
// a card may override it via its own `reward` / `rewardText`, and `side` notes a
// manual extra effect that the host applies by hand.

function getActionDeck() {
  return (state.customDecks && state.customDecks.action) || window.i18n.cards.actionDeck;
}
function getBoostDeck() {
  return (state.customDecks && state.customDecks.boost) || window.i18n.cards.boostDeck;
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

const STORAGE_KEY = 'fuhui-dashboard-state-v1';
// 遊戲時間依人數而定：4人/100 分、5人/105 分、6人/110 分（每多一人 +5 分）。
function gameMinutes() {
  const count = state.players.length || setupTmp.count || 4;
  return 100 + Math.max(0, count - 4) * 5;
}
function maxGameSeconds() {
  return gameMinutes() * 60;
}
const SPRINT_SECONDS = 15 * 60;        // 最後 15 分鐘「無常與恩典齊發」：卡牌得分／扣分 ×2
const SPRINT_MULTIPLIER = 2;
const GRAD_THRESHOLD = 55;          // 福慧雙項皆 ≥ 55 即可畢業（手冊「條件二：全員畢業」）
const CIV_BASE = 40;                // 文明高度基礎點：白骰 × 黑骰 ＋ 此基礎
const DIE_MIN = 1, DIE_MAX = 6;     // 實體白/黑骰點數範圍
const MILESTONES = [25, 35, 45, 55]; // 單項里程；最後一階＝畢業線
const NAV_THRESHOLDS = [15, 35, 55];   // 領航者際遇：場上首位福慧雙達者
const SELF_THRESHOLDS = [25, 45];      // 自我突破際遇：任一玩家福慧雙達者
const STATS = ['fortune', 'wisdom', 'civ'];
const STAT_LABEL = (stat) => t('players.' + stat);

function emptyNavClaim() {
  return NAV_THRESHOLDS.reduce((o, n) => (o[n] = null, o), {});
}

// App version — single source of truth. Keep the trailing build number in sync
// with the CACHE bump in sw.js so a host can confirm the running build.
const APP_VERSION = '1.2.0 (build 51)';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

// ─────────── State ───────────
const defaultState = () => ({
  roundNum: 1,
  civGoal: 30,
  timer: { accumulated: 0, lastStartedAt: null, running: false },
  players: [],
  log: [],
  pendingDraws: [],   // 尚未處理的「抽卡」里程：主持人抽完卡後手動清除
  history: [],
  navigatorClaimed: emptyNavClaim(),
  customDecks: { action: null, boost: null },
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
    // Ensure pendingDraws shape (older saves predate this field)
    if (!Array.isArray(state.pendingDraws)) state.pendingDraws = [];
    // Ensure customDecks shape (older saves predate this field)
    state.customDecks = Object.assign({ action: null, boost: null }, state.customDecks || {});
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

// ─────────── 倒數衝刺：無常與恩典齊發 ───────────
// 在最後 SPRINT_SECONDS（15 分鐘）內，所有卡牌的得分與扣分一律 ×2。
function sprintActive() {
  return elapsedSeconds() >= maxGameSeconds() - SPRINT_SECONDS;
}
function scoreMultiplier() {
  return sprintActive() ? SPRINT_MULTIPLIER : 1;
}
// 依倍率縮放一張卡的 reward（保留各分項正負號）。
function scaleReward(base = {}, mult = 1) {
  const out = {};
  STATS.forEach(stat => { out[stat] = (base[stat] || 0) * mult; });
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
function logEvent(text, kind = '') {
  state.log.unshift({ text, kind, t: elapsedSeconds() });
  if (state.log.length > 40) state.log.pop();
  renderLog();
}
function renderLog() {
  const ul = $('#milestone-log');
  if (!state.log.length) {
    ul.innerHTML = `<li class="empty">${t('messages.empty_log')}</li>`;
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

// ─────────── 待處理抽卡佇列 ───────────
// 需要主持人「去抽一張卡」的里程（領航者 / 自我突破 / 接近畢業）在觸發時，
// 除了 toast + log，還在面板上留一條待辦；主持人抽完卡點「已抽」才消失，避免漏抽。
function addPendingDraw(text, playerId) {
  state.pendingDraws.push({
    id: 'pd_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
    text, playerId, t: elapsedSeconds(),
  });
  renderPendingDraws();
  openDrawModal();   // 強制彈出、要主持人點掉才收起
}
function resolvePendingDraw(id) {
  state.pendingDraws = state.pendingDraws.filter(d => d.id !== id);
  save();
  renderPendingDraws();
  renderDrawModal();
}
// 置中強制 modal：任一「抽卡里程」觸發即彈出，列出所有待抽卡。
function renderDrawModal() {
  const modal = $('#draw-modal');
  const listEl = $('#draw-list');
  if (!modal || !listEl) return;
  const list = state.pendingDraws || [];
  if (!list.length) { modal.classList.add('hidden'); return; }
  listEl.innerHTML = list.map(d =>
    `<li><span class="dl-text">${escapeHtml(d.text)}</span>` +
    `<button class="btn btn-primary dl-done" data-pd-id="${d.id}" type="button">已抽</button></li>`
  ).join('');
  listEl.querySelectorAll('.dl-done').forEach(btn =>
    btn.addEventListener('click', () => resolvePendingDraw(btn.dataset.pdId)));
}
function openDrawModal() {
  if (!(state.pendingDraws || []).length) return;
  renderDrawModal();
  $('#draw-modal').classList.remove('hidden');
}
function renderPendingDraws() {
  const ul = $('#pending-draws');
  if (!ul) return;
  const list = state.pendingDraws || [];
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

function processStatChange(player, stat, oldVal, newVal) {
  if (stat === 'civ') return;
  // Only the graduation-line milestone (55) is announced. The single-stat
  // 25/35/45 「抽里程際遇卡」 prompts were removed — they aren't in the rulebook
  // (the only card-draw milestones are the dual 領航者 / 自我突破 際遇).
  const m = GRAD_THRESHOLD;
  const k = key(stat, m);
  if (oldVal < m && newVal >= m && !player.notified[k]) {
    player.notified[k] = true;
    const msg = `${player.name || t('common.player')} ${STAT_LABEL(stat)} 達 ${m}　抽卡、可宣告畢業`;
    toast(msg, 'grad');
    logEvent(msg, 'grad');
    addPendingDraw(`${player.name || t('common.player')}　${STAT_LABEL(stat)}達 ${m}　抽卡、可宣告畢業`, player.id);
    flashCard(player.id);
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
      addPendingDraw(`領航者際遇　${player.name || '玩家'} 福慧雙達 ${n}　抽 1 張`, player.id);
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
      addPendingDraw(`自我突破際遇　${player.name || '玩家'} 福慧雙達 ${n}　抽 1 張`, player.id);
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
    const msg = `${player.name || '玩家'} 資格降級（福或慧 < ${GRAD_THRESHOLD}）`;
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
  const started = state.players.length > 0;
  // 開局前尚未骰出文明高度目標，顯示破折號而非佔位數字。
  $('#civ-goal').textContent = started ? state.civGoal : '—';
  const total = totalCiv();
  $('#civ-total').textContent = total;

  const pct = Math.min(100, (total / Math.max(1, state.civGoal)) * 100);
  $('#civ-bar-fill').style.width = pct + '%';

  // 集體文明達標＝勝利：進度條轉金、跳通知並記 log。旗標在回落時清除，
  // 所以主持人改錯數字後再次達標仍會重新慶祝。
  const goalReached = total >= state.civGoal;
  $('.civ-bar').classList.toggle('reached', goalReached);
  const civLabel = $('.civ-progress-label');
  civLabel.classList.toggle('reached', goalReached);
  civLabel.textContent = goalReached
    ? t('civ.progress_reached', { total, goal: state.civGoal })
    : t('civ.progress_label');
  if (goalReached && !state._civGoalNoticed) {
    state._civGoalNoticed = true;
    toast(t('messages.civ_goal_reached', {goal: state.civGoal}), 'grad');
    logEvent(t('messages.civ_goal_reached_log', {goal: state.civGoal}), 'grad');
  } else if (!goalReached && state._civGoalNoticed) {
    state._civGoalNoticed = false;
  }

  // 條件二：全員畢業 — 所有玩家皆畢業即達成「全員圓滿」、可進行結算。
  const allGraduated = state.players.length > 0 && state.players.every(p => p.graduated);
  if (allGraduated && !state._allGradNoticed) {
    state._allGradNoticed = true;
    toast(t('messages.all_graduated'), 'grad');
    logEvent(t('messages.all_graduated_log'), 'grad');
  } else if (!allGraduated && state._allGradNoticed) {
    state._allGradNoticed = false;
  }

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
  const banner = $('#sprint-banner');
  if (banner) banner.classList.toggle('hidden', !sprint);

  const btn = $('#btn-toggle-timer');
  btn.textContent = state.timer.running ? t('ui.btn_pause_timer') : t('ui.btn_start_timer');

  if (sprint && !state._sprintNoticed) {
    state._sprintNoticed = true;
    toast(t('messages.sprint_started'), 'grad');
    logEvent(t('messages.sprint_started_log'), 'grad');
  }

  if (sec >= maxSec && !state._timeUpNoticed) {
    state._timeUpNoticed = true;
    pauseTimer();
    toast(t('messages.time_up', {min: gameMinutes()}), 'grad');
    logEvent(t('messages.time_up_log'), 'grad');
  }
}

// ─────────── Render: Player cards ───────────
function renderPlayers() {
  const grid = $('#players');
  grid.innerHTML = '';
  grid.style.setProperty('--cols', state.players.length <= 4 ? 2 : 3);
  // Quick-draw shortcuts only make sense with a running game
  $('#quick-draw').classList.toggle('hidden', !state.players.length);
  if (!state.players.length) {
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
  state.players.forEach(p => grid.appendChild(buildPlayerCard(p)));
}

function buildPlayerCard(p) {
  const card = document.createElement('article');
  card.className = 'player-card' + (p.graduated ? ' graduated' : '');
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

    <div class="pc-actions">
      <button class="pc-origin-open" data-act="origin" title="${t('ui.origin_title')}">${t('ui.btn_origin')}</button>
      <button class="pc-adjust" data-act="adjust" title="${t('ui.adjust_title')}">${t('ui.btn_adjust')}</button>
    </div>

    <footer class="pc-foot">
      <span class="pc-status">${p.graduated ? t('ui.graduated_status') : statusHint(p)}</span>
      <button class="pc-remove" data-act="remove">${t('ui.btn_remove')}</button>
    </footer>
  `;

  // Event delegation
  card.addEventListener('click', (e) => {
    const t = e.target;
    if (t.matches('.tap')) {
      const stat = t.dataset.stat;
      const delta = parseInt(t.dataset.delta, 10);
      adjustStat(p.id, stat, delta);
    } else if (t.closest('[data-act="origin"]')) {
      openOriginModal(p.id);
    } else if (t.closest('[data-act="adjust"]')) {
      openAdjustModal(p.id);
    } else if (t.matches('[data-act="remove"]')) {
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

function statusHint(p) {
  if (p.fortune >= GRAD_THRESHOLD - 5 && p.wisdom >= GRAD_THRESHOLD - 5) return t('ui.status_near_grad');
  if (p.fortune >= 35 || p.wisdom >= 35) return t('ui.status_mid');
  return t('ui.status_training');
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
      <div class="stat-label">${STAT_LABEL(stat)}</div>
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

// ─────────── 批次調分 ───────────
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
  const mult = scoreMultiplier();
  const raw = adjustInputs();
  STATS.forEach(stat => {
    const row = document.querySelector(`#adjust-rows .adjust-row[data-stat="${stat}"]`);
    if (!row) return;
    const applied = raw[stat] * mult;
    const next = Math.max(0, (p[stat] || 0) + applied);
    const prev = row.querySelector('.adjust-preview');
    if (raw[stat] === 0) {
      prev.textContent = `目前 ${p[stat] || 0}`;
    } else {
      const sign = applied > 0 ? '+' : '';
      prev.textContent = `${p[stat] || 0} → ${next}　(${sign}${applied})`;
    }
  });
}
function openAdjustModal(id) {
  const p = getPlayer(id); if (!p) return;
  adjustTargetId = id;
  $('#adjust-sub').textContent = p.name || '玩家';
  STATS.forEach(stat => {
    const inp = document.querySelector(`#adjust-rows .adjust-row[data-stat="${stat}"] .adjust-input`);
    if (inp) inp.value = '0';
  });
  $('#adjust-sprint').classList.toggle('hidden', !sprintActive());
  renderAdjustPreview();
  $('#adjust-modal').classList.remove('hidden');
}
function closeAdjustModal() {
  $('#adjust-modal').classList.add('hidden');
  adjustTargetId = null;
}
function applyAdjust() {
  const p = getPlayer(adjustTargetId); if (!p) { closeAdjustModal(); return; }
  const name = p.name || '玩家';
  const mult = scoreMultiplier();
  const scaled = scaleReward(adjustInputs(), mult);      // 衝刺階段三項 ×2
  const hasChange = STATS.some(stat => scaled[stat]);
  if (!hasChange) { closeAdjustModal(); return; }
  closeAdjustModal();   // 先關閉，若跨里程讓待抽卡 modal 乾淨地彈出
  const base = {}; STATS.forEach(stat => { base[stat] = p[stat] || 0; });
  STATS.forEach(stat => { if (scaled[stat]) setStat(p.id, stat, base[stat] + scaled[stat]); });
  const tag = mult > 1 ? t('messages.sprint_tag') : '';
  const msg = `${name} 批次調分　${describeReward(scaled)}${tag}`;
  toast(msg, 'grad');
  logEvent(msg, 'grad');
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
function scoreOrigin(playerId, stop) {
  const p = getPlayer(playerId); if (!p) return;
  const mult = scoreMultiplier();
  const r = scaleReward(originReward(p, stop), mult);   // 衝刺階段自動 ×2
  const bp = {}; STATS.forEach(s => { bp[s] = p[s] || 0; });
  STATS.forEach(stat => { if (r[stat]) setStat(playerId, stat, bp[stat] + r[stat]); });
  const tag = mult > 1 ? t('messages.sprint_tag') : '';
  const msg = `${p.name || '玩家'} ${stop ? '停在' : '經過'}起始點　${describeReward(r)}${tag}`;
  toast(msg, 'grad');
  logEvent(msg, 'grad');
}

// 起始點加分 modal：選 經過／停格，衝刺階段顯示 ×2 提示與加倍後的獎勵。
let originTargetId = null;
function openOriginModal(id) {
  const p = getPlayer(id); if (!p) return;
  originTargetId = id;
  const mult = scoreMultiplier();
  $('#origin-sub').textContent = p.name || '玩家';
  $('#origin-sprint').classList.toggle('hidden', mult <= 1);
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
  const fwEl = card.querySelector('.pc-fw strong');
  if (fwEl) fwEl.textContent = (p.fortune || 0) + (p.wisdom || 0);

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
    p.graduated ? t('ui.graduated_status') : statusHint(p);

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
  mode: 'new', // 'new' = brand-new game (clears history); 'next' = next round (archives current)
};

// 文明高度 ＝ 白骰 × 黑骰 ＋ 基礎 40（骰點鉗制在 1–6）
function clampDie(v) {
  const n = parseInt(v, 10);
  if (!Number.isFinite(n)) return DIE_MIN;
  return Math.min(DIE_MAX, Math.max(DIE_MIN, n));
}
function computeCivGoal(white, black) {
  return clampDie(white) * clampDie(black) + CIV_BASE;
}
// Refresh the live "白 × 黑 ＋ 40 ＝ N" readout from the two dice inputs.
function updateCivCalc() {
  const w = clampDie($('#setup-civ-white').value);
  const b = clampDie($('#setup-civ-black').value);
  $('#civ-calc-white').textContent = w;
  $('#civ-calc-black').textContent = b;
  $('#civ-calc-goal').textContent = w * b + CIV_BASE;
}

function openSetup(opts = {}) {
  const mode = opts.mode === 'next' ? 'next' : 'new';
  setupTmp.mode = mode;
  setupTmp.count = state.players.length || 4;
  // Next round: carry the same players (names) but blank 福/慧 so the host
  // re-rolls each round's initial values. New game: pre-fill current values.
  setupTmp.rolls = state.players.length
    ? state.players.map(p => ({
        name: p.name,
        fortune: mode === 'next' ? 0 : p.fortune,
        wisdom:  mode === 'next' ? 0 : p.wisdom,
      }))
    : Array.from({ length: setupTmp.count }, () => ({ name: '', fortune: 0, wisdom: 0 }));
  $('#setup-round').value = mode === 'next' ? state.roundNum + 1 : state.roundNum;
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
  const isNext = setupTmp.mode === 'next';
  // 下一局：先把目前這一局存進歷史（之後可從歷史檢視／切回），再建立新的一局。
  if (isNext && state.players.length) {
    if (state.timer.running) pauseTimer();
    const snap = snapshotRound();
    snap.completedAt = Date.now();
    state.history.push(snap);
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
  state.civGoal = computeCivGoal($('#setup-civ-white').value, $('#setup-civ-black').value);
  resetTimer();
  state._timeUpNoticed = false;
  state._sprintNoticed = false;
  state._civGoalNoticed = false;
  state._allGradNoticed = false;
  if (!isNext) state.history = [];   // only a brand-new game clears history; 下一局 keeps it
  state.navigatorClaimed = emptyNavClaim();
  // Navigator: silent pre-claim if any player already starts above each threshold (player array order = priority)
  NAV_THRESHOLDS.forEach(n => {
    const first = state.players.find(p => Math.min(p.fortune, p.wisdom) >= n);
    if (first) state.navigatorClaimed[n] = first.id;
  });
  state.log = [];
  state.pendingDraws = [];
  logEvent(isNext
    ? t('messages.round_started_log', {round: state.roundNum, goal: state.civGoal})
    : t('messages.round_restored_log', {round: state.roundNum, goal: state.civGoal}), 'grad');
  save();
  closeSetup();
  renderAll();
  if (isNext) toast(t('messages.round_started', {round: state.roundNum}));
}

// ─────────── Topbar / sidebar bindings ───────────
function bindEvents() {
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

  // 批次調分 modal
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
    state.pendingDraws = [];
    save();
    renderPendingDraws();
    $('#draw-modal').classList.add('hidden');
  });

  $$('.player-count-pick .chip').forEach(b =>
    b.addEventListener('click', () => setSetupCount(+b.dataset.count)));

  $('#btn-reset-game').addEventListener('click', async () => {
    const ok = await confirmModal({ title: t('confirm.reset_game_title'), message: t('confirm.reset_game_msg'), confirmText: t('confirm.reset'), danger: true });
    if (!ok) return;
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

// Switch the live game to a past round without losing the current one. The round
// you're leaving is archived into the slot the chosen round vacated (a swap), so
// every round stays available and you can switch back any time — nothing is lost.
async function restoreRound(idx) {
  const entry = state.history && state.history[idx];
  if (!entry) return;
  const ok = await confirmModal({
    title: `切回第 ${entry.roundNum} 局`,
    message: `目前的第 ${state.roundNum} 局會自動存進歷史，之後可隨時再切回，不會遺失。`,
    confirmText: '切回此局',
  });
  if (!ok) return;

  // Finalize the current round's elapsed time, then snapshot it.
  if (state.timer.running) pauseTimer();
  const leaving = snapshotRound();
  leaving.completedAt = Date.now();

  // Load the chosen past round as the live game.
  state.roundNum = entry.roundNum;
  state.civGoal = entry.civGoal;
  state.timer = entry.timer;
  state.players = entry.players;
  state.log = entry.log;
  state.navigatorClaimed = Object.assign(emptyNavClaim(), entry.navigatorClaimed || {});

  // The vacated slot now holds the round we just left — a swap, so the round
  // count is unchanged and no round disappears.
  state.history[idx] = leaving;

  state._timeUpNoticed = elapsedSeconds() >= maxGameSeconds();
  state._sprintNoticed = sprintActive();
  state._civGoalNoticed = totalCiv() >= state.civGoal;
  state._allGradNoticed = state.players.length > 0 && state.players.every(p => p.graduated);
  save();
  renderAll();
  closeHistory();
  toast(t('messages.round_restored', {round: state.roundNum, oldRound: leaving.roundNum}), 'grad');
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
      <span class="hd-readonly">唯讀檢視 · 不影響目前對局</span>
    </div>
    <div class="hd-title">第 ${entry.roundNum} 局</div>
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
  if (!state.players.length) return '';
  const items = state.players.map(p => `
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

  const playerOpts = state.players.map(p =>
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
  if (mult > 1) {
    const doubled = describeReward(scaleReward(c.reward || {}, mult));
    return `<div class="card-reward sprint">${t('card.reward_sprint', {mult, reward: escapeHtml(doubled)})}` +
           `<span class="card-reward-base">${t('card.reward_original', {reward: escapeHtml(c.rewardText)})}</span></div>`;
  }
  return `<div class="card-reward">${t('card.reward_prefix')}${escapeHtml(c.rewardText)}</div>`;
}

// The 附加 (side) line. Side effects are applied by hand, so during the sprint
// they are NOT auto-doubled — remind the host to apply this one at ×2 manually.
function sideLineHtml(c) {
  if (!c.side) return '';
  const note = scoreMultiplier() > 1
    ? `<span class="card-side-x2">${t('card.side_sprint_remind', {mult: 2})}</span>`
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
function choiceEffects(opt) {
  const mult = scoreMultiplier();
  return { each: scaleReward(opt.each || {}, mult), civAll: (opt.civAll || 0) * mult, mult };
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
    condHtml = `<p class="dilemma-cond">目前集體文明 <strong>${total}</strong>（門檻 ${c.conditional.civGte}）` +
               `　→　適用「文明 ${met ? '≥ ' : '< '}${c.conditional.civGte}」分支</p>`;
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

  const sprintHtml = mult > 1
    ? `<div class="card-reward sprint">無常與恩典齊發 ×${mult}　所有增減已加倍顯示</div>` : '';

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

  const playerOpts = state.players.map(p =>
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
// 負分安全（setStat 夾 0）。
function applyChoiceCard(playerIds, card, optIdx) {
  const opt = (card.options || [])[optIdx];
  if (!opt) return;
  const ids = Array.isArray(playerIds) ? playerIds : [playerIds];
  const { each, civAll, mult } = choiceEffects(opt);
  const names = [];
  ids.forEach(pid => {
    const p = getPlayer(pid);
    if (!p) return;
    STATS.forEach(stat => { if (each[stat]) setStat(pid, stat, (p[stat] || 0) + each[stat]); });
    names.push(p.name || t('common.player'));
  });
  if (!names.length) return;
  if (civAll) {
    state.players.forEach(p => setStat(p.id, 'civ', (p.civ || 0) + civAll));   // 集體文明＝場上所有玩家
  }
  const fx = describeChoiceOption(card, opt);
  const tag = mult > 1 ? t('messages.sprint_tag') : '';
  const sideNote = opt.side ? `　※附加：${opt.side}（請手動套用）` : '';
  const positive = describeReward(each).indexOf('-') === -1 && civAll >= 0;
  const msg = `${names.join('、')}「${card.name}」→ ${opt.label}　${fx}${tag}${sideNote}`;
  toast(msg, positive ? 'grad' : '');
  logEvent(msg, 'milestone');
  closeCard();
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
  const custom = state.customDecks && state.customDecks[side];
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
  if (actionCount !== null) parts.push(`${t('dm.action_label')} ${actionCount} ${t('dm.count_suffix').strip()}`);
  if (boostCount  !== null) parts.push(`${t('dm.boost_label')} ${boostCount} ${t('dm.count_suffix').strip()}`);
  const ok = await confirmModal({ title: t('confirm.import_deck_title'), message: t('confirm.import_deck_msg', {parts: parts.join(' · ')}), confirmText: t('confirm.import') });
  if (!ok) return;

  const next = Object.assign({ action: null, boost: null }, state.customDecks || {});
  if (data.actionDeck) next.action = data.actionDeck;
  if (data.boostDeck)  next.boost  = data.boostDeck;
  state.customDecks = next;

  rebuildDecks();
  save();
  renderDeckManager();
  toast(t('messages.cards_updated'), 'grad');
}

async function resetDecksToDefault() {
  if (!state.customDecks || (!state.customDecks.action && !state.customDecks.boost)) {
    toast(t('messages.already_default_deck'));
    return;
  }
  const ok = await confirmModal({ title: t('confirm.reset_deck_title'), message: t('confirm.reset_deck_msg'), confirmText: t('confirm.reset'), danger: true });
  if (!ok) return;
  state.customDecks = { action: null, boost: null };
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
function applyCardReward(playerIds, card) {
  if (!card) return;
  const ids = Array.isArray(playerIds) ? playerIds : [playerIds];
  const mult = scoreMultiplier();
  const r = scaleReward(card.reward || {}, mult);
  const names = [];
  ids.forEach(pid => {
    const p = getPlayer(pid);
    if (!p) return;
    if (r.fortune) setStat(pid, 'fortune', (p.fortune || 0) + r.fortune);
    if (r.wisdom)  setStat(pid, 'wisdom',  (p.wisdom  || 0) + r.wisdom);
    if (r.civ)     setStat(pid, 'civ',     (p.civ     || 0) + r.civ);
    names.push(p.name || t('common.player'));
  });
  if (!names.length) return;
  // During the sprint show the doubled per-player tally plus a clear ×2 tag;
  // otherwise the card's own wording. For 雙方 cards spell out the per-player
  // grant so two names + the value read unambiguously.
  const rewardText = mult > 1
    ? describeReward(r)
    : (ids.length > 1 ? t('messages.both_receive', {reward: describeReward(r)}) : card.rewardText);
  const tag = mult > 1 ? t('messages.sprint_tag') : '';
  const msg = t('messages.card_completed', {names: names.join('、'), card: card.name, reward: rewardText, tag: tag});
  toast(msg, 'grad');
  logEvent(msg, 'grad');
  closeCard();
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

// ─────────── App version ───────────
// Stamp APP_VERSION into every spot tagged with [data-app-version].
function renderVersion() {
  $$('[data-app-version]').forEach((el) => { el.textContent = 'v' + APP_VERSION; });
}

// ─────────── Init ───────────
function init() {
  const hasGame = load();
  // Rebuild deck pools from possibly-custom state.customDecks
  rebuildDecks();
  // Bump nextPlayerId past existing ids so new players don't collide
  if (state.players.length) {
    const maxId = state.players.reduce((m, p) => {
      const n = parseInt(String(p.id).replace(/^p/, ''), 10);
      return Number.isFinite(n) ? Math.max(m, n) : m;
    }, 0);
    nextPlayerId = maxId + 1;
  }
  renderVersion();
  bindEvents();
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
  rebuildDecks();
  renderAll();
});
