/* catgirls.zone/nyanifier — the live toy. */
(function () {
  "use strict";

  var $ = UI.$, el = UI.el;
  UI.boot("nyanifier");

  var level = 2;
  var inEl = $("#in"), outEl = $("#out");

  nyanify.levels.forEach(function (L) {
    var b = el("button", {
      "aria-pressed": String(L.level === level),
      "data-level": L.level,
      onclick: function () { level = L.level; sync(); }
    }, [
      el("b", { text: L.level + " · " + L.name }),
      el("span", { text: L.note })
    ]);
    $("#levels").appendChild(b);
  });

  function sync() {
    [].forEach.call($("#levels").children, function (b) {
      b.setAttribute("aria-pressed", String(+b.dataset.level === level));
    });
    var text = inEl.value;
    var out = nyanify(text, level);
    outEl.textContent = out;
    $("#stat").textContent = text.length + " in · " + out.length + " out";
  }

  inEl.addEventListener("input", sync);
  $("#copy").addEventListener("click", function () {
    UI.copy(outEl.textContent, "Output");
  });
  $("#swap").addEventListener("click", function () {
    inEl.value = outEl.textContent;
    sync();
  });

  sync();
})();
