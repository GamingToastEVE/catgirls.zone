/* catgirls.zone/cafe — an idle game. All state lives in localStorage. */
(function () {
  "use strict";

  var $ = UI.$, el = UI.el;
  UI.boot("café");

  var STORE = "catgirls.cafe.v1";
  var GROWTH = 1.15;                  // cost multiplier per unit owned
  var BASE_OFFLINE_CAP = 8 * 3600;    // seconds of progress granted while away

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
      note: "There is one in every station." },
    { id: "farm",    name: "Plantation",     base: 1.6e10,    rate: 260000,
      note: "Cut out the middleman entirely." },
    { id: "port",    name: "Freight line",   base: 3.1e11,    rate: 1.6e6,
      note: "Your own containers, your own schedule." },
    { id: "lab",     name: "Bean laboratory", base: 7.2e12,   rate: 1.1e7,
      note: "Caffeine, but patented." },
    { id: "moon",    name: "Orbital roastery", base: 1.9e14,  rate: 8e7,
      note: "Roasting in zero gravity, for reasons." }
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
      note: "Serving by hand is ten times as good.", req: { clicks: 900 } },

    { id: "u11", name: "Proper tables", cost: 3.5e6, kind: "building", target: "floor", mult: 2,
      note: "Second floors produce twice as much.", req: { own: ["floor", 5] } },
    { id: "u12", name: "Route planning", cost: 6e7, kind: "building", target: "van", mult: 2,
      note: "Coffee vans produce twice as much.", req: { own: ["van", 5] } },
    { id: "u13", name: "Shared kitchen", cost: 9e8, kind: "building", target: "branch", mult: 2.5,
      note: "Second branches produce two and a half times as much.", req: { own: ["branch", 5] } },
    { id: "u14", name: "Training manual", cost: 2e10, kind: "building", target: "empire", mult: 2.5,
      note: "Franchises produce two and a half times as much.", req: { own: ["empire", 5] } },

    // Synergies: one tier lifts another, so a wide café beats a tall one.
    { id: "s1", name: "Beans in the back", cost: 1.2e7, kind: "synergy",
      target: "barista", from: "roaster", per: 0.02,
      note: "Baristas gain 2% for every roaster you own.", req: { own: ["roaster", 10] } },
    { id: "s2", name: "Van pickup", cost: 4e8, kind: "synergy",
      target: "pastry", from: "van", per: 0.05,
      note: "Pastry cases gain 5% for every coffee van.", req: { own: ["van", 10] } },
    { id: "s3", name: "Estate supply", cost: 9e10, kind: "synergy",
      target: "roaster", from: "farm", per: 0.05,
      note: "Roasters gain 5% for every plantation.", req: { own: ["farm", 5] } },

    { id: "u15", name: "Seasonal menu", cost: 1.4e11, kind: "global", mult: 2,
      note: "Everything produces twice as much.", req: { total: 1e11 } },
    { id: "u16", name: "Vertical integration", cost: 5e12, kind: "global", mult: 2.5,
      note: "Everything produces two and a half times as much.", req: { total: 4e12 } },
    { id: "u17", name: "Hydroponics", cost: 2.2e11, kind: "building", target: "farm", mult: 3,
      note: "Plantations produce three times as much.", req: { own: ["farm", 10] } },
    { id: "u18", name: "Own the port", cost: 4e12, kind: "building", target: "port", mult: 3,
      note: "Freight lines produce three times as much.", req: { own: ["port", 10] } },
    { id: "u19", name: "Patent portfolio", cost: 9e13, kind: "building", target: "lab", mult: 3,
      note: "Bean laboratories produce three times as much.", req: { own: ["lab", 10] } },
    { id: "u20", name: "Reusable boosters", cost: 2.4e15, kind: "building", target: "moon", mult: 3,
      note: "Orbital roasteries produce three times as much.", req: { own: ["moon", 10] } }
  ];

  // Bought with beans, kept forever — beans spent here never reduce the
  // permanent production bonus, which is counted from beans *earned*.
  var PERKS = [
    { id: "p_oven", name: "Warm ovens", cost: 1,
      note: "Away time counts for 16 hours instead of 8." },
    { id: "p_night", name: "Night deliveries", cost: 3,
      note: "Away time counts for a full day." },
    { id: "p_word", name: "Word of mouth", cost: 2,
      note: "Passers-by turn up twice as often." },
    { id: "p_tips", name: "Big tippers", cost: 5,
      note: "Passers-by are worth twice as much." },
    { id: "p_hands", name: "Muscle memory", cost: 2,
      note: "Serving by hand is five times as good." },
    { id: "p_stock", name: "Opening stock", cost: 8,
      note: "Every renovation starts with 25 tip jars and 10 baristas." },
    { id: "p_press", name: "Press coverage", cost: 15,
      note: "Everything produces 50% more." },
    { id: "p_empire", name: "Head office", cost: 40,
      note: "Everything produces twice as much." }
  ];

  var ACHIEVEMENTS = [
    { id: "a1", name: "First cup", note: "Serve one customer.",
      test: function (s) { return s.clicks >= 1; } },
    { id: "a2", name: "Hand cramp", note: "Serve 500 by hand.",
      test: function (s) { return s.clicks >= 500; } },
    { id: "a3", name: "Repetitive strain", note: "Serve 5,000 by hand.",
      test: function (s) { return s.clicks >= 5000; } },
    { id: "a4", name: "Small change", note: "Earn 1,000 coins.",
      test: function (s) { return s.lifetime >= 1e3; } },
    { id: "a5", name: "Going concern", note: "Earn a million.",
      test: function (s) { return s.lifetime >= 1e6; } },
    { id: "a6", name: "Real money", note: "Earn a billion.",
      test: function (s) { return s.lifetime >= 1e9; } },
    { id: "a7", name: "Absurd money", note: "Earn a trillion.",
      test: function (s) { return s.lifetime >= 1e12; } },
    { id: "a8", name: "Silly money", note: "Earn a quadrillion.",
      test: function (s) { return s.lifetime >= 1e15; } },
    { id: "a9", name: "Staffed", note: "Own 10 baristas.",
      test: function (s) { return (s.own.barista || 0) >= 10; } },
    { id: "a10", name: "A proper shop", note: "Own 25 of anything.",
      test: function (s) { return anyOwn(s, 25); } },
    { id: "a11", name: "Overstaffed", note: "Own 50 of anything.",
      test: function (s) { return anyOwn(s, 50); } },
    { id: "a12", name: "Why", note: "Own 100 of anything.",
      test: function (s) { return anyOwn(s, 100); } },
    { id: "a13", name: "Broad portfolio", note: "Own at least one of every tier.",
      test: function (s) { return BUILDINGS.every(function (b) { return s.own[b.id]; }); } },
    { id: "a14", name: "Shopping list", note: "Buy 10 upgrades.",
      test: function (s) { return Object.keys(s.bought).length >= 10; } },
    { id: "a15", name: "Completionist", note: "Buy every upgrade.",
      test: function (s) { return Object.keys(s.bought).length >= UPGRADES.length; } },
    { id: "a16", name: "Fresh paint", note: "Renovate once.",
      test: function (s) { return s.renovations >= 1; } },
    { id: "a17", name: "Serial renovator", note: "Renovate five times.",
      test: function (s) { return s.renovations >= 5; } },
    { id: "a18", name: "Landlord's favourite", note: "Renovate twenty times.",
      test: function (s) { return s.renovations >= 20; } },
    { id: "a19", name: "Bean counter", note: "Hold 10 beans at once.",
      test: function (s) { return s.beans >= 10; } },
    { id: "a20", name: "Hoarder", note: "Earn 100 beans in total.",
      test: function (s) { return s.beansEarned >= 100; } },
    { id: "a21", name: "Caught one", note: "Catch a passer-by.",
      test: function (s) { return s.caught >= 1; } },
    { id: "a22", name: "Quick hands", note: "Catch 25 passers-by.",
      test: function (s) { return s.caught >= 25; } },
    { id: "a23", name: "Doorman", note: "Catch 100 passers-by.",
      test: function (s) { return s.caught >= 100; } },
    { id: "a24", name: "Steady trade", note: "Reach a million a second.",
      test: function () { return income() >= 1e6; } },
    { id: "a25", name: "Firehose", note: "Reach a billion a second.",
      test: function () { return income() >= 1e9; } },
    { id: "a26", name: "Settled in", note: "Keep one café going for a day.",
      test: function (s) { return Date.now() - s.started >= 86400000; } }
  ];

  function anyOwn(s, n) {
    return BUILDINGS.some(function (b) { return (s.own[b.id] || 0) >= n; });
  }

  /* ---------- state ---------- */

  var S;

  function fresh() {
    return {
      coins: 0, lifetime: 0, clicks: 0, beans: 0, beansEarned: 0, renovations: 0,
      caught: 0, own: {}, bought: {}, perks: {}, achieved: {},
      buffMult: 1, buffUntil: 0, nextVisitor: 0,
      bestRun: 0, allTime: 0,
      last: Date.now(), started: Date.now()
    };
  }

  function load() {
    try {
      var raw = localStorage.getItem(STORE);
      if (!raw) return fresh();
      var s = JSON.parse(raw);
      var base = fresh();
      Object.keys(base).forEach(function (k) { if (s[k] == null) s[k] = base[k]; });
      // Saves from before the bean shop counted spendable beans as the source
      // of the production bonus. Earned is what the bonus reads now, so an old
      // save's holdings become its earnings rather than silently halving.
      if (!s.beansEarned && s.beans) s.beansEarned = s.beans;
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

  function fmtTime(sec) {
    sec = Math.max(0, Math.floor(sec));
    var d = Math.floor(sec / 86400), h = Math.floor(sec % 86400 / 3600);
    var m = Math.floor(sec % 3600 / 60), s = sec % 60;
    if (d) return d + "d " + h + "h";
    if (h) return h + "h " + m + "m";
    if (m) return m + "m " + s + "s";
    return s + "s";
  }

  // Geometric series rather than a loop: buying 500 at a time should not cost
  // 500 multiplications, and "max" needs the inverse anyway.
  function costOf(b, n) {
    var own = S.own[b.id] || 0;
    var start = b.base * Math.pow(GROWTH, own);
    return Math.ceil(start * (Math.pow(GROWTH, n) - 1) / (GROWTH - 1));
  }

  function maxAffordable(b) {
    var own = S.own[b.id] || 0;
    var start = b.base * Math.pow(GROWTH, own);
    var n = Math.floor(Math.log(1 + S.coins * (GROWTH - 1) / start) / Math.log(GROWTH));
    if (!isFinite(n) || n < 0) n = 0;
    // Rounding at these magnitudes can overshoot by one; step back if so.
    while (n > 0 && costOf(b, n) > S.coins) n--;
    return n;
  }

  var buyMode = 1;                 // 1, 10, 100 or "max"

  function amountFor(b) {
    return buyMode === "max" ? maxAffordable(b) : buyMode;
  }

  /* ---------- derived values ---------- */

  function globalMult() {
    var m = 1;
    UPGRADES.forEach(function (u) {
      if (S.bought[u.id] && u.kind === "global") m *= u.mult;
    });
    if (S.perks.p_press) m *= 1.5;
    if (S.perks.p_empire) m *= 2;
    m *= 1 + 0.02 * S.beansEarned;                    // each bean earned is +2%
    m *= 1 + 0.01 * Object.keys(S.achieved).length;   // each achievement is +1%
    if (S.buffUntil > Date.now()) m *= S.buffMult;
    return m;
  }

  function buildingRate(b) {
    var m = 1;
    UPGRADES.forEach(function (u) {
      if (!S.bought[u.id]) return;
      if (u.kind === "building" && u.target === b.id) m *= u.mult;
      if (u.kind === "synergy" && u.target === b.id) m *= 1 + u.per * (S.own[u.from] || 0);
    });
    return b.rate * m;
  }

  function buildingIncome(b) {
    return (S.own[b.id] || 0) * buildingRate(b) * globalMult();
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
    if (S.perks.p_hands) m *= 5;
    // Hand-serving keeps a little relevance by scaling with a slice of income.
    return (1 + income() * 0.02) * m * globalMult();
  }

  function offlineCap() {
    if (S.perks.p_night) return 24 * 3600;
    if (S.perks.p_oven) return 16 * 3600;
    return BASE_OFFLINE_CAP;
  }

  function beansOnRenovate() {
    return Math.floor(Math.sqrt(S.lifetime / 1e6));
  }

  /* ---------- rendering ---------- */

  var buildingEls = {}, upgradeEls = {}, perkEls = {};

  function buildBuildings() {
    var host = $("#buildings");
    host.textContent = "";
    BUILDINGS.forEach(function (b) {
      var costEl = el("span", { class: "cost", text: "" });
      var ownEl = el("span", { class: "own", text: "" });
      var subEl = el("span", { class: "sub", text: b.note });
      var bar = el("i");
      var btn = el("button", {
        class: "buy",
        onclick: function () { buy(b); }
      }, [
        el("b", null, [b.name, " ", ownEl]),
        costEl,
        subEl,
        el("span", { class: "bar" }, [bar])
      ]);
      buildingEls[b.id] = { btn: btn, cost: costEl, own: ownEl, sub: subEl, bar: bar };
      host.appendChild(btn);
    });
  }

  function buildPerks() {
    var host = $("#perks");
    host.textContent = "";
    PERKS.forEach(function (p) {
      var costEl = el("span", { class: "cost", text: p.cost + " 🫘" });
      var btn = el("button", { class: "buy", onclick: function () { buyPerk(p); } }, [
        el("b", { text: p.name }),
        costEl,
        el("span", { class: "sub", text: p.note })
      ]);
      perkEls[p.id] = { btn: btn, cost: costEl };
      host.appendChild(btn);
    });
  }

  function buildAchievements() {
    var host = $("#achievements");
    host.textContent = "";
    ACHIEVEMENTS.forEach(function (a) {
      host.appendChild(el("span", {
        class: "ach", id: "ach-" + a.id, title: a.note, text: a.name
      }));
    });
  }

  function buildModes() {
    var host = $("#modes");
    [1, 10, 100, "max"].forEach(function (m) {
      host.appendChild(el("button", {
        text: m === "max" ? "max" : "×" + m,
        "aria-pressed": String(m === buyMode),
        onclick: function () {
          buyMode = m;
          [].forEach.call(host.children, function (c) {
            c.setAttribute("aria-pressed", String(c === this));
          }, this);
          draw();
        }
      }));
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

  function drawPerks() {
    PERKS.forEach(function (p) {
      var e = perkEls[p.id];
      var owned = !!S.perks[p.id];
      e.btn.classList.toggle("owned", owned);
      e.btn.disabled = owned || S.beans < p.cost;
      e.btn.classList.toggle("afford", !owned && S.beans >= p.cost);
      e.cost.textContent = owned ? "owned" : p.cost + " 🫘";
    });
  }

  function drawStats() {
    var per = income();
    var host = $("#breakdown");
    host.textContent = "";
    var rows = BUILDINGS.filter(function (b) { return S.own[b.id]; })
      .map(function (b) { return { b: b, v: buildingIncome(b) }; })
      .sort(function (x, y) { return y.v - x.v; });
    if (!rows.length) {
      host.appendChild(el("p", { class: "small muted", text:
        "Nothing is producing yet. Serve a few customers by hand and buy a tip jar." }));
    }
    rows.forEach(function (r) {
      host.appendChild(el("div", { class: "share" }, [
        el("span", { text: r.b.name }),
        el("i", { style: "width:" + (per ? (r.v / per) * 100 : 0) + "%" }),
        el("b", { text: fmt(r.v) + "/s · " + (per ? Math.round(r.v / per * 100) : 0) + "%" })
      ]));
    });

    $("#stat-list").textContent = "";
    [
      ["This café", fmt(S.lifetime) + " ☕"],
      ["Best café", fmt(Math.max(S.bestRun, S.lifetime)) + " ☕"],
      ["All time", fmt(S.allTime + S.lifetime) + " ☕"],
      ["Served by hand", S.clicks.toLocaleString("en-US")],
      ["Passers-by caught", S.caught.toLocaleString("en-US")],
      ["Renovations", String(S.renovations)],
      ["Beans earned", String(S.beansEarned)],
      ["Achievements", Object.keys(S.achieved).length + " / " + ACHIEVEMENTS.length],
      ["Café age", fmtTime((Date.now() - S.started) / 1000)],
      ["Away counts for", fmtTime(offlineCap())]
    ].forEach(function (row) {
      $("#stat-list").appendChild(el("div", { class: "kvrow" }, [
        el("span", { text: row[0] }), el("b", { text: row[1] })
      ]));
    });
  }

  function draw() {
    $("#coins").textContent = fmt(S.coins) + " ☕";
    var per = income();
    $("#rate").textContent = fmt(per) + " / second · " + fmt(clickValue()) + " per serve";

    var left = (S.buffUntil - Date.now()) / 1000;
    var buff = $("#buff");
    buff.hidden = left <= 0;
    if (left > 0) buff.textContent = "Rush on: ×" + S.buffMult + " for " + Math.ceil(left) + "s";

    // Everything within reach, plus the next one that is not — an empty panel
    // on a fresh save gives the player nothing to aim at.
    var teaser = true;
    BUILDINGS.forEach(function (b) {
      var e = buildingEls[b.id], own = S.own[b.id] || 0;
      var reachable = own > 0 || S.lifetime >= b.base * 0.35;
      var show = reachable;
      if (!reachable && teaser) { show = true; teaser = false; }
      e.btn.style.display = show ? "" : "none";
      if (!show) return;

      var n = amountFor(b);
      var c = costOf(b, Math.max(1, n));
      var affordable = n >= 1 && S.coins >= c;
      e.cost.textContent = (buyMode === 1 ? "" : "×" + Math.max(1, n) + " ") + fmt(c);
      e.own.textContent = own ? "×" + own : "";
      e.sub.textContent = own
        ? b.note + " — " + fmt(buildingIncome(b)) + "/s from " + own
        : b.note;
      e.btn.disabled = !affordable;
      e.btn.classList.toggle("afford", affordable);
      e.bar.style.width = Math.min(100, (S.coins / c) * 100) + "%";
    });

    drawUpgrades();
    drawPerks();

    var gain = beansOnRenovate();
    $("#prestige-note").textContent = S.beans + " bean" + (S.beans === 1 ? "" : "s") +
      " to spend, " + S.beansEarned + " earned (+" + Math.round(S.beansEarned * 2) +
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
    var n = amountFor(b);
    if (n < 1) return;
    var c = costOf(b, n);
    if (S.coins < c) return;
    S.coins -= c;
    var before = S.own[b.id] || 0;
    S.own[b.id] = before + n;
    if (before === 0) log("Hired: " + b.name);
    else if (n > 1) log("Bought " + n + " × " + b.name);
    draw(); save();
  }

  function buyUpgrade(u) {
    if (S.coins < u.cost || S.bought[u.id]) return;
    S.coins -= u.cost;
    S.bought[u.id] = true;
    log("Upgrade: " + u.name);
    draw(); save();
  }

  function buyPerk(p) {
    if (S.perks[p.id] || S.beans < p.cost) return;
    S.beans -= p.cost;
    S.perks[p.id] = true;
    log("Bean shop: " + p.name);
    draw(); save();
  }

  function checkAchievements() {
    var got = false;
    ACHIEVEMENTS.forEach(function (a) {
      if (S.achieved[a.id]) return;
      var ok = false;
      try { ok = a.test(S); } catch (e) { ok = false; }
      if (!ok) return;
      S.achieved[a.id] = Date.now();
      log("Achievement: " + a.name + " (+1% to everything)");
      got = true;
    });
    ACHIEVEMENTS.forEach(function (a) {
      var e = $("#ach-" + a.id);
      if (e) e.classList.toggle("got", !!S.achieved[a.id]);
    });
    if (got) save();
  }

  function serve(x, y) {
    var v = clickValue();
    earn(v);
    S.clicks++;
    var host = $("#serve").parentNode;
    var f = el("div", { class: "float", text: "+" + fmt(v) });
    f.style.left = (x - 10) + "px";
    f.style.top = (y - 10) + "px";
    host.appendChild(f);
    setTimeout(function () { f.remove(); }, 900);
    draw();
  }

  $("#serve").addEventListener("click", function (e) { serve(e.offsetX, e.offsetY); });

  document.addEventListener("keydown", function (e) {
    if (e.code !== "Space" || e.repeat) return;
    var t = e.target.tagName;
    if (t === "INPUT" || t === "TEXTAREA" || t === "BUTTON") return;
    e.preventDefault();
    var b = $("#serve").getBoundingClientRect();
    serve(b.width / 2, b.height / 2);
  });

  /* ---------- passers-by ----------
   *
   * A rare button that pays for paying attention. It is worth roughly a minute
   * and a half of income, so it never dwarfs the actual café — and it stays
   * for twelve seconds, which is long enough not to demand vigilance.
   */

  var visitorEl = null;

  function visitorDelay() {
    var base = 90 + Math.random() * 150;              // 1.5 to 4 minutes
    return (S.perks.p_word ? base / 2 : base) * 1000;
  }

  function spawnVisitor() {
    if (visitorEl) return;
    visitorEl = el("button", { class: "visitor", title: "Someone is at the door" }, ["🐈"]);
    visitorEl.style.left = (8 + Math.random() * 78) + "%";
    visitorEl.style.top = (14 + Math.random() * 66) + "%";
    visitorEl.addEventListener("click", collectVisitor);
    document.body.appendChild(visitorEl);
    setTimeout(function () {
      if (visitorEl) { visitorEl.remove(); visitorEl = null; }
    }, 12000);
  }

  function collectVisitor() {
    if (!visitorEl) return;
    visitorEl.remove();
    visitorEl = null;
    S.caught++;
    var boost = S.perks.p_tips ? 2 : 1;

    if (Math.random() < 0.35) {
      S.buffMult = 7;
      S.buffUntil = Date.now() + 25000 * boost;
      log("A rush: everything ×7 for " + (25 * boost) + " seconds.");
    } else {
      var got = (income() * 90 + clickValue() * 15) * boost;
      earn(got);
      log("A regular dropped in: +" + fmt(got) + " ☕");
    }
    S.nextVisitor = Date.now() + visitorDelay();
    draw(); save();
  }

  $("#prestige").addEventListener("click", function () {
    var gain = beansOnRenovate();
    if (gain < 1) return;
    if (!confirm("Renovate? Coins, staff and upgrades go back to zero. You gain " +
                 gain + " bean" + (gain === 1 ? "" : "s") + ", worth a permanent +" +
                 (gain * 2) + "% to everything.")) return;
    var keep = {
      beans: S.beans + gain,
      beansEarned: S.beansEarned + gain,
      renovations: S.renovations + 1,
      caught: S.caught,
      perks: S.perks,
      achieved: S.achieved,
      bestRun: Math.max(S.bestRun, S.lifetime),
      allTime: S.allTime + S.lifetime,
      started: S.started,
      nextVisitor: S.nextVisitor
    };
    S = Object.assign(fresh(), keep);
    if (S.perks.p_stock) { S.own.jar = 25; S.own.barista = 10; }
    log("Renovated. Now holding " + S.beansEarned + " beans in total.");
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
      if (!S.beansEarned && S.beans) S.beansEarned = S.beans;
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
    var cap = offlineCap();
    var counted = Math.min(away, cap);
    var got = income() * counted;
    if (got <= 0) return;
    earn(got);
    log("While you were away (" + fmtTime(counted) + "): +" + fmt(got) + " ☕" +
        (away > cap ? " (capped at " + fmtTime(cap) + ")" : ""));
  }

  var lastTick = Date.now();
  function tick() {
    var now = Date.now();
    var dt = Math.min(2, (now - lastTick) / 1000);   // a long pause is handled by offline()
    lastTick = now;
    earn(income() * dt);
    if (now >= S.nextVisitor) {
      spawnVisitor();
      S.nextVisitor = now + visitorDelay();
    }
    draw();
  }

  S = load();
  buildBuildings();
  buildPerks();
  buildAchievements();
  buildModes();
  offline();
  // A visitor should never be waiting the instant the page opens, and the
  // timer from a long-closed save would do exactly that.
  if (!S.nextVisitor || S.nextVisitor < Date.now()) S.nextVisitor = Date.now() + visitorDelay();
  checkAchievements();
  drawStats();
  draw();
  setInterval(tick, 100);
  setInterval(function () { checkAchievements(); drawStats(); }, 1000);
  setInterval(save, 5000);
  window.addEventListener("beforeunload", save);

  window.__cafe = { S: function () { return S; }, income: income, costOf: costOf,
                    maxAffordable: maxAffordable, spawnVisitor: spawnVisitor,
                    setMode: function (m) { buyMode = m; draw(); },
                    BUILDINGS: BUILDINGS, UPGRADES: UPGRADES,
                    PERKS: PERKS, ACHIEVEMENTS: ACHIEVEMENTS };
})();
