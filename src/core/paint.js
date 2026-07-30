import * as THREE from 'three';

/**
 * Canvas-painted textures.
 *
 * Nothing says "Japanese suburb" like the signage — 青空商店, 踏切注意, 止まれ,
 * the ¥130 strip under a row of bottles. Modelling that in geometry is hopeless,
 * so it gets painted into canvases at load time. No external assets, no fetch,
 * works offline.
 */

const JP = `"Yu Gothic", "YuGothic", "Hiragino Kaku Gothic ProN", "Noto Sans JP", "Meiryo", "MS PGothic", sans-serif`;
const JP_SERIF = `"Yu Mincho", "YuMincho", "Hiragino Mincho ProN", "Noto Serif JP", "MS PMincho", serif`;

/**
 * Master switch for lettering painted into the 3D world.
 *
 * With it off, every sign, plate and marking still gets its board, border,
 * sheen and colour — only the glyphs are skipped. That keeps the shapes and
 * the silhouette of the street intact while the forms are being worked on, and
 * turning it back on is one line.
 */
export const SHOW_TEXT = false;

const cache = new Map();

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function finish(c, { repeat, aniso = 8 } = {}) {
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = aniso;
  if (repeat) {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeat[0], repeat[1]);
  }
  return tex;
}

function memo(key, make) {
  if (cache.has(key)) return cache.get(key);
  const t = make();
  cache.set(key, t);
  return t;
}

function hex(n) { return '#' + n.toString(16).padStart(6, '0'); }

/** Fit a single line of text to a width by shrinking the font. */
function fitText(ctx, text, maxWidth, startPx, font) {
  let px = startPx;
  do {
    ctx.font = `${font.weight || 700} ${px}px ${font.family}`;
    if (ctx.measureText(text).width <= maxWidth) break;
    px -= 2;
  } while (px > 6);
  return px;
}

/**
 * Horizontal shop sign: coloured板 with a border and centred text.
 * The default is the blue-on-white 商店 board you see on every 商店街.
 */
export function signBoard({
  text,
  sub = '',
  bg = 0x275ea6,
  fg = 0xf8f6f1,
  border = null,
  w = 1024,
  h = 256,
  serif = false,
  letterSpacing = 0.14,
}) {
  return memo(`sign|${text}|${sub}|${bg}|${fg}|${border}|${w}|${h}|${serif}`, () => {
    const c = canvas(w, h);
    const ctx = c.getContext('2d');
    ctx.fillStyle = hex(bg);
    ctx.fillRect(0, 0, w, h);

    if (border !== null) {
      ctx.strokeStyle = hex(border);
      ctx.lineWidth = h * 0.045;
      ctx.strokeRect(h * 0.05, h * 0.05, w - h * 0.1, h - h * 0.1);
    }

    // Subtle top-lit sheen — enamel signs are never perfectly flat.
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, 'rgba(255,255,255,0.13)');
    g.addColorStop(0.45, 'rgba(255,255,255,0.0)');
    g.addColorStop(1, 'rgba(0,0,0,0.10)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    if (!SHOW_TEXT) return finish(c);

    const family = serif ? JP_SERIF : JP;
    ctx.fillStyle = hex(fg);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const chars = [...text];
    const spacing = h * letterSpacing;
    const budget = w * 0.86 - spacing * (chars.length - 1);
    const px = fitText(ctx, text, budget, Math.floor(h * (sub ? 0.52 : 0.62)), { family, weight: 800 });

    let total = spacing * (chars.length - 1);
    for (const ch of chars) total += ctx.measureText(ch).width;
    let x = (w - total) / 2;
    const y = sub ? h * 0.42 : h * 0.52;
    for (const ch of chars) {
      const cw = ctx.measureText(ch).width;
      ctx.fillText(ch, x + cw / 2, y);
      x += cw + spacing;
    }

    if (sub) {
      ctx.font = `600 ${Math.floor(h * 0.16)}px ${JP}`;
      ctx.fillText(sub, w / 2, h * 0.79);
    }
    return finish(c);
  });
}

/** Vertical banner — 幟 / 袖看板 / the 氷 flag outside an ice shop. */
export function verticalSign({ text, bg = 0xc94a44, fg = 0xf8f6f1, w = 256, h = 1024, serif = true }) {
  return memo(`vsign|${text}|${bg}|${fg}|${w}|${h}`, () => {
    const c = canvas(w, h);
    const ctx = c.getContext('2d');
    ctx.fillStyle = hex(bg);
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = hex(fg);
    ctx.lineWidth = w * 0.05;
    ctx.strokeRect(w * 0.09, w * 0.09, w - w * 0.18, h - w * 0.18);
    if (!SHOW_TEXT) return finish(c);

    const chars = [...text];
    const cell = (h - w * 0.4) / chars.length;
    const px = Math.min(cell * 0.78, w * 0.66);
    ctx.font = `800 ${Math.floor(px)}px ${serif ? JP_SERIF : JP}`;
    ctx.fillStyle = hex(fg);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    chars.forEach((ch, i) => ctx.fillText(ch, w / 2, w * 0.2 + cell * (i + 0.5)));
    return finish(c);
  });
}

/** Japanese regulatory 止まれ sign: red inverted triangle, white text. */
export function stopSign() {
  return memo('stopsign', () => {
    const s = 512;
    const c = canvas(s, s);
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, s, s);
    ctx.fillStyle = '#f8f6f1';
    ctx.beginPath();
    ctx.moveTo(s * 0.5, s * 0.955);
    ctx.lineTo(s * 0.032, s * 0.13);
    ctx.lineTo(s * 0.968, s * 0.13);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#cf2b28';
    ctx.beginPath();
    ctx.moveTo(s * 0.5, s * 0.885);
    ctx.lineTo(s * 0.095, s * 0.185);
    ctx.lineTo(s * 0.905, s * 0.185);
    ctx.closePath();
    ctx.fill();
    if (SHOW_TEXT) {
      ctx.fillStyle = '#ffffff';
      ctx.font = `900 ${Math.floor(s * 0.2)}px ${JP}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('止', s * 0.5, s * 0.38);
      ctx.fillText('まれ', s * 0.5, s * 0.6);
    }
    return finish(c);
  });
}

/** 踏切注意 — the yellow diamond warning plate beside a level crossing. */
export function crossingWarning() {
  return memo('xingwarn', () => {
    const s = 512;
    const c = canvas(s, s);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#f2c53f';
    ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = '#2f2b33';
    ctx.lineWidth = s * 0.05;
    ctx.strokeRect(s * 0.06, s * 0.06, s * 0.88, s * 0.88);
    if (SHOW_TEXT) {
      ctx.fillStyle = '#2f2b33';
      ctx.font = `900 ${Math.floor(s * 0.36)}px ${JP}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('踏切', s * 0.5, s * 0.33);
      ctx.fillText('注意', s * 0.5, s * 0.7);
    }
    return finish(c);
  });
}

/** The vending-machine face: rows of bottles over a glowing lightbox. */
export function vendingFace({ accent = 0xd8433a, drinks, rows = 3, cols = 5, seed = 1 }) {
  return memo(`vend|${accent}|${rows}|${cols}|${seed}`, () => {
    const w = 512, h = 1024;
    const c = canvas(w, h);
    const ctx = c.getContext('2d');

    // Header band with the brand stripe.
    ctx.fillStyle = hex(accent);
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#f5f2ea';
    ctx.fillRect(w * 0.04, h * 0.115, w * 0.92, h * 0.52);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (SHOW_TEXT) {
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.font = `800 ${Math.floor(h * 0.055)}px ${JP}`;
      ctx.fillText('つめたい / あたたかい', w * 0.5, h * 0.062);
    }

    let k = seed * 7;
    const cellW = (w * 0.92) / cols;
    const cellH = (h * 0.52) / rows;
    for (let r = 0; r < rows; r++) {
      for (let i = 0; i < cols; i++) {
        const x = w * 0.04 + i * cellW;
        const y = h * 0.115 + r * cellH;
        // shelf
        ctx.fillStyle = '#e2ded4';
        ctx.fillRect(x, y, cellW - 2, cellH - 2);

        const col = drinks[(k = (k * 1103515245 + 12345) & 0x7fffffff) % drinks.length];
        const bw = cellW * 0.42, bh = cellH * 0.60;
        const bx = x + (cellW - bw) / 2, by = y + cellH * 0.11;
        // bottle body
        ctx.fillStyle = hex(col);
        ctx.fillRect(bx, by + bh * 0.22, bw, bh * 0.78);
        // neck + cap
        ctx.fillRect(bx + bw * 0.32, by, bw * 0.36, bh * 0.24);
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.fillRect(bx + bw * 0.08, by + bh * 0.3, bw * 0.16, bh * 0.55);
        // label band
        ctx.fillStyle = 'rgba(255,255,255,0.88)';
        ctx.fillRect(bx, by + bh * 0.45, bw, bh * 0.2);

        // price + hot/cold tag
        const hot = r === rows - 1 && i % 3 === 0;
        ctx.fillStyle = hot ? '#d2352c' : '#2f6fb5';
        ctx.fillRect(x + cellW * 0.14, y + cellH * 0.78, cellW * 0.72, cellH * 0.15);
        if (SHOW_TEXT) {
          ctx.fillStyle = '#ffffff';
          ctx.font = `700 ${Math.floor(cellH * 0.115)}px ${JP}`;
          ctx.fillText(`¥${[130, 140, 150, 160, 110][(i + r) % 5]}`,
            x + cellW * 0.5, y + cellH * 0.857);
        }
      }
    }

    // Coin slot / selection panel below the racks.
    ctx.fillStyle = '#2b2830';
    ctx.fillRect(w * 0.04, h * 0.665, w * 0.92, h * 0.15);
    ctx.fillStyle = '#8e8a96';
    ctx.fillRect(w * 0.62, h * 0.69, w * 0.3, h * 0.045);
    ctx.fillStyle = '#f0c93f';
    ctx.fillRect(w * 0.09, h * 0.695, w * 0.16, h * 0.035);
    ctx.fillStyle = '#4fb372';
    ctx.fillRect(w * 0.29, h * 0.695, w * 0.16, h * 0.035);
    ctx.fillStyle = '#e2ded4';
    ctx.fillRect(w * 0.09, h * 0.755, w * 0.36, h * 0.04);

    // Delivery flap.
    ctx.fillStyle = hex(accent);
    ctx.fillRect(0, h * 0.82, w, h * 0.18);
    ctx.fillStyle = '#3a3640';
    ctx.fillRect(w * 0.1, h * 0.855, w * 0.5, h * 0.1);
    if (SHOW_TEXT) {
      ctx.fillStyle = '#f5f2ea';
      ctx.font = `800 ${Math.floor(h * 0.028)}px ${JP}`;
      ctx.textAlign = 'left';
      ctx.fillText('とりだしぐち', w * 0.12, h * 0.978);
    }

    return finish(c);
  });
}

/**
 * Shop window — interior *and* glass in one opaque panel.
 *
 * Real transparency here would mean sorting a merged batch and would still
 * look muddy. Anime backgrounds solve it the same way this does: paint the
 * shelves, darken them, then lay flat diagonal highlight bands over the top.
 * The eye reads glass immediately.
 */
export function shopInterior({ tint = 0xf2e6d2, seed = 3 }) {
  return memo(`shopint|${tint}|${seed}`, () => {
    const w = 1024, h = 512;
    const c = canvas(w, h);
    const ctx = c.getContext('2d');
    ctx.fillStyle = hex(tint);
    ctx.fillRect(0, 0, w, h);
    // Depth: much darker toward the ceiling, so the interior recedes.
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, 'rgba(48,40,58,0.68)');
    g.addColorStop(0.55, 'rgba(52,44,62,0.34)');
    g.addColorStop(1, 'rgba(52,44,62,0.16)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    let k = seed * 31;
    const rnd = () => ((k = (k * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    for (let row = 0; row < 4; row++) {
      const shelfY = h * (0.30 + row * 0.185);
      ctx.fillStyle = 'rgba(96,78,68,0.65)';
      ctx.fillRect(0, shelfY, w, h * 0.014);
      // Goods, packed left to right with irregular widths and gaps — an even
      // grid instantly reads as tiling rather than as a shop.
      let x = w * (0.01 + rnd() * 0.03);
      while (x < w * 0.98) {
        const bw = w * (0.012 + rnd() * 0.030);
        const bh = h * (0.045 + rnd() * 0.085);
        if (rnd() < 0.82) {
          const hue = Math.floor(rnd() * 360);
          ctx.fillStyle = `hsl(${hue} ${34 + rnd() * 30}% ${40 + rnd() * 24}%)`;
          ctx.fillRect(x, shelfY - bh, bw, bh);
          // A pale label band on about half of them.
          if (rnd() < 0.5) {
            ctx.fillStyle = 'rgba(240,236,226,0.55)';
            ctx.fillRect(x, shelfY - bh * 0.62, bw, bh * 0.22);
          }
        }
        x += bw + w * (0.002 + rnd() * 0.010);
      }
    }

    // Glass: a cool wash, then hard-edged diagonal reflections. Flat bands
    // rather than a gradient — that hard edge is what reads as a pane.
    ctx.fillStyle = 'rgba(146,176,203,0.34)';
    ctx.fillRect(0, 0, w, h);
    ctx.save();
    ctx.translate(w * 0.5, h * 0.5);
    ctx.rotate(-0.42);
    for (const [off, hgt, alpha] of [
      [-0.60, 0.17, 0.40], [-0.36, 0.075, 0.24], [0.12, 0.11, 0.16], [0.34, 0.05, 0.11],
    ]) {
      ctx.fillStyle = `rgba(255,255,255,${alpha})`;
      ctx.fillRect(-w * 0.9, h * off, w * 1.8, h * hgt);
    }
    ctx.restore();
    return finish(c);
  });
}

/** Awning: broad vertical stripes, the standard 商店 valance. */
export function awningStripes({ a = 0xc94a44, b = 0xf5efe4, count = 12 }) {
  return memo(`awn|${a}|${b}|${count}`, () => {
    const w = 512, h = 64;
    const c = canvas(w, h);
    const ctx = c.getContext('2d');
    const bw = w / count;
    for (let i = 0; i < count; i++) {
      ctx.fillStyle = hex(i % 2 ? b : a);
      ctx.fillRect(i * bw, 0, bw + 1, h);
    }
    return finish(c);
  });
}

/** Train side: window band, doors, and a livery stripe, tiled per car. */
export function trainSide({ body = 0xeef0f4, stripe = 0xe2683f, glass = 0x6d90a8 }) {
  return memo(`train|${body}|${stripe}|${glass}`, () => {
    const w = 1024, h = 256;
    const c = canvas(w, h);
    const ctx = c.getContext('2d');
    ctx.fillStyle = hex(body);
    ctx.fillRect(0, 0, w, h);

    // Livery band along the waist.
    ctx.fillStyle = hex(stripe);
    ctx.fillRect(0, h * 0.60, w, h * 0.085);
    ctx.fillStyle = 'rgba(0,0,0,0.10)';
    ctx.fillRect(0, h * 0.685, w, h * 0.02);

    // Doors at quarter points, windows between.
    const doorW = w * 0.105;
    const doors = [0.10, 0.36, 0.62, 0.875];
    ctx.fillStyle = hex(glass);
    for (let i = 0; i < 4; i++) {
      const x0 = w * (doors[i] + 0.075);
      const x1 = w * ((doors[i + 1] ?? 1.06) - 0.012);
      const span = x1 - x0;
      if (span < 20) continue;
      const n = Math.max(1, Math.round(span / (w * 0.075)));
      const ww = span / n - w * 0.012;
      for (let j = 0; j < n; j++) {
        ctx.fillStyle = hex(glass);
        ctx.fillRect(x0 + j * (ww + w * 0.012), h * 0.22, ww, h * 0.3);
        ctx.fillStyle = 'rgba(255,255,255,0.30)';
        ctx.fillRect(x0 + j * (ww + w * 0.012), h * 0.22, ww, h * 0.09);
      }
    }
    for (const d of doors) {
      const x = w * d;
      ctx.fillStyle = '#e4e6ec';
      ctx.fillRect(x, h * 0.10, doorW, h * 0.78);
      ctx.fillStyle = 'rgba(0,0,0,0.16)';
      ctx.fillRect(x + doorW / 2 - 1, h * 0.10, 2, h * 0.78);
      ctx.fillStyle = hex(glass);
      ctx.fillRect(x + doorW * 0.12, h * 0.20, doorW * 0.76, h * 0.30);
      ctx.fillStyle = 'rgba(255,255,255,0.28)';
      ctx.fillRect(x + doorW * 0.12, h * 0.20, doorW * 0.76, h * 0.09);
    }

    // Skirt shadow under the body.
    ctx.fillStyle = 'rgba(40,36,50,0.22)';
    ctx.fillRect(0, h * 0.90, w, h * 0.10);
    return finish(c);
  });
}

/** Number plate riveted to every Japanese utility pole. */
export function poleTag(text) {
  return memo(`poletag|${text}`, () => {
    const w = 128, h = 256;
    const c = canvas(w, h);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#e8e4dc';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#3a3640';
    ctx.lineWidth = 5;
    ctx.strokeRect(4, 4, w - 8, h - 8);
    if (SHOW_TEXT) {
      ctx.fillStyle = '#2f2b33';
      ctx.font = `800 34px ${JP}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      [...text].forEach((ch, i) => ctx.fillText(ch, w / 2, 44 + i * 42));
    }
    return finish(c);
  });
}

/** Paint on the road surface — stop bar text, crossing warnings. */
export function roadText(text, { w = 512, h = 1024, color = '#f4f2ee' } = {}) {
  return memo(`roadtext|${text}|${w}|${h}`, () => {
    const c = canvas(w, h);
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, w, h);
    // Fully transparent when lettering is off — the decal's alphaTest then
    // discards it entirely rather than leaving a ghost rectangle on the road.
    if (!SHOW_TEXT) return finish(c);

    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const chars = [...text];
    // Road paint is stretched lengthwise so it reads correctly at a low angle.
    const cell = h / chars.length;
    ctx.font = `900 ${Math.floor(Math.min(cell * 0.82, w * 0.86))}px ${JP}`;
    chars.forEach((ch, i) => {
      ctx.save();
      ctx.translate(w / 2, cell * (i + 0.5));
      // Each glyph is drawn rotated 180°. Laid flat, the texture's top edge
      // ends up nearest the driver, so the character tops have to point the
      // other way for the paint to read right way up from the road.
      ctx.scale(-0.82, -1.32);
      ctx.fillText(ch, 0, 0);
      ctx.restore();
    });
    return finish(c);
  });
}

/** Soft radial alpha used by falling petals and the sun shaft. */
export function softDisc(color = '#ffffff') {
  return memo(`disc|${color}`, () => {
    const s = 64;
    const c = canvas(s, s);
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, color);
    g.addColorStop(0.55, color);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
    return finish(c);
  });
}

/** A single five-lobed sakura petal, alpha-cut. */
export function petalSprite() {
  return memo('petal', () => {
    const s = 64;
    const c = canvas(s, s);
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, s, s);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    // Teardrop with a notched tip — the classic 桜の花びら silhouette.
    ctx.moveTo(s * 0.5, s * 0.06);
    ctx.bezierCurveTo(s * 0.9, s * 0.28, s * 0.86, s * 0.72, s * 0.5, s * 0.94);
    ctx.bezierCurveTo(s * 0.14, s * 0.72, s * 0.1, s * 0.28, s * 0.5, s * 0.06);
    ctx.fill();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.moveTo(s * 0.5, s * 0.05);
    ctx.lineTo(s * 0.60, s * 0.24);
    ctx.lineTo(s * 0.40, s * 0.24);
    ctx.closePath();
    ctx.fill();
    return finish(c);
  });
}
