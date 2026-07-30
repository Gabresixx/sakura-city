import * as THREE from 'three';

/**
 * Device-orientation look, for phones.
 *
 * Holding the phone up and turning your body to look around is the closest a
 * flat screen gets to actually standing in the street, so this is the default
 * on any device that offers it.
 *
 * Two decisions make it feel right rather than seasick:
 *
 * 1. **Yaw is relative, not compass-absolute.** The heading at the moment you
 *    switch it on becomes the zero point. Otherwise the world snaps to wherever
 *    magnetic north happens to be and you start the scene facing a wall — and
 *    on iOS `alpha` is not true north anyway, so absolute is meaningless there.
 * 2. **Dragging still works, and re-bases the zero point.** Physically spinning
 *    360° is fine standing up and impossible sitting on a train. Drag turns your
 *    body, the gyro turns your head.
 *
 * Roll is deliberately discarded. Tilting the horizon with the phone reads as a
 * bug and makes people queasy long before it makes the scene feel physical.
 */

const ZEE = new THREE.Vector3(0, 0, 1);
const EULER = new THREE.Euler();
const Q0 = new THREE.Quaternion();
// −90° about X: the camera looks out of the *back* of a phone held upright.
const Q1 = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5));

export class Gyro {
  constructor() {
    this.available = typeof window !== 'undefined' && 'DeviceOrientationEvent' in window;
    /** True once we are actually receiving usable events. */
    this.active = false;
    /** Set when the OS has told us the user said no. */
    this.denied = false;

    this.yaw = 0;
    this.pitch = 0;
    /** Heading at calibration; subtracted so the start view is wherever you are. */
    this.yawRef = 0;
    this._calibrated = false;
    this._quat = new THREE.Quaternion();
    this._onOrientation = this._onOrientation.bind(this);
    this.onChange = null;
  }

  /** iOS 13+ needs an explicit grant, and only from inside a user gesture. */
  get needsPermission() {
    return typeof DeviceOrientationEvent !== 'undefined'
      && typeof DeviceOrientationEvent.requestPermission === 'function';
  }

  async enable() {
    if (!this.available) return false;
    if (this.needsPermission) {
      try {
        const res = await DeviceOrientationEvent.requestPermission();
        if (res !== 'granted') { this.denied = true; this._emit(); return false; }
      } catch {
        this.denied = true;
        this._emit();
        return false;
      }
    }
    this._calibrated = false;
    window.addEventListener('deviceorientation', this._onOrientation, true);
    // `active` only flips once a real reading arrives — some desktop browsers
    // fire the event with all-null values forever.
    return true;
  }

  disable() {
    window.removeEventListener('deviceorientation', this._onOrientation, true);
    this.active = false;
    this._calibrated = false;
    this._emit();
  }

  async toggle() {
    if (this.active) { this.disable(); return false; }
    await this.enable();
    return true;
  }

  /** Re-zero the heading to wherever the device is pointing right now. */
  recalibrate() { this._calibrated = false; }

  _emit() { this.onChange?.(this.active, this.denied); }

  _onOrientation(e) {
    if (e.alpha === null && e.beta === null && e.gamma === null) return;

    const alpha = THREE.MathUtils.degToRad(e.alpha ?? 0);
    const beta = THREE.MathUtils.degToRad(e.beta ?? 0);
    const gamma = THREE.MathUtils.degToRad(e.gamma ?? 0);
    const orient = THREE.MathUtils.degToRad(
      screen.orientation?.angle ?? window.orientation ?? 0
    );

    // Device frame → world frame. 'YXZ' matches the camera's rotation order.
    EULER.set(beta, alpha, -gamma, 'YXZ');
    this._quat.setFromEuler(EULER);
    this._quat.multiply(Q1);
    this._quat.multiply(Q0.setFromAxisAngle(ZEE, -orient));

    EULER.setFromQuaternion(this._quat, 'YXZ');
    this.yaw = EULER.y;
    this.pitch = THREE.MathUtils.clamp(EULER.x, -1.2, 1.1);

    if (!this._calibrated) {
      this.yawRef = this.yaw;
      this._calibrated = true;
    }
    if (!this.active) { this.active = true; this._emit(); }
  }

  /** Heading relative to the calibration point, wrapped to ±π. */
  get relativeYaw() {
    let d = this.yaw - this.yawRef;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return d;
  }
}
