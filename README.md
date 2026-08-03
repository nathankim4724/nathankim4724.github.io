# nathankim.me

Personal website. Static HTML/CSS, no build step, deployed via GitHub Pages.

## Files

- `index.html` — the page
- `style.css` — styles
- `nathan.jpg` — portrait, 512px square, metadata stripped
- `collatz.svg` — the background artwork (generated, see below)
- `collatz.py` — regenerates `collatz.svg`; not part of the build
- `CNAME` — tells GitHub Pages to serve at `nathankim.me` (do not delete)
- `.nojekyll` — skips Jekyll processing so files starting with `_` are served as-is

## The background

`collatz.svg` is the reverse Collatz tree rooted at 1, drawn as turtle graphics:
every node `m` has a child `2m`, plus `(m-1)/3` when that is an odd integer above
1. Walking it, the heading turns 8° on a halving step and −20° on a `3n+1` step.
Halvings outnumber odd steps, so the trunk curves gently while the rare odd steps
throw off branches — hence the coral.

To retune it, edit the constants at the top of `collatz.py` and run:

```sh
python3 collatz.py
```

Opacity is set per theme via the `--coral` custom property in `style.css`. If you
raise it, keep link contrast at or above WCAG AA (4.5:1).

## Local preview

```sh
python3 -m http.server 8000
```

Then open http://localhost:8000

## Deploy

Push to `main`. GitHub Pages redeploys in ~1 minute.
