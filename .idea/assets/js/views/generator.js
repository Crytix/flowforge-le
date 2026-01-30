/*
  X4Infra Manager — Firewall & Routen

  Generates:
  - Bidirectional host-based firewall rules (nftables oriented)
  - Forward + reverse routing entries
  - Persists into Servers: server.routes[] and server.firewallRules[]

  UI rules (2026-01-30):
  - Environment: dropdown
  - Source/Target: slider (Server/VLAN) + dropdown filtered by env
  - Route via: required; if only one route-via VLAN is available it is auto-selected
  - Firewall "suggestions" toggle removed (rules are always generated)
  - Services: 1..N, added via modal; overview table shows Service/Proto/Ports (no comments)
*/

(() => {
  "use strict";

  const GEN_STATE = {
    services: [] // {serviceName, proto, ports, comment}
  };

  window.renderGeneratorView = function renderGeneratorView() {
    const $view = $("#generatorView");

    const prereq = checkPrerequisites();
    const isBlocked = !prereq.ok;

    const envOptions = (window.CFG.envs || []).map(e => {
      const label = `${e.name || e.tag} (${e.tag})`;
      return `<option value="${window.x4EscapeAttr(e.tag)}">${window.x4EscapeHtml(label)}</option>`;
    }).join("");

    const html = `
      <div class="blockedWrap">
      <div class="grid">
        <div class="card">
          <div class="hd">
            <h2>Firewall & Routen</h2>
            <div class="hint">Erzeugt Firewall-Regeln + Hin- und Rück-Routen und speichert sie in den Server-Items.</div>
          </div>

          <div class="bd">

            <div class="two" style="margin-bottom:10px">
  <div>
    <label class="req" for="genEnv">Umgebung</label>
    <select id="genEnv" required data-x4-label="Umgebung">${envOptions}</select>
  </div>
  <div>
    <label>&nbsp;</label>
    <label class="x4CheckRow" style="margin:0; display:flex; align-items:center; gap:8px;">
      <input type="checkbox" id="genBidir" />
      <span>Firewall-Regeln bidirektional</span>
    </label>
    <div class="hint small">Standard: aus (nur Quelle → Ziel).</div>
  </div>
</div>

            <div class="sectionTtl">Quelle</div>
            <div class="two" style="margin-bottom:10px">
              <div>
                <label class="req">Typ</label>
                <input id="genSrcType" type="hidden" value="server" />
                <div class="x4TypeSlider" data-for="genSrcType" data-active="server">
                  <button type="button" class="on" data-val="server">Server</button>
                  <button type="button" class="off" data-val="vlan">VLAN</button>
                </div>
              </div>
              <div>
                <label class="req" for="genSrc">Quelle</label>
                <select id="genSrc" required data-x4-label="Quelle"></select>
              </div>
            </div>

            <div class="sectionTtl">Ziel</div>
            <div class="two" style="margin-bottom:10px">
              <div>
                <label class="req">Typ</label>
                <input id="genDstType" type="hidden" value="server" />
                <div class="x4TypeSlider" data-for="genDstType" data-active="server">
                  <button type="button" class="on" data-val="server">Server</button>
                  <button type="button" class="off" data-val="vlan">VLAN</button>
                </div>
              </div>
              <div>
                <label class="req" for="genDst">Ziel</label>
                <select id="genDst" required data-x4-label="Ziel"></select>
              </div>
            </div>

            <div class="two" style="margin-bottom:10px">
              <div>
                <label class="req" for="genViaVlan">Route via (VLAN)</label>
                <select id="genViaVlan" required data-x4-label="Route via"></select>
                <div class="hint small">Nur VLANs der Umgebung, die in den Firewall-Zonen verfügbar sind.</div>
              </div>
              <div>
                <label class="req" for="genMetric">Route metric</label>
                <input id="genMetric" required data-x4-label="Route metric" type="number" value="100" />
              </div>
            </div>

            <div class="sectionTtl" style="display:flex;align-items:center;justify-content:space-between">
              <span>Service</span>
              <button type="button" class="secondary" id="genAddServiceBtn">+Service</button>
            </div>

            <div class="tableWrap" style="margin-bottom:10px">
              <table class="tbl" id="genSvcTable">
                <thead>
                  <tr>
                    <th>Service</th>
                    <th style="width:140px">Proto</th>
                    <th style="width:200px">Ports</th>
                    <th style="width:90px" class="right">Aktion</th>
                  </tr>
                </thead>
                <tbody>
                  <tr><td colspan="4" class="muted">Noch keine Services gewählt.</td></tr>
                </tbody>
              </table>
            </div>

            <div class="rowActions" style="justify-content:flex-end">
              <button id="genRunBtn" ${isBlocked ? "disabled" : ""}>Generieren</button>
            </div>

          </div>
        </div>

        <div class="card">
          <div class="hd">
            <h2>Output</h2>
            <div class="hint">Routen + Firewall Regeln</div>
          </div>
          <div class="bd">
            <div class="hint">Routing (inkl. Rückroute)</div>
            <div class="x4CodeBox">
              <a class="x4CodeCopy" href="#" data-copy-for="genOutRoutes" style="display:none">Code kopieren</a>
              <textarea id="genOutRoutes" readonly style="min-height:180px"></textarea>
            </div>
            <div class="hint" style="margin-top:10px">Firewall</div>
            <div class="x4CodeBox">
              <a class="x4CodeCopy" href="#" data-copy-for="genOutFw" style="display:none">Code kopieren</a>
              <textarea id="genOutFw" readonly style="min-height:180px"></textarea>
            </div>

            <div class="rowActions" style="justify-content:flex-end; margin-top:10px">
              <button class="secondary" id="genCsvBtn" disabled>CSV</button>
              <button class="secondary" id="genApplyBtn" disabled>In Server speichern</button>
            </div>
          </div>
        </div>
      </div>
      ${isBlocked ? renderBlockedOverlay(prereq.msg) : ""}
      </div>
    `;

    $view.html(html);

    // required UI markers (labels *)
    window.x4ApplyRequiredUI?.("#generatorView");

    GEN_STATE.services = [];
    refreshEndpointSelectors();
    refreshViaVlanOptions();
    renderServiceTable();
    bindGeneratorEvents();
  };

  function checkPrerequisites() {
    const cfg = window.CFG || {};
    const missing = [];

    if (!Array.isArray(cfg.envs) || !cfg.envs.length) missing.push("Umgebungen");
    if (!Array.isArray(cfg.zones) || !cfg.zones.length) missing.push("Zonen");
    if (!Array.isArray(cfg.vlans) || !cfg.vlans.length) missing.push("Netzwerke/VLANs");
    if (!Array.isArray(cfg.services) || !cfg.services.length) missing.push("Services");
    if (!Array.isArray(cfg.servers) || !cfg.servers.length) missing.push("Server");

    const badServers = (cfg.servers || []).filter(s => !(s && s.name && s.octet && Array.isArray(s.envs) && s.envs.length && Array.isArray(s.vlans) && s.vlans.length));
    if (badServers.length) missing.push("Server-Konfiguration (Name/Oktett/Umgebung/VLAN)");

    const ok = missing.length === 0;
    return {
      ok,
      msg: ok ? "" : `Generator ist erst nutzbar, wenn die Vorbedingungen erfüllt sind: ${missing.join(", ")}.`
    };
  }

  function renderBlockedOverlay(text) {
    return window.renderBlockedOverlay ? window.renderBlockedOverlay(text) : `
      <div class="blockedOverlay" aria-hidden="true">
        <div class="blockedMsg">
          <div class="ttl">Bereich gesperrt</div>
          <div class="txt">${window.x4EscapeHtml(text || "")}</div>
        </div>
      </div>
    `;
  }

  function getSelectedEnvTag() {
    return ($("#genEnv").val() || "").trim();
  }

  function setSelectedEnvTag(tag) {
    $("#genEnv").val(tag);
  }
function getEndpointType(which) {
    return ($(`#gen${which}Type`).val() || "server").trim();
  }

  function setEndpointType(which, v) {
    $(`#gen${which}Type`).val(v);
    const $sw = $(`.x4TypeSlider[data-for='gen${which}Type']`);
    $sw.attr('data-active', v);
    $sw.find("button").each(function () {
      const on = $(this).attr("data-val") === v;
      $(this).toggleClass("on", on).toggleClass("off", !on);
    });
  }

  function bindGeneratorEvents() {
    // Environment select
    $("#genEnv").off("change").on("change", function () {
      refreshEndpointSelectors();
      refreshViaVlanOptions();
    });
      // Segmented sliders
    $("#generatorView").off("click.genSwitch").on("click.genSwitch", ".x4TypeSlider button", function () {
      const $btn = $(this);
      const val = $btn.attr("data-val");
      const $sw = $btn.closest(".x4TypeSlider");
      const forId = $sw.attr("data-for");
      if (!forId) return;
      $("#" + forId).val(val);

      $sw.attr('data-active', val);

      // update visual
      $btn.siblings("button").removeClass("on").addClass("off");
      $btn.removeClass("off").addClass("on");

      refreshEndpointSelectors();
    });

    // Required validation cleanup as user interacts
    $("#generatorView").on("change input", "select[required],input[required]", function () {
      $(this).removeClass("is-invalid");
      $(this).closest(".field").find(".fieldHint").remove();
    });

    // +Service
    $("#genAddServiceBtn").on("click", () => openAddServiceModal());

    // Remove service row
    $("#genSvcTable").on("click", "[data-del='1']", function () {
      const idx = parseInt($(this).attr("data-idx"), 10);
      if (!Number.isFinite(idx)) return;
      GEN_STATE.services.splice(idx, 1);
      renderServiceTable();
      updateGeneratedState();
      window.toast?.info("Service entfernt.");
    });

    // Output copy links
    $("#generatorView").on("click", ".x4CodeCopy", async (e) => {
      e.preventDefault();
      const id = $(e.currentTarget).attr("data-copy-for");
      const txt = ($(`#${id}`).val() || "").trim();
      if (!txt) return;
      try {
        await navigator.clipboard.writeText(txt);
        window.toast?.info("Code kopiert.");
      } catch {
        window.toast?.critical("Kopieren nicht möglich (Browser Rechte).");
      }
    });

    // Generate
    $("#genRunBtn").on("click", () => {
      const err = validateGeneratorInput();
      if (err) {
        window.toast?.critical(err);
        return;
      }

      const result = generateArtifacts();
      if (result && result.error) {
        window.toast?.critical(String(result.error));
        return;
      }

      $("#genOutRoutes").val(result.routesText);
      $("#genOutFw").val(result.fwText);
      window.__X4INFRA_GEN_LAST__ = result;
      window.__X4INFRA_CSV__ = result.csv;
      updateGeneratedState();
      window.toast?.info("Output erzeugt.");
    });

    // Apply
    $("#genApplyBtn").on("click", () => {
      const env = getSelectedEnvTag();
      if (!env) return window.toast?.critical("Umgebung muss gewählt werden.");

      const result = window.__X4INFRA_GEN_LAST__;
      if (!result || (!result.routesByServer && !result.fwByServer)) {
        return window.toast?.warning("Bitte zuerst generieren.");
      }

      const applied = applyArtifactsToServers(result.routesByServer, result.fwByServer);
      if (!applied.ok) return window.toast?.critical(applied.msg || "Konnte nicht speichern.");

      window.saveConfig();
      if (typeof window.renderServersView === "function") {
        try { window.renderServersView(); } catch (e) {}
      }
      window.toast?.info(applied.msg);
    });

    // CSV
    $("#genCsvBtn").on("click", () => {
      const csv = window.__X4INFRA_CSV__;
      if (!csv) return window.toast?.warning("Bitte zuerst generieren.");
      window.downloadFile("x4infra.generator.csv", csv, "text/csv;charset=utf-8");
      window.toast?.info("CSV exportiert.");
    });

    // keep copy link visibility in sync
    $("#genOutRoutes, #genOutFw").on("input", updateGeneratedState);

    // Set initial env to first (best UX) but keep required semantics
    const envTags = (window.CFG.envs || []).map(e => e.tag);
    if (envTags.length && !getSelectedEnvTag()) {
      setSelectedEnvTag(envTags[0]);
      refreshEndpointSelectors();
      refreshViaVlanOptions();
    }

    // Ensure route via required: auto select if only one option
    autoSelectSingleViaVlan();
    updateGeneratedState();
  }

  function refreshEndpointSelectors() {
    const env = getSelectedEnvTag();

    const srcType = getEndpointType("Src");
    const dstType = getEndpointType("Dst");

    const servers = filterServersByEnv(env);
    const vlans = filterVlansByEnv(env);

    $("#genSrc").html(makeOptions(srcType === "server" ? servers : vlans));
    $("#genDst").html(makeOptions(dstType === "server" ? servers : vlans));
  }

  function filterServersByEnv(envTag) {
    const all = window.CFG.servers || [];
    if (!envTag) return [];
    return all.filter(s => (s.envs || []).includes(envTag)).map(s => s.name).sort();
  }

  function filterVlansByEnv(envTag) {
    const all = window.CFG.vlans || [];
    if (!envTag) return [];
    return all
      .filter(v => (v.scopes || []).some(s => s.envTag === envTag))
      .map(v => v.name)
      .sort();
  }

  function makeOptions(list) {
    if (!list.length) return `<option value="">(leer)</option>`;
    return list.map(x => `<option value="${window.escapeAttr(x)}">${window.escapeHtml(x)}</option>`).join("");
  }

  // Route via options must only offer VLANs that are in env and are in zones connected by Firewall
  function refreshViaVlanOptions() {
    const envTag = getSelectedEnvTag();
    const names = getFirewalledVlanNamesInEnv(envTag);

    const opts = names.map(n => `<option value="${window.escapeAttr(n)}">${window.escapeHtml(n)}</option>`);
    $("#genViaVlan").html(opts.join(""));

    autoSelectSingleViaVlan();
  }

  function autoSelectSingleViaVlan() {
    const $sel = $("#genViaVlan");
    const count = $sel.find("option").length;
    if (count === 1) {
      const v = $sel.find("option").first().attr("value");
      $sel.val(v);
    }
  }

  function getFirewalledVlanNamesInEnv(envTag) {
    const vlans = window.CFG.vlans || [];
    if (!envTag) return [];

    // Determine zones covered by firewalls for env
    const fwScopes = (window.CFG.firewalls || []).flatMap(f => (f.scopes || []));
    const zonesInFw = new Set(
      fwScopes
        .filter(s => s && s.envTag === envTag && s.zoneTag)
        .map(s => s.zoneTag)
    );

    // If no firewall scopes defined, fallback: all VLANs in env
    if (zonesInFw.size === 0) {
      return vlans
        .filter(v => (v.scopes || []).some(s => s.envTag === envTag))
        .map(v => v.name)
        .sort();
    }

    // Filter VLANs whose scopes include env + a zone connected by firewall
    return vlans
      .filter(v => (v.scopes || []).some(s => s.envTag === envTag && zonesInFw.has(s.zoneTag)))
      .map(v => v.name)
      .sort();
  }

  function renderServiceTable() {
    const $tb = $("#genSvcTable tbody");
    if (!$tb.length) return;

    if (!GEN_STATE.services.length) {
      $tb.html(`<tr><td colspan="4" class="muted">Noch keine Services gewählt.</td></tr>`);
      return;
    }

    const rows = GEN_STATE.services.map((x, idx) => {
      const protoUp = String(x.proto || "").toUpperCase();
      const ports = String(x.ports || "");
      return `
        <tr>
          <td>${window.escapeHtml(x.serviceName || "")}</td>
          <td>${window.escapeHtml(protoUp)}</td>
          <td>${window.escapeHtml(ports)}</td>
          <td class="right">
            <button class="iconBtn" title="Löschen" data-del="1" data-idx="${idx}">
              <i class="fa-solid fa-trash"></i>
            </button>
          </td>
        </tr>
      `;
    }).join("");

    $tb.html(rows);
  }

  function openAddServiceModal() {
    const svcs = window.CFG.services || [];
    if (!svcs.length) return window.toast?.critical("Keine Services vorhanden.");

    const svcOptions = svcs.map(s => `<option value="${window.escapeAttr(s.name)}">${window.escapeHtml(s.name)}</option>`).join("");

    const body = `
      <div class="two" style="margin-bottom:10px">
        <div>
          <label class="req" for="mGenSvc">Service</label>
          <select id="mGenSvc" required data-x4-label="Service">${svcOptions}</select>
        </div>
        <div>
          <label class="req" for="mGenPort">Port/Proto</label>
          <select id="mGenPort" required data-x4-label="Port/Proto"></select>
        </div>
      </div>
      <div class="hint small">Kommentare werden nicht angezeigt, aber im Output genutzt.</div>
    `;

    window.X4Modal.open({
      title: "Service hinzufügen",
      bodyHtml: body,
      onOpen: () => {
        const fillPorts = () => {
          const name = $("#mGenSvc").val();
          const svc = (window.CFG.services || []).find(s => s.name === name);
          if (!svc) return $("#mGenPort").html("<option value=''> (leer)</option>");

          const items = (svc.portItems && Array.isArray(svc.portItems) && svc.portItems.length)
            ? svc.portItems
            : [{ proto: svc.proto || "TCP", value: svc.ports || "" }];

          const opts = items.map((it, idx) => {
            const p = String(it.proto || "TCP").toUpperCase();
            const v = String(it.value || "").trim();
            const label = `${p}: ${v || "(leer)"}`;
            return `<option value="${idx}">${window.escapeHtml(label)}</option>`;
          }).join("");

          $("#mGenPort").html(opts);
        };

        $("#mGenSvc").on("change", fillPorts);
        fillPorts();
      },
      onSave: () => {
        if (!window.x4ValidateRequired?.("#x4ModalBack")) {
          return { ok: false, msg: "Bitte Pflichtfelder ausfüllen." };
        }

        const name = $("#mGenSvc").val();
        const svc = (window.CFG.services || []).find(s => s.name === name);
        if (!svc) return { ok: false, msg: "Service nicht gefunden." };

        const idx = parseInt($("#mGenPort").val(), 10) || 0;
        const items = (svc.portItems && Array.isArray(svc.portItems) && svc.portItems.length)
          ? svc.portItems
          : [{ proto: svc.proto || "TCP", value: svc.ports || "" }];

        const it = items[Math.max(0, Math.min(idx, items.length - 1))] || {};
        const proto = normalizeProtoLower(it.proto || "tcp");
        const ports = String(it.value || "").trim();
        const comment = svc.comment ? `${svc.name} — ${svc.comment}` : svc.name;

        GEN_STATE.services.push({ serviceName: svc.name, proto: proto || "tcp", ports, comment });
        renderServiceTable();
        updateGeneratedState();
        window.toast?.info("Service hinzugefügt.");
        return { ok: true };
      }
    });
  }

  function updateGeneratedState() {
    const hasRoutes = !!($("#genOutRoutes").val() || "").trim();
    const hasFw = !!($("#genOutFw").val() || "").trim();
    const hasOutput = hasRoutes || hasFw;

    $("#genCsvBtn").prop("disabled", !hasOutput);
    $("#genApplyBtn").prop("disabled", !hasOutput);

    $(".x4CodeCopy[data-copy-for='genOutRoutes']").toggle(hasRoutes);
    $(".x4CodeCopy[data-copy-for='genOutFw']").toggle(hasFw);
  }

  function validateGeneratorInput() {
    // validate required UI
    if (!window.x4ValidateRequired?.("#generatorView")) {
      return "Bitte Pflichtfelder ausfüllen.";
    }

    const env = getSelectedEnvTag();
    if (!env) return "Umgebung muss gewählt werden.";

    const srcVal = $("#genSrc").val();
    const dstVal = $("#genDst").val();
    if (!srcVal || !dstVal) return "Quelle und Ziel müssen gewählt werden.";

    const via = $("#genViaVlan").val();
    if (!via) return "Route via muss gewählt werden.";

    if (!GEN_STATE.services.length) return "Mindestens ein Service muss hinzugefügt werden.";

    return "";
  }

  function generateArtifacts() {
    const env = getSelectedEnvTag();

    const srcType = getEndpointType("Src");
    const srcVal = $("#genSrc").val();

    const dstType = getEndpointType("Dst");
    const dstVal = $("#genDst").val();

    const metric = parseInt($("#genMetric").val(), 10) || 100;
    const viaVlan = ($("#genViaVlan").val() || "").trim();

    const src = resolveEndpoint(srcType, srcVal, env);
    const dst = resolveEndpoint(dstType, dstVal, env);

    if (!src || !dst) return { error: "Quelle/Ziel konnte nicht aufgelöst werden." };

    // Routes are independent from service list
    const routesByServer = buildRoutesWithReverse(src, dst, env, metric, viaVlan, "");
    const routesText = formatRoutes(routesByServer, env);

    // Firewall rules per selected service port item, bidirectional
    const bidir = !!$("#genBidir").prop("checked");
    const fwByServer = bidir
      ? buildFirewallForServicesBidirectional(src, dst, env, GEN_STATE.services, viaVlan)
      : buildFirewallForServicesForward(src, dst, env, GEN_STATE.services, viaVlan);
        const fwText = formatFirewallRules(fwByServer, env, bidir);

    const csv = buildCsv(routesByServer, env, srcType, srcVal, dstType, dstVal);
    return { routesText, fwText, csv, routesByServer, fwByServer };
  }

  function applyArtifactsToServers(routesByServer, fwByServer) {
    const servers = window.CFG.servers || [];
    const byName = new Map(servers.map(s => [s.name, s]));

    let routeCount = 0;
    let fwCount = 0;

    for (const [name, items] of (routesByServer || new Map()).entries()) {
      const srv = byName.get(name);
      if (!srv) continue;
      srv.routes = Array.isArray(srv.routes) ? srv.routes : [];

      for (const it of (items || [])) {
        const key = `${it.envTag}|${it.dst}|${it.gateway}|${it.dev}|${it.metric}|${it.viaVlan}|${it.comment||""}`;
        if (srv.routes.some(r => `${r.envTag}|${r.dst}|${r.gateway}|${r.dev}|${r.metric}|${r.viaVlan}|${r.comment||""}` === key)) continue;
        srv.routes.push({
          dst: it.dst,
          viaVlan: it.viaVlan,
          gateway: it.gateway,
          dev: it.dev,
          metric: it.metric,
          envTag: it.envTag,
          comment: it.comment || ""
        });
        routeCount++;
      }
    }

    for (const [name, items] of (fwByServer || new Map()).entries()) {
      const srv = byName.get(name);
      if (!srv) continue;
      srv.firewallRules = Array.isArray(srv.firewallRules) ? srv.firewallRules : [];

      for (const it of (items || [])) {
        const key = `${it.envTag}|${it.dir}|${it.src}|${it.dst}|${it.proto}|${it.ports||""}|${it.comment||""}`;
        if (srv.firewallRules.some(r => `${r.envTag}|${r.dir}|${r.src}|${r.dst}|${r.proto}|${r.ports||""}|${r.comment||""}` === key)) continue;
        srv.firewallRules.push({
          dir: it.dir,
          src: it.src,
          dst: it.dst,
          proto: it.proto,
          ports: it.ports || "",
          envTag: it.envTag,
          comment: it.comment || ""
        });
        fwCount++;
      }
    }

    if (!routeCount && !fwCount) return { ok: true, msg: "Keine neuen Einträge — alles bereits vorhanden." };
    return { ok: true, msg: `Gespeichert: ${routeCount} Route(n), ${fwCount} Firewallregel(n).` };
  }

  /* ------------------ Endpoint resolution ------------------ */

  function resolveEndpoint(type, value, envTag) {
    if (type === "server") {
      const srv = (window.CFG.servers || []).find(s => s.name === value);
      if (!srv) return null;
      return { kind: "server", servers: [srv] };
    }

    if (type === "vlan") {
      const vlan = (window.CFG.vlans || []).find(v => v.name === value);
      if (!vlan) return null;

      const servers = (window.CFG.servers || []).filter(s => {
        const inVlan = (s.vlans || []).includes(value);
        if (!inVlan) return false;
        return (s.envs || []).includes(envTag);
      });

      return { kind: "vlan", vlan, servers };
    }

    return null;
  }

  /* ------------------ Routing generation (with reverse) ------------------ */

  function buildRoutesWithReverse(src, dst, envTag, metric, viaVlan, comment) {
    const perServer = new Map();
    const addRoute = (serverName, item) => {
      if (!perServer.has(serverName)) perServer.set(serverName, []);
      perServer.get(serverName).push(item);
    };

    const dstSpecs = endpointToDestinationSpecs(dst, viaVlan);
    const srcSpecs = endpointToDestinationSpecs(src, viaVlan);

    // forward routes on src side
    src.servers.forEach(srv => dstSpecs.forEach(spec => addRoute(srv.name, buildRouteItem(srv, spec, envTag, metric, viaVlan, comment))));
    // reverse routes on dst side
    dst.servers.forEach(srv => srcSpecs.forEach(spec => addRoute(srv.name, buildRouteItem(srv, spec, envTag, metric, viaVlan, comment))));

    return perServer;
  }

  function endpointToDestinationSpecs(ep, viaVlanHint) {
    if (ep.kind === "vlan") return [{ type: "cidr", value: ep.vlan.cidr }];
    const srv = ep.servers[0];
    const ip = serverPrimaryIp(srv, viaVlanHint);
    return [{ type: "host", value: ip ? `${ip}/32` : "<server-ip>/32" }];
  }

  function serverPrimaryIp(server, viaVlanHint) {
    const oct = parseInt(server.octet, 10);
    if (!Number.isFinite(oct) || oct < 1 || oct > 254) return "";

    const vlanNames = Array.isArray(server.vlans) ? server.vlans : [];
    const pick = (name) => {
      const vlan = (window.CFG.vlans || []).find(v => v.name === name);
      if (!vlan) return "";
      const base = cidrToBase(vlan.cidr);
      return base ? `${base}.${oct}` : "";
    };

    const hinted = String(viaVlanHint || "").trim();
    if (hinted && vlanNames.includes(hinted)) {
      const ip = pick(hinted);
      if (ip) return ip;
    }

    if (vlanNames.includes("Cfg-Net")) {
      const ip = pick("Cfg-Net");
      if (ip) return ip;
    }

    if (vlanNames.length) {
      const ip = pick(vlanNames[0]);
      if (ip) return ip;
    }

    return "";
  }

  function buildRouteItem(server, destSpec, envTag, metric, viaVlan, comment) {
    const preferred = String(viaVlan || "").trim();
    const vlanName = (preferred && (server.vlans || []).includes(preferred)) ? preferred : (server.vlans || [])[0];
    const vlan = (window.CFG.vlans || []).find(v => v.name === vlanName);

    if (!vlan) {
      return {
        cmd: `# WARN: ${server.name} has no VLAN for routing.`,
        dst: destSpec.value,
        viaVlan: vlanName || "",
        gateway: "",
        dev: "",
        metric,
        envTag,
        comment: comment || ""
      };
    }

    const gw = selectGateway(vlan, envTag, server);
    const dev = vlan.iface || "<iface>";
    const via = gw.default || "<gateway>";
    const fb = gw.fallback ? ` # fallback: ${gw.fallback}` : "";

    return {
      cmd: `ip route add ${destSpec.value} via ${via} dev ${dev} metric ${metric}${fb}`,
      dst: destSpec.value,
      viaVlan: vlanName,
      gateway: via,
      dev,
      metric,
      envTag,
      comment: comment || ""
    };
  }

  function selectGateway(vlan, envTag, server) {
    const scopes = vlan.scopes || [];
    const s = scopes.find(x => x.envTag === envTag) || scopes[0];
    if (s) return { default: s.gwDefault || "", fallback: s.gwFallback || "" };
    return { default: "", fallback: "" };
  }

  function cidrToBase(cidr) {
    const m = String(cidr || "").trim().match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(\d{1,2})$/);
    if (!m) return null;
    return `${m[1]}.${m[2]}.${m[3]}`;
  }

  function formatRoutes(perServerRoutes, envTag) {
    const lines = [];
    lines.push(`# Routing — inklusive Rückroute (Env: ${envTag})`);
    lines.push("");

    const servers = Array.from(perServerRoutes.keys()).sort();
    servers.forEach(name => {
      lines.push(`## ${name}`);
      (perServerRoutes.get(name) || []).forEach(it => lines.push(it.cmd || ""));
      lines.push("");
    });

    return lines.join("\n");
  }

  
  function buildFirewallForServicesForward(src, dst, envTag, serviceEntries, viaVlanHint) {
    const merged = new Map();
    const mergeIn = (part) => {
      for (const [name, items] of (part || new Map()).entries()) {
        if (!merged.has(name)) merged.set(name, []);
        merged.get(name).push(...items);
      }
    };

    (serviceEntries || []).forEach(se => {
      const proto = String(se.proto || "tcp").toLowerCase();
      const ports = String(se.ports || "").trim();
      const comment = String(se.comment || se.serviceName || "").trim();
      mergeIn(buildFirewallItemsForward(src, dst, envTag, proto, ports, comment, viaVlanHint));
    });

    return merged;
  }

  // Forward firewall items only:
  // src -> dst  (src: output, dst: input)
  function buildFirewallItemsForward(src, dst, envTag, proto, ports, comment, viaVlanHint) {
    const byServer = new Map();
    const add = (name, item) => {
      if (!byServer.has(name)) byServer.set(name, []);
      byServer.get(name).push(item);
    };

    const srcAddr = endpointToAddr(src, viaVlanHint);
    const dstAddr = endpointToAddr(dst, viaVlanHint);

    const protos = (proto === "tcp/udp") ? ["tcp", "udp"] : [proto];
    protos.forEach(p => {
      src.servers.forEach(srv => add(srv.name, { dir: "out", src: srcAddr, dst: dstAddr, proto: p, ports: ports || "", envTag, comment: comment || "" }));
      dst.servers.forEach(srv => add(srv.name, { dir: "in", src: srcAddr, dst: dstAddr, proto: p, ports: ports || "", envTag, comment: comment || "" }));
    });

    return byServer;
  }

/* ------------------ Firewall generation (bidirectional, per service) ------------------ */

  function buildFirewallForServicesBidirectional(src, dst, envTag, serviceEntries, viaVlanHint) {
    const merged = new Map();
    const mergeIn = (part) => {
      for (const [name, items] of (part || new Map()).entries()) {
        if (!merged.has(name)) merged.set(name, []);
        merged.get(name).push(...items);
      }
    };

    (serviceEntries || []).forEach(se => {
      const proto = String(se.proto || "tcp").toLowerCase();
      const ports = String(se.ports || "").trim();
      const comment = String(se.comment || se.serviceName || "").trim();
      mergeIn(buildFirewallItemsBidirectional(src, dst, envTag, proto, ports, comment, viaVlanHint));
    });

    return merged;
  }

  // Bidirectional firewall items:
  // Forward:  src -> dst  (src: output, dst: input)
  // Reverse:  dst -> src  (dst: output, src: input)
  function buildFirewallItemsBidirectional(src, dst, envTag, proto, ports, comment, viaVlanHint) {
    const byServer = new Map();
    const add = (name, item) => {
      if (!byServer.has(name)) byServer.set(name, []);
      byServer.get(name).push(item);
    };

    const srcAddr = endpointToAddr(src, viaVlanHint);
    const dstAddr = endpointToAddr(dst, viaVlanHint);

    const protos = (proto === "tcp/udp") ? ["tcp", "udp"] : [proto];
    protos.forEach(p => {
      // forward
      src.servers.forEach(srv => add(srv.name, { dir: "out", src: srcAddr, dst: dstAddr, proto: p, ports: ports || "", envTag, comment: comment || "" }));
      dst.servers.forEach(srv => add(srv.name, { dir: "in", src: srcAddr, dst: dstAddr, proto: p, ports: ports || "", envTag, comment: comment || "" }));

      // reverse
      dst.servers.forEach(srv => add(srv.name, { dir: "out", src: dstAddr, dst: srcAddr, proto: p, ports: ports || "", envTag, comment: (comment ? `${comment} (reverse)` : "reverse") }));
      src.servers.forEach(srv => add(srv.name, { dir: "in", src: dstAddr, dst: srcAddr, proto: p, ports: ports || "", envTag, comment: (comment ? `${comment} (reverse)` : "reverse") }));
    });

    return byServer;
  }

  function endpointToAddr(ep, viaVlanHint) {
    if (ep.kind === "vlan") return ep.vlan.cidr;
    const srv = ep.servers[0];
    const ip = serverPrimaryIp(srv, viaVlanHint);
    return ip ? `${ip}/32` : "<server-ip>/32";
  }

  function formatFirewallRules(fwByServer, envTag, bidir) {
    const lines = [];
    lines.push(`# Firewall — ${bidir ? "bidirektional" : "einseitig"} (Env: ${envTag})`);
    lines.push("");

    const servers = Array.from((fwByServer || new Map()).keys()).sort();
    for (const name of servers) {
      lines.push(`## ${name}`);
      const items = fwByServer.get(name) || [];
      for (const it of items) {
        const p = String(it.proto || "").toLowerCase();
        const pe = (it.ports && (p === "tcp" || p === "udp")) ? ` ${p} dport { ${it.ports} }` : "";
        const c = it.comment ? ` comment "${String(it.comment).replaceAll('"', '')}"` : "";
        const dir = (it.dir || "").toLowerCase() === "in" ? "input" : "output";
        lines.push(`add rule inet filter ${dir} ip saddr ${it.src} ip daddr ${it.dst}${pe} accept${c}`);
      }
      lines.push("");
    }
    return lines.join("\n");
  }

  /* ------------------ CSV ------------------ */

  function buildCsv(perServerRoutes, envTag, srcType, srcVal, dstType, dstVal) {
    const lines = [];
    lines.push("type,scope,env,srcType,src,dstType,dst,server,command");

    const servers = Array.from(perServerRoutes.keys()).sort();
    servers.forEach(serverName => {
      (perServerRoutes.get(serverName) || []).forEach(it => {
        const cmd = (it && it.cmd) ? String(it.cmd) : "";
        if (!cmd) return;
        if (cmd.startsWith("#")) return;
        lines.push([
          "route",
          "per-server",
          envTag,
          srcType,
          srcVal,
          dstType,
          dstVal,
          serverName,
          `"${cmd.replaceAll('"','""')}"`
        ].join(","));
      });
    });

    return lines.join("\n");
  }

  function normalizeProtoLower(p) {
    const s = String(p || "").trim().toLowerCase();
    if (s === "tcp") return "tcp";
    if (s === "udp") return "udp";
    if (s === "tcp/udp" || s === "udp/tcp") return "tcp/udp";
    if (s === "any" || s === "all") return "any";
    return s || "tcp";
  }

})();
