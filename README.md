# 桜町 — Sakura City

**→ [isk5434.github.io/sakura-city](https://isk5434.github.io/sakura-city/)**

An anime-styled Japanese suburban street, built entirely from code and rendered
in real time with Three.js. Walk down a narrow 生活道路 beside the railway,
wait at the 踏切 while a commuter train tears past, and watch the blossom come
down over the shopfronts.

No model files, no textures on disk, no network requests. Every mesh is
generated procedurally and every texture is painted into a canvas at load time,
so the whole thing is about 200 KB of source plus Three.js.

```bash
npm install
npm run dev      # http://localhost:5180
```

**Desktop**

| | |
|---|---|
| `W A S D` | walk |
| `Shift` | run |
| mouse | look (click to capture the cursor) |
| `C` | cinematic dolly |
| `M` | sound on / off |
| `H` | show / hide the controls panel |
| `Esc` | release the cursor |

There is no start screen. The controls live in a fold-away panel in the top-right
corner, and its open state is remembered. A modal gate was the wrong shape here
twice over: it covered the scene it was describing, and — sitting over the whole
viewport with pointer events on — it swallowed the very click meant to capture
the cursor.

**Phone / tablet**

A translucent stick appears bottom-left for walking, with run, gyro and
cinematic buttons bottom-right. Drag anywhere else to look around.

The first tap also asks for the motion sensor, and with it granted you look
around by **moving the phone itself** — hold it up and turn, and the street
turns with you. Two things make that comfortable rather than seasick:

- **Yaw is relative, not compass-absolute.** Wherever you are pointing when it
  switches on becomes the zero point. (iOS `alpha` is not true north anyway.)
- **Dragging still works and re-bases that zero point.** The gyro turns your
  head; a drag turns your body. Spinning 360° physically is fine standing up
  and impossible sitting on a train.

Roll is deliberately discarded — tilting the horizon with the phone reads as a
bug long before it reads as immersion.

Append `?touch=1` to the URL to force the phone UI on a desktop browser (and
`?touch=0` to force it off) — laying out a phone UI without a phone in your hand
is otherwise guesswork.

---

## How the anime look is made

Three things, in order of how much they matter.

**1. A stepped tone ramp.** Materials are `MeshToonMaterial` with a 3-band
gradient map (`src/core/materials.js`). That is what snaps diffuse light into
flat cel bands instead of a smooth falloff.

**2. A warm/cool split applied after lighting.** This is the difference between
"toon shader" and "anime background". Lit surfaces drift cream, shaded surfaces
drift violet. It is injected into the toon shader with `onBeforeCompile`, which
divides the albedo back out of the accumulated light so the split keys off
*illumination* rather than off how dark the paint happens to be.

The subtlety worth knowing: a tint must shift hue **without** stealing
brightness. Colours from hex arrive already converted to linear space, so a
"light violet" like `#c4bfdc` is only ~0.54 luminance by the time it reaches the
shader — multiplying by it crushes every shadow to mud. Both tints are
normalised to a target luminance first, and the tone ramp is left in charge of
value.

**3. A post-process ink pass.** Inverted-hull outlines only catch silhouettes;
hand-drawn backgrounds also have lines where a roof meets a wall. So the scene
is re-rendered into a view-space normal buffer with a depth attachment, and a
Roberts cross over both finds silhouettes (depth) and creases (normals) in one
go — `src/core/post.js`.

Two details do most of the work there:

- the depth threshold is anchored to the **nearest** of the sampled depths, not
  the centre pixel, so a silhouette against the sky belongs to the near object
- the threshold is divided by how edge-on the surface is (`abs(viewNormal.z)`),
  which is what stops the road turning into a solid black wash toward the horizon

Then bloom (thresholded above 1.0 so only genuinely emissive things glow) and a
split-tone grade with a vignette and a whisper of grain.

## How the geometry is made

`src/core/geo.js` is a small modelling kit. Primitives are baked straight into
per-material vertex buffers under a transform stack:

```js
b.at({ p: [4, 0, -12], ry: Math.PI / 2 }, () => vendingMachine(b));
```

The important design choice: baking writes transformed vertices directly into a
growable `Float32Array` rather than cloning a `BufferGeometry` per primitive.
The scene stamps roughly 30,000 primitives; the cloning version took over 40
seconds to build, this one takes about 2.

Batches are also bucketed spatially (`{ chunk: 44 }`). Merging everything into
one mesh per material makes the draw-call count tiny but defeats frustum culling
completely — and this scene renders its geometry three times per frame (shadow,
beauty, ink), so culling matters more than the draw calls do.

Signage, vending-machine faces, train sides and shop interiors are painted into
canvases in `src/core/paint.js`. Shop windows are opaque panels with the
interior *and* the glass reflections painted in, which is how anime backgrounds
solve the same problem — real transparency there would mean sorting a merged
batch and would still look muddy.

Audio (`src/core/audio.js`) is synthesised at runtime. The crossing bell is
additive partials at non-integer ratios with a fast attack and a long tail,
which is what makes it read as struck metal rather than as a beep.

## Layout

`src/world/layout.js` is the single source of truth. The street runs along +Z,
the railway crosses it along X, and the player spawns looking down the street
with the crossing centred about 25 m ahead.

```
src/
├── core/
│   ├── palette.js     colour + light constants for the whole scene
│   ├── materials.js   the toon material, tone ramps, the warm/cool injection
│   ├── geo.js         Builder — transform stack, primitives, batching
│   ├── paint.js       canvas-painted textures (signage, faces, liveries)
│   ├── sky.js         painted sky dome with posterised clouds
│   ├── post.js        composer: ink pass, bloom, grade
│   └── audio.js       runtime-synthesised bell, rumble, birds, footsteps
├── world/
│   ├── layout.js      coordinates everything agrees on
│   ├── road.js        asphalt, kerbs, pavement, tactile paving, backdrop
│   ├── railway.js     track, crossing deck, barriers, signals, catenary
│   ├── train.js       the 4-car commuter EMU
│   ├── buildings.js   houses, shops, apartments — one generator each
│   ├── sakura.js      cherry trees and the GPU petal system
│   ├── props.js       poles, wires, vending machines, bicycles, signs
│   └── scene.js       assembly, lighting, and the train director
├── player/
│   ├── controls.js    first-person movement, collision, cinematic dolly
│   └── gyro.js        device-orientation look for phones
├── ui/touch.js        on-screen stick and buttons
└── main.js            renderer, loading, the frame loop
```

## Things that were not obvious

Collected here because each one cost real time to find.

- **A `PlaneGeometry` faces local +Z.** On plots authored with the facade at
  local −Z, every textured plane — shop signs, interiors, warning plates —
  needs `ry: Math.PI` or you are looking at its back.
- **Sun elevation dominates a narrow street.** This road is 6 m wide between
  6 m buildings. Below about 60° of elevation the whole carriageway sits in
  permanent shade and the dappling from the cherry canopy stops reading.
- **Road paint is upside down by default.** Laid flat with `rx: -π/2`, the
  texture's top edge ends up *nearest* the driver, so each glyph has to be drawn
  rotated 180° in the canvas for the paint to read right way up from the road.
- **Left-hand traffic changes the layout.** Stop bars, `とまれ`, and the barrier
  posts all belong on the approaching driver's left.
- **`requestAnimationFrame` does not fire in a hidden or throttled frame.** The
  loading sequence races rAF against a timer so it always completes, and the
  render loop has a watchdog that keeps the scene alive when rAF is starved but
  the page is visible.
- **Emissive keeps blossom pink.** Where the shadow map cuts the sun entirely,
  ambient alone is violet — and a violet cherry tree loses the season. A little
  emissive plus a high-key tone ramp fixes it.

## Performance

The scene renders its geometry three times per frame: shadow map, beauty pass,
and the normal buffer for the ink pass. Measured at roughly 43 fps on an AMD
integrated GPU; comfortably vsync-locked on anything discrete. If the frame rate
sits below 40, `main.js` drops the device pixel ratio once rather than letting
the whole scene stutter.

`window.SAKURA` is exposed for tuning from the console:

```js
SAKURA.look(0.9, -8.5, Math.PI)  // drop the camera somewhere and point it
SAKURA.train(1, 22)              // send a train through now
SAKURA.ink.material.uniforms.uThickness.value = 1.6
```

## Deploying

The live site is served from the `gh-pages` branch. To publish a new build:

```bash
npm run build
npx gh-pages -d dist        # or push dist/ to gh-pages by hand
```

There is a GitHub Actions workflow ready to do this automatically, held in
`.ci-pending/pages.yml`. Pushing a file under `.github/workflows/` needs a token
with the `workflow` scope, so to switch to automatic deploys:

```bash
gh auth refresh -s workflow
mkdir -p .github/workflows && mv .ci-pending/pages.yml .github/workflows/
git add .github && git commit -m "Add Pages deploy workflow" && git push
```

Then set the repository's Pages source to **GitHub Actions**.
