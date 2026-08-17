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
  function n(v) { return Math.round(v * 100) / 100; }

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
  // Measured against the reference: the visible face — bangs to chin — covers
  // only about a fifth of the frame. Drawing it a third of the frame tall was
  // the single biggest thing making the portrait look wrong.
  // Wider: the eyes span most of the face width in the reference too, but on
  // a broader face. Keeping the face narrow made them collide.
  var HEAD = "M50,25 C64,25 71,33 71,46 C71,55 69,60 64,64 " +
             "C60,68 54,71 50,71 C46,71 40,68 36,64 " +
             "C31,60 29,55 29,46 C29,33 36,25 50,25 Z";

  var EYE = { y: 55.5, l: 39.8, r: 60.2, rx: 6.6, ry: 5.9 };
  var BROW_Y = 45, NOSE_Y = 61.5, MOUTH_Y = 64.8, BLUSH_Y = 58.5;

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
        return "M50,9 C74,9 88,25 88,46 C84,56 86,66 91,76 " +
               "C88,90 92,104 95,118 L74,118 " +
               "C77,96 79,76 78,58 C74,80 72,98 71,118 L29,118 " +
               "C28,98 26,80 22,58 C21,76 23,96 26,118 L5,118 " +
               "C8,104 12,90 9,76 C14,66 16,56 12,46 C12,25 26,9 50,9 Z";
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
        // The outer edge waves: in and out at cheek and shoulder height, then
        // splits into lock tips at the hem.
        return "M50,9 C75,9 89,27 90,45 C87,58 90,66 94,78 " +
               "C91,88 94,102 97,118 L76,118 " +
               "C82,102 83,84 80,66 C77,86 73,102 71,118 L29,118 " +
               "C27,102 23,86 20,66 C17,84 18,102 24,118 L9,118 " +
               "C11,100 8,86 11,74 C15,62 12,54 10,45 " +
               "C10,27 25,9 50,9 Z";
    }
  }

  // Bang tips, right to left. y is where the strand ends.
  function bangTips(t) {
    switch (t.hair) {
      // Staggered lengths: an even row of tips draws a straight hem.
      case "hime":  return [[69, 45], [62, 49], [55, 45], [46, 50], [39, 45], [31, 48]];
      case "bob":   return [[68, 43], [61, 48], [54, 44], [46, 49], [39, 44], [32, 47]];
      case "buns":  return [[67, 42], [58, 47], [50, 43], [42, 48], [33, 44]];
      case "ponytail": return [[66, 41], [57, 47], [49, 43], [41, 48], [33, 44]];
      case "twintails": return [[68, 43], [61, 48], [54, 44], [46, 49], [39, 44], [32, 47]];
      default:      return [[69, 44], [62, 50], [55, 45], [46, 51], [39, 45], [31, 48]];
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

  // Finer strand lines inside the fringe itself, fanning from the parting.
  function fringeStrands(g, clipPath, hair, r) {
    var deep = shadowOf(hair[2], 0.4), lit = lightOf(hair[0], 0.7);
    for (var i = 0; i < 12; i++) {
      var x0 = 50 + (r() * 2 - 1) * 10;
      var x1 = 50 + (r() * 2 - 1) * 34;
      var d = "M" + n(x0) + ",6 C" + n(x0 + (x1 - x0) * 0.5) + ",22 " +
              n(x1) + ",32 " + n(x1) + "," + n(46 + r() * 10);
      var p = g.path(d);
      g.stroke(p, deep, 1 + r() * 1.4, { clip: clipPath, blur: 1, alpha: 0.16 });
      g.stroke(p, lit, 0.6, { clip: clipPath, blur: 0.7, alpha: 0.2, mode: "screen" });
    }
  }

  // Long strands running from the crown down through the mass. Without these
  // the back hair is a single flat gradient — the thing that most made it read
  // as a moulded shape rather than hair.
  function hairStrands(g, clipPath, hair, r) {
    var deep = shadowOf(hair[2], 0.45), lit = lightOf(hair[0], 0.7);
    for (var i = 0; i < 18; i++) {
      var side = i % 2 ? 1 : -1;
      var t = r();
      // start near the crown, end out at the hem, bowing outward on the way
      var x0 = 50 + side * (4 + t * 26);
      var x1 = 50 + side * (18 + t * 26 + r() * 8);
      var bow = 50 + side * (16 + t * 30);
      var y1 = 70 + r() * 48;
      var d = "M" + n(x0) + ",10 C" + n(bow) + "," + n(30 + r() * 14) +
              " " + n(x1) + "," + n(48 + r() * 16) + " " + n(x1) + "," + n(y1);
      var p = g.path(d);
      g.stroke(p, deep, 2 + r() * 3, { clip: clipPath, blur: 1.6, alpha: 0.3 });
      g.stroke(p, lit, 1 + r() * 1.6, { clip: clipPath, blur: 0.9, alpha: 0.34,
                                        mode: "screen" });
    }
  }

  // Two masses sweeping down over the shoulders, with the same strand
  // treatment as the rest of the hair.
  function frontShoulderHair(g, ctx, t, hair, hairLine, r) {
    if (t.hair === "bob" || t.hair === "buns") return;   // too short to reach
    var wide = t.hair === "hime" || t.hair === "long";
    var outL = wide ? 12 : 20, outR = 100 - outL;

    [[1, outL], [-1, outR]].forEach(function (e) {
      var dir = e[0], x = e[1];
      var d = "M" + (50 - dir * 14) + ",44" +
        " C" + (x + dir * 4) + ",58 " + x + ",78 " + (x + dir * 2) + ",118" +
        " L" + (x - dir * 12) + ",118" +
        " C" + (x - dir * 8) + ",88 " + (50 - dir * 20) + ",64 " +
        (50 - dir * 10) + ",46 Z";
      var p = g.path(d);
      var lg = ctx.createLinearGradient(0, 44, 0, 118);
      lg.addColorStop(0, hair[1]);
      lg.addColorStop(0.5, mix(hair[1], hair[2], 0.4));
      lg.addColorStop(1, hair[2]);
      g.soft({ path: p, color: shadowOf(hair[2], 0.5), alpha: 0.3, blur: 3,
               shift: [dir * -2, 2] });
      g.fill(p, lg);
      // a couple of strand lines and a soft highlight down the length
      g.stroke(g.path("M" + (50 - dir * 12) + ",50 C" + (x + dir * 2) + ",70 " +
        (x - dir * 2) + ",90 " + (x - dir * 1) + ",116"),
        lightOf(hair[0], 0.7), 1.6, { clip: p, blur: 1.4, alpha: 0.3, mode: "screen" });
      g.stroke(g.path("M" + (50 - dir * 16) + ",52 C" + (x + dir * 8) + ",74 " +
        (x + dir * 2) + ",92 " + (x + dir * 3) + ",116"),
        shadowOf(hair[2], 0.4), 2, { clip: p, blur: 1.6, alpha: 0.22 });
      g.soft({ mode: "screen", clip: p, color: lightOf(hair[0], 0.9), alpha: 0.4,
               blur: 4,
               path: g.path("M" + (50 - dir * 16) + ",56 C" + (x + dir * 6) + ",70 " +
                 (x + dir * 2) + ",84 " + (x + dir * 4) + ",96 " +
                 "L" + (x - dir * 4) + ",94 C" + (x - dir * 6) + ",80 " +
                 (50 - dir * 26) + ",68 " + (50 - dir * 12) + ",58 Z") });
      g.ink(p, hairLine, 0.45);
    });
  }

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

    // Pull back: the reference leaves air around the figure, mine filled the
    // frame edge to edge.
    ctx.translate(50, 58); ctx.scale(0.8, 0.8); ctx.translate(-50, -58);
    // everything below is drawn tilted, like a portrait on a slight angle
    ctx.translate(50, 52); ctx.rotate(t.tilt * Math.PI / 180); ctx.translate(-50, -52);

    /* ---- head group: lifted so the torso has room in frame ---- */
    ctx.save();
    ctx.translate(0, -10);

    /* ---- back hair ---- */
    // Spread the mass sideways: hair that hugs the skull reads as a helmet.
    ctx.save();
    ctx.translate(50, 40); ctx.scale(1.12, 1.04); ctx.translate(-50, -40);
    var back = g.path(hairBackPath(t));
    var hairGrad = ctx.createLinearGradient(0, 4, 0, 110);
    hairGrad.addColorStop(0, lightOf(hair[0], 0.35));
    hairGrad.addColorStop(0.3, hair[1]);
    hairGrad.addColorStop(0.7, mix(hair[1], hair[2], 0.7));
    hairGrad.addColorStop(1, shadowOf(hair[2], 0.35));
    g.fill(back, hairGrad);
    // shade only where the hair turns away from the light, not a disc over
    // the whole mass — that had painted a dark column down the middle
    g.soft({ path: g.path("M50,4 C22,4 8,30 6,70 L2,70 L2,0 L98,0 L98,70 L94,70 " +
                          "C92,30 78,4 50,4 Z"),
             clip: back, color: shadowOf(hair[2], 0.5), alpha: 0.3, blur: 6 });
    hairStrands(g, back, hair, rng(t.strandSeed ^ 0x5bf03635));
    // the head occludes the hair behind it — an ambient shadow around the face
    g.soft({ path: g.path("M50,18 C30,18 22,40 24,64 C28,86 40,96 50,96 " +
                          "C60,96 72,86 76,64 C78,40 70,18 50,18 Z"),
             clip: back, color: shadowOf(hair[2], 0.6), alpha: 0.4, blur: 7 });
    // the fringe sits proud of the mass and shadows it
    g.soft({ path: g.path("M14,4 C14,40 30,52 50,52 C70,52 86,40 86,4 Z"),
             clip: back, color: shadowOf(hair[2], 0.55), alpha: 0.35, blur: 4,
             shift: [0, 4] });
    g.ink(back, hairLine, 0.62);
    ctx.restore();

    ctx.restore();  // end head lift — the torso is drawn in frame coordinates

    /* ---- torso ---- */
    torso(g, ctx, t, skin, cloth, skinLine);

    // Hair falling in front of the shoulders. Drawn entirely behind the body,
    // the figure looked like a head resting on a bare torso.
    frontShoulderHair(g, ctx, t, hair, hairLine, rng(t.strandSeed ^ 0x1d872b41));

    ctx.save();
    ctx.translate(0, -10);

    /* ---- head ---- */
    var head = g.path(HEAD);
    var faceGrad = ctx.createRadialGradient(50, 40, 4, 50, 46, 34);
    faceGrad.addColorStop(0, skin[0]);
    faceGrad.addColorStop(0.65, skin[1]);
    faceGrad.addColorStop(1, mix(skin[1], skin[2], 0.55));
    g.fill(head, faceGrad);

    // modelling: hair shadow across the forehead, temples, jaw, chin
    g.soft({ path: g.path("M24,0 C24,42 34,48 50,48 C66,48 76,42 76,0 Z"),
             clip: head, color: shadowOf(skin[2], 0.45), alpha: 0.72, blur: 3 });
    g.soft({ path: g.path("M30,40 C28,50 31,58 36,64 L27,66 L26,44 Z"),
             clip: head, color: shadowOf(skin[2], 0.3), alpha: 0.3, blur: 4 });
    g.soft({ path: g.path("M70,40 C72,50 69,58 64,64 L73,66 L74,44 Z"),
             clip: head, color: shadowOf(skin[2], 0.3), alpha: 0.3, blur: 4 });
    g.soft({ path: g.path("M41,63 C45,68 55,68 59,63 C57,70 43,70 41,63 Z"),
             clip: head, color: shadowOf(skin[2], 0.35), alpha: 0.35, blur: 3 });
    // cheekbone light and a soft shadow under it — structure, not a smooth egg
    g.soft({ mode: "screen", clip: g.path(HEAD), color: lightOf(skin[0], 0.9), alpha: 0.4,
             blur: 3.5, path: g.path("M37,57 m-5,0 a5,3.2 0 1,0 10,0 a5,3.2 0 1,0 -10,0") });
    g.soft({ mode: "screen", clip: g.path(HEAD), color: lightOf(skin[0], 0.9), alpha: 0.4,
             blur: 3.5, path: g.path("M63,57 m-5,0 a5,3.2 0 1,0 10,0 a5,3.2 0 1,0 -10,0") });
    g.soft({ clip: g.path(HEAD), color: shadowOf(skin[2], 0.3), alpha: 0.28, blur: 3,
             path: g.path("M30,58 C32,64 38,68 42,69 L29,69 Z") });
    g.soft({ clip: g.path(HEAD), color: shadowOf(skin[2], 0.3), alpha: 0.28, blur: 3,
             path: g.path("M70,58 C68,64 62,68 58,69 L71,69 Z") });
    // sockets around the eyes and a shadow beside the nose — without these the
    // face is a flat wash however soft the rest of the shading is
    g.soft({ clip: g.path(HEAD), color: shadowOf(skin[2], 0.35), alpha: 0.18, blur: 3,
             path: g.path("M" + (EYE.l - 8) + "," + (EYE.y - 5) +
                          " C" + (EYE.l - 4) + "," + (EYE.y - 9) + " " + (EYE.l + 5) + "," +
                          (EYE.y - 9) + " " + (EYE.l + 8) + "," + (EYE.y - 4) +
                          " C" + EYE.l + "," + (EYE.y - 6) + " " + (EYE.l - 5) + "," +
                          (EYE.y - 5) + " " + (EYE.l - 8) + "," + (EYE.y - 5) + " Z") });
    g.soft({ clip: g.path(HEAD), color: shadowOf(skin[2], 0.35), alpha: 0.18, blur: 3,
             path: g.path("M" + (EYE.r + 8) + "," + (EYE.y - 5) +
                          " C" + (EYE.r + 4) + "," + (EYE.y - 9) + " " + (EYE.r - 5) + "," +
                          (EYE.y - 9) + " " + (EYE.r - 8) + "," + (EYE.y - 4) +
                          " C" + EYE.r + "," + (EYE.y - 6) + " " + (EYE.r + 5) + "," +
                          (EYE.y - 5) + " " + (EYE.r + 8) + "," + (EYE.y - 5) + " Z") });
    g.soft({ clip: g.path(HEAD), color: shadowOf(skin[2], 0.4), alpha: 0.22, blur: 1.8,
             path: g.path("M52," + (NOSE_Y - 5) + " C54," + (NOSE_Y - 2) + " 54," +
                          NOSE_Y + " 52.4," + (NOSE_Y + 0.6) + " C51," + (NOSE_Y - 2) +
                          " 51," + (NOSE_Y - 4) + " 52," + (NOSE_Y - 5) + " Z") });
    g.soft({ clip: g.path(HEAD), color: shadowOf(skin[2], 0.35), alpha: 0.22, blur: 2,
             path: g.path("M46," + (MOUTH_Y + 3.4) + " C48," + (MOUTH_Y + 5) + " 52," +
                          (MOUTH_Y + 5) + " 54," + (MOUTH_Y + 3.4) + " C52," +
                          (MOUTH_Y + 6.4) + " 48," + (MOUTH_Y + 6.4) + " 46," +
                          (MOUTH_Y + 3.4) + " Z") });
    // light on the forehead, nose bridge and the tops of the cheeks
    g.soft({ mode: "screen", path: g.path("M50,50 m-8,0 a8,11 0 1,0 16,0 a8,11 0 1,0 -16,0"),
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

    ctx.restore();  // head lift
    ctx.restore();  // portrait transform
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
    var base = skin[0], shade = skin[1], deep = skin[2];
    var ink = mix(deep, "#8a5a63", 0.42);

    // neck
    var neck = g.path("M45,46 C45,60 44,66 42.5,72 L57.5,72 C56,66 55,60 55,46 Z");
    g.fill(neck, shade);
    g.soft({ path: g.path("M41,50 C45,60 55,60 59,50 C59,64 41,64 41,50 Z"),
             clip: neck, color: shadowOf(deep, 0.55), alpha: 0.7, blur: 2 });
    g.ink(neck, ink, 0.4);

    // shoulders and upper arms — bare, which is what the off-shoulder top is for
    var body = g.path("M50,68 C34,68 22,74 16,84 C10,94 7,106 6,118 L94,118 " +
                      "C93,106 90,94 84,84 C78,74 66,68 50,68 Z");
    var bodyGrad = ctx.createLinearGradient(0, 68, 0, 118);
    bodyGrad.addColorStop(0, mix(base, shade, 0.3));
    bodyGrad.addColorStop(1, shade);
    g.fill(body, bodyGrad);
    // the neck's shadow on the chest, and shading where the arms turn away
    g.soft({ path: g.path("M36,68 C43,76 57,76 64,68 C60,82 40,82 36,68 Z"),
             clip: body, color: shadowOf(deep, 0.4), alpha: 0.4, blur: 3.5 });
    g.soft({ path: g.path("M6,118 C7,104 12,92 20,84 L10,84 L2,118 Z"),
             clip: body, color: shadowOf(deep, 0.35), alpha: 0.35, blur: 3 });
    g.soft({ path: g.path("M94,118 C93,104 88,92 80,84 L90,84 L98,118 Z"),
             clip: body, color: shadowOf(deep, 0.35), alpha: 0.35, blur: 3 });
    // collarbones
    g.stroke(g.path("M40,78 C44,81.5 47,82.5 49,82"), shadowOf(deep, 0.35), 0.7,
             { clip: body, blur: 0.5, alpha: 0.45 });
    g.stroke(g.path("M60,78 C56,81.5 53,82.5 51,82"), shadowOf(deep, 0.35), 0.7,
             { clip: body, blur: 0.5, alpha: 0.45 });
    g.ink(body, ink, 0.4);

    // off-shoulder top: sleeves sit low on the arms, neckline scoops wide
    var top = g.path("M50,90 C40,90 32,87 26,83 C19,86 13,96 11,118 L89,118 " +
                     "C87,96 81,86 74,83 C68,87 60,90 50,90 Z");
    var cg = ctx.createLinearGradient(0, 82, 0, 118);
    cg.addColorStop(0, cloth[0]);
    cg.addColorStop(0.45, cloth[1]);
    cg.addColorStop(1, mix(cloth[1], cloth[2], 0.55));
    g.fill(top, cg);
    // folds
    g.stroke(g.path("M27,88 C25,98 25,108 26,118"), shadowOf(cloth[2], 0.4), 1.4,
             { clip: top, blur: 1.2, alpha: 0.3 });
    g.stroke(g.path("M73,88 C75,98 75,108 74,118"), shadowOf(cloth[2], 0.4), 1.4,
             { clip: top, blur: 1.2, alpha: 0.3 });
    g.soft({ path: g.path("M50,90 C40,90 32,87 26,83 L21,118 L79,118 L74,83 " +
                          "C68,87 60,90 50,90 Z"),
             clip: top, color: shadowOf(cloth[2], 0.35), alpha: 0.18, blur: 4 });
    g.ink(top, mix(cloth[2], "#7a5560", 0.35), 0.42);
    // the heart motif, tone on tone rather than a printed logo
    g.stroke(g.path("M50,104 C46,98 38,98 38,104 C38,110 45,113 50,115"),
             lightOf(cloth[0], 0.9), 2, { clip: top, alpha: 0.4, blur: 0.8 });
    g.stroke(g.path("M50,104 C54,98 62,98 62,104 C62,110 55,113 50,115"),
             lightOf(cloth[0], 0.9), 2, { clip: top, alpha: 0.4, blur: 0.8 });
    // the fabric follows a body underneath: light where it lifts, shadow
    // where it falls away at the sides and under the bust
    g.soft({ mode: "screen", clip: top, color: lightOf(cloth[0], 0.9), alpha: 0.3,
             blur: 5,
             path: g.path("M40,96 C34,102 33,112 35,118 L60,118 C62,112 61,102 55,96 Z") });
    g.soft({ clip: top, color: shadowOf(cloth[2], 0.45), alpha: 0.28, blur: 5,
             path: g.path("M11,118 C12,104 16,94 22,88 L30,92 C24,100 21,110 21,118 Z") });
    g.soft({ clip: top, color: shadowOf(cloth[2], 0.45), alpha: 0.28, blur: 5,
             path: g.path("M89,118 C88,104 84,94 78,88 L70,92 C76,100 79,110 79,118 Z") });
    g.soft({ clip: top, color: shadowOf(cloth[2], 0.4), alpha: 0.22, blur: 4,
             path: g.path("M36,112 C42,116 58,116 64,112 C58,120 42,120 36,112 Z") });

    // thin straps over the bare shoulders
    ["M36,89 C33,84 30,80 27,77", "M64,89 C67,84 70,80 73,77"].forEach(function (d) {
      g.stroke(g.path(d), "#fffaf2", 1.5, { alpha: 0.9 });
      g.stroke(g.path(d), mix(cloth[2], "#7a5560", 0.3), 1.9, { alpha: 0.25, blur: 0.6 });
    });

    choker(g, t);
  }

  function choker(g, t) {
    var band = g.path("M43,60 C46,62.6 54,62.6 57,60 L57,64.5 C54,67.2 46,67.2 43,64.5 Z");
    g.fill(band, "#f2607d");
    g.soft({ path: band, color: "#8c3550", alpha: 0.5, blur: 1.2, shift: [0, 1.2] });
    g.stroke(g.path("M43.6,61 C46.4,63.3 53.6,63.3 56.4,61"), "#ffb3c4", 0.6, { alpha: 0.8 });
    g.ink(band, "#a8425c", 0.4);
    // heart pendant
    var heart = g.path("M50,70 C48.6,67.4 45.4,67.6 45.4,70.4 C45.4,72.8 48,74.4 50,76.2 " +
                       "C52,74.4 54.6,72.8 54.6,70.4 C54.6,67.6 51.4,67.4 50,70 Z");
    g.fill(heart, "#f0c34a");
    g.soft({ mode: "screen", path: heart, color: "#fff3c4", alpha: 0.8, blur: 0.8,
             shift: [-0.5, -0.6] });
    g.ink(heart, "#a87c1e", 0.35);
  }

  function ears(g, ctx, t, hair, hairLine, skin) {
    var L, R, LI, RI;
    if (t.ears === "round") {
      L = "M33,31 C24,27 22,11 31,7 C40,5 45,15 44,26 Z";
      R = "M67,31 C76,27 78,11 69,7 C60,5 55,15 56,26 Z";
      LI = "M35,27 C28,24 27,13 33,11 C39,11 42,18 41,25 Z";
      RI = "M65,27 C72,24 73,13 67,11 C61,11 58,18 59,25 Z";
    } else if (t.ears === "folded") {
      L = "M33,31 C25,22 27,8 36,8 C44,10 47,18 46,26 C42,20 36,23 33,31 Z";
      R = "M67,31 C75,22 73,8 64,8 C56,10 53,18 54,26 C58,20 64,23 67,31 Z";
      LI = "M35,26 C29,19 31,12 37,12 C42,14 44,20 43,25 Z";
      RI = "M65,26 C71,19 69,12 63,12 C58,14 56,20 57,25 Z";
    } else {
      // Cat, not rabbit: a wide base and a shorter shell. Narrow and tall
      // read as lop ears however well they were shaded.
      L = "M30,34 C24,27 20,16 23,8 C33,13 42,22 45,31 Z";
      R = "M70,34 C76,27 80,16 77,8 C67,13 58,22 55,31 Z";
      LI = "M32,30 C27,24 25,17 27,12 C34,17 40,24 42,30 Z";
      RI = "M68,30 C73,24 75,17 73,12 C66,17 60,24 58,30 Z";
    }
    [[L, LI], [R, RI]].forEach(function (pair) {
      var outer = g.path(pair[0]), inner = g.path(pair[1]);
      var eg = ctx.createLinearGradient(0, 4, 0, 32);
      eg.addColorStop(0, hair[1]);
      eg.addColorStop(1, hair[0]);
      g.fill(outer, eg);
      // the fluff: white, tufted, sitting proud of the ear
      g.fill(inner, mix(skin[1], "#ffc9d2", 0.3));
      g.soft({ path: inner, color: "#fffdfa", alpha: 0.9, blur: 1.1 });
      g.soft({ mode: "screen", path: inner, color: "#ffffff", alpha: 0.8, blur: 2.2 });
      g.soft({ path: outer, color: shadowOf(hair[2], 0.4), alpha: 0.3, blur: 2.5,
               shift: [0, 3], clip: outer });
      g.ink(outer, hairLine, 0.55);
    });
  }

  function blush(g, head, skin) {
    [31.5, 68.5].forEach(function (x) {
      var p = g.path("M" + x + "," + BLUSH_Y + " m-7,0 a7,4 0 1,0 14,0 a7,4 0 1,0 -14,0");
      g.soft({ path: p, clip: head, color: "#f2758f", alpha: 0.34, blur: 3.4 });
    });
    // a hint of warmth across the nose, which ties the two cheeks together
    g.soft({ path: g.path("M50,58 m-7,0 a7,2.6 0 1,0 14,0 a7,2.6 0 1,0 -14,0"),
             clip: head, color: "#f2758f", alpha: 0.14, blur: 4 });
  }

  function freckles(g, head, skin, r) {
    var c = g.c;
    c.save(); c.clip(head);
    c.globalAlpha = 0.5;
    c.fillStyle = shadowOf(skin[2], 0.4);
    for (var i = 0; i < 14; i++) {
      var side = i % 2 ? 1 : -1;
      var x = 50 + side * (5 + r() * 8), y = 57 + r() * 4.5;
      c.beginPath(); c.arc(x, y, 0.3 + r() * 0.28, 0, 6.284); c.fill();
    }
    c.restore();
  }

  /* ---- eyes ----------------------------------------------------------- */

  function eyeOutline(cx, drop, shape) {
    var o = cx < 50 ? -1 : 1;
    var rx = EYE.rx, ry = EYE.ry * (shape === "sleepy" ? 0.82 : shape === "wide" ? 1.08 : 1);
    var y = EYE.y + drop;
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
    // The iris fills about 80% of the opening's height and 75% of its width,
    // which leaves white at the corners but not the fried-egg ring I had.
    var iv = ry * 1.02, ih = ry * 0.86, iy = y + ry * 0.08;

    g.fill(shell, "#fffaf4");
    c.save();
    c.clip(shell);

    // iris: dark at the top where the lid shades it, bright at the bottom
    var ig = ctx.createLinearGradient(0, iy - iv, 0, iy + iv);
    ig.addColorStop(0, col[2]);
    ig.addColorStop(0.45, col[1]);
    ig.addColorStop(1, col[0]);
    c.fillStyle = ig;
    c.beginPath(); c.ellipse(cx, iy, ih, iv, 0, 0, 6.284); c.fill();

    // spokes and a soft inner glow low in the iris
    c.save();
    c.globalAlpha = 0.3;
    c.strokeStyle = col[2];
    c.lineWidth = 0.32;
    for (var i = 0; i < 12; i++) {
      var a = (i / 12) * 6.284;
      c.beginPath();
      c.moveTo(cx + Math.cos(a) * ih * 0.34, iy + Math.sin(a) * iv * 0.36);
      c.lineTo(cx + Math.cos(a) * ih * 0.88, iy + Math.sin(a) * iv * 0.92);
      c.stroke();
    }
    c.restore();
    g.soft({ mode: "screen", color: col[0], alpha: 0.9, blur: 1.2,
             path: g.path("M" + cx + "," + (iy + iv * 0.5) + " m-" + (ih * 0.6) + ",0 a" +
               (ih * 0.6) + "," + (iv * 0.34) + " 0 1,0 " + (ih * 1.2) + ",0 a" +
               (ih * 0.6) + "," + (iv * 0.34) + " 0 1,0 -" + (ih * 1.2) + ",0") });

    c.save();
    c.globalAlpha = 0.7;
    c.strokeStyle = col[2];
    c.lineWidth = 0.85;
    c.beginPath(); c.ellipse(cx, iy, ih, iv, 0, 0, 6.284); c.stroke();
    c.restore();

    c.fillStyle = mix(col[2], "#241624", 0.7);
    c.beginPath(); c.ellipse(cx, iy + iv * 0.04, ih * 0.34, iv * 0.46, 0, 0, 6.284); c.fill();

    // shadow cast into the eye by the upper lid
    g.soft({ color: shadowOf(col[2], 0.65), alpha: 0.55, blur: 2, shift: [0, -2.2],
             path: shell });
    c.restore();

    // One light source: both catchlights sit upper-left, not mirrored inward.
    var h1 = g.path("M" + (cx - 2) + "," + (y - ry * 0.52) +
                    " m-2.1,0 a2.1,1.8 0 1,0 4.2,0 a2.1,1.8 0 1,0 -4.2,0");
    var h2 = g.path("M" + (cx + 2.3) + "," + (y + ry * 0.55) +
                    " m-1,0 a1,1 0 1,0 2,0 a1,1 0 1,0 -2,0");
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
      " L" + (cx + o * rx * 1.16) + "," + (y - ry * 1.1) +
      " C" + (cx + o * rx * 0.7) + "," + (y - ry * 1.62) +
      " " + (cx - o * rx * 0.35) + "," + (y - ry * 1.56) +
      " " + (cx - o * rx * 1.06) + "," + (y + ry * 0.08) + " Z");
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
    // reddish liner where the lash sweeps out, which the reference has under
    // the black and is most of what makes the outer corner feel drawn
    g.stroke(g.path("M" + (cx + o * rx * 0.5) + "," + (y - ry * 1.2) +
      " C" + (cx + o * rx * 0.95) + "," + (y - ry * 1.15) +
      " " + (cx + o * rx * 1.15) + "," + (y - ry * 0.95) +
      " " + (cx + o * rx * 1.3) + "," + (y - ry * 1.25)),
      "#c4586a", 1.1, { alpha: 0.55, blur: 0.5 });
  }

  function brows(g, t, skin) {
    var col = mix(t.hairColor[2], "#7a5560", 0.35);
    [[EYE.l, -1], [EYE.r, 1]].forEach(function (e) {
      var cx = e[0], o = e[1];
      var d = "M" + (cx - o * 5.4) + "," + (BROW_Y + 1) +
              " C" + (cx - o * 2.6) + "," + (BROW_Y - 1.2) +
              " " + (cx + o * 2.8) + "," + (BROW_Y - 0.9) +
              " " + (cx + o * 5.2) + "," + (BROW_Y + 0.7);
      g.stroke(g.path(d), col, 1.2, { alpha: 0.4, blur: 0.8 });
      g.stroke(g.path(d), col, 0.7, { alpha: 0.9 });
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
      var m = g.path("M46.9," + my + " C48.1," + (my + 4) + " 51.9," + (my + 4) +
                     " 53.1," + my + " C51.2," + (my + 1.1) + " 48.8," + (my + 1.1) +
                     " 46.9," + my + " Z");
      g.fill(m, "#a03c58");
      g.soft({ path: m, color: "#5e2036", alpha: 0.6, blur: 0.8, shift: [0, -0.6] });
      // upper teeth: a thin bright edge just inside the top lip
      g.c.save();
      g.c.clip(m);
      g.stroke(g.path("M47.2," + (my + 0.5) + " C48.6," + (my + 1.5) + " 51.4," +
               (my + 1.5) + " 52.8," + (my + 0.5)), "#fffaf6", 1.5, { alpha: 0.95 });
      g.c.restore();
      var tongue = g.path("M48.5," + (my + 2.4) + " C49.1," + (my + 4) + " 50.9," + (my + 4) +
                          " 51.5," + (my + 2.4) + " C50.5," + (my + 2) + " 49.5," + (my + 2) +
                          " 48.5," + (my + 2.4) + " Z");
      g.fill(tongue, "#f2839f");
      g.ink(m, lip, 0.35);
      g.soft({ path: g.path("M46," + (my - 1.2) + " C48," + (my + 0.4) + " 52," +
               (my + 0.4) + " 54," + (my - 1.2) + " C52," + (my + 1) + " 48," +
               (my + 1) + " 46," + (my - 1.2) + " Z"),
               color: "#e08498", alpha: 0.35, blur: 1 });
      // a bright edge on the lower lip
      g.stroke(g.path("M48.2," + (my + 2.9) + " C49.2," + (my + 3.9) + " 50.8," + (my + 3.9) +
               " 51.8," + (my + 2.9)), "#ffd9dd", 0.45, { alpha: 0.55, blur: 0.4, mode: "screen" });
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
    // The hem dips back up between tips, so the fringe reads as separate
    // locks with forehead showing between them rather than one smooth arc.
    var cap = "M14,52 C14,14 32,2 50,2 C68,2 86,14 86,52";
    tips.forEach(function (p, i) {
      cap += " C" + (p[0] + 5) + "," + (p[1] - 7) +
             " " + (p[0] + 2.5) + "," + (p[1] - 1) + " " + p[0] + "," + p[1];
      if (i < tips.length - 1) {
        var nx = (p[0] + tips[i + 1][0]) / 2;
        cap += " C" + (p[0] - 2) + "," + (p[1] - 4) +
               " " + (nx + 1) + "," + (p[1] - 8) + " " + nx + "," + (p[1] - 7);
      }
    });
    cap += " L14,52 Z";
    var capPath = g.path(cap);
    var capGrad = ctx.createLinearGradient(0, 2, 0, 54);
    capGrad.addColorStop(0, hair[0]);
    capGrad.addColorStop(0.5, hair[1]);
    capGrad.addColorStop(1, mix(hair[1], hair[2], 0.5));
    g.fill(capPath, capGrad);

    // face-framing locks
    ["M30,12 C18,30 13,58 15,96 C19,78 23,62 32,52 C28,40 27,24 34,13 Z",
     "M70,12 C82,30 87,58 85,96 C81,78 77,62 68,52 C72,40 73,24 66,13 Z"].forEach(function (d) {
      var p = g.path(d);
      var lg = ctx.createLinearGradient(0, 14, 0, 88);
      lg.addColorStop(0, hair[0]);
      lg.addColorStop(1, hair[2]);
      g.fill(p, lg);
      g.ink(p, hairLine, 0.5);
    });

    // Clip the strands to the fringe outline, so no strand's straight top edge
    // can show as a rectangle at the temples.
    g.c.save();
    g.c.clip(capPath);
    fringeStrands(g, capPath, hair, r);
    tips.forEach(function (p, i) {
      var w = 6.5 + (i % 3) * 1.8 + r() * 1.4;
      var cx = 50 + (p[0] - 50) * 0.75;
      var d = "M" + (cx - w) + ",24" +
        " C" + (cx - w) + "," + (24 + p[1] * 0.35) +
        " " + (p[0] - w * 0.72) + "," + (p[1] - 11) + " " + p[0] + "," + p[1] +
        " C" + (p[0] + w * 0.72) + "," + (p[1] - 11) +
        " " + (cx + w) + "," + (24 + p[1] * 0.35) + " " + (cx + w) + ",24 Z";
      var path = g.path(d);
      // each strand drops a soft shadow on the one behind it
      g.soft({ path: path, color: shadowOf(hair[2], 0.45), alpha: 0.4, blur: 1.8,
               shift: [1.8, 1.6] });
      var sg = ctx.createLinearGradient(0, 22, 0, p[1] + 4);
      sg.addColorStop(0, lightOf(hair[0], i % 2 ? 0.25 : 0));
      sg.addColorStop(0.55, hair[1]);
      sg.addColorStop(1, mix(hair[1], hair[2], 0.75));
      g.fill(path, sg);
      g.stroke(path, hairLine, 0.3, { alpha: 0.28 });
    });
    g.c.restore();

    // the sheen band: blurred, screened, with a broken lower edge
    var sheen = g.path("M28,26 C36,16 64,16 72,26 C70,32 66,28 62,31 " +
                       "C58,34 54,29 50,31 C46,34 42,29 38,31 C34,34 30,31 28,26 Z");
    g.soft({ mode: "screen", path: sheen, color: lightOf(hair[0], 0.9), alpha: 0.42, blur: 3.4 });

    // rim light along the top of the silhouette
    g.stroke(g.path("M20,40 C20,12 34,2 50,2 C66,2 80,12 80,40"),
             lightOf(hair[0], 0.9), 1.4, { mode: "screen", alpha: 0.5, blur: 1.4 });

    // wispy tips hanging past the fringe, and a couple of flyaways
    tips.forEach(function (p, i) {
      if (i % 2) return;
      g.stroke(g.path("M" + (p[0] - 1) + "," + (p[1] - 8) +
        " C" + (p[0] - 1.5) + "," + (p[1] - 2) + " " + (p[0] - 1) + "," + (p[1] + 1) +
        " " + (p[0] - 2.5) + "," + (p[1] + 4.5)), hairLine, 0.5,
        { alpha: 0.45, blur: 0.2 });
    });
    [["M38,20 C35,32 34,42 35,52 C37,42 39,32 41,22 Z", 1],
     ["M62,20 C65,32 66,42 65,52 C63,42 61,32 59,22 Z", -1]].forEach(function (e) {
      var p = g.path(e[0]);
      g.soft({ path: p, color: shadowOf(hair[2], 0.4), alpha: 0.22, blur: 1.8,
               shift: [e[1] * 1.2, 1.2] });
      // hair[0] is the highlight tone — filling a whole strand with it drew a
      // white bar down the face on light hair
      g.fill(p, hair[1]);
      g.stroke(p, hairLine, 0.28, { alpha: 0.2 });
    });
    g.stroke(g.path("M30,12 C24,19 22,27 22,34"), hairLine, 0.4, { alpha: 0.4 });
    g.stroke(g.path("M70,12 C76,19 78,27 78,34"), hairLine, 0.4, { alpha: 0.4 });
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
    ctx.globalAlpha = 0.08;
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
    // The painting passes are all low-contrast by nature; put some back.
    o.filter = "contrast(1.1) saturate(1.14)";
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
