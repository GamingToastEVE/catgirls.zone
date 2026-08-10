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
    // Proportions matter more than detail here. The eye line sits a little
    // above the middle of the head, the mouth two thirds of the way from the
    // eyes to the chin, and the jaw tapers from cheekbones at the eye line —
    // a long empty lower face was what made earlier versions look wrong.
    head: "M50,15 C64,15 72,25 72,41 C72,50 70,57 66,64 " +
          "C62,71 56,80 50,82 C44,80 38,71 34,64 " +
          "C30,57 28,50 28,41 C28,25 36,15 50,15 Z",
    eyeY: 54, eyeL: 38.5, eyeR: 61.5, eyeRX: 8.4, eyeRY: 10,
    browY: 39, noseY: 65, mouthY: 71, blushY: 62, blushX: 32,
    whiskers: false, // on a narrow face they read as scars, not whiskers
    jaw: "",
    glossy: true,  // extra highlight layers and lower lashes
    lift: -8,      // head rides higher so the torso has somewhere to go

    // Almond: inner corner low, outer corner high, peak toward the outside.
    eyeShape: function (cx, ry, rx) {
      var y = G.anime.eyeY, o = cx < 50 ? -1 : 1;
      var ix = cx - o * rx, iy = y + ry * 0.3;
      var ox = cx + o * rx, oy = y - ry * 0.35;
      return "M" + n(ix) + "," + n(iy) +
        " C" + n(cx - o * rx * 0.6) + "," + n(y - ry * 0.8) +
          " " + n(cx + o * rx * 0.3) + "," + n(y - ry) +
          " " + n(ox) + "," + n(oy) +
        " C" + n(cx + o * rx * 0.85) + "," + n(y + ry * 0.35) +
          " " + n(cx + o * rx * 0.4) + "," + n(y + ry * 0.9) +
          " " + n(cx - o * rx * 0.1) + "," + n(y + ry * 0.85) +
        " C" + n(cx - o * rx * 0.55) + "," + n(y + ry * 0.75) +
          " " + n(cx - o * rx * 0.85) + "," + n(y + ry * 0.6) +
          " " + n(ix) + "," + n(iy) + " Z";
    },

    // A filled crescent rather than a stroked arc: thin at the inner corner,
    // thick at the outer. Stroking it was what produced the black slabs.
    lash: function (cx, ry, rx, drop) {
      var y = G.anime.eyeY + drop, o = cx < 50 ? -1 : 1;
      return "M" + n(cx - o * rx) + "," + n(y + ry * 0.3) +
        " C" + n(cx - o * rx * 0.6) + "," + n(y - ry * 0.8) +
          " " + n(cx + o * rx * 0.3) + "," + n(y - ry) +
          " " + n(cx + o * rx * 1.06) + "," + n(y - ry * 0.42) +
        " C" + n(cx + o * rx * 0.75) + "," + n(y - ry * 0.72) +
          " " + n(cx + o * rx * 0.1) + "," + n(y - ry * 0.72) +
          " " + n(cx - o * rx * 0.45) + "," + n(y - ry * 0.3) +
        " C" + n(cx - o * rx * 0.75) + "," + n(y - ry * 0.05) +
          " " + n(cx - o * rx * 0.92) + "," + n(y + ry * 0.15) +
          " " + n(cx - o * rx) + "," + n(y + ry * 0.3) + " Z";
    },

    // The crease above the lid — small, but it's most of what sells "anime".
    crease: function (cx, ry, rx, drop) {
      var y = G.anime.eyeY + drop, o = cx < 50 ? -1 : 1;
      return "M" + n(cx - o * rx * 0.75) + "," + n(y - ry * 0.95) +
        " C" + n(cx - o * rx * 0.2) + "," + n(y - ry * 1.45) +
          " " + n(cx + o * rx * 0.6) + "," + n(y - ry * 1.35) +
          " " + n(cx + o * rx * 1.02) + "," + n(y - ry * 0.75);
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
    var out = (t.ears === "big" ? 6 : 0) + (anime ? 3 : 0);
    var up = (t.ears === "big" ? 6 : 0) + (anime ? 3 : 0);
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

  /* ---------- hair: anime ------------------------------------------------
   * Anime hair is built from pointed strands rather than smooth caps: the
   * fringe ends in V-shaped tips just above the brows, and long side locks
   * run down past the jaw. That strand edge is most of what separates the
   * two styles at a glance.
   * -------------------------------------------------------------------- */

  function animeHairBack(t) {
    var shade = t.hairColor[1], ink = line(shade);
    var s = ' fill="' + shade + '" stroke="' + ink + '" stroke-width="1.4" stroke-linejoin="round"';
    // Wider than the skull on purpose: hair with no volume beside the face
    // is what made the head look too broad.
    var cap = '<path d="M20,46 C20,12 33,3 50,3 C67,3 80,12 80,46 L80,62 ' +
              'C64,68 36,68 20,62 Z"' + s + '/>';

    switch (t.hair) {
      case "long":
        return '<path d="M19,46 C19,11 33,2 50,2 C67,2 81,11 81,46 ' +
               'C81,66 85,86 87,118 L73,118 L70,86 L67,118 L33,118 L30,86 ' +
               'L27,118 L13,118 C15,86 19,66 19,46 Z"' + s + '/>';
      case "hime":
        return '<path d="M19,46 C19,11 33,2 50,2 C67,2 81,11 81,46 ' +
               'C81,68 84,88 84,118 L16,118 C16,88 19,68 19,46 Z"' + s + '/>' +
               '<path d="M23,42 C17,58 16,80 18,118 L31,118 C26,80 26,58 29,44 Z"' + s + '/>' +
               '<path d="M77,42 C83,58 84,80 82,118 L69,118 C74,80 74,58 71,44 Z"' + s + '/>';
      case "twintails":
        return cap +
          '<path d="M24,34 C8,40 4,66 8,84 C10,94 12,118 16,118 L28,118 ' +
          'C21,84 19,60 31,40 Z"' + s + '/>' +
          '<path d="M76,34 C92,40 96,66 92,84 C90,94 88,118 84,118 L72,118 ' +
          'C79,84 81,60 69,40 Z"' + s + '/>';
      case "ponytail":
        return cap +
          '<path d="M74,28 C94,36 96,70 90,92 C88,99 84,118 84,92 ' +
          'C88,64 86,42 69,34 Z"' + s + '/>';
      case "buns":
        return cap +
          '<circle cx="20" cy="22" r="11"' + s + '/>' +
          '<circle cx="80" cy="22" r="11"' + s + '/>' +
          '<path d="M15,22 q5,-5.5 10,0 q-5,5.5 -10,0" fill="' + t.hairColor[0] + '" opacity=".5"/>' +
          '<path d="M75,22 q5,-5.5 10,0 q-5,5.5 -10,0" fill="' + t.hairColor[0] + '" opacity=".5"/>';
      case "bob":
        return '<path d="M20,46 C20,13 33,3 50,3 C67,3 80,13 80,46 ' +
               'C80,58 79,66 77,73 L71,65 L69,75 L62,67 L60,75 L40,75 L38,67 ' +
               'L31,75 L29,65 L23,73 C21,66 20,58 20,46 Z"' + s + '/>';
      default: // messy
        return '<path d="M19,46 C19,11 33,2 50,2 C67,2 81,11 81,46 ' +
               'L86,68 L77,61 L79,76 L69,64 L67,75 L60,66 L54,75 L50,64 ' +
               'L46,75 L40,66 L33,75 L31,64 L21,76 L23,61 L14,68 Z"' + s + '/>';
    }
  }

  function animeHairFront(t) {
    var base = t.hairColor[0], ink = line(t.hairColor[1]);
    var s = ' fill="' + base + '" stroke="' + ink + '" stroke-width="1.4" stroke-linejoin="round"';

    // Bangs: a smooth scalloped silhouette, with the strand separations drawn
    // as thin interior lines. Cutting notches into the outline instead gave
    // the forehead a row of spikes.
    function bangs(tips) {
      var d = "M21,46 C21,13 34,3 50,3 C66,3 79,13 79,46";
      var strands = "";
      tips.forEach(function (p) {
        d += " C" + (p[0] + 5) + "," + (p[1] - 7) +
             " " + (p[0] + 2) + "," + (p[1] - 1) +
             " " + p[0] + "," + p[1];
        // start each strand near the crown and fan outward, so they read as
        // hair falling rather than parallel hatching
        strands += "M" + (50 + (p[0] - 50) * 0.3) + ",11 C" +
                   (50 + (p[0] - 50) * 0.75) + "," + (p[1] - 20) + " " +
                   (p[0] + 2) + "," + (p[1] - 11) + " " + p[0] + "," + (p[1] - 3) + " ";
      });
      return {
        d: d + " L21,46 Z",
        strands: '<path d="' + strands + '" fill="none" stroke="' + ink +
                 '" stroke-width="1" stroke-linecap="round" opacity=".3"/>'
      };
    }

    var f = {
      hime: bangs([[70, 40], [60, 41], [50, 40], [40, 41], [30, 40]]),
      long: bangs([[69, 39], [60, 42], [50, 38], [40, 42], [31, 39]]),
      bob: bangs([[67, 38], [58, 41], [50, 37], [42, 41], [33, 38]]),
      twintails: bangs([[67, 38], [59, 41], [50, 37], [41, 41], [33, 38]]),
      messy: bangs([[70, 40], [63, 44], [56, 39], [50, 43], [44, 39], [37, 44], [30, 40]]),
      ponytail: bangs([[65, 38], [54, 42], [44, 40], [32, 36]]),
      buns: bangs([[65, 38], [56, 40], [46, 40], [34, 38]])
    }[t.hair];

    // Long pointed side locks down past the jaw — the anime tell.
    var locks =
      '<path d="M24,34 C18,48 18,64 23,76 L29,58 C26,50 25,42 28,35 Z"' + s + '/>' +
      '<path d="M76,34 C82,48 82,64 77,76 L71,58 C74,50 75,42 72,35 Z"' + s + '/>';

    return locks + '<path d="' + f.d + '"' + s + '/>' + f.strands +
      // narrow gloss band, following the curve of the skull
      '<path d="M33,20 C39,13 61,13 67,20" fill="none" stroke="' + lift(base) +
      '" stroke-width="3.4" stroke-linecap="round" opacity=".6"/>';
  }

  function animeBody(t, skin, extra) {
    var base = skin[0], shade = skin[1], ink = mix(shade, INK, 0.4);
    var soft = mix(base, shade, 0.55);

    var pendant = extra === "bell"
      ? '<circle cx="50" cy="86.5" r="3.6" fill="#ffd166" stroke="#c8951f" stroke-width="1"/>' +
        '<path d="M50,84.8 v3.4 M46.8,86.5 h6.4" stroke="#c8951f" stroke-width=".9"/>'
      // a little heart, straight off the reference
      : '<path d="M50,85.6 C49,83.6 46.6,83.6 46.6,85.6 C46.6,87.4 48.6,88.5 50,89.6 ' +
        'C51.4,88.5 53.4,87.4 53.4,85.6 C53.4,83.6 51,83.6 50,85.6 Z" fill="#ffd166" ' +
        'stroke="#c8951f" stroke-width=".9" stroke-linejoin="round"/>';

    return (
      // neck
      '<path d="M44,66 C44,74 43,77 41,80 L59,80 C57,77 56,74 56,66 Z" fill="' + soft +
        '" stroke="' + ink + '" stroke-width="1.3" stroke-linejoin="round"/>' +
      '<path d="M43,67 C46,73 54,73 57,67" fill="none" stroke="' + mix(shade, INK, 0.2) +
        '" stroke-width="2" opacity=".4"/>' +
      // bare shoulders and chest
      '<path d="M50,79 C33,79 18,88 13,118 L87,118 C82,88 67,79 50,79 Z" fill="' + base +
        '" stroke="' + ink + '" stroke-width="1.3" stroke-linejoin="round"/>' +
      '<g fill="none" stroke="' + shade + '" stroke-width="1.1" stroke-linecap="round" opacity=".38">' +
      '<path d="M41,88 C43.5,90.5 45.5,91.5 47,91"/>' +
      '<path d="M59,88 C56.5,90.5 54.5,91.5 53,91"/></g>' +
      // off-shoulder top, drawn as one connected garment: sleeve puffs sitting
      // below the shoulders, a scooped neckline between them
      '<path d="M11,118 C11,93 15,88 22,87 C29,86 33,91 38,93 ' +
        'C42,94.5 46,95 50,95 C54,95 58,94.5 62,93 ' +
        'C67,91 71,86 78,87 C85,88 89,93 89,118 Z" fill="' + t.clothes[0] +
        '" stroke="' + line(t.clothes[1]) + '" stroke-width="1.3" stroke-linejoin="round"/>' +
      '<path d="M38,93 C42,94.5 46,95 50,95 C54,95 58,94.5 62,93" fill="none" stroke="' +
        t.clothes[1] + '" stroke-width="1.3" opacity=".8"/>' +
      // the seam where each sleeve meets the bodice
      '<g fill="none" stroke="' + t.clothes[1] + '" stroke-width="1" opacity=".5">' +
      '<path d="M27,89 C26,93 26,97 27,118"/><path d="M73,89 C74,93 74,97 73,118"/></g>' +
      // choker
      '<path d="M42,77 C45,79.5 55,79.5 58,77 L58,80.5 C55,83 45,83 42,80.5 Z" fill="#f2607d" ' +
        'stroke="' + line("#f2607d") + '" stroke-width="1.2" stroke-linejoin="round"/>' +
      pendant
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
    var blush = !t.blush ? ""
      : anime
        // soft fade, no hatching — drawn strokes read as crayon at this size
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
      ? '<g fill="' + skinShade + '" opacity=".9">' +
        '<circle cx="42" cy="' + fy + '" r=".9"/><circle cx="45" cy="' + (fy + 2) + '" r=".75"/>' +
        '<circle cx="55" cy="' + (fy + 2) + '" r=".75"/><circle cx="58" cy="' + fy + '" r=".9"/>' +
        '<circle cx="39.5" cy="' + (fy + 2.5) + '" r=".7"/>' +
        '<circle cx="60.5" cy="' + (fy + 2.5) + '" r=".7"/></g>'
      : "";

    var wy = g.whiskerY, wx = 24;
    var whiskers = g.whiskers
      ? '<g stroke="' + skinInk + '" stroke-width=".9" stroke-linecap="round" opacity=".4">' +
        '<path d="M' + wx + ',' + wy + ' l6,-1.5 M' + (wx + 0.5) + ',' + (wy + 3.5) +
        ' l6,-2.5 M' + (100 - wx) + ',' + wy + ' l-6,-1.5 M' + (100 - wx - 0.5) + ',' +
        (wy + 3.5) + ' l-6,-2.5"/></g>'
      : "";

    return (
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="' + size +
      '" height="' + size + '" role="img" aria-label="' + style + ' catgirl avatar for ' +
      esc(seed) + '">' +
      '<defs>' +
      '<radialGradient id="' + id + 'bg" cx="50%" cy="32%" r="78%">' +
      '<stop offset="0%" stop-color="' + bg[1] + '"/>' +
      '<stop offset="100%" stop-color="' + bg[0] + '"/></radialGradient>' +
      '<radialGradient id="' + id + 'face" cx="50%" cy="40%" r="62%">' +
      '<stop offset="58%" stop-color="' + skin + '"/>' +
      '<stop offset="100%" stop-color="' + mix(skin, skinShade, 0.7) + '"/></radialGradient>' +
      defsEyes +
      '<radialGradient id="' + id + 'bl">' +
      '<stop offset="0%" stop-color="#ff8fa3" stop-opacity=".6"/>' +
      '<stop offset="100%" stop-color="#ff8fa3" stop-opacity="0"/></radialGradient>' +
      '<clipPath id="' + id + 'c"><rect width="100" height="100" rx="' +
      (opts.round === false ? 0 : 16) + '"/></clipPath>' +
      '</defs>' +

      '<g clip-path="url(#' + id + 'c)">' +
      '<rect width="100" height="100" fill="url(#' + id + 'bg)"/>' +
      (anime
        // little sparkles in the empty corners, like the reference art
        ? '<g fill="#fff2b8" stroke="' + mix(bg[0], INK, 0.25) + '" stroke-width=".5">' +
          sparkle(13, 22, 3.4) + sparkle(87, 30, 2.6) + sparkle(20, 68, 2.2) +
          sparkle(84, 60, 3) + '</g>'
        : '<circle cx="50" cy="46" r="40" fill="#fff" opacity=".05"/>') +

      // pulled back so the shoulders fit in frame instead of running off it
      (anime ? '<g transform="translate(50,54) scale(.84) translate(-50,-54)">' : "") +

      // the torso is drawn outside the head group so only the head tilts
      (anime ? animeBody(t, t.skin, t.extra) : "") +

      '<g transform="translate(0,' + (g.lift || 0) + ') rotate(' + t.tilt + ' 50 55)">' +
      (anime ? animeHairBack(t) : chibiHairBack(t)) +
      drawEars(t, g, anime) +
      (anime ? "" : chibiBody(t, t.skin)) +

      '<path d="' + g.head + '" fill="url(#' + id + 'face)" stroke="' + skinInk +
        '" stroke-width="1.5" stroke-linejoin="round"/>' +
      (g.jaw
        ? '<path d="' + g.jaw + '" fill="none" stroke="' + skinShade +
          '" stroke-width="2" opacity=".3" stroke-linecap="round"/>'
        : "") +

      (anime ? animeHairFront(t) : chibiHairFront(t)) +
      whiskers + freckles + blush +
      drawEyes(t, g, id) +
      drawFace(t, g) +
      // the bell rides on the choker, which the torso already drew
      (anime && t.extra === "bell" ? "" : drawExtra(t, anime)) +
      '</g>' + (anime ? '</g>' : "") + '</g></svg>'
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
