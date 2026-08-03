/* Collatz coral — the background artwork, grown in the browser.
 *
 * The Collatz conjecture: from any positive integer n, repeat n -> n/2 when n
 * is even and n -> 3n+1 when it is odd, and you always fall to 1. Nobody has
 * proved it. This draws the *reverse* of that process as a tree rooted at 1:
 * every node m has a child 2m, and additionally a child (m-1)/3 whenever that
 * is an odd integer greater than 1.
 *
 * The tree is walked as turtle graphics. Each edge is one unit long, and the
 * heading rotates by EVEN_TURN on a halving step or ODD_TURN on a 3n+1 step.
 * Halvings vastly outnumber odd steps, so the trunk curves gently while the
 * rare odd steps fling off branches -- which gives the structure its coral look.
 *
 * Ink is graded by depth: heavy and dark on the near branches, hairline and
 * almost transparent out at the tips. That is what gives the drawing depth, and
 * it is also what dissolves the two edges the bare tree would otherwise show --
 * the frontier where every branch stops at the same distance, and the seams
 * where it meets the viewport.
 *
 * collatz.py is the offline twin of this file; it renders the same tree to
 * collatz.svg, which index.html serves only as the <noscript> fallback.
 */
(() => {
  'use strict';

  const EVEN_TURN = 8.0;        // degrees, rotation on an n -> n/2 step
  const ODD_TURN = -20.0;       // degrees, rotation on an n -> 3n+1 step
  const START_HEADING = 170.0;  // orients the drawing to a landscape bounding box
  const PAD = 0.03;             // fraction of the long side kept clear at the edges
  const GROW_MS = 1700;         // time for the wave to cross the viewport

  /* Depth 32 is 5,618 nodes. It used to be 37, at 18,119 -- but the extra five
   * levels land almost entirely in the tip region, where the branches are
   * already closer together than a stroke is wide, so they arrived as a flat
   * grey smear rather than as detail. At 32 the branching still resolves at
   * every viewport size tested. Raising it wants ZOOM and the anchors re-fitted:
   * the bounding box grows by roughly two units per level. */
  const MAX_DEPTH = 32;

  /* The tree fans through a limited range of headings and every branch stops at
   * exactly MAX_DEPTH, so its silhouette is a fan with a bare wedge beside it.
   * Fitting the whole silhouette to the screen therefore leaves a quarter of the
   * viewport empty. Scaling past that and anchoring on the dense interior pushes
   * the wedge off-screen; 2.0x at (0.33, 0.36) of the bounding box holds up from
   * 320x568 through 3840x2160 and out to letterbox extremes like 2000x500.
   * Wide viewports are the ones to check when retuning -- they show the full
   * width of the tree, so they run out of branches before tall ones do. Set
   * ZOOM = 1 and both anchors to 0.5 to frame the whole silhouette instead. */
  const ZOOM = 2.0;
  const ANCHOR_X = 0.33;        // point of the tree's bounding box pinned to the
  const ANCHOR_Y = 0.36;        // centre of the viewport, as a 0..1 fraction

  /* Covering the viewport is not the same as filling it well. Cover puts the
   * whole drawing on screen at any size, so a 320x568 phone gets the same number
   * of strands as a laptop crammed into a fifth of the area -- 38px between them
   * rather than 69, which is where the fan stops reading as branches and starts
   * reading as scratches. A floor on the scale trades a little of the tree for
   * the same texture everywhere. It only ever zooms in, and the anchor sits deep
   * enough in the interior that zooming in cannot uncover an edge. 65 leaves
   * every viewport from 1366x768 up exactly as ZOOM framed it. */
  const MIN_SCALE = 65;         // px per tree edge, floor

  /* The depth ramp. Chains are cut wherever they cross a band boundary, so every
   * path carries a single weight and alpha. RAMP > 1 holds the near branches
   * heavy and spends most of the fade on the tips, which is what keeps the
   * frontier soft without washing out the structure in front of it. It also
   * front-loads the steps: neighbouring bands differ by 0.04px and 0.011 alpha
   * at the root end, widening to 0.26px and 0.073 at the tip end -- but that is
   * where the strokes are half a pixel wide and nearly gone, so the largest step
   * is also the least visible one. */
  const BANDS = 12;
  const NEAR_WIDTH = 2.4, FAR_WIDTH = 0.55;   // px at GAUGE, root end -> tip end
  const NEAR_ALPHA = 0.62, FAR_ALPHA = 0.10;
  const RAMP = 1.6;

  /* The widths above are drawn for a tree scaled to ~GAUGE px per edge, which is
   * what nearly every laptop and 1080p desktop lands on, and what MIN_SCALE holds
   * everything smaller near. A 3840x2160 viewport gets 3.1x that, so the strokes
   * track it -- under a square root, because matching the scale exactly would
   * turn the trunk into a 7.4px cable. GAUGE_MIN is a backstop only: MIN_SCALE
   * already keeps the gauge above 1. */
  const GAUGE = 60;
  const GAUGE_MIN = 0.85, GAUGE_MAX = 1.7;

  // Target glints on screen. The thinning grid is sized by area, so the count
  // lands near this rather than under it -- 48 to 54 across the sizes tested.
  const DOTS = 52;
  const CORE_R = 1.9;           // px at GAUGE
  const HALO_R = 9;
  const GLINT_HI = 0.95;        // opacity at the top of a flare
  const GLINT_LO = 0.42;        // ... and between flares
  const GLINT_FADE = 1.0;       // how fast a glint dims with the depth it sits at
  const GLINT_FLOOR = 0.45;     // ... and how faint it is allowed to get
  const TWINKLE_MIN = 7;        // seconds, shortest flash cycle
  const TWINKLE_MAX = 15;       // seconds, longest

  const svg = document.getElementById('coral');
  if (!svg) return;

  /* Grow the reverse tree, returning unit-scale coords, adjacency and depths. */
  function build() {
    const rad = Math.PI / 180;
    const even = EVEN_TURN * rad, odd = ODD_TURN * rad;
    const xs = [0], ys = [0], kids = [[]], depth = [0];
    const stack = [[1, 0, START_HEADING * rad, 0]];
    while (stack.length) {
      const [m, i, heading, d] = stack.pop();
      if (d >= MAX_DEPTH) continue;
      const steps = [[2 * m, even]];
      if ((m - 1) % 3 === 0) {
        const k = (m - 1) / 3;
        // k must be an odd integer above the 4-2-1 cycle
        if (k > 1 && k % 2 === 1) steps.push([k, odd]);
      }
      for (const [value, turn] of steps) {
        const h = heading + turn;
        const j = xs.length;
        xs.push(xs[i] + Math.cos(h));
        ys.push(ys[i] + Math.sin(h));
        kids.push([]);
        depth.push(d + 1);
        kids[i].push(j);
        stack.push([value, j, h, d + 1]);
      }
    }
    return { xs, ys, kids, depth };
  }

  /* Collapse runs of single-child nodes into polylines, so the DOM stays small. */
  function chains(kids) {
    const out = [], stack = [[0, [0]]];
    while (stack.length) {
      const [i, pts] = stack.pop();
      const c = kids[i];
      if (c.length === 1) {
        pts.push(c[0]);
        stack.push([c[0], pts]);
      } else {
        if (pts.length >= 2) out.push(pts);
        for (const j of c) stack.push([j, [i, j]]);
      }
    }
    return out;
  }

  const band = d => Math.min(BANDS - 1, (d * BANDS / (MAX_DEPTH + 1)) | 0);

  /* Cut every chain where it crosses into the next band, so each piece has one
   * weight. The boundary node belongs to the piece on either side of it, so the
   * two abut exactly -- see the butt-cap note in style.css for why they must not
   * overlap by so much as a cap. */
  function slice(polys, depth) {
    const out = [];
    for (const pts of polys) {
      let start = 0, b = band(depth[pts[0]]);
      for (let i = 1; i < pts.length; i++) {
        const nb = band(depth[pts[i]]);
        if (nb === b) continue;
        out.push(pts.slice(start, i + 1));
        start = i;
        b = nb;
      }
      if (pts.length - start >= 2) out.push(pts.slice(start));
    }
    return out;
  }

  const { xs, ys, kids, depth } = build();
  const polys = slice(chains(kids), depth);

  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let i = 0; i < xs.length; i++) {
    if (xs[i] < x0) x0 = xs[i];
    if (xs[i] > x1) x1 = xs[i];
    if (ys[i] < y0) y0 = ys[i];
    if (ys[i] > y1) y1 = ys[i];
  }
  const bw = x1 - x0, bh = y1 - y0;
  const pad = PAD * Math.max(bw, bh);

  /* Bucket the pieces by the depth they start at. Every edge is one unit long,
   * so a node's distance along the tree from the root is exactly its depth --
   * which lets one linear dash animation per bucket reproduce a true radial
   * growth wave. Pieces in a bucket all start at the same instant and draw at
   * the same speed, so shorter ones simply finish sooner. Cutting at the band
   * boundaries also means a bucket sits in exactly one band, so the same 28
   * <path> elements carry the depth ramp -- one weight and alpha apiece. */
  const buckets = new Map();
  for (const pts of polys) {
    const d = depth[pts[0]];
    let b = buckets.get(d);
    if (!b) buckets.set(d, b = { polys: [], edges: 0 });
    b.polys.push(pts);
    if (pts.length - 1 > b.edges) b.edges = pts.length - 1;
  }
  const order = [...buckets.keys()].sort((a, b) => a - b);

  /* Find where two strands cross on top of each other. draw() only ever applies
   * a similarity transform (uniform scale, translate, flip), and those preserve
   * intersections -- so this runs once in unit space and the results are simply
   * re-projected on resize, which also keeps each glint's identity stable.
   *
   * Every edge is one unit long, so a 1x1 bucket grid puts only a handful of
   * candidates in each cell and the pair test stays near-linear. */
  function crossings() {
    // Flat, stride 6: x0 y0 x1 y1 nodeA nodeB. Avoids 5617 small arrays.
    const seg = [];
    for (let i = 0; i < xs.length; i++)
      for (const j of kids[i]) seg.push(xs[i], ys[i], xs[j], ys[j], i, j);
    const count = seg.length / 6;

    // Bucket by unit cell. Coordinates span roughly x -32..8, y -27..1, so an
    // integer key beats string concatenation by a wide margin here.
    const KEY = (cx, cy) => (cx + 256) * 1024 + (cy + 256);
    const grid = new Map();
    for (let n = 0; n < count; n++) {
      const o = n * 6;
      const cx1 = Math.floor(Math.max(seg[o], seg[o + 2]));
      const cy1 = Math.floor(Math.max(seg[o + 1], seg[o + 3]));
      for (let cx = Math.floor(Math.min(seg[o], seg[o + 2])); cx <= cx1; cx++)
        for (let cy = Math.floor(Math.min(seg[o + 1], seg[o + 3])); cy <= cy1; cy++) {
          const k = KEY(cx, cy);
          const b = grid.get(k);
          if (b) b.push(n); else grid.set(k, [n]);
        }
    }

    // Flat, stride 3: x y depth. The depth is the deeper of the two strands, and
    // it is what paintDots() dims the glint by, so a glint never burns brighter
    // than the strands it is supposed to be sitting on.
    const out = [];
    for (const [k, bucket] of grid) {
      const cx = Math.floor(k / 1024) - 256, cy = (k % 1024) - 256;
      for (let p = 0; p < bucket.length; p++) {
        const a = bucket[p] * 6;
        for (let q = p + 1; q < bucket.length; q++) {
          const b = bucket[q] * 6;
          // Segments meeting at a shared node touch but do not cross.
          if (seg[a + 4] === seg[b + 4] || seg[a + 4] === seg[b + 5] ||
              seg[a + 5] === seg[b + 4] || seg[a + 5] === seg[b + 5]) continue;
          const rx = seg[a + 2] - seg[a], ry = seg[a + 3] - seg[a + 1];
          const sx = seg[b + 2] - seg[b], sy = seg[b + 3] - seg[b + 1];
          const den = rx * sy - ry * sx;
          if (!den) continue;
          const dx = seg[b] - seg[a], dy = seg[b + 1] - seg[a + 1];
          const t = (dx * sy - dy * sx) / den;
          if (t <= 0.02 || t >= 0.98) continue;
          const u = (dx * ry - dy * rx) / den;
          if (u <= 0.02 || u >= 0.98) continue;
          const x = seg[a] + t * rx, y = seg[a + 1] + t * ry;
          // A crossing lies in exactly one cell, and both its segments are
          // bucketed there -- so accepting it only in that cell counts it once
          // and needs no dedup table.
          if (Math.floor(x) !== cx || Math.floor(y) !== cy) continue;
          out.push(x, y, Math.max(depth[seg[a + 5]], depth[seg[b + 5]]));
        }
      }
    }
    return out;
  }

  let glints = null;   // flat triples x, y, depth once computed

  /* Cheap integer hash, so each glint's priority and twinkle timing follow from
   * its index instead of costing three Math.random() calls apiece. */
  function rnd(n) {
    n = Math.imul(n ^ (n >>> 15), 0x2c1b3c6d);
    n = Math.imul(n ^ (n >>> 12), 0x297a2d39);
    return ((n ^ (n >>> 15)) >>> 0) / 4294967296;
  }

  /* Lay the tree over the viewport: scale until it covers both axes the way
   * `background-size: cover` would, apply ZOOM, then pin the anchor to centre. */
  function draw(animate) {
    const w = svg.clientWidth || innerWidth;
    const h = svg.clientHeight || innerHeight;
    const cover = Math.max(w / (bw + 2 * pad), h / (bh + 2 * pad));
    const s = Math.max(cover * ZOOM, MIN_SCALE);
    const ox = w / 2 - (x0 + bw * ANCHOR_X) * s;
    const oy = h / 2 + (y1 - bh * ANCHOR_Y) * s;  // y flipped: SVG's axis grows down
    const gauge = Math.min(GAUGE_MAX, Math.max(GAUGE_MIN, Math.sqrt(s / GAUGE)));

    /* The root is off-screen, so a wave clocked from it spends its first stretch
     * drawing nothing anyone can see -- about 0.8s of an empty page at 1440x900.
     * Find the shallowest node that is actually in frame and start the clock
     * there instead. Every delay shifts by the same constant, so the wave still
     * travels at a single speed; it now enters at the edge of the viewport
     * rather than taking that long to reach it. */
    let lead = 0;
    if (animate) {
      lead = MAX_DEPTH;
      for (let i = 0; i < xs.length; i++) {
        if (depth[i] >= lead) continue;
        const px = xs[i] * s + ox, py = oy - ys[i] * s;
        if (px >= 0 && py >= 0 && px <= w && py <= h) lead = depth[i];
      }
    }
    const span = (MAX_DEPTH - lead) || MAX_DEPTH;

    let out = '';
    for (const d of order) {
      const b = buckets.get(d);
      const f = BANDS > 1 ? Math.pow(band(d) / (BANDS - 1), RAMP) : 0;
      const width = (NEAR_WIDTH + (FAR_WIDTH - NEAR_WIDTH) * f) * gauge;
      const alpha = NEAR_ALPHA + (FAR_ALPHA - NEAR_ALPHA) * f;
      const path = b.polys.map(pts =>
        'M' + pts.map(i =>
          `${(xs[i] * s + ox).toFixed(1)} ${(oy - ys[i] * s).toFixed(1)}`
        ).join(' ')
      ).join('');
      // Delay and duration are pure depth fractions -- the scale cancels out,
      // since both the arc length and the wave's speed are proportional to s.
      const style = animate
        ? ` style="--len:${(b.edges * s).toFixed(1)}px;` +
          // Buckets that start before the wave enters frame get a negative delay,
          // which starts them already part-drawn -- so a piece that straddles the
          // edge of the viewport arrives on the wave rather than ahead of it.
          `animation-delay:${Math.round((d - lead) / span * GROW_MS)}ms;` +
          `animation-duration:${Math.round(b.edges / span * GROW_MS)}ms"`
        : '';
      out += `<path d="${path}" stroke-width="${width.toFixed(2)}"` +
             ` stroke-opacity="${alpha.toFixed(3)}"${style}/>`;
    }

    view = { w, h, s, ox, oy, gauge };
    svg.innerHTML =
      '<defs><radialGradient id="coral-glow">' +
      '<stop class="s0" offset="0"/><stop class="s1" offset="0.45"/><stop class="s2" offset="1"/>' +
      '</radialGradient></defs>' +
      `<g class="strands">${out}</g>` +
      `<g class="glints"${animate ? ` style="--in:${GROW_MS}ms"` : ''}></g>`;
    paintDots();
  }

  /* Place the glints. Split out from draw() so the crossing search can happen
   * off the critical path -- the strands paint first, and these arrive later
   * into the layer draw() left empty. */
  function paintDots() {
    const layer = svg.querySelector('.glints');
    if (!layer || !glints || !view) return;
    const { w, h, s, ox, oy, gauge } = view;
    const edge = HALO_R * gauge;   // keep whole haloes in frame, never half a dot

    /* Thin the crossings to an even scatter. They cluster hard in the dense
     * regions, so a plain random sample would clump; instead keep at most one
     * per cell of a grid sized to the target count, lowest rank winning. */
    const cellPx = Math.sqrt(w * h / DOTS);
    const picked = new Map();
    for (let i = 0; i < glints.length; i += 3) {
      const px = glints[i] * s + ox, py = oy - glints[i + 1] * s;
      if (px < edge || py < edge || px > w - edge || py > h - edge) continue;
      const id = i / 3, rank = rnd(id);
      const k = Math.floor(px / cellPx) * 4096 + Math.floor(py / cellPx);
      const cur = picked.get(k);
      if (!cur || rank < cur.rank) picked.set(k, { id, rank, px, py, d: glints[i + 2] });
    }

    let dots = '';
    for (const { id, px, py, d } of picked.values()) {
      // Track the strands underneath: a crossing out in the dissolved tips gets
      // a fainter, smaller glint than one on a branch you can actually see.
      const k = GLINT_FLOOR + (1 - GLINT_FLOOR) *
                Math.pow(1 - d / MAX_DEPTH, GLINT_FADE);
      const period = TWINKLE_MIN + rnd(id * 2 + 1) * (TWINKLE_MAX - TWINKLE_MIN);
      // A negative delay starts the cycle already in progress, which is what
      // scatters the flashes instead of firing them all on the same beat.
      const timing = twinkle
        ? `--per:${period.toFixed(1)}s;--ph:${(-rnd(id * 3 + 2) * period).toFixed(1)}s;`
        : '';
      dots += `<g class="${twinkle ? 'glint tw' : 'glint'}"` +
              ` style="${timing}--hi:${(GLINT_HI * k).toFixed(3)};--lo:${(GLINT_LO * k).toFixed(3)}"` +
              ` transform="translate(${px.toFixed(1)} ${py.toFixed(1)})">` +
              `<circle class="halo" r="${(HALO_R * (0.75 + 0.25 * k) * gauge).toFixed(2)}"/>` +
              `<circle class="core" r="${(CORE_R * (0.8 + 0.2 * k) * gauge).toFixed(2)}"/></g>`;
    }

    layer.innerHTML = dots;
  }

  const still = matchMedia('(prefers-reduced-motion: reduce)');
  const twinkle = !still.matches;
  let view = null;
  draw(twinkle);

  /* Hunting the crossings costs far more than drawing the tree, and the glints
   * stay hidden until the growth finishes -- so it waits for an idle moment
   * rather than holding up the first paint. */
  const idle = window.requestIdleCallback || (fn => setTimeout(fn, 1));
  idle(() => { glints = crossings(); paintDots(); });

  /* Re-fit on resize. The tree itself is scale-invariant, so only the transform
   * is recomputed -- and the growth never replays, it has already been seen. */
  let timer, lastW = innerWidth, lastH = innerHeight;
  addEventListener('resize', () => {
    if (innerWidth === lastW && innerHeight === lastH) return;
    lastW = innerWidth;
    lastH = innerHeight;
    clearTimeout(timer);
    timer = setTimeout(() => draw(false), 150);
  });
})();
