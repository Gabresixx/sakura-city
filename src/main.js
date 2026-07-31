import * as THREE from 'three';
import { buildWorld, Director } from './world/scene.js';
import { createComposer } from './core/post.js';
import { loadEntranceCard } from './core/reveal.js';
import { Explorer } from './player/controls.js';
import { Gyro } from './player/gyro.js';
import { createTouchUI, isTouchDevice } from './ui/touch.js';
import { Audio } from './core/audio.js';
import { L } from './world/layout.js';
import entranceMobile from './assets/entrance-mobile.jpg';
import entranceDesktop from './assets/entrance-desktop.jpg';

const gate = document.getElementById('gate');
const gateBg = document.getElementById('gate-bg');
const gateCard = document.getElementById('gate-card');
const gateCta = document.getElementById('gate-cta');
const dot = document.getElementById('dot');
const toastEl = document.getElementById('toast');
const clickHint = document.getElementById('click-hint');

/**
 * Yield to the browser between build stages.
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

async function stage(label, fn) {
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

  // Picked now, immediately, so the fetch runs the whole time the world is
  // building instead of starting only once everything else is ready.
  const touch = isTouchDevice();
  document.body.classList.toggle('is-touch', touch);
  const entranceUrl = touch ? entranceMobile : entranceDesktop;
  gateBg.style.backgroundImage = `url(${entranceUrl})`;
  const cardTexture = loadEntranceCard(entranceUrl);

  // ---- world --------------------------------------------------------------
  const world = await stage('world', () => buildWorld());
  const { scene, sky, crossing, petals, colliders, trackShadow } = world;

  const { composer, ink, grade, reveal } = await stage('post', () =>
    createComposer(renderer, scene, camera));
  ink.exclude = world.inkExclude;

  const audio = new Audio();
  const director = new Director(world, audio);

  const player = await stage('player', () =>
    new Explorer(camera, renderer.domElement, { colliders, crossing }));

  // Warm the shader cache before the first frame so entering the scene never
  // hitches on a 200ms compile.
  await stage('compile', () => {
    trackShadow(player.position);
    renderer.compile(scene, camera);
  });

  // ---- ui wiring ----------------------------------------------------------
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

  // ---- entering / leaving pointer lock ------------------------------------
  player.onLockChange = (locked) => {
    dot.classList.toggle('on', locked);
    clickHint.classList.toggle('on', !locked && !touch);
    if (locked) audio.start();
  };

  player.onGyroChange = (on) => touchUI?.setGyroActive(on);
  player.onCinematic = (on) => {
    touchUI?.setCinematic(on);
    toast(on ? 'シネマティック — 操作で解除' : '探索モード');
  };

  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyM') toast(audio.toggle() ? 'サウンド ON' : 'サウンド OFF');
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
    reveal.update(dt);
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

  // ---- entrance -------------------------------------------------------------
  // The world above is already rendering behind the gate. Once it's ready,
  // the gate's job is just to say so and wait for a tap; the actual entrance
  // is the rain dissolving the photo into the street that was there the whole
  // time. See src/core/reveal.js for why this replaces what used to be two
  // separate screen changes.
  //
  // The photo started loading before the world did, so this almost never
  // actually waits — but if it's still in flight (a cold cache, a slow link),
  // the gate is happy to sit on "支度をしています" a little longer rather than
  // flip to "ready" a beat before the WebGL card has anything to show.
  reveal.setCard(await cardTexture);
  reveal.enabled = true;
  gate.classList.add('ready');
  gateCta.textContent = touch ? 'タップしてはじめる' : 'クリックしてはじめる';

  gate.addEventListener('click', () => {
    if (!gate.classList.contains('ready') || gate.classList.contains('leaving')) return;
    // Pointer lock has to be requested as directly as possible inside the
    // gesture handler, before any async work, or some browsers refuse it.
    if (!touch) renderer.domElement.requestPointerLock?.();

    gate.classList.add('leaving');
    audio.start();
    if (touch) {
      gyro.enable().then((ok) => {
        touchUI?.say(ok
          ? '端末を動かして見回す · 左のスティックで移動'
          : 'ドラッグで見回す · 左のスティックで移動', 4200);
      });
    }

    reveal.start(() => {
      reveal.enabled = false; // zero cost from here on
      gate.remove();
    });
  }, { once: true });

  // Handy for tuning by eye from the console.
  window.SAKURA = {
    renderer, scene, camera, world, player, ink, grade, composer, audio, director,
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
    /** Skip straight past the entrance, for screenshotting the world itself. */
    skipGate() {
      reveal.enabled = false;
      gate.remove();
    },
  };
}

main().catch((err) => {
  console.error(err);
  gate.classList.remove('ready', 'leaving');
  gateCard.innerHTML = `
    <h1 style="font-size:1.2rem">読み込みに失敗しました</h1>
    <p style="max-width:40ch;margin:.8rem auto 0;font-size:.78rem;line-height:1.7;color:rgba(248,238,225,.8)">
      ${err.message}
    </p>`;
});
