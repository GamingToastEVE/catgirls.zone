/*!
 * nyavatar.js — deterministic catgirl avatars as SVG
 * catgirls.zone · public domain (CC0)
 *
 * Same seed in, same catgirl out. No network, no canvas, no deps.
 *   nyavatar("mia")                      -> "<svg …>"  (anime)
 *   nyavatar("mia", { style: "chibi" })
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

  // The tone every outline mixes toward. Anime art lines are warm and much
  // lower contrast than a flat dark outline, so each style picks its own.
  // Set once per render at the top of svg(); rendering is synchronous.
  var INK_DARK = [58, 44, 72];
  var INK_WARM = [138, 96, 88];
  var INK = INK_DARK;

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
  function line(c) { return mix(c, INK, INK === INK_WARM ? 0.45 : 0.62); }
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
    ["#d09a72", "#ad7752"], ["#a3714d", "#7f5233"], ["#fff0e6", "#efd2c1"]
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

  // Anime portraits sit on soft paper, not a dark vignette.
  var BACKGROUNDS_SOFT = [
    ["#f7ecd8", "#fffaf0"], ["#e6f2ea", "#f7fdf8"], ["#f7e7ee", "#fff7fb"],
    ["#e7ecf7", "#f8fbff"], ["#f2f0e2", "#fdfcf2"], ["#f7ebe2", "#fff8f2"]
  ];

  /* ---------- helpers -------------------------------------------------- */

  function pick(r, arr) { return arr[Math.floor(r() * arr.length)]; }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function n(v) { return Math.round(v * 100) / 100; }

  // Four-pointed star with concave sides.
  function sparkle(x, y, r) {
    var i = r * 0.22;
    return '<path d="M' + x + ',' + (y - r) +
      ' C' + x + ',' + (y - i) + ' ' + (x + i) + ',' + y + ' ' + (x + r) + ',' + y +
      ' C' + (x + i) + ',' + y + ' ' + x + ',' + (y + i) + ' ' + x + ',' + (y + r) +
      ' C' + x + ',' + (y + i) + ' ' + (x - i) + ',' + y + ' ' + (x - r) + ',' + y +
      ' C' + (x - i) + ',' + y + ' ' + x + ',' + (y - i) + ' ' + x + ',' + (y - r) + ' Z"/>';
  }

  /* ---------- traits --------------------------------------------------- */

  function traits(seed) {
    var r = rng(hash(String(seed)));
    return withBg({
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
      bgIndex: Math.floor(r() * BACKGROUNDS.length),
      blush: r() < 0.7,
      freckles: r() < 0.28,
      heterochromia: r() < 0.12,
      altEyeColor: pick(r, EYE_COLORS),
      tilt: (r() * 7 - 3.5).toFixed(2)
    });
  }

  function withBg(t) {
    t.bg = BACKGROUNDS[t.bgIndex];
    return t;
  }

  /* =====================================================================
   * Geometry. Everything lives in a 100x100 viewBox. The two styles differ only
   * in proportion and silhouette — eyes, mouth, blush and accessories are
   * drawn by shared code that reads the numbers out of the style object.
   *
   *   anime — narrow face, pointed chin, almond eyes, visible neck
   *   chibi — enormous round head, huge circular eyes, no neck
   * ===================================================================== */

  var G = {};

  /* ---------- chibi ----------------------------------------------------- */

  G.chibi = {
    head: "M50,20 C69,20 79,34 79,52 C79,66 71,78 60,82 " +
          "C56,83.5 44,83.5 40,82 C29,78 21,66 21,52 C21,34 31,20 50,20 Z",
    eyeY: 60, eyeL: 36.5, eyeR: 63.5, eyeRX: 8, eyeRY: 10,
    browY: 45, noseY: 68.5, mouthY: 72.5, blushY: 68, blushX: 31,
    whiskers: true, whiskerY: 73, jaw: "M34,74 C40,80 60,80 66,74",

    // A plain ellipse, expressed as a path so the shared eye renderer can
    // clip and stroke it the same way as the anime almond.
    eyeShape: function (cx, ry, rx) {
      var y = G.chibi.eyeY;
      return "M" + (cx - rx) + "," + y +
             " a" + rx + "," + ry + " 0 1,0 " + (2 * rx) + ",0" +
             " a" + rx + "," + ry + " 0 1,0 " + (-2 * rx) + ",0 Z";
    },
    upperLid: function (cx, ry, rx, drop) {
      var y = G.chibi.eyeY, o = cx < 50 ? -1 : 1;
      return "M" + (cx - rx - 1) + "," + (y - ry * 0.55 + drop) +
             " Q" + cx + "," + (y - ry - 3.2 + drop) + " " + (cx + rx + 1) + "," +
             (y - ry * 0.5 + drop) + " l" + (o * 3.5) + ",-2.5";
    }
  };

  /* ---------- anime ----------------------------------------------------- */

  G.anime = {
    // Softer jaw than a wedge: the reference face is round with a small chin.
    head: "M50,17 C64,17 71,27 71,42 C71,52 68,60 63,66 " +
          "C59,71 55,75 50,75 C45,75 41,71 37,66 " +
          "C32,60 29,52 29,42 C29,27 36,17 50,17 Z",
    eyeY: 52, eyeL: 38.5, eyeR: 61.5, eyeRX: 7.4, eyeRY: 7.6,
    browY: 39.5, noseY: 62, mouthY: 66.5, blushY: 59, blushX: 32,
    whiskers: false, // on a narrow face they read as scars, not whiskers
    jaw: "",
    painterly: true, // own eye/face renderers, soft shading, layered hair
    lift: -6
  };

  /* ---------- ears ------------------------------------------------------ */

  function drawEars(t, g, anime) {
    var base = t.hairColor[0], ink = line(t.hairColor[1]);
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
    // Anime ears are a touch narrower and set closer to the skull.
    var out = (t.ears === "big" ? 6 : 0) + (anime ? 3 : 0);
    var up = (t.ears === "big" ? 6 : 0) + (anime ? 3 : 0);
    var lx = (anime ? 24 : 19) - out, ly = (anime ? 4 : 8) - up;
    var rx = (anime ? 76 : 81) + out, ry = ly;
    var tuft = t.ears === "tufted"
      ? '<g stroke="' + lift(base) + '" stroke-width="1.8" stroke-linecap="round" fill="none">' +
        '<path d="M26,24 l-5,-6 M29,22 l-3,-7 M74,24 l5,-6 M71,22 l3,-7"/></g>'
      : "";

    // Anime ears are bigger and sit inward on the crown; hugging the outer
    // edge made them look like thin fins.
    var b1 = anime ? 32 : 28, b2 = anime ? 49 : 45, by1 = anime ? 32 : 34;
    return '<g ' + s + '>' +
      '<path d="M' + b1 + ',' + by1 + ' C' + (b1 - 6) + ',25 ' + lx + ',15 ' + lx + ',' + ly +
        ' C' + (lx + 12) + ',' + (ly + 6) + ' ' + (b2 - 3) + ',21 ' + b2 + ',28 Z" fill="' + base + '"/>' +
      '<path d="M' + (100 - b1) + ',' + by1 + ' C' + (100 - b1 + 6) + ',25 ' + rx + ',15 ' +
        rx + ',' + ry + ' C' + (rx - 12) + ',' + (ry + 6) + ' ' + (100 - b2 + 3) + ',21 ' +
        (100 - b2) + ',28 Z" fill="' + base + '"/>' +
      '</g>' +
      '<path d="M30,30 C27,24 ' + (lx + 4) + ',18 ' + (lx + 4) + ',' + (ly + 5) +
        ' C' + (lx + 12) + ',' + (ly + 10) + ' 38,23 40,27 Z" fill="' + inner + '"/>' +
      '<path d="M70,30 C73,24 ' + (rx - 4) + ',18 ' + (rx - 4) + ',' + (ry + 5) +
        ' C' + (rx - 12) + ',' + (ry + 10) + ' 62,23 60,27 Z" fill="' + inner + '"/>' +
      tuft +
      // inner fur — the fluff is most of what makes them read as cat ears
      (anime
        ? '<g fill="' + lift(base) + '" opacity=".85">' +
          '<path d="M31,29 C29,24 ' + (lx + 6) + ',20 ' + (lx + 6) + ',' + (ly + 8) +
            ' C' + (lx + 12) + ',' + (ly + 12) + ' 37,23 39,27 Z"/>' +
          '<path d="M69,29 C71,24 ' + (rx - 6) + ',20 ' + (rx - 6) + ',' + (ry + 8) +
            ' C' + (rx - 12) + ',' + (ry + 12) + ' 63,23 61,27 Z"/></g>'
        : "");
  }

  /* ---------- hair: chibi ----------------------------------------------- */

  function chibiHairBack(t) {
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

  function chibiHairFront(t) {
    var base = t.hairColor[0], ink = line(t.hairColor[1]);
    var s = ' fill="' + base + '" stroke="' + ink + '" stroke-width="1.6" stroke-linejoin="round"';

    var fringe = {
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

    return '<path d="M21,44 C17,54 18,64 22,72 C25,66 24,54 26,46 Z"' + s + '/>' +
      '<path d="M79,44 C83,54 82,64 78,72 C75,66 76,54 74,46 Z"' + s + '/>' +
      '<path d="' + fringe + '"' + s + '/>' +
      '<path d="M31,30 C38,23 62,23 69,30" fill="none" stroke="' + lift(base) +
      '" stroke-width="4.5" stroke-linecap="round" opacity=".7"/>';
  }

  function chibiBody(t, skin) {
    return '<path d="M43,78 h14 v9 h-14 Z" fill="' + mix(skin[0], skin[1], 0.8) + '"/>' +
      '<path d="M31,100 C33,88 40,84 50,84 C60,84 67,88 69,100 Z" fill="' + t.clothes[0] +
      '" stroke="' + line(t.clothes[1]) + '" stroke-width="1.6" stroke-linejoin="round"/>' +
      '<path d="M50,84 l-4.5,16 h9 Z" fill="' + t.clothes[1] + '"/>';
  }

  /* ---------- anime: hair, face, body -----------------------------------
   * Flat shapes with hard edges is what made earlier passes look like clip
   * art. Everything here is built from gradients, blurred shading layers and
   * overlapping tapered locks instead.
   * -------------------------------------------------------------------- */

  // A tapered lock: wide at the crown, narrowing to a point at (tx, ty).
  function lock(cx, tx, ty, w) {
    return "M" + n(cx - w) + ",14" +
      " C" + n(cx - w) + "," + n(ty * 0.45) +
        " " + n(tx - w * 0.75) + "," + n(ty - 12) +
        " " + n(tx) + "," + n(ty) +
      " C" + n(tx + w * 0.75) + "," + n(ty - 12) +
        " " + n(cx + w) + "," + n(ty * 0.45) +
        " " + n(cx + w) + ",14 Z";
  }

  function animeHairBack(t, id) {
    var fill = ' fill="url(#' + id + 'hair)"';
    var s = fill + ' stroke="url(#' + id + 'hairline)" stroke-width="1.1" stroke-linejoin="round"';

    // wavy hem so long hair does not end in a ruler-straight cut
    var hem = "C74,86 78,96 76,118 L24,118 C22,96 26,86 24,70";

    switch (t.hair) {
      case "long":
      case "hime":
        return '<path d="M19,46 C19,11 33,2 50,2 C67,2 81,11 81,46 ' +
               'C81,62 84,78 86,92 C87,101 85,110 86,118 L14,118 ' +
               'C15,110 13,101 14,92 C16,78 19,62 19,46 Z"' + s + '/>' +
               '<path d="M24,70 ' + hem + '" fill="none" stroke="url(#' + id +
               'hairline)" stroke-width="1" opacity=".5"/>';
      case "twintails":
        return '<path d="M20,46 C20,12 33,3 50,3 C67,3 80,12 80,46 L80,64 ' +
               'C64,70 36,70 20,64 Z"' + s + '/>' +
               '<path d="M24,34 C7,42 3,70 8,92 C10,104 12,118 17,118 L31,118 ' +
               'C22,96 19,62 31,40 Z"' + s + '/>' +
               '<path d="M76,34 C93,42 97,70 92,92 C90,104 88,118 83,118 L69,118 ' +
               'C78,96 81,62 69,40 Z"' + s + '/>';
      case "ponytail":
        return '<path d="M20,46 C20,12 33,3 50,3 C67,3 80,12 80,46 L80,64 ' +
               'C64,70 36,70 20,64 Z"' + s + '/>' +
               '<path d="M74,26 C96,36 98,74 90,100 C87,110 82,112 83,100 ' +
               'C89,68 87,42 69,32 Z"' + s + '/>';
      case "buns":
        return '<path d="M20,46 C20,12 33,3 50,3 C67,3 80,12 80,46 L80,66 ' +
               'C64,72 36,72 20,66 Z"' + s + '/>' +
               '<circle cx="19" cy="21" r="11.5"' + s + '/>' +
               '<circle cx="81" cy="21" r="11.5"' + s + '/>' +
               '<path d="M13,21 C15,15 23,15 25,21 C23,27 15,27 13,21 Z" fill="' +
                 lift(t.hairColor[0]) + '" opacity=".45"/>' +
               '<path d="M75,21 C77,15 85,15 87,21 C85,27 77,27 75,21 Z" fill="' +
                 lift(t.hairColor[0]) + '" opacity=".45"/>';
      case "bob":
        return '<path d="M20,46 C20,13 33,3 50,3 C67,3 80,13 80,46 ' +
               'C80,60 78,70 75,78 C70,82 66,80 64,74 C58,80 42,80 36,74 ' +
               'C34,80 30,82 25,78 C22,70 20,60 20,46 Z"' + s + '/>';
      default: // messy
        return '<path d="M19,46 C19,11 33,2 50,2 C67,2 81,11 81,46 ' +
               'C82,60 86,72 88,86 L80,78 L82,92 L72,80 L70,90 L62,80 ' +
               'L56,90 L50,80 L44,90 L38,80 L30,90 L28,80 L18,92 L20,78 ' +
               'L12,86 C14,72 18,60 19,46 Z"' + s + '/>';
    }
  }

  function animeHairFront(t, id) {
    var base = t.hairColor[0];
    var s = ' fill="url(#' + id + 'hair)" stroke="url(#' + id +
            'hairline)" stroke-width="1" stroke-linejoin="round"';

    // Tips per style. Bangs stop above the brows at y=44.
    var tips = {
      hime: [[68, 37], [58, 38], [50, 37], [42, 38], [32, 37]],
      long: [[69, 36], [60, 39], [50, 35], [40, 39], [31, 36]],
      bob: [[67, 35], [58, 38], [50, 34], [42, 38], [33, 35]],
      twintails: [[67, 35], [59, 38], [50, 34], [41, 38], [33, 35]],
      messy: [[70, 36], [63, 41], [56, 35], [50, 40], [44, 35], [37, 41], [30, 36]],
      ponytail: [[66, 34], [55, 39], [45, 37], [33, 33]],
      buns: [[65, 34], [56, 37], [46, 37], [34, 34]]
    }[t.hair];

    // A smooth cap underneath so the locks never leave gaps, then the locks
    // themselves, overlapping — that layering is what reads as drawn hair.
    var cap = "M21,44 C21,13 34,3 50,3 C66,3 79,13 79,44";
    tips.forEach(function (p) {
      cap += " C" + (p[0] + 5) + "," + (p[1] - 7) +
             " " + (p[0] + 2) + "," + (p[1] - 1) + " " + p[0] + "," + p[1];
    });
    cap += " L21,44 Z";

    // Hard outlines on every lock turned the fringe into hatching, so the
    // separation is a soft stroke plus a blurred shadow under each lock.
    var lockLine = mix(t.hairColor[1], INK, 0.18);
    var locks = tips.map(function (p, i) {
      var w = 6 + (i % 3) * 1.8;
      var d = lock(50 + (p[0] - 50) * 0.42, p[0], p[1], w);
      return '<path d="' + d + '" fill="' + mix(t.hairColor[1], INK, 0.1) +
             '" opacity=".5" filter="url(#' + id + 'blur1)" transform="translate(1.5,1.5)"/>' +
             '<path d="' + d + '" fill="url(#' + id + 'hair)" stroke="' + lockLine +
             '" stroke-width=".8" stroke-linejoin="round"/>';
    }).join("");

    // Face-framing locks, long and pointed, falling past the jaw.
    var frame =
      '<path d="M25,32 C18,46 17,64 22,80 L29,58 C26,48 25,40 29,33 Z"' + s + '/>' +
      '<path d="M75,32 C82,46 83,64 78,80 L71,58 C74,48 75,40 71,33 Z"' + s + '/>';

    return frame +
      '<path d="' + cap + '" fill="' + mix(t.hairColor[1], INK, 0.12) + '" stroke="url(#' +
        id + 'hairline)" stroke-width="1" stroke-linejoin="round"/>' + locks +
      // sheen: a soft band with a broken lower edge, the anime hair highlight
      '<path d="M28,24 C36,15 64,15 72,24 C70,30 66,26 62,29 C58,32 54,26 50,29 ' +
      'C46,32 42,26 38,29 C34,32 30,29 28,24 Z" fill="' + lift(base) +
      '" opacity=".5" filter="url(#' + id + 'blur1)"/>' +
      // a few flyaway strands
      '<g fill="none" stroke="url(#' + id + 'hairline)" stroke-width=".9" ' +
      'stroke-linecap="round" opacity=".55">' +
      '<path d="M30,14 C24,20 21,28 21,36"/><path d="M70,14 C76,20 79,28 79,36"/>' +
      '<path d="M44,10 C40,16 38,22 38,28"/></g>';
  }

  function animeBody(t, skin, extra, id) {
    var base = skin[0], shade = skin[1], ink = mix(shade, INK, 0.32);

    var pendant = extra === "bell"
      ? '<circle cx="50" cy="86.5" r="3.8" fill="url(#' + id + 'gold)" stroke="#c8951f" stroke-width=".9"/>' +
        '<path d="M50,84.6 v3.8 M46.6,86.5 h6.8" stroke="#c8951f" stroke-width=".9"/>'
      : '<path d="M50,85.4 C48.9,83.2 46.2,83.2 46.2,85.5 C46.2,87.5 48.4,88.7 50,90 ' +
        'C51.6,88.7 53.8,87.5 53.8,85.5 C53.8,83.2 51.1,83.2 50,85.4 Z" fill="url(#' +
        id + 'gold)" stroke="#c8951f" stroke-width=".85" stroke-linejoin="round"/>';

    return (
      '<path d="M44,64 C44,73 43,77 41,80 L59,80 C57,77 56,73 56,64 Z" fill="' + base +
        '" stroke="' + ink + '" stroke-width="1" stroke-linejoin="round"/>' +
      '<path d="M50,78 C33,78 18,88 13,118 L87,118 C82,88 67,78 50,78 Z" fill="' + base +
        '" stroke="' + ink + '" stroke-width="1" stroke-linejoin="round"/>' +
      // shadow the chin casts down the neck, and the hollow above the collarbone
      '<path d="M41,64 C44,74 56,74 59,64 C58,78 42,78 41,64 Z" fill="' + shade +
        '" opacity=".75" filter="url(#' + id + 'blur2)"/>' +
      '<g fill="none" stroke="' + shade + '" stroke-width="1.4" stroke-linecap="round" ' +
      'opacity=".45" filter="url(#' + id + 'blur1)">' +
      '<path d="M41,87 C44,90 46.5,91 48,90.5"/><path d="M59,87 C56,90 53.5,91 52,90.5"/>' +
      '<path d="M50,84 v5"/></g>' +
      // off-shoulder top, one connected garment
      '<path d="M11,118 C9,98 14,88 22,86 C29,84.5 33,90 38,92 ' +
        'C42,93.5 46,94 50,94 C54,94 58,93.5 62,92 ' +
        'C67,90 71,84.5 78,86 C86,88 91,98 89,118 Z" fill="url(#' + id + 'cloth)' +
        '" stroke="' + line(t.clothes[1]) + '" stroke-width="1.1" stroke-linejoin="round"/>' +
      '<path d="M38,92 C42,93.5 46,94 50,94 C54,94 58,93.5 62,92" fill="none" stroke="' +
        t.clothes[1] + '" stroke-width="1.2" opacity=".75"/>' +
      '<g fill="none" stroke="' + t.clothes[1] + '" stroke-width="1" opacity=".45" ' +
      'filter="url(#' + id + 'blur1)">' +
      '<path d="M27,88 C25,96 25,108 26,118"/><path d="M73,88 C75,96 75,108 74,118"/></g>' +
      // choker
      '<path d="M42,76 C45,78.5 55,78.5 58,76 L58,80 C55,82.5 45,82.5 42,80 Z" ' +
        'fill="#f2607d" stroke="' + line("#f2607d") + '" stroke-width="1" stroke-linejoin="round"/>' +
      '<path d="M42.5,77 C45.5,79 54.5,79 57.5,77" fill="none" stroke="#ff9db5" ' +
        'stroke-width=".9" opacity=".8"/>' +
      pendant
    );
  }

  /* ---------- anime eyes ------------------------------------------------
   * Drawn on their own rather than through the shared renderer: the iris
   * wants a radial gradient, spokes, an inner shadow under the lid and three
   * separate highlights, and the lash wants to be a tapered shape.
   * -------------------------------------------------------------------- */

  function animeEyes(t, id) {
    var g = G.anime, lash = "#4a3348";
    var open = t.eyes !== "closed" && t.eyes !== "wink";

    function eye(cx, i, drop) {
      var rx = g.eyeRX, ry = g.eyeRY, o = cx < 50 ? -1 : 1;
      var y = g.eyeY + drop;
      var iy = y - ry * 0.05, ir = ry * 1.32;
      var d = animeEyeClip(cx, rx, ry, drop);

      return (
        '<path d="' + d + '" fill="#fffdfa"/>' +
        '<g clip-path="url(#' + id + 'eye' + i + '")>' +
        // iris
        '<ellipse cx="' + cx + '" cy="' + n(iy) + '" rx="' + n(ir * 0.86) + '" ry="' +
          n(ir) + '" fill="url(#' + id + 'iris' + i + ')"/>' +
        // spokes, faint
        '<g stroke="' + mix(i ? t2c(t, 1) : t2c(t, 0), INK, 0.4) +
          '" stroke-width=".6" opacity=".45">' +
        [0, 1, 2, 3, 4, 5].map(function (k) {
          var ang = (k / 6) * Math.PI * 2;
          return '<path d="M' + n(cx + Math.cos(ang) * ir * 0.3) + ',' +
            n(iy + Math.sin(ang) * ir * 0.3) + ' L' + n(cx + Math.cos(ang) * ir * 0.8) +
            ',' + n(iy + Math.sin(ang) * ir * 0.85) + '"/>';
        }).join("") + '</g>' +
        // pupil
        '<ellipse cx="' + cx + '" cy="' + n(iy) + '" rx="' + n(ir * 0.34) + '" ry="' +
          n(ir * 0.5) + '" fill="#3b2a3f"/>' +
        // light pooling along the bottom rim of the iris
        '<ellipse cx="' + cx + '" cy="' + n(iy + ir * 0.62) + '" rx="' + n(ir * 0.6) +
          '" ry="' + n(ir * 0.3) + '" fill="' + lift(t2c(t, i)) + '" opacity=".9" ' +
          'filter="url(#' + id + 'blur1)"/>' +
        // shadow the upper lid casts into the eye
        '<path d="' + d + '" fill="none" stroke="' + mix(t2c(t, i), INK, 0.72) +
          '" stroke-width="4" opacity=".45" transform="translate(0,-2.4)" ' +
          'filter="url(#' + id + 'blur1)"/>' +
        '</g>' +
        // highlights
        '<ellipse cx="' + n(cx - o * 2.6) + '" cy="' + n(y - ry * 0.7) + '" rx="2.9" ry="2.4" fill="#fff"/>' +
        '<circle cx="' + n(cx + o * 2.8) + '" cy="' + n(y + ry * 0.62) + '" r="1.4" fill="#fff" opacity=".95"/>' +
        '<ellipse cx="' + cx + '" cy="' + n(y - ry * 0.95) + '" rx="' + n(rx * 0.55) +
          '" ry="1.5" fill="#fff" opacity=".4" filter="url(#' + id + 'blur1)"/>' +
        (t.eyes === "sparkle"
          ? sparkleAt(cx + o * 3.6, y - ry * 0.15, 2.4, "#fff")
          : "") +
        // lash: tapered, thin inside, heavy at the outer corner, with a flick
        '<path d="M' + n(cx - o * rx) + ',' + n(y + ry * 0.3) +
          ' C' + n(cx - o * rx * 0.7) + ',' + n(y - ry * 1) +
          ' ' + n(cx + o * rx * 0.2) + ',' + n(y - ry * 1.4) +
          ' ' + n(cx + o * rx * 1.02) + ',' + n(y - ry * 0.6) +
          ' L' + n(cx + o * rx * 1.04) + ',' + n(y - ry * 1.42) +
          ' C' + n(cx + o * rx * 0.7) + ',' + n(y - ry * 1.15) +
          ' ' + n(cx - o * rx * 0.3) + ',' + n(y - ry * 0.75) +
          ' ' + n(cx - o * rx * 0.82) + ',' + n(y + ry * 0.1) + ' Z" fill="' + lash + '"/>' +
        // lid crease
        '<path d="M' + n(cx - o * rx * 0.7) + ',' + n(y - ry * 1.5) +
          ' C' + n(cx - o * rx * 0.1) + ',' + n(y - ry * 2) +
          ' ' + n(cx + o * rx * 0.7) + ',' + n(y - ry * 1.9) +
          ' ' + n(cx + o * rx * 1.05) + ',' + n(y - ry * 1.15) +
          '" fill="none" stroke="' + mix(t.skin[1], INK, 0.4) +
          '" stroke-width=".9" stroke-linecap="round" opacity=".65"/>' +
        // lower lid, lighter than the lash
        '<path d="M' + n(cx - o * rx * 0.55) + ',' + n(y + ry * 1.25) +
          ' C' + n(cx + o * rx * 0.2) + ',' + n(y + ry * 1.4) +
          ' ' + n(cx + o * rx * 0.8) + ',' + n(y + ry * 0.95) +
          ' ' + n(cx + o * rx * 1.02) + ',' + n(y + ry * 0.35) +
          '" fill="none" stroke="' + mix(lash, t.skin[0], 0.35) +
          '" stroke-width="1.2" stroke-linecap="round"/>'
      );
    }

    function closed(cx, drop) {
      var o = cx < 50 ? -1 : 1, y = g.eyeY + drop;
      return '<path d="M' + n(cx - o * g.eyeRX) + ',' + n(y) +
        ' C' + n(cx - o * g.eyeRX * 0.3) + ',' + n(y - g.eyeRY * 1.3) +
        ' ' + n(cx + o * g.eyeRX * 0.5) + ',' + n(y - g.eyeRY * 1.2) +
        ' ' + n(cx + o * g.eyeRX) + ',' + n(y - g.eyeRY * 0.2) +
        '" fill="none" stroke="' + lash + '" stroke-width="2.2" stroke-linecap="round"/>' +
        '<path d="M' + n(cx + o * g.eyeRX) + ',' + n(y - g.eyeRY * 0.2) + ' l' +
        n(o * 3) + ',-2.4" stroke="' + lash + '" stroke-width="1.8" stroke-linecap="round"/>';
    }

    var drop = t.eyes === "sleepy" ? 1.6 : 0;
    var brows =
      '<g fill="none" stroke="' + mix(t.hairColor[1], INK, 0.35) +
      '" stroke-width="1.6" stroke-linecap="round" opacity=".85">' +
      '<path d="M32.5,42.5 C35,39.5 42,39 45,41.5"/>' +
      '<path d="M67.5,42.5 C65,39.5 58,39 55,41.5"/></g>';

    var left = open || t.eyes === "wink" ? eye(g.eyeL, 0, drop) : closed(g.eyeL, drop);
    var right = open ? eye(g.eyeR, 1, drop) : closed(g.eyeR, drop);
    return brows + left + right;
  }

  // eye colour for side i, honouring heterochromia
  function t2c(t, i) {
    return i && t.heterochromia ? t.altEyeColor : t.eyeColor;
  }

  function sparkleAt(x, y, r, fill) {
    return '<g fill="' + fill + '">' + sparkle(n(x), n(y), r) + '</g>';
  }

  /* ---------- anime nose + mouth ---------------------------------------- */

  function animeFace(t, id) {
    var ink = mix(t.skin[1], INK, 0.42);
    var my = G.anime.mouthY;
    var nose = '<path d="M50,' + (G.anime.noseY - 1.2) + ' C51.8,' + G.anime.noseY +
               ' 51.4,' + (G.anime.noseY + 1) + ' 49.4,' + (G.anime.noseY + 0.8) +
               ' Z" fill="' + ink + '" opacity=".5" filter="url(#' + id + 'blur1)"/>';
    var mouth;

    switch (t.mouth) {
      case "open":
        // small open smile with a tongue, like the reference
        mouth = '<path d="M46.5,' + my + ' C48,' + (my + 5) + ' 52,' + (my + 5) +
                ' 53.5,' + my + ' C51,' + (my + 1.4) + ' 49,' + (my + 1.4) + ' 46.5,' + my +
                ' Z" fill="#a8405c" stroke="' + ink + '" stroke-width=".9" stroke-linejoin="round"/>' +
                '<path d="M48.3,' + (my + 3) + ' C49,' + (my + 4.8) + ' 51,' + (my + 4.8) +
                ' 51.7,' + (my + 3) + ' C50.5,' + (my + 2.4) + ' 49.5,' + (my + 2.4) +
                ' 48.3,' + (my + 3) + ' Z" fill="#f58aa5"/>';
        break;
      case "cat":
        mouth = '<path d="M46.5,' + my + ' C47.8,' + (my + 2.4) + ' 49,' + (my + 2.4) +
                ' 50,' + my + ' C51,' + (my + 2.4) + ' 52.2,' + (my + 2.4) + ' 53.5,' + my +
                '" fill="none" stroke="' + ink + '" stroke-width="1.3" ' +
                'stroke-linecap="round" stroke-linejoin="round"/>';
        break;
      case "smug":
        mouth = '<path d="M47,' + (my + 1) + ' C50,' + (my + 3) + ' 53,' + (my + 2) +
                ' 54,' + (my - 1) + '" fill="none" stroke="' + ink +
                '" stroke-width="1.3" stroke-linecap="round"/>';
        break;
      case "flat":
        mouth = '<path d="M47.5,' + (my + 1) + ' h5" stroke="' + ink +
                '" stroke-width="1.3" stroke-linecap="round"/>';
        break;
      default:
        mouth = '<path d="M47,' + my + ' C48.5,' + (my + 3) + ' 51.5,' + (my + 3) +
                ' 53,' + my + '" fill="none" stroke="' + ink +
                '" stroke-width="1.3" stroke-linecap="round"/>';
    }
    return nose + mouth;
  }

  /* ---------- eyes (shared, driven by the style geometry) --------------- */

  function drawEyes(t, g, id) {
    var lc = t.eyeColor, rc = t.heterochromia ? t.altEyeColor : t.eyeColor;
    var lash = "#3a2c48";
    var brow = line(t.hairColor[1]);

    function closedEye(cx) {
      return '<path d="M' + (cx - 7) + ',' + (g.eyeY + 1) + ' Q' + cx + ',' +
        (g.eyeY - 5) + ' ' + (cx + 7) + ',' + (g.eyeY + 1) +
        '" fill="none" stroke="' + lash + '" stroke-width="2.4" stroke-linecap="round"/>';
    }

    function o(cx) { return cx < 50 ? -1 : 1; }

    function openEye(cx, color, i) {
      var rx = g.eyeRX, ry = g.eyeRY, drop = 0;
      if (t.eyes === "sleepy") drop = 3;
      if (t.eyes === "sharp") { ry *= 0.82; rx *= 1.02; }

      var shape = g.eyeShape(cx, ry, rx);
      var iris = g.eyeY + 0.6 + drop * 0.5;
      var irisR = Math.min(rx * 0.78, ry * 0.8);
      var top = g.eyeY - ry + drop;

      return (
        '<path d="' + shape + '" fill="#fffafd"/>' +
        '<g clip-path="url(#' + id + 'e' + i + ')">' +
        // iris: gradient body, dark rim, deep pupil, light pooling low
        '<ellipse cx="' + cx + '" cy="' + n(iris) + '" rx="' + n(irisR) + '" ry="' +
          n(irisR * 1.14) + '" fill="url(#' + id + 'i' + i + ')"/>' +
        '<ellipse cx="' + cx + '" cy="' + n(iris) + '" rx="' + n(irisR) + '" ry="' +
          n(irisR * 1.14) + '" fill="none" stroke="' + mix(color, INK, 0.5) +
          '" stroke-width="1.2"/>' +
        '<ellipse cx="' + cx + '" cy="' + n(iris) + '" rx="' + n(irisR * 0.42) +
          '" ry="' + n(irisR * 0.7) + '" fill="#2a2136"/>' +
        '<ellipse cx="' + cx + '" cy="' + n(iris + irisR * 0.62) + '" rx="' +
          n(irisR * 0.62) + '" ry="' + n(irisR * 0.3) + '" fill="' + lift(color) +
          '" opacity=".9"/>' +
        // shadow cast by the upper lid — the detail that gives eyes depth
        '<path d="' + shape + '" fill="none" stroke="' + mix(color, INK, 0.65) +
          '" stroke-width="3" opacity=".5" transform="translate(0,-2)"/>' +
        '</g>' +
        // highlights, stacked: broad sheen across the top of the iris, a round
        // catchlight, and a small glint low on the far side
        (g.glossy
          ? '<g clip-path="url(#' + id + 'e' + i + ')">' +
            '<ellipse cx="' + cx + '" cy="' + n(top + 4) + '" rx="' + n(rx * 0.72) +
              '" ry="' + n(ry * 0.3) + '" fill="#fff" opacity=".55"/></g>'
          : "") +
        '<circle cx="' + n(cx - 2.7) + '" cy="' + n(top + 3.8) + '" r="2.6" fill="#fff"/>' +
        '<circle cx="' + n(cx + 2.8) + '" cy="' + n(g.eyeY + 4.4) + '" r="1.3" fill="#fff" opacity=".95"/>' +
        (t.eyes === "sparkle"
          ? '<path d="M' + n(cx + 3.4) + ',' + n(top + 1.8) +
            ' l1,2.2 2.2,1 -2.2,1 -1,2.2 -1,-2.2 -2.2,-1 2.2,-1 Z" fill="#fff"/>'
          : "") +
        (g.lash
          ? '<path d="' + g.lash(cx, ry, rx, drop) + '" fill="' + lash + '"/>' +
            '<path d="' + g.crease(cx, ry, rx, drop) + '" fill="none" stroke="' +
              mix(t.skin[1], INK, 0.5) + '" stroke-width="1" stroke-linecap="round" opacity=".7"/>'
          : '<path d="' + g.upperLid(cx, ry, rx, drop) + '" fill="none" stroke="' + lash +
            '" stroke-width="2.9" stroke-linecap="round"/>') +
        '<path d="M' + (cx - 5) + ',' + n(g.eyeY + ry * 0.8) + ' Q' + cx + ',' +
          n(g.eyeY + ry * 0.98) + ' ' + (cx + 5) + ',' + n(g.eyeY + ry * 0.8) +
          '" fill="none" stroke="' + mix(t.skin[1], INK, 0.35) +
          '" stroke-width="1" stroke-linecap="round" opacity=".75"/>' +
        // short lower lashes at the outer corner
        (g.glossy
          ? '<path d="M' + n(cx + o(cx) * rx * 0.8) + ',' + n(g.eyeY + ry * 0.66) +
            ' l' + n(o(cx) * 2) + ',2.2" stroke="' + lash +
            '" stroke-width="1.3" stroke-linecap="round" fill="none" opacity=".75"/>'
          : "")
      );
    }

    var by = g.browY;
    var brows =
      '<g fill="none" stroke="' + brow + '" stroke-width="2" stroke-linecap="round" opacity=".9">' +
      '<path d="M' + (g.eyeL - 6.5) + ',' + (by + 0.5) + ' Q' + g.eyeL + ',' + (by - 2.5) +
        ' ' + (g.eyeL + 6.5) + ',' + by + '"/>' +
      '<path d="M' + (g.eyeR - 6.5) + ',' + by + ' Q' + g.eyeR + ',' + (by - 2.5) +
        ' ' + (g.eyeR + 6.5) + ',' + (by + 0.5) + '"/></g>';

    if (t.eyes === "closed") return brows + closedEye(g.eyeL) + closedEye(g.eyeR);
    if (t.eyes === "wink") return brows + openEye(g.eyeL, lc, 0) + closedEye(g.eyeR);
    return brows + openEye(g.eyeL, lc, 0) + openEye(g.eyeR, rc, 1);
  }

  /* ---------- nose + mouth (shared) ------------------------------------- */

  function drawFace(t, g) {
    var ink = mix(t.skin[1], INK, 0.4);
    var my = g.mouthY;
    var nose = '<path d="M48.6,' + g.noseY + ' q1.4,1.4 2.8,0" fill="none" stroke="' + ink +
               '" stroke-width="1.3" stroke-linecap="round" opacity=".85"/>';
    var mouth;

    switch (t.mouth) {
      case "cat":
        mouth = '<path d="M45.5,' + my + ' q2.3,3 4.5,0 q2.2,3 4.5,0" fill="none" stroke="' +
                ink + '" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>';
        break;
      case "smug":
        mouth = '<path d="M46,' + (my + 1) + ' q4.5,2.6 7,-1.6" fill="none" stroke="' + ink +
                '" stroke-width="1.6" stroke-linecap="round"/>';
        break;
      case "open":
        mouth = '<path d="M46,' + (my - 0.5) + ' q4,7 8,0 q-4,2 -8,0 Z" fill="#a13c58" stroke="' +
                ink + '" stroke-width="1.1" stroke-linejoin="round"/>' +
                '<path d="M48,' + (my + 3) + ' q2,2.4 4,0 q-2,-1 -4,0 Z" fill="#f58aa5"/>';
        break;
      case "flat":
        mouth = '<path d="M46.5,' + (my + 1) + ' h7" stroke="' + ink +
                '" stroke-width="1.6" stroke-linecap="round"/>';
        break;
      default:
        mouth = '<path d="M46,' + my + ' q4,4 8,0" fill="none" stroke="' + ink +
                '" stroke-width="1.6" stroke-linecap="round"/>';
    }
    return nose + mouth;
  }

  /* ---------- accessories ------------------------------------------------ */

  function drawExtra(t, anime) {
    // The collar rides on the neck in anime and straight on the chest in chibi.
    var collarY = anime ? 90 : 88;
    switch (t.extra) {
      case "bell":
        return '<path d="M' + (anime ? 41 : 33) + ',' + collarY + ' C' + (anime ? 45 : 40) + ',' +
          (collarY + 3) + ' ' + (anime ? 55 : 60) + ',' + (collarY + 3) + ' ' +
          (anime ? 59 : 67) + ',' + collarY + ' L' + (anime ? 59 : 67) + ',' + (collarY + 4) +
          ' C' + (anime ? 55 : 60) + ',' + (collarY + 7) + ' ' + (anime ? 45 : 40) + ',' +
          (collarY + 7) + ' ' + (anime ? 41 : 33) + ',' + (collarY + 4) + ' Z" fill="#e04f6b" ' +
          'stroke="' + line("#e04f6b") + '" stroke-width="1.4" stroke-linejoin="round"/>' +
          '<circle cx="50" cy="' + (collarY + 7) + '" r="4.2" fill="#ffd166" stroke="#b8860b" stroke-width="1.2"/>' +
          '<path d="M50,' + (collarY + 5) + ' v4 M46,' + (collarY + 7) + ' h8" stroke="#b8860b" stroke-width="1.1"/>' +
          '<circle cx="48.3" cy="' + (collarY + 5.6) + '" r="1" fill="#fff5cc"/>';
      case "ribbon":
        var rx = anime ? 70 : 68, ry = anime ? 24 : 28;
        return '<g transform="translate(' + (rx - 68) + ',' + (ry - 28) + ')" stroke="' +
          line("#e04f6b") + '" stroke-width="1.4" stroke-linejoin="round" fill="#f2607d">' +
          '<path d="M68,28 C74,22 80,24 79,29 C78,33 72,33 68,30 Z"/>' +
          '<path d="M68,30 C64,34 58,35 58,30 C58,25 64,25 68,28 Z"/>' +
          '<circle cx="68" cy="29" r="3"/></g>';
      case "bandaid":
        return '<g transform="rotate(-20 ' + (anime ? 64 : 66) + ' ' + (anime ? 48 : 50) + ')">' +
          '<rect x="' + (anime ? 58 : 59) + '" y="' + (anime ? 45 : 46.5) +
          '" width="13" height="6" rx="3" fill="#ffdfc0" stroke="#dfae82" stroke-width="1.2"/>' +
          '<rect x="' + (anime ? 62 : 63.5) + '" y="' + (anime ? 46.2 : 47.8) +
          '" width="5" height="3.6" rx="1" fill="#f4cba4"/></g>';
      case "flower":
        return '<g transform="translate(' + (anime ? 30 : 28) + ',' + (anime ? 24 : 28) +
          ')" stroke="' + line("#ff8fb0") + '" stroke-width="1.1"><g fill="#ffa8c5">' +
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
    var style = opts.style === "chibi" ? "chibi" : "anime";
    var anime = style === "anime";
    var g = G[style];
    var t = traits(seed);
    var size = opts.size || 256;
    var id = "n" + hash(String(seed)).toString(36) + style.charAt(0) + "_";

    INK = anime ? INK_WARM : INK_DARK;
    var bg = (anime ? BACKGROUNDS_SOFT : BACKGROUNDS)[t.bgIndex];
    var skin = t.skin[0], skinShade = t.skin[1];
    var skinInk = mix(skinShade, INK, anime ? 0.3 : 0.42);
    var hairBase = t.hairColor[0], hairShade = t.hairColor[1];

    /* ---- defs ---- */

    var defs =
      '<radialGradient id="' + id + 'bg" cx="50%" cy="32%" r="78%">' +
      '<stop offset="0%" stop-color="' + bg[1] + '"/>' +
      '<stop offset="100%" stop-color="' + bg[0] + '"/></radialGradient>' +
      '<radialGradient id="' + id + 'face" cx="50%" cy="40%" r="62%">' +
      '<stop offset="58%" stop-color="' + skin + '"/>' +
      '<stop offset="100%" stop-color="' + mix(skin, skinShade, anime ? 0.5 : 0.7) +
      '"/></radialGradient>' +
      '<radialGradient id="' + id + 'bl">' +
      '<stop offset="0%" stop-color="#ff8fa3" stop-opacity=".6"/>' +
      '<stop offset="100%" stop-color="#ff8fa3" stop-opacity="0"/></radialGradient>' +
      '<clipPath id="' + id + 'c"><rect width="100" height="100" rx="' +
      (opts.round === false ? 0 : 16) + '"/></clipPath>';

    if (anime) {
      defs +=
        // hair: light at the crown, deeper at the ends, with a soft line colour
        '<linearGradient id="' + id + 'hair" x1="0" y1="0" x2="0" y2="1">' +
        '<stop offset="0%" stop-color="' + lift(hairBase) + '"/>' +
        '<stop offset="42%" stop-color="' + hairBase + '"/>' +
        '<stop offset="100%" stop-color="' + hairShade + '"/></linearGradient>' +
        '<linearGradient id="' + id + 'hairline" x1="0" y1="0" x2="0" y2="1">' +
        '<stop offset="0%" stop-color="' + mix(hairShade, INK, 0.3) + '"/>' +
        '<stop offset="100%" stop-color="' + mix(hairShade, INK, 0.5) + '"/></linearGradient>' +
        '<linearGradient id="' + id + 'cloth" x1="0" y1="0" x2="0" y2="1">' +
        '<stop offset="0%" stop-color="' + lift(t.clothes[0]) + '"/>' +
        '<stop offset="100%" stop-color="' + t.clothes[0] + '"/></linearGradient>' +
        '<linearGradient id="' + id + 'gold" x1="0" y1="0" x2="0" y2="1">' +
        '<stop offset="0%" stop-color="#ffe9a8"/><stop offset="100%" stop-color="#f0b73f"/>' +
        '</linearGradient>' +
        '<filter id="' + id + 'blur1" x="-40%" y="-40%" width="180%" height="180%">' +
        '<feGaussianBlur stdDeviation=".9"/></filter>' +
        '<filter id="' + id + 'blur2" x="-40%" y="-40%" width="180%" height="180%">' +
        '<feGaussianBlur stdDeviation="2"/></filter>' +
        '<clipPath id="' + id + 'head"><path d="' + g.head + '"/></clipPath>';

      [0, 1].forEach(function (i) {
        var c = t2c(t, i), cx = i ? g.eyeR : g.eyeL;
        var drop = t.eyes === "sleepy" ? 1.6 : 0;
        defs +=
          '<radialGradient id="' + id + 'iris' + i + '" cx="50%" cy="72%" r="72%">' +
          '<stop offset="0%" stop-color="' + lift(c) + '"/>' +
          '<stop offset="55%" stop-color="' + c + '"/>' +
          '<stop offset="100%" stop-color="' + mix(c, INK_DARK, 0.55) + '"/></radialGradient>' +
          '<clipPath id="' + id + 'eye' + i + '"><path d="' +
          animeEyeClip(cx, g.eyeRX, g.eyeRY, drop) + '"/></clipPath>';
      });
    } else {
      defs += chibiEyeDefs(t, g, id);
    }

    /* ---- soft shading, anime only ---- */

    var shading = !anime ? "" :
      '<g clip-path="url(#' + id + 'head)">' +
      // the fringe drops a shadow across the forehead
      '<path d="M21,10 C21,36 30,42 50,42 C70,42 79,36 79,10 Z" fill="' + skinShade +
        '" opacity=".38" filter="url(#' + id + 'blur2)"/>' +
      // cheeks and the underside of the jaw
      '<path d="M28,56 C27,66 32,74 38,78 L28,78 Z" fill="' + skinShade +
        '" opacity=".22" filter="url(#' + id + 'blur2)"/>' +
      '<path d="M72,56 C73,66 68,74 62,78 L72,78 Z" fill="' + skinShade +
        '" opacity=".22" filter="url(#' + id + 'blur2)"/>' +
      // a little light on the forehead and the bridge of the nose
      '<ellipse cx="50" cy="60" rx="7" ry="8" fill="#fff" opacity=".2" filter="url(#' +
        id + 'blur2)"/>' +
      '</g>';

    var bx = g.blushX, by = g.blushY;
    var blush = !t.blush ? ""
      : anime
        ? '<ellipse cx="' + bx + '" cy="' + by + '" rx="7" ry="4.4" fill="url(#' + id + 'bl)"/>' +
          '<ellipse cx="' + (100 - bx) + '" cy="' + by + '" rx="7" ry="4.4" fill="url(#' + id + 'bl)"/>'
        : '<g opacity=".5"><ellipse cx="' + bx + '" cy="' + by + '" rx="6" ry="3.6" fill="#ff8fa3"/>' +
          '<ellipse cx="' + (100 - bx) + '" cy="' + by + '" rx="6" ry="3.6" fill="#ff8fa3"/></g>' +
          '<g stroke="#ff7d97" stroke-width="1" stroke-linecap="round" opacity=".45">' +
          '<path d="M' + (bx - 3) + ',' + (by - 1) + ' l3,-2 M' + bx + ',' + (by + 1.5) +
          ' l3,-2 M' + (100 - bx + 3) + ',' + (by - 1) + ' l-3,-2 M' + (100 - bx) + ',' +
          (by + 1.5) + ' l-3,-2"/></g>';

    var fy = g.noseY + 1;
    var freckles = t.freckles
      ? '<g fill="' + skinShade + '" opacity="' + (anime ? ".65" : ".9") + '">' +
        '<circle cx="42" cy="' + fy + '" r=".8"/><circle cx="45" cy="' + (fy + 2) + '" r=".7"/>' +
        '<circle cx="55" cy="' + (fy + 2) + '" r=".7"/><circle cx="58" cy="' + fy + '" r=".8"/>' +
        '<circle cx="39.5" cy="' + (fy + 2.5) + '" r=".65"/>' +
        '<circle cx="60.5" cy="' + (fy + 2.5) + '" r=".65"/></g>'
      : "";

    var whiskers = g.whiskers
      ? '<g stroke="' + skinInk + '" stroke-width=".9" stroke-linecap="round" opacity=".4">' +
        '<path d="M24,' + g.whiskerY + ' l6,-1.5 M24.5,' + (g.whiskerY + 3.5) +
        ' l6,-2.5 M76,' + g.whiskerY + ' l-6,-1.5 M75.5,' + (g.whiskerY + 3.5) +
        ' l-6,-2.5"/></g>'
      : "";

    /* ---- assembly ---- */

    var headXf = "translate(0," + (g.lift || 0) + ") rotate(" + t.tilt + " 50 55)";

    return (
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="' + size +
      '" height="' + size + '" role="img" aria-label="' + style + ' catgirl avatar for ' +
      esc(seed) + '">' +
      '<defs>' + defs + '</defs>' +

      '<g clip-path="url(#' + id + 'c)">' +
      '<rect width="100" height="100" fill="url(#' + id + 'bg)"/>' +
      (anime
        ? '<g fill="#fff2b8" stroke="' + mix(bg[0], INK, 0.25) + '" stroke-width=".5">' +
          sparkle(13, 22, 3.4) + sparkle(87, 30, 2.6) + sparkle(20, 68, 2.2) +
          sparkle(84, 60, 3) + '</g>'
        : '<circle cx="50" cy="46" r="40" fill="#fff" opacity=".05"/>') +

      (anime ? '<g transform="translate(50,54) scale(.84) translate(-50,-54)">' : "") +

      // Back hair sits behind the torso — drawn inside the head group it
      // covered the shoulders and the whole figure read as a hooded blob.
      // It carries the head transform so it still lines up with the skull.
      (anime ? '<g transform="' + headXf + '">' + animeHairBack(t, id) + '</g>' : "") +
      (anime ? animeBody(t, t.skin, t.extra, id) : "") +

      '<g transform="' + headXf + '">' +
      (anime ? "" : chibiHairBack(t)) +
      drawEars(t, g, anime) +
      (anime ? "" : chibiBody(t, t.skin)) +

      '<path d="' + g.head + '" fill="url(#' + id + 'face)" stroke="' + skinInk +
        '" stroke-width="' + (anime ? 1 : 1.5) + '" stroke-linejoin="round"/>' +
      shading +
      (g.jaw
        ? '<path d="' + g.jaw + '" fill="none" stroke="' + skinShade +
          '" stroke-width="2" opacity=".3" stroke-linecap="round"/>'
        : "") +

      (anime ? "" : chibiHairFront(t)) +
      whiskers + freckles + blush +
      (anime ? animeEyes(t, id) : drawEyes(t, g, id)) +
      (anime ? animeFace(t, id) : drawFace(t, g)) +
      // in anime the bangs fall over the eyes, so the hair goes on last
      (anime ? animeHairFront(t, id) : "") +
      (anime && t.extra === "bell" ? "" : drawExtra(t, anime)) +
      '</g>' + (anime ? '</g>' : "") + '</g></svg>'
    );
  }

  // The anime eye clip has to match the drawn shape exactly, so both come
  // from the same construction.
  function animeEyeClip(cx, rx, ry, drop) {
    var y = G.anime.eyeY + drop, o = cx < 50 ? -1 : 1;
    // Rounder than a cat-eye: the outer corner lifts only slightly, and top
    // and bottom are full. A strong outward sweep read as heavy eyeliner.
    return "M" + n(cx - o * rx) + "," + n(y + ry * 0.45) +
      " C" + n(cx - o * rx * 0.75) + "," + n(y - ry * 0.9) +
        " " + n(cx + o * rx * 0.15) + "," + n(y - ry * 1.3) +
        " " + n(cx + o * rx * 0.9) + "," + n(y - ry * 0.75) +
      " C" + n(cx + o * rx * 1.05) + "," + n(y - ry * 0.1) +
        " " + n(cx + o * rx * 0.75) + "," + n(y + ry) +
        " " + n(cx + o * rx * 0.05) + "," + n(y + ry * 1.25) +
      " C" + n(cx - o * rx * 0.5) + "," + n(y + ry * 1.2) +
        " " + n(cx - o * rx * 0.9) + "," + n(y + ry * 0.85) +
        " " + n(cx - o * rx) + "," + n(y + ry * 0.45) + " Z";
  }

  function chibiEyeDefs(t, g, id) {
    return [t.eyeColor, t.heterochromia ? t.altEyeColor : t.eyeColor]
      .map(function (c, i) {
        var cx = i ? g.eyeR : g.eyeL;
        var ry = t.eyes === "sharp" ? g.eyeRY * 0.82 : g.eyeRY;
        var rx = t.eyes === "sharp" ? g.eyeRX * 1.02 : g.eyeRX;
        return '<linearGradient id="' + id + 'i' + i + '" x1="0" y1="0" x2="0" y2="1">' +
          '<stop offset="0%" stop-color="' + mix(c, INK, 0.55) + '"/>' +
          '<stop offset="55%" stop-color="' + c + '"/>' +
          '<stop offset="100%" stop-color="' + lift(c) + '"/></linearGradient>' +
          '<clipPath id="' + id + 'e' + i + '"><path d="' + g.eyeShape(cx, ry, rx) + '"/></clipPath>';
      }).join("");
  }

  svg.traits = traits;
  svg.hash = hash;
  svg.styles = ["anime", "chibi"];
  svg.dataUri = function (seed, opts) {
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg(seed, opts));
  };
  return svg;
});
