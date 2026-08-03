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
 * collatz.py is the offline twin of this file; it renders the same tree to
 * collatz.svg, which index.html serves only as the <noscript> fallback.
 */
(() => {
  'use strict';

  const EVEN_TURN = 8.0;        // degrees, rotation on an n -> n/2 step
  const ODD_TURN = -20.0;       // degrees, rotation on an n -> 3n+1 step
  const MAX_DEPTH = 32;         // tree depth; growth is ~1.3x per level
  const START_HEADING = 170.0;  // orients the drawing to a landscape bounding box
  const PAD = 0.03;             // fraction of the long side kept clear at the edges
  const GROW_MS = 2200;         // time for the wave to travel from root to tips

  /* The tree fans through a limited range of headings and every branch stops at
   * exactly MAX_DEPTH, so its silhouette is a fan with a bare wedge beside it and
   * a smooth outer frontier where the tips line up. Fitting the whole silhouette
   * to the screen therefore leaves ~27% of the viewport empty and puts a visible
   * edge in frame. Scaling past that and anchoring on the dense interior pushes
   * both off-screen. 2x at (0.35, 0.35) of the bounding box is the gentlest crop
   * that fills every viewport shape tested, from 320x568 up to 3840x2160.
   * Set ZOOM = 1 and both anchors to 0.5 to frame the whole silhouette instead. */
  const ZOOM = 2.0;
  const ANCHOR_X = 0.35;        // point of the tree's bounding box pinned to the
  const ANCHOR_Y = 0.35;        // centre of the viewport, as a 0..1 fraction

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

  const { xs, ys, kids, depth } = build();
  const polys = chains(kids);

  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let i = 0; i < xs.length; i++) {
    if (xs[i] < x0) x0 = xs[i];
    if (xs[i] > x1) x1 = xs[i];
    if (ys[i] < y0) y0 = ys[i];
    if (ys[i] > y1) y1 = ys[i];
  }
  const bw = x1 - x0, bh = y1 - y0;
  const pad = PAD * Math.max(bw, bh);

  /* Bucket the polylines by the depth they branch off at. Every edge is one
   * unit long, so a node's distance along the tree from the root is exactly its
   * depth -- which lets one linear dash animation per bucket reproduce a true
   * radial growth wave. Chains in a bucket all start at the same instant and
   * draw at the same speed, so shorter ones simply finish sooner. There are 26
   * distinct depths, so this is 26 <path> elements rather than 2347. */
  const buckets = new Map();
  for (const pts of polys) {
    const d = depth[pts[0]];
    let b = buckets.get(d);
    if (!b) buckets.set(d, b = { polys: [], edges: 0 });
    b.polys.push(pts);
    if (pts.length - 1 > b.edges) b.edges = pts.length - 1;
  }
  const order = [...buckets.keys()].sort((a, b) => a - b);

  /* Lay the tree over the viewport: scale until it covers both axes the way
   * `background-size: cover` would, apply ZOOM, then pin the anchor to centre. */
  function draw(animate) {
    const w = svg.clientWidth || innerWidth;
    const h = svg.clientHeight || innerHeight;
    const s = Math.max(w / (bw + 2 * pad), h / (bh + 2 * pad)) * ZOOM;
    const ox = w / 2 - (x0 + bw * ANCHOR_X) * s;
    const oy = h / 2 + (y1 - bh * ANCHOR_Y) * s;  // y flipped: SVG's axis grows down

    let out = '';
    for (const d of order) {
      const b = buckets.get(d);
      const path = b.polys.map(pts =>
        'M' + pts.map(i =>
          `${(xs[i] * s + ox).toFixed(1)} ${(oy - ys[i] * s).toFixed(1)}`
        ).join(' ')
      ).join('');
      // Delay and duration are pure depth fractions -- the scale cancels out,
      // since both the arc length and the wave's speed are proportional to s.
      const style = animate
        ? `--len:${(b.edges * s).toFixed(1)}px;` +
          `animation-delay:${Math.round(d / MAX_DEPTH * GROW_MS)}ms;` +
          `animation-duration:${Math.round(b.edges / MAX_DEPTH * GROW_MS)}ms`
        : '';
      out += `<path d="${path}"${style ? ` style="${style}"` : ''}/>`;
    }
    svg.innerHTML = out;
  }

  const still = matchMedia('(prefers-reduced-motion: reduce)');
  draw(!still.matches);

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
