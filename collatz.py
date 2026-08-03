#!/usr/bin/env python3
"""Generate collatz.svg — the background artwork.

The Collatz conjecture: from any positive integer n, repeat n -> n/2 when n is
even and n -> 3n+1 when it is odd, and you always fall to 1. Nobody has proved
it. This draws the *reverse* of that process as a tree rooted at 1: every node m
has a child 2m, and additionally a child (m-1)/3 whenever that is an odd integer
greater than 1. Every number whose Collatz sequence is short enough appears in it.

The tree is then walked as turtle graphics. Each edge is one step, and the
heading rotates by EVEN_TURN on a halving step or ODD_TURN on a 3n+1 step.
Halvings vastly outnumber odd steps, so the trunk curves gently while the rare
odd steps fling off branches -- which is what gives the structure its coral look.

Ink is graded by depth, heavy on the near branches and almost transparent at the
tips, which is what dissolves the frontier where every branch stops at the same
distance. Chains are cut at the band boundaries so each path carries one weight,
and the caps are butt so those cuts do not bead the strand.

This is the offline twin of collatz.js, and the constants below have to be kept
in step with it. It renders the same crop the script does, so `background-size:
cover` on the fallback lands close to what the browser would have drawn.

Usage:  python3 collatz.py  (rewrites collatz.svg in place)
"""
import math

EVEN_TURN = 8.0        # degrees, rotation on an n -> n/2 step
ODD_TURN = -20.0       # degrees, rotation on an n -> 3n+1 step
MAX_DEPTH = 32         # tree depth; growth is ~1.3x per level
START_HEADING = 170.0  # orients the whole drawing to a landscape bounding box
PAD = 0.03

ZOOM = 2.0             # scale past the fit, to push the bare wedge off-frame
ANCHOR_X = 0.33        # point of the bounding box pinned to the frame's centre
ANCHOR_Y = 0.36

BANDS = 12             # depth bands, root end to tip end
NEAR_WIDTH, FAR_WIDTH = 2.4, 0.55
NEAR_ALPHA, FAR_ALPHA = 0.62, 0.10
RAMP = 1.6

INK = "#28303a"        # near-black with a cool cast; matches --ink in style.css
FRAME_W, FRAME_H = 1600, 1000   # the crop this is rendered for, at 16:10


def build():
    """Grow the reverse Collatz tree, returning coords, adjacency and depths."""
    even, odd = math.radians(EVEN_TURN), math.radians(ODD_TURN)
    xs, ys, kids, depth = [0.0], [0.0], [[]], [0]
    stack = [(1, 0, math.radians(START_HEADING), 0)]
    while stack:
        m, i, heading, d = stack.pop()
        if d >= MAX_DEPTH:
            continue
        steps = [(2 * m, even)]
        if (m - 1) % 3 == 0:
            k = (m - 1) // 3
            if k > 1 and k % 2 == 1:      # k must be an odd integer above the 4-2-1 cycle
                steps.append((k, odd))
        for value, turn in steps:
            h = heading + turn
            xs.append(xs[i] + math.cos(h))
            ys.append(ys[i] + math.sin(h))
            kids.append([])
            depth.append(d + 1)
            kids[i].append(len(xs) - 1)
            stack.append((value, len(xs) - 1, h, d + 1))
    return xs, ys, kids, depth


def chains(kids):
    """Collapse runs of single-child nodes into polylines, so the SVG stays small."""
    out, stack = [], [(0, [0])]
    while stack:
        i, pts = stack.pop()
        c = kids[i]
        if len(c) == 1:
            pts.append(c[0])
            stack.append((c[0], pts))
        else:
            if len(pts) >= 2:
                out.append(pts)
            for j in c:
                stack.append((j, [i, j]))
    return out


def band(d):
    return min(BANDS - 1, d * BANDS // (MAX_DEPTH + 1))


def slice_bands(polys, depth):
    """Cut each chain where it crosses into the next band, so each piece carries
    one weight. The boundary node goes to the piece on either side of it, so the
    two abut exactly -- see the butt-cap note in render() for why they must not
    overlap by so much as a cap."""
    out = []
    for pts in polys:
        start, b = 0, band(depth[pts[0]])
        for i in range(1, len(pts)):
            nb = band(depth[pts[i]])
            if nb == b:
                continue
            out.append(pts[start:i + 1])
            start, b = i, nb
        if len(pts) - start >= 2:
            out.append(pts[start:])
    return out


def render(xs, ys, kids, depth):
    polys = slice_bands(chains(kids), depth)
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    bw, bh = x1 - x0, y1 - y0
    pad = PAD * max(bw, bh)
    # Cover the frame the way the script covers the viewport, then zoom in on the
    # anchor. y is flipped: SVG's axis grows downward.
    s = max(FRAME_W / (bw + 2 * pad), FRAME_H / (bh + 2 * pad)) * ZOOM
    ox = FRAME_W / 2 - (x0 + bw * ANCHOR_X) * s
    oy = FRAME_H / 2 + (y1 - bh * ANCHOR_Y) * s

    by_band = [[] for _ in range(BANDS)]
    for pts in polys:
        by_band[band(depth[pts[0]])].append(pts)

    paths = []
    for b, group in enumerate(by_band):
        if not group:
            continue
        f = (b / (BANDS - 1)) ** RAMP if BANDS > 1 else 0.0
        width = NEAR_WIDTH + (FAR_WIDTH - NEAR_WIDTH) * f
        alpha = NEAR_ALPHA + (FAR_ALPHA - NEAR_ALPHA) * f
        d = "".join(
            "M" + " ".join(f"{xs[i]*s+ox:.1f} {oy-ys[i]*s:.1f}" for i in pts)
            for pts in group
        )
        paths.append(
            f'<path d="{d}" stroke-width="{width:.2f}" stroke-opacity="{alpha:.3f}"/>'
        )

    body = "".join(paths)
    return (
        # Butt caps, deliberately: two pieces meet at every branch and every band
        # boundary, and round caps would composite two half-discs of ink there and
        # bead the strand with a dark dot at each joint.
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {FRAME_W} {FRAME_H}">'
        f'<g fill="none" stroke="{INK}" stroke-linecap="butt" '
        f'stroke-linejoin="round">{body}</g></svg>\n'
    ), sum(len(q) - 1 for q in polys)


if __name__ == "__main__":
    svg, segments = render(*build())
    with open("collatz.svg", "w") as f:
        f.write(svg)
    print(f"collatz.svg  {segments} segments  {FRAME_W}x{FRAME_H}  {len(svg)/1024:.1f} KB")
