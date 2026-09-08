/* catgirls.zone/casino — play money, honest odds.
 *
 * Nothing here is weighted in the player's favour to make the first spins feel
 * lucky, and nothing is weighted against them to claw it back later. Each game
 * states its true house edge, and the bank panel reports what the player has
 * actually received against what they staked.
 */
(function () {
  "use strict";

  var $ = UI.$, el = UI.el;
  UI.boot("casino");

  var STORE = "catgirls.casino.v1";
  var START = 1000;

  /* ================= randomness ================= */

  // crypto.getRandomValues, rejection-sampled so the modulo does not skew the
  // last few values. At these ranges the bias would be tiny, but a casino is
  // the one place to be exact about it.
  function randInt(n) {
    var max = Math.floor(4294967296 / n) * n;
    var buf = new Uint32Array(1);
    do { crypto.getRandomValues(buf); } while (buf[0] >= max);
    return buf[0] % n;
  }

  /* ================= bank ================= */

  var B;

  // `refilled` is tracked separately from `returned`: a free top-up is not a
  // win, and counting it as one would flatter the reported return rate.
  function fresh() { return { chips: START, wagered: 0, returned: 0, rounds: 0, refilled: 0 }; }

  function load() {
    try {
      var s = JSON.parse(localStorage.getItem(STORE) || "null");
      if (!s || typeof s.chips !== "number") return fresh();
      var base = fresh();
      Object.keys(base).forEach(function (k) { if (typeof s[k] !== "number") s[k] = base[k]; });
      return s;
    } catch (e) { return fresh(); }
  }

  function save() {
    try { localStorage.setItem(STORE, JSON.stringify(B)); } catch (e) { /* private mode */ }
  }

  function fmt(n) {
    return Math.round(n).toLocaleString("en-US");
  }

  function stake(amount) {
    if (amount > B.chips) return false;
    B.chips -= amount;
    B.wagered += amount;
    B.rounds++;
    drawBank();
    return true;
  }

  function payout(amount) {
    if (amount <= 0) return;
    B.chips += amount;
    B.returned += amount;
    drawBank();
  }

  function drawBank() {
    $("#chips").textContent = fmt(B.chips);
    $("#wagered").textContent = fmt(B.wagered);
    var net = B.returned - B.wagered;
    var netEl = $("#net");
    netEl.textContent = (net > 0 ? "+" : "") + fmt(net);
    netEl.className = "htotal net " + (net > 0 ? "up" : net < 0 ? "down" : "");
    $("#rtp").textContent = B.wagered > 0
      ? (B.returned / B.wagered * 100).toFixed(1) + "% over " + fmt(B.rounds) + " rounds"
      : "—";
    save();
  }

  function betOf(sel) {
    var v = Math.floor(+$(sel).value);
    if (!(v > 0)) return 0;
    return Math.min(v, B.chips);
  }

  $("#topup").addEventListener("click", function () {
    if (B.chips >= START) return UI.toast("You still have chips");
    B.refilled += START - B.chips;
    B.chips = START;
    drawBank();
    UI.toast("Refilled to " + fmt(START));
  });

  $("#reset").addEventListener("click", function () {
    if (!confirm("Reset chips and all statistics?")) return;
    B = fresh();
    drawBank();
  });

  /* ================= tabs ================= */

  var GAMES = [["slots", "Slots"], ["roulette", "Roulette"], ["blackjack", "Blackjack"]];
  GAMES.forEach(function (g) {
    $("#tabs").appendChild(el("button", {
      text: g[1], role: "tab", "aria-selected": "false", "data-g": g[0],
      onclick: function () { pickGame(g[0]); }
    }));
  });

  function pickGame(id) {
    GAMES.forEach(function (g) {
      $("[data-g=" + g[0] + "]").setAttribute("aria-selected", String(g[0] === id));
      $("#g-" + g[0]).classList.toggle("active", g[0] === id);
    });
    history.replaceState(null, "", "#" + id);
  }

  /* ================= slots ================= */

  // [symbol, reel weight, three-of-a-kind pay, two-of-a-kind pay]
  var SYMBOLS = [
    ["🍒", 20, 6, 0.25],
    ["🍋", 16, 12, 0.3],
    ["🔔", 12, 22, 0.4],
    ["💎", 8, 60, 0.6],
    ["⭐", 5, 160, 1],
    ["🐱", 3, 500, 2]
  ];
  var WEIGHT = SYMBOLS.reduce(function (a, s) { return a + s[1]; }, 0);

  function spinReel() {
    var r = randInt(WEIGHT), acc = 0;
    for (var i = 0; i < SYMBOLS.length; i++) {
      acc += SYMBOLS[i][1];
      if (r < acc) return i;
    }
    return SYMBOLS.length - 1;
  }

  // Multiplier for one outcome, given three symbol indices.
  function slotPay(a, b, c) {
    if (a === b && b === c) return SYMBOLS[a][2];
    var idx = [a, b, c];
    for (var i = 0; i < SYMBOLS.length; i++) {
      var n = idx.filter(function (x) { return x === i; }).length;
      if (n === 2) return SYMBOLS[i][3];
    }
    return 0;
  }

  // The advertised RTP is computed from the table above rather than written
  // down, so the claim can never drift away from the machine.
  function slotRTP() {
    var ev = 0;
    for (var a = 0; a < SYMBOLS.length; a++)
      for (var b = 0; b < SYMBOLS.length; b++)
        for (var c = 0; c < SYMBOLS.length; c++) {
          var p = (SYMBOLS[a][1] / WEIGHT) * (SYMBOLS[b][1] / WEIGHT) * (SYMBOLS[c][1] / WEIGHT);
          ev += p * slotPay(a, b, c);
        }
    return ev;
  }

  function drawPaytable() {
    var t = $("#s-pay");
    t.textContent = "";
    t.appendChild(el("tr", null, [
      el("th", { text: "Symbol" }), el("th", { text: "Chance per reel" }),
      el("th", { text: "Three" }), el("th", { text: "Two" })
    ]));
    SYMBOLS.slice().reverse().forEach(function (s) {
      t.appendChild(el("tr", null, [
        el("td", { text: s[0] }),
        el("td", { text: (s[1] / WEIGHT * 100).toFixed(2) + "%" }),
        el("td", { text: s[2] + "×" }),
        el("td", { text: s[3] + "×" })
      ]));
    });
    var rtp = slotRTP();
    $("#s-edge").textContent =
      "Return to player " + (rtp * 100).toFixed(2) + "%, so the house edge is " +
      ((1 - rtp) * 100).toFixed(2) + "%. Computed from the table above every time " +
      "this page loads, not typed in by hand. Over a long session you should " +
      "expect to lose about " + ((1 - rtp) * 100).toFixed(0) + " chips per 100 staked.";
  }

  var spinning = false;

  function doSpin(bet, then) {
    var out = [spinReel(), spinReel(), spinReel()];
    var ids = ["#r0", "#r1", "#r2"];
    ids.forEach(function (id) {
      $(id).classList.add("spin");
      $(id).classList.remove("win");
    });

    var step = 0;
    var iv = setInterval(function () {
      ids.forEach(function (id, i) {
        if (i >= step) $(id).textContent = SYMBOLS[spinReel()][0];
      });
      if (step >= 3) {
        clearInterval(iv);
        finish();
      }
      step += 0.34;
    }, 60);

    function finish() {
      ids.forEach(function (id, i) {
        $(id).classList.remove("spin");
        $(id).textContent = SYMBOLS[out[i]][0];
      });
      var mult = slotPay(out[0], out[1], out[2]);
      var won = bet * mult;
      if (won > 0) {
        payout(won);
        ids.forEach(function (id) { $(id).classList.add("win"); });
        $("#s-result").className = "result win";
        $("#s-result").textContent = "+" + fmt(won) + "  (" + mult + "×)";
      } else {
        $("#s-result").className = "result lose";
        $("#s-result").textContent = "−" + fmt(bet);
      }
      spinning = false;
      if (then) then();
    }
  }

  $("#s-spin").addEventListener("click", function () {
    if (spinning) return;
    var bet = betOf("#s-bet");
    if (!bet) return UI.toast("Out of chips — use the free refill");
    if (!stake(bet)) return;
    spinning = true;
    doSpin(bet);
  });

  $("#s-auto").addEventListener("click", function () {
    if (spinning) return;
    var left = 25;
    (function next() {
      var bet = betOf("#s-bet");
      if (!left-- || !bet || !stake(bet)) { spinning = false; return; }
      spinning = true;
      doSpin(bet, function () { setTimeout(next, 90); });
    })();
  });

  /* ================= roulette ================= */

  var RED = [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36];
  function colorOf(n) { return n === 0 ? "green" : RED.indexOf(n) >= 0 ? "red" : "black"; }

  var OUTSIDE = [
    ["red", "Red", 1, function (n) { return colorOf(n) === "red"; }],
    ["black", "Black", 1, function (n) { return colorOf(n) === "black"; }],
    ["odd", "Odd", 1, function (n) { return n !== 0 && n % 2 === 1; }],
    ["even", "Even", 1, function (n) { return n !== 0 && n % 2 === 0; }],
    ["low", "1–18", 1, function (n) { return n >= 1 && n <= 18; }],
    ["high", "19–36", 1, function (n) { return n >= 19; }],
    ["d1", "1st dozen", 2, function (n) { return n >= 1 && n <= 12; }],
    ["d2", "2nd dozen", 2, function (n) { return n >= 13 && n <= 24; }],
    ["d3", "3rd dozen", 2, function (n) { return n >= 25; }],
    ["c1", "Column 1", 2, function (n) { return n !== 0 && n % 3 === 1; }],
    ["c2", "Column 2", 2, function (n) { return n !== 0 && n % 3 === 2; }],
    ["c3", "Column 3", 2, function (n) { return n !== 0 && n % 3 === 0; }]
  ];

  // The table as laid out by the player: every spot they have chips on, keyed
  // by "n17" for a straight number or by the outside bet's id. Each entry is a
  // stake that wins or loses on its own, the way chips on a real layout do.
  var table = {};
  // Named chipOrder, not history: a `var history` here would shadow
  // window.history for the whole module and break pickGame's replaceState.
  var chipOrder = [];               // spot ids in the order they were backed
  var spotEls = {};

  function spotLabel(key) {
    if (key.charAt(0) === "n") return "Straight " + key.slice(1);
    var o = outsideById(key);
    return o ? o[1] : key;
  }

  function spotOdds(key) {
    if (key.charAt(0) === "n") return 35;
    var o = outsideById(key);
    return o ? o[2] : 0;
  }

  function spotWins(key, n) {
    if (key.charAt(0) === "n") return +key.slice(1) === n;
    var o = outsideById(key);
    return o ? o[3](n) : false;
  }

  function outsideById(id) {
    for (var i = 0; i < OUTSIDE.length; i++) if (OUTSIDE[i][0] === id) return OUTSIDE[i];
    return null;
  }

  function tableTotal() {
    var t = 0;
    Object.keys(table).forEach(function (k) { t += table[k]; });
    return t;
  }

  function buildRoulette() {
    var g = $("#r-nums");
    g.appendChild(numButton(0, "zero"));
    for (var n = 1; n <= 36; n++) g.appendChild(numButton(n, colorOf(n)));

    OUTSIDE.forEach(function (o) {
      var amt = el("span", { class: "amt", hidden: "hidden" });
      var btn = el("button", {
        "data-o": o[0],
        onclick: function () { addChip(o[0]); },
        oncontextmenu: function (e) { e.preventDefault(); removeChip(o[0]); }
      }, [document.createTextNode(o[1] + "  " + o[2] + ":1"), amt]);
      spotEls[o[0]] = amt;
      $("#r-outside").appendChild(btn);
    });
  }

  function numButton(n, cls) {
    var amt = el("span", { class: "amt", hidden: "hidden" });
    var key = "n" + n;
    var btn = el("button", {
      class: cls, "data-n": n,
      onclick: function () { addChip(key); },
      oncontextmenu: function (e) { e.preventDefault(); removeChip(key); }
    }, [document.createTextNode(String(n)), amt]);
    spotEls[key] = amt;
    return btn;
  }

  function chipSize() {
    var v = Math.floor(+$("#r-bet").value);
    return v > 0 ? v : 0;
  }

  function addChip(key) {
    var c = chipSize();
    if (!c) return UI.toast("Set a chip size first");
    // Checked as the chips go down rather than at spin time, so the table can
    // never hold more than the player can actually cover.
    if (tableTotal() + c > B.chips) return UI.toast("Not enough chips for that");
    table[key] = (table[key] || 0) + c;
    chipOrder.push(key);
    drawTable();
  }

  function removeChip(key) {
    if (!table[key]) return;
    var c = Math.min(chipSize() || table[key], table[key]);
    table[key] -= c;
    if (table[key] <= 0) delete table[key];
    for (var i = chipOrder.length - 1; i >= 0; i--) {
      if (chipOrder[i] === key) { chipOrder.splice(i, 1); break; }
    }
    drawTable();
  }

  function drawTable() {
    Object.keys(spotEls).forEach(function (k) {
      var amt = spotEls[k];
      if (table[k]) { amt.hidden = false; amt.textContent = fmt(table[k]); }
      else { amt.hidden = true; amt.textContent = ""; }
    });
    UI.$$("#r-nums button").forEach(function (b) {
      b.classList.toggle("picked", !!table["n" + b.dataset.n]);
    });
    var total = tableTotal(), spots = Object.keys(table).length;
    $("#r-total").textContent = total
      ? fmt(total) + " on " + spots + (spots === 1 ? " spot" : " spots")
      : "Nothing staked";
  }

  function clearTable() {
    table = {};
    chipOrder = [];
    drawTable();
  }

  $("#r-clear").addEventListener("click", clearTable);

  $("#r-undo").addEventListener("click", function () {
    if (!chipOrder.length) return;
    removeChip(chipOrder[chipOrder.length - 1]);
  });

  $("#r-spin").addEventListener("click", function () {
    var total = tableTotal();
    if (!total) return UI.toast("Put some chips on the table first");
    if (!stake(total)) return UI.toast("Not enough chips");

    var n = randInt(37);
    var pocket = $("#r-pocket");
    pocket.className = "pocket " + colorOf(n);
    pocket.textContent = String(n);

    // Every spot settles independently: one spin can pay some and lose others.
    var rows = [], won = 0;
    Object.keys(table).forEach(function (key) {
      var bet = table[key], hit = spotWins(key, n);
      var back = hit ? bet * (spotOdds(key) + 1) : 0;
      won += back;
      rows.push({ label: spotLabel(key), bet: bet, hit: hit, back: back });
    });
    payout(won);

    rows.sort(function (a, b) { return b.back - a.back || a.label.localeCompare(b.label); });
    var tb = el("tbody");
    rows.forEach(function (r) {
      tb.appendChild(el("tr", { class: r.hit ? "hit" : "miss" }, [
        el("td", { text: r.label }),
        el("td", { text: fmt(r.bet) + " staked" }),
        el("td", { text: r.hit ? "+" + fmt(r.back - r.bet) : "−" + fmt(r.bet) })
      ]));
    });
    $("#r-breakdown").textContent = "";
    $("#r-breakdown").appendChild(el("table", null, [tb]));

    var net = won - total;
    var res = $("#r-result");
    res.className = "result " + (net > 0 ? "win" : net < 0 ? "lose" : "push");
    res.textContent = n + " " + colorOf(n) + " — " +
      (net > 0 ? "up " + fmt(net) : net < 0 ? "down " + fmt(-net) : "even") +
      " on " + rows.length + (rows.length === 1 ? " bet" : " bets");

    // The chips stay where they were put, so repeating a layout is one click.
    drawTable();
  });

  /* ================= blackjack ================= */

  var RANKS = ["A","2","3","4","5","6","7","8","9","10","J","Q","K"];
  var SUITS = ["♠","♥","♦","♣"];
  var shoe = [];

  function newShoe() {
    shoe = [];
    for (var d = 0; d < 6; d++)
      for (var s = 0; s < SUITS.length; s++)
        for (var r = 0; r < RANKS.length; r++)
          shoe.push({ r: RANKS[r], s: SUITS[s] });
    // Fisher-Yates with the same rejection-sampled source as everything else
    for (var i = shoe.length - 1; i > 0; i--) {
      var j = randInt(i + 1);
      var t = shoe[i]; shoe[i] = shoe[j]; shoe[j] = t;
    }
  }

  function draw() {
    if (shoe.length < 60) newShoe();
    return shoe.pop();
  }

  // Aces count 11 until that would bust, then 1. Returning the soft flag lets
  // the dealer rule and the display be exact.
  function handValue(cards) {
    var total = 0, aces = 0;
    cards.forEach(function (c) {
      if (c.r === "A") { aces++; total += 11; }
      else if (c.r === "K" || c.r === "Q" || c.r === "J" || c.r === "10") total += 10;
      else total += +c.r;
    });
    var soft = false;
    while (total > 21 && aces > 0) { total -= 10; aces--; }
    if (aces > 0) soft = true;
    return { total: total, soft: soft, bust: total > 21 };
  }

  function isBlackjack(cards) {
    return cards.length === 2 && handValue(cards).total === 21;
  }

  var BJ = { bet: 0, player: [], dealer: [], live: false, doubled: false };

  function cardEl(c, hidden) {
    if (hidden) return el("div", { class: "card back", text: "x" });
    var red = c.s === "♥" || c.s === "♦";
    return el("div", { class: "card" + (red ? " red" : ""), text: c.r + c.s });
  }

  function drawBJ(revealDealer) {
    var d = $("#b-dealer"), p = $("#b-player");
    d.textContent = ""; p.textContent = "";
    BJ.dealer.forEach(function (c, i) {
      d.appendChild(cardEl(c, !revealDealer && i === 1));
    });
    BJ.player.forEach(function (c) { p.appendChild(cardEl(c)); });

    var pv = handValue(BJ.player);
    $("#b-ptotal").textContent = BJ.player.length
      ? (pv.soft ? "soft " : "") + pv.total + (pv.bust ? " — bust" : "") : "";
    if (revealDealer) {
      var dv = handValue(BJ.dealer);
      $("#b-dtotal").textContent = (dv.soft ? "soft " : "") + dv.total + (dv.bust ? " — bust" : "");
    } else {
      $("#b-dtotal").textContent = BJ.dealer.length ? "showing " + handValue([BJ.dealer[0]]).total : "";
    }
  }

  function bjButtons(live) {
    $("#b-hit").disabled = !live;
    $("#b-stand").disabled = !live;
    $("#b-double").disabled = !live || BJ.player.length !== 2 || B.chips < BJ.bet;
    $("#b-deal").disabled = live;
  }

  function settle(text, cls, credit) {
    BJ.live = false;
    bjButtons(false);
    payout(credit);
    var r = $("#b-result");
    r.className = "result " + cls;
    r.textContent = text;
    drawBJ(true);
  }

  $("#b-deal").addEventListener("click", function () {
    var bet = betOf("#b-bet");
    if (!bet) return UI.toast("Out of chips — use the free refill");
    if (!stake(bet)) return;
    BJ = { bet: bet, player: [draw(), draw()], dealer: [draw(), draw()], live: true, doubled: false };
    $("#b-result").textContent = "";
    $("#b-result").className = "result";
    drawBJ(false);
    bjButtons(true);

    var pbj = isBlackjack(BJ.player), dbj = isBlackjack(BJ.dealer);
    if (pbj || dbj) {
      if (pbj && dbj) settle("Both blackjack — push", "push", BJ.bet);
      // 3:2 rounded down, so the balance stays in whole chips
      else if (pbj) settle("Blackjack! Pays 3:2 — you won " + fmt(Math.floor(BJ.bet * 1.5)),
                           "win", BJ.bet + Math.floor(BJ.bet * 1.5));
      else settle("Dealer blackjack", "lose", 0);
    }
  });

  $("#b-hit").addEventListener("click", function () {
    if (!BJ.live) return;
    BJ.player.push(draw());
    drawBJ(false);
    bjButtons(true);
    if (handValue(BJ.player).bust) settle("Bust — lost " + fmt(BJ.bet * (BJ.doubled ? 2 : 1)), "lose", 0);
  });

  $("#b-double").addEventListener("click", function () {
    if (!BJ.live || BJ.player.length !== 2) return;
    if (!stake(BJ.bet)) return UI.toast("Not enough chips to double");
    BJ.doubled = true;
    BJ.player.push(draw());
    drawBJ(false);
    if (handValue(BJ.player).bust) return settle("Bust on the double — lost " + fmt(BJ.bet * 2), "lose", 0);
    dealerPlay();
  });

  $("#b-stand").addEventListener("click", dealerPlay);

  function dealerPlay() {
    if (!BJ.live) return;
    // Dealer stands on all 17s, soft ones included.
    while (handValue(BJ.dealer).total < 17) BJ.dealer.push(draw());

    var p = handValue(BJ.player), d = handValue(BJ.dealer);
    var wager = BJ.bet * (BJ.doubled ? 2 : 1);

    if (d.bust)
      settle("Dealer busts on " + d.total + " — you won " + fmt(wager), "win", wager * 2);
    else if (p.total > d.total)
      settle("Your " + p.total + " beats the dealer's " + d.total + " — you won " + fmt(wager),
             "win", wager * 2);
    else if (p.total < d.total)
      settle("Dealer's " + d.total + " beats your " + p.total + " — you lost " + fmt(wager),
             "lose", 0);
    else settle("Push on " + p.total + " — stake returned", "push", wager);
  }

  /* ================= start ================= */

  B = load();
  drawBank();
  drawPaytable();
  buildRoulette();
  newShoe();
  bjButtons(false);

  function fromHash(fallback) {
    var h = location.hash.replace("#", "");
    return GAMES.some(function (g) { return g[0] === h; }) ? h : fallback;
  }

  // Changing the hash on an already-loaded page does not re-run this script,
  // so without this the back button and pasted #anchors leave the wrong tab up.
  window.addEventListener("hashchange", function () { pickGame(fromHash("slots")); });

  pickGame(fromHash("slots"));

  // exposed only so the test harness can check the maths
  window.__casino = { slotRTP: slotRTP, slotPay: slotPay, handValue: handValue,
                      colorOf: colorOf, OUTSIDE: OUTSIDE, SYMBOLS: SYMBOLS,
                      spotWins: spotWins, spotOdds: spotOdds,
                      tableTotal: tableTotal, table: function () { return table; } };
})();
