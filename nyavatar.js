/*!
 * nyavatar.js — deterministic chibi catgirl avatars as SVG
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

  /* ---------- color utils --------------------------------------------- */

  var INK = [58, 44, 72]; // the one dark tone every outline mixes toward

  function rgb(hex) {
    hex = hex.replace("#", "");
    return [
      parseInt(hex.slice(0, 2), 16),
      parseInt(hex.slice(2, 4), 16),
      parseInt(hex.slice(4, 6), 16)
    ];
  }

  function hex(c) {
    return "#" + c.map(function (v) {
      return Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
    }).join("");
  }

  function mix(a, b, t) {
    var x = typeof a === "string" ? rgb(a) : a;
    var y = typeof b === "string" ? rgb(b) : b;
    return hex([0, 1, 2].map(function (i) { return x[i] + (y[i] - x[i]) * t; }));
  }

  // Outlines are never pure black — they're the base color pushed toward INK,
  // which is what keeps the whole thing looking drawn rather than clip-arted.
  function line(c) { return mix(c, INK, 0.62); }
  function lift(c) { return mix(c, [255, 255, 255], 0.42); }

  /* ---------- trait tables -------------------------------------------- */

  var EARS = ["pointy", "round", "folded", "tufted", "big"];
  var HAIR = ["hime", "twintails", "bob", "messy", "ponytail", "long", "buns"];
  var EYES = ["round", "sleepy", "sharp", "wink", "sparkle", "closed"];
  var MOUTH = ["cat", "smile", "smug", "open", "flat"];
  var EXTRA = ["none", "none", "bell", "ribbon", "bandaid", "flower"];

  // [base, shadow] — soft anime pastels, a couple of loud ones.
  var HAIR_COLORS = [
    ["#ffb3cd", "#e07fa4"], ["#a9c8ff", "#7b9ad6"], ["#c9adff", "#9c7fd6"],
    ["#ffe9a8", "#dcbf6d"], ["#a8f0cd", "#72c9a3"], ["#ffc09a", "#dd9265"],
    ["#eceaf5", "#c2bfd4"], ["#5d5570", "#3f394e"], ["#ff9db5", "#dd6d8c"],
    ["#9aeae4", "#5ec0ba"], ["#d3f096", "#a3c163"], ["#fdfdff", "#d2d0e0"],
    ["#f7a35c", "#cf7a34"], ["#8f9dff", "#6470d6"]
  ];

  var EYE_COLORS = [
    "#4fc3f7", "#a97bf5", "#f5738f", "#ffc44d", "#4fdba3",
    "#ff8a5f", "#6b7bf5", "#2ec4b6", "#e94f8a", "#9be04f"
  ];

  var SKINS = [
    ["#ffe4d2", "#f3c3a9"], ["#fbd6bd", "#e5b092"], ["#eec09c", "#d29b75"],
    ["#d09a72", "#ad7752", "#8d5a3c"], ["#a3714d", "#7f5233"], ["#fff0e6", "#efd2c1"]
  ];

  // Clothing gets its own palette so the shoulders don't read as more hair.
  var CLOTHES = [
    ["#48588a", "#33406a"], ["#8a4860", "#6a3348"], ["#3f8a6c", "#2c6a52"],
    ["#6d5a8a", "#50406a"], ["#8a7448", "#6a5733"], ["#3a4150", "#282d38"]
  ];

  var BACKGROUNDS = [
    ["#2a2340", "#453a63"], ["#20323a", "#2f5058"], ["#3a2333", "#5c3a51"],
    ["#222a3d", "#38446a"], ["#2c3524", "#48553a"], ["#3a2d20", "#5c4835"]
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
    return {
      seed: String(seed),
      ears: pick(r, EARS),
      hair: pick(r, HAIR),
      eyes: pick(r, EYES),
      mouth: pick(r, MOUTH),
      extra: pick(r, EXTRA),
      hairColor: pick(r, HAIR_COLORS),
      eyeColor: pick(r, EYE_COLORS),
      skin: pick(r, SKINS),
      clothes: pick(r, CLOTHES),
      bg: pick(r, BACKGROUNDS),
      blush: r() < 0.7,
      freckles: r() < 0.28,
      heterochromia: r() < 0.12,
      altEyeColor: pick(r, EYE_COLORS),
      tilt: (r() * 7 - 3.5).toFixed(2)
    };
  }

  /* ---------- drawing ---------------------------------------------------
   * 100x100 viewBox. Chibi proportions: the head is enormous (x 21-79,
   * y 18-84), the eyes sit low and take up a third of the face, the body
   * is a token suggestion of shoulders at the very bottom.
   * -------------------------------------------------------------------- */

  var HEAD = "M50,20 C69,20 79,34 79,52 C79,66 71,78 60,82 " +
             "C56,83.5 44,83.5 40,82 C29,78 21,66 21,52 C21,34 31,20 50,20 Z";

  var EYE_Y = 60, EYE_L = 36.5, EYE_R = 63.5;

  function drawEars(t) {
    // Ears use the *base* hair tone: the back hair behind them is the darker
    // shade, and matching tones made them vanish into the silhouette.
    var base = t.hairColor[0], shade = t.hairColor[1], ink = line(shade);
    var inner = mix(t.skin[1], "#ff9db5", 0.45);
    var s = 'stroke="' + ink + '" stroke-width="1.6" stroke-linejoin="round"';

    if (t.ears === "round") {
      return '<g ' + s + '>' +
        '<path d="M24,32 C15,27 14,9 24,5 C34,2 42,15 42,25 Z" fill="' + base + '"/>' +
        '<path d="M76,32 C85,27 86,9 76,5 C66,2 58,15 58,25 Z" fill="' + base + '"/>' +
        '</g>' +
        '<path d="M26,27 C21,23 21,12 27,10 C33,9 38,19 38,24 Z" fill="' + inner + '"/>' +
        '<path d="M74,27 C79,23 79,12 73,10 C67,9 62,19 62,24 Z" fill="' + inner + '"/>';
    }

    if (t.ears === "folded") {
      return '<g ' + s + '>' +
        '<path d="M25,33 C15,22 18,6 30,7 C41,8 45,18 44,26 C39,20 30,21 25,33 Z" fill="' + base + '"/>' +
        '<path d="M75,33 C85,22 82,6 70,7 C59,8 55,18 56,26 C61,20 70,21 75,33 Z" fill="' + base + '"/>' +
        '</g>' +
        '<path d="M28,25 C23,17 26,12 32,13 C37,14 40,20 40,24 Z" fill="' + inner + '"/>' +
        '<path d="M72,25 C77,17 74,12 68,13 C63,14 60,20 60,24 Z" fill="' + inner + '"/>';
    }

    // pointy / tufted / big share one silhouette, scaled outward + up.
    var out = t.ears === "big" ? 6 : 0, up = t.ears === "big" ? 6 : 0;
    var lx = 19 - out, ly = 9 - up, rx = 81 + out, ry = 9 - up;
    var tuft = t.ears === "tufted"
      ? '<g stroke="' + lift(base) + '" stroke-width="1.8" stroke-linecap="round" fill="none">' +
        '<path d="M26,24 l-5,-6 M29,22 l-3,-7 M74,24 l5,-6 M71,22 l3,-7"/></g>'
      : "";

    return '<g ' + s + '>' +
      '<path d="M28,35 C22,26 ' + lx + ',16 ' + lx + ',' + ly +
        ' C' + (lx + 12) + ',' + (ly + 6) + ' 42,22 45,29 Z" fill="' + base + '"/>' +
      '<path d="M72,35 C78,26 ' + rx + ',16 ' + rx + ',' + ry +
        ' C' + (rx - 12) + ',' + (ry + 6) + ' 58,22 55,29 Z" fill="' + base + '"/>' +
      '</g>' +
      '<path d="M30,31 C27,25 ' + (lx + 4) + ',19 ' + (lx + 4) + ',' + (ly + 5) +
        ' C' + (lx + 12) + ',' + (ly + 10) + ' 38,24 40,28 Z" fill="' + inner + '"/>' +
      '<path d="M70,31 C73,25 ' + (rx - 4) + ',19 ' + (rx - 4) + ',' + (ry + 5) +
        ' C' + (rx - 12) + ',' + (ry + 10) + ' 62,24 60,28 Z" fill="' + inner + '"/>' +
      tuft;
  }

  function drawHairBack(t) {
    var shade = t.hairColor[1], ink = line(shade);
    var s = ' fill="' + shade + '" stroke="' + ink + '" stroke-width="1.6" stroke-linejoin="round"';
    var cap = '<path d="M18,60 C18,30 32,14 50,14 C68,14 82,30 82,60 L82,74 ' +
              'C70,80 30,80 18,74 Z"' + s + '/>';

    switch (t.hair) {
      case "long":
      case "hime":
        return '<path d="M17,60 C17,28 32,13 50,13 C68,13 83,28 83,60 ' +
               'C83,76 86,92 84,100 L16,100 C14,92 17,76 17,60 Z"' + s + '/>';
      case "twintails":
        return cap +
          '<path d="M22,44 C6,50 4,72 10,88 C13,96 22,96 24,88 C27,74 22,60 30,50 Z"' + s + '/>' +
          '<path d="M78,44 C94,50 96,72 90,88 C87,96 78,96 76,88 C73,74 78,60 70,50 Z"' + s + '/>';
      case "ponytail":
        return cap +
          '<path d="M76,40 C96,48 96,74 88,92 C85,99 76,97 78,88 C84,68 82,52 68,44 Z"' + s + '/>';
      case "buns":
        return cap +
          '<circle cx="17" cy="34" r="12"' + s + '/>' +
          '<circle cx="83" cy="34" r="12"' + s + '/>' +
          '<path d="M12,34 q5,-6 10,0 q-5,6 -10,0" fill="' + t.hairColor[0] + '" opacity=".55"/>' +
          '<path d="M78,34 q5,-6 10,0 q-5,6 -10,0" fill="' + t.hairColor[0] + '" opacity=".55"/>';
      case "bob":
        return '<path d="M18,58 C18,28 32,14 50,14 C68,14 82,28 82,58 ' +
               'C82,70 80,76 76,80 C68,84 32,84 24,80 C20,76 18,70 18,58 Z"' + s + '/>';
      default: // messy
        return '<path d="M17,60 C17,28 32,13 50,13 C68,13 83,28 83,60 ' +
               'L86,78 L79,74 L80,86 L72,76 L70,84 L64,76 L58,82 L50,74 ' +
               'L42,82 L36,76 L30,84 L28,76 L20,86 L21,74 L14,78 Z"' + s + '/>';
    }
  }

  function drawHairFront(t) {
    var base = t.hairColor[0], ink = line(t.hairColor[1]);
    var s = ' fill="' + base + '" stroke="' + ink + '" stroke-width="1.6" stroke-linejoin="round"';

    // Bangs stop just above the eyes (y≈50) so the huge eyes stay unblocked.
    var fringe = {
      // blunt straight-across bangs with long side locks
      // blunt hime bangs, but scalloped along the bottom so it reads as hair
      // strands rather than a swim cap
      hime: 'M20,54 C20,28 33,15 50,15 C67,15 80,28 80,54 ' +
            'C78,48 76,45 73,46 C70,47 69,49 66,49 C63,49 61,46 58,46 ' +
            'C55,46 53,49 50,49 C47,49 45,46 42,46 C39,46 37,49 34,49 ' +
            'C31,49 30,47 27,46 C24,45 22,48 20,54 Z',
      bob: 'M20,54 C20,28 33,15 50,15 C67,15 80,28 80,54 ' +
           'C74,42 64,36 50,36 C36,36 26,42 20,54 Z',
      messy: 'M20,54 C20,28 33,15 50,15 C67,15 80,28 80,54 ' +
             'C77,44 72,38 68,37 L64,48 L60,36 L55,49 L50,35 L45,48 L40,36 ' +
             'L35,47 L31,37 C27,39 23,45 20,54 Z',
      twintails: 'M20,54 C20,28 33,15 50,15 C67,15 80,28 80,54 ' +
                 'C76,42 68,34 60,34 C54,34 51,44 50,48 C48,43 45,33 39,33 ' +
                 'C30,33 24,43 20,54 Z',
      ponytail: 'M20,54 C20,28 33,15 50,15 C67,15 80,28 80,54 ' +
                'C74,40 62,32 46,34 C33,36 25,44 20,54 Z',
      long: 'M20,54 C20,28 33,15 50,15 C67,15 80,28 80,54 ' +
            'C76,42 70,35 63,35 C56,35 52,44 50,48 C47,43 43,34 36,34 ' +
            'C29,34 23,44 20,54 Z',
      buns: 'M20,52 C20,28 33,15 50,15 C67,15 80,28 80,52 ' +
            'C73,40 64,35 50,35 C36,35 27,40 20,52 Z'
    }[t.hair];

    // Side locks framing the cheeks — the thing that most says "anime".
    var locks =
      '<path d="M21,44 C17,54 18,64 22,72 C25,66 24,54 26,46 Z"' + s + '/>' +
      '<path d="M79,44 C83,54 82,64 78,72 C75,66 76,54 74,46 Z"' + s + '/>';

    return locks + '<path d="' + fringe + '"' + s + '/>' +
      // glossy highlight band
      '<path d="M31,30 C38,23 62,23 69,30" fill="none" stroke="' + lift(base) +
      '" stroke-width="4.5" stroke-linecap="round" opacity=".7"/>';
  }

  function drawEyes(t, id) {
    var lc = t.eyeColor, rc = t.heterochromia ? t.altEyeColor : t.eyeColor;
    var lash = "#3a2c48";
    var browColor = line(t.hairColor[1]);

    function closedEye(x, dir) {
      return '<path d="M' + (x - 7) + ',' + (EYE_Y + 1) + ' Q' + x + ',' +
        (EYE_Y + 1 - 6 * dir) + ' ' + (x + 7) + ',' + (EYE_Y + 1) +
        '" fill="none" stroke="' + lash + '" stroke-width="2.4" stroke-linecap="round"/>';
    }

    function openEye(x, color, grad) {
      var rx = 8, ry = 10, lidCut = 0, narrow = 1;
      if (t.eyes === "sleepy") { lidCut = 3.4; }
      if (t.eyes === "sharp") { ry = 8.4; narrow = 0.86; }

      var top = EYE_Y - ry + lidCut;
      var iris = EYE_Y + 0.8 + lidCut * 0.4;

      return (
        // white
        '<ellipse cx="' + x + '" cy="' + EYE_Y + '" rx="' + rx * narrow + '" ry="' + ry +
          '" fill="#fffafd"/>' +
        // iris with vertical gradient + dark rim
        '<g clip-path="url(#' + id + 'e' + (grad) + ')">' +
        '<ellipse cx="' + x + '" cy="' + iris + '" rx="' + 6.4 * narrow + '" ry="7.4" fill="url(#' +
          id + 'i' + grad + ')"/>' +
        '<ellipse cx="' + x + '" cy="' + iris + '" rx="' + 6.4 * narrow + '" ry="7.4" fill="none" stroke="' +
          mix(color, INK, 0.45) + '" stroke-width="1.1"/>' +
        // pupil
        '<ellipse cx="' + x + '" cy="' + iris + '" rx="' + 2.6 * narrow + '" ry="4.2" fill="#2a2136"/>' +
        // reflected light pooling at the bottom of the iris
        '<ellipse cx="' + x + '" cy="' + (iris + 4) + '" rx="' + 4 * narrow + '" ry="2.2" fill="' +
          lift(color) + '" opacity=".85"/>' +
        '</g>' +
        // highlights
        '<circle cx="' + (x - 2.6) + '" cy="' + (top + 3.6) + '" r="2.5" fill="#fff"/>' +
        '<circle cx="' + (x + 2.8) + '" cy="' + (EYE_Y + 5) + '" r="1.2" fill="#fff" opacity=".9"/>' +
        (t.eyes === "sparkle"
          ? '<path d="M' + (x + 3.4) + ',' + (top + 1.5) + ' l1,2.2 2.2,1 -2.2,1 -1,2.2 -1,-2.2 ' +
            '-2.2,-1 2.2,-1 Z" fill="#fff"/>'
          : "") +
        // upper lash — thick, and the reason the face reads as a face
        '<path d="M' + (x - rx * narrow - 1) + ',' + (EYE_Y - ry * 0.55 + lidCut) +
          ' Q' + x + ',' + (top - 3.2) + ' ' + (x + rx * narrow + 1) + ',' +
          (EYE_Y - ry * 0.5 + lidCut) + '" fill="none" stroke="' + lash +
          '" stroke-width="3" stroke-linecap="round"/>' +
        // outer lash flick
        '<path d="M' + (x + (x < 50 ? -rx : rx) * narrow - (x < 50 ? 1 : -1)) + ',' +
          (EYE_Y - ry * 0.5 + lidCut) + ' l' + (x < 50 ? -3.5 : 3.5) + ',-2.5" stroke="' +
          lash + '" stroke-width="2.2" stroke-linecap="round" fill="none"/>' +
        // lower lid
        '<path d="M' + (x - 5) + ',' + (EYE_Y + ry * 0.78) + ' Q' + x + ',' +
          (EYE_Y + ry * 0.95) + ' ' + (x + 5) + ',' + (EYE_Y + ry * 0.78) +
          '" fill="none" stroke="' + mix(t.skin[1], INK, 0.35) +
          '" stroke-width="1" stroke-linecap="round" opacity=".8"/>'
      );
    }

    var brows =
      '<g fill="none" stroke="' + browColor + '" stroke-width="2" stroke-linecap="round" opacity=".9">' +
      '<path d="M30,45.5 Q36.5,42.5 43,45"/><path d="M57,45 Q63.5,42.5 70,45.5"/></g>';

    var left, right;
    if (t.eyes === "closed") { left = closedEye(EYE_L, 1); right = closedEye(EYE_R, 1); }
    else if (t.eyes === "wink") { left = openEye(EYE_L, lc, 0); right = closedEye(EYE_R, 1); }
    else { left = openEye(EYE_L, lc, 0); right = openEye(EYE_R, rc, 1); }

    return brows + left + right;
  }

  function drawFace(t) {
    var ink = mix(t.skin[1], INK, 0.4);
    var nose = '<path d="M48.6,68.5 q1.4,1.4 2.8,0" fill="none" stroke="' + ink +
               '" stroke-width="1.3" stroke-linecap="round" opacity=".85"/>';

    var mouth;
    switch (t.mouth) {
      case "cat":
        mouth = '<path d="M45.5,73 q2.3,3 4.5,0 q2.2,3 4.5,0" fill="none" stroke="' + ink +
                '" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>';
        break;
      case "smug":
        mouth = '<path d="M46,73.5 q4.5,2.6 7,-1.6" fill="none" stroke="' + ink +
                '" stroke-width="1.7" stroke-linecap="round"/>';
        break;
      case "open":
        mouth = '<path d="M46,72 q4,7 8,0 q-4,2 -8,0 Z" fill="#a13c58" stroke="' + ink +
                '" stroke-width="1.2" stroke-linejoin="round"/>' +
                '<path d="M48,75.5 q2,2.4 4,0 q-2,-1 -4,0 Z" fill="#f58aa5"/>';
        break;
      case "flat":
        mouth = '<path d="M46.5,73.5 h7" stroke="' + ink +
                '" stroke-width="1.7" stroke-linecap="round"/>';
        break;
      default:
        mouth = '<path d="M46,72.5 q4,4 8,0" fill="none" stroke="' + ink +
                '" stroke-width="1.7" stroke-linecap="round"/>';
    }
    return nose + mouth;
  }

  function drawExtra(t) {
    var ink;
    switch (t.extra) {
      case "bell":
        ink = line("#e04f6b");
        return '<path d="M33,88 C40,92 60,92 67,88 L67,92 C60,96 40,96 33,92 Z" fill="#e04f6b" stroke="' +
          ink + '" stroke-width="1.4" stroke-linejoin="round"/>' +
          '<circle cx="50" cy="95" r="4.6" fill="#ffd166" stroke="#b8860b" stroke-width="1.2"/>' +
          '<path d="M50,93 v4 M46,95 h8" stroke="#b8860b" stroke-width="1.1"/>' +
          '<circle cx="48.2" cy="93.4" r="1.1" fill="#fff5cc"/>';
      case "ribbon":
        ink = line("#e04f6b");
        return '<g stroke="' + ink + '" stroke-width="1.4" stroke-linejoin="round" fill="#f2607d">' +
          '<path d="M68,28 C74,22 80,24 79,29 C78,33 72,33 68,30 Z"/>' +
          '<path d="M68,30 C64,34 58,35 58,30 C58,25 64,25 68,28 Z"/>' +
          '<circle cx="68" cy="29" r="3"/></g>';
      case "bandaid":
        return '<g transform="rotate(-20 66 50)">' +
          '<rect x="59" y="46.5" width="14" height="6.5" rx="3.2" fill="#ffdfc0" stroke="#dfae82" stroke-width="1.2"/>' +
          '<rect x="63.5" y="47.8" width="5" height="4" rx="1" fill="#f4cba4"/></g>';
      case "flower":
        return '<g transform="translate(28,28)" stroke="' + line("#ff8fb0") +
          '" stroke-width="1.1"><g fill="#ffa8c5">' +
          '<circle cx="0" cy="-4.5" r="3.2"/><circle cx="4.3" cy="-1.4" r="3.2"/>' +
          '<circle cx="2.6" cy="3.6" r="3.2"/><circle cx="-2.6" cy="3.6" r="3.2"/>' +
          '<circle cx="-4.3" cy="-1.4" r="3.2"/></g>' +
          '<circle cx="0" cy="0" r="2.1" fill="#ffd76e"/></g>';
      default:
        return "";
    }
  }

  /* ---------- svg assembly --------------------------------------------- */

  function svg(seed, opts) {
    opts = opts || {};
    var t = traits(seed);
    var size = opts.size || 256;
    var id = "n" + hash(String(seed)).toString(36) + "_";
    var skin = t.skin[0], skinShade = t.skin[1], skinInk = mix(skinShade, INK, 0.42);

    var irisGrads = [t.eyeColor, t.heterochromia ? t.altEyeColor : t.eyeColor]
      .map(function (c, i) {
        return '<linearGradient id="' + id + 'i' + i + '" x1="0" y1="0" x2="0" y2="1">' +
          '<stop offset="0%" stop-color="' + mix(c, INK, 0.5) + '"/>' +
          '<stop offset="55%" stop-color="' + c + '"/>' +
          '<stop offset="100%" stop-color="' + lift(c) + '"/></linearGradient>' +
          '<clipPath id="' + id + 'e' + i + '"><ellipse cx="' + (i ? EYE_R : EYE_L) +
          '" cy="' + EYE_Y + '" rx="8" ry="10"/></clipPath>';
      }).join("");

    var blush = t.blush
      ? '<g opacity=".5">' +
        '<ellipse cx="31" cy="68" rx="6.5" ry="4" fill="#ff8fa3"/>' +
        '<ellipse cx="69" cy="68" rx="6.5" ry="4" fill="#ff8fa3"/></g>' +
        '<g stroke="#ff7d97" stroke-width="1" stroke-linecap="round" opacity=".45">' +
        '<path d="M28,67 l3,-2 M31,69.5 l3,-2 M69,65 l3,2 M66,67.5 l3,2"/></g>'
      : "";

    var freckles = t.freckles
      ? '<g fill="' + skinShade + '" opacity=".9">' +
        '<circle cx="42" cy="69" r=".9"/><circle cx="45" cy="71" r=".75"/>' +
        '<circle cx="55" cy="71" r=".75"/><circle cx="58" cy="69" r=".9"/>' +
        '<circle cx="39.5" cy="71.5" r=".7"/><circle cx="60.5" cy="71.5" r=".7"/></g>'
      : "";

    var whiskers =
      '<g stroke="' + skinInk + '" stroke-width=".9" stroke-linecap="round" opacity=".45">' +
      '<path d="M24,73 l7,-1.5 M24.5,77 l7,-2.5 M76,73 l-7,-1.5 M75.5,77 l-7,-2.5"/></g>';

    return (
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="' + size +
      '" height="' + size + '" role="img" aria-label="chibi catgirl avatar for ' + esc(seed) + '">' +
      '<defs>' +
      '<radialGradient id="' + id + 'bg" cx="50%" cy="32%" r="78%">' +
      '<stop offset="0%" stop-color="' + t.bg[1] + '"/>' +
      '<stop offset="100%" stop-color="' + t.bg[0] + '"/></radialGradient>' +
      '<radialGradient id="' + id + 'face" cx="50%" cy="42%" r="62%">' +
      '<stop offset="60%" stop-color="' + skin + '"/>' +
      '<stop offset="100%" stop-color="' + mix(skin, skinShade, 0.75) + '"/></radialGradient>' +
      irisGrads +
      '<clipPath id="' + id + 'c"><rect width="100" height="100" rx="' +
      (opts.round === false ? 0 : 16) + '"/></clipPath>' +
      '</defs>' +

      '<g clip-path="url(#' + id + 'c)">' +
      '<rect width="100" height="100" fill="url(#' + id + 'bg)"/>' +
      // soft light behind the head so the silhouette separates from the bg
      '<circle cx="50" cy="46" r="40" fill="#fff" opacity=".05"/>' +

      '<g transform="rotate(' + t.tilt + ' 50 55)">' +
      drawHairBack(t) +
      drawEars(t) +

      // body: narrow chibi shoulders, barely there
      '<path d="M43,78 h14 v9 h-14 Z" fill="' + mix(skin, skinShade, 0.8) + '"/>' +
      '<path d="M31,100 C33,88 40,84 50,84 C60,84 67,88 69,100 Z" fill="' + t.clothes[0] +
        '" stroke="' + line(t.clothes[1]) + '" stroke-width="1.6" stroke-linejoin="round"/>' +
      '<path d="M50,84 l-4.5,16 h9 Z" fill="' + t.clothes[1] + '"/>' +

      // head
      '<path d="' + HEAD + '" fill="url(#' + id + 'face)" stroke="' + skinInk +
        '" stroke-width="1.6" stroke-linejoin="round"/>' +
      // chin/jaw shading
      '<path d="M34,74 C40,80 60,80 66,74" fill="none" stroke="' + skinShade +
        '" stroke-width="2" opacity=".35" stroke-linecap="round"/>' +

      drawHairFront(t) +
      whiskers + freckles + blush +
      drawEyes(t, id) +
      drawFace(t) +
      drawExtra(t) +
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
