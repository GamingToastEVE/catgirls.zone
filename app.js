/* catgirls.zone — studio UI */
(function () {
  "use strict";

  var stage = document.getElementById("stage");
  var input = document.getElementById("seed");
  var traitsEl = document.getElementById("traits");
  var gallery = document.getElementById("gallery");
  var toastEl = document.getElementById("toast");

  var NAMES = [
    "nyanpasu", "mikoto", "tabby", "sudo", "421", "espresso", "voidcat",
    "yuki", "bastet", "lain", "9lives", "purrl", "kuro", "shiro", "momo",
    "glitch", "matcha", "nekomata", "ada", "hex", "sable", "pixel"
  ];

  var toastTimer;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove("show"); }, 1800);
  }

  function render(seed) {
    stage.innerHTML = nyavatar(seed, { size: 512 });

    var t = nyavatar.traits(seed);
    var shown = [
      ["ears", t.ears], ["hair", t.hair], ["eyes", t.eyes], ["mouth", t.mouth]
    ];
    if (t.extra !== "none") shown.push(["extra", t.extra]);
    if (t.heterochromia) shown.push(["eyes", "heterochromia"]);
    if (t.freckles) shown.push(["skin", "freckles"]);

    traitsEl.innerHTML = shown.map(function (p) {
      return '<span class="chip">' + p[0] + " <b>" + p[1] + "</b></span>";
    }).join("");

    // Keep the URL shareable without spamming history.
    var url = new URL(location.href);
    url.searchParams.set("seed", seed);
    history.replaceState(null, "", url);

    document.title = seed + " — catgirls.zone";
  }

  function current() { return input.value || "catgirl"; }

  function randomSeed() {
    return NAMES[Math.floor(Math.random() * NAMES.length)] +
      (Math.random() < 0.4 ? "-" + Math.floor(Math.random() * 1000) : "");
  }

  /* ---- events ---- */

  input.addEventListener("input", function () { render(current()); });

  document.getElementById("randomize").addEventListener("click", function () {
    input.value = randomSeed();
    render(current());
  });

  document.getElementById("download").addEventListener("click", function () {
    var blob = new Blob([nyavatar(current(), { size: 512 })], { type: "image/svg+xml" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = current().replace(/[^a-z0-9_-]+/gi, "_") + ".svg";
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  });

  function copy(text, label) {
    var done = function () { toast(label + " copied"); };
    var fail = function () { toast("copy blocked — clipboard unavailable"); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, fail);
    } else {
      fail();
    }
  }

  document.getElementById("copy-uri").addEventListener("click", function () {
    copy(nyavatar.dataUri(current(), { size: 256 }), "Data URI");
  });

  document.getElementById("copy-link").addEventListener("click", function () {
    copy(location.href, "Link");
  });

  /* ---- gallery ---- */

  NAMES.forEach(function (name) {
    var fig = document.createElement("figure");
    fig.innerHTML = nyavatar(name, { size: 128 }) +
      "<figcaption>" + name + "</figcaption>";
    fig.addEventListener("click", function () {
      input.value = name;
      render(name);
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
    gallery.appendChild(fig);
  });

  /* ---- boot ---- */

  var fromUrl = new URLSearchParams(location.search).get("seed");
  if (fromUrl) input.value = fromUrl;
  render(current());
})();
