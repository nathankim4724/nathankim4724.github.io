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

  /* ---- gallery ---------------------------------------------------------- */

  var frag = document.createDocumentFragment();
  var thumbnails = []; /* so the lightbox can hand focus back to one of them */

  photos.forEach(function (photo, i) {
    var figure = document.createElement("figure");

    var button = document.createElement("button");
    button.type = "button";
    button.setAttribute("aria-label", "Open " + (photo.caption || photo.alt || "photograph") + " full size");
    button.addEventListener("click", function () { open(i); });
    thumbnails.push(button);

    var img = document.createElement("img");
    img.src = photo.src;
    img.alt = photo.alt || photo.caption || "";
    /* The first screenful is worth fetching eagerly; the rest can wait until
       the reader is on their way to it. */
    img.loading = i < 3 ? "eager" : "lazy";
    img.decoding = "async";

    if (photo.width && photo.height) {
      img.width = photo.width;
      img.height = photo.height;
      img.style.setProperty("--ratio", photo.width + " / " + photo.height);
    }

    if (img.complete) {
      img.classList.add("loaded");
    } else {
      img.addEventListener("load", function () { img.classList.add("loaded"); });
      /* A photograph that fails to load should not leave a grey rectangle
         sitting in the column forever. */
      img.addEventListener("error", function () { figure.remove(); });
    }

    button.appendChild(img);
    figure.appendChild(button);

    if (photo.caption) {
      var caption = document.createElement("figcaption");
      caption.textContent = photo.caption;
      figure.appendChild(caption);
    }

    frag.appendChild(figure);
  });

  gallery.appendChild(frag);

  /* ---- lightbox --------------------------------------------------------- */

  var box = document.getElementById("lightbox");
  var boxImg = document.getElementById("lightbox-img");
  var boxCaption = document.getElementById("lightbox-caption");
  var closeBtn = document.getElementById("lightbox-close");
  var prevBtn = document.getElementById("lightbox-prev");
  var nextBtn = document.getElementById("lightbox-next");

  var current = 0;

  box.classList.toggle("single", photos.length < 2);

  function show(i) {
    current = (i + photos.length) % photos.length;
    var photo = photos[current];
    boxImg.src = photo.src;
    boxImg.alt = photo.alt || photo.caption || "";
    boxCaption.textContent = photo.caption || "";

    /* Warm the neighbours so stepping through feels instant. */
    [current + 1, current - 1].forEach(function (j) {
      var neighbour = photos[(j + photos.length) % photos.length];
      if (neighbour !== photo) new Image().src = neighbour.src;
    });
  }

  function open(i) {
    show(i);
    box.hidden = false;
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
    boxImg.removeAttribute("src");
    var thumbnail = thumbnails[current];
    if (thumbnail) {
      thumbnail.scrollIntoView({ block: "nearest" });
      thumbnail.focus({ preventScroll: true });
    }
  }

  closeBtn.addEventListener("click", close);
  prevBtn.addEventListener("click", function () { show(current - 1); });
  nextBtn.addEventListener("click", function () { show(current + 1); });

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
