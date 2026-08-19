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

  /* The trajectory pulse: every several seconds, one number's Collatz sequence
   * plays out -- a short bright segment lights up at a random on-screen tip and
   * runs down the branch to the root, the fall to 1 the conjecture promises.
   * PULSE_EDGE_MS is close to the growth wave's pace (GROW_MS over a span of
   * ~20 edges), so the pulse moves like the tree grew. */
  const PULSE_EDGES = 2.5;                        // bright segment, tree units
  const PULSE_EDGE_MS = 90;                       // travel time per edge
  const PULSE_WIDTH = 1.5;                        // px at GAUGE
  const PULSE_ALPHA = 0.55;
  const PULSE_GAP_MIN = 2000, PULSE_GAP_MAX = 5000;   // rest between pulses

  const svg = document.getElementById('coral');
  if (!svg) return;

  /* Grow the reverse tree, returning unit-scale coords, adjacency and depths. */
  function build() {
    const rad = Math.PI / 180;
    const even = EVEN_TURN * rad, odd = ODD_TURN * rad;
    const xs = [0], ys = [0], kids = [[]], depth = [0], parent = [-1];
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
        parent.push(i);
        kids[i].push(j);
        stack.push([value, j, h, d + 1]);
      }
    }
    return { xs, ys, kids, depth, parent };
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

  const { xs, ys, kids, depth, parent } = build();
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

  /* The screen transform of the last draw, kept so the pulse can project tree
   * coordinates without re-deriving the fit. */
  let view;

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
    view = { s, ox, oy, gauge, w, h };

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

    svg.innerHTML = `<g class="strands">${out}</g>`;
  }

  const motion = matchMedia('(prefers-reduced-motion: reduce)');

  draw(!motion.matches);

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

  /* The trajectory pulse. Pick a tip that is on screen, lay a single path along
   * its route to the root, and slide one dash down it -- the same trick the
   * growth wave uses, run in reverse. The dash pattern starts entirely before
   * the path and ends entirely past it, so the pulse grows in at the tip and
   * drains out at the root end with no opacity keyframes.
   *
   * Scheduling is a timer chain rather than animationend, so a resize redraw
   * that wipes the svg (pulse included) cannot kill the cycle. Tips are all at
   * MAX_DEPTH -- every node has a 2m child, so nothing shallower is a leaf --
   * which also makes every route the same length: the tip's depth in edges. */
  let pulseTimer;

  function launchPulse() {
    schedulePulse();
    if (document.hidden || !view) return;
    const { s, ox, oy, gauge, w, h } = view;
    const tips = [];
    for (let i = 0; i < xs.length; i++) {
      if (depth[i] !== MAX_DEPTH) continue;
      const px = xs[i] * s + ox, py = oy - ys[i] * s;
      if (px >= 0 && py >= 0 && px <= w && py <= h) tips.push(i);
    }
    const strands = svg.querySelector('.strands');
    if (!tips.length || !strands) return;

    let i = tips[(Math.random() * tips.length) | 0];
    const edges = depth[i];
    const pts = [];
    for (; i !== -1; i = parent[i]) {
      pts.push(`${(xs[i] * s + ox).toFixed(1)} ${(oy - ys[i] * s).toFixed(1)}`);
    }
    // Every edge is one unit, so the route's length is just its edge count.
    strands.insertAdjacentHTML('beforeend',
      `<path class="pulse" d="M${pts.join(' ')}"` +
      ` stroke-width="${(PULSE_WIDTH * gauge).toFixed(2)}"` +
      ` stroke-opacity="${PULSE_ALPHA}"` +
      ` style="--path-len:${(edges * s).toFixed(1)}px;` +
      `--pulse-len:${(PULSE_EDGES * s).toFixed(1)}px;` +
      `animation-duration:${Math.round(edges * PULSE_EDGE_MS)}ms"/>`);
    const pulse = strands.lastElementChild;
    pulse.addEventListener('animationend', () => pulse.remove());
  }

  function schedulePulse() {
    clearTimeout(pulseTimer);
    pulseTimer = setTimeout(launchPulse,
      PULSE_GAP_MIN + Math.random() * (PULSE_GAP_MAX - PULSE_GAP_MIN));
  }

  const pulseOk = () => !motion.matches && !document.hidden;

  if (pulseOk()) {
    // Let the growth wave finish and the page settle before the first pulse.
    pulseTimer = setTimeout(launchPulse, GROW_MS + PULSE_GAP_MIN);
  }
  // No pulses while the tab is hidden or motion is unwelcome; timers stop
  // entirely rather than early-returning forever.
  motion.addEventListener('change', () => {
    if (pulseOk()) schedulePulse(); else clearTimeout(pulseTimer);
  });
  document.addEventListener('visibilitychange', () => {
    if (pulseOk()) schedulePulse(); else clearTimeout(pulseTimer);
  });
})();
