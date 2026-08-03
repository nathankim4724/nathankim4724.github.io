# nathankim.me

Personal website. Static HTML/CSS, no build step, deployed via GitHub Pages.

## Files

- `index.html` — the page
- `style.css` — styles
- `nathan.jpg` — portrait, metadata stripped
- `collatz.js` — builds, grows and lights the background artwork in the browser
- `collatz.svg` — pre-rendered artwork, used only as the `<noscript>` fallback
- `collatz.py` — regenerates `collatz.svg`; not part of the build
- `CNAME` — tells GitHub Pages to serve at `nathankim.me` (do not delete)
- `.nojekyll` — skips Jekyll processing so files starting with `_` are served as-is

## The background

The reverse Collatz tree rooted at 1: every node `m` has a child `2m`, plus
`(m-1)/3` when that is an odd integer above 1. Walking it as turtle graphics, the
heading turns 8° on a halving step and −20° on a `3n+1` step. Halvings outnumber
odd steps, so the trunk curves gently while the rare odd steps throw off branches
— hence the coral. 32 levels deep: 5,618 nodes, 5,617 segments.

`collatz.js` builds this at load and grows it outward from the root over 1.7s,
then re-fits it on resize. Runs of single-child nodes collapse into polylines —
2,347 of them — which are then cut at the depth-band boundaries below and bucketed
by the depth they start at, so the whole coral is 28 `<path>` elements.

Every edge is one unit long, so a node's distance along the tree from the root is
exactly its depth. That is what makes the growth cheap: give each bucket a dash
animation whose delay and duration are its depth and length as fractions of the
whole, and all 28 draw at one shared speed — a true radial wave, no per-frame
JavaScript. Dashing restarts at each subpath, so one `<path>` grows all of its
chains at once.

The root itself is off-screen, though, so a wave clocked from it spends its first
0.8s at 1440×900 drawing nothing you can see. `draw()` finds the shallowest node
actually in frame and starts the clock there. Every delay shifts by the same
constant, so the wave still travels at one speed — it enters at the edge of the
viewport instead of taking most of a second to reach it. `GROW_MS` is therefore
the time to cross the viewport, not the time from the root.

### The depth ramp

Ink is graded by depth. A branch near the root is drawn at 2.4px and 0.62 alpha;
out at the tips it is 0.55px and 0.10, on a `RAMP = 1.6` curve that holds the near
branches heavy and spends most of the fade on the far ones. This is what gives the
drawing depth instead of the flat isotropic crosshatch it used to be, and it is
also what dissolves the two edges the bare tree would otherwise show: the frontier
where every branch stops at the same distance, and the seams where it meets the
viewport. It costs nothing — chains are cut wherever they cross into the next of
`BANDS = 12`, so a bucket sits in exactly one band and carries one width and one
alpha, and the largest step between neighbouring bands is 0.26px and 0.073 alpha
— at the far end, where the strokes are half a pixel wide and nearly gone.

The caps are butt rather than round, which matters now that alpha lives on the
stroke instead of on the layer: two pieces meet at every branch and every band
boundary, and two round caps at the same point composite into a dark bead. Butt
caps put nothing at the ends to double up. A piece keeps the boundary node at
each end so the two still abut exactly.

Depth used to be 37, at 18,119 nodes. The extra five levels land almost entirely
in the tip region, where branches are already closer together than a stroke is
wide, so they arrived as a flat grey smear rather than as detail — and cost 3.2×
the nodes to do it.

The stroke widths above are drawn for a tree scaled to ~60px per edge, which is
where nearly every laptop and 1080p viewport lands, and where `MIN_SCALE` holds
everything smaller. A 3840×2160 viewport gets 3.1× that, so widths track the scale
under a square root — matching it exactly would turn the trunk into a 7.4px cable.

### Framing

The tree fans through a limited range of headings, and every branch stops at
exactly `MAX_DEPTH` — so its silhouette is a fan with a bare wedge beside it.
Fitted whole to the screen it leaves about a quarter of the viewport empty.

`ZOOM` and `ANCHOR_X`/`ANCHOR_Y` scale past the fit and pin the dense interior to
the centre, pushing the wedge off-screen. `ZOOM = 2.0` at (0.33, 0.36) holds up
from 320×568 through 3840×2160 and out to letterbox extremes like 2000×500. Wide
viewports are the case to check when retuning, not phones: the fit is `cover` on a
bounding box wider than it is tall, so a wide viewport shows the tree's full width
and runs out of branches before a tall one does. Set `ZOOM = 1` and both anchors
to `0.5` to frame the whole silhouette instead.

The bounding box widens by roughly two units per level, so `ZOOM` and the anchors
need re-fitting whenever `MAX_DEPTH` changes; the depth-37 tree this replaced sat
at `2.1` and (0.35, 0.375).

Covering the viewport is not the same as filling it well, though. Cover puts the
whole drawing on screen at any size, so a 320×568 phone gets a laptop's worth of
strands in a fifth of the area — 38px between them rather than 69, which is where
the fan stops reading as branches and starts reading as scratches. `MIN_SCALE` is
a floor on px-per-edge: 65, which only ever zooms further in, and which every
viewport from 1366×768 up already clears, so it changes nothing there. Below that
it trades a little of the tree for the same texture everywhere. The floor cannot
uncover an edge, because it only moves in the direction the anchor already points.

### Retuning

Edit the constants at the top of `collatz.js`: the tree (`EVEN_TURN`, `ODD_TURN`,
`MAX_DEPTH`, `START_HEADING`), the framing (`ZOOM`, `ANCHOR_X`, `ANCHOR_Y`,
`MIN_SCALE`, `PAD`), the depth ramp (`BANDS`, `NEAR_WIDTH`, `FAR_WIDTH`,
`NEAR_ALPHA`, `FAR_ALPHA`, `RAMP`, `GAUGE`, `GAUGE_MIN`, `GAUGE_MAX`) and the
growth (`GROW_MS`). Keep `collatz.py` in step and re-run it to refresh the
`<noscript>` fallback:

```sh
python3 collatz.py
```

`collatz.py` renders the same tree, the same depth ramp and the same crop, at
1600×1000 — so `background-size: cover` on the fallback lands close to what the
browser would have drawn, rather than showing the whole uncropped silhouette. It
has no `MIN_SCALE`: the fallback is one fixed image that CSS scales, so there is
no per-viewport scale to put a floor under.

The page is light-only (`color-scheme: light`). `--ink` in `style.css` sets the
colour, and `--coral` is a master dial over the whole ramp — the drawing already
grades itself, so it multiplies rather than sets a level. The growth is skipped
under `prefers-reduced-motion`, which renders the finished tree immediately.

## The card

`main` is an opaque white block over the drawing, so the portrait and the text sit
on plain white while the coral runs out to the margins. Its padding is part of the
block, which is why `max-width` is 61rem for a 56rem content column.

That block is also what keeps the contrast question off the table: no text overlaps
a strand any more. `--muted` (`#3d3d38`) reads 10.9:1 on the card. It used to be
sized against the drawing itself; if the card ever goes away, the near end of the
depth ramp has to come down with it.

## Local preview

```sh
python3 -m http.server 8000
```

Then open http://localhost:8000

## Deploy

Push to `main`. GitHub Pages redeploys in ~1 minute.
