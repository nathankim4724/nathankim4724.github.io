# nathankim.me

Personal website. Static HTML/CSS, no build step, deployed via GitHub Pages.

## Files

- `index.html` — the page
- `style.css` — styles
- `nathan.jpg` — portrait, metadata stripped
- `collatz.js` — builds and grows the background artwork in the browser
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

`collatz.js` builds this at load and grows it outward from the root over 2.2s,
then re-fits it on resize. Runs of single-child nodes collapse into polylines,
which are bucketed by the depth they branch off at — 26 buckets, so the whole
coral is 26 `<path>` elements rather than 2,347.

Every edge is one unit long, so a node's distance along the tree from the root is
exactly its depth. That is what makes the growth cheap: give each bucket a dash
animation whose delay and duration are its depth and length as fractions of the
whole, and all 26 draw at one shared speed — a true radial wave, no per-frame
JavaScript. Dashing restarts at each subpath, so one `<path>` grows all of its
chains at once.

### Framing

The tree fans through a limited range of headings, and every branch stops at
exactly `MAX_DEPTH` — so its silhouette is a fan with a bare wedge beside it, ending
in a smooth frontier where all the tips line up at the same distance from the root.
Fitted whole to the screen it covers only ~73% of the viewport and puts that edge
in frame.

`ZOOM` and `ANCHOR_X`/`ANCHOR_Y` scale past the fit and pin the dense interior to
the centre, pushing the wedge and the frontier off-screen. 2× at (0.35, 0.35) is
the gentlest crop that fully covers every viewport shape from 320×568 to 3840×2160.
Set `ZOOM = 1` and both anchors to `0.5` to frame the whole silhouette instead.

To retune, edit the constants at the top of `collatz.js` (`EVEN_TURN`, `ODD_TURN`,
`MAX_DEPTH`, `START_HEADING`, `GROW_MS`, `ZOOM`, `ANCHOR_X`, `ANCHOR_Y`). Keep
`collatz.py` in step and re-run it to refresh the `<noscript>` fallback — note the
fallback is plain `background-size: cover`, so it shows the whole uncropped
silhouette rather than the zoomed framing:

```sh
python3 collatz.py
```

Opacity is set per theme via the `--coral` custom property in `style.css`. If you
raise it, keep link contrast at or above WCAG AA (4.5:1). The growth is skipped
under `prefers-reduced-motion`, which renders the finished tree immediately.

## Local preview

```sh
python3 -m http.server 8000
```

Then open http://localhost:8000

## Deploy

Push to `main`. GitHub Pages redeploys in ~1 minute.
