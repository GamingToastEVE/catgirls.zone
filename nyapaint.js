/*!
 * nyapaint.js — deterministic catgirl portraits, painted on a canvas
 * catgirls.zone · public domain (CC0)
 *
 * Companion to nyavatar.js. Same traits, same seed determinism, but rendered
 * with painting technique rather than flat vector fills: soft airbrushed
 * shadow layers under multiply, rim light and highlights under screen, bloom,
 * coloured line art, and a final warm grade with grain.
 *
 *   nyapaint("mia")                    -> <canvas>
 *   nyapaint.dataUrl("mia", { size: 512 })
 *
 * Browser only — it needs a real 2D context (ctx.filter, blend modes).
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(root);
  else root.nyapaint = factory(root);
})(typeof self !== "undefined" ? self : this, function (root) {
  "use strict";

  /* ================= seed + traits ==================================== */

  function hash(str) {
    var h = 0x811c9dc5;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h >>> 0;
  }

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

  /* ================= colour ============================================ */

  function rgb(hex) {
    hex = hex.replace("#", "");
    return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16),
            parseInt(hex.slice(4, 6), 16)];
  }
  function hex(c) {
    return "#" + c.map(function (v) {
      return Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
    }).join("");
  }
  function mix(a, b, t) {
    var x = typeof a === "string" ? rgb(a) : a, y = typeof b === "string" ? rgb(b) : b;
    return hex([0, 1, 2].map(function (i) { return x[i] + (y[i] - x[i]) * t; }));
  }
  function rgba(c, a) {
    var v = typeof c === "string" ? rgb(c) : c;
    return "rgba(" + v[0] + "," + v[1] + "," + v[2] + "," + a + ")";
  }
  // Shadows in painted art are not "the fill, darker" — they shift warm and
  // lose saturation at the same time.
  function shadowOf(c, amount) {
    return mix(c, mix(c, "#7a4a63", 0.75), amount);
  }
  function lightOf(c, amount) {
    return mix(c, mix(c, "#fff6e8", 0.9), amount);
  }

  /* ================= palettes ========================================== */

  // [light, base, deep] — three stops per hair colour so strands can vary.
  var HAIR_COLORS = [
    ["#fdf0c8", "#ecd49a", "#c9a86e"], // blonde, the reference
    ["#ffe6e8", "#f7bfc6", "#d18b9c"], // pink
    ["#e2ecff", "#b9caee", "#8d9dc8"], // ice blue
    ["#f0e4ff", "#cdb8ee", "#a08cc4"], // lilac
    ["#e6f7e4", "#bfe0bd", "#93b894"], // mint
    ["#ffe9d6", "#f3c298", "#c9906a"], // apricot
    ["#fff4f0", "#e8d5cf", "#bda9a6"], // silver
    ["#e8e2ea", "#8d7f92", "#5b4f63"], // ash
    ["#ffdfe6", "#ef9fb2", "#c46e88"], // rose
    ["#dff5f3", "#a8ddd8", "#79aeab"], // aqua
    ["#fbe7bd", "#e0b872", "#b08c48"], // honey
    ["#f6dcd0", "#c98f74", "#96604c"]  // chestnut
  ];

  var EYE_COLORS = [
    ["#ffe9a8", "#e8b53c", "#9a6a12"], // gold, the reference
    ["#c9ecff", "#5fb6e8", "#2a6a99"],
    ["#e7d6ff", "#a988e0", "#6b4f9c"],
    ["#ffd8e2", "#e87fa0", "#a34561"],
    ["#d6f5e2", "#63c795", "#2c7a53"],
    ["#ffe0cc", "#ee9963", "#a85c31"],
    ["#d8ddff", "#7f8ce0", "#454f9c"],
    ["#f7e2c8", "#c39160", "#7d5630"]
  ];

  var SKINS = [
    ["#fff1e6", "#fcdcc6", "#e3ac96"],
    ["#ffeadb", "#f6cfb2", "#d79a80"],
    ["#f7dcc0", "#e8bf9a", "#c2906c"],
    ["#e6bd98", "#cf9d74", "#a3714f"],
    ["#c99a72", "#ab7a52", "#7f5537"],
    ["#a3714d", "#875a3a", "#5f3c25"]
  ];

  var CLOTHES = [
    ["#ffe9a0", "#f5cf4e", "#c99c25"], // the reference yellow
    ["#ffd7e2", "#f39bb4", "#c46782"],
    ["#d6e6ff", "#9dbaea", "#6a86bb"],
    ["#dcf3e0", "#98cfa6", "#659a74"],
    ["#e8dcff", "#b6a1e6", "#7f6bb0"],
    ["#ffe0cf", "#f4ab84", "#c1734d"],
    ["#f0eee8", "#cfcac0", "#9a958c"]
  ];

  var BACKGROUNDS = [
    ["#fdf6e6", "#f2e6cd"], ["#fdf0f3", "#f5dde4"], ["#eef4fd", "#dbe6f4"],
    ["#f0f8f1", "#dceee0"], ["#f7f1fd", "#e7dcf4"], ["#fdf3ec", "#f4e2d5"]
  ];

  var HAIRSTYLES = ["long", "twintails", "bob", "hime", "ponytail", "buns"];
  var EARSTYLES = ["pointy", "round", "folded"];
  var MOUTHS = ["open", "smile", "cat", "smug"];
  var EYESHAPES = ["round", "sleepy", "wide"];
  var EXTRAS = ["none", "none", "clip", "flower", "ribbon"];

  function pick(r, a) { return a[Math.floor(r() * a.length)]; }

  function traits(seed) {
    var r = rng(hash(String(seed)));
    return {
      seed: String(seed),
      hair: pick(r, HAIRSTYLES),
      ears: pick(r, EARSTYLES),
      mouth: pick(r, MOUTHS),
      eyeShape: pick(r, EYESHAPES),
      extra: pick(r, EXTRAS),
      hairColor: pick(r, HAIR_COLORS),
      eyeColor: pick(r, EYE_COLORS),
      altEyeColor: pick(r, EYE_COLORS),
      skin: pick(r, SKINS),
      clothes: pick(r, CLOTHES),
      bg: pick(r, BACKGROUNDS),
      heterochromia: r() < 0.1,
      blush: r() < 0.85,
      freckles: r() < 0.25,
      tilt: r() * 5 - 2.5,
      strandSeed: Math.floor(r() * 1e9)
    };
  }

  /* ================= geometry (100-unit portrait space) ================ */

  // The head sits low enough that the ears have room above the hair, which
  // is where they belong — drawn under it they simply vanished.
  var HEAD = "M50,22 C64,22 71,31 71,45 C71,56 68,62 63,67 " +
             "C59,72 54,76 50,76 C46,76 41,72 37,67 " +
             "C32,62 29,56 29,45 C29,31 36,22 50,22 Z";

  var EYE = { y: 53, l: 39.2, r: 60.8, rx: 6.2, ry: 6.8 };
  var BROW_Y = 41, NOSE_Y = 61, MOUTH_Y = 66.5, BLUSH_Y = 59;

  // Hair silhouettes: [backPath, hasVolumeSides]
  function hairBackPath(t) {
    // A domed crown plus falling locks. Straight-sided shapes read as slabs
    // of colour; the silhouette has to break into strands to look like hair.
    switch (t.hair) {
      case "bob":
        return "M50,10 C72,10 86,26 86,48 C86,62 84,72 81,80 " +
               "C77,86 71,84 68,77 C64,84 58,86 54,79 " +
               "C50,86 46,79 46,79 C42,86 36,84 32,77 " +
               "C29,84 23,86 19,80 C16,72 14,62 14,48 C14,26 28,10 50,10 Z";
      case "hime":
        return "M50,9 C73,9 87,25 87,48 C87,70 90,90 91,112 L74,112 " +
               "C76,92 78,74 77,58 C74,78 72,96 71,112 L29,112 " +
               "C28,96 26,78 23,58 C22,74 24,92 26,112 L9,112 " +
               "C10,90 13,70 13,48 C13,25 27,9 50,9 Z";
      case "twintails":
        return "M50,10 C72,10 86,26 86,48 L86,66 C68,74 32,74 14,66 L14,48 " +
               "C14,26 28,10 50,10 Z" +
               "M20,42 C4,52 0,80 6,102 C9,112 12,114 17,112 " +
               "C13,96 12,72 22,54 C26,48 26,44 20,42 Z" +
               "M80,42 C96,52 100,80 94,102 C91,112 88,114 83,112 " +
               "C87,96 88,72 78,54 C74,48 74,44 80,42 Z";
      case "ponytail":
        return "M50,10 C72,10 86,26 86,48 L86,68 C68,76 32,76 14,68 L14,48 " +
               "C14,26 28,10 50,10 Z" +
               "M80,34 C104,46 106,84 96,110 C92,118 86,118 88,108 " +
               "C96,76 92,50 74,40 Z";
      case "buns":
        return "M50,10 C72,10 86,26 86,48 L86,70 C68,78 32,78 14,70 L14,48 " +
               "C14,26 28,10 50,10 Z" +
               "M15,27 m-12,0 a12,12 0 1,0 24,0 a12,12 0 1,0 -24,0 Z" +
               "M85,27 m-12,0 a12,12 0 1,0 24,0 a12,12 0 1,0 -24,0 Z";
      default: // long
        return "M50,9 C73,9 87,25 87,48 C87,66 90,86 93,112 L74,112 " +
               "C77,92 78,74 76,60 C73,80 70,96 68,112 L32,112 " +
               "C30,96 27,80 24,60 C22,74 23,92 26,112 L7,112 " +
               "C10,86 13,66 13,48 C13,25 27,9 50,9 Z";
    }
  }

  // Bang tips, right to left. y is where the strand ends.
  function bangTips(t) {
    switch (t.hair) {
      case "hime":  return [[70, 39], [61, 40], [50, 39], [39, 40], [30, 39]];
      case "bob":   return [[69, 37], [60, 40], [50, 36], [40, 40], [31, 37]];
      case "buns":  return [[68, 36], [58, 39], [48, 39], [34, 36]];
      case "ponytail": return [[67, 36], [56, 41], [45, 39], [32, 35]];
      case "twintails": return [[68, 37], [59, 40], [50, 36], [41, 40], [32, 37]];
      default:      return [[70, 38], [61, 41], [50, 37], [39, 41], [30, 38]];
    }
  }

  /* ================= painting helpers ================================== */

  function Painter(ctx, k) {
    this.c = ctx;
    this.k = k;                       // units -> device px
    this.blurUnit = function (u) { return "blur(" + (u * k).toFixed(2) + "px)"; };
  }

  Painter.prototype.path = function (d) { return new Path2D(d); };

  Painter.prototype.fill = function (p, style) {
    var c = this.c;
    c.save(); c.fillStyle = style; c.fill(p); c.restore();
  };

  // A soft airbrushed pass, optionally clipped to a region. This is the
  // workhorse: nearly all modelling here is blurred shapes under multiply
  // (shadow) or screen (light).
  Painter.prototype.soft = function (opts) {
    var c = this.c;
    c.save();
    if (opts.clip) c.clip(opts.clip);
    if (opts.blur) c.filter = this.blurUnit(opts.blur);
    c.globalCompositeOperation = opts.mode || "multiply";
    c.globalAlpha = opts.alpha == null ? 1 : opts.alpha;
    c.fillStyle = opts.color;
    if (opts.shift) c.translate(opts.shift[0], opts.shift[1]);
    c.fill(opts.path);
    c.restore();
  };

  Painter.prototype.stroke = function (p, style, w, opts) {
    opts = opts || {};
    var c = this.c;
    c.save();
    if (opts.clip) c.clip(opts.clip);
    if (opts.blur) c.filter = this.blurUnit(opts.blur);
    if (opts.mode) c.globalCompositeOperation = opts.mode;
    if (opts.alpha != null) c.globalAlpha = opts.alpha;
    c.strokeStyle = style;
    c.lineWidth = w;
    c.lineJoin = "round";
    c.lineCap = "round";
    c.stroke(p);
    c.restore();
  };

  // Line art: a soft wide pass under a crisp narrow one, which reads as an
  // inked line with weight rather than a uniform outline.
  Painter.prototype.ink = function (p, color, w) {
    this.stroke(p, color, w * 2.1, { blur: 0.4, alpha: 0.35 });
    this.stroke(p, color, w, { alpha: 1 });
  };

  /* ================= the portrait ====================================== */

  function paintPortrait(ctx, t, S) {
    var k = S / 100;
    var g = new Painter(ctx, k);
    var r = rng(t.strandSeed);

    var skin = t.skin, hair = t.hairColor, cloth = t.clothes;
    var skinLine = mix(skin[2], "#8a5a63", 0.45);
    var hairLine = mix(hair[2], "#7a5560", 0.4);

    ctx.save();
    ctx.setTransform(k, 0, 0, k, 0, 0);

    /* ---- background ---- */
    var bgGrad = ctx.createLinearGradient(0, 0, 0, 100);
    bgGrad.addColorStop(0, t.bg[0]);
    bgGrad.addColorStop(1, t.bg[1]);
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, 100, 100);

    sparkles(g, t);

    // everything below is drawn tilted, like a portrait on a slight angle
    ctx.translate(50, 52); ctx.rotate(t.tilt * Math.PI / 180); ctx.translate(-50, -52);

    /* ---- back hair ---- */
    var back = g.path(hairBackPath(t));
    var hairGrad = ctx.createLinearGradient(0, 4, 0, 100);
    hairGrad.addColorStop(0, hair[0]);
    hairGrad.addColorStop(0.45, hair[1]);
    hairGrad.addColorStop(1, hair[2]);
    g.fill(back, hairGrad);
    g.soft({ path: g.path("M50,40 m-46,0 a46,46 0 1,0 92,0 a46,46 0 1,0 -92,0"),
             clip: back, color: shadowOf(hair[2], 0.5), alpha: 0.25, blur: 6 });
    g.ink(back, hairLine, 0.62);

    /* ---- torso ---- */
    torso(g, ctx, t, skin, cloth, skinLine);

    /* ---- head ---- */
    var head = g.path(HEAD);
    var faceGrad = ctx.createRadialGradient(50, 40, 4, 50, 46, 34);
    faceGrad.addColorStop(0, skin[0]);
    faceGrad.addColorStop(0.65, skin[1]);
    faceGrad.addColorStop(1, mix(skin[1], skin[2], 0.55));
    g.fill(head, faceGrad);

    // modelling: hair shadow across the forehead, temples, jaw, chin
    g.soft({ path: g.path("M24,0 C24,30 34,36 50,36 C66,36 76,30 76,0 Z"),
             clip: head, color: shadowOf(skin[2], 0.35), alpha: 0.55, blur: 3.5 });
    g.soft({ path: g.path("M30,34 C28,48 32,60 38,68 L28,70 L26,40 Z"),
             clip: head, color: shadowOf(skin[2], 0.3), alpha: 0.3, blur: 4 });
    g.soft({ path: g.path("M70,34 C72,48 68,60 62,68 L72,70 L74,40 Z"),
             clip: head, color: shadowOf(skin[2], 0.3), alpha: 0.3, blur: 4 });
    g.soft({ path: g.path("M40,68 C44,74 56,74 60,68 C58,76 42,76 40,68 Z"),
             clip: head, color: shadowOf(skin[2], 0.35), alpha: 0.35, blur: 3 });
    // cheekbone light and a soft shadow under it — structure, not a smooth egg
    g.soft({ mode: "screen", clip: g.path(HEAD), color: lightOf(skin[0], 0.9), alpha: 0.4,
             blur: 3.5, path: g.path("M36,54 m-5,0 a5,3.4 0 1,0 10,0 a5,3.4 0 1,0 -10,0") });
    g.soft({ mode: "screen", clip: g.path(HEAD), color: lightOf(skin[0], 0.9), alpha: 0.4,
             blur: 3.5, path: g.path("M64,54 m-5,0 a5,3.4 0 1,0 10,0 a5,3.4 0 1,0 -10,0") });
    g.soft({ clip: g.path(HEAD), color: shadowOf(skin[2], 0.3), alpha: 0.28, blur: 3,
             path: g.path("M33,60 C36,66 42,70 46,72 L34,72 Z") });
    g.soft({ clip: g.path(HEAD), color: shadowOf(skin[2], 0.3), alpha: 0.28, blur: 3,
             path: g.path("M67,60 C64,66 58,70 54,72 L66,72 Z") });
    // light on the forehead, nose bridge and the tops of the cheeks
    g.soft({ mode: "screen", path: g.path("M50,44 m-9,0 a9,13 0 1,0 18,0 a9,13 0 1,0 -18,0"),
             clip: head, color: lightOf(skin[0], 0.8), alpha: 0.35, blur: 5 });
    g.ink(head, skinLine, 0.55);

    if (t.blush) blush(g, head, skin);
    if (t.freckles) freckles(g, head, skin, r);

    eyes(g, ctx, t, skin, skinLine);
    nose(g, skin, skinLine);
    mouth(g, t, skinLine);

    /* ---- front hair, over the face ---- */
    frontHair(g, ctx, t, hair, hairLine, r);

    // Ears last: they sit on top of the hair, not under it.
    ears(g, ctx, t, hair, hairLine, skin);

    if (t.extra !== "none") accessory(g, t);

    ctx.restore();
  }

  /* ---- pieces --------------------------------------------------------- */

  function sparkles(g, t) {
    var pts = [[12, 20, 3.2], [88, 26, 2.4], [17, 62, 2], [86, 56, 2.8], [77, 12, 1.6]];
    pts.forEach(function (p) {
      var d = "M" + p[0] + "," + (p[1] - p[2]) +
        " C" + p[0] + "," + (p[1] - p[2] * 0.2) + " " + (p[0] + p[2] * 0.2) + "," + p[1] +
        " " + (p[0] + p[2]) + "," + p[1] +
        " C" + (p[0] + p[2] * 0.2) + "," + p[1] + " " + p[0] + "," + (p[1] + p[2] * 0.2) +
        " " + p[0] + "," + (p[1] + p[2]) +
        " C" + p[0] + "," + (p[1] + p[2] * 0.2) + " " + (p[0] - p[2] * 0.2) + "," + p[1] +
        " " + (p[0] - p[2]) + "," + p[1] +
        " C" + (p[0] - p[2] * 0.2) + "," + p[1] + " " + p[0] + "," + (p[1] - p[2] * 0.2) +
        " " + p[0] + "," + (p[1] - p[2]) + " Z";
      var path = g.path(d);
      g.soft({ path: path, color: "#fff6d0", alpha: 0.9, mode: "source-over", blur: 0.6 });
    });
  }

  function torso(g, ctx, t, skin, cloth, skinLine) {
    var neck = g.path("M43,62 C43,72 42,76 40,80 L60,80 C58,76 57,72 57,62 Z");
    var chest = g.path("M50,78 C32,78 16,88 11,112 L89,112 C84,88 68,78 50,78 Z");
    g.fill(chest, mix(skin[1], skin[0], 0.4));
    g.fill(neck, skin[1]);
    // the chin throws a hard-ish shadow down the neck — a signature of the look
    g.soft({ path: g.path("M40,60 C44,72 56,72 60,60 C60,74 40,74 40,60 Z"),
             clip: neck, color: shadowOf(skin[2], 0.55), alpha: 0.75, blur: 2 });
    g.soft({ path: g.path("M36,78 C44,84 56,84 64,78 C60,88 40,88 36,78 Z"),
             clip: chest, color: shadowOf(skin[2], 0.4), alpha: 0.4, blur: 3 });
    g.ink(neck, skinLine, 0.4);
    g.ink(chest, skinLine, 0.4);

    // collarbones
    g.stroke(g.path("M40,88 C44,91 47,92 49,91.5"), shadowOf(skin[2], 0.35), 0.7,
             { clip: chest, blur: 0.5, alpha: 0.5 });
    g.stroke(g.path("M60,88 C56,91 53,92 51,91.5"), shadowOf(skin[2], 0.35), 0.7,
             { clip: chest, blur: 0.5, alpha: 0.5 });

    // off-shoulder top
    var top = g.path("M8,112 C6,96 12,86 21,84 C29,82.5 33,89 39,91 " +
                     "C43,92.5 46,93 50,93 C54,93 57,92.5 61,91 " +
                     "C67,89 71,82.5 79,84 C88,86 94,96 92,112 Z");
    var cg = ctx.createLinearGradient(0, 82, 0, 112);
    cg.addColorStop(0, cloth[0]);
    cg.addColorStop(0.5, cloth[1]);
    cg.addColorStop(1, mix(cloth[1], cloth[2], 0.6));
    g.fill(top, cg);
    g.soft({ path: g.path("M50,93 C40,93 33,88 26,84 L20,112 L80,112 L74,84 C67,88 60,93 50,93 Z"),
             clip: top, color: shadowOf(cloth[2], 0.4), alpha: 0.2, blur: 4 });
    // fold shadows where the sleeves meet the bodice
    g.stroke(g.path("M27,86 C25,94 25,104 26,112"), shadowOf(cloth[2], 0.4), 1.2,
             { clip: top, blur: 1, alpha: 0.35 });
    g.stroke(g.path("M73,86 C75,94 75,104 74,112"), shadowOf(cloth[2], 0.4), 1.2,
             { clip: top, blur: 1, alpha: 0.35 });
    g.ink(top, mix(cloth[2], "#7a5560", 0.35), 0.45);
    // neckline strap highlight
    g.stroke(g.path("M39,91 C43,92.5 46,93 50,93 C54,93 57,92.5 61,91"),
             lightOf(cloth[0], 0.7), 0.6, { alpha: 0.7 });

    choker(g, t);
  }

  function choker(g, t) {
    var band = g.path("M41,74 C44,77 56,77 59,74 L59,78.5 C56,81.5 44,81.5 41,78.5 Z");
    g.fill(band, "#f2607d");
    g.soft({ path: band, color: "#8c3550", alpha: 0.5, blur: 1.2, shift: [0, 1.2] });
    g.stroke(g.path("M41.6,75 C44.6,77.6 55.4,77.6 58.4,75"), "#ffb3c4", 0.6, { alpha: 0.8 });
    g.ink(band, "#a8425c", 0.4);
    // heart pendant
    var heart = g.path("M50,84 C48.6,81.4 45.2,81.6 45.2,84.4 C45.2,86.8 48,88.4 50,90.2 " +
                       "C52,88.4 54.8,86.8 54.8,84.4 C54.8,81.6 51.4,81.4 50,84 Z");
    g.fill(heart, "#f0c34a");
    g.soft({ mode: "screen", path: heart, color: "#fff3c4", alpha: 0.8, blur: 0.8,
             shift: [-0.5, -0.6] });
    g.ink(heart, "#a87c1e", 0.35);
  }

  function ears(g, ctx, t, hair, hairLine, skin) {
    var L, R, LI, RI;
    if (t.ears === "round") {
      L = "M33,28 C25,25 24,12 32,9 C40,7 44,16 43,24 Z";
      R = "M67,28 C75,25 76,12 68,9 C60,7 56,16 57,24 Z";
      LI = "M34,25 C29,22 29,14 33,13 C38,13 40,19 39,23 Z";
      RI = "M66,25 C71,22 71,14 67,13 C62,13 60,19 61,23 Z";
    } else if (t.ears === "folded") {
      L = "M33,29 C25,20 28,9 37,10 C44,12 46,19 45,25 C41,20 36,22 33,29 Z";
      R = "M67,29 C75,20 72,9 63,10 C56,12 54,19 55,25 C59,20 64,22 67,29 Z";
      LI = "M35,24 C31,18 33,14 38,15 C42,16 43,20 42,23 Z";
      RI = "M65,24 C69,18 67,14 62,15 C58,16 57,20 58,23 Z";
    } else {
      L = "M33,29 C27,22 25,10 27,6 C34,9 43,17 45,26 Z";
      R = "M67,29 C73,22 75,10 73,6 C66,9 57,17 55,26 Z";
      LI = "M35,25 C31,20 30,13 31,11 C36,14 41,19 42,24 Z";
      RI = "M65,25 C69,20 70,13 69,11 C64,14 59,19 58,24 Z";
    }
    [[L, LI], [R, RI]].forEach(function (pair) {
      var outer = g.path(pair[0]), inner = g.path(pair[1]);
      var eg = ctx.createLinearGradient(0, 4, 0, 32);
      eg.addColorStop(0, hair[1]);
      eg.addColorStop(1, hair[0]);
      g.fill(outer, eg);
      // the fluff: a light blurred core, not a flat pink triangle
      g.fill(inner, mix(skin[1], "#ffb9c6", 0.35));
      g.soft({ mode: "screen", path: inner, color: "#fff4ea", alpha: 0.75, blur: 1.6 });
      g.soft({ path: outer, color: shadowOf(hair[2], 0.4), alpha: 0.3, blur: 2.5,
               shift: [0, 3], clip: outer });
      g.ink(outer, hairLine, 0.55);
    });
  }

  function blush(g, head, skin) {
    [32.5, 67.5].forEach(function (x) {
      var p = g.path("M" + x + "," + BLUSH_Y + " m-7,0 a7,4.4 0 1,0 14,0 a7,4.4 0 1,0 -14,0");
      g.soft({ path: p, clip: head, color: "#f2758f", alpha: 0.34, blur: 3.4 });
    });
    // a hint of warmth across the nose, which ties the two cheeks together
    g.soft({ path: g.path("M50,54 m-8,0 a8,3 0 1,0 16,0 a8,3 0 1,0 -16,0"),
             clip: head, color: "#f2758f", alpha: 0.14, blur: 4 });
  }

  function freckles(g, head, skin, r) {
    var c = g.c;
    c.save(); c.clip(head);
    c.globalAlpha = 0.5;
    c.fillStyle = shadowOf(skin[2], 0.4);
    for (var i = 0; i < 14; i++) {
      var side = i % 2 ? 1 : -1;
      var x = 50 + side * (5 + r() * 9), y = 53 + r() * 6;
      c.beginPath(); c.arc(x, y, 0.3 + r() * 0.28, 0, 6.284); c.fill();
    }
    c.restore();
  }

  /* ---- eyes ----------------------------------------------------------- */

  function eyeOutline(cx, drop, shape) {
    var o = cx < 50 ? -1 : 1;
    var rx = EYE.rx, ry = EYE.ry * (shape === "sleepy" ? 0.82 : shape === "wide" ? 1.08 : 1);
    var y = EYE.y + drop;
    var n = function (v) { return Math.round(v * 100) / 100; };
    return "M" + n(cx - o * rx) + "," + n(y + ry * 0.42) +
      " C" + n(cx - o * rx * 0.78) + "," + n(y - ry * 0.85) +
        " " + n(cx + o * rx * 0.1) + "," + n(y - ry * 1.28) +
        " " + n(cx + o * rx * 0.88) + "," + n(y - ry * 0.72) +
      " C" + n(cx + o * rx * 1.06) + "," + n(y - ry * 0.1) +
        " " + n(cx + o * rx * 0.78) + "," + n(y + ry * 0.98) +
        " " + n(cx + o * rx * 0.06) + "," + n(y + ry * 1.22) +
      " C" + n(cx - o * rx * 0.5) + "," + n(y + ry * 1.16) +
        " " + n(cx - o * rx * 0.92) + "," + n(y + ry * 0.82) +
        " " + n(cx - o * rx) + "," + n(y + ry * 0.42) + " Z";
  }

  function eyes(g, ctx, t, skin, skinLine) {
    var drop = t.eyeShape === "sleepy" ? 1.4 : 0;
    [[EYE.l, 0], [EYE.r, 1]].forEach(function (e) {
      oneEye(g, ctx, t, e[0], e[1], drop, skin);
    });
    brows(g, t, skin);
  }

  function oneEye(g, ctx, t, cx, side, drop, skin) {
    var c = g.c;
    var col = side && t.heterochromia ? t.altEyeColor : t.eyeColor;
    var o = cx < 50 ? -1 : 1;
    var y = EYE.y + drop;
    var shell = g.path(eyeOutline(cx, drop, t.eyeShape));
    var ry = EYE.ry * (t.eyeShape === "sleepy" ? 0.82 : t.eyeShape === "wide" ? 1.08 : 1);
    var rx = EYE.rx;
    // The iris nearly fills the opening. Leaving a lot of white was what made
    // earlier passes look like a doll rather than a drawing.
    var ir = ry * 1.16, iy = y + ry * 0.06;

    g.fill(shell, "#fffaf4");
    c.save();
    c.clip(shell);

    // iris: dark at the top where the lid shades it, bright at the bottom
    var ig = ctx.createLinearGradient(0, iy - ir, 0, iy + ir);
    ig.addColorStop(0, col[2]);
    ig.addColorStop(0.45, col[1]);
    ig.addColorStop(1, col[0]);
    c.fillStyle = ig;
    c.beginPath(); c.ellipse(cx, iy, ir * 0.94, ir, 0, 0, 6.284); c.fill();

    // spokes and a soft inner glow low in the iris
    c.save();
    c.globalAlpha = 0.3;
    c.strokeStyle = col[2];
    c.lineWidth = 0.32;
    for (var i = 0; i < 12; i++) {
      var a = (i / 12) * 6.284;
      c.beginPath();
      c.moveTo(cx + Math.cos(a) * ir * 0.34, iy + Math.sin(a) * ir * 0.36);
      c.lineTo(cx + Math.cos(a) * ir * 0.86, iy + Math.sin(a) * ir * 0.92);
      c.stroke();
    }
    c.restore();
    g.soft({ mode: "screen", color: col[0], alpha: 0.85, blur: 1.4,
             path: g.path("M" + cx + "," + (iy + ir * 0.5) + " m-" + (ir * 0.58) + ",0 a" +
               (ir * 0.58) + "," + (ir * 0.36) + " 0 1,0 " + (ir * 1.16) + ",0 a" +
               (ir * 0.58) + "," + (ir * 0.36) + " 0 1,0 -" + (ir * 1.16) + ",0") });

    c.save();
    c.globalAlpha = 0.7;
    c.strokeStyle = col[2];
    c.lineWidth = 0.85;
    c.beginPath(); c.ellipse(cx, iy, ir * 0.94, ir, 0, 0, 6.284); c.stroke();
    c.restore();

    c.fillStyle = mix(col[2], "#241624", 0.7);
    c.beginPath(); c.ellipse(cx, iy + ir * 0.05, ir * 0.3, ir * 0.42, 0, 0, 6.284); c.fill();

    // shadow cast into the eye by the upper lid
    g.soft({ color: shadowOf(col[2], 0.65), alpha: 0.55, blur: 2, shift: [0, -2.2],
             path: shell });
    c.restore();

    var h1 = g.path("M" + (cx - o * 2.2) + "," + (y - ry * 0.5) +
                    " m-2.8,0 a2.8,2.3 0 1,0 5.6,0 a2.8,2.3 0 1,0 -5.6,0");
    var h2 = g.path("M" + (cx + o * 2.6) + "," + (y + ry * 0.66) +
                    " m-1.3,0 a1.3,1.3 0 1,0 2.6,0 a1.3,1.3 0 1,0 -2.6,0");
    g.soft({ path: h1, color: "#fff", alpha: 1, mode: "source-over" });
    g.soft({ path: h2, color: "#fff", alpha: 0.95, mode: "source-over" });
    g.soft({ path: h1, color: "#fff", alpha: 0.45, mode: "screen", blur: 2 });

    // Upper lash: a heavy band across the whole opening, thickening outward
    // into a small wing. A thin taper read as a pencil line, not lashes.
    var lashCol = "#40283a";
    var lash = g.path(
      "M" + (cx - o * rx * 1.02) + "," + (y + ry * 0.36) +
      " C" + (cx - o * rx * 0.8) + "," + (y - ry * 0.95) +
      " " + (cx + o * rx * 0.1) + "," + (y - ry * 1.42) +
      " " + (cx + o * rx * 0.92) + "," + (y - ry * 0.78) +
      " L" + (cx + o * rx * 1.14) + "," + (y - ry * 1.08) +
      " C" + (cx + o * rx * 0.72) + "," + (y - ry * 1.62) +
      " " + (cx - o * rx * 0.35) + "," + (y - ry * 1.5) +
      " " + (cx - o * rx * 1.06) + "," + (y + ry * 0.1) + " Z");
    g.soft({ path: lash, color: lashCol, alpha: 0.3, blur: 0.8, mode: "source-over" });
    g.fill(lash, lashCol);

    g.stroke(g.path("M" + (cx - o * rx * 0.72) + "," + (y - ry * 1.72) +
      " C" + (cx - o * rx * 0.1) + "," + (y - ry * 2.15) +
      " " + (cx + o * rx * 0.72) + "," + (y - ry * 2.05) +
      " " + (cx + o * rx * 1.06) + "," + (y - ry * 1.3)),
      mix(skin[2], "#8a5a63", 0.4), 0.45, { alpha: 0.5, blur: 0.3 });

    // lower lash line: thin, dark, outer half only
    g.stroke(g.path("M" + (cx + o * rx * 0.1) + "," + (y + ry * 1.24) +
      " C" + (cx + o * rx * 0.7) + "," + (y + ry * 1.1) +
      " " + (cx + o * rx) + "," + (y + ry * 0.72) +
      " " + (cx + o * rx * 1.02) + "," + (y + ry * 0.3)),
      mix(lashCol, skin[2], 0.35), 0.5, { alpha: 0.8, blur: 0.2 });

    g.soft({ path: g.path("M" + (cx - o * rx * 0.92) + "," + (y + ry * 0.3) +
      " m-1.5,0 a1.5,1.1 0 1,0 3,0 a1.5,1.1 0 1,0 -3,0"),
      color: "#e88ea0", alpha: 0.45, blur: 1 });
  }

  function brows(g, t, skin) {
    var col = mix(t.hairColor[2], "#7a5560", 0.35);
    [[EYE.l, -1], [EYE.r, 1]].forEach(function (e) {
      var cx = e[0], o = e[1];
      var d = "M" + (cx - o * 5.4) + "," + (BROW_Y + 1) +
              " C" + (cx - o * 2.6) + "," + (BROW_Y - 1.2) +
              " " + (cx + o * 2.8) + "," + (BROW_Y - 0.9) +
              " " + (cx + o * 5.2) + "," + (BROW_Y + 0.7);
      g.stroke(g.path(d), col, 1.1, { alpha: 0.35, blur: 0.8 });
      g.stroke(g.path(d), col, 0.62, { alpha: 0.75 });
    });
  }

  function nose(g, skin, skinLine) {
    g.soft({ path: g.path("M50," + (NOSE_Y - 1.4) + " C51.8," + NOSE_Y +
             " 51.4," + (NOSE_Y + 1.1) + " 49.4," + (NOSE_Y + 0.9) + " Z"),
             color: shadowOf(skin[2], 0.5), alpha: 0.55, blur: 0.9 });
  }

  function mouth(g, t, skinLine) {
    var my = MOUTH_Y;
    var lip = mix(skinLine, "#c4566f", 0.5);
    if (t.mouth === "open") {
      var m = g.path("M46.4," + my + " C47.8," + (my + 4.6) + " 52.2," + (my + 4.6) +
                     " 53.6," + my + " C51.2," + (my + 1.3) + " 48.8," + (my + 1.3) +
                     " 46.4," + my + " Z");
      g.fill(m, "#a03c58");
      g.soft({ path: m, color: "#5e2036", alpha: 0.6, blur: 0.8, shift: [0, -0.6] });
      var tongue = g.path("M48.2," + (my + 2.6) + " C49," + (my + 4.6) + " 51," + (my + 4.6) +
                          " 51.8," + (my + 2.6) + " C50.6," + (my + 2) + " 49.4," + (my + 2) +
                          " 48.2," + (my + 2.6) + " Z");
      g.fill(tongue, "#f2839f");
      g.ink(m, lip, 0.35);
      // a bright edge on the lower lip
      g.stroke(g.path("M47.6," + (my + 3.8) + " C49," + (my + 5.2) + " 51," + (my + 5.2) +
               " 52.4," + (my + 3.8)), "#ffd9dd", 0.5, { alpha: 0.55, blur: 0.4, mode: "screen" });
    } else if (t.mouth === "cat") {
      g.stroke(g.path("M46.6," + my + " C47.8," + (my + 2.2) + " 49," + (my + 2.2) +
               " 50," + my + " C51," + (my + 2.2) + " 52.2," + (my + 2.2) + " 53.4," + my),
               lip, 0.75, { alpha: 0.85 });
    } else if (t.mouth === "smug") {
      g.stroke(g.path("M47," + (my + 0.8) + " C50," + (my + 2.6) + " 53," + (my + 1.6) +
               " 54," + (my - 1)), lip, 0.75, { alpha: 0.85 });
    } else {
      g.stroke(g.path("M47," + my + " C48.6," + (my + 2.6) + " 51.4," + (my + 2.6) +
               " 53," + my), lip, 0.75, { alpha: 0.85 });
    }
  }

  /* ---- front hair ------------------------------------------------------ */

  function frontHair(g, ctx, t, hair, hairLine, r) {
    var tips = bangTips(t);

    // base cap under the strands, slightly deeper so the strands read on top
    var cap = "M20,46 C20,18 34,8 50,8 C66,8 80,18 80,46";
    tips.forEach(function (p) {
      cap += " C" + (p[0] + 5) + "," + (p[1] - 7) +
             " " + (p[0] + 2) + "," + (p[1] - 1) + " " + p[0] + "," + p[1];
    });
    cap += " L20,46 Z";
    var capPath = g.path(cap);
    var capGrad = ctx.createLinearGradient(0, 8, 0, 48);
    capGrad.addColorStop(0, hair[1]);
    capGrad.addColorStop(1, mix(hair[2], hair[1], 0.35));
    g.fill(capPath, capGrad);

    // face-framing locks
    ["M26,30 C18,44 15,64 19,84 C22,72 24,60 30,52 C27,44 26,37 30,31 Z",
     "M74,30 C82,44 85,64 81,84 C78,72 76,60 70,52 C73,44 74,37 70,31 Z"].forEach(function (d) {
      var p = g.path(d);
      var lg = ctx.createLinearGradient(0, 28, 0, 80);
      lg.addColorStop(0, hair[0]);
      lg.addColorStop(1, hair[2]);
      g.fill(p, lg);
      g.ink(p, hairLine, 0.5);
    });

    // the strands themselves
    tips.forEach(function (p, i) {
      var w = 5.6 + (i % 3) * 1.6 + r() * 1.2;
      var cx = 50 + (p[0] - 50) * 0.4;
      var d = "M" + (cx - w) + ",16" +
        " C" + (cx - w) + "," + (16 + p[1] * 0.4) +
        " " + (p[0] - w * 0.72) + "," + (p[1] - 11) + " " + p[0] + "," + p[1] +
        " C" + (p[0] + w * 0.72) + "," + (p[1] - 11) +
        " " + (cx + w) + "," + (16 + p[1] * 0.4) + " " + (cx + w) + ",16 Z";
      var path = g.path(d);
      // each strand drops a soft shadow on the one behind it
      g.soft({ path: path, color: shadowOf(hair[2], 0.45), alpha: 0.45, blur: 1.6,
               shift: [1.4, 1.6] });
      var sg = ctx.createLinearGradient(0, 14, 0, p[1] + 4);
      sg.addColorStop(0, lightOf(hair[0], i % 2 ? 0.25 : 0));
      sg.addColorStop(0.55, hair[1]);
      sg.addColorStop(1, mix(hair[1], hair[2], 0.75));
      g.fill(path, sg);
      g.ink(path, hairLine, 0.42);
    });

    // the sheen band: blurred, screened, with a broken lower edge
    var sheen = g.path("M26,22 C34,12 66,12 74,22 C72,30 67,25 62,29 " +
                       "C57,33 53,25 50,29 C47,33 43,25 38,29 C33,33 28,30 26,22 Z");
    g.soft({ mode: "screen", path: sheen, color: lightOf(hair[0], 0.85), alpha: 0.65, blur: 2.4 });

    // rim light along the top of the silhouette
    g.stroke(g.path("M20,40 C20,12 34,2 50,2 C66,2 80,12 80,40"),
             lightOf(hair[0], 0.9), 1.4, { mode: "screen", alpha: 0.5, blur: 1.4 });

    // flyaways
    g.stroke(g.path("M30,10 C24,17 21,26 21,34"), hairLine, 0.4, { alpha: 0.5 });
    g.stroke(g.path("M70,10 C76,17 79,26 79,34"), hairLine, 0.4, { alpha: 0.5 });
    g.stroke(g.path("M44,4 C40,10 38,17 38,23"), hairLine, 0.35, { alpha: 0.4 });
  }

  function accessory(g, t) {
    if (t.extra === "clip") {
      var clip = g.path("M64,26 m-4.5,-2 l9,0 l0,4 l-9,0 Z");
      g.fill(clip, "#f5c84a");
      g.ink(clip, "#a87c1e", 0.35);
      g.soft({ mode: "screen", path: clip, color: "#fff3c4", alpha: 0.7, blur: 0.8,
               shift: [-0.4, -0.5] });
    } else if (t.extra === "flower") {
      var c = g.c;
      c.save();
      c.translate(30, 22);
      for (var i = 0; i < 5; i++) {
        var a = (i / 5) * 6.284;
        c.fillStyle = "#f8a8c0";
        c.beginPath(); c.ellipse(Math.cos(a) * 3.4, Math.sin(a) * 3.4, 2.6, 2.6, 0, 0, 6.284);
        c.fill();
      }
      c.fillStyle = "#ffd76e";
      c.beginPath(); c.arc(0, 0, 2, 0, 6.284); c.fill();
      c.restore();
    } else {
      var bow = g.path("M68,24 C74,18 80,20 79,25 C78,29 72,29 68,26 Z" +
                       "M68,26 C64,30 58,31 58,26 C58,21 64,21 68,24 Z");
      g.fill(bow, "#f2607d");
      g.soft({ path: bow, color: "#8c3550", alpha: 0.4, blur: 1, shift: [0, 1] });
      g.ink(bow, "#a8425c", 0.4);
    }
  }

  /* ================= post-processing =================================== */

  function grade(ctx, S, t) {
    // bloom: bright areas blurred back over the image
    var b = document.createElement("canvas");
    b.width = S; b.height = S;
    var bx = b.getContext("2d");
    bx.drawImage(ctx.canvas, 0, 0);
    bx.globalCompositeOperation = "source-in";
    bx.drawImage(ctx.canvas, 0, 0);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = "screen";
    ctx.globalAlpha = 0.08;
    ctx.filter = "blur(" + (S * 0.012).toFixed(1) + "px)";
    ctx.drawImage(b, 0, 0);
    ctx.restore();

    // warm grade
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = "soft-light";
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = "#ffd9a8";
    ctx.fillRect(0, 0, S, S);
    ctx.restore();

    // paper grain
    var n = document.createElement("canvas");
    var NS = 96;
    n.width = NS; n.height = NS;
    var nx = n.getContext("2d");
    var img = nx.createImageData(NS, NS);
    var r = rng(hash(t.seed) ^ 0x9e3779b9);
    for (var i = 0; i < img.data.length; i += 4) {
      var v = 118 + Math.floor(r() * 34);
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    nx.putImageData(img, 0, 0);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = "overlay";
    ctx.globalAlpha = 0.13;
    var pat = ctx.createPattern(n, "repeat");
    ctx.fillStyle = pat;
    ctx.fillRect(0, 0, S, S);
    ctx.restore();
  }

  /* ================= entry point ======================================= */

  function nyapaint(seed, opts) {
    opts = opts || {};
    var size = opts.size || 512;
    var ss = opts.supersample === false ? 1 : 2;   // draw big, scale down
    var S = size * ss;
    var t = traits(seed);

    var big = document.createElement("canvas");
    big.width = S; big.height = S;
    var ctx = big.getContext("2d");
    paintPortrait(ctx, t, S);
    grade(ctx, S, t);

    if (ss === 1) return big;
    var out = document.createElement("canvas");
    out.width = size; out.height = size;
    var o = out.getContext("2d");
    o.imageSmoothingEnabled = true;
    o.imageSmoothingQuality = "high";
    o.drawImage(big, 0, 0, size, size);
    return out;
  }

  nyapaint.traits = traits;
  nyapaint.hash = hash;
  nyapaint.dataUrl = function (seed, opts) {
    return nyapaint(seed, opts).toDataURL("image/png");
  };
  return nyapaint;
});
