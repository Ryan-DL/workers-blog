/**
 * Theme toggle and view pings.
 *
 * The initial theme is already resolved by a tiny inline script in <head>
 * (see src/views/layout.ts) — it has to run before first paint, so it can't
 * live in this deferred file. This script only handles interaction afterwards.
 */

(function () {
  "use strict";

  var root = document.documentElement;
  var STORAGE_KEY = "theme";

  function stored() {
    try {
      var value = localStorage.getItem(STORAGE_KEY);
      return value === "light" || value === "dark" ? value : null;
    } catch (err) {
      // Private browsing or blocked storage: fall back to per-page state.
      return null;
    }
  }

  function apply(theme) {
    root.dataset.theme = theme;
    var button = document.querySelector(".theme-toggle");
    if (button) {
      button.setAttribute("aria-label", "Switch to " + (theme === "dark" ? "light" : "dark") + " theme");
      button.setAttribute("aria-pressed", String(theme === "dark"));
    }
  }

  apply(root.dataset.theme || "dark");

  document.addEventListener("click", function (event) {
    var button = event.target.closest(".theme-toggle");
    if (!button) return;

    var next = root.dataset.theme === "dark" ? "light" : "dark";
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch (err) {
      /* Choice won't persist, but the page still flips. */
    }
    apply(next);
  });

  // Follow the OS while the visitor hasn't made a choice of their own. Once
  // they have, their choice sticks and system changes are ignored.
  var query = window.matchMedia("(prefers-color-scheme: light)");
  var onSystemChange = function (event) {
    if (!stored()) apply(event.matches ? "light" : "dark");
  };
  if (query.addEventListener) query.addEventListener("change", onSystemChange);
  else if (query.addListener) query.addListener(onSystemChange);

  // --- View ping ----------------------------------------------------------
  // Fires only on published posts; the server rejects anything else anyway.
  var article = document.querySelector("[data-view-slug]");
  if (!article) return;

  fetch("/api/entries/" + encodeURIComponent(article.dataset.viewSlug) + "/views", {
    method: "POST",
  })
    .then(function (res) {
      return res.ok ? res.json() : null;
    })
    .then(function (data) {
      if (!data) return;
      var target = document.querySelector("[data-view-count]");
      if (target) target.textContent = data.views === 1 ? "1 view" : data.views + " views";
    })
    .catch(function () {
      /* A missing view count is not worth bothering the reader about. */
    });
})();
