import * as THREE from 'three';

/**
 * Everything you hear is synthesised at runtime — no audio files, nothing to
 * download, works offline.
 *
 * The crossing bell is the piece worth caring about. A Japanese 踏切 alarm is
 * two alternating strikes with a metallic, slightly inharmonic ring, and you
 * hear it long before you see the train. Additive partials at non-integer
 * ratios with a fast attack and a long exponential tail get remarkably close.
 */
export class Audio {
  constructor() {
    this.ctx = null;
    this.enabled = false;
    this.master = null;
    this._nodes = {};
  }

  /** Must be called from a user gesture (pointer lock counts). */
  start() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.0;
    this.master.connect(this.ctx.destination);
    this._buildAmbience();
    this.enabled = true;
    this.setVolume(0.55);
  }

  setVolume(v) {
    if (!this.ctx) return;
    this.master.gain.cancelScheduledValues(this.ctx.currentTime);
    this.master.gain.linearRampToValueAtTime(v, this.ctx.currentTime + 0.6);
  }

  toggle() {
    if (!this.ctx) { this.start(); return true; }
    const on = this.master.gain.value < 0.05;
    this.setVolume(on ? 0.55 : 0.0);
    return on;
  }

  /** White noise buffer, reused by wind, rumble and footsteps. */
  _noise(seconds = 2) {
    const n = Math.floor(this.ctx.sampleRate * seconds);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  _buildAmbience() {
    const ctx = this.ctx;

    // Wind: pink-ish noise through a slowly wandering band-pass.
    const src = ctx.createBufferSource();
    src.buffer = this._noise(4);
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 420;
    bp.Q.value = 0.7;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900;
    const g = ctx.createGain();
    g.gain.value = 0.035;
    src.connect(bp).connect(lp).connect(g).connect(this.master);
    src.start();

    // Gentle swell so the wind is never static.
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.022;
    lfo.connect(lfoGain).connect(g.gain);
    lfo.start();

    this._nodes.wind = { g };

    // Distant town hum — a low bed that makes the street feel inhabited.
    const hum = ctx.createOscillator();
    hum.type = 'sine';
    hum.frequency.value = 62;
    const humG = ctx.createGain();
    humG.gain.value = 0.012;
    hum.connect(humG).connect(this.master);
    hum.start();

    this._birdTimer = 0;
  }

  /** One strike of the crossing bell. `alt` picks which of the two bells. */
  bell(alt = 0, gain = 0.16) {
    if (!this.enabled) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const base = alt ? 742 : 668;
    const out = ctx.createGain();
    out.gain.value = 1;
    out.connect(this.master);

    // Inharmonic partials are what make it read as struck metal.
    const partials = [1, 2.02, 2.73, 3.91, 5.42, 6.81];
    const amps = [1, 0.62, 0.42, 0.3, 0.18, 0.1];
    partials.forEach((r, i) => {
      const o = ctx.createOscillator();
      o.type = i < 2 ? 'triangle' : 'sine';
      o.frequency.value = base * r;
      const g = ctx.createGain();
      const peak = gain * amps[i];
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(peak, t + 0.003);
      g.gain.exponentialRampToValueAtTime(peak * 0.001, t + 0.42 - i * 0.04);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + 0.5);
    });

    // The clapper hit itself.
    const nz = ctx.createBufferSource();
    nz.buffer = this._noise(0.2);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 2400;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(gain * 0.5, t);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    nz.connect(hp).connect(ng).connect(out);
    nz.start(t);
    nz.stop(t + 0.1);
  }

  /** Start the rolling-stock bed. Returns a handle to steer and stop. */
  trainStart() {
    if (!this.enabled) return null;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this._noise(3);
    src.loop = true;

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 300;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1100;
    bp.Q.value = 1.2;

    const rumbleG = ctx.createGain();
    rumbleG.gain.value = 0.0;
    const hissG = ctx.createGain();
    hissG.gain.value = 0.0;

    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    const tail = pan || ctx.createGain();

    src.connect(lp).connect(rumbleG).connect(tail);
    src.connect(bp).connect(hissG).connect(tail);
    tail.connect(this.master);
    src.start();

    return {
      set(level, panning, speed) {
        const t = ctx.currentTime;
        rumbleG.gain.setTargetAtTime(0.5 * level, t, 0.08);
        hissG.gain.setTargetAtTime(0.10 * level, t, 0.08);
        // Doppler, faked by sliding the filters rather than the sample rate.
        lp.frequency.setTargetAtTime(240 + speed * 14, t, 0.1);
        bp.frequency.setTargetAtTime(900 + speed * 40, t, 0.1);
        if (pan) pan.pan.setTargetAtTime(THREE.MathUtils.clamp(panning, -1, 1), t, 0.06);
      },
      stop() {
        const t = ctx.currentTime;
        rumbleG.gain.setTargetAtTime(0, t, 0.2);
        hissG.gain.setTargetAtTime(0, t, 0.2);
        try { src.stop(t + 1.2); } catch { /* already stopped */ }
      },
    };
  }

  /** Rail-joint clack as a bogie goes past. */
  clack(level = 0.1, panning = 0) {
    if (!this.enabled || level < 0.01) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const nz = ctx.createBufferSource();
    nz.buffer = this._noise(0.12);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 260 + Math.random() * 220;
    bp.Q.value = 2.4;
    const g = ctx.createGain();
    g.gain.setValueAtTime(level, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : ctx.createGain();
    if (pan.pan) pan.pan.value = THREE.MathUtils.clamp(panning, -1, 1);
    nz.connect(bp).connect(g).connect(pan).connect(this.master);
    nz.start(t);
    nz.stop(t + 0.15);
  }

  footstep(running = false) {
    if (!this.enabled) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const nz = ctx.createBufferSource();
    nz.buffer = this._noise(0.15);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1400 + Math.random() * 700;
    const g = ctx.createGain();
    const peak = (running ? 0.055 : 0.032) * (0.8 + Math.random() * 0.4);
    g.gain.setValueAtTime(peak, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.11);
    nz.connect(lp).connect(g).connect(this.master);
    nz.start(t);
    nz.stop(t + 0.16);
  }

  /** Occasional bird, so the quiet stretches never feel dead. */
  update(dt) {
    if (!this.enabled) return;
    this._birdTimer -= dt;
    if (this._birdTimer > 0) return;
    this._birdTimer = 4 + Math.random() * 11;

    const ctx = this.ctx;
    const t0 = ctx.currentTime;
    const notes = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < notes; i++) {
      const t = t0 + i * (0.07 + Math.random() * 0.06);
      const o = ctx.createOscillator();
      o.type = 'sine';
      const f = 2600 + Math.random() * 1500;
      o.frequency.setValueAtTime(f, t);
      o.frequency.exponentialRampToValueAtTime(f * (0.7 + Math.random() * 0.7), t + 0.06);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.022, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.075);
      o.connect(g).connect(this.master);
      o.start(t);
      o.stop(t + 0.1);
    }
  }
}
