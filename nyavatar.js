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

  /* ---------- helpers -------------------------------------------------- */

  function pick(r, arr) { return arr[Math.floor(r() * arr.length)]; }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function n(v) { return Math.round(v * 100) / 100; }

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
    whiskerY: 73, jaw: "M34,74 C40,80 60,80 66,74",

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
    // Narrower skull, cheekbones, and a chin that actually comes to a point.
    head: "M50,14 C67,14 74,27 74,44 C74,55 71,64 65,73 " +
          "C61,79 55,86 50,86 C45,86 39,79 35,73 " +
          "C29,64 26,55 26,44 C26,27 33,14 50,14 Z",
    eyeY: 57, eyeL: 38, eyeR: 62, eyeRX: 8.5, eyeRY: 9.5,
    browY: 43, noseY: 66, mouthY: 73.5, blushY: 64, blushX: 32,
    whiskerY: 70, jaw: "M39,76 C44,81 56,81 61,76",

    // Almond: inner corner low, outer corner high, peak toward the outside.
    eyeShape: function (cx, ry, rx) {
      var y = G.anime.eyeY, o = cx < 50 ? -1 : 1;
      var ix = cx - o * rx, iy = y + ry * 0.28;
      var ox = cx + o * rx, oy = y - ry * 0.3;
      return "M" + n(ix) + "," + n(iy) +
        " C" + n(cx - o * rx * 0.6) + "," + n(y - ry * 0.78) +
          " " + n(cx + o * rx * 0.25) + "," + n(y - ry) +
          " " + n(ox) + "," + n(oy) +
        " C" + n(cx + o * rx * 0.9) + "," + n(y + ry * 0.35) +
          " " + n(cx + o * rx * 0.4) + "," + n(y + ry * 0.9) +
          " " + n(cx - o * rx * 0.1) + "," + n(y + ry * 0.82) +
        " C" + n(cx - o * rx * 0.55) + "," + n(y + ry * 0.72) +
          " " + n(cx - o * rx * 0.85) + "," + n(y + ry * 0.6) +
          " " + n(ix) + "," + n(iy) + " Z";
    },
    upperLid: function (cx, ry, rx, drop) {
      var y = G.anime.eyeY + drop, o = cx < 50 ? -1 : 1;
      return "M" + n(cx - o * rx) + "," + n(y + ry * 0.28) +
        " C" + n(cx - o * rx * 0.6) + "," + n(y - ry * 0.78) +
          " " + n(cx + o * rx * 0.25) + "," + n(y - ry) +
          " " + n(cx + o * rx) + "," + n(y - ry * 0.3) +
        " l" + n(o * 4) + ",-2.6";
    }
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
    var out = (t.ears === "big" ? 6 : 0) - (anime ? 2 : 0);
    var up = t.ears === "big" ? 6 : 0;
    var lx = 19 - out, ly = 8 - up, rx = 81 + out, ry = 8 - up;
    var tuft = t.ears === "tufted"
      ? '<g stroke="' + lift(base) + '" stroke-width="1.8" stroke-linecap="round" fill="none">' +
        '<path d="M26,24 l-5,-6 M29,22 l-3,-7 M74,24 l5,-6 M71,22 l3,-7"/></g>'
      : "";

    return '<g ' + s + '>' +
      '<path d="M28,34 C22,25 ' + lx + ',15 ' + lx + ',' + ly +
        ' C' + (lx + 12) + ',' + (ly + 6) + ' 42,21 45,28 Z" fill="' + base + '"/>' +
      '<path d="M72,34 C78,25 ' + rx + ',15 ' + rx + ',' + ry +
        ' C' + (rx - 12) + ',' + (ry + 6) + ' 58,21 55,28 Z" fill="' + base + '"/>' +
      '</g>' +
      '<path d="M30,30 C27,24 ' + (lx + 4) + ',18 ' + (lx + 4) + ',' + (ly + 5) +
        ' C' + (lx + 12) + ',' + (ly + 10) + ' 38,23 40,27 Z" fill="' + inner + '"/>' +
      '<path d="M70,30 C73,24 ' + (rx - 4) + ',18 ' + (rx - 4) + ',' + (ry + 5) +
        ' C' + (rx - 12) + ',' + (ry + 10) + ' 62,23 60,27 Z" fill="' + inner + '"/>' +
      tuft;
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

  /* ---------- hair: anime ------------------------------------------------
   * Anime hair is built from pointed strands rather than smooth caps: the
   * fringe ends in V-shaped tips just above the brows, and long side locks
   * run down past the jaw. That strand edge is most of what separates the
   * two styles at a glance.
   * -------------------------------------------------------------------- */

  function animeHairBack(t) {
    var shade = t.hairColor[1], ink = line(shade);
    var s = ' fill="' + shade + '" stroke="' + ink + '" stroke-width="1.5" stroke-linejoin="round"';
    var cap = '<path d="M22,52 C22,22 34,8 50,8 C66,8 78,22 78,52 L78,66 ' +
              'C66,72 34,72 22,66 Z"' + s + '/>';

    switch (t.hair) {
      case "long":
        return '<path d="M21,52 C21,20 34,7 50,7 C66,7 79,20 79,52 ' +
               'C79,70 84,88 86,100 L74,100 L70,88 L68,100 L32,100 L30,88 ' +
               'L26,100 L14,100 C16,88 21,70 21,52 Z"' + s + '/>';
      case "hime":
        return '<path d="M21,52 C21,20 34,7 50,7 C66,7 79,20 79,52 ' +
               'C79,72 82,90 82,100 L18,100 C18,90 21,72 21,52 Z"' + s + '/>' +
               '<path d="M24,46 C18,62 17,80 19,100 L31,100 C27,80 27,62 30,48 Z"' + s + '/>' +
               '<path d="M76,46 C82,62 83,80 81,100 L69,100 C73,80 73,62 70,48 Z"' + s + '/>';
      case "twintails":
        return cap +
          '<path d="M26,40 C8,46 4,70 8,86 C10,96 12,100 16,100 L28,100 ' +
          'C22,84 20,62 32,46 Z"' + s + '/>' +
          '<path d="M74,40 C92,46 96,70 92,86 C90,96 88,100 84,100 L72,100 ' +
          'C78,84 80,62 68,46 Z"' + s + '/>';
      case "ponytail":
        return cap +
          '<path d="M72,34 C94,42 96,72 90,94 C88,100 84,101 84,94 ' +
          'C88,70 86,48 66,40 Z"' + s + '/>';
      case "buns":
        return cap +
          '<circle cx="20" cy="28" r="11"' + s + '/>' +
          '<circle cx="80" cy="28" r="11"' + s + '/>' +
          '<path d="M15,28 q5,-6 10,0 q-5,6 -10,0" fill="' + t.hairColor[0] + '" opacity=".5"/>' +
          '<path d="M75,28 q5,-6 10,0 q-5,6 -10,0" fill="' + t.hairColor[0] + '" opacity=".5"/>';
      case "bob":
        return '<path d="M21,52 C21,22 34,8 50,8 C66,8 79,22 79,52 ' +
               'C79,64 78,72 76,78 L70,70 L68,80 L62,72 L60,80 L40,80 L38,72 ' +
               'L32,80 L30,70 L24,78 C22,72 21,64 21,52 Z"' + s + '/>';
      default: // messy
        return '<path d="M21,52 C21,20 34,7 50,7 C66,7 79,20 79,52 ' +
               'L84,74 L76,68 L78,82 L69,70 L67,80 L60,72 L54,80 L50,70 ' +
               'L46,80 L40,72 L33,80 L31,70 L22,82 L24,68 L16,74 Z"' + s + '/>';
    }
  }

  function animeHairFront(t) {
    var base = t.hairColor[0], ink = line(t.hairColor[1]);
    var s = ' fill="' + base + '" stroke="' + ink + '" stroke-width="1.5" stroke-linejoin="round"';

    // Bangs are built from strands: each tip is a curved lobe dropping to a
    // point, separated by a notch back up to the crown. Writing them by hand
    // gave a sawtooth; generating them keeps the tips shallow and even.
    function bangs(tips) {
      var d = "M23,52 C23,20 35,9 50,9 C65,9 77,20 77,52";
      tips.forEach(function (p) {
        d += " C" + (p[0] + 5) + "," + (p[1] - 12) +
             " " + (p[0] + 2) + "," + (p[1] - 4) +
             " " + p[0] + "," + p[1] +
             // notch back up, but only ~9 units — deeper than this and the
             // forehead grows a row of spikes
             " C" + (p[0] - 3) + "," + (p[1] - 4) +
             " " + (p[0] - 4) + "," + (p[1] - 8) +
             " " + (p[0] - 6) + "," + (p[1] - 9);
      });
      return d + " L23,52 Z";
    }

    var fringe = {
      // straight-cut princess bangs — smooth scallops, no strand tips
      hime: 'M23,50 C23,20 35,9 50,9 C65,9 77,20 77,50 ' +
            'C76,45 74,43 71,44 C68,45 66,46 62,46 C58,46 56,44 50,44 ' +
            'C44,44 42,46 38,46 C34,46 32,45 29,44 C26,43 24,45 23,50 Z',
      long: bangs([[70, 46], [60, 48], [50, 44], [40, 48], [30, 46]]),
      bob: bangs([[68, 45], [58, 47], [50, 43], [42, 47], [32, 45]]),
      twintails: bangs([[68, 44], [59, 47], [50, 43], [41, 47], [32, 44]]),
      messy: bangs([[71, 46], [64, 50], [57, 45], [50, 49], [43, 45], [36, 50], [29, 46]]),
      // swept across to one side
      ponytail: bangs([[66, 44], [54, 48], [44, 46], [32, 42]]),
      buns: bangs([[66, 44], [56, 46], [46, 46], [34, 44]])
    }[t.hair];

    // Long pointed side locks down past the jaw — the anime tell.
    var locks =
      '<path d="M24,40 C19,52 19,66 23,78 L28,62 C26,54 25,46 27,41 Z"' + s + '/>' +
      '<path d="M76,40 C81,52 81,66 77,78 L72,62 C74,54 75,46 73,41 Z"' + s + '/>';

    return locks + '<path d="' + fringe + '"' + s + '/>' +
      // narrow gloss band, following the curve of the skull
      '<path d="M32,26 C39,19 61,19 68,26" fill="none" stroke="' + lift(base) +
      '" stroke-width="3.6" stroke-linecap="round" opacity=".65"/>' +
      // a couple of loose strands over the forehead
      '<path d="M44,20 C46,28 45,36 43,42" fill="none" stroke="' + ink +
      '" stroke-width="1" opacity=".35"/>' +
      '<path d="M57,20 C55,28 56,36 58,42" fill="none" stroke="' + ink +
      '" stroke-width="1" opacity=".35"/>';
  }

  function animeBody(t, skin) {
    var shade = mix(skin[0], skin[1], 0.55);
    return (
      // neck, with the jaw shadow that stops it looking like a pipe
      '<path d="M44,78 C44,86 43,88 42,90 L58,90 C57,88 56,86 56,78 Z" fill="' +
        shade + '" stroke="' + mix(skin[1], INK, 0.42) + '" stroke-width="1.4" ' +
        'stroke-linejoin="round"/>' +
      '<path d="M43,79 C46,84 54,84 57,79" fill="none" stroke="' + mix(skin[1], INK, 0.25) +
        '" stroke-width="2" opacity=".45"/>' +
      // shoulders
      '<path d="M50,88 C36,88 22,93 18,100 L82,100 C78,93 64,88 50,88 Z" fill="' +
        t.clothes[0] + '" stroke="' + line(t.clothes[1]) + '" stroke-width="1.5" ' +
        'stroke-linejoin="round"/>' +
      // open collar
      '<path d="M44,89 L50,97 L56,89" fill="' + t.clothes[1] + '" stroke="' +
        line(t.clothes[1]) + '" stroke-width="1.3" stroke-linejoin="round"/>'
    );
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
        '<circle cx="' + n(cx - 2.7) + '" cy="' + n(top + 3.8) + '" r="2.4" fill="#fff"/>' +
        '<circle cx="' + n(cx + 2.8) + '" cy="' + n(g.eyeY + 4.4) + '" r="1.2" fill="#fff" opacity=".9"/>' +
        (t.eyes === "sparkle"
          ? '<path d="M' + n(cx + 3.4) + ',' + n(top + 1.8) +
            ' l1,2.2 2.2,1 -2.2,1 -1,2.2 -1,-2.2 -2.2,-1 2.2,-1 Z" fill="#fff"/>'
          : "") +
        '<path d="' + g.upperLid(cx, ry, rx, drop) + '" fill="none" stroke="' + lash +
          '" stroke-width="2.9" stroke-linecap="round"/>' +
        '<path d="M' + (cx - 5) + ',' + n(g.eyeY + ry * 0.8) + ' Q' + cx + ',' +
          n(g.eyeY + ry * 0.98) + ' ' + (cx + 5) + ',' + n(g.eyeY + ry * 0.8) +
          '" fill="none" stroke="' + mix(t.skin[1], INK, 0.35) +
          '" stroke-width="1" stroke-linecap="round" opacity=".75"/>'
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
    var skin = t.skin[0], skinShade = t.skin[1], skinInk = mix(skinShade, INK, 0.42);

    var defsEyes = [t.eyeColor, t.heterochromia ? t.altEyeColor : t.eyeColor]
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

    var bx = g.blushX, by = g.blushY;
    var blush = t.blush
      ? '<g opacity=".5"><ellipse cx="' + bx + '" cy="' + by + '" rx="6" ry="3.6" fill="#ff8fa3"/>' +
        '<ellipse cx="' + (100 - bx) + '" cy="' + by + '" rx="6" ry="3.6" fill="#ff8fa3"/></g>' +
        '<g stroke="#ff7d97" stroke-width="1" stroke-linecap="round" opacity=".45">' +
        '<path d="M' + (bx - 3) + ',' + (by - 1) + ' l3,-2 M' + bx + ',' + (by + 1.5) +
        ' l3,-2 M' + (100 - bx + 3) + ',' + (by - 1) + ' l-3,-2 M' + (100 - bx) + ',' +
        (by + 1.5) + ' l-3,-2"/></g>'
      : "";

    var fy = g.noseY + 1;
    var freckles = t.freckles
      ? '<g fill="' + skinShade + '" opacity=".9">' +
        '<circle cx="42" cy="' + fy + '" r=".9"/><circle cx="45" cy="' + (fy + 2) + '" r=".75"/>' +
        '<circle cx="55" cy="' + (fy + 2) + '" r=".75"/><circle cx="58" cy="' + fy + '" r=".9"/>' +
        '<circle cx="39.5" cy="' + (fy + 2.5) + '" r=".7"/>' +
        '<circle cx="60.5" cy="' + (fy + 2.5) + '" r=".7"/></g>'
      : "";

    var wy = g.whiskerY, wx = anime ? 29 : 24;
    var whiskers =
      '<g stroke="' + skinInk + '" stroke-width=".9" stroke-linecap="round" opacity=".4">' +
      '<path d="M' + wx + ',' + wy + ' l6,-1.5 M' + (wx + 0.5) + ',' + (wy + 3.5) +
      ' l6,-2.5 M' + (100 - wx) + ',' + wy + ' l-6,-1.5 M' + (100 - wx - 0.5) + ',' +
      (wy + 3.5) + ' l-6,-2.5"/></g>';

    return (
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="' + size +
      '" height="' + size + '" role="img" aria-label="' + style + ' catgirl avatar for ' +
      esc(seed) + '">' +
      '<defs>' +
      '<radialGradient id="' + id + 'bg" cx="50%" cy="32%" r="78%">' +
      '<stop offset="0%" stop-color="' + t.bg[1] + '"/>' +
      '<stop offset="100%" stop-color="' + t.bg[0] + '"/></radialGradient>' +
      '<radialGradient id="' + id + 'face" cx="50%" cy="40%" r="62%">' +
      '<stop offset="58%" stop-color="' + skin + '"/>' +
      '<stop offset="100%" stop-color="' + mix(skin, skinShade, 0.7) + '"/></radialGradient>' +
      defsEyes +
      '<clipPath id="' + id + 'c"><rect width="100" height="100" rx="' +
      (opts.round === false ? 0 : 16) + '"/></clipPath>' +
      '</defs>' +

      '<g clip-path="url(#' + id + 'c)">' +
      '<rect width="100" height="100" fill="url(#' + id + 'bg)"/>' +
      '<circle cx="50" cy="' + (anime ? 42 : 46) + '" r="40" fill="#fff" opacity=".05"/>' +

      '<g transform="rotate(' + t.tilt + ' 50 55)">' +
      (anime ? animeHairBack(t) : chibiHairBack(t)) +
      drawEars(t, g, anime) +
      (anime ? animeBody(t, t.skin) : chibiBody(t, t.skin)) +

      '<path d="' + g.head + '" fill="url(#' + id + 'face)" stroke="' + skinInk +
        '" stroke-width="1.5" stroke-linejoin="round"/>' +
      '<path d="' + g.jaw + '" fill="none" stroke="' + skinShade +
        '" stroke-width="2" opacity=".3" stroke-linecap="round"/>' +

      (anime ? animeHairFront(t) : chibiHairFront(t)) +
      whiskers + freckles + blush +
      drawEyes(t, g, id) +
      drawFace(t, g) +
      drawExtra(t, anime) +
      '</g></g></svg>'
    );
  }

  svg.traits = traits;
  svg.hash = hash;
  svg.styles = ["anime", "chibi"];
  svg.dataUri = function (seed, opts) {
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg(seed, opts));
  };
  return svg;
});
