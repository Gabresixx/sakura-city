import * as THREE from 'three';

/**
 * A tiny scene-graph-free modelling kit.
 *
 * The street needs a *lot* of small parts — roof tiles, bottle rows, wire
 * insulators, kerb stones — and each one as its own Mesh would mean thousands
 * of draw calls. Builder bakes primitives straight into per-material vertex
 * buffers, so detail is effectively free at render time.
 *
 * Baking writes transformed vertices directly into a growable Float32Array
 * rather than cloning a BufferGeometry per primitive. That distinction matters
 * a lot: this scene stamps ~30,000 primitives, and the cloning version took
 * the better part of a minute to build where this one takes a couple of
 * seconds.
 *
 * Everything is authored in local space and stamped through a transform stack,
 * which means a house or a vending machine can be written once and placed
 * anywhere:
 *
 *   b.at({ p: [4, 0, -12], ry: Math.PI / 2 }, () => vendingMachine(b));
 */

const _m = new THREE.Matrix4();
const _local = new THREE.Matrix4();
const _nm = new THREE.Matrix3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _s = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

/** Growable float buffer — doubles capacity instead of reallocating per push. */
class Stream {
  constructor(stride, initial = 4096) {
    this.stride = stride;
    this.data = new Float32Array(stride * initial);
    this.length = 0;
  }
  reserve(extra) {
    if (this.length + extra <= this.data.length) return;
    let cap = this.data.length || 1024;
    while (cap < this.length + extra) cap *= 2;
    const next = new Float32Array(cap);
    next.set(this.data.subarray(0, this.length));
    this.data = next;
  }
  finish() {
    return new THREE.BufferAttribute(this.data.slice(0, this.length), this.stride);
  }
}

class Batch {
  constructor() {
    this.pos = new Stream(3);
    this.nor = new Stream(3);
    this.uv = new Stream(2);
  }
  reserve(verts) {
    this.pos.reserve(verts * 3);
    this.nor.reserve(verts * 3);
    this.uv.reserve(verts * 2);
  }
}

/** Shared unit primitives — baked, never rendered directly. */
const geoCache = new Map();
function cached(key, make) {
  let g = geoCache.get(key);
  if (!g) { g = normalise(make()); geoCache.set(key, g); }
  return g;
}

/** Force every geometry into the same attribute shape so batching is uniform. */
function normalise(g) {
  if (g.userData.__baked) return g;
  const out = g.index ? g.toNonIndexed() : g;
  for (const name of Object.keys(out.attributes)) {
    if (name !== 'position' && name !== 'normal' && name !== 'uv') {
      out.deleteAttribute(name);
    }
  }
  if (!out.attributes.normal) out.computeVertexNormals();
  if (!out.attributes.uv) {
    const n = out.attributes.position.count;
    out.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  }
  out.clearGroups();
  out.userData.__baked = true;
  return out;
}

function transform(o) {
  if (!o) return _local.identity();
  const p = o.p || [0, 0, 0];
  _e.set(o.rx || 0, o.ry || 0, o.rz || 0);
  _q.setFromEuler(_e);
  _v.set(p[0], p[1], p[2]);
  const sc = o.s;
  if (Array.isArray(sc)) _s.set(sc[0], sc[1], sc[2]);
  else _s.set(sc ?? 1, sc ?? 1, sc ?? 1);
  return _local.compose(_v, _q, _s);
}

export class Builder {
  /**
   * `chunk` is the size in metres of the spatial buckets geometry is sorted
   * into. Merging everything into one mesh per material makes the draw-call
   * count tiny but defeats frustum culling completely — the GPU then chews
   * through the whole city on every pass, three times a frame (shadow, beauty,
   * ink). Bucketing trades a few dozen extra draw calls for only drawing what
   * is actually on screen. Pass 0 for things that should never be culled.
   */
  constructor(name = 'batch', { chunk = 0 } = {}) {
    this.name = name;
    this.chunk = chunk;
    this.batches = new Map(); // key -> { mat, batch }
    this.stack = [new THREE.Matrix4()];
    this.loose = []; // objects that must stay separate (animated, transparent…)
  }

  get current() { return this.stack[this.stack.length - 1]; }

  /** Run `fn` with an extra transform pushed onto the stack. */
  at(o, fn) {
    const m = new THREE.Matrix4().multiplyMatrices(this.current, transform(o));
    this.stack.push(m);
    fn(this);
    this.stack.pop();
    return this;
  }

  _batch(mat, matrix) {
    let key = mat;
    if (this.chunk > 0) {
      const e = matrix.elements;
      key = `${mat.uuid}|${Math.floor(e[12] / this.chunk)}|${Math.floor(e[14] / this.chunk)}`;
    }
    let entry = this.batches.get(key);
    if (!entry) { entry = { mat, batch: new Batch() }; this.batches.set(key, entry); }
    return entry.batch;
  }

  /** Bake a geometry into the batch for `mat`, under an explicit matrix. */
  bake(geo, mat, matrix) {
    const g = normalise(geo);
    const pos = g.attributes.position;
    const nor = g.attributes.normal;
    const uv = g.attributes.uv;
    const count = pos.count;

    const batch = this._batch(mat, matrix);
    batch.reserve(count);

    const e = matrix.elements;
    const ne = _nm.getNormalMatrix(matrix).elements;

    const pa = pos.array, na = nor.array, ua = uv.array;
    const dp = batch.pos.data, dn = batch.nor.data, du = batch.uv.data;
    let op = batch.pos.length, on = batch.nor.length, ou = batch.uv.length;

    for (let i = 0; i < count; i++) {
      const i3 = i * 3, i2 = i * 2;
      const x = pa[i3], y = pa[i3 + 1], z = pa[i3 + 2];
      // Affine transform: w is always 1 here, so skip the divide.
      dp[op++] = e[0] * x + e[4] * y + e[8] * z + e[12];
      dp[op++] = e[1] * x + e[5] * y + e[9] * z + e[13];
      dp[op++] = e[2] * x + e[6] * y + e[10] * z + e[14];

      const nx = na[i3], ny = na[i3 + 1], nz = na[i3 + 2];
      let tx = ne[0] * nx + ne[3] * ny + ne[6] * nz;
      let ty = ne[1] * nx + ne[4] * ny + ne[7] * nz;
      let tz = ne[2] * nx + ne[5] * ny + ne[8] * nz;
      const len = Math.sqrt(tx * tx + ty * ty + tz * tz) || 1;
      dn[on++] = tx / len; dn[on++] = ty / len; dn[on++] = tz / len;

      du[ou++] = ua[i2]; du[ou++] = ua[i2 + 1];
    }
    batch.pos.length = op;
    batch.nor.length = on;
    batch.uv.length = ou;
    return this;
  }

  /** Bake under the current transform stack plus a local placement. */
  add(geo, mat, o) {
    return this.bake(geo, mat, _m.multiplyMatrices(this.current, transform(o)));
  }

  /** Attach an already-built object (animated rigs, sprites) to this group. */
  attach(obj, o) {
    const m = o
      ? new THREE.Matrix4().multiplyMatrices(this.current, transform(o))
      : this.current;
    obj.applyMatrix4(m);
    this.loose.push(obj);
    return obj;
  }

  /** World-space position of a local point — for placing lights and triggers. */
  locate(p = [0, 0, 0]) {
    return new THREE.Vector3(p[0], p[1], p[2]).applyMatrix4(this.current);
  }

  // ---- primitives ---------------------------------------------------------

  /** Axis-aligned box. `s: [w, h, d]`, centred on `p`. */
  box(mat, o) {
    return this.add(cached('box', () => new THREE.BoxGeometry(1, 1, 1)), mat, o);
  }

  /**
   * Box sitting *on* p.y rather than centred on it — how almost every real
   * object is authored (a wall stands on the ground).
   */
  boxOn(mat, o) {
    const s = Array.isArray(o.s) ? o.s : [o.s, o.s, o.s];
    const p = o.p || [0, 0, 0];
    return this.box(mat, { ...o, s, p: [p[0], p[1] + s[1] / 2, p[2]] });
  }

  plane(mat, o) {
    return this.add(cached('plane', () => new THREE.PlaneGeometry(1, 1)), mat, o);
  }

  /** Ground-facing quad; `s: [w, d]`. */
  slab(mat, o) {
    const s = o.s || [1, 1];
    return this.plane(mat, { ...o, rx: -Math.PI / 2 + (o.rx || 0), s: [s[0], s[1], 1] });
  }

  cyl(mat, o) {
    const seg = o.seg || 10;
    const r = o.r ?? 0.5, h = o.h ?? 1, r2 = o.r2;
    if (r2 !== undefined) {
      // Tapered: cache per distinct silhouette, since poles reuse a handful.
      const g = cached(`taper${r.toFixed(3)}|${r2.toFixed(3)}|${h.toFixed(3)}|${seg}|${o.open ? 1 : 0}`,
        () => new THREE.CylinderGeometry(r2, r, h, seg, 1, !!o.open));
      return this.add(g, mat, { ...o, s: undefined });
    }
    const g = cached(`cyl${seg}${o.open ? 'o' : ''}`,
      () => new THREE.CylinderGeometry(0.5, 0.5, 1, seg, 1, !!o.open));
    return this.add(g, mat, { ...o, s: [r * 2, h, r * 2] });
  }

  cone(mat, o) {
    const seg = o.seg || 8;
    const g = cached(`cone${seg}`, () => new THREE.ConeGeometry(0.5, 1, seg));
    const r = o.r ?? 0.5, h = o.h ?? 1;
    return this.add(g, mat, { ...o, s: [r * 2, h, r * 2] });
  }

  sphere(mat, o) {
    const w = o.w || 10, h = o.hs || 7;
    const g = cached(`sph${w}x${h}`, () => new THREE.SphereGeometry(0.5, w, h));
    const r = o.r ?? 0.5;
    const s = Array.isArray(o.s) ? o.s : [r * 2, r * 2, r * 2];
    return this.add(g, mat, { ...o, s });
  }

  /** Ring — bicycle wheels, mirror rims, cable coils. */
  torus(mat, o) {
    const seg = o.seg || 14, rseg = o.rseg || 6, tube = o.tube ?? 0.06;
    const g = cached(`torus${seg}x${rseg}x${tube}`,
      () => new THREE.TorusGeometry(0.5, tube, rseg, seg));
    const r = o.r ?? 0.5;
    return this.add(g, mat, { ...o, s: [r * 2, r * 2, r * 2] });
  }

  /** Low-poly blob — the workhorse for foliage and blossom clusters. */
  blob(mat, o) {
    const seed = o.seed ?? 1;
    const w = o.w || 7, hs = o.hs || 5;
    const g = cached(`blob${seed}x${w}x${hs}`, () => {
      const geo = new THREE.SphereGeometry(0.5, w, hs);
      const pos = geo.attributes.position;
      const rnd = mulberry32(seed * 9781);
      for (let i = 0; i < pos.count; i++) {
        const k = 1 + (rnd() - 0.5) * (o.jitter ?? 0.34);
        pos.setXYZ(i, pos.getX(i) * k, pos.getY(i) * k, pos.getZ(i) * k);
      }
      geo.computeVertexNormals();
      return geo;
    });
    const r = o.r ?? 0.5;
    const s = Array.isArray(o.s) ? o.s : [r * 2, r * 2, r * 2];
    return this.add(g, mat, { ...o, s });
  }

  /** Straight rod between two local points — beams, wires, handrails. */
  rod(mat, a, b, radius, seg = 6) {
    const ax = a[0], ay = a[1], az = a[2];
    const dx = b[0] - ax, dy = b[1] - ay, dz = b[2] - az;
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (len < 1e-5) return this;

    _v.set(dx / len, dy / len, dz / len);
    _q.setFromUnitVectors(UP, _v);
    _s.set(radius * 2, len, radius * 2);
    _v2.set((ax + b[0]) / 2, (ay + b[1]) / 2, (az + b[2]) / 2);
    _local.compose(_v2, _q, _s);
    const g = cached(`cyl${seg}`, () => new THREE.CylinderGeometry(0.5, 0.5, 1, seg, 1, false));
    return this.bake(g, mat, _m.multiplyMatrices(this.current, _local));
  }

  /** Sagging cable between two points. The sag is what sells a Japanese street. */
  wire(mat, a, b, sag = 0.6, radius = 0.022, steps = 8) {
    let px = a[0], py = a[1], pz = a[2];
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const qx = a[0] + (b[0] - a[0]) * t;
      const qy = a[1] + (b[1] - a[1]) * t - Math.sin(t * Math.PI) * sag;
      const qz = a[2] + (b[2] - a[2]) * t;
      this.rod(mat, [px, py, pz], [qx, qy, qz], radius, 4);
      px = qx; py = qy; pz = qz;
    }
    return this;
  }

  /** Extruded outline — used for shaped signs and gable ends. */
  shape(mat, pts, depth, o = {}) {
    const s = new THREE.Shape();
    s.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]);
    s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false });
    g.translate(0, 0, -depth / 2);
    this.add(g, mat, o);
    g.dispose();
    return this;
  }

  // ---- output -------------------------------------------------------------

  build({ castShadow = true, receiveShadow = true } = {}) {
    const group = new THREE.Group();
    group.name = this.name;
    for (const { mat, batch } of this.batches.values()) {
      if (batch.pos.length === 0) continue;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', batch.pos.finish());
      geo.setAttribute('normal', batch.nor.finish());
      geo.setAttribute('uv', batch.uv.finish());
      geo.computeBoundingSphere();
      geo.computeBoundingBox();
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = castShadow && !mat.transparent;
      mesh.receiveShadow = receiveShadow;
      mesh.matrixAutoUpdate = false;
      group.add(mesh);
    }
    for (const obj of this.loose) group.add(obj);
    this.batches.clear();
    this.loose.length = 0;
    return group;
  }

  /** Vertex count so far — useful when deciding where to spend detail. */
  get vertexCount() {
    let n = 0;
    for (const b of this.batches.values()) n += b.pos.length / 3;
    return n;
  }
}

// ---- misc helpers ---------------------------------------------------------

/** Deterministic PRNG — the city must look identical on every reload. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick(rnd, arr) { return arr[Math.floor(rnd() * arr.length) % arr.length]; }
export function range(rnd, a, b) { return a + rnd() * (b - a); }
