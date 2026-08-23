/**
 * Theme toggle.
 *
 * The initial theme is already resolved by a tiny inline script in <head>
 * (see src/views/layout.ts) — it has to run before first paint, so it can't
 * live in this deferred file. This script only handles interaction afterwards.
 */

(function () {
  "use strict";

  var root = document.documentElement;
  var STORAGE_KEY = "theme";

  function apply(theme) {
    root.dataset.theme = theme;
    // A data attribute, not a class: the button's classes are Tailwind
    // utilities and change whenever it's restyled.
    var button = document.querySelector("[data-theme-toggle]");
    if (button) {
      button.setAttribute("aria-label", "Switch to " + (theme === "dark" ? "light" : "dark") + " theme");
      button.setAttribute("aria-pressed", String(theme === "dark"));
    }
  }

  apply(root.dataset.theme || "dark");

  document.addEventListener("click", function (event) {
    var button = event.target.closest("[data-theme-toggle]");
    if (!button) return;

    var next = root.dataset.theme === "dark" ? "light" : "dark";
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch (err) {
      /* Choice won't persist, but the page still flips. */
    }
    apply(next);
  });
})();
