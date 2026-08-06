#!/usr/bin/env python3
"""Turn the camera originals in photography/originals/ into the web copies the
site actually serves, in photography/photos/, then rebuild the manifest.

    python3 optimize_photography.py           # only what has changed
    python3 optimize_photography.py --all     # redo everything

Two things happen to each photograph on the way across:

  size      the long edge comes down to 2400px at quality 82. The gallery shows
            a frame around 360px wide and the lightbox rarely more than 1200,
            so 2400 is still a comfortable margin -- and it is the difference
            between a page that weighs 45 MB and one that weighs about 4.

  metadata  EXIF is dropped: GPS coordinates, timestamps, camera serial. One of
            these files was tagged with the exact spot it was taken from, which
            is not something to hand out with a photograph of the ocean. The
            colour profile is kept, since it carries nothing personal and the
            colours are wrong without it.

The originals are never touched, and originals/ is kept out of git -- it is your
copy of the photographs, not the site's.

Resizing is done by sips, which ships with macOS. On anything else, export web
copies yourself into photography/photos/ and just run build_photography.py.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

import build_photography

ROOT = Path(__file__).parent
ORIGINALS = ROOT / "photography" / "originals"
WEB = ROOT / "photography" / "photos"

LONG_EDGE = 2400
QUALITY = 82

# APP1 holds EXIF and XMP; APP13 holds the Photoshop/IPTC block; COM is a free
# text comment. APP2 (the ICC colour profile) and APP0 (JFIF) stay.
STRIP = set(range(0xE1, 0xF0)) - {0xE2} | {0xFE}


def strip_metadata(path: Path) -> int:
    """Rewrite a JPEG in place without its metadata segments. Returns bytes saved.

    A JPEG is a run of marker segments up to the start of scan, after which it is
    compressed image data to the end. So: copy the segments worth keeping, then
    copy the rest of the file verbatim.
    """
    data = path.read_bytes()
    if data[:2] != b"\xff\xd8":
        return 0

    out = bytearray(b"\xff\xd8")
    i, reached_scan = 2, False
    while i < len(data) - 1 and data[i] == 0xFF:
        marker = data[i + 1]
        if marker == 0xDA:  # start of scan -- the image itself follows
            out += data[i:]
            reached_scan = True
            break
        length = int.from_bytes(data[i + 2:i + 4], "big")
        if marker not in STRIP:
            out += data[i:i + 2 + length]
        i += 2 + length

    # Anything unexpected and the file goes back untouched rather than truncated.
    if not reached_scan:
        return 0

    saved = len(data) - len(out)
    path.write_bytes(bytes(out))
    return saved


def main() -> int:
    if not ORIGINALS.is_dir():
        print(f"No {ORIGINALS} folder. Put the camera originals there.", file=sys.stderr)
        return 1

    force = "--all" in sys.argv
    WEB.mkdir(exist_ok=True)

    originals = sorted(
        p for p in ORIGINALS.iterdir()
        if p.is_file() and p.suffix.lower() in build_photography.EXTENSIONS
        and not p.name.startswith(".")
    )
    if not originals:
        print(f"Nothing in {ORIGINALS}.", file=sys.stderr)
        return 1

    # Everything comes out as .jpg, lower case: the web copies are all JPEG, and
    # a stray .JPG is one deploy away from a 404 on a case-sensitive server.
    wanted = {p: WEB / (p.stem + ".jpg") for p in originals}
    made = 0

    for original, copy in wanted.items():
        if not force and copy.exists() and copy.stat().st_mtime >= original.stat().st_mtime:
            continue
        result = subprocess.run(
            ["sips", "-Z", str(LONG_EDGE), "-s", "format", "jpeg",
             "-s", "formatOptions", str(QUALITY), str(original), "--out", str(copy)],
            capture_output=True, text=True,
        )
        if result.returncode != 0 or not copy.exists():
            print(f"  could not convert {original.name}: {result.stderr.strip()}",
                  file=sys.stderr)
            continue
        strip_metadata(copy)
        before, after = original.stat().st_size, copy.stat().st_size
        print(f"  {original.name:34} {before / 1e6:5.1f} MB -> {after / 1e6:5.2f} MB")
        made += 1

    # A web copy whose original has gone should go too, or it lingers in the
    # gallery with nothing behind it.
    keep = {c.name for c in wanted.values()}
    for stale in WEB.iterdir():
        if stale.is_file() and not stale.name.startswith(".") and stale.name not in keep:
            print(f"  removing {stale.name}, no longer in originals/")
            stale.unlink()

    print(f"{made} converted, {len(wanted)} in {WEB}")
    return build_photography.main()


if __name__ == "__main__":
    raise SystemExit(main())
