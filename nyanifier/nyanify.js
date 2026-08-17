/*!
 * nyanify — turn text into cat nonsense, in four escalating levels.
 * catgirls.zone/nyanifier · public domain (CC0)
 *
 * Deterministic: the same text at the same level always produces the same
 * output, because the randomness is seeded from the text itself. That makes it
 * testable, cacheable, and safe to run twice.
 *
 *   nyanify("hello there")            // level 2 by default
 *   nyanify("hello there", 4)
 *   nyanify("hello there", { level: 3, keep: [/:\w+:/g] })
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.nyanify = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /* ---------- deterministic randomness ---------- */

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

  /* ---------- pieces ---------- */

  var TAILS = ["nya~", "nyaa", "uwu", "owo", ">w<", "~nya", "mrrp", "purr"];
  var FACES = ["(=^･ω･^=)", "(=^‥^=)", "ฅ(^･ω･^ฅ)", "(・ω<)", "(=｀ω´=)", "♡", "✧"];

  // Left alone by every level: links, emails, handles, hashtags, anything in
  // backticks, and bare words that look like code (dots or slashes inside).
  var PROTECT = [
    /`[^`]*`/g,
    /\bhttps?:\/\/\S+/gi,
    /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g,
    /(^|\s)[@#][\w-]+/g,
    /\b[\w-]+[./][\w./-]+\b/g
  ];

  function preserveCase(src, out) {
    if (src === src.toUpperCase() && src !== src.toLowerCase()) return out.toUpperCase();
    if (src[0] === src[0].toUpperCase()) return out[0].toUpperCase() + out.slice(1);
    return out;
  }

  /* ---------- the transformations ---------- */

  // 1: n before a vowel becomes ny.
  function nyaify(s) {
    return s.replace(/n([aeiou])/g, "ny$1").replace(/N([aeiou])/g, "Ny$1")
            .replace(/N([AEIOU])/g, "NY$1");
  }

  // 2: the classic l/r to w swap.
  function wwwify(s) {
    return s.replace(/[lr]/g, "w").replace(/[LR]/g, "W");
  }

  // 3: stutter the occasional word, and stretch some vowel endings.
  function stutter(s, rand) {
    return s.replace(/\b([a-zA-Z])(\w{2,})\b/g, function (m, first, rest) {
      if (rand() < 0.14) return first + "-" + first + rest;
      if (rand() < 0.08) return first + rest + "~";
      return m;
    });
  }

  // 4: interjections between sentences and a face at the end.
  function decorate(s, rand) {
    var out = s.replace(/([.!?])(\s+|$)/g, function (m, punct, space) {
      if (rand() < 0.55) {
        return punct + " " + TAILS[Math.floor(rand() * TAILS.length)] + (space || " ");
      }
      return m;
    });
    if (out.trim() && rand() < 0.8) {
      out = out.replace(/\s*$/, " " + FACES[Math.floor(rand() * FACES.length)]);
    }
    return out;
  }

  /* ---------- entry point ---------- */

  function nyanify(text, opts) {
    text = text == null ? "" : String(text);
    if (typeof opts === "number") opts = { level: opts };
    opts = opts || {};

    var level = opts.level == null ? 2 : Math.max(0, Math.min(4, opts.level | 0));
    if (level === 0 || !text) return text;

    var rand = rng(hash(text + "|" + level + "|" + (opts.seed || "")));

    // Pull protected spans out, transform what is left, put them back. The
    // placeholder is wrapped in NUL, which nobody types and which none of the
    // transformations match — a plain " 3 " would have collided with any
    // number the user actually wrote.
    var vault = [];
    var patterns = PROTECT.concat(opts.keep || []);
    var work = text;
    patterns.forEach(function (re) {
      work = work.replace(re, function (m) {
        // keep any leading whitespace the pattern captured
        var lead = /^\s/.test(m) ? m[0] : "";
        var body = lead ? m.slice(1) : m;
        vault.push(body);
        return lead + "\u0000" + (vault.length - 1) + "\u0000";
      });
    });

    if (level >= 1) work = nyaify(work);
    if (level >= 2) work = wwwify(work);
    if (level >= 3) work = stutter(work, rand);
    if (level >= 4) work = decorate(work, rand);

    return work.replace(/\u0000(\d+)\u0000/g, function (m, i) { return vault[+i]; });
  }

  nyanify.levels = [
    { level: 1, name: "mild", note: "n before a vowel becomes ny" },
    { level: 2, name: "uwu", note: "…and l and r become w" },
    { level: 3, name: "stuttery", note: "…and words stutter or trail off" },
    { level: 4, name: "unhinged", note: "…and sentences pick up interjections" }
  ];
  nyanify.hash = hash;
  return nyanify;
});
