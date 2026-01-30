/*
  FlowForge LE — Settings View

  Purpose:
  - Config import/export/reset
  - Shows current config as read-only JSON
*/

(() => {
  "use strict";

  window.renderSettingsView = function renderSettingsView() {
    const html = `
      <div class="settingsWide">
        <div class="card">
          <div class="hd">
            <h2>Settings / Configuration</h2>
            <div class="rowActions">
              <button class="secondary" id="cfgLoadBtn">Config laden</button>
              <button class="secondary" id="cfgSaveBtn">Config speichern</button>
              <button class="danger" id="cfgResetBtn">Reset</button>
              <input type="file" id="cfgFileInput" accept="application/json" class="hidden" />
            </div>
          </div>

          <div class="bd">
            <div class="rowActions" style="justify-content:flex-end;margin-bottom:10px">
              <button id="cfgApplyBtn">Apply</button>
              
            </div>

            <label>Active configuration (JSON, read-only)</label>
            <textarea id="cfgPreview" readonly></textarea>

            <div class="hint small" style="margin-top:10px">
              Standard-Configurationsquelle: <code>conf/x4infra.default.json</code><br>
              Changes are stored in the browser (localStorage). Export triggers a download.
            </div>
          </div>
        </div>
      </div>
    `;

    const $view = $("#settingsView");
    $view.html(html);

    $("#cfgPreview").val(JSON.stringify(window.CFG, null, 2));

    $("#cfgLoadBtn").on("click", () => $("#cfgFileInput").click());

    $("#cfgFileInput").on("change", function () {
      const file = this.files && this.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = JSON.parse(reader.result);
          window.CFG = parsed;
          window.saveConfig();

          $("#cfgPreview").val(JSON.stringify(window.CFG, null, 2));
          window.setStatus("#cfgStatus", "Configuration geladen.", "ok");

          // refresh all
          [
            "renderInfraView",
            "renderServicesView",
            "renderServersView",
            "renderProvisioningView",
            "renderGeneratorView"
          ].forEach(fn => typeof window[fn] === "function" && window[fn]());
        } catch {
          window.setStatus("#cfgStatus", "Invalid JSON file.", "bad");
        }
      };
      reader.readAsText(file);
      this.value = "";
    });

    $("#cfgSaveBtn").on("click", () => {
      const content = JSON.stringify(window.CFG, null, 2);
      window.downloadFile("x4infra.config.json", content, "application/json");
      window.setStatus("#cfgStatus", "Configuration exportiert.", "ok");
    });

    $("#cfgApplyBtn").on("click", () => {
      window.saveConfig();
      window.setStatus("#cfgStatus", "Configuration applied.", "ok");
    });

    $("#cfgResetBtn").on("click", async () => {
      if (!confirm("Reset configuration?")) return;

      await window.resetConfig();
      $("#cfgPreview").val(JSON.stringify(window.CFG, null, 2));
      window.setStatus("#cfgStatus", "Configuration reset.", "warn");

      [
        "renderInfraView",
        "renderServicesView",
        "renderServersView",
        "renderProvisioningView",
        "renderGeneratorView"
      ].forEach(fn => typeof window[fn] === "function" && window[fn]());
    });
  };
})();
