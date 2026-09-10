/* catgirls.zone/when — find an hour that works across time zones.
 *
 * No server, no accounts: the whole meeting (date, anchor zone, participants)
 * is encoded in the URL, so sharing the link is the entire collaboration
 * model.
 */
(function () {
  "use strict";

  var $ = UI.$, el = UI.el;
  UI.boot("when");

  /* ---------- zone maths ----------
   *
   * Everything hangs off one primitive: how far a zone is from UTC at a given
   * instant. Intl gives us the wall clock in that zone; reading it back as if
   * it were UTC and subtracting yields the offset, DST included.
   */

  function zoneOffset(instant, tz) {
    var dtf = new Intl.DateTimeFormat("en-US", {
      timeZone: tz, hour12: false,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit"
    });
    var p = {};
    dtf.formatToParts(instant).forEach(function (part) { p[part.type] = part.value; });
    var asIfUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
    return asIfUtc - instant.getTime();
  }

  // Wall clock in a zone back to an instant. Two passes: the first guess uses
  // the offset at the wrong instant, the second uses the offset at the right
  // one. That converges everywhere except inside a DST gap, where the hour
  // does not exist and any answer is a convention.
  function zonedToUtc(y, mo, d, h, mi, tz) {
    var naive = Date.UTC(y, mo - 1, d, h, mi);
    var ts = naive - zoneOffset(new Date(naive), tz);
    return naive - zoneOffset(new Date(ts), tz);
  }

  function zoneParts(instant, tz) {
    var dtf = new Intl.DateTimeFormat("en-GB", {
      timeZone: tz, hour12: false, weekday: "short",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit"
    });
    var p = {};
    dtf.formatToParts(instant).forEach(function (part) { p[part.type] = part.value; });
    p.hourNum = +p.hour % 24;
    return p;
  }

  function offsetLabel(instant, tz) {
    var m = zoneOffset(instant, tz) / 60000;
    var sign = m < 0 ? "-" : "+";
    m = Math.abs(m);
    return "UTC" + sign + String(Math.floor(m / 60)).padStart(2, "0") +
      ":" + String(m % 60).padStart(2, "0");
  }

  function zoneList() {
    try {
      if (typeof Intl.supportedValuesOf === "function") return Intl.supportedValuesOf("timeZone");
    } catch (e) {}
    return ["Europe/Berlin", "Europe/London", "Europe/Lisbon", "Europe/Madrid",
      "Europe/Paris", "Europe/Rome", "Europe/Warsaw", "Europe/Athens",
      "Europe/Helsinki", "Europe/Moscow", "Europe/Istanbul", "Europe/Kyiv",
      "America/New_York", "America/Chicago", "America/Denver",
      "America/Los_Angeles", "America/Sao_Paulo", "America/Mexico_City",
      "America/Toronto", "America/Vancouver", "America/Bogota",
      "Africa/Lagos", "Africa/Cairo", "Africa/Nairobi", "Africa/Johannesburg",
      "Asia/Dubai", "Asia/Karachi", "Asia/Kolkata", "Asia/Bangkok",
      "Asia/Shanghai", "Asia/Singapore", "Asia/Tokyo", "Asia/Seoul",
      "Asia/Jerusalem", "Australia/Perth", "Australia/Sydney",
      "Pacific/Auckland", "Pacific/Honolulu", "UTC"];
  }

  var ZONES = zoneList();

  // Membership in ZONES is the wrong test for a zone from a URL: the list is
  // the canonical set, and plenty of live aliases (Asia/Calcutta vs
  // Asia/Kolkata, Europe/Kiev vs Europe/Kyiv) are not in it while still being
  // perfectly valid. Ask Intl instead.
  function knownZone(tz) {
    if (!tz) return false;
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: tz });
      return true;
    } catch (e) {
      return false;
    }
  }
  var LOCAL = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

  function zoneName(tz) { return tz.split("/").pop().replace(/_/g, " "); }

  /* ---------- state ---------- */

  var DAY_MS = 86400000;
  var state = {
    date: "",
    anchor: LOCAL,
    from: 9,
    to: 18,
    people: []       // [{ tz: "Asia/Tokyo", label: "" }]
  };

  function todayIn(tz) {
    var p = zoneParts(new Date(), tz);
    return p.year + "-" + p.month + "-" + p.day;
  }

  function defaults() {
    state.date = todayIn(LOCAL);
    var seed = ["Europe/Berlin", "America/New_York", "Asia/Tokyo"]
      .filter(function (z) { return z !== LOCAL && knownZone(z); });
    state.people = [{ tz: LOCAL, label: "" }].concat(
      seed.slice(0, 2).map(function (z) { return { tz: z, label: "" }; })
    );
  }

  function fromUrl() {
    var q = new URLSearchParams(location.search);
    var any = false;
    if (/^\d{4}-\d{2}-\d{2}$/.test(q.get("d") || "")) { state.date = q.get("d"); any = true; }
    if (knownZone(q.get("a"))) { state.anchor = q.get("a"); any = true; }
    if (q.get("h")) {
      var h = q.get("h").split("-");
      if (h.length === 2 && +h[0] >= 0 && +h[1] <= 24 && +h[0] < +h[1]) {
        state.from = +h[0]; state.to = +h[1]; any = true;
      }
    }
    var z = q.get("z");
    if (z) {
      var people = z.split(",").map(function (item) {
        var bits = item.split("|");
        return { tz: bits[0], label: decodeURIComponent(bits[1] || "") };
      }).filter(function (p) { return knownZone(p.tz); });
      if (people.length) { state.people = people; any = true; }
    }
    return any;
  }

  function syncUrl() {
    var url = new URL(location.href);
    url.search = "";
    url.searchParams.set("d", state.date);
    url.searchParams.set("a", state.anchor);
    url.searchParams.set("h", state.from + "-" + state.to);
    url.searchParams.set("z", state.people.map(function (p) {
      return p.tz + (p.label ? "|" + encodeURIComponent(p.label) : "");
    }).join(","));
    history.replaceState(null, "", url);
  }

  /* ---------- the grid ---------- */

  // 24 instants: each whole hour of the chosen day as it stands in the anchor
  // zone. A day is not always 24 hours long, but the anchor's wall clock is
  // what people actually agree on, so hours are what we show.
  function instants() {
    var d = state.date.split("-");
    var out = [];
    for (var h = 0; h < 24; h++) {
      out.push(new Date(zonedToUtc(+d[0], +d[1], +d[2], h, 0, state.anchor)));
    }
    return out;
  }

  function classify(hour) {
    if (hour >= state.from && hour < state.to) return "ok";
    if (hour >= 7 && hour < 22) return "meh";
    return "bad";
  }

  function render() {
    var when = instants();
    var head = el("tr", null, [el("th", { class: "who", text: "" })].concat(
      when.map(function (t) {
        var p = zoneParts(t, state.anchor);
        return el("th", { text: p.hour });
      })
    ));

    var body = state.people.map(function (person, idx) {
      var cells = when.map(function (t) {
        var p = zoneParts(t, person.tz);
        var a = zoneParts(t, state.anchor);
        var kind = classify(p.hourNum);
        var kids = [el("b", { text: p.hour + (p.minute === "00" ? "" : ":" + p.minute) })];
        // Mark the cells that fall on a different calendar day than the
        // anchor: that off-by-one is the mistake this whole page exists to
        // prevent.
        if (p.day !== a.day) {
          var ahead = zonedToUtc(+p.year, +p.month, +p.day, 0, 0, "UTC") >
                      zonedToUtc(+a.year, +a.month, +a.day, 0, 0, "UTC");
          kids.push(el("i", { text: ahead ? "+1" : "-1" }));
        }
        return el("td", {
          class: "slot " + kind,
          title: p.weekday + " " + p.day + "." + p.month + " " + p.hour + ":" + p.minute
        }, kids);
      });

      var name = person.label || zoneName(person.tz);
      var who = el("th", { class: "who" }, [
        el("b", { text: name }),
        el("span", { text: offsetLabel(when[12], person.tz) }),
        el("button", {
          class: "drop", title: "Remove", text: "×",
          onclick: function () {
            state.people.splice(idx, 1);
            if (!state.people.length) state.people.push({ tz: LOCAL, label: "" });
            update();
          }
        })
      ]);
      return el("tr", null, [who].concat(cells));
    });

    var grid = $("#grid");
    grid.textContent = "";
    grid.appendChild(el("table", { class: "when" }, [
      el("thead", null, [head]),
      el("tbody", null, body)
    ]));

    renderBest(when);
  }

  // Score every hour: an hour inside everybody's working window is the goal,
  // a merely-awake hour is a fallback, and anything else is disqualifying.
  function renderBest(when) {
    var scored = when.map(function (t, i) {
      var score = 0, worst = "ok";
      state.people.forEach(function (person) {
        var kind = classify(zoneParts(t, person.tz).hourNum);
        score += kind === "ok" ? 2 : kind === "meh" ? 1 : 0;
        if (kind === "bad") worst = "bad";
        else if (kind === "meh" && worst === "ok") worst = "meh";
      });
      return { i: i, t: t, score: score, worst: worst };
    });

    var best = scored.slice().sort(function (a, b) {
      return b.score - a.score || a.i - b.i;
    }).slice(0, 3).filter(function (s) { return s.score > 0; });

    var host = $("#best");
    host.textContent = "";

    if (!best.length || best[0].worst === "bad") {
      host.appendChild(el("p", { class: "small muted", text:
        "No hour lands inside everyone's window. The best compromises are listed anyway — " +
        "somebody is going to be up early." }));
    }

    best.forEach(function (s) {
      var lines = state.people.map(function (person) {
        var p = zoneParts(s.t, person.tz);
        return (person.label || zoneName(person.tz)) + " " + p.hour + ":" + p.minute +
          " " + p.weekday;
      }).join(" · ");
      var anchorP = zoneParts(s.t, state.anchor);
      host.appendChild(el("div", { class: "pick " + s.worst }, [
        el("b", { text: anchorP.hour + ":" + anchorP.minute + " " + zoneName(state.anchor) }),
        el("span", { class: "small muted", text: lines }),
        el("button", {
          text: "Copy",
          onclick: function () {
            UI.copy(state.date + " — " + lines + " (" + s.t.toISOString() + ")", "Slot");
          }
        })
      ]));
    });
  }

  /* ---------- controls ---------- */

  function fillZoneSelect(sel, value) {
    var list = ZONES.indexOf(value) >= 0 ? ZONES : [value].concat(ZONES);
    list.forEach(function (z) {
      sel.appendChild(el("option", { value: z, text: z.replace(/_/g, " ") }));
    });
    sel.value = value;
  }

  function renderAdd() {
    var sel = $("#add-zone");
    sel.textContent = "";
    fillZoneSelect(sel, LOCAL);
  }

  function shiftDay(n) {
    var d = state.date.split("-");
    var t = Date.UTC(+d[0], +d[1] - 1, +d[2]) + n * DAY_MS;
    state.date = new Date(t).toISOString().slice(0, 10);
    $("#date").value = state.date;
    update();
  }

  function update() {
    $("#hours").textContent = state.from + ":00 – " + state.to + ":00";
    render();
    syncUrl();
  }

  if (!fromUrl()) defaults();
  if (!state.date) state.date = todayIn(LOCAL);

  $("#date").value = state.date;
  fillZoneSelect($("#anchor"), state.anchor);
  renderAdd();
  $("#from").value = state.from;
  $("#to").value = state.to;

  $("#date").addEventListener("change", function () {
    if (this.value) { state.date = this.value; update(); }
  });
  $("#anchor").addEventListener("change", function () {
    state.anchor = this.value;
    update();
  });
  $("#prev").addEventListener("click", function () { shiftDay(-1); });
  $("#next").addEventListener("click", function () { shiftDay(1); });
  $("#today").addEventListener("click", function () {
    state.date = todayIn(LOCAL);
    $("#date").value = state.date;
    update();
  });

  ["#from", "#to"].forEach(function (s) {
    $(s).addEventListener("input", function () {
      var f = +$("#from").value, t = +$("#to").value;
      if (f < t) { state.from = f; state.to = t; update(); }
    });
  });

  $("#add").addEventListener("click", function () {
    var tz = $("#add-zone").value;
    var label = $("#add-label").value.trim();
    state.people.push({ tz: tz, label: label });
    $("#add-label").value = "";
    update();
  });

  $("#share").addEventListener("click", function () { UI.copy(location.href, "Link"); });

  update();

  window.__when = { zoneOffset: zoneOffset, zonedToUtc: zonedToUtc, state: state };
})();
