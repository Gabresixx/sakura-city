/**
 * On-screen controls for phones.
 *
 * A phone has no WASD and no mouse, so movement needs a visible surface to
 * push against. This builds a translucent stick bottom-left and a small column
 * of round buttons bottom-right, and keeps every touch that lands outside them
 * free for looking around.
 *
 * The whole overlay is created only on coarse-pointer devices — it never
 * appears on desktop, and there is nothing to lay out or hide there.
 */

const SVG = {
  run: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 4a1.6 1.6 0 1 0 0-.01"/><path d="M8 21l2.5-5.5L8 12l1-5 3 2 3 1"/><path d="M12 14l3 2 1 5"/><path d="M4 9l3-1"/></svg>',
  gyro: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="8.5"/><ellipse cx="12" cy="12" rx="8.5" ry="3.4"/><ellipse cx="12" cy="12" rx="3.4" ry="8.5"/></svg>',
  film: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="18" height="12" rx="2"/><path d="M7 6v12M17 6v12M3 10h4M3 14h4M17 10h4M17 14h4"/></svg>',
};

const CSS = `
#touch { position: fixed; inset: 0; pointer-events: none; z-index: 15;
         opacity: 0; transition: opacity .4s ease; }
#touch.on { opacity: 1; }

#stick { position: absolute; left: max(22px, env(safe-area-inset-left));
         bottom: max(26px, env(safe-area-inset-bottom)); width: 122px; height: 122px;
         border-radius: 50%; pointer-events: auto; touch-action: none;
         background: rgba(255,255,255,.13); backdrop-filter: blur(10px);
         -webkit-backdrop-filter: blur(10px);
         border: 1px solid rgba(255,255,255,.30);
         box-shadow: 0 6px 22px rgba(30,22,42,.22); }
#stick::after { content: ''; position: absolute; inset: 50% auto auto 50%;
         width: 34px; height: 34px; margin: -17px 0 0 -17px; border-radius: 50%;
         border: 1px dashed rgba(255,255,255,.28); }
#knob { position: absolute; left: 50%; top: 50%; width: 54px; height: 54px;
        margin: -27px 0 0 -27px; border-radius: 50%;
        background: rgba(255,255,255,.42); border: 1px solid rgba(255,255,255,.55);
        box-shadow: 0 3px 12px rgba(30,22,42,.28);
        transition: transform .10s ease-out; will-change: transform; }
#stick.held #knob { transition: none; background: rgba(255,255,255,.58); }

#tbtns { position: absolute; right: max(20px, env(safe-area-inset-right));
         bottom: max(26px, env(safe-area-inset-bottom));
         display: flex; flex-direction: column-reverse; gap: 12px; }
.tbtn { pointer-events: auto; touch-action: none; -webkit-tap-highlight-color: transparent;
        width: 60px; height: 60px; border-radius: 50%; border: 1px solid rgba(255,255,255,.30);
        background: rgba(255,255,255,.13); backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px); color: rgba(255,255,255,.88);
        box-shadow: 0 6px 22px rgba(30,22,42,.22);
        display: grid; place-items: center; padding: 0; }
.tbtn svg { width: 25px; height: 25px; }
.tbtn.small { width: 50px; height: 50px; }
.tbtn.small svg { width: 21px; height: 21px; }
.tbtn.held, .tbtn.active { background: rgba(255,255,255,.42); color: #3a2f47;
        border-color: rgba(255,255,255,.7); }
.tbtn:disabled { opacity: .34; }

#thint { position: absolute; left: 0; right: 0;
         bottom: calc(max(26px, env(safe-area-inset-bottom)) + 132px);
         text-align: center; font-size: .68rem; letter-spacing: .1em;
         color: rgba(255,255,255,.82); text-shadow: 0 1px 6px rgba(35,25,45,.7);
         opacity: 0; transition: opacity .4s ease; pointer-events: none; }
#thint.on { opacity: 1; }
`;

/**
 * True on phones and tablets — anything whose primary pointer is a finger.
 *
 * `?touch=1` forces it on, and `?touch=0` off. Laying out a phone UI without
 * a phone in your hand is otherwise guesswork, and device emulation does not
 * reliably flip the pointer media query.
 */
export function isTouchDevice() {
  const forced = new URLSearchParams(location.search).get('touch');
  if (forced === '1') return true;
  if (forced === '0') return false;
  return window.matchMedia?.('(pointer: coarse)').matches
    || 'ontouchstart' in window;
}

export function createTouchUI({ onLook, onRunToggle, onGyroToggle, onCinematic, gyro }) {
  const state = { x: 0, y: 0, run: false };

  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  const root = document.createElement('div');
  root.id = 'touch';
  root.innerHTML = `
    <div id="stick"><div id="knob"></div></div>
    <div id="tbtns">
      <button class="tbtn" id="btn-run" aria-label="走る">${SVG.run}</button>
      <button class="tbtn" id="btn-gyro" aria-label="ジャイロ視点">${SVG.gyro}</button>
      <button class="tbtn small" id="btn-film" aria-label="シネマティック">${SVG.film}</button>
    </div>
    <div id="thint"></div>`;
  document.body.appendChild(root);

  const stick = root.querySelector('#stick');
  const knob = root.querySelector('#knob');
  const btnRun = root.querySelector('#btn-run');
  const btnGyro = root.querySelector('#btn-gyro');
  const btnFilm = root.querySelector('#btn-film');
  const hint = root.querySelector('#thint');

  let hintTimer = 0;
  function say(text, ms = 2400) {
    hint.textContent = text;
    hint.classList.add('on');
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => hint.classList.remove('on'), ms);
  }

  // ---- stick --------------------------------------------------------------
  const RADIUS = 46;
  let stickId = null;

  function setStick(cx, cy, rect) {
    let dx = cx - (rect.left + rect.width / 2);
    let dy = cy - (rect.top + rect.height / 2);
    const d = Math.hypot(dx, dy);
    if (d > RADIUS) { dx = (dx / d) * RADIUS; dy = (dy / d) * RADIUS; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    // Deadzone, then a slightly eased response so small pushes are gentle.
    const mag = Math.min(Math.hypot(dx, dy) / RADIUS, 1);
    const eased = mag < 0.14 ? 0 : (mag - 0.14) / 0.86;
    const ang = Math.atan2(dy, dx);
    state.x = Math.cos(ang) * eased;
    state.y = Math.sin(ang) * eased;
  }

  function releaseStick() {
    stickId = null;
    stick.classList.remove('held');
    knob.style.transform = 'translate(0px, 0px)';
    state.x = 0;
    state.y = 0;
  }

  stick.addEventListener('touchstart', (e) => {
    const t = e.changedTouches[0];
    stickId = t.identifier;
    stick.classList.add('held');
    setStick(t.clientX, t.clientY, stick.getBoundingClientRect());
    e.preventDefault();
  }, { passive: false });

  stick.addEventListener('touchmove', (e) => {
    const rect = stick.getBoundingClientRect();
    for (const t of e.changedTouches) {
      if (t.identifier === stickId) setStick(t.clientX, t.clientY, rect);
    }
    e.preventDefault();
  }, { passive: false });

  for (const ev of ['touchend', 'touchcancel']) {
    stick.addEventListener(ev, (e) => {
      for (const t of e.changedTouches) if (t.identifier === stickId) releaseStick();
    }, { passive: true });
  }

  // ---- look: any touch that is not on a control ---------------------------
  const looks = new Map();
  const onControl = (target) => !!target.closest?.('#stick, #tbtns');

  window.addEventListener('touchstart', (e) => {
    for (const t of e.changedTouches) {
      if (onControl(t.target)) continue;
      looks.set(t.identifier, { x: t.clientX, y: t.clientY });
    }
  }, { passive: true });

  window.addEventListener('touchmove', (e) => {
    for (const t of e.changedTouches) {
      const prev = looks.get(t.identifier);
      if (!prev) continue;
      onLook((t.clientX - prev.x) * 0.0055, (t.clientY - prev.y) * 0.0055);
      prev.x = t.clientX;
      prev.y = t.clientY;
    }
  }, { passive: true });

  for (const ev of ['touchend', 'touchcancel']) {
    window.addEventListener(ev, (e) => {
      for (const t of e.changedTouches) looks.delete(t.identifier);
    }, { passive: true });
  }

  // ---- buttons ------------------------------------------------------------
  // Run is a hold, not a toggle — matches Shift on desktop.
  btnRun.addEventListener('touchstart', (e) => {
    state.run = true;
    btnRun.classList.add('held');
    onRunToggle?.(true);
    e.preventDefault();
  }, { passive: false });
  for (const ev of ['touchend', 'touchcancel']) {
    btnRun.addEventListener(ev, () => {
      state.run = false;
      btnRun.classList.remove('held');
      onRunToggle?.(false);
    }, { passive: true });
  }

  btnGyro.addEventListener('click', async () => {
    const on = await onGyroToggle?.();
    btnGyro.classList.toggle('active', !!on);
    if (on) say('ジャイロ ON — 端末を動かして見回す');
    else if (gyro?.denied) say('ジャイロが許可されていません', 3200);
    else say('ジャイロ OFF — ドラッグで見回す');
  });

  btnFilm.addEventListener('click', () => {
    const on = onCinematic?.();
    btnFilm.classList.toggle('active', !!on);
    say(on ? 'シネマティック — 触れると解除' : '探索モード');
  });

  // Reflect gyro state changes that did not come from the button.
  if (gyro) {
    gyro.onChange = (active, denied) => {
      btnGyro.classList.toggle('active', active);
      if (denied) btnGyro.disabled = true;
    };
  }

  return {
    state,
    show() { root.classList.add('on'); },
    hide() { root.classList.remove('on'); },
    say,
    setGyroActive(on) { btnGyro.classList.toggle('active', !!on); },
    setCinematic(on) { btnFilm.classList.toggle('active', !!on); },
  };
}
