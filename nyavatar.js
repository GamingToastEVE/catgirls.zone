/*!
 * nyavatar.js — deterministic catgirl avatars as SVG
 * catgirls.zone · public domain (CC0)
 *
 * Same seed in, same catgirl out. No network, no canvas, no deps.
 *   nyavatar("mia")            -> "<svg …>"
 *   nyavatar("mia", { size: 512 })
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.nyavatar = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /* ---------- hashing + prng ------------------------------------------ */

  // FNV-1a, 32 bit. Stable across engines because we keep everything in
  // Math.imul / >>> 0 territory.
  function hash(str) {
    var h = 0x811c9dc5;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h >>> 0;
  }

  // mulberry32 — tiny, well-distributed, fully deterministic.
  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ---------- trait tables -------------------------------------------- */

  var EARS = ["pointy", "round", "folded", "tufted", "big"];
  var HAIR = ["hime", "twintails", "bob", "messy", "ponytail", "long", "buns"];
  var EYES = ["round", "sleepy", "sharp", "wink", "sparkle", "closed"];
  var MOUTH = ["cat", "smile", "smug", "open", "flat"];
  var EXTRA = ["none", "none", "bell", "ribbon", "bandaid", "star"];

  // Hair palettes: [base, shadow]. Deliberately saturated + a little cursed.
  var HAIR_COLORS = [
    ["#f7a8c4", "#d9779c"], ["#a8c6f7", "#7b9ad6"], ["#c3a8f7", "#9a79d6"],
    ["#f7e3a8", "#d6be76"], ["#a8f7cf", "#75d3a6"], ["#f7b48a", "#d68a5d"],
    ["#e8e8f2", "#bcbcd0"], ["#5a5468", "#3d3948"], ["#f78aa8", "#d65d7f"],
    ["#8af7ef", "#54c9c1"], ["#c9f78a", "#9bcb56"], ["#f7f7f7", "#cfcfda"]
  ];

  var EYE_COLORS = [
    "#4fc3f7", "#ab7bf5", "#f56b8a", "#ffd166", "#5fe0a8",
    "#ff8a5f", "#6b7bf5", "#2ec4b6", "#e94f8a", "#9be04f"
  ];

  var SKINS = [
    ["#ffe0cc", "#f0c2a8"], ["#f8d2b8", "#e0ad8c"], ["#e8b894", "#cc9670"],
    ["#c98e68", "#a86e4c"], ["#8d5a3c", "#6d422a"], ["#fdeee3", "#eccfbc"]
  ];

  // Clothing gets its own palette so the shoulders don't read as more hair.
  var CLOTHES = [
    ["#3d4a6b", "#2b3550"], ["#6b3d4f", "#502b3a"], ["#3d6b56", "#2b503f"],
    ["#5a4a6b", "#423550"], ["#6b5a3d", "#50432b"], ["#2f3540", "#22262e"]
  ];

  var BACKGROUNDS = [
    ["#241f31", "#3a2f4d"], ["#1f2c31", "#2f4a4d"], ["#311f2a", "#4d2f42"],
    ["#1f2431", "#2f374d"], ["#2b311f", "#454d2f"], ["#31291f", "#4d3f2f"]
  ];

  /* ---------- helpers -------------------------------------------------- */

  function pick(r, arr) { return arr[Math.floor(r() * arr.length)]; }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  /* ---------- traits --------------------------------------------------- */

  function traits(seed) {
    var r = rng(hash(String(seed)));
    var hairIdx = Math.floor(r() * HAIR_COLORS.length);
    return {
      seed: String(seed),
      ears: pick(r, EARS),
      hair: pick(r, HAIR),
      eyes: pick(r, EYES),
      mouth: pick(r, MOUTH),
      extra: pick(r, EXTRA),
      hairColor: HAIR_COLORS[hairIdx],
      eyeColor: pick(r, EYE_COLORS),
      skin: pick(r, SKINS),
      clothes: pick(r, CLOTHES),
      bg: pick(r, BACKGROUNDS),
      blush: r() < 0.55,
      freckles: r() < 0.3,
      heterochromia: r() < 0.12,
      altEyeColor: pick(r, EYE_COLORS),
      tilt: (r() * 6 - 3).toFixed(2)
    };
  }

  /* ---------- drawing --------------------------------------------------
   * Everything is drawn in a 100x100 viewBox. The face sits at (50, 54)
   * with a head radius of ~26, so parts can be positioned by eye.
   * ------------------------------------------------------------------- */

  function drawEars(t) {
    var base = t.hairColor[0], shade = t.hairColor[1], inner = t.skin[1];
    var pairs = {
      pointy: [[26, 30, 20, 8, 40, 22], [74, 30, 80, 8, 60, 22]],
      round: null, folded: null, tufted: null, big: null
    };
    if (t.ears === "pointy" || t.ears === "tufted" || t.ears === "big") {
      var spread = t.ears === "big" ? 10 : 0;
      var lift = t.ears === "big" ? 8 : 0;
      var L = "M28,32 L" + (18 - spread) + "," + (10 - lift) + " L44,24 Z";
      var R = "M72,32 L" + (82 + spread) + "," + (10 - lift) + " L56,24 Z";
      var Li = "M30,30 L" + (22 - spread) + "," + (16 - lift) + " L40,25 Z";
      var Ri = "M70,30 L" + (78 + spread) + "," + (16 - lift) + " L60,25 Z";
      var tuft = t.ears === "tufted"
        ? '<path d="M24,22 l-5,-7 M27,20 l-3,-8" stroke="' + base +
          '" stroke-width="1.6" stroke-linecap="round" fill="none"/>' +
          '<path d="M76,22 l5,-7 M73,20 l3,-8" stroke="' + base +
          '" stroke-width="1.6" stroke-linecap="round" fill="none"/>'
        : "";
      return '<path d="' + L + '" fill="' + shade + '"/><path d="' + R + '" fill="' + shade + '"/>' +
             '<path d="' + Li + '" fill="' + inner + '"/><path d="' + Ri + '" fill="' + inner + '"/>' + tuft;
    }
    if (t.ears === "round") {
      return '<circle cx="27" cy="24" r="11" fill="' + shade + '"/>' +
             '<circle cx="73" cy="24" r="11" fill="' + shade + '"/>' +
             '<circle cx="28" cy="25" r="6" fill="' + inner + '"/>' +
             '<circle cx="72" cy="25" r="6" fill="' + inner + '"/>';
    }
    // folded
    return '<path d="M26,34 q-8,-14 6,-16 q8,-1 10,8 Z" fill="' + shade + '"/>' +
           '<path d="M74,34 q8,-14 -6,-16 q-8,-1 -10,8 Z" fill="' + shade + '"/>' +
           '<path d="M29,31 q-4,-9 4,-10 q5,0 6,5 Z" fill="' + inner + '"/>' +
           '<path d="M71,31 q4,-9 -4,-10 q-5,0 -6,5 Z" fill="' + inner + '"/>';
  }

  function drawHairBack(t) {
    var base = t.hairColor[0], shade = t.hairColor[1];
    switch (t.hair) {
      case "hime":
      case "long":
        return '<path d="M20,52 q0,-32 30,-32 q30,0 30,32 l0,34 q-30,8 -60,0 Z" fill="' + shade + '"/>';
      case "twintails":
        return '<path d="M26,50 q-16,6 -14,26 q1,14 9,16 q7,-2 5,-14 q-2,-18 6,-24 Z" fill="' + shade + '"/>' +
               '<path d="M74,50 q16,6 14,26 q-1,14 -9,16 q-7,-2 -5,-14 q2,-18 -6,-24 Z" fill="' + shade + '"/>' +
               '<circle cx="24" cy="48" r="4" fill="' + base + '"/>' +
               '<circle cx="76" cy="48" r="4" fill="' + base + '"/>' +
               '<path d="M22,54 q0,-32 28,-32 q28,0 28,32 l0,14 q-28,6 -56,0 Z" fill="' + shade + '"/>';
      case "ponytail":
        return '<path d="M78,40 q18,10 12,34 q-3,10 -12,6 q8,-22 -4,-36 Z" fill="' + shade + '"/>' +
               '<path d="M22,54 q0,-32 28,-32 q28,0 28,32 l0,12 q-28,6 -56,0 Z" fill="' + shade + '"/>';
      case "buns":
        return '<circle cx="20" cy="38" r="10" fill="' + shade + '"/>' +
               '<circle cx="80" cy="38" r="10" fill="' + shade + '"/>' +
               '<path d="M22,54 q0,-32 28,-32 q28,0 28,32 l0,12 q-28,6 -56,0 Z" fill="' + shade + '"/>';
      case "bob":
        return '<path d="M21,56 q0,-34 29,-34 q29,0 29,34 l0,14 q-29,7 -58,0 Z" fill="' + shade + '"/>';
      default: // messy
        return '<path d="M20,56 q2,-36 30,-34 q28,2 30,34 l0,10 q-30,7 -60,0 Z" fill="' + shade + '"/>' +
               '<path d="M18,44 l-6,-9 8,3 M82,44 l6,-9 -8,3" fill="' + base + '"/>';
    }
  }

  function drawHairFront(t) {
    var base = t.hairColor[0];
    var fringe = {
      hime: 'M22,50 q0,-28 28,-28 q28,0 28,28 q-6,-14 -14,-15 q-3,10 -14,10 q-11,0 -14,-10 q-8,1 -14,15 Z',
      bob: 'M22,52 q0,-30 28,-30 q28,0 28,30 q-8,-16 -28,-16 q-20,0 -28,16 Z',
      messy: 'M22,52 q0,-30 28,-30 q28,0 28,30 q-5,-11 -11,-12 l-4,9 -5,-11 -6,10 -6,-11 -6,10 -5,-9 q-6,1 -13,14 Z',
      twintails: 'M22,50 q0,-28 28,-28 q28,0 28,28 q-9,-15 -20,-14 q-4,8 -14,7 q-12,-1 -22,7 Z',
      ponytail: 'M22,50 q0,-28 28,-28 q28,0 28,28 q-10,-16 -34,-13 q-14,2 -22,13 Z',
      long: 'M22,50 q0,-28 28,-28 q28,0 28,28 q-7,-15 -18,-14 q-6,9 -16,7 q-11,-2 -22,7 Z',
      buns: 'M22,50 q0,-28 28,-28 q28,0 28,28 q-8,-14 -28,-14 q-20,0 -28,14 Z'
    }[t.hair];
    return '<path d="' + fringe + '" fill="' + base + '"/>';
  }

  function drawEyes(t) {
    var c1 = t.eyeColor, c2 = t.heterochromia ? t.altEyeColor : t.eyeColor;
    function eye(x, color, flip) {
      switch (t.eyes) {
        case "closed":
          return '<path d="M' + (x - 6) + ',56 q6,5 12,0" stroke="#2b2333" stroke-width="2" ' +
                 'fill="none" stroke-linecap="round"/>';
        case "wink":
          if (flip) return '<path d="M' + (x - 6) + ',56 q6,5 12,0" stroke="#2b2333" ' +
                           'stroke-width="2" fill="none" stroke-linecap="round"/>';
          break;
        case "sleepy":
          return '<ellipse cx="' + x + '" cy="56" rx="6" ry="4.5" fill="#fff"/>' +
                 '<circle cx="' + x + '" cy="57" r="3.6" fill="' + color + '"/>' +
                 '<circle cx="' + x + '" cy="56" r="1.7" fill="#2b2333"/>' +
                 '<path d="M' + (x - 6.5) + ',53 q6.5,-3 13,0" stroke="#2b2333" ' +
                 'stroke-width="2.2" fill="none" stroke-linecap="round"/>';
        case "sharp":
          return '<path d="M' + (x - 7) + ',56 q7,-7 14,-1 q-7,7 -14,1 Z" fill="#fff"/>' +
                 '<ellipse cx="' + x + '" cy="55.5" rx="3.4" ry="4.4" fill="' + color + '"/>' +
                 '<ellipse cx="' + x + '" cy="55.5" rx="1.3" ry="3.4" fill="#2b2333"/>';
        case "sparkle":
          return '<ellipse cx="' + x + '" cy="56" rx="6.5" ry="7" fill="#fff"/>' +
                 '<circle cx="' + x + '" cy="56" r="4.6" fill="' + color + '"/>' +
                 '<circle cx="' + x + '" cy="56" r="2.2" fill="#2b2333"/>' +
                 '<circle cx="' + (x - 2) + '" cy="53.5" r="1.5" fill="#fff"/>' +
                 '<circle cx="' + (x + 2.2) + '" cy="58.4" r="1" fill="#fff"/>';
      }
      return '<ellipse cx="' + x + '" cy="56" rx="6" ry="6.8" fill="#fff"/>' +
             '<circle cx="' + x + '" cy="56.4" r="4.2" fill="' + color + '"/>' +
             '<circle cx="' + x + '" cy="56.4" r="1.9" fill="#2b2333"/>' +
             '<circle cx="' + (x - 1.6) + '" cy="54.2" r="1.4" fill="#fff"/>';
    }
    return eye(38, c1, false) + eye(62, c2, true);
  }

  function drawMouth(t) {
    switch (t.mouth) {
      case "cat":
        return '<path d="M45,69 q5,5 10,0" stroke="#2b2333" stroke-width="1.8" ' +
               'fill="none" stroke-linecap="round"/>' +
               '<path d="M45,69 q5,-4 10,0" stroke="#2b2333" stroke-width="1.8" ' +
               'fill="none" stroke-linecap="round"/>';
      case "smug":
        return '<path d="M46,70 q6,3 9,-2" stroke="#2b2333" stroke-width="1.8" ' +
               'fill="none" stroke-linecap="round"/>';
      case "open":
        return '<path d="M45,68 q5,9 10,0 q-5,3 -10,0 Z" fill="#8a3a52"/>';
      case "flat":
        return '<path d="M46,70 h8" stroke="#2b2333" stroke-width="1.8" stroke-linecap="round"/>';
      default:
        return '<path d="M45,68 q5,6 10,0" stroke="#2b2333" stroke-width="1.8" ' +
               'fill="none" stroke-linecap="round"/>';
    }
  }

  function drawExtra(t) {
    switch (t.extra) {
      case "bell":
        return '<rect x="34" y="86" width="32" height="5" rx="2.5" fill="#e04f6b"/>' +
               '<circle cx="50" cy="92" r="4" fill="#ffd166"/>' +
               '<path d="M50,90 v4" stroke="#b8860b" stroke-width="1.2"/>';
      case "ribbon":
        return '<path d="M66,34 l8,-5 0,10 Z" fill="#e04f6b"/>' +
               '<path d="M66,34 l-8,-5 0,10 Z" fill="#e04f6b"/>' +
               '<circle cx="66" cy="34" r="2.6" fill="#ff8fa3"/>';
      case "bandaid":
        return '<rect x="60" y="46" width="12" height="5" rx="2" ' +
               'transform="rotate(-18 66 48)" fill="#ffd9b0" stroke="#e0b98c"/>';
      case "star":
        return '<path d="M30,44 l1.6,3.4 3.7,.5 -2.7,2.6 .7,3.7 -3.3,-1.8 -3.3,1.8 ' +
               '.7,-3.7 -2.7,-2.6 3.7,-.5 Z" fill="#ffd166"/>';
      default:
        return "";
    }
  }

  /* ---------- svg assembly --------------------------------------------- */

  function svg(seed, opts) {
    opts = opts || {};
    var t = traits(seed);
    var size = opts.size || 256;
    var id = "n" + hash(String(seed)).toString(36);
    var skin = t.skin[0], skinShade = t.skin[1];

    var blush = t.blush
      ? '<ellipse cx="33" cy="64" rx="5" ry="3" fill="#ff8fa3" opacity=".55"/>' +
        '<ellipse cx="67" cy="64" rx="5" ry="3" fill="#ff8fa3" opacity=".55"/>'
      : "";
    var freckles = t.freckles
      ? '<g fill="' + skinShade + '" opacity=".8">' +
        '<circle cx="41" cy="65" r=".8"/><circle cx="44" cy="67" r=".7"/>' +
        '<circle cx="56" cy="67" r=".7"/><circle cx="59" cy="65" r=".8"/></g>'
      : "";
    var whiskers =
      '<g stroke="' + skinShade + '" stroke-width=".9" stroke-linecap="round" opacity=".75">' +
      '<path d="M26,64 h7 M26,68 h7 M74,64 h-7 M74,68 h-7"/></g>';

    return (
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="' + size +
      '" height="' + size + '" role="img" aria-label="catgirl avatar for ' + esc(seed) + '">' +
      '<defs><radialGradient id="' + id + 'bg" cx="50%" cy="35%" r="75%">' +
      '<stop offset="0%" stop-color="' + t.bg[1] + '"/>' +
      '<stop offset="100%" stop-color="' + t.bg[0] + '"/></radialGradient>' +
      '<clipPath id="' + id + 'c"><rect width="100" height="100" rx="' +
      (opts.round === false ? 0 : 16) + '"/></clipPath></defs>' +
      '<g clip-path="url(#' + id + 'c)">' +
      '<rect width="100" height="100" fill="url(#' + id + 'bg)"/>' +
      '<g transform="rotate(' + t.tilt + ' 50 55)">' +
      drawHairBack(t) +
      drawEars(t) +
      // neck + shoulders
      '<path d="M42,74 h16 v10 h-16 Z" fill="' + skinShade + '"/>' +
      '<path d="M26,100 q5,-17 24,-17 q19,0 24,17 Z" fill="' + t.clothes[0] + '"/>' +
      '<path d="M50,83 l-6,17 h12 Z" fill="' + t.clothes[1] + '"/>' +
      // head
      '<ellipse cx="50" cy="56" rx="26" ry="27" fill="' + skin + '"/>' +
      drawHairFront(t) +
      whiskers + freckles + blush +
      drawEyes(t) + drawMouth(t) + drawExtra(t) +
      '</g></g></svg>'
    );
  }

  svg.traits = traits;
  svg.hash = hash;
  svg.dataUri = function (seed, opts) {
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg(seed, opts));
  };
  return svg;
});
