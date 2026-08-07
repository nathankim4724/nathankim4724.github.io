/* Builds the gallery from the manifest in photos.js and runs the lightbox.
   Everything here degrades quietly: with no manifest the page says so, and with
   no JavaScript at all the header, the heading, and the way back still work. */

(function () {
  "use strict";

  var photos = Array.isArray(window.PHOTOS) ? window.PHOTOS : [];
  var gallery = document.getElementById("gallery");
  var empty = document.getElementById("empty");

  if (!photos.length) {
    gallery.hidden = true;
    empty.hidden = false;
    return;
  }

  /* ---- what a photograph is available as --------------------------------- */

  /* Each photograph exists as a ladder of widths in three formats -- see
     optimize_photography.py. The manifest lists what was made; these turn that
     into the markup that lets a browser download exactly one of them.

     The whole point is that the file fetched matches the space it is drawn
     into. A frame 360px wide on a 2x screen needs 720px of picture and takes
     the 800px rung; the same photograph opened full screen takes the 3200px
     one. `sizes` is what tells the browser which -- and because the rows here
     are justified rather than gridded, no CSS-shaped guess would be right, so
     the real measured width is handed over during layout instead. */

  var MIME = { avif: "image/avif", webp: "image/webp", jpg: "image/jpeg" };
  var TYPES = ["avif", "webp", "jpg"]; /* best first: the browser takes the first it reads */

  function ladder(photo, type) {
    var sources = photo.sources || {};
    return sources[type || "avif"] || [];
  }

  function srcset(photo, type) {
    return ladder(photo, type).map(function (w) {
      return "photos/" + photo.name + "-" + w + "." + type + " " + w + "w";
    }).join(", ");
  }

  /* The plain <img> src, for anything that ignores srcset entirely. A middle
     rung: large enough not to look broken, small enough not to punish a browser
     old enough to be asking for it. */
  function fallback(photo) {
    var widths = ladder(photo, "jpg");
    if (!widths.length) return photo.src || "";
    return "photos/" + photo.name + "-" +
      widths[Math.min(widths.length - 1, Math.floor(widths.length / 2))] + ".jpg";
  }

  /* A <picture> offering every format, with the <img> inside it left without a
     source for now: `sizes` has to be set before the fetch starts, and the
     width it should say is not known until the row it lands in has been packed.
     Attaching an unsourced image to the page costs nothing. */
  function picture(photo) {
    var el = document.createElement("picture");
    var sources = {};

    TYPES.forEach(function (type) {
      /* JPEG is the <img>'s own srcset, not a <source> -- it is what everything
         falls through to, so it has to be the last resort rather than one of
         the offers ahead of it. */
      if (type === "jpg" || !ladder(photo, type).length) return;
      var source = document.createElement("source");
      source.type = MIME[type];
      sources[type] = source;
      el.appendChild(source);
    });

    var img = document.createElement("img");
    el.appendChild(img);
    return { el: el, img: img, sources: sources };
  }

  /* Point an already-built <picture> at a given display width. Called the first
     time a frame is laid out and again whenever the window moves: raising the
     figure means the browser may fetch a sharper rung, and lowering it is free,
     since a browser never downgrades a picture it already holds. */
  function serve(parts, photo, cssWidth) {
    var px = Math.max(1, Math.round(cssWidth));
    if (parts.at === px) return;
    parts.at = px;

    /* A manifest from before the ladder existed: one file, one size, nothing to
       choose between. */
    if (!ladder(photo, "jpg").length && !ladder(photo, "avif").length) {
      if (!parts.img.src) parts.img.src = photo.src || "";
      return;
    }

    /* Every candidate set needs its own `sizes`. A <source> without one falls
       back to 100vw, so the AVIF -- the one almost every visitor actually gets
       -- would be picked as though it were running the full width of the
       window, and setting it on the <img> alone would fix only the fallback
       nobody fetches. */
    parts.img.sizes = px + "px";
    TYPES.forEach(function (type) {
      var source = parts.sources[type];
      if (!source) return;
      source.sizes = px + "px";
      if (!source.srcset) source.srcset = srcset(photo, type);
    });
    if (!parts.img.srcset) {
      parts.img.srcset = srcset(photo, "jpg");
      parts.img.src = fallback(photo);
    }
  }

  /* Frames below the fold are held back until the reader is on their way to
     them, and this is what decides when that is.

     `loading="lazy"` would be the obvious way to do it and does not work here:
     an <img> inside a <picture> whose sources are attached from script is never
     picked up by Chrome's deferral -- the fetch is postponed as asked and then
     nothing ever resumes it, so the frame stays blank however far you scroll. A
     bare <img> with the same srcset is fine; put it in a <picture> and it is
     not. Watching for the frame ourselves and handing it its sources at that
     moment sidesteps the whole question, and suits this gallery anyway: a
     photograph must not be given a source before the width it will be drawn at
     is known, and that is not known until its row has been packed.

     The margin is what turns "visible" into "on the way": a frame starts
     loading a screenful or so before it is reached, so scrolling at a normal
     pace never catches one still arriving. */
  var watcher = typeof IntersectionObserver === "function"
    ? new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          watcher.unobserve(entry.target);
          var tile = entry.target.tile;
          if (tile) serve(tile.parts, tile.photo, tile.drawn);
        });
      }, { rootMargin: "900px 0px" })
    : null;

  /* ---- gallery ---------------------------------------------------------- */

  var thumbnails = []; /* so the lightbox can hand focus back to one of them */
  var tiles = []; /* one per figure: the element, its shape, and whether it lives */

  photos.forEach(function (photo, i) {
    var figure = document.createElement("figure");

    var button = document.createElement("button");
    button.type = "button";
    button.setAttribute("aria-label", "Open " + (photo.caption || photo.alt || "photograph") + " full size");
    button.addEventListener("click", function () { open(i); });
    thumbnails.push(button);

    var parts = picture(photo);
    var img = parts.img;
    img.alt = photo.alt || photo.caption || "";
    img.decoding = "async";
    /* No `loading` attribute: holding a frame back is done by withholding its
       sources until it is wanted, which is both stricter than the browser's own
       deferral and the only thing that works here -- see `watcher` below. */

    if (photo.width && photo.height) {
      img.width = photo.width;
      img.height = photo.height;
      img.style.setProperty("--ratio", photo.width + " / " + photo.height);
    }
    /* The photograph's own average colour behind the frame, so the gallery
       reads as a page of photographs from the first paint instead of a page of
       grey rectangles, and the fade in lands on something close to the picture
       rather than jumping off a flat panel. */
    if (photo.color) img.style.background = photo.color;

    var tile = {
      figure: figure,
      parts: parts,
      photo: photo,
      /* Landscape by default: a file whose header the build script could not
         read still has to be given some width to sit in. */
      ratio: photo.width && photo.height ? photo.width / photo.height : 1.5,
      dead: false
    };
    tiles.push(tile);

    img.addEventListener("load", function () { img.classList.add("loaded"); });
    /* A photograph that fails to load should not leave a grey rectangle
       sitting in the row forever -- and the row it was holding open has to be
       packed again without it. */
    img.addEventListener("error", function () {
      tile.dead = true;
      figure.remove();
      layout(true);
    });

    button.appendChild(parts.el);
    figure.appendChild(button);

    if (photo.caption) {
      var caption = document.createElement("figcaption");
      caption.textContent = photo.caption;
      figure.appendChild(caption);
    }
  });

  /* ---- the arrangement --------------------------------------------------- */

  /* Every row is justified to the full measure and holds at least two frames,
     with both shapes represented wherever the gallery has both to give. What
     varies is how many frames a row holds: the target is re-rolled for each
     one, so the page never settles into a grid. The rolls come from a seeded
     generator rather than Math.random: the arrangement should be a property of
     the gallery, the same on every visit and the same after a resize, not a
     fresh shuffle each time the page is opened. */
  function seeded(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* How much combined aspect ratio a row is aiming for, and how many frames it
     may hold. The ranges straddle the totals a mixed row lands on -- a wide
     frame and an upright one come to about 2.3, a third frame takes it past 4
     -- so the roll decides between a shorter row of two and a longer row of
     three or four, and the rhythm keeps changing down the page.

     Two frames is the floor at every width a row is worth having: a photograph
     alone in the middle of a wide page reads as an accident. A phone is the one
     exception, and `min` is where it is made -- paired up on a 375px screen a
     landscape frame is 120px tall, which is a contact sheet rather than a
     gallery, so there each photograph takes the column to itself. */
  function shape(width) {
    if (width >= 1500) return { low: 2.6, high: 4.7, min: 2, max: 4 };
    if (width >= 1150) return { low: 2.3, high: 4.1, min: 2, max: 4 };
    if (width >= 820) return { low: 2.2, high: 3.9, min: 2, max: 3 };
    if (width >= 560) return { low: 2.0, high: 3.3, min: 2, max: 3 };
    return { low: 0.95, high: 1.7, min: 1, max: 1 };
  }

  function wide(tile) { return tile.ratio >= 1; }

  function total(row) {
    return row.reduce(function (sum, tile) { return sum + tile.ratio; }, 0);
  }

  /* Deal the two orientations out evenly into one sequence -- upright, wide,
     upright, wide -- so that packing the sequence in order picks up a mix in
     every row instead of stacking five uprights side by side. Each frame is
     placed at the point its own share of its orientation falls due, which keeps
     the spread even when the counts are lopsided. */
  function interleave(live) {
    var wides = live.filter(wide);
    var talls = live.filter(function (tile) { return !wide(tile); });
    if (!wides.length || !talls.length) return live.slice();

    var out = [];
    var w = 0;
    var t = 0;
    while (w < wides.length || t < talls.length) {
      var takeWide = t >= talls.length ||
        (w < wides.length && (w + 0.5) / wides.length <= (t + 0.5) / talls.length);
      out.push(takeWide ? wides[w++] : talls[t++]);
    }
    return out;
  }

  /* Walk the sequence, closing a row when its combined ratio is nearer the
     target than it would be with one more frame in it -- and never before the
     row holds `size.min` frames or enough width to fill the measure. */
  function pack(seq, size, rand, minSum) {
    /* `run` is the length two rows have just repeated, if they have: a grid is
       starting to form, so the roll leans to the other half of the range and
       the next row comes out a different length. */
    function roll(run) {
      var r = rand();
      if (run) r = run <= 2 ? 0.5 + r * 0.5 : r * 0.5;
      return Math.max(minSum, size.low + r * (size.high - size.low));
    }

    var rows = [];
    var row = [];
    var sum = 0;
    var target = roll(0);

    function close() {
      rows.push(row);
      var n = rows.length;
      row = [];
      sum = 0;
      target = roll(n >= 2 && rows[n - 1].length === rows[n - 2].length ? rows[n - 1].length : 0);
    }

    seq.forEach(function (tile) {
      var next = sum + tile.ratio;
      /* Overshooting the target squeezes the whole row. If stopping short of it
         lands closer, close the row here and let this frame open the next --
         but never below the width the row needs to fill the measure. */
      if (row.length >= size.min && sum >= minSum && next >= target && target - sum < next - target) close();

      row.push(tile);
      sum += tile.ratio;

      if (row.length >= size.max || (row.length >= size.min && sum >= target)) close();
    });

    if (row.length) rows.push(row);
    return rows;
  }

  /* The tail is the one place the packing cannot help itself: it takes what is
     left. A frame left over on its own joins the row above, or -- if that row
     is already full -- borrows one from it, so neither ends up alone. */
  function settle(rows, size) {
    if (rows.length < 2) return rows;

    if (size.min > 1 && rows[rows.length - 1].length === 1) {
      var orphan = rows.pop()[0];
      var above = rows[rows.length - 1];
      /* Room above, or a row of two that can be stretched to three: take it in.
         Only a row that would be left as thin as the orphan hands one back --
         on a phone, where two frames is the cap, a last row of three is the
         price of never leaving one on its own. */
      if (above.length < Math.max(size.max, 3)) above.push(orphan);
      else rows.push([above.pop(), orphan]);
    }

    return rows;
  }

  /* A row that has been given a frame, or had one taken, may no longer hold
     enough width to reach the measure at a sane height -- and the tail row
     never had a say in how much it was left. Borrow from a neighbour that can
     spare one: it has to keep its own width and its own second frame, so a
     borrow never trades one short row for another. What cannot be repaired --
     two upright frames and nothing else in the gallery -- is left to the
     ceiling in the layout, which is the one thing that can take width back. */
  function fill(rows, size, minSum) {
    rows.forEach(function (row, i) {
      while (total(row) < minSum && row.length < size.max) {
        var from = [i - 1, i + 1].filter(function (j) {
          var donor = rows[j];
          if (!donor || donor.length <= size.min) return false;
          var facing = j < i ? donor[donor.length - 1] : donor[0];
          return total(donor) - facing.ratio >= minSum;
        })[0];

        if (from === undefined) break;
        if (from < i) row.unshift(rows[from].pop());
        else row.push(rows[from].shift());
      }
    });

    /* Nobody had a frame to spare on its own -- which is the usual state of the
       tail, where the packing simply ran out. Take the row and its neighbour
       together and deal them again. */
    var moved = true;
    var guard = rows.length * 2;
    while (moved && guard-- > 0) {
      moved = rows.some(function (row, i) {
        return total(row) < minSum &&
          ((i > 0 && rebalance(rows, i - 1, size, minSum)) || rebalance(rows, i, size, minSum));
      });
    }
    return rows;
  }

  /* Two rows sharing an edge, poured back together and dealt again: merged
     outright if they fit in one row, otherwise cut at whichever point leaves
     the narrower of the two as wide as it can be. Order is untouched -- the
     frames only change which side of the cut they fall on. */
  function rebalance(rows, j, size, minSum) {
    var a = rows[j];
    var b = rows[j + 1];
    if (!a || !b) return false;

    var both = a.concat(b);
    if (both.length <= size.max) {
      rows.splice(j, 2, both);
      return true;
    }

    var worst = Math.min(total(a), total(b));
    var best = -1;
    var at = 0;

    for (var k = size.min; k <= both.length - size.min; k++) {
      if (k > size.max || both.length - k > size.max) continue;
      var score = Math.min(total(both.slice(0, k)), total(both.slice(k)));
      if (score > best) { best = score; at = k; }
    }

    if (best <= worst + 1e-6) return false; /* no cut does better than the one there */
    rows.splice(j, 2, both.slice(0, at), both.slice(at));
    return true;
  }

  /* Interleaving hands almost every row both shapes; the arithmetic of the
     targets can still leave one all wide or all upright. Trade a frame with a
     neighbour that has one to spare -- it has to keep one of each itself, so
     the swap fixes one row without breaking another, and it may not leave
     either row too narrow to reach the measure. Frames are taken from the
     facing ends, so nothing travels further through the sequence than it must.
     A row with no such neighbour keeps its one shape: the full width is the
     more visible of the two promises. */
  function mix(rows, minSum) {
    rows.forEach(function (row, i) {
      if (row.length < 2) return;
      var shapeOf = wide(row[0]);
      var uniform = row.every(function (tile) { return wide(tile) === shapeOf; });
      if (!uniform) return;

      [i - 1, i + 1].some(function (j) {
        var other = rows[j];
        if (!other) return false;

        var spare = other.filter(function (tile) { return wide(tile) !== shapeOf; });
        if (spare.length < 2) return false; /* it would strand the neighbour */

        var give = j < i ? 0 : row.length - 1;
        var take = other.indexOf(j < i ? spare[spare.length - 1] : spare[0]);
        if (total(row) - row[give].ratio + other[take].ratio < minSum) return false;

        var moved = row[give];
        row[give] = other[take];
        other[take] = moved;
        return true;
      });
    });
    return rows;
  }

  var lastWidth = -1;
  var lastHeight = -1;

  function layout(force) {
    var width = gallery.clientWidth;
    var height = window.innerHeight || 800;
    if (!width) return;
    /* Widths inside a row are proportional, so the row scales itself as the
       window moves. Regrouping is only worth it once the window has moved
       enough to change what fits -- height counts too, since it sets the
       ceiling a row may not grow past. */
    if (!force && Math.abs(width - lastWidth) < 12 && Math.abs(height - lastHeight) < 40) return;
    lastWidth = width;
    lastHeight = height;

    var gap = parseFloat(getComputedStyle(gallery).rowGap) || 20;
    var size = shape(width);
    /* No row taller than most of a screen: a row run out to the full width
       would otherwise be scrolled past rather than looked at. There are two
       ceilings, though, and the slack between them matters -- `aim` is the
       height packing keeps rows under, `maxHeight` is the height at which the
       layout finally gives width back. A row a shade taller than it meant to be
       is a better answer than a row that stops short of the measure, and the
       slack is what lets almost every row reach it. On a phone, where one
       upright frame is the row and the column is the whole screen anyway, both
       lift far enough to leave it alone. */
    var narrow = width < 560;
    var aim = narrow ? Infinity : Math.min(Math.max(height * 0.9, 660), 1050);
    var maxHeight = narrow ? Math.max(height, width * 1.9) : aim * 1.12;
    /* The other side of the aim: how much combined ratio a row needs before it
       can fill the width without growing past it. Rows are packed to at least
       this, so the width almost never has to be given back. */
    var minSum = (width - gap) / aim;
    var rand = seeded(0x9e3779b1);
    var live = tiles.filter(function (tile) { return !tile.dead; });

    /* Every photograph failed to load. Say so rather than leave the page blank. */
    if (!live.length) {
      gallery.hidden = true;
      empty.hidden = false;
      return;
    }

    /* Deal the shapes out, group them into rows, see that no frame is left on
       its own, see that every row can reach the measure, then even out any row
       that came out all one shape. */
    var rows = mix(fill(settle(pack(interleave(live), size, rand, minSum), size), size, minSum), minSum);
    var frag = document.createDocumentFragment();
    var placed = 0; /* how many frames have been dealt so far, in reading order */
    var pending = []; /* [tile, the width it came out at], served once it is in the page */

    rows.forEach(function (row) {
      var el = document.createElement("div");
      el.className = "row";

      var sum = total(row);
      var gaps = gap * (row.length - 1);
      var rowWidth = width;

      /* Rows run the full measure -- that is what justifies them, and it is the
         default for a block in the column. The one thing that can take it back
         is a row so upright that filling the width would make it tower over the
         page; packing avoids that, and this catches what packing could not. */
      if ((width - gaps) / sum > maxHeight) {
        rowWidth = maxHeight * sum + gaps;
        el.style.width = ((rowWidth / width) * 100).toFixed(3) + "%";
      }

      /* Only the proportions between the growth factors matter, so they are
         normalised to add up to two. Left as raw aspect ratios, a row holding
         one upright frame would total less than one -- and flexbox hands out
         only that fraction of the free space, leaving the frame short of the
         width the row had set aside for it. */
      var scale = 2 / sum;
      /* What is left for the frames themselves once the gaps have taken theirs,
         which is the number `sizes` wants: each frame's share of it is the same
         proportion flexbox is about to give it. */
      var free = Math.max(0, rowWidth - gaps);
      row.forEach(function (tile) {
        tile.figure.style.setProperty("--r", (tile.ratio * scale).toFixed(4));

        /* Reading order, which packing has only now settled. The first screenful
           is worth fetching eagerly; the rest can wait until the reader is on
           their way to them. The very first frame is the largest thing on the
           page and almost always what the page's speed is measured by, so it is
           asked for ahead of the stylesheet's other appetites rather than
           queueing behind them. Both have to be set before serve() gives the
           image a source, which is the moment the fetch begins. */
        if (placed === 0) tile.parts.img.setAttribute("fetchpriority", "high");
        placed++;

        pending.push([tile, free * (tile.ratio / sum)]);
        el.appendChild(tile.figure);
      });

      frag.appendChild(el);
    });

    /* One swap at the end: the figures are moved, never rebuilt, so nothing
       is re-fetched and no photograph flashes back to grey. */
    gallery.textContent = "";
    gallery.appendChild(frag);

    /* Only now are the frames given their sources -- the width each one came
       out at is settled, and they are in the document, so `watcher` has
       something real to measure.

       The first few are served outright rather than waited for: they are the
       screenful the reader is already looking at, and going through the
       observer would mean a round of layout before the first photograph was
       even asked for. Anything already fetched is served again too, which does
       not re-fetch -- it just updates `sizes`, so a window that has grown can
       take a sharper rung. */
    pending.forEach(function (each, n) {
      var tile = each[0];
      tile.drawn = each[1];
      if (!watcher || n < 4 || tile.parts.at) {
        serve(tile.parts, tile.photo, tile.drawn);
      } else {
        tile.figure.tile = tile;
        watcher.observe(tile.figure);
      }
    });
  }

  layout(true);

  /* Fonts and scrollbars can settle after first paint and change the width
     under us, so measure once more when everything has landed. */
  addEventListener("load", function () { layout(false); });

  /* Debounced on a timer rather than a frame: requestAnimationFrame is not
     serviced while the tab is in the background or occluded, and a resize that
     happens there would otherwise never be picked up. */
  var timer = 0;
  function relayout() {
    clearTimeout(timer);
    timer = setTimeout(function () { layout(false); }, 120);
  }

  addEventListener("resize", relayout, { passive: true });
  addEventListener("orientationchange", relayout, { passive: true });

  /* Watching the gallery itself catches what a window resize does not: a
     scrollbar arriving, the page being zoomed, the address bar sliding away.
     Repacking changes the gallery's height, which trips this again -- harmless,
     because a relayout with the same width returns without touching anything. */
  if (typeof ResizeObserver === "function") new ResizeObserver(relayout).observe(gallery);

  /* ---- lightbox --------------------------------------------------------- */

  var box = document.getElementById("lightbox");
  var boxImg = document.getElementById("lightbox-img");
  var boxCaption = document.getElementById("lightbox-caption");
  var closeBtn = document.getElementById("lightbox-close");
  var prevBtn = document.getElementById("lightbox-prev");
  var nextBtn = document.getElementById("lightbox-next");

  var boxParts = {
    img: boxImg,
    sources: {
      avif: document.getElementById("lightbox-avif"),
      webp: document.getElementById("lightbox-webp")
    }
  };

  var current = 0;

  box.classList.toggle("single", photos.length < 2);

  /* How wide the photograph will actually be drawn, which is rarely the width
     of the window: the frame is padded, it leaves a line for the caption, and
     an upright photograph runs out of height long before it runs out of width.
     Saying `100vw` here would have a portrait frame fetch nearly twice the
     picture it can show, so the constraint is worked out properly instead.

     CSS pixels, not device pixels -- the browser applies the pixel ratio itself
     when it picks a rung out of the srcset. */
  function drawnWidth(photo) {
    var style = getComputedStyle(box);
    var pad = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
    var padY = (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0);
    var caption = 2.5 * (parseFloat(getComputedStyle(document.documentElement).fontSize) || 16);

    var w = Math.max(1, (window.innerWidth || 1024) - pad);
    var h = Math.max(1, (window.innerHeight || 768) - padY - caption);
    var ratio = photo.width && photo.height ? photo.width / photo.height : 1.5;
    return Math.min(w, h * ratio);
  }

  function show(i) {
    current = (i + photos.length) % photos.length;
    var photo = photos[current];

    /* A fresh set of sources every time, or the browser keeps showing the
       previous photograph until the new one lands. */
    boxParts.at = 0;
    boxImg.removeAttribute("srcset");
    boxImg.removeAttribute("src");
    if (boxParts.sources.avif) boxParts.sources.avif.removeAttribute("srcset");
    if (boxParts.sources.webp) boxParts.sources.webp.removeAttribute("srcset");

    boxImg.alt = photo.alt || photo.caption || "";
    if (photo.color) boxImg.style.background = photo.color;
    serve(boxParts, photo, drawnWidth(photo));
    boxCaption.textContent = photo.caption || "";

    /* Warm the neighbours so stepping through feels instant -- at the size they
       will be shown at, so the warmed copy is the one that gets used. */
    [current + 1, current - 1].forEach(function (j) {
      var neighbour = photos[(j + photos.length) % photos.length];
      if (neighbour === photo) return;
      var ahead = new Image();
      var type = supportsAvif ? "avif" : "webp";
      if (ladder(neighbour, type).length) {
        ahead.sizes = Math.max(1, Math.round(drawnWidth(neighbour))) + "px";
        /* The format the page is about to ask for, so the warmed file is the
           one <picture> will actually choose. */
        ahead.srcset = srcset(neighbour, type);
      }
      ahead.src = fallback(neighbour);
    });
  }

  /* One 1x1 probe, so the prefetch above warms the same format the page is
     about to ask for rather than a JPEG nothing will use. */
  var supportsAvif = false;
  (function () {
    var probe = new Image();
    probe.onload = function () { supportsAvif = probe.width > 0; };
    probe.src = "data:image/avif;base64,AAAAIGZ0eXBhdmlmAAAAAGF2aWZtaWYxbWlhZk1BMUIAAADybWV0YQAAAAAAAAAoaGRscgAAAAAAAAAAcGljdAAAAAAAAAAAAAAAAGxpYmF2aWYAAAAADnBpdG0AAAAAAAEAAAAeaWxvYwAAAABEAAABAAEAAAABAAABGgAAAB0AAABEaWluZgAAAAAAAQAAABZpbmZlAgAAAAABAABhdjAxQ29sb3IAAAAAamlwcnAAAABLaXBjbwAAABRpc3BlAAAAAAAAAAEAAAABAAAAEHBpeGkAAAAAAwgICAAAAAxhdjFDgQAMAAAAABNjb2xybmNseAACAAIABoAAAAAXaXBtYQAAAAAAAAABAAEEAQKDBAAAACVtZGF0EgAKCBgABogQEDQgMgkQAAAAB8dSLfI=";
  })();

  function open(i) {
    /* Unhidden first: the width the photograph will be drawn at is measured off
       the frame, and a display:none frame has no measurements to give. Nothing
       paints in between -- this all runs before the browser gets a turn. */
    box.hidden = false;
    show(i);
    document.body.classList.add("lightbox-open");
    closeBtn.focus();
  }

  /* Focus goes to the photograph you were last looking at rather than the one
     you opened -- after stepping through six frames, being dropped back at the
     first is disorienting, and the thumbnail you left on is where the eye
     already is. `scrollIntoView` only moves the page if it is off screen. */
  function close() {
    box.hidden = true;
    document.body.classList.remove("lightbox-open");
    boxParts.at = 0;
    boxImg.removeAttribute("src");
    boxImg.removeAttribute("srcset");
    if (boxParts.sources.avif) boxParts.sources.avif.removeAttribute("srcset");
    if (boxParts.sources.webp) boxParts.sources.webp.removeAttribute("srcset");
    var thumbnail = thumbnails[current];
    if (thumbnail) {
      thumbnail.scrollIntoView({ block: "nearest" });
      thumbnail.focus({ preventScroll: true });
    }
  }

  closeBtn.addEventListener("click", close);
  prevBtn.addEventListener("click", function () { show(current - 1); });
  nextBtn.addEventListener("click", function () { show(current + 1); });

  /* Turning a phone on its side, or dragging a window wider, can leave the
     photograph drawn larger than the rung that was fetched for it. Re-ask: the
     browser upgrades if a sharper one is now warranted and ignores us if not. */
  addEventListener("resize", function () {
    if (!box.hidden) serve(boxParts, photos[current], drawnWidth(photos[current]));
  }, { passive: true });

  /* Clicking the surround closes; clicking the photograph itself does not. */
  box.addEventListener("click", function (e) {
    if (e.target === box || e.target === boxCaption) close();
  });

  document.addEventListener("keydown", function (e) {
    if (box.hidden) return;
    if (e.key === "Escape") { close(); return; }
    if (photos.length < 2) return;
    if (e.key === "ArrowRight") { e.preventDefault(); show(current + 1); }
    if (e.key === "ArrowLeft") { e.preventDefault(); show(current - 1); }
  });

  /* Keep tabbing inside the dialog while it is open. Three controls is a small
     enough loop to handle by hand. */
  box.addEventListener("keydown", function (e) {
    if (e.key !== "Tab") return;
    var stops = [closeBtn];
    if (photos.length > 1) stops.push(prevBtn, nextBtn);
    var at = stops.indexOf(document.activeElement);
    e.preventDefault();
    var step = e.shiftKey ? -1 : 1;
    stops[(Math.max(at, 0) + step + stops.length) % stops.length].focus();
  });

  /* ---- the rule under the bar ------------------------------------------- */

  var bar = document.querySelector(".bar");
  var onScroll = function () {
    bar.classList.toggle("scrolled", window.scrollY > 4);
  };
  addEventListener("scroll", onScroll, { passive: true });
  onScroll();
})();
