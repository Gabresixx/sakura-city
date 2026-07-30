import * as THREE from 'three';
import { buildWorld, Director } from './world/scene.js';
import { createComposer } from './core/post.js';
import { Explorer } from './player/controls.js';
import { Gyro } from './player/gyro.js';
import { createTouchUI, isTouchDevice } from './ui/touch.js';
import { Audio } from './core/audio.js';
import { L } from './world/layout.js';

const loader = document.getElementById('loader');
const bar = document.querySelector('#bar i');
const hud = document.getElementById('hud');
const dot = document.getElementById('dot');
const statusEl = document.getElementById('status');
const toastEl = document.getElementById('toast');
const help = document.getElementById('help');
const helpToggle = document.getElementById('help-toggle');
const clickHint = document.getElementById('click-hint');

/**
 * Yield to the browser so the loading bar can actually paint.
 *
 * requestAnimationFrame alone is not enough: a backgrounded or hidden tab
 * never fires it, and the whole load sequence would sit there forever. Racing
 * it against a timer means loading always completes, visible or not.
 */
const nextFrame = () => new Promise((resolve) => {
  let done = false;
  const finish = () => { if (!done) { done = true; resolve(); } };
  requestAnimationFrame(finish);
  setTimeout(finish, 32);
});

async function stage(pct, label, fn) {
  bar.style.width = `${pct}%`;
  await nextFrame();
  const t0 = performance.now();
  const out = fn();
  await nextFrame();
  console.info(`[sakura] ${label}: ${(performance.now() - t0).toFixed(0)}ms`);
  return out;
}

let toastTimer = 0;
function toast(text, ms = 1800) {
  toastEl.textContent = text;
  toastEl.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('on'), ms);
}

async function main() {
  // ---- renderer -----------------------------------------------------------
  const renderer = new THREE.WebGLRenderer({
    antialias: false,          // MSAA lives on the composer target instead
    powerPreference: 'high-performance',
    stencil: false,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  // Crisp rather than soft: a cel-shaded plate wants shadow edges that read
  // as drawn lines, and the ink pass reinforces them.
  renderer.shadowMap.type = THREE.PCFShadowMap;
  // Flat cel colour wants no filmic roll-off; the grade pass handles contrast.
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  document.body.appendChild(renderer.domElement);

  const camera = new THREE.PerspectiveCamera(
    58, window.innerWidth / window.innerHeight, 0.1, 400
  );
  camera.rotation.order = 'YXZ';
  camera.position.set(...L.spawn);

  // ---- world --------------------------------------------------------------
  const world = await stage(12, 'world', () => buildWorld());
  const { scene, sky, crossing, petals, colliders, trackShadow } = world;

  const { composer, ink, grade } = await stage(64, 'post', () =>
    createComposer(renderer, scene, camera));
  ink.exclude = world.inkExclude;

  const audio = new Audio();
  const director = new Director(world, audio);

  const player = await stage(82, 'player', () =>
    new Explorer(camera, renderer.domElement, { colliders, crossing }));

  // Warm the shader cache before the first frame so entering the scene never
  // hitches on a 200ms compile.
  await stage(94, 'compile', () => {
    trackShadow(player.position);
    renderer.compile(scene, camera);
  });
  await stage(100, 'ready', () => {});

  // ---- ui wiring ----------------------------------------------------------
  // No gate: the scene is already there, so show it. The controls live in a
  // corner panel you can fold away instead of a modal over the view.
  loader.classList.add('gone');
  setTimeout(() => loader.remove(), 1000);
  hud.classList.add('on');

  const touch = isTouchDevice();
  document.body.classList.toggle('is-touch', touch);

  const gyro = new Gyro();
  player.attachGyro(gyro);

  let touchUI = null;
  if (touch) {
    touchUI = createTouchUI({
      gyro,
      onLook: (dx, dy) => player.look(dx, dy),
      onGyroToggle: async () => {
        const on = await gyro.toggle();
        // `toggle` resolves before the first reading lands, so report the
        // state the user asked for and let `onChange` correct it if the
        // device turns out not to have a usable sensor.
        return on;
      },
      onCinematic: () => { player.toggleCinematic(); return player.cinematic; },
    });
    player.setTouchSource(touchUI.state);
    touchUI.show();
  } else {
    clickHint.classList.add('on');
  }

  // ---- help panel ---------------------------------------------------------
  const HELP_KEY = 'sakura.help';
  const read = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
  const write = (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } };

  /** `remember: false` for automatic folds, so they never overwrite a choice. */
  function setHelp(open, remember = true) {
    help.classList.toggle('open', open);
    // On a phone the panel is nearly as wide as the screen, so the HUD hides
    // behind it. The body class lets CSS fade the HUD out for the duration.
    document.body.classList.toggle('help-open', open);
    helpToggle.setAttribute('aria-expanded', String(open));
    if (remember) write(HELP_KEY, open ? '1' : '0');
  }

  // Always run it, even when the stored state matches the markup's default —
  // otherwise the body class that CSS keys off never gets set.
  const firstVisit = read(HELP_KEY) === null;
  setHelp(read(HELP_KEY) !== '0', false);

  helpToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    setHelp(!help.classList.contains('open'));
  });
  // Clicking the panel itself must not fall through and capture the cursor.
  help.addEventListener('click', (e) => e.stopPropagation());

  // ---- entering / leaving pointer lock ------------------------------------
  let foldedOnce = false;
  player.onLockChange = (locked) => {
    dot.classList.toggle('on', locked);
    clickHint.classList.toggle('on', !locked && !touch);
    if (!locked) return;
    audio.start();
    // On a first visit the panel is open because nobody chose that, so fold it
    // once you actually start exploring. Never on a return visit — by then the
    // open state is a decision, and overriding it would be rude.
    if (firstVisit && !foldedOnce && help.classList.contains('open')) {
      foldedOnce = true;
      setHelp(false, false);
    }
  };

  if (touch) {
    // No pointer lock on a phone, so the first tap on the world is the user
    // gesture iOS requires before it will hand over the motion sensor.
    const firstTap = async () => {
      audio.start();
      const ok = await gyro.enable();
      touchUI?.say(ok
        ? '端末を動かして見回す · 左のスティックで移動'
        : 'ドラッグで見回す · 左のスティックで移動', 4200);
    };
    window.addEventListener('pointerdown', firstTap, { once: true });
  }

  player.onGyroChange = (on) => touchUI?.setGyroActive(on);
  player.onCinematic = (on) => {
    touchUI?.setCinematic(on);
    toast(on ? 'シネマティック — 操作で解除' : '探索モード');
  };

  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyM') toast(audio.toggle() ? 'サウンド ON' : 'サウンド OFF');
    if (e.code === 'KeyH') setHelp(!help.classList.contains('open'));
  });

  // Re-zero the heading when the phone is rotated, or the world ends up
  // sideways relative to where you are actually pointing it.
  screen.orientation?.addEventListener?.('change', () => gyro.recalibrate());

  window.addEventListener('resize', () => {
    const w = window.innerWidth, h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w, h);
    composer.setSize(w, h);
  });

  // ---- loop ---------------------------------------------------------------
  // Timer over Clock: it hooks the Page Visibility API, so tabbing away and
  // back does not hand us a five-second delta that teleports the trains.
  const timer = new THREE.Timer();
  timer.connect(document);
  let elapsed = 0;
  let stepTimer = 0;
  let frames = 0, fpsAccum = 0, degraded = false;

  let pending = 0;
  let lastFrameAt = performance.now();

  function tick() {
    pending = requestAnimationFrame(tick);
    lastFrameAt = performance.now();
    timer.update();
    const dt = Math.min(timer.getDelta(), 0.1);
    elapsed += dt;

    const speed = player.update(dt);
    trackShadow(player.position);

    director.update(dt, camera);
    petals.update(elapsed, player.position);
    sky.userData.update(elapsed);
    grade.uniforms.uTime.value = elapsed;
    audio.update(dt);

    // Footsteps timed off distance travelled, not off a fixed clock.
    if (speed > 0.4 && !player.cinematic) {
      stepTimer -= speed * dt;
      if (stepTimer <= 0) {
        stepTimer = 0.78;
        audio.footstep(speed > 3.4);
      }
    } else {
      stepTimer = 0.2;
    }

    statusEl.textContent = crossing.active || crossing.down > 0.01
      ? '踏切 — 電車が通ります'
      : '踏切 — 待機中';

    composer.render();

    // If the machine can't hold 40fps, drop resolution once rather than
    // letting the whole scene stutter.
    frames++;
    fpsAccum += dt;
    if (fpsAccum > 3) {
      const fps = frames / fpsAccum;
      if (!degraded && fps < 40 && renderer.getPixelRatio() > 1) {
        degraded = true;
        renderer.setPixelRatio(1);
        composer.setSize(window.innerWidth, window.innerHeight);
        toast('描画解像度を下げました', 2200);
      }
      frames = 0;
      fpsAccum = 0;
    }
  }
  tick();

  /**
   * Some embedded contexts — preview panes, throttled iframes — starve
   * requestAnimationFrame even while the page reports itself visible, and the
   * scene simply freezes. This keeps it breathing at a low rate in that case,
   * and stays completely out of the way whenever rAF is healthy. A genuinely
   * hidden tab still gets nothing, which is the behaviour we want.
   */
  setInterval(() => {
    // `SAKURA.forceRender` overrides the hidden check — screenshot tooling
    // needs frames from a page the browser considers offscreen.
    if (document.visibilityState === 'hidden' && !window.SAKURA?.forceRender) return;
    if (performance.now() - lastFrameAt < 90) return;
    if (pending) cancelAnimationFrame(pending);
    tick();
  }, 30);

  // Handy for tuning by eye from the console.
  window.SAKURA = {
    renderer, scene, camera, world, player, ink, grade, composer, audio,
    forceRender: false,
    /** Drop the camera somewhere and point it, for framing shots. */
    look(x, z, yaw, pitch = 0, y = L.eye) {
      player.position.set(x, y, z);
      player.velocity.set(0, 0, 0);
      player.yaw = player.targetYaw = yaw;
      player.pitch = player.targetPitch = pitch;
      player.cinematic = false;
    },
    /** Send a train through now, instead of waiting for the schedule. */
    train(dir = 1, speed = 22) {
      const t = world.trains.find((x) => !x.active) || world.trains[0];
      t.launch({ dir, trackZ: dir > 0 ? 17.9 : 21.9, speed, from: 215 });
      return t;
    },
  };
}

main().catch((err) => {
  console.error(err);
  loader.innerHTML = `<h1 style="font-size:1.2rem">読み込みに失敗しました</h1>
    <p style="max-width:40ch;text-align:center;letter-spacing:0">${err.message}</p>`;
});
