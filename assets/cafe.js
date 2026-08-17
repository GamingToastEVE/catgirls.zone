/* catgirls.zone/cafe — an idle game. All state lives in localStorage. */
(function () {
  "use strict";

  var $ = UI.$, el = UI.el;
  UI.boot("café");

  var STORE = "catgirls.cafe.v1";
  var GROWTH = 1.15;                  // cost multiplier per unit owned
  var OFFLINE_CAP = 8 * 3600;         // seconds of progress granted while away

  /* ---------- content ---------- */

  var BUILDINGS = [
    { id: "jar",     name: "Tip jar",        base: 15,        rate: 0.1,
      note: "Coins people leave behind." },
    { id: "barista", name: "Barista",        base: 110,       rate: 1,
      note: "Pulls shots, mostly correctly." },
    { id: "pastry",  name: "Pastry case",    base: 1300,      rate: 8,
      note: "Sells yesterday's croissants." },
    { id: "roaster", name: "Roaster",        base: 14000,     rate: 47,
      note: "The smell alone brings people in." },
    { id: "floor",   name: "Second floor",   base: 200000,    rate: 260,
      note: "Twice the seats, twice the noise." },
    { id: "van",     name: "Coffee van",     base: 3300000,   rate: 1400,
      note: "Takes the café to the customers." },
    { id: "branch",  name: "Second branch",  base: 51000000,  rate: 7800,
      note: "Somebody else's problem now." },
    { id: "empire",  name: "Franchise",      base: 900000000, rate: 44000,
      note: "There is one in every station." }
  ];

  var UPGRADES = [
    { id: "u1", name: "Sturdier tray", cost: 300, kind: "click", mult: 2,
      note: "Serving by hand is twice as good.", req: { clicks: 25 } },
    { id: "u2", name: "Better beans", cost: 2000, kind: "building", target: "barista", mult: 2,
      note: "Baristas produce twice as much.", req: { own: ["barista", 5] } },
    { id: "u3", name: "Loyalty cards", cost: 9000, kind: "click", mult: 3,
      note: "Serving by hand is three times as good.", req: { clicks: 120 } },
    { id: "u4", name: "Glass counter", cost: 26000, kind: "building", target: "pastry", mult: 2,
      note: "Pastry cases produce twice as much.", req: { own: ["pastry", 5] } },
    { id: "u5", name: "Morning rush", cost: 120000, kind: "global", mult: 1.25,
      note: "Everything produces 25% more.", req: { total: 100000 } },
    { id: "u6", name: "Cold brew line", cost: 500000, kind: "building", target: "roaster", mult: 2.5,
      note: "Roasters produce two and a half times as much.", req: { own: ["roaster", 5] } },
    { id: "u7", name: "Regulars", cost: 2400000, kind: "global", mult: 1.35,
      note: "Everything produces 35% more.", req: { total: 2000000 } },
    { id: "u8", name: "Night shift", cost: 18000000, kind: "global", mult: 1.5,
      note: "Everything produces 50% more.", req: { total: 15000000 } },
    { id: "u9", name: "House blend", cost: 260000000, kind: "global", mult: 2,
      note: "Everything produces twice as much.", req: { total: 200000000 } },
    { id: "u10", name: "The good machine", cost: 4e9, kind: "click", mult: 10,
      note: "Serving by hand is ten times as good.", req: { clicks: 900 } }
  ];

  /* ---------- state ---------- */

  var S;

  function fresh() {
    return {
      coins: 0, lifetime: 0, clicks: 0, beans: 0, renovations: 0,
      own: {}, bought: {}, last: Date.now(), started: Date.now()
    };
  }

  function load() {
    try {
      var raw = localStorage.getItem(STORE);
      if (!raw) return fresh();
      var s = JSON.parse(raw);
      var base = fresh();
      Object.keys(base).forEach(function (k) { if (s[k] == null) s[k] = base[k]; });
      return s;
    } catch (e) {
      return fresh();
    }
  }

  function save() {
    S.last = Date.now();
    try { localStorage.setItem(STORE, JSON.stringify(S)); }
    catch (e) { /* private mode — the run just will not persist */ }
  }

  /* ---------- numbers ---------- */

  var SUFFIX = ["", "K", "M", "B", "T", "Qa", "Qi", "Sx", "Sp", "Oc", "No", "Dc"];

  function fmt(n) {
    if (!isFinite(n)) return "∞";
    if (n < 0) return "-" + fmt(-n);
    if (n < 1000) return n < 10 ? (Math.round(n * 10) / 10).toString() : Math.floor(n).toString();
    var tier = Math.floor(Math.log10(n) / 3);
    if (tier >= SUFFIX.length) return n.toExponential(2);
    var scaled = n / Math.pow(1000, tier);
    return (Math.round(scaled * 100) / 100).toFixed(scaled < 10 ? 2 : scaled < 100 ? 1 : 0) +
           SUFFIX[tier];
  }

  function cost(b) {
    return Math.ceil(b.base * Math.pow(GROWTH, S.own[b.id] || 0));
  }

  /* ---------- derived values ---------- */

  function globalMult() {
    var m = 1;
    UPGRADES.forEach(function (u) {
      if (S.bought[u.id] && u.kind === "global") m *= u.mult;
    });
    return m * (1 + 0.02 * S.beans);      // each bean is a permanent +2%
  }

  function buildingRate(b) {
    var m = 1;
    UPGRADES.forEach(function (u) {
      if (S.bought[u.id] && u.kind === "building" && u.target === b.id) m *= u.mult;
    });
    return b.rate * m;
  }

  function income() {
    var per = 0;
    BUILDINGS.forEach(function (b) { per += (S.own[b.id] || 0) * buildingRate(b); });
    return per * globalMult();
  }

  function clickValue() {
    var m = 1;
    UPGRADES.forEach(function (u) {
      if (S.bought[u.id] && u.kind === "click") m *= u.mult;
    });
    // Hand-serving keeps a little relevance by scaling with a slice of income.
    return (1 + income() * 0.02) * m * globalMult();
  }

  function beansOnRenovate() {
    return Math.floor(Math.sqrt(S.lifetime / 1e6));
  }

  /* ---------- rendering ---------- */

  var buildingEls = {}, upgradeEls = {};

  function buildBuildings() {
    var host = $("#buildings");
    host.textContent = "";
    BUILDINGS.forEach(function (b) {
      var costEl = el("span", { class: "cost", text: "" });
      var ownEl = el("span", { class: "own", text: "" });
      var bar = el("i");
      var btn = el("button", {
        class: "buy",
        onclick: function () { buy(b); }
      }, [
        el("b", null, [b.name, " ", ownEl]),
        costEl,
        el("span", { class: "sub", text: b.note }),
        el("span", { class: "bar" }, [bar])
      ]);
      buildingEls[b.id] = { btn: btn, cost: costEl, own: ownEl, bar: bar };
      host.appendChild(btn);
    });
  }

  function unlocked(u) {
    var r = u.req || {};
    if (r.clicks && S.clicks < r.clicks) return false;
    if (r.total && S.lifetime < r.total) return false;
    if (r.own && (S.own[r.own[0]] || 0) < r.own[1]) return false;
    return true;
  }

  function drawUpgrades() {
    var host = $("#upgrades");
    var visible = UPGRADES.filter(function (u) { return !S.bought[u.id] && unlocked(u); });
    $("#no-upgrades").hidden = visible.length > 0;

    // rebuild only when the visible set changes, so buttons stay clickable
    var key = visible.map(function (u) { return u.id; }).join(",");
    if (host.dataset.key !== key) {
      host.dataset.key = key;
      host.textContent = "";
      upgradeEls = {};
      visible.forEach(function (u) {
        var costEl = el("span", { class: "cost", text: fmt(u.cost) });
        var btn = el("button", { class: "buy", onclick: function () { buyUpgrade(u); } }, [
          el("b", { text: u.name }),
          costEl,
          el("span", { class: "sub", text: u.note })
        ]);
        upgradeEls[u.id] = btn;
        host.appendChild(btn);
      });
    }
    visible.forEach(function (u) {
      var btn = upgradeEls[u.id];
      if (!btn) return;
      btn.disabled = S.coins < u.cost;
      btn.classList.toggle("afford", S.coins >= u.cost);
    });
  }

  function draw() {
    $("#coins").textContent = fmt(S.coins) + " ☕";
    var per = income();
    $("#rate").textContent = fmt(per) + " / second · " + fmt(clickValue()) + " per serve";

    // Everything within reach, plus the next one that is not — an empty panel
    // on a fresh save gives the player nothing to aim at.
    var teaser = true;
    BUILDINGS.forEach(function (b) {
      var e = buildingEls[b.id], c = cost(b), own = S.own[b.id] || 0;
      var reachable = own > 0 || S.lifetime >= b.base * 0.35;
      var show = reachable;
      if (!reachable && teaser) { show = true; teaser = false; }
      e.btn.style.display = show ? "" : "none";
      e.cost.textContent = fmt(c);
      e.own.textContent = own ? "×" + own : "";
      e.btn.disabled = S.coins < c;
      e.btn.classList.toggle("afford", S.coins >= c);
      e.bar.style.width = Math.min(100, (S.coins / c) * 100) + "%";
    });

    drawUpgrades();

    var gain = beansOnRenovate();
    $("#prestige-note").textContent = S.beans + " beans held (+" + Math.round(S.beans * 2) +
      "% to everything). Renovating now resets coins, staff and upgrades, and gives " +
      gain + " more bean" + (gain === 1 ? "" : "s") + ".";
    $("#prestige").disabled = gain < 1;

    $("#saveinfo").textContent = "Renovations: " + S.renovations +
      " · lifetime: " + fmt(S.lifetime) + " ☕ · serves: " + S.clicks;
  }

  /* ---------- actions ---------- */

  var logHost = $("#log");
  function log(msg) {
    logHost.insertBefore(el("div", { text: msg }), logHost.firstChild);
    while (logHost.children.length > 40) logHost.removeChild(logHost.lastChild);
  }

  function earn(n) {
    S.coins += n;
    S.lifetime += n;
  }

  function buy(b) {
    var c = cost(b);
    if (S.coins < c) return;
    S.coins -= c;
    S.own[b.id] = (S.own[b.id] || 0) + 1;
    if (S.own[b.id] === 1) log("Hired: " + b.name);
    draw(); save();
  }

  function buyUpgrade(u) {
    if (S.coins < u.cost || S.bought[u.id]) return;
    S.coins -= u.cost;
    S.bought[u.id] = true;
    log("Upgrade: " + u.name);
    draw(); save();
  }

  $("#serve").addEventListener("click", function (e) {
    var v = clickValue();
    earn(v);
    S.clicks++;
    var f = el("div", { class: "float", text: "+" + fmt(v) });
    f.style.left = (e.offsetX - 10) + "px";
    f.style.top = (e.offsetY - 10) + "px";
    this.parentNode.appendChild(f);
    setTimeout(function () { f.remove(); }, 900);
    draw();
  });

  $("#prestige").addEventListener("click", function () {
    var gain = beansOnRenovate();
    if (gain < 1) return;
    if (!confirm("Renovate? Coins, staff and upgrades go back to zero. You gain " +
                 gain + " bean" + (gain === 1 ? "" : "s") + ", worth a permanent +" +
                 (gain * 2) + "% to everything.")) return;
    var keep = { beans: S.beans + gain, renovations: S.renovations + 1, started: S.started };
    S = Object.assign(fresh(), keep);
    log("Renovated. Now holding " + S.beans + " beans.");
    draw(); save();
  });

  $("#export").addEventListener("click", function () {
    UI.copy(btoa(unescape(encodeURIComponent(JSON.stringify(S)))), "Save");
  });

  $("#import").addEventListener("click", function () {
    var raw = prompt("Paste a save string:");
    if (!raw) return;
    try {
      var s = JSON.parse(decodeURIComponent(escape(atob(raw.trim()))));
      if (typeof s.coins !== "number") throw new Error("not a save");
      S = Object.assign(fresh(), s);
      log("Save loaded.");
      draw(); save();
    } catch (e) {
      alert("That does not look like a save from this game.");
    }
  });

  $("#wipe").addEventListener("click", function () {
    if (!confirm("Erase this café completely? There is no undo.")) return;
    localStorage.removeItem(STORE);
    S = fresh();
    logHost.textContent = "";
    log("Started over.");
    draw();
  });

  /* ---------- loop ---------- */

  function offline() {
    var away = Math.max(0, (Date.now() - S.last) / 1000);
    if (away < 60) return;
    var counted = Math.min(away, OFFLINE_CAP);
    var got = income() * counted;
    if (got <= 0) return;
    earn(got);
    log("While you were away (" + Math.round(counted / 60) + " min): +" + fmt(got) + " ☕" +
        (away > OFFLINE_CAP ? " (capped at 8 hours)" : ""));
  }

  var lastTick = Date.now();
  function tick() {
    var now = Date.now();
    var dt = Math.min(2, (now - lastTick) / 1000);   // a long pause is handled by offline()
    lastTick = now;
    earn(income() * dt);
    draw();
  }

  S = load();
  buildBuildings();
  offline();
  draw();
  setInterval(tick, 100);
  setInterval(save, 5000);
  window.addEventListener("beforeunload", save);
})();
