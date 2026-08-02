# nathankim.me

Personal website. Static HTML/CSS, no build step, deployed via GitHub Pages.

## Files

- `index.html` — the page
- `style.css` — styles
- `CNAME` — tells GitHub Pages to serve at `nathankim.me` (do not delete)
- `.nojekyll` — skips Jekyll processing so files starting with `_` are served as-is

## Local preview

```sh
python3 -m http.server 8000
```

Then open http://localhost:8000

## Deploy

Push to `main`. GitHub Pages redeploys in ~1 minute.
