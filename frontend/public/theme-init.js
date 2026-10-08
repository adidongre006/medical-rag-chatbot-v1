// Runs before first paint (loaded by next/script, strategy="beforeInteractive")
// so the chosen theme is applied without a flash. Kept as a static file so no
// inline script is needed.
(function () {
  try {
    var stored = localStorage.getItem("medical-chat:theme");
    var theme =
      stored === "light" || stored === "dark"
        ? stored
        : window.matchMedia("(prefers-color-scheme: light)").matches
          ? "light"
          : "dark";
    document.documentElement.dataset.theme = theme;
  } catch (e) {
    document.documentElement.dataset.theme = "dark";
  }
})();
