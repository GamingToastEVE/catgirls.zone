/* Tiny shared helpers: DOM lookup, clipboard with feedback, header markup. */
(function (w) {
  "use strict";

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return [].slice.call((root || document).querySelectorAll(sel)); }

  function el(tag, attrs, kids) {
    var e = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === "class") e.className = attrs[k];
        else if (k === "text") e.textContent = attrs[k];
        else if (k.slice(0, 2) === "on") e.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] != null) e.setAttribute(k, attrs[k]);
      });
    }
    (kids || []).forEach(function (c) {
      e.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
    return e;
  }

  var toastEl, toastTimer;
  function toast(msg) {
    if (!toastEl) {
      toastEl = el("div", { class: "toast" });
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove("show"); }, 1600);
  }

  // navigator.clipboard needs a secure context and can be blocked outright, so
  // fall back to a hidden textarea before giving up.
  function copy(text, label) {
    function ok() { toast((label || "Copied") + " ✓"); }
    function fallback() {
      try {
        var ta = el("textarea", { style: "position:fixed;opacity:0;top:0" });
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        var done = document.execCommand("copy");
        document.body.removeChild(ta);
        done ? ok() : toast("Copy blocked by the browser");
      } catch (e) {
        toast("Copy blocked by the browser");
      }
    }
    if (w.navigator.clipboard && w.navigator.clipboard.writeText) {
      w.navigator.clipboard.writeText(text).then(ok, fallback);
    } else {
      fallback();
    }
  }

  var PAGES = [
    ["/tools/", "tools"],
    ["/wort/", "word game"],
    ["/kaomoji/", "kaomoji"],
    ["/nyanifier/", "nyanifier"],
    ["/cafe/", "café"]
  ];

  // One header everywhere, marking the current section.
  function header(current) {
    var nav = el("nav", null, PAGES.map(function (p) {
      var a = el("a", { href: p[0], text: p[1] });
      if (p[1] === current) a.setAttribute("aria-current", "page");
      return a;
    }));
    return el("header", { class: "site-head" }, [
      el("a", { class: "home", href: "/", text: "catgirls.zone" }),
      nav
    ]);
  }

  function mountHeader(current) {
    var host = $("#site-head");
    if (host) host.replaceWith(header(current));
  }

  function footer() {
    return el("footer", { class: "site-foot" }, [
      el("span", { text: "Everything here runs in your browser. No accounts, no tracking, no uploads. " }),
      el("a", { href: "https://github.com/GamingToastEVE/catgirls.zone", text: "Source" }),
      el("span", { text: " · public domain (CC0)" })
    ]);
  }

  function mountFooter() {
    var host = $("#site-foot");
    if (host) host.replaceWith(footer());
  }

  function boot(current) {
    mountHeader(current);
    mountFooter();
  }

  w.UI = { $: $, $$: $$, el: el, toast: toast, copy: copy, boot: boot, PAGES: PAGES };
})(window);
