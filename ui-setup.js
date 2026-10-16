// 開局表單與十面骰動畫；遊戲操作透過注入的回呼交給 app。
(function () {
  'use strict';
  function create({
    $, $$, window, t, roll,
    getSetup, clampDie, computeCivGoal, getGame, DIE_MIN,
    modals, escapeHtml, applySetup,
  }) {
    let diceBusy = false, d10Built = false, d10Faces = [], diceAnim = null, idleAnim = null, idleRestM = null;
    const VIEW_TILT = -54, DICE_THROW_MS = 1650;
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

    function faceUpMatrix(value) {
      const f = d10Faces.find(x => x.value === value);
      if (!f) return null;
      const { u, v, normal: n } = f;
      return `matrix3d(${u[0]},${-n[0]},${v[0]},0,` +
                      `${u[1]},${-n[1]},${v[1]},0,` +
                      `${u[2]},${-n[2]},${v[2]},0,0,0,0,1)`;
    }

    function faceRestPose(value, yaw) {
      const m = faceUpMatrix(value);
      if (!m) return null;
      return `rotateX(${VIEW_TILT}deg) rotateY(${yaw.toFixed(1)}deg) ${m}`;
    }

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

    function stopAnimations() {
      stopDiceAnim();
      stopDieIdle();
      diceBusy = false;
    }

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
      getSetup().rolls[idx][stat] = finalValue;
      const name = getSetup().rolls[idx].name || `${t('common.player')} ${idx + 1}`;
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

    function updateCivCalc() {
      const w = clampDie($('#setup-civ-white').value);
      const b = clampDie($('#setup-civ-black').value);
      const n = getSetup().count || 4;
      $('#civ-calc-white').textContent = w;
      $('#civ-calc-black').textContent = b;
      const countEl = $('#civ-calc-count');
      if (countEl) countEl.textContent = n;
      $('#civ-calc-goal').textContent = computeCivGoal(w, b, n);
    }

    function openSetup(opts = {}) {
      const mode = opts.mode === 'next' ? 'next' : 'new';
      getSetup().mode = mode;
      getSetup().count = getGame().players.length || 4;
      // Next round: carry the same players (names) but blank 福/慧 so the host
      // re-rolls each round's initial values. New game: pre-fill current values.
      getSetup().rolls = getGame().players.length
        ? getGame().players.map(p => ({
            name: p.name,
            fortune: mode === 'next' ? 0 : p.fortune,
            wisdom:  mode === 'next' ? 0 : p.wisdom,
          }))
        : Array.from({ length: getSetup().count }, () => ({ name: '', fortune: 0, wisdom: 0 }));
      $('#setup-round').value = mode === 'next' ? getGame().roundNum + 1 : getGame().roundNum;
      // Dice start at 1 each round; the host enters the physical roll before starting.
      $('#setup-civ-white').value = DIE_MIN;
      $('#setup-civ-black').value = DIE_MIN;
      updateCivCalc();
      const title = $('#setup-title');
      if (title) title.textContent = mode === 'next' ? t('setup.title_next') : t('setup.title');
      renderSetup();
      if (!d10Built) buildD10();
      resetDiceStage();
      modals.open('setup-modal');
    }

    function closeSetup() { modals.close('setup-modal'); }

    function setSetupCount(n) {
      getSetup().count = n;
      while (getSetup().rolls.length < n) getSetup().rolls.push({ name: '', fortune: 0, wisdom: 0 });
      getSetup().rolls.length = n;
      renderSetup();
      updateCivCalc();
    }

    function renderSetup() {
      $$('.player-count-pick .chip').forEach(c =>
        c.classList.toggle('active', +c.dataset.count === getSetup().count));

      const top = topSetupPlayer();
      const wrap = $('#setup-players');
      wrap.innerHTML = getSetup().rolls.map((r, i) => {
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
          getSetup().rolls[idx].name = e.target.value;
          renderTopMarker();
        });
        // Manual entry — type the initial 福/慧 directly (0–10)
        $$('.roll-out', row).forEach(inp => {
          const stat = inp.dataset.stat;
          inp.addEventListener('input', () => {
            let v = parseInt(inp.value, 10);
            if (!Number.isFinite(v) || v < 0) v = 0;
            if (v > 10) { v = 10; inp.value = '10'; }
            getSetup().rolls[idx][stat] = v;
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
      getSetup().rolls.forEach((r, i) => {
        const s = (r.fortune || 0) + (r.wisdom || 0);
        if (!best || s > best.score) best = { i, score: s, name: r.name };
      });
      if (!best || best.score === 0) return null;
      return best;
    }

    function renderTopMarker() {
      const top = topSetupPlayer();
      $('#setup-top-player').textContent = top ? (getSetup().rolls[top.i].name || `玩家 ${top.i + 1}`) : '—';
      $('#setup-top-score').textContent = top ? top.score : '—';
      $$('#setup-players .setup-player-row').forEach((row, i) => {
        row.classList.toggle('top', !!top && top.i === i);
      });
    }

    let bound = false;
    function bind() {
      if (bound) return;
      bound = true;
      $('#btn-setup').addEventListener('click', openSetup);
      $('#setup-close').addEventListener('click', closeSetup);
      $('#setup-cancel').addEventListener('click', closeSetup);
      $('#setup-start').addEventListener('click', applySetup);
      $('#setup-civ-white').addEventListener('input', updateCivCalc);
      $('#setup-civ-black').addEventListener('input', updateCivCalc);

      $$('.player-count-pick .chip').forEach(b =>
        b.addEventListener('click', () => setSetupCount(+b.dataset.count)));
    }

    return { openSetup, closeSetup, stopAnimations, bind };
  }
  const api = { create };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else globalThis.SetupUI = api;
})();
