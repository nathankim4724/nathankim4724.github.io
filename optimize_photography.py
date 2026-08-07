#!/usr/bin/env python3
"""Turn the camera originals in photography/originals/ into the web copies the
site actually serves, in photography/photos/, then rebuild the manifest.

    python3 optimize_photography.py           # only what has changed
    python3 optimize_photography.py --all     # redo everything

Every photograph comes across as a ladder of widths in three formats, because
the browser should never have to download more picture than it is about to
draw. A frame 360px wide in the gallery takes the 800px rung on a retina screen;
the same photograph opened in the lightbox takes the 3200px one. Before this,
both took a single 2400px JPEG -- which made the gallery ten times heavier than
it needed to be and, on a 2x display, left the lightbox *upscaling* a file that
was smaller than the space it was being drawn into. That was the softness.

  widths    LADDER below, stopping at the original's own size so nothing is ever
            enlarged, and at MAX_EDGE so neither side runs past 3840. That covers
            a 4K display showing the lightbox full screen; with the originals at
            6192px there is room to raise it, but past 4K the file size stops
            buying anything you can see.

  formats   AVIF, then WebP, then JPEG. The page offers all three and the
            browser takes the first it understands, so a modern one gets AVIF at
            roughly half the bytes of the JPEG and the JPEG stays for anything
            that does not. Quality is set high in all three (AVIF 78 at 4:4:4,
            JPEG 92 at 4:4:4) -- delivering the right *size* is what saves the
            bytes here, so there is no reason to lean on the quality number too.

  sharpen   every downsize softens an image; a light unsharp mask afterwards is
            what photo pipelines do about it and what `sips -Z` never did.

  metadata  EXIF is dropped: GPS coordinates, timestamps, camera serial. One of
            these files was tagged with the exact spot it was taken from, which
            is not something to hand out with a photograph of the ocean. The
            orientation flag is applied to the pixels first, so dropping it does
            not turn anything on its side. The colour profile is kept -- it
            carries nothing personal and the colours are wrong without it.

Files come out named `<slug>-<width>.<ext>`, and the sidecar variants.json tells
build_photography.py what was made. The originals are never touched, and
originals/ is kept out of git -- it is your copy of the photographs, not the
site's.

Needs Pillow (`pip3 install pillow`), which does the resizing, the sharpening
and all three encoders. Nothing else, and nothing platform-specific.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

try:
    from PIL import Image, ImageFilter, ImageOps, features
except ImportError:
    print("Pillow is needed for this: pip3 install pillow", file=sys.stderr)
    raise SystemExit(1)

import build_photography

ROOT = Path(__file__).parent
ORIGINALS = ROOT / "photography" / "originals"
WEB = ROOT / "photography" / "photos"
SIDECAR = WEB / "variants.json"

# Rungs, as widths. Spaced about 1.4x apart, which is close enough together that
# the browser never has to round up by much and far enough apart that the folder
# does not double in size for nothing.
#
# Widths, specifically, because that is the only thing a srcset can be told: a
# candidate is described by its width and `sizes` answers in widths. Laddering
# by long edge instead would have every portrait file advertising a width it did
# not have -- a 2160x3840 copy claiming to be 3840 wide -- and the browser would
# pick a rung less than half the size it needed, which is the exact softness
# this is all meant to fix.
LADDER = (400, 800, 1200, 1800, 2400, 3200, 3840)

# Neither side goes past this. Capping the width alone would let an upright
# photograph reach 3840 across and nearly 7000 down: a file no display has the
# height to show and nobody would ever be served.
MAX_EDGE = 3840

# AVIF first: best quality per byte, and every browser since about 2022 reads
# it. WebP behind it for the couple of Safari versions that do not. JPEG last.
#
# JPEG only gets three rungs, and that is deliberate. It is the fallback for a
# browser that reads neither of the other two -- which in practice means almost
# nobody -- so a full ladder of it was 69 MB of repository that no visitor was
# ever going to fetch. Three rungs keep the fallback genuinely usable at any
# size without paying for the other four. Nothing anyone actually sees changes.
LADDERS = {
    "avif": LADDER,
    "webp": LADDER,
    "jpg": (800, 1800, 2400),
}
FORMATS = ("avif", "webp", "jpg")

SOURCE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".tif", ".tiff", ".heic", ".heif"}


def slugify(stem: str) -> str:
    """`Sun Rays` -> `sun-rays`. Spaces in a filename mean escaping in every URL
    that points at it, and a stray capital is one deploy away from a 404 on a
    case-sensitive server."""
    slug = re.sub(r"[^a-z0-9]+", "-", stem.lower()).strip("-")
    return slug or "photo"


def widest(source_w: int, source_h: int) -> int:
    """The largest width worth making: the original's own, shrunk if that would
    put either side past MAX_EDGE. Never larger than the source -- enlarging a
    photograph adds bytes and no detail."""
    fit = min(1.0, MAX_EDGE / source_w, MAX_EDGE / source_h)
    return max(1, round(source_w * fit))


def widths_for(top: int, rungs: tuple[int, ...] = LADDER,
               include_top: bool = True) -> list[int]:
    """The rungs below the widest copy, and usually that copy itself.

    `include_top` is what separates the formats people are served from the one
    they are not. AVIF and WebP need the full-size copy -- that is the whole
    point of the exercise. JPEG does not: carrying a 2 MB fallback of every
    landscape photograph for the benefit of a browser that reads neither of the
    other two, and which would be handed a perfectly good 2400px copy instead,
    is 26 MB of repository for nothing. A photograph too small to reach even the
    first rung still gets one copy, or it would have none at all."""
    below = {w for w in rungs if w < top}
    if include_top or not below:
        below.add(top)
    return sorted(below)


def average_colour(im: Image.Image) -> str:
    """One colour to sit behind the frame until the photograph arrives, so the
    gallery reads as a page of photographs from the first paint rather than a
    page of grey rectangles."""
    r, g, b = im.convert("RGB").resize((1, 1), Image.Resampling.LANCZOS).getpixel((0, 0))
    return f"#{r:02x}{g:02x}{b:02x}"


def render(master: Image.Image, width: int, height: int) -> Image.Image:
    """One rung, resampled and sharpened.

    Lanczos is the highest-quality filter Pillow offers for going down, and the
    unsharp mask afterwards puts back the edge definition that any downsample
    takes off. It is deliberately gentle -- a heavier hand looks crisp on one
    photograph and crunchy on the next -- and it leans on the ones that have been
    reduced the furthest, which are the ones that lost the most."""
    if (width, height) == master.size:
        return master

    out = master.resize((width, height), Image.Resampling.LANCZOS)
    shrink = width / master.width
    return out.filter(ImageFilter.UnsharpMask(
        radius=0.7, percent=70 if shrink < 0.5 else 55, threshold=2))


def encode(im: Image.Image, path: Path, fmt: str, icc: bytes | None) -> None:
    """Write one rung in one format. No EXIF is passed, so none is written."""
    common = {"icc_profile": icc} if icc else {}

    if fmt == "avif":
        # 4:4:4 keeps the colour at full resolution. Chroma subsampling is
        # usually invisible, but a saturated sky at sunset is exactly where it
        # stops being, and AVIF is efficient enough to carry the cost.
        im.save(path, format="AVIF", quality=78, speed=5, subsampling="4:4:4", **common)
    elif fmt == "webp":
        im.save(path, format="WEBP", quality=90, method=6, **common)
    else:
        # Progressive so it resolves top-to-bottom instead of arriving in a
        # block, and 4:4:4 for the same reason as the AVIF.
        im.save(path, format="JPEG", quality=92, subsampling=0,
                optimize=True, progressive=True, **common)


def main() -> int:
    if not ORIGINALS.is_dir():
        print(f"No {ORIGINALS} folder. Put the camera originals there.", file=sys.stderr)
        return 1

    for fmt in ("avif", "webp"):
        if not features.check(fmt):
            print(f"This Pillow was built without {fmt.upper()} support.", file=sys.stderr)
            return 1

    force = "--all" in sys.argv
    WEB.mkdir(parents=True, exist_ok=True)

    originals = sorted(
        p for p in ORIGINALS.iterdir()
        if p.is_file() and p.suffix.lower() in SOURCE_EXTENSIONS
        and not p.name.startswith(".")
    )
    if not originals:
        print(f"Nothing in {ORIGINALS}.", file=sys.stderr)
        return 1

    known = {}
    if SIDECAR.exists():
        try:
            known = {e["name"]: e for e in json.loads(SIDECAR.read_text())}
        except (ValueError, KeyError, TypeError):
            known = {}

    entries, expected = [], {SIDECAR.name}
    taken: dict[str, Path] = {}
    built = 0

    for original in originals:
        slug = slugify(original.stem)
        # Two originals can slugify the same way -- `Sunset.jpg` and `sunset.JPG`
        # would -- and the second would silently overwrite the first.
        if slug in taken:
            n = 2
            while f"{slug}-{n}" in taken:
                n += 1
            print(f"  {original.name} and {taken[slug].name} share a name; "
                  f"filing this one under {slug}-{n}")
            slug = f"{slug}-{n}"
        taken[slug] = original

        with Image.open(original) as opened:
            # The orientation flag has to be applied to the pixels before the
            # EXIF carrying it is dropped, or half the portraits come out on
            # their side.
            master = ImageOps.exif_transpose(opened)
            icc = opened.info.get("icc_profile")
            if master.mode not in ("RGB", "L"):
                master = master.convert("RGB")

            source_w, source_h = master.size
            top = widest(source_w, source_h)

            sources = {fmt: widths_for(top, LADDERS[fmt], include_top=fmt != "jpg")
                       for fmt in FORMATS}
            # One resize per width, shared by whichever formats want that rung.
            widths = sorted({w for ws in sources.values() for w in ws})

            files = {f"{slug}-{w}.{fmt}" for fmt in FORMATS for w in sources[fmt]}
            expected |= files

            entry = {
                "name": slug,
                "width": source_w,
                "height": source_h,
                "sources": sources,
                "color": known.get(slug, {}).get("color"),
            }

            # Nothing to do if every rung is already there and newer than the
            # original it came from.
            stamp = original.stat().st_mtime
            fresh = (
                not force
                and all((WEB / name).exists() and (WEB / name).stat().st_mtime >= stamp
                        for name in files)
                and known.get(slug, {}).get("sources") == sources
                and entry["color"]
            )
            if fresh:
                entries.append(entry)
                continue

            entry["color"] = average_colour(master)

            written = 0
            for w in widths:
                rung = render(master, w, max(1, round(source_h * w / source_w)))
                for fmt in FORMATS:
                    if w not in sources[fmt]:
                        continue
                    encode(rung, WEB / f"{slug}-{w}.{fmt}", fmt, icc)
                    written += (WEB / f"{slug}-{w}.{fmt}").stat().st_size
                if rung is not master:
                    rung.close()

            print(f"  {original.name:34} {original.stat().st_size / 1e6:5.1f} MB -> "
                  f"{len(files)} files, {written / 1e6:.1f} MB total, "
                  f"largest {widths[-1]}px")
            entries.append(entry)
            built += 1

    # A web copy whose original has gone should go too, or it lingers in the
    # gallery with nothing behind it.
    for stale in sorted(WEB.iterdir()):
        if stale.is_file() and not stale.name.startswith(".") and stale.name not in expected:
            print(f"  removing {stale.name}, no longer in originals/")
            stale.unlink()

    SIDECAR.write_text(json.dumps(entries, indent=2) + "\n", encoding="utf-8")

    print(f"{built} rebuilt, {len(entries)} photographs in {WEB}")
    return build_photography.main()


if __name__ == "__main__":
    raise SystemExit(main())
