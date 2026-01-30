/*
  X4Infra Manager — Application Bootstrap
*/

(() => {
  "use strict";

  function renderAllViews() {
    const fns = [
      "renderGeneratorView",
      "renderProvisioningView",
      "renderServersView",
      "renderServicesView",
      "renderInfraView",
      "renderSettingsView"
    ];

    fns.forEach(fn => {
      if (typeof window[fn] === "function") {
        try { window[fn](); } catch (e) { console.error("[X4Infra] Render failed:", fn, e); }
      }
    });
  }

  async function startApp() {
    await window.initConfig();
    renderAllViews();

    // Ensure an initial view is visible even if some views rendered hidden.
    const initial = $(".tabbtn.active").data("view") || "generatorView";
    if (typeof window.switchView === "function") {
      window.switchView(initial);
    }
  }

  $(document).ready(() => {
    startApp().catch(err => {
      console.error("[X4Infra] Application startup failed.", err);
    });
  });
})();
