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

Usage:  python3 collatz.py  (rewrites collatz.svg in place)
"""
import math

EVEN_TURN = 8.0     # degrees, rotation on an n -> n/2 step
ODD_TURN = -20.0    # degrees, rotation on an n -> 3n+1 step
MAX_DEPTH = 32      # tree depth; growth is ~1.3x per level
START_HEADING = 170.0  # orients the whole drawing to a landscape bounding box
STROKE = "#808080"  # mid grey, so one file suits both light and dark themes
STROKE_WIDTH = 1.8
BOX = 2000          # longest side of the viewBox, before padding
PAD = 0.03


def build():
    """Grow the reverse Collatz tree, returning point coords and adjacency."""
    even, odd = math.radians(EVEN_TURN), math.radians(ODD_TURN)
    xs, ys, kids = [0.0], [0.0], [[]]
    stack = [(1, 0, math.radians(START_HEADING), 0)]
    while stack:
        m, i, heading, depth = stack.pop()
        if depth >= MAX_DEPTH:
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
            kids[i].append(len(xs) - 1)
            stack.append((value, len(xs) - 1, h, depth + 1))
    return xs, ys, kids


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


def render(xs, ys, kids):
    polys = chains(kids)
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    s = BOX / max(x1 - x0, y1 - y0)
    p = BOX * PAD
    w, h = round((x1 - x0) * s + 2 * p), round((y1 - y0) * s + 2 * p)
    # y is flipped: SVG's axis grows downward.
    d = "".join(
        "M" + " ".join(f"{round((xs[i]-x0)*s+p)} {round((y1-ys[i])*s+p)}" for i in pts)
        for pts in polys
    )
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}">'
        f'<path d="{d}" fill="none" stroke="{STROKE}" stroke-width="{STROKE_WIDTH}" '
        f'stroke-linecap="round" stroke-linejoin="round"/></svg>\n'
    ), sum(len(q) - 1 for q in polys), w, h


if __name__ == "__main__":
    svg, segments, w, h = render(*build())
    with open("collatz.svg", "w") as f:
        f.write(svg)
    print(f"collatz.svg  {segments} segments  {w}x{h}  {len(svg)/1024:.1f} KB")
