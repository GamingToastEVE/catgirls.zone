/* catgirls.zone/wort — one puzzle a day, derived from the date. */
(function () {
  "use strict";

  var $ = UI.$, el = UI.el;
  UI.boot("word game");

  var WORDS = window.WORDS;
  var ROWS = 6, LEN = 5;
  var EPOCH = Date.UTC(2024, 0, 1);           // puzzle #0
  var STORE = "catgirls.wort.v1";

  /* ---------- which word is today's ---------- */

  function dayNumber() {
    // Local midnight, so the puzzle turns over at the player's midnight rather
    // than at some remote UTC moment in the middle of their evening.
    var now = new Date();
    var local = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.floor((local - EPOCH) / 86400000);
  }

  // The list is alphabetical, so walking it in order would hand out answers
  // alphabetically. Shuffle once with a fixed seed to break that up while
  // keeping the sequence identical for everybody.
  function shuffled() {
    var a = WORDS.slice(), seed = 0x9e3779b9;
    function rnd() {
      seed = (seed + 0x6d2b79f5) >>> 0;
      var t = seed;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rnd() * (i + 1));
      var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
    }
    return a;
  }

  var ORDER = shuffled();
  var DAY = dayNumber();
  var ANSWER = ORDER[((DAY % ORDER.length) + ORDER.length) % ORDER.length];
  var VALID = Object.create(null);
  WORDS.forEach(function (w) { VALID[w] = true; });

  /* ---------- state ---------- */

  var guesses = [], current = "", over = false;

  // Reading and writing are kept apart on purpose. An earlier version had
  // load() restore the in-memory guesses as a side effect, and save() call
  // load() first — so every save quietly rolled the last guess back.
  function read() {
    try { return JSON.parse(localStorage.getItem(STORE) || "{}"); }
    catch (e) { return {}; }
  }

  function write(s) {
    try { localStorage.setItem(STORE, JSON.stringify(s)); }
    catch (e) { /* private mode, or storage full — the game still plays */ }
  }

  function save(extra) {
    var s = read();
    s.day = DAY;
    s.guesses = guesses;
    Object.keys(extra || {}).forEach(function (k) { s[k] = extra[k]; });
    write(s);
  }

  function stats() {
    var s = read();
    return {
      played: s.played || 0,
      wins: s.wins || 0,
      streak: s.streak || 0,
      best: s.best || 0,
      lastWinDay: s.lastWinDay
    };
  }

  // Restore today's progress; on a new day drop the per-day fields but keep
  // the running totals, or yesterday's "recorded" flag would suppress today's.
  function restore() {
    var s = read();
    if (s.day === DAY && Array.isArray(s.guesses)) {
      guesses = s.guesses.filter(function (w) {
        return typeof w === "string" && w.length === LEN;
      }).slice(0, ROWS);
      return s;
    }
    if (s.day !== DAY) {
      delete s.guesses; delete s.recorded; delete s.won;
      s.day = DAY;
      write(s);
    }
    return s;
  }

  /* ---------- scoring ---------- */

  // Two passes, so a duplicate letter is only marked "near" if the answer
  // actually has a spare copy of it left over.
  function score(guess) {
    var out = new Array(LEN).fill("miss");
    var pool = {};
    for (var i = 0; i < LEN; i++) {
      if (guess[i] === ANSWER[i]) out[i] = "hit";
      else pool[ANSWER[i]] = (pool[ANSWER[i]] || 0) + 1;
    }
    for (i = 0; i < LEN; i++) {
      if (out[i] === "hit") continue;
      var c = guess[i];
      if (pool[c] > 0) { out[i] = "near"; pool[c]--; }
    }
    return out;
  }

  /* ---------- board ---------- */

  var board = $("#board"), cells = [];
  for (var r = 0; r < ROWS; r++) {
    var row = el("div", { class: "brow" });
    var line = [];
    for (var c = 0; c < LEN; c++) {
      var cell = el("div", { class: "cell" });
      row.appendChild(cell);
      line.push(cell);
    }
    cells.push(line);
    board.appendChild(row);
  }

  var KEYS = ["qwertyuiop", "asdfghjkl", "@zxcvbnm<"];
  var keyEls = {};
  KEYS.forEach(function (line) {
    var row = el("div", { class: "krow" });
    line.split("").forEach(function (ch) {
      var label = ch === "@" ? "enter" : ch === "<" ? "⌫" : ch;
      var b = el("button", {
        text: label,
        class: (ch === "@" || ch === "<") ? "wide" : "",
        "data-key": ch,
        onclick: function () { press(ch === "@" ? "Enter" : ch === "<" ? "Backspace" : ch); }
      });
      if (ch !== "@" && ch !== "<") keyEls[ch] = b;
      row.appendChild(b);
    });
    $("#keys").appendChild(row);
  });

  function paint() {
    for (var r = 0; r < ROWS; r++) {
      var word = guesses[r];
      var marks = word ? score(word) : null;
      for (var c = 0; c < LEN; c++) {
        var cell = cells[r][c];
        var ch = word ? word[c] : (r === guesses.length ? current[c] : "");
        cell.textContent = ch || "";
        cell.className = "cell" + (ch ? " filled" : "") + (marks ? " " + marks[c] : "");
      }
    }
    // keyboard colouring: best knowledge per letter wins
    var rank = { miss: 1, near: 2, hit: 3 }, best = {};
    guesses.forEach(function (w) {
      var m = score(w);
      for (var i = 0; i < LEN; i++) {
        if (!best[w[i]] || rank[m[i]] > rank[best[w[i]]]) best[w[i]] = m[i];
      }
    });
    Object.keys(keyEls).forEach(function (k) {
      keyEls[k].className = best[k] || "";
    });
  }

  var msgTimer;
  function say(text, shake) {
    $("#msg").textContent = text;
    clearTimeout(msgTimer);
    if (text) msgTimer = setTimeout(function () { $("#msg").textContent = ""; }, 2200);
    if (shake) {
      var row = cells[guesses.length];
      if (row) {
        row.forEach(function (c) { c.classList.add("shake"); });
        setTimeout(function () {
          row.forEach(function (c) { c.classList.remove("shake"); });
        }, 420);
      }
    }
  }

  /* ---------- input ---------- */

  function press(key) {
    if (over) return;
    if (key === "Enter") return submit();
    if (key === "Backspace") { current = current.slice(0, -1); return paint(); }
    if (!/^[a-z]$/.test(key)) return;
    if (current.length >= LEN) return;
    current += key;
    paint();
    var cell = cells[guesses.length] && cells[guesses.length][current.length - 1];
    if (cell) {
      cell.classList.add("pop");
      setTimeout(function () { cell.classList.remove("pop"); }, 120);
    }
  }

  function submit() {
    if (current.length < LEN) return say("Not enough letters", true);
    if (!VALID[current]) return say("Not in the word list", true);
    guesses.push(current);
    var won = current === ANSWER;
    current = "";
    paint();
    if (won || guesses.length === ROWS) finish(won);
    else save();
  }

  document.addEventListener("keydown", function (e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (/^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return;
    if (e.key === "Enter" || e.key === "Backspace") { e.preventDefault(); press(e.key); }
    else if (/^[a-zA-Z]$/.test(e.key)) press(e.key.toLowerCase());
  });

  /* ---------- finishing ---------- */

  function emojiGrid() {
    return guesses.map(function (w) {
      return score(w).map(function (m) {
        return m === "hit" ? "🟩" : m === "near" ? "🟨" : "⬛";
      }).join("");
    }).join("\n");
  }

  function finish(won, restoring) {
    over = true;

    if (!restoring) {
      var s = stats();
      var recorded = read().recorded;
      if (!recorded) {
        var continued = s.lastWinDay === DAY - 1;
        var streak = won ? (continued ? s.streak + 1 : 1) : 0;
        save({
          played: s.played + 1,
          wins: s.wins + (won ? 1 : 0),
          streak: streak,
          best: Math.max(s.best, streak),
          lastWinDay: won ? DAY : s.lastWinDay,
          recorded: true,
          won: won
        });
      }
    }

    say(won
      ? ["Nailed it.", "Sharp.", "Clean.", "Nice one.", "Got there.", "Phew."][guesses.length - 1]
      : "It was " + ANSWER.toUpperCase());

    var st = stats();
    $("#done").hidden = false;
    $("#share-grid").textContent = emojiGrid();
    $("#stats").textContent = "";
    [["played", st.played], ["won", st.wins], ["streak", st.streak], ["best", st.best]]
      .forEach(function (p) {
        $("#stats").appendChild(el("div", { class: "stat" }, [
          el("b", { text: String(p[1]) }),
          el("span", { text: p[0] })
        ]));
      });

    var tick = function () {
      var now = new Date();
      var next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      var s = Math.max(0, Math.floor((next - now) / 1000));
      var hh = String(Math.floor(s / 3600)).padStart(2, "0");
      var mm = String(Math.floor(s / 60) % 60).padStart(2, "0");
      var ss = String(s % 60).padStart(2, "0");
      $("#next").textContent = "Next word in " + hh + ":" + mm + ":" + ss;
    };
    tick();
    setInterval(tick, 1000);
  }

  $("#share").addEventListener("click", function () {
    var text = "catgirls.zone/wort #" + DAY + "  " +
      (guesses[guesses.length - 1] === ANSWER ? guesses.length : "X") + "/" + ROWS +
      "\n\n" + emojiGrid() + "\n\nhttps://catgirls.zone/wort/";
    UI.copy(text, "Result");
  });

  /* ---------- restore ---------- */

  (function start() {
    restore();
    paint();
    var last = guesses[guesses.length - 1];
    if (guesses.length && (last === ANSWER || guesses.length === ROWS)) {
      finish(last === ANSWER, true);
    }
  })();
})();
