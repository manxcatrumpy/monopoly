'use strict';

// ─────────────────────────────────────────────────────────────────────────
// 福慧大富翁 Dashboard
// ─────────────────────────────────────────────────────────────────────────

// ─────────── Card decks ───────────
// Host-updated deck content (4 categories). Each category carries a base reward;
// a card may override it via its own `reward` / `rewardText`, and `side` notes a
// manual extra effect that the host applies by hand.
const DEFAULT_ACTION_DECK = {
  '福慧雙增': {
    reward: { fortune: 2, wisdom: 2, civ: 2 },
    rewardText: '福報 +2 · 智慧 +2 · 文明 +2',
    cards: [
      { name: '真誠傾聽', desc: '邀請場上「福報最低」者分享近期開心小事。專注傾聽並真誠肯定，不打斷也不轉移話題。' },
      { name: '經驗傳承', desc: '分享過去踩坑的實用教訓。正視過去的不足而認真成長，是智慧；將跌倒經驗化為他人的避坑指南，即是添福。' },
      { name: '打破成見', desc: '分享一個偏頗的日常觀念，並說明如何醒悟。承認自身的無知並願意打破框架，需要極大的「智慧」；接納多元、不輕易評斷，結下廣闊人際的「福報」。' },
      { name: '情緒覺察', desc: '說出微小負面情緒，分享如何「接納它」或「轉念放下它」。情緒沒有對錯，看見並允許它存在即是「智慧」；能與情緒共處、停止情緒蔓延，為「福報」止漏。' },
      { name: '跨越情緒', desc: '分享你的「情緒急救小撇步」（例如：喝杯溫水、深呼吸三次），並邀請全桌玩家跟著你一起做一次這個動作。' },
      { name: '語言力量', desc: '用溫暖肯定的話鼓勵積分落後或遇無常者。在他人低潮時給予正向引導是「智慧」；用善語驅散陰霾、給予支持，即是美好的「福報」。' },
      { name: '物盡其用', desc: '分享生活中延長物品壽命或一物多用的技巧。惜物愛物是培福，巧思應用是長慧。' },
      { name: '時間布施', desc: '宣告下輪放棄移動，將擲骰機會讓給左方。體會無私讓利、成就他人的快樂，帶來無形的「福報」；成就他人是「智慧」。' },
      { name: '跨界學習', desc: '向任一玩家提出想了解的事，請對方用 1 分鐘為你解答。', side: '解答者額外獲得文明 +1' },
    ],
  },
  '福報專精': {
    reward: { fortune: 3, wisdom: 0, civ: 1 },
    rewardText: '福報 +3 · 文明 +1',
    cards: [
      { name: '微小善意', desc: '承諾遊戲後的 24 小時內，完成一件微小付出，並與全桌擊掌為證。將善意從遊戲桌面延伸到真實的日常生活中，化為守護社會的真實「福報」。' },
      { name: '無私分享', desc: '拿出自己的 2 點福報，無條件贈予場上福報最少的玩家。克服匱乏、明白給予不會讓自己變少，是「智慧」的突破；主動拉拔落後者，是「福報」的實踐。' },
      { name: '主動承擔', desc: '承諾本次聚會結束後主動承擔一項善後工作。敏銳看見環境的需要並主動補位，是「智慧」；促成和諧，是最直接累積「福報」的方法。' },
      { name: '成就他人', desc: '分享一次放棄出風頭、把舞台或功勞讓給別人的經驗。功成身退而不爭，是「智慧」；成就他人的成長，是無量「福報」。' },
      { name: '感恩回饋', desc: '分享近期默默為你付出的人，並現場傳訊道謝。能看見他人的好與付出，是「智慧」的顯現；將感恩化為實際行動，啟動「福報」循環。' },
    ],
  },
  '福慧文明聯動': {
    reward: { fortune: 2, wisdom: 2, civ: 2 },
    rewardText: '福報 +2 · 智慧 +2 · 文明 +2',
    cards: [
      { name: '共好提案', desc: '為空間或活動提出一個「讓大家更舒適或更有意義」的微型提案（例如：調整燈光、換個座位、約定不看手機），經半數同意即刻執行。' },
      { name: '弱勢關懷', desc: '與目前總積分最低的一名玩家結盟。對方能同步獲得你下一次的福報與智慧點數。' },
      { name: '知識開源', desc: '分享並說明一個能提升效率、品質或身心健康的實用工具／方法／APP。' },
      { name: '世代／跨界對話', desc: '分享你從不同年齡層，或不同領域的人身上，學到最寶貴的一堂課。' },
      { name: '環保倡議', desc: '提出一項可以立刻實踐的減碳／環保行動（如：出門帶環保杯、冷氣調高一度）。', side: '首位響應者獲福報 +1' },
    ],
  },
  '智慧專精': {
    reward: { fortune: 1, wisdom: 3, civ: 2 },
    rewardText: '智慧 +3 · 福報 +1 · 文明 +2',
    cards: [
      { name: '接納無常', desc: '分享一次計畫被打亂時，迅速放下執著並調整的經驗。立即調整、接受當下，需要極大的「智慧」；隨遇而安、不生抱怨，即是守住「福報」。' },
      { name: '反求諸己', desc: '分享一次發生衝突時，意識到「其實自己也有責任」的經歷。停止指責、轉向內省，是難得的「智慧」；自我反省能化解芥蒂，自然能留住「福報」。' },
      { name: '每日閱讀', desc: '分享一句深深影響你的座右銘，或聽到的一句充滿力量的話語。汲取他人經驗與思想，是站在巨人肩膀上累積「智慧」；將好觀念傳遞給他人，即是知識開源的「福報」。' },
      {
        name: '覆盤總結',
        desc: '客觀分析目前遊戲的局勢，提出能讓整體分數更高的建議。',
        reward: { fortune: 1, wisdom: 3, civ: 3 },
        rewardText: '智慧 +3 · 福報 +1 · 文明 +3',
      },
      { name: '靜心錨定', desc: '帶領全桌閉上眼睛，同步深呼吸 3 次，重新將意識拉回當下。', side: '參與配合的玩家皆獲得智慧 +1' },
    ],
  },
};

function getActionDeck() {
  return (state.customDecks && state.customDecks.action) || DEFAULT_ACTION_DECK;
}
function getBoostDeck() {
  return (state.customDecks && state.customDecks.boost) || DEFAULT_BOOST_DECK;
}

function buildActionPool() {
  const pool = [];
  Object.entries(getActionDeck()).forEach(([cat, data]) => {
    data.cards.forEach(c => pool.push({
      type: 'action',
      category: cat,
      name: c.name,
      desc: c.desc,
      side: c.side || '',
      reward: c.reward || data.reward,
      rewardText: c.rewardText || data.rewardText,
    }));
  });
  return pool;
}

// ─────────── Boost deck (共好加速卡) ───────────
// Each card stands alone (no categories). 「即時行動」 + 「福慧覺察」 sections.
const DEFAULT_BOOST_DECK = [
  { name: '能量補給站',   reward: { fortune: 1, wisdom: 0, civ: 1 }, rewardText: '雙方 福報 +1 · 文明 +1', both: true,
    action: '與上一家擊掌，並互相對彼此大聲說一句：「有你一起，真好」。',
    insight: '懂得正向表達，同時激勵他人的共好行動。' },
  { name: '隨手微服務',   reward: { fortune: 3, wisdom: 0, civ: 0 }, rewardText: '雙方 福報 +3', both: true,
    action: '主動為上一家做一件微小的服務（例如：幫他倒水、遞一張衛生紙、或幫他把眼前的桌面稍微整理整齊⋯）。',
    insight: '用行動主動利他。' },
  { name: '無聲的祝福',   reward: { fortune: 1, wisdom: 1, civ: 0 }, rewardText: '雙方 福報 +1 · 智慧 +1', both: true,
    action: '對上一家露出真誠的燦爛「笑臉」，傳遞無聲的善意。',
    insight: '善意不需要複雜的包裝，簡單的交流就能傳遞溫暖。' },
  { name: '點數大共享',   reward: { fortune: 2, wisdom: 0, civ: 0 }, rewardText: '福報 +2',
    action: '將自己身上的 1 點「福報」或「智慧」贈予上一家，並對他說：「這份好運，分給你」。',
    insight: '慷慨是打破匱乏感的最佳練習。願意分享，福報反而會回流。' },
  { name: '感恩的共振',   reward: { fortune: 3, wisdom: 2, civ: 1 }, rewardText: '雙方 福報 +3 · 智慧 +2 · 文明 +1', both: true,
    action: '你與上一家輪流分享一件「今天發生、值得感恩的小事」。',
    insight: '心懷感恩，能瞬間帶動周圍的和諧氛圍。' },
  { name: '正念同頻率',   reward: { fortune: 1, wisdom: 2, civ: 0 }, rewardText: '雙方 福報 +1 · 智慧 +2', both: true,
    action: '你與上一家一起閉上眼睛，由你喊節拍，兩人同步進行 3 次深呼吸。',
    insight: '在喧鬧中找回平靜，把注意力收回到自己的身體。' },
  { name: '情緒資源回收', reward: { fortune: 2, wisdom: 2, civ: 1 }, rewardText: '雙方 福報 +2 · 智慧 +2 · 文明 +1', both: true,
    action: '與上一家各自說出近期的「小煩惱」，說完後，兩人一起「大笑三聲」把它丟掉。',
    insight: '幽默感與轉念，是面對無常時最強大的心理韌性。' },
  { name: '傾聽的修煉',   reward: { fortune: 1, wisdom: 2, civ: 0 }, rewardText: '雙方 福報 +1 · 智慧 +2', both: true,
    action: '請上一家分享此刻的「心情或感受」，需全神貫注地看著對方，認真傾聽。',
    insight: '真正的傾聽必須放下「我執」與「想給建議的衝動」。' },
  { name: '舒展與覺知',   reward: { fortune: 1, wisdom: 2, civ: 0 }, rewardText: '雙方 福報 +1 · 智慧 +2', both: true,
    action: '由上一家示範一個簡單的「肩頸伸展或伸懶腰動作」，你跟著他一起做 10 秒鐘。',
    insight: '身體是修行的殿堂。隨時覺察並照顧身體的緊繃。' },
  { name: '意圖的宣告',   reward: { fortune: 2, wisdom: 2, civ: 0 }, rewardText: '雙方 福報 +2 · 智慧 +2', both: true,
    action: '你與上一家輪流大聲宣告一個「遊戲結束前要完成的微小目標」（例如：我要多微笑、我要不抱怨）。',
    insight: '為自己的行為設定清晰的意圖，是有意識生活的開始。' },
];

function buildBoostPool() {
  return getBoostDeck().map(c => ({ type: 'boost', ...c }));
}

function rebuildDecks() {
  DECKS.action.pool = buildActionPool();
  DECKS.boost.pool = buildBoostPool();
}

const STORAGE_KEY = 'fuhui-dashboard-state-v1';
const MAX_GAME_SECONDS = 100 * 60;
const SPRINT_SECONDS = 15 * 60;        // 最後 15 分鐘「無常與恩典齊發」：卡牌得分／扣分 ×2
const SPRINT_MULTIPLIER = 2;
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
  if (cap) cap.textContent = '點玩家旁的「擲福 / 擲慧」開始擲骰';
}

function rollSetupDie(stat, idx) {
  if (diceBusy) return; // one roll at a time
  const die = $('#die10');
  const cap = $('#dice-caption');
  const input = $(`.setup-player-row[data-idx="${idx}"] .roll-out.${stat}`);
  if (!die || !d10Faces.length || !input) return;

  const finalValue = roll(10);
  setupTmp.rolls[idx][stat] = finalValue;
  const name = setupTmp.rolls[idx].name || `玩家 ${idx + 1}`;
  const statLabel = stat === 'fortune' ? '福報' : '智慧';

  diceBusy = true;
  stopDieIdle();
  die.classList.remove('fortune', 'wisdom');
  die.classList.add(stat);
  cap.textContent = `${name} · ${statLabel} 擲骰中…`;

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
  return elapsedSeconds() >= MAX_GAME_SECONDS - SPRINT_SECONDS;
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
    .map(stat => `${STAT_LABEL[stat]} ${r[stat] > 0 ? '+' : ''}${r[stat]}`)
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
function confirmModal({ title = '確認', message = '', confirmText = '確定', cancelText = '取消', danger = false } = {}) {
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

  // Final-15-minute sprint: surface it in the timer and a top banner.
  const sprint = sprintActive();
  timerEl.classList.toggle('sprint', sprint);
  const banner = $('#sprint-banner');
  if (banner) banner.classList.toggle('hidden', !sprint);

  const btn = $('#btn-toggle-timer');
  btn.textContent = state.timer.running ? '暫停' : '開始';

  if (sprint && !state._sprintNoticed) {
    state._sprintNoticed = true;
    toast('無常與恩典齊發 — 最後 15 分鐘，卡牌得分與扣分 ×2', 'grad');
    logEvent('無常與恩典齊發啟動 — 卡牌得分／扣分 ×2', 'grad');
  }

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
        <div class="empty-icon"><svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><g stroke="#E0A331" stroke-width="2.6" stroke-linecap="round"><line x1="32" y1="17" x2="32" y2="10.5"></line><line x1="32" y1="17" x2="32" y2="10.5" transform="rotate(45 32 32)"></line><line x1="32" y1="17" x2="32" y2="10.5" transform="rotate(90 32 32)"></line><line x1="32" y1="17" x2="32" y2="10.5" transform="rotate(135 32 32)"></line><line x1="32" y1="17" x2="32" y2="10.5" transform="rotate(180 32 32)"></line><line x1="32" y1="17" x2="32" y2="10.5" transform="rotate(225 32 32)"></line><line x1="32" y1="17" x2="32" y2="10.5" transform="rotate(270 32 32)"></line><line x1="32" y1="17" x2="32" y2="10.5" transform="rotate(315 32 32)"></line></g><circle cx="32" cy="32" r="11.5" fill="#EFC158"></circle></svg></div>
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
      confirmModal({ title: '移除玩家', message: `確定要移除「${p.name || '玩家'}」？`, confirmText: '移除', danger: true })
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
  mode: 'new', // 'new' = brand-new game (clears history); 'next' = next round (archives current)
};

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
  $('#setup-civ-goal-input').value = state.civGoal || 30;
  const title = $('#setup-title');
  if (title) title.textContent = mode === 'next' ? '進入下一局 — 啟程準備' : '開新局 — 啟程準備';
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
        <input type="text" class="sp-name" value="${escapeHtml(r.name)}" placeholder="玩家 ${i + 1}" maxlength="10" />
        <button class="mini-btn" data-roll="fortune">擲福</button>
        <input type="number" class="roll-out fortune" data-stat="fortune" inputmode="numeric" min="0" max="10" value="${r.fortune || ''}" placeholder="" aria-label="福報初始值" />
        <button class="mini-btn" data-roll="wisdom">擲慧</button>
        <input type="number" class="roll-out wisdom" data-stat="wisdom" inputmode="numeric" min="0" max="10" value="${r.wisdom || ''}" placeholder="" aria-label="智慧初始值" />
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
    const ok = await confirmModal({ title: '尚未擲完初始值', message: '有玩家尚未擲福慧初始值，仍要開始嗎？', confirmText: '仍要開始' });
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
  const inputGoal = parseInt($('#setup-civ-goal-input').value, 10);
  if (Number.isFinite(inputGoal) && inputGoal > 0) {
    state.civGoal = inputGoal;
  }
  resetTimer();
  state._timeUpNoticed = false;
  state._sprintNoticed = false;
  if (!isNext) state.history = [];   // only a brand-new game clears history; 下一局 keeps it
  state.navigatorClaimed = emptyNavClaim();
  // Navigator: silent pre-claim if any player already starts above each threshold (player array order = priority)
  NAV_THRESHOLDS.forEach(n => {
    const first = state.players.find(p => Math.min(p.fortune, p.wisdom) >= n);
    if (first) state.navigatorClaimed[n] = first.id;
  });
  state.log = [];
  logEvent(isNext
    ? `進入第 ${state.roundNum} 局 · 文明高度 ${state.civGoal}`
    : `第 ${state.roundNum} 局開局 · 文明高度 ${state.civGoal}`, 'grad');
  save();
  closeSetup();
  renderAll();
  if (isNext) toast(`已進入第 ${state.roundNum} 局 — 上一局已存入歷史紀錄`);
}

// ─────────── Topbar / sidebar bindings ───────────
function bindEvents() {
  $('#btn-toggle-timer').addEventListener('click', toggleTimer);
  $('#btn-next-round').addEventListener('click', () => openSetup({ mode: 'next' }));
  $('#btn-history').addEventListener('click', openHistory);
  $('#history-close').addEventListener('click', closeHistory);
  $('#btn-draw-action').addEventListener('click', () => openCardDraw('action'));
  $('#btn-draw-boost').addEventListener('click', () => openCardDraw('boost'));
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

  $$('.player-count-pick .chip').forEach(b =>
    b.addEventListener('click', () => setSetupCount(+b.dataset.count)));

  $('#btn-reset-game').addEventListener('click', async () => {
    const ok = await confirmModal({ title: '重置整個遊戲', message: '將清除所有玩家積分、計時、設定與歷史，且無法復原。確定要重置嗎？', confirmText: '重置', danger: true });
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

  state._timeUpNoticed = elapsedSeconds() >= MAX_GAME_SECONDS;
  state._sprintNoticed = sprintActive();
  save();
  renderAll();
  closeHistory();
  toast(`已切回第 ${state.roundNum} 局 — 第 ${leaving.roundNum} 局已存入歷史`, 'grad');
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
    ul.innerHTML = `<li class="history-empty">尚無歷史紀錄。按右上「下一局」結束本局時會自動存檔。</li>`;
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
  if (title) title.textContent = '歷史紀錄';
}

// ─────────── Card draw ───────────
const DECKS = {
  action: { title: '行動指令牌', pool: buildActionPool() },
  boost:  { title: '共好加速卡', pool: buildBoostPool()  },
};
let currentCard = null;
let currentDeckKey = null;

function openCardDraw(deckKey) {
  if (!DECKS[deckKey]) return;
  currentDeckKey = deckKey;
  currentCard = drawFromDeck(deckKey);
  $('#card-title').textContent = DECKS[deckKey].title;
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

function renderCard() {
  if (!currentCard) return;
  const c = currentCard;
  const bodyHtml = c.type === 'boost' ? renderBoostBody(c) : renderActionBody(c);
  $('#card-body').innerHTML = bodyHtml;

  const playerOpts = state.players.map(p =>
    `<option value="${p.id}">${escapeHtml(p.name || '玩家')}　（福 ${p.fortune} · 慧 ${p.wisdom} · 文 ${p.civ}）</option>`
  ).join('');
  const selectHtml = (id, label) => `
      <label class="row">
        <span>${label}</span>
        <select id="${id}">
          <option value="">— 請選擇玩家 —</option>
          ${playerOpts}
        </select>
      </label>`;
  // 「雙方」卡（boost）要同時套用給本人與上一家，給兩個下拉；其餘卡用單一收受者。
  const recipientControls = c.both
    ? selectHtml('card-recipient', '本人') + selectHtml('card-recipient2', '上一家')
    : selectHtml('card-recipient', '套用至');
  $('#card-foot').innerHTML = `
    <div class="card-actions">
      ${recipientControls}
      <div class="card-buttons">
        <button class="btn btn-ghost" id="card-redraw">再抽一張</button>
        <button class="btn btn-primary" id="card-apply">套用獎勵</button>
      </div>
    </div>
  `;

  $('#card-redraw').addEventListener('click', () => {
    currentCard = drawFromDeck(currentDeckKey);
    renderCard();
  });
  $('#card-apply').addEventListener('click', () => {
    const pid = $('#card-recipient').value;
    if (!pid) { toast('請先選擇要套用的玩家'); return; }
    if (currentCard.both) {
      const pid2 = $('#card-recipient2').value;
      if (!pid2) { toast('「雙方」卡請選擇上一家玩家'); return; }
      if (pid2 === pid) { toast('本人與上一家不可為同一人'); return; }
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
    return `<div class="card-reward sprint">無常與恩典齊發 ×${mult}　獎勵　${escapeHtml(doubled)}` +
           `<span class="card-reward-base">（原 ${escapeHtml(c.rewardText)}）</span></div>`;
  }
  return `<div class="card-reward">獎勵　${escapeHtml(c.rewardText)}</div>`;
}

// The 附加 (side) line. Side effects are applied by hand, so during the sprint
// they are NOT auto-doubled — remind the host to apply this one at ×2 manually.
function sideLineHtml(c) {
  if (!c.side) return '';
  const note = scoreMultiplier() > 1
    ? `<span class="card-side-x2">衝刺加倍中 · 此附加效果不會自動加倍，請以 ×2 手動套用</span>`
    : '';
  return `<p class="card-side">附加：${escapeHtml(c.side)}${note}</p>`;
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
      <div class="card-category">共好加速卡</div>
      <h3 class="card-name">${escapeHtml(c.name)}</h3>
      <div class="card-section">
        <div class="card-section-label">即時行動</div>
        <p class="card-section-text">${escapeHtml(c.action)}</p>
      </div>
      <div class="card-section">
        <div class="card-section-label">福慧覺察</div>
        <p class="card-section-text">${escapeHtml(c.insight)}</p>
      </div>
      ${sideLineHtml(c)}
      ${rewardLineHtml(c)}
    </div>
  `;
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
  toast('已下載 JSON');
}

function importDeckFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      applyDecksImport(data);
    } catch (err) {
      toast('JSON 解析失敗：' + err.message);
    }
  };
  reader.onerror = () => toast('讀檔失敗');
  reader.readAsText(file, 'utf-8');
}

function importPastedJSON() {
  const raw = $('#dm-paste').value.trim();
  if (!raw) { toast('請先貼上 JSON'); return; }
  try {
    const data = JSON.parse(raw);
    applyDecksImport(data);
  } catch (err) {
    toast('JSON 解析失敗：' + err.message);
  }
}

function validateImport(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return '需為 JSON 物件';
  }
  if (data.actionDeck === undefined && data.boostDeck === undefined) {
    return '至少需提供 actionDeck 或 boostDeck';
  }

  if (data.actionDeck !== undefined) {
    if (typeof data.actionDeck !== 'object' || Array.isArray(data.actionDeck) || data.actionDeck === null) {
      return 'actionDeck 需為物件（類別 → 卡組）';
    }
    for (const [cat, deck] of Object.entries(data.actionDeck)) {
      if (!deck || typeof deck !== 'object') return `「${cat}」需為物件`;
      if (!deck.reward || typeof deck.reward !== 'object') return `「${cat}」缺 reward`;
      if (typeof deck.rewardText !== 'string')             return `「${cat}」缺 rewardText`;
      if (!Array.isArray(deck.cards))                      return `「${cat}」.cards 需為陣列`;
      for (const c of deck.cards) {
        if (!c || typeof c.name !== 'string' || !c.name)   return `「${cat}」內某張卡缺 name`;
        if (typeof c.desc !== 'string')                    return `「${cat}」「${c.name}」缺 desc`;
      }
    }
  }

  if (data.boostDeck !== undefined) {
    if (!Array.isArray(data.boostDeck)) return 'boostDeck 需為陣列';
    for (const c of data.boostDeck) {
      if (!c || typeof c.name !== 'string' || !c.name) return '共好加速卡某張缺 name';
      if (typeof c.action !== 'string')   return `「${c.name}」缺 action`;
      if (typeof c.insight !== 'string')  return `「${c.name}」缺 insight`;
      if (!c.reward || typeof c.reward !== 'object') return `「${c.name}」缺 reward`;
      if (typeof c.rewardText !== 'string') return `「${c.name}」缺 rewardText`;
    }
  }
  return null;
}

async function applyDecksImport(data) {
  const err = validateImport(data);
  if (err) { toast('匯入失敗：' + err); return; }

  const actionCount = data.actionDeck
    ? Object.values(data.actionDeck).reduce((s, d) => s + d.cards.length, 0)
    : null;
  const boostCount  = data.boostDeck ? data.boostDeck.length : null;

  const parts = [];
  if (actionCount !== null) parts.push(`行動指令牌 ${actionCount} 張`);
  if (boostCount  !== null) parts.push(`共好加速卡 ${boostCount} 張`);
  const ok = await confirmModal({ title: '匯入卡牌資料', message: `匯入：${parts.join(' · ')}\n當前對應牌組將被覆蓋（其他保留）。`, confirmText: '匯入' });
  if (!ok) return;

  const next = Object.assign({ action: null, boost: null }, state.customDecks || {});
  if (data.actionDeck) next.action = data.actionDeck;
  if (data.boostDeck)  next.boost  = data.boostDeck;
  state.customDecks = next;

  rebuildDecks();
  save();
  renderDeckManager();
  toast('卡牌資料已更新', 'grad');
}

async function resetDecksToDefault() {
  if (!state.customDecks || (!state.customDecks.action && !state.customDecks.boost)) {
    toast('目前已是預設牌組');
    return;
  }
  const ok = await confirmModal({ title: '重置為預設牌組', message: '所有自訂卡牌資料會被清除。', confirmText: '重置', danger: true });
  if (!ok) return;
  state.customDecks = { action: null, boost: null };
  rebuildDecks();
  save();
  renderDeckManager();
  toast('已重置為預設牌組', 'grad');
}

function catalogBoostCardHtml(c) {
  return `
    <article class="catalog-card">
      <header class="cc-head">
        <h4 class="cc-name">${escapeHtml(c.name)}</h4>
        <span class="cc-reward">${escapeHtml(c.rewardText)}</span>
      </header>
      <p class="cc-line"><span class="cc-section-label">即時行動</span>${escapeHtml(c.action)}</p>
      <p class="cc-line"><span class="cc-section-label">福慧覺察</span>${escapeHtml(c.insight)}</p>
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
    names.push(p.name || '玩家');
  });
  if (!names.length) return;
  // During the sprint show the doubled per-player tally plus a clear ×2 tag;
  // otherwise the card's own wording. For 雙方 cards spell out the per-player
  // grant so two names + the value read unambiguously.
  const rewardText = mult > 1
    ? describeReward(r)
    : (ids.length > 1 ? `雙方各得 ${describeReward(r)}` : card.rewardText);
  const tag = mult > 1 ? '（無常與恩典齊發 ×2）' : '';
  const msg = `${names.join('、')} 完成「${card.name}」　${rewardText}${tag}`;
  toast(msg, 'grad');
  logEvent(msg, 'grad');
  closeCard();
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
  bindEvents();
  renderAll();
  startTimerLoop();
  registerSW();
  if (!hasGame) openSetup();
}

document.addEventListener('DOMContentLoaded', init);
