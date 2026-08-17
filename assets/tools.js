/* catgirls.zone/tools — every conversion runs locally. */
(function () {
  "use strict";

  var $ = UI.$, $$ = UI.$$, el = UI.el;
  UI.boot("tools");

  var TOOLS = [
    ["base64", "Base64", "b64"],
    ["jwt", "JWT decoder", "jwt"],
    ["uuid", "UUID", "id"],
    ["hash", "Hashes", "sha"],
    ["regex", "Regex tester", "re"],
    ["cron", "Cron parser", "cron"],
    ["time", "Timestamps", "ts"],
    ["json", "JSON", "json"],
    ["diff", "Text diff", "diff"]
  ];

  /* ---------- tool switching ---------- */

  var list = $("#picker-list");
  var buttons = {};

  TOOLS.forEach(function (t) {
    var b = el("button", {
      role: "tab", "aria-selected": "false", "data-id": t[0],
      onclick: function () { select(t[0]); }
    }, [t[1], el("span", { class: "hint", text: t[2] })]);
    buttons[t[0]] = b;
    list.appendChild(el("li", null, [b]));
  });

  function select(id, skipHash) {
    TOOLS.forEach(function (t) {
      var on = t[0] === id;
      buttons[t[0]].setAttribute("aria-selected", String(on));
      $("#t-" + t[0]).classList.toggle("active", on);
    });
    if (!skipHash) history.replaceState(null, "", "#" + id);
    document.title = (TOOLS.filter(function (t) { return t[0] === id; })[0] || [])[1] +
      " — catgirls.zone/tools";
  }

  $("#filter").addEventListener("input", function () {
    var q = this.value.trim().toLowerCase();
    var first = null;
    TOOLS.forEach(function (t) {
      var hit = !q || (t[1] + " " + t[2] + " " + t[0]).toLowerCase().indexOf(q) >= 0;
      buttons[t[0]].parentNode.style.display = hit ? "" : "none";
      if (hit && !first) first = t[0];
    });
    if (first) select(first);
  });

  $("#filter").addEventListener("keydown", function (e) {
    if (e.key === "Escape") { this.value = ""; this.dispatchEvent(new Event("input")); }
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "/" && !/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) {
      e.preventDefault();
      $("#filter").focus();
      $("#filter").select();
    }
  });

  /* ---------- base64 ---------- */

  var b64Plain = $("#b64-plain"), b64Enc = $("#b64-enc"), b64Url = $("#b64-url");

  function toB64(str, urlSafe) {
    var bytes = new TextEncoder().encode(str), bin = "";
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    var out = btoa(bin);
    return urlSafe ? out.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "") : out;
  }

  function fromB64(str) {
    var s = str.trim().replace(/-/g, "+").replace(/_/g, "/").replace(/\s+/g, "");
    while (s.length % 4) s += "=";
    var bin = atob(s), bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  var b64Guard = false;
  function b64Sync(from) {
    if (b64Guard) return;
    b64Guard = true;
    try {
      if (from === "plain") {
        b64Enc.value = b64Plain.value ? toB64(b64Plain.value, b64Url.checked) : "";
      } else {
        b64Plain.value = b64Enc.value ? fromB64(b64Enc.value) : "";
      }
      (from === "plain" ? b64Enc : b64Plain).classList.remove("err");
    } catch (e) {
      b64Plain.value = "";
      b64Enc.classList.add("err");
    }
    b64Guard = false;
  }

  b64Plain.addEventListener("input", function () { b64Sync("plain"); });
  b64Enc.addEventListener("input", function () { b64Sync("enc"); });
  b64Url.addEventListener("change", function () { b64Sync("plain"); });
  $("#b64-copy").addEventListener("click", function () { UI.copy(b64Enc.value, "Base64"); });

  /* ---------- jwt ---------- */

  function jwtPart(seg) {
    return JSON.parse(fromB64(seg));
  }

  function stamp(v) {
    if (typeof v !== "number") return null;
    var d = new Date(v * 1000);
    if (isNaN(d)) return null;
    return d.toISOString().replace("T", " ").replace(".000Z", "Z");
  }

  $("#jwt-in").addEventListener("input", function () {
    var out = $("#jwt-out");
    out.textContent = "";
    var raw = this.value.trim();
    if (!raw) return;

    var parts = raw.split(".");
    if (parts.length < 2) {
      out.appendChild(el("div", { class: "out err", text: "Not a JWT: expected at least two dot-separated segments." }));
      return;
    }

    var head, body;
    try { head = jwtPart(parts[0]); } catch (e) {
      out.appendChild(el("div", { class: "out err", text: "Header is not valid base64url JSON." }));
      return;
    }
    try { body = jwtPart(parts[1]); } catch (e) {
      out.appendChild(el("div", { class: "out err", text: "Payload is not valid base64url JSON." }));
      return;
    }

    out.appendChild(el("h2", { text: "Header" }));
    out.appendChild(el("pre", { text: JSON.stringify(head, null, 2) }));
    out.appendChild(el("h2", { text: "Payload" }));
    out.appendChild(el("pre", { text: JSON.stringify(body, null, 2) }));

    var rows = [];
    var now = Math.floor(Date.now() / 1000);
    ["iat", "nbf", "exp"].forEach(function (k) {
      var s = stamp(body[k]);
      if (s) rows.push([k, s]);
    });
    if (typeof body.exp === "number") {
      var left = body.exp - now;
      rows.push(["status", left > 0
        ? "valid for another " + humanSpan(left)
        : "EXPIRED " + humanSpan(-left) + " ago"]);
    }
    if (parts[2]) rows.push(["signature", parts[2].slice(0, 24) + (parts[2].length > 24 ? "…" : "")]);

    if (rows.length) {
      var tb = el("tbody");
      rows.forEach(function (r) {
        var td = el("td", { text: r[1] });
        if (r[0] === "status") td.className = /EXPIRED/.test(r[1]) ? "err" : "ok";
        tb.appendChild(el("tr", null, [el("td", { text: r[0] }), td]));
      });
      out.appendChild(el("h2", { text: "Claims" }));
      out.appendChild(el("table", { class: "kv" }, [tb]));
    }
  });

  function humanSpan(sec) {
    sec = Math.abs(Math.round(sec));
    var u = [["d", 86400], ["h", 3600], ["m", 60], ["s", 1]], out = [];
    u.forEach(function (p) {
      if (sec >= p[1] && out.length < 2) { out.push(Math.floor(sec / p[1]) + p[0]); sec %= p[1]; }
    });
    return out.join(" ") || "0s";
  }

  /* ---------- uuid ---------- */

  function uuid4() {
    var b = crypto.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 0x0f) | 0x40;          // version 4
    b[8] = (b[8] & 0x3f) | 0x80;          // variant 10xx
    var h = [].map.call(b, function (x) { return x.toString(16).padStart(2, "0"); }).join("");
    return h.slice(0, 8) + "-" + h.slice(8, 12) + "-" + h.slice(12, 16) + "-" +
           h.slice(16, 20) + "-" + h.slice(20);
  }

  function genUuids() {
    var n = Math.min(500, Math.max(1, parseInt($("#uuid-n").value, 10) || 1));
    var fmt = $("#uuid-fmt").value, up = $("#uuid-case").value === "upper";
    var out = [];
    for (var i = 0; i < n; i++) {
      var u = uuid4();
      if (fmt === "nodash") u = u.replace(/-/g, "");
      if (fmt === "braced") u = "{" + u + "}";
      out.push(up ? u.toUpperCase() : u);
    }
    $("#uuid-out").textContent = out.join("\n");
  }

  $("#uuid-go").addEventListener("click", genUuids);
  $("#uuid-copy").addEventListener("click", function () {
    UI.copy($("#uuid-out").textContent, "UUIDs");
  });
  ["#uuid-n", "#uuid-case", "#uuid-fmt"].forEach(function (s) {
    $(s).addEventListener("change", genUuids);
  });
  genUuids();

  /* ---------- hashes ---------- */

  var hashTimer;
  $("#hash-in").addEventListener("input", function () {
    clearTimeout(hashTimer);
    var val = this.value;
    hashTimer = setTimeout(function () { runHashes(val); }, 120);
  });

  function runHashes(text) {
    var out = $("#hash-out");
    out.textContent = "";
    if (!text) return;
    var data = new TextEncoder().encode(text);
    var tb = el("tbody");
    out.appendChild(el("table", { class: "kv" }, [tb]));
    ["SHA-1", "SHA-256", "SHA-384", "SHA-512"].forEach(function (algo) {
      var cell = el("td", { text: "…" });
      var row = el("tr", null, [el("td", { text: algo }), cell]);
      tb.appendChild(row);
      crypto.subtle.digest(algo, data).then(function (buf) {
        var hex = [].map.call(new Uint8Array(buf), function (b) {
          return b.toString(16).padStart(2, "0");
        }).join("");
        cell.textContent = hex;
        cell.style.cursor = "pointer";
        cell.title = "Click to copy";
        cell.addEventListener("click", function () { UI.copy(hex, algo); });
      });
    });
  }

  /* ---------- regex ---------- */

  function escHtml(s) {
    return s.replace(/[&<>]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c];
    });
  }

  function runRegex() {
    var pat = $("#re-pat").value, flags = $("#re-flags").value, sub = $("#re-sub").value;
    var status = $("#re-status"), hl = $("#re-hl"), groups = $("#re-groups");
    status.textContent = ""; status.className = "small";
    groups.textContent = "";
    hl.textContent = sub;
    if (!pat) return;

    var re;
    try {
      re = new RegExp(pat, flags);
    } catch (e) {
      status.textContent = e.message;
      status.className = "small err";
      return;
    }

    var matches = [], m, guard = 0;
    if (re.global) {
      re.lastIndex = 0;
      while ((m = re.exec(sub)) !== null && guard++ < 10000) {
        matches.push(m);
        if (m[0] === "") re.lastIndex++;      // zero-length match would spin forever
      }
    } else {
      m = re.exec(sub);
      if (m) matches.push(m);
    }

    status.textContent = matches.length + (matches.length === 1 ? " match" : " matches");
    status.className = "small " + (matches.length ? "ok" : "muted");

    // rebuild the subject with <mark> around each match
    var html = "", at = 0;
    matches.forEach(function (mm) {
      html += escHtml(sub.slice(at, mm.index));
      html += "<mark>" + escHtml(mm[0]) + "</mark>";
      at = mm.index + mm[0].length;
    });
    html += escHtml(sub.slice(at));
    hl.innerHTML = html || "&nbsp;";

    matches.slice(0, 20).forEach(function (mm, i) {
      var parts = [el("span", { class: "chip", text: "#" + (i + 1) + " @" + mm.index })];
      for (var g = 1; g < mm.length; g++) {
        parts.push(el("span", { class: "chip", text: "$" + g + " = " + JSON.stringify(mm[g]) }));
      }
      if (mm.groups) {
        Object.keys(mm.groups).forEach(function (k) {
          parts.push(el("span", { class: "chip", text: k + " = " + JSON.stringify(mm.groups[k]) }));
        });
      }
      groups.appendChild(el("div", null, parts));
    });
    if (matches.length > 20) {
      groups.appendChild(el("p", { class: "small muted", text: "…and " + (matches.length - 20) + " more" }));
    }
  }

  ["#re-pat", "#re-flags", "#re-sub"].forEach(function (s) {
    $(s).addEventListener("input", runRegex);
  });

  /* ---------- cron ---------- */

  var MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  var DAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

  // Expand one cron field into the set of values it matches.
  function cronField(spec, min, max, names) {
    var out = {};
    spec.split(",").forEach(function (part) {
      var step = 1, range = part;
      var slash = part.indexOf("/");
      if (slash >= 0) {
        step = parseInt(part.slice(slash + 1), 10);
        range = part.slice(0, slash);
        if (!(step > 0)) throw new Error("Step must be a positive number in \"" + part + "\"");
      }
      var lo, hi;
      if (range === "*") {
        lo = min; hi = max;
      } else if (range.indexOf("-") > 0) {
        var ab = range.split("-");
        lo = cronNum(ab[0], names); hi = cronNum(ab[1], names);
      } else {
        lo = hi = cronNum(range, names);
        if (slash >= 0) hi = max;              // "5/10" means "from 5, every 10"
      }
      if (isNaN(lo) || isNaN(hi)) throw new Error("Cannot read \"" + part + "\"");
      if (lo < min || hi > max) throw new Error("\"" + part + "\" is outside " + min + "-" + max);
      if (lo > hi) throw new Error("Range runs backwards in \"" + part + "\"");
      for (var v = lo; v <= hi; v += step) out[v] = true;
    });
    return Object.keys(out).map(Number).sort(function (a, b) { return a - b; });
  }

  function cronNum(tok, names) {
    tok = tok.trim().toUpperCase();
    if (names) {
      var i = names.indexOf(tok);
      if (i >= 0) return i + (names === MONTHS ? 1 : 0);
    }
    return parseInt(tok, 10);
  }

  function parseCron(expr) {
    var f = expr.trim().split(/\s+/);
    if (f.length !== 5) throw new Error("Expected 5 fields, got " + f.length + ".");
    var dowRaw = f[4].replace(/\b7\b/g, "0");
    return {
      minute: cronField(f[0], 0, 59),
      hour: cronField(f[1], 0, 23),
      dom: cronField(f[2], 1, 31),
      month: cronField(f[3], 1, 12, MONTHS),
      dow: cronField(dowRaw, 0, 6, DAYS),
      domRestricted: f[2] !== "*",
      dowRestricted: f[4] !== "*"
    };
  }

  function cronDescribe(c) {
    function every(arr, total, label) {
      if (arr.length === total) return "every " + label;
      if (arr.length === 1) return label + " " + arr[0];
      return label + " " + arr.join(", ");
    }
    var bits = [
      every(c.minute, 60, "minute"),
      every(c.hour, 24, "hour"),
      c.domRestricted ? "day-of-month " + c.dom.join(", ") : "every day-of-month",
      c.month.length === 12 ? "every month" : "month " + c.month.map(function (m) { return MONTHS[m - 1]; }).join(", "),
      c.dowRestricted ? "on " + c.dow.map(function (d) { return DAYS[d]; }).join(", ") : "any weekday"
    ];
    return bits.join(" · ");
  }

  function cronNext(c, count) {
    var out = [];
    var d = new Date();
    d.setSeconds(0, 0);
    d.setMinutes(d.getMinutes() + 1);
    // A minute-by-minute walk, capped at roughly four years, which is enough
    // for anything that ever fires and terminates for anything that does not.
    for (var i = 0; i < 4 * 366 * 24 * 60 && out.length < count; i++) {
      if (c.month.indexOf(d.getMonth() + 1) >= 0 &&
          c.hour.indexOf(d.getHours()) >= 0 &&
          c.minute.indexOf(d.getMinutes()) >= 0) {
        var domOk = c.dom.indexOf(d.getDate()) >= 0;
        var dowOk = c.dow.indexOf(d.getDay()) >= 0;
        // Standard cron: if both day fields are restricted they are OR-ed.
        var dayOk = (c.domRestricted && c.dowRestricted) ? (domOk || dowOk) : (domOk && dowOk);
        if (dayOk) out.push(new Date(d));
      }
      d.setMinutes(d.getMinutes() + 1);
    }
    return out;
  }

  function runCron() {
    var out = $("#cron-out");
    out.textContent = "";
    var expr = $("#cron-in").value.trim();
    if (!expr) return;
    var c;
    try {
      c = parseCron(expr);
    } catch (e) {
      out.appendChild(el("div", { class: "out err", text: e.message }));
      return;
    }
    out.appendChild(el("div", { class: "out", text: cronDescribe(c) }));
    var next = cronNext(c, 6);
    out.appendChild(el("h2", { text: "Next runs" }));
    if (!next.length) {
      out.appendChild(el("div", { class: "out err", text: "This expression never fires — check the day and month fields." }));
      return;
    }
    var tb = el("tbody");
    next.forEach(function (d) {
      tb.appendChild(el("tr", null, [
        el("td", { text: d.toLocaleString() }),
        el("td", { class: "muted", text: "in " + humanSpan((d - Date.now()) / 1000) })
      ]));
    });
    out.appendChild(el("table", { class: "kv" }, [tb]));
  }

  $("#cron-in").addEventListener("input", runCron);

  /* ---------- timestamps ---------- */

  function runTime() {
    var raw = $("#ts-in").value.trim(), out = $("#ts-out");
    out.textContent = "";
    if (!raw) return;

    var d;
    if (/^-?\d{1,}$/.test(raw)) {
      var num = parseInt(raw, 10);
      // Ten digits is seconds, thirteen is milliseconds; anything in between is
      // ambiguous, so bias to whichever lands in a plausible year.
      d = new Date(raw.length > 11 ? num : num * 1000);
    } else {
      d = new Date(raw);
    }

    if (isNaN(d.getTime())) {
      out.appendChild(el("div", { class: "out err", text: "Cannot read that as a time." }));
      return;
    }

    var rows = [
      ["unix (s)", String(Math.floor(d.getTime() / 1000))],
      ["unix (ms)", String(d.getTime())],
      ["ISO 8601 UTC", d.toISOString()],
      ["local", d.toLocaleString()],
      ["your zone", Intl.DateTimeFormat().resolvedOptions().timeZone || "unknown"],
      ["relative", (d > Date.now() ? "in " : "") + humanSpan((d - Date.now()) / 1000) +
                   (d > Date.now() ? "" : " ago")]
    ];
    var tb = el("tbody");
    rows.forEach(function (r) {
      var val = el("td", { text: r[1], style: "cursor:pointer" });
      val.addEventListener("click", function () { UI.copy(r[1], r[0]); });
      tb.appendChild(el("tr", null, [el("td", { text: r[0] }), val]));
    });
    out.appendChild(el("table", { class: "kv" }, [tb]));
  }

  $("#ts-in").addEventListener("input", runTime);
  $("#ts-now").addEventListener("click", function () {
    $("#ts-in").value = String(Math.floor(Date.now() / 1000));
    runTime();
  });

  /* ---------- json ---------- */

  function sortDeep(v) {
    if (Array.isArray(v)) return v.map(sortDeep);
    if (v && typeof v === "object") {
      var o = {};
      Object.keys(v).sort().forEach(function (k) { o[k] = sortDeep(v[k]); });
      return o;
    }
    return v;
  }

  function jsonRun(pretty) {
    var raw = $("#js-in").value, status = $("#js-status"), out = $("#js-out");
    status.textContent = ""; status.className = "small";
    if (!raw.trim()) { out.textContent = ""; return; }
    var val;
    try {
      val = JSON.parse(raw);
    } catch (e) {
      status.className = "small err";
      // V8 reports "at position N"; turn that into a line and column.
      var m = /position (\d+)/.exec(e.message);
      if (m) {
        var upto = raw.slice(0, +m[1]);
        var line = upto.split("\n").length;
        var col = +m[1] - upto.lastIndexOf("\n");
        status.textContent = e.message + "  (line " + line + ", column " + col + ")";
      } else {
        status.textContent = e.message;
      }
      out.textContent = "";
      return;
    }
    if ($("#js-sort").checked) val = sortDeep(val);
    out.textContent = pretty ? JSON.stringify(val, null, 2) : JSON.stringify(val);
    status.className = "small ok";
    status.textContent = "Valid JSON · " + out.textContent.length + " characters";
  }

  $("#js-pretty").addEventListener("click", function () { jsonRun(true); });
  $("#js-min").addEventListener("click", function () { jsonRun(false); });
  $("#js-in").addEventListener("input", function () { jsonRun(true); });
  $("#js-sort").addEventListener("change", function () { jsonRun(true); });
  $("#js-copy").addEventListener("click", function () { UI.copy($("#js-out").textContent, "JSON"); });

  /* ---------- diff ---------- */

  // Longest common subsequence over lines, walked back into a line script.
  function diffLines(a, b) {
    var n = a.length, m = b.length;
    var dp = [];
    for (var i = 0; i <= n; i++) dp.push(new Uint32Array(m + 1));
    for (i = n - 1; i >= 0; i--) {
      for (var j = m - 1; j >= 0; j--) {
        dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
    var out = [];
    i = 0; j = 0;
    while (i < n && j < m) {
      if (a[i] === b[j]) { out.push(["same", a[i]]); i++; j++; }
      else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push(["del", a[i]]); i++; }
      else { out.push(["add", b[j]]); j++; }
    }
    while (i < n) out.push(["del", a[i++]]);
    while (j < m) out.push(["add", b[j++]]);
    return out;
  }

  function runDiff() {
    var trim = $("#d-ws").checked;
    var norm = function (s) { return trim ? s.trim() : s; };
    var a = $("#d-a").value.split("\n").map(norm);
    var b = $("#d-b").value.split("\n").map(norm);
    var out = $("#d-out");
    out.textContent = "";

    if (a.length * b.length > 4000000) {
      out.appendChild(el("div", { class: "err", text: "Too much text to diff comfortably — try smaller chunks." }));
      return;
    }

    var script = diffLines(a, b), adds = 0, dels = 0;
    script.forEach(function (s) {
      if (s[0] === "add") adds++;
      if (s[0] === "del") dels++;
      out.appendChild(el("span", {
        class: "diffline " + s[0],
        text: (s[0] === "add" ? "+ " : s[0] === "del" ? "- " : "  ") + s[1]
      }));
    });
    $("#d-stat").textContent = adds + " added, " + dels + " removed, " +
      (script.length - adds - dels) + " unchanged";
  }

  ["#d-a", "#d-b", "#d-ws"].forEach(function (s) {
    $(s).addEventListener("input", runDiff);
    $(s).addEventListener("change", runDiff);
  });

  /* ---------- start ---------- */

  // Fields that ship with a default value need one pass on load, or the tool
  // opens showing an input with no output beside it.
  runCron();

  var initial = location.hash.replace("#", "");
  select(TOOLS.some(function (t) { return t[0] === initial; }) ? initial : "base64", true);
})();
