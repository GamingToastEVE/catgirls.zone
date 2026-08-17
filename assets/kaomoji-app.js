/* catgirls.zone/kaomoji — filter, keyboard navigation, copy. */
(function () {
  "use strict";

  var $ = UI.$, el = UI.el;
  UI.boot("kaomoji");

  var DATA = window.KAOMOJI.map(function (k) {
    return { face: k[0], name: k[1], tags: k[2], hay: (k[1] + " " + k[2]).toLowerCase() };
  });

  var RECENT_KEY = "catgirls.kaomoji.recent";
  var results = $("#results"), qEl = $("#q");
  var shown = [], sel = 0, activeTag = "";

  /* ---------- popular tags, counted from the data ---------- */

  var freq = {};
  DATA.forEach(function (d) {
    d.tags.split(/\s+/).forEach(function (t) { freq[t] = (freq[t] || 0) + 1; });
  });
  var topTags = Object.keys(freq)
    .sort(function (a, b) { return freq[b] - freq[a] || a.localeCompare(b); })
    .slice(0, 12);

  topTags.forEach(function (t) {
    var b = el("button", {
      text: t, "aria-pressed": "false",
      onclick: function () {
        activeTag = activeTag === t ? "" : t;
        [].forEach.call($("#tags").children, function (c) {
          c.setAttribute("aria-pressed", String(c.textContent === activeTag));
        });
        render();
      }
    });
    $("#tags").appendChild(b);
  });

  /* ---------- search ---------- */

  function match(q) {
    var terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    return DATA.filter(function (d) {
      if (activeTag && d.tags.split(/\s+/).indexOf(activeTag) < 0) return false;
      return terms.every(function (t) { return d.hay.indexOf(t) >= 0; });
    });
  }

  function card(d, i) {
    var b = el("button", {
      class: "kao", type: "button", "data-i": i,
      onclick: function () { pick(d); }
    }, [
      el("span", { class: "face", text: d.face }),
      el("span", { class: "name", text: d.name })
    ]);
    b.title = d.tags;
    return b;
  }

  function render() {
    shown = match(qEl.value.trim());
    sel = 0;
    results.textContent = "";
    shown.forEach(function (d, i) { results.appendChild(card(d, i)); });
    $("#empty").hidden = shown.length > 0;
    $("#count").textContent = shown.length + " of " + DATA.length +
      (activeTag ? " · tag: " + activeTag : "");
    highlight();
  }

  function highlight() {
    [].forEach.call(results.children, function (c, i) {
      c.classList.toggle("sel", i === sel);
    });
    var cur = results.children[sel];
    if (cur) cur.scrollIntoView({ block: "nearest" });
  }

  function pick(d) {
    UI.copy(d.face, d.name);
    remember(d.face);
  }

  /* ---------- recently copied ---------- */

  function remember(face) {
    var list;
    try { list = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]"); }
    catch (e) { list = []; }
    list = [face].concat(list.filter(function (f) { return f !== face; })).slice(0, 12);
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(list)); } catch (e) { /* ignore */ }
    drawRecent();
  }

  function drawRecent() {
    var list;
    try { list = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]"); }
    catch (e) { list = []; }
    $("#recent-wrap").hidden = !list.length;
    var host = $("#recent");
    host.textContent = "";
    list.forEach(function (face) {
      var d = DATA.filter(function (x) { return x.face === face; })[0] ||
              { face: face, name: "", tags: "" };
      host.appendChild(card(d, -1));
    });
  }

  /* ---------- keyboard ---------- */

  // Arrow keys walk the grid; the column count comes from the rendered layout
  // so it stays right when the grid reflows.
  function columns() {
    if (!results.children.length) return 1;
    var top = results.children[0].offsetTop, n = 0;
    for (var i = 0; i < results.children.length; i++) {
      if (results.children[i].offsetTop !== top) break;
      n++;
    }
    return Math.max(1, n);
  }

  document.addEventListener("keydown", function (e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    var cols = columns();
    var moved = true;

    switch (e.key) {
      case "ArrowRight": sel = Math.min(shown.length - 1, sel + 1); break;
      case "ArrowLeft": sel = Math.max(0, sel - 1); break;
      case "ArrowDown": sel = Math.min(shown.length - 1, sel + cols); break;
      case "ArrowUp": sel = Math.max(0, sel - cols); break;
      case "Enter":
        if (shown[sel]) pick(shown[sel]);
        return;
      case "Escape":
        qEl.value = ""; activeTag = "";
        [].forEach.call($("#tags").children, function (c) {
          c.setAttribute("aria-pressed", "false");
        });
        render(); qEl.focus();
        return;
      default:
        moved = false;
    }

    if (moved) { e.preventDefault(); highlight(); }
    else if (e.key.length === 1 && document.activeElement !== qEl) qEl.focus();
  });

  qEl.addEventListener("input", render);

  render();
  drawRecent();
})();
