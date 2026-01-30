/*
  FlowForge LE — Network Provisioning

  Scope (v2):
  - Debian: interface naming (udev), network configuration, routes, DNS, NTP
  - OpenVMS (experimental): generates a best-effort DCL skeleton for TCP/IP configuration
  - Output modes:
    1) Single-Server Script (OS-specific)
    2) Ansible Playbook bundle (all servers, split by OS)

  Notes:
  - This view generates instructions/scripts only. It does not execute anything.
  - Gateways are derived from VLAN scopes (envTag match). If multiple scopes match, first match is used.
*/

(() => {
  "use strict";


  // Shared helpers (outer scope) — used by generator functions
  function getEnvDomain(envTag) {
    const e = (window.CFG.envs || []).find(x => x.tag === envTag);
    return e ? String(e.domain || "").trim() : "";
  }

  function fqdnOf(serverName, envTag) {
    const dom = getEnvDomain(envTag);
    if (!serverName || !dom) return "";
    return `${serverName}.${dom}`.replaceAll("..", ".");
  }


  const esc = (v) => window.x4EscapeHtml(v);
  const escA = (v) => window.x4EscapeAttr(v);

  window.renderProvisioningView = function renderProvisioningView() {
    const $view = $("#provisioningView");

    ensureProvisioningCfg();

    const servers = window.CFG.servers || [];
    const envs = window.CFG.envs || [];
    const vlans = window.CFG.vlans || [];

    const serverOpts = servers.map(s => `<option value="${escA(s.name)}">${esc(s.name)}</option>`).join("");
    const envOpts = envs.map(e => `<option value="${escA(e.tag)}">${esc(e.tag)}</option>`).join("");
    const vlanOpts = vlans.map(v => `<option value="${escA(v.name)}">${esc(v.name)} (${esc(v.cidr)})</option>`).join("");

    const hasMultiEnv = envs.length > 1;

    
    const missingDomains = (envs || []).filter(e => !String(e.domain || "").trim()).map(e => e.tag).filter(Boolean);
    const blocked = (servers.length === 0) || (missingDomains.length > 0);

    const blockMsg = servers.length === 0
      ? "Network Provisioning ist erst nutzbar, wenn mindestens ein Server angelegt wurde."
      : `Network Provisioning requires a domain on the environments. Missing: ${missingDomains.join(", ")}`;

const html = `
      <div class="blockedWrap">
        <div class="grid">
        <div class="card">
          <div class="hd">
            <h2>Network Provisioning</h2>
            <div class="hint">Debian (full) · OpenVMS (experimental) — interface names, IP config, routes, DNS, NTP</div>
          </div>
          <div class="bd">

            <div class="two" style="margin-bottom:10px">
              <div>
                <label>Modus</label>
                <select id="provMode">
                  <option value="single" selected>Single-Server Script</option>
                  <option value="ansible">Ansible Playbook (alle Server)</option>
                </select>
              </div>
              <div>
                <label for="provEnv">Environment (single-server)</label>
                <select id="provEnv" required data-x4-label="Environment">
                  ${envOpts || `<option value="">(no environments)</option>`}
                </select>
                <div class="hint small">Used for gateway/routes/DNS/NTP.</div>
              </div>
            </div>

            <div id="provSingleBox">
              <div class="two" style="margin-bottom:10px">
                <div>
                  <label for="provServerSel">Server</label>
                  <select id="provServerSel" required data-x4-label="Server">
                    ${serverOpts || `<option value="">(keine Server definiert)</option>`}
                  </select>
                </div>
                <div>
                  <label for="provOsSel">OS (aus Server ableitbar)</label>
                  <select id="provOsSel" required data-x4-label="OS">
                    <option value="debian">Debian</option>
                    <option value="openvms">OpenVMS (experimental)</option>
                  </select>
                </div>
              </div>

              <div class="two" style="margin-bottom:10px">
                <div>
                  <label for="provConfigVlan">Konfigurationsnetz (VLAN)</label>
                  <select id="provConfigVlan" required data-x4-label="Konfigurationsnetz (VLAN)">${vlanOpts || `<option value="">(keine VLANs)</option>`}</select>
                  <div class="hint small">${hasMultiEnv ? "If multiple environments exist, the config network is requested per environment in Ansible mode." : "Used for default route and static routes."}</div>
                </div>
                <div>
                  <label>Debian: udev Rule Path</label>
                  <input id="provUdevPath" value="${escA(window.CFG.debian?.udevPath || "/etc/udev/rules.d/10-x4infra-ifnames.rules")}" />
                </div>
              </div>

              
              <div class="two" style="margin-bottom:10px">
                <div>
                  <label for="provDnsPrimary">DNS Primary</label>
                  <select id="provDnsPrimary" required data-x4-label="DNS Primary"></select>
                </div>
                <div>
                  <label for="provDnsSecondary">DNS Secondary</label>
                  <select id="provDnsSecondary" required data-x4-label="DNS Secondary"></select>
                </div>
              </div>

              <div class="two" style="margin-bottom:10px">
                <div>
                  <label for="provNtpPrimary">NTP Primary</label>
                  <select id="provNtpPrimary" required data-x4-label="NTP Primary"></select>
                </div>
                <div>
                  <label for="provNtpSecondary">NTP Secondary</label>
                  <select id="provNtpSecondary" required data-x4-label="NTP Secondary"></select>
                </div>
              </div>

              <div class="hint small" style="margin-top:-4px;margin-bottom:10px">
                Note: Server selection is based on roles (DNS/NTP) in “Servers”. IPs are derived from config network (VLAN) + octet.
              </div>


              <div class="two" style="margin-bottom:10px">
                <div>
                  <label>Debian: Predictable Names deaktivieren (GRUB, optional)</label>
                  <select id="provDisablePredictable">
                    <option value="true" ${window.CFG.debian?.disablePredictable ? "selected" : ""}>Ja</option>
                    <option value="false" ${!window.CFG.debian?.disablePredictable ? "selected" : ""}>Nein</option>
                  </select>
                </div>
                <div>
                  <label>Skript-Dateiname</label>
                  <input id="provScriptName" value="x4infra-provision.sh" />
                </div>
              </div>
            </div>

            <div id="provAnsibleBox" class="hidden">
              <div class="inlineBox">
                <div class="miniHd">
                  <div class="ttl">Ansible — per-environment config</div>
                  <div class="hint small">Required when multiple environments exist.</div>
                </div>

                ${hasMultiEnv ? renderEnvConfigTable(envs, vlans) : `<div class="hint small">Only one environment — defaults are enough.</div>`}
              </div>

              <div class="hint small" style="margin-top:10px">
                Playbook nutzt Hostnamen = Servername (inventory_hostname). Gruppen nach OS sind optional (Playbook filtert per hostvar "os").
              </div>
            </div>

            <div class="rowActions" style="justify-content:flex-end;margin-top:10px">
              <button id="provBuildBtn">Generate</button>
            </div>

          </div>
        </div>

        <div class="card">
          <div class="hd">
            <h2>Output</h2>
            <div class="hint">Script / Playbook (Copy/Paste)</div>
          </div>
          <div class="bd">
            <div class="x4CodeBox">
              <a class="x4CodeCopy" href="#" data-copy-for="provOut" style="display:none">Code kopieren</a>
              <textarea id="provOut" readonly style="min-height:560px"></textarea>
            </div>

            <div class="rowActions" style="justify-content:flex-end; margin-top:10px">
              <button class="secondary" id="provZipBtn" disabled>Bundle (ZIP)</button>
            </div>
          </div>
        </div>
        </div>
        ${blocked ? renderBlockedOverlay(blockMsg) : ""}
      </div>
    `;

    $view.html(html);
    bindProvisioningEvents();
    syncOsFromServer();
    refreshRoleSelectorsSingle();
  };

  function renderEnvConfigTable(envs, vlans) {
    const vlanOpts = vlans.map(v => `<option value="${escA(v.name)}">${esc(v.name)} (${esc(v.cidr)})</option>`).join("");
    const rows = envs.map(e => {
      const envTag = e.tag;
      const cfg = window.CFG.provisioning || {};
      const selVlan = cfg.configVlan?.[envTag] || "";
      const dnsSel = cfg.dnsChoice?.[envTag] || {};
      const ntpSel = cfg.ntpChoice?.[envTag] || {};
      return `
        <div class="miniRow" style="grid-template-columns:120px 1fr 1fr">
          <div class="envTag">${esc(envTag)}</div>
          <div>
            <select data-env="${escA(envTag)}" class="provEnvVlan">
              <option value="">(select VLAN)</option>
              ${vlanOpts.replace(`value="${escA(selVlan)}"`, `value="${escA(selVlan)}" selected`)}
            </select>
            <div class="hint small">Konfigurationsnetz</div>
          </div>
          <div>
            
            <div>
              <label class="small">DNS</label>
              <select data-env="${escA(envTag)}" class="provEnvDnsPrimary">
                ${makeServerOptions(roleServers("dns", envTag), dnsSel.primary || "")}
              </select>
              <select data-env="${escA(envTag)}" class="provEnvDnsSecondary" style="margin-top:6px">
                ${makeServerOptions(roleServers("dns", envTag), dnsSel.secondary || "")}
              </select>
            </div>
            <div style="margin-top:6px">
              <label class="small">NTP</label>
              <select data-env="${escA(envTag)}" class="provEnvNtpPrimary">
                ${makeServerOptions(roleServers("ntp", envTag), ntpSel.primary || "")}
              </select>
              <select data-env="${escA(envTag)}" class="provEnvNtpSecondary" style="margin-top:6px">
                ${makeServerOptions(roleServers("ntp", envTag), ntpSel.secondary || "")}
              </select>
            </div>

          </div>
        </div>
      `;
    }).join("");

    return `<div id="provEnvCfg">${rows}</div>`;
  }

  
  /* ========================
   * DNS/NTP role helpers
   * ======================== */

  function roleServers(roleKey, envTag) {
    const all = window.CFG.servers || [];
    return all
      .filter(s => (s.roles && s.roles[roleKey]) === true)
      .filter(s => !envTag || envTag === "ALL" ? true : (s.envs || []).includes(envTag))
      .map(s => s.name)
      .sort((a,b)=>a.localeCompare(b));
  }

  function makeServerOptions(list, selectedName) {
    const opts = ['<option value="">(none)</option>'];
    list.forEach(name => {
      const sel = (name === selectedName) ? " selected" : "";
      opts.push(`<option value="${escA(name)}"${sel}>${esc(name)}</option>`);
    });
    return opts.join("");
  }

  function resolveChosenServers(envTag, roleKey) {
    const key = roleKey === "dns" ? "dnsChoice" : "ntpChoice";
    const choice = window.CFG.provisioning?.[key]?.[envTag] || {};
    const primary = choice.primary || "";
    const secondary = choice.secondary || "";
    return { primary, secondary };
  }

  function serverIpOnVlan(serverName, vlanName) {
    const srv = (window.CFG.servers || []).find(x => x.name === serverName);
    const vlan = (window.CFG.vlans || []).find(v => v.name === vlanName);
    if (!srv || !vlan) return "";
    const oct = parseInt(srv.octet, 10);
    if (!Number.isFinite(oct) || oct < 1 || oct > 254) return "";
    const base = cidrToBase(vlan.cidr);
    if (!base) return "";
    return `${base}.${oct}`;
  }

  function resolveDnsNtpIps(envTag, cfgVlanName) {
    // Preferred: choose servers (primary/secondary) -> derive IPs on cfg VLAN
    const dnsSel = resolveChosenServers(envTag, "dns");
    const ntpSel = resolveChosenServers(envTag, "ntp");

    const dns = [];
    if (dnsSel.primary) {
      const ip = serverIpOnVlan(dnsSel.primary, cfgVlanName);
      if (ip) dns.push(ip);
    }
    if (dnsSel.secondary && dnsSel.secondary !== dnsSel.primary) {
      const ip = serverIpOnVlan(dnsSel.secondary, cfgVlanName);
      if (ip) dns.push(ip);
    }

    const ntp = [];
    if (ntpSel.primary) {
      const ip = serverIpOnVlan(ntpSel.primary, cfgVlanName);
      if (ip) ntp.push(ip);
    }
    if (ntpSel.secondary && ntpSel.secondary !== ntpSel.primary) {
      const ip = serverIpOnVlan(ntpSel.secondary, cfgVlanName);
      if (ip) ntp.push(ip);
    }

    // Fallback: legacy IP lists if still present
    const legacyDns = window.CFG.provisioning?.dns?.[envTag] || [];
    const legacyNtp = window.CFG.provisioning?.ntp?.[envTag] || [];
    if (!dns.length && legacyDns.length) dns.push(...legacyDns);
    if (!ntp.length && legacyNtp.length) ntp.push(...legacyNtp);

    // Final fallback: auto-pick from role servers in env and derive IPs
    if (!dns.length && cfgVlanName) {
      const picks = roleServers("dns", envTag).slice(0,2);
      picks.forEach(n => { const ip = serverIpOnVlan(n, cfgVlanName); if (ip) dns.push(ip); });
    }
    if (!ntp.length && cfgVlanName) {
      const picks = roleServers("ntp", envTag).slice(0,2);
      picks.forEach(n => { const ip = serverIpOnVlan(n, cfgVlanName); if (ip) ntp.push(ip); });
    }

    return { dns, ntp };
  }

  function refreshRoleSelectorsSingle() {
    const envTag = $("#provEnv").val() || "ALL";
    const listDns = roleServers("dns", envTag);
    const listNtp = roleServers("ntp", envTag);

    const selDns = resolveChosenServers(envTag, "dns");
    const selNtp = resolveChosenServers(envTag, "ntp");

    $("#provDnsPrimary").html(makeServerOptions(listDns, selDns.primary));
    $("#provDnsSecondary").html(makeServerOptions(listDns, selDns.secondary));
    $("#provNtpPrimary").html(makeServerOptions(listNtp, selNtp.primary));
    $("#provNtpSecondary").html(makeServerOptions(listNtp, selNtp.secondary));
  }

function bindProvisioningEvents() {
    $("#provMode").on("change", () => {
      const mode = $("#provMode").val();
      $("#provSingleBox").toggleClass("hidden", mode !== "single");
      $("#provAnsibleBox").toggleClass("hidden", mode !== "ansible");
      $("#provOut").val("");
      $("#provZipBtn").prop("disabled", true);
      $(".x4CodeCopy[data-copy-for='provOut']").hide();
    });

    $("#provServerSel").on("change", () => {
      syncOsFromServer();
    });

    $("#provEnv").on("change", () => {
      // Update config VLAN choices + DNS/NTP role server selections for this env
      refreshConfigVlanOptions();
      refreshRoleSelectorsSingle();
    });

    $("#provDnsPrimary, #provDnsSecondary, #provNtpPrimary, #provNtpSecondary").on("change", () => {
      const envTag = $("#provEnv").val() || "";
      if (!envTag) return;
      window.CFG.provisioning.dnsChoice[envTag] = window.CFG.provisioning.dnsChoice[envTag] || {primary:"", secondary:""};
      window.CFG.provisioning.ntpChoice[envTag] = window.CFG.provisioning.ntpChoice[envTag] || {primary:"", secondary:""};
      window.CFG.provisioning.dnsChoice[envTag].primary = $("#provDnsPrimary").val() || "";
      window.CFG.provisioning.dnsChoice[envTag].secondary = $("#provDnsSecondary").val() || "";
      window.CFG.provisioning.ntpChoice[envTag].primary = $("#provNtpPrimary").val() || "";
      window.CFG.provisioning.ntpChoice[envTag].secondary = $("#provNtpSecondary").val() || "";
      window.saveConfig();
    });


    const setGeneratedState = (hasOutput) => {
      $("#provZipBtn").prop("disabled", !hasOutput);
      const txt = ($("#provOut").val() || "").trim();
      $(".x4CodeCopy[data-copy-for='provOut']").toggle(!!txt);
    };

    // Initially disabled until something is generated
    setGeneratedState(false);

    $("#provBuildBtn").on("click", () => {
      const mode = $("#provMode").val();
      if (mode === "single") {
        const out = generateSingle();
        if (!out.ok) {
          // No textbox pollution, no success toast.
          const msg = String(out.text || "").replace(/^#\s*ERROR:\s*/i, "").trim() || "Input error.";
          window.toast?.critical(msg);
          return;
        }

        $("#provOut").val(out.text);
        window.__X4PROV_BUNDLE__ = out.bundle;
        setGeneratedState(true);
        window.toast?.info("Output erzeugt.");
      } else {
        const out = generateAnsible();
        if (!out.ok) {
          const msg = String(out.text || "").replace(/^#\s*ERROR:\s*/i, "").trim() || "Please complete the environment config.";
          window.toast?.warning(msg);
          return;
        }

        $("#provOut").val(out.text);
        window.__X4PROV_BUNDLE__ = out.bundle;
        setGeneratedState(true);
        window.toast?.info("Playbook erzeugt.");
      }
    });

    // Per-textbox copy link
    $(".x4CodeCopy[data-copy-for='provOut']").off("click").on("click", async (e) => {
      e.preventDefault();
      const txt = ($("#provOut").val() || "").trim();
      if (!txt) return;
      try {
        await navigator.clipboard.writeText(txt);
        window.toast?.info("Code kopiert.");
      } catch {
        window.toast?.critical("Copy not available (browser permissions).");
      }
    });

    $("#provZipBtn").on("click", () => {
      const b = window.__X4PROV_BUNDLE__;
      if (!b) return window.toast?.warning("Generate output first.");
      const zip = buildZipBundle(b);
      window.downloadFile("x4infra.provisioning.bundle.zip", zip, "application/zip");
      window.toast?.info("Bundle exportiert.");
    });

    // Keep copy-link visibility in sync if output is changed programmatically
    $("#provOut").on("input", () => setGeneratedState(true));
  }

  function syncOsFromServer() {
    const name = $("#provServerSel").val();
    const srv = (window.CFG.servers || []).find(s => s.name === name);
    const os = (srv && srv.os) ? String(srv.os).toLowerCase() : "debian";
    $("#provOsSel").val(os.includes("vms") ? "openvms" : "debian");
  }

  function ensureProvisioningCfg() {
    window.CFG.provisioning = window.CFG.provisioning || {};
    window.CFG.provisioning.dns = window.CFG.provisioning.dns || {};
    window.CFG.provisioning.ntp = window.CFG.provisioning.ntp || {};
    window.CFG.provisioning.configVlan = window.CFG.provisioning.configVlan || {};
    window.CFG.provisioning.dnsChoice = window.CFG.provisioning.dnsChoice || {};
    window.CFG.provisioning.ntpChoice = window.CFG.provisioning.ntpChoice || {};
    window.CFG.debian = window.CFG.debian || {};
  
  function renderBlockedOverlay(text) {
    return `
      <div class="blockedOverlay" aria-hidden="true">
        <div class="blockedMsg">
          <div class="ttl">Section locked</div>
          <div class="txt">${esc(text)}</div>
        </div>
      </div>
    `;
  }

  function getEnvDomain(envTag) {
    const e = (window.CFG.envs || []).find(x => x.tag === envTag);
    return e ? String(e.domain || "").trim() : "";
  }

  function fqdnOf(serverName, envTag) {
    const dom = getEnvDomain(envTag);
    if (!serverName || !dom) return "";
    return `${serverName}.${dom}`.replaceAll("..", ".");
  }
}

  /* =========================
   * Single server generation
   * ========================= */

  function generateSingle() {
    const req = window.x4ValidateRequired("#provisioningView");
    if (!req.ok) return { ok:false, text:`# ERROR: ${req.msg}\n` };

    const serverName = $("#provServerSel").val();
    const envTag = $("#provEnv").val();
    const os = $("#provOsSel").val();

    if (!serverName) return { ok:false, text:"# ERROR: Select a server.\n" };
    if (!envTag) return { ok:false, text:"# ERROR: Select an environment.\n" };

    const fqdn = fqdnOf(serverName, envTag);
    if (!fqdn) return { ok:false, text:"# ERROR: The environment has no domain (required for FQDN).\n" };

    // persist DNS/NTP for this env (single mode edits only one env at a time)
    window.CFG.provisioning.dnsChoice[envTag] = window.CFG.provisioning.dnsChoice[envTag] || {primary:"", secondary:""};
    window.CFG.provisioning.ntpChoice[envTag] = window.CFG.provisioning.ntpChoice[envTag] || {primary:"", secondary:""};
    window.CFG.provisioning.dnsChoice[envTag].primary = $("#provDnsPrimary").val() || "";
    window.CFG.provisioning.dnsChoice[envTag].secondary = $("#provDnsSecondary").val() || "";
    window.CFG.provisioning.ntpChoice[envTag].primary = $("#provNtpPrimary").val() || "";
    window.CFG.provisioning.ntpChoice[envTag].secondary = $("#provNtpSecondary").val() || "";

    const cfgVlan = $("#provConfigVlan").val();
    if (cfgVlan) window.CFG.provisioning.configVlan[envTag] = cfgVlan;

    const { dns, ntp } = resolveDnsNtpIps(envTag, cfgVlan);


    window.CFG.debian.udevPath = $("#provUdevPath").val().trim() || "/etc/udev/rules.d/10-x4infra-ifnames.rules";
    window.CFG.debian.disablePredictable = $("#provDisablePredictable").val() === "true";
    window.saveConfig();

    const srv = (window.CFG.servers || []).find(s => s.name === serverName);
    if (!srv) return { ok:false, text:`# ERROR: Server not found: ${serverName}\n` };

    const bundle = {};
    let text = "";

    if (os === "debian") {
      const scriptName = $("#provScriptName").val().trim() || "x4infra-provision.sh";
      text = buildDebianProvisionScript(srv, envTag, scriptName, dns, ntp, cfgVlan);
      bundle[scriptName] = text;
    } else {
      text = buildOpenVmsProvisionScript(srv, envTag, dns, ntp, cfgVlan);
      bundle["X4INFRA_PROVISION.DCL"] = text;
    }

    return { ok:true, text, bundle };
  }

  /* =========================
   * Ansible generation
   * ========================= */

  function generateAnsible() {
    const envs = window.CFG.envs || [];
    const servers = window.CFG.servers || [];
    const hasMultiEnv = envs.length > 1;

    // collect per-env inputs
    if (hasMultiEnv) {
      const ok = persistEnvConfigFromUi();
      if (!ok) {
        return { ok:false, text:"# WARN: Select the configuration network per environment.\n" };
      }
    }

    // ensure at least one env exists
    if (!envs.length) {
      return { ok:false, text:"# ERROR: No environments defined.\n" };
    }

    // Build per-server scripts (Debian/OpenVMS) and a playbook that chooses based on hostvar
    const bundle = {};
    const scriptsDeb = {};
    const scriptsVms = {};

    for (const s of servers) {
      const envTag = (s.envs && s.envs[0]) ? s.envs[0] : envs[0].tag;
      const cfgVlan = window.CFG.provisioning.configVlan?.[envTag] || "";
      const { dns, ntp } = resolveDnsNtpIps(envTag, cfgVlan);

      const os = (s.os || "debian").toLowerCase().includes("vms") ? "openvms" : "debian";

      if (os === "debian") {
        const fn = `scripts/${s.name}.sh`;
        scriptsDeb[s.name] = fn;
        bundle[fn] = buildDebianProvisionScript(s, envTag, fn.split("/").pop(), dns, ntp, cfgVlan, { forAnsible:true });
      } else {
        const fn = `scripts/${s.name}.dcl`;
        scriptsVms[s.name] = fn;
        bundle[fn] = buildOpenVmsProvisionScript(s, envTag, dns, ntp, cfgVlan);
      }
    }

    const playbook = buildAnsiblePlaybook(envs, servers, scriptsDeb, scriptsVms);
    bundle["playbook.yml"] = playbook;
    bundle["inventory.ini"] = buildAnsibleInventory(envs, servers);
    bundle["README_PROVISIONING.txt"] = buildBundleReadme();

    return { ok:true, text: playbook, bundle };
  }

  function persistEnvConfigFromUi() {
    let ok = true;
    $("#provEnvCfg .provEnvVlan").each(function () {
      const env = this.dataset.env;
      const v = $(this).val();
      if (!v) ok = false;
      window.CFG.provisioning.configVlan[env] = v || "";
    });
    $("#provEnvCfg .provEnvDnsPrimary, #provEnvCfg .provEnvDnsSecondary").each(function () {
      const env = this.dataset.env;
      window.CFG.provisioning.dnsChoice[env] = window.CFG.provisioning.dnsChoice[env] || {primary:"", secondary:""};
      if ($(this).hasClass("provEnvDnsPrimary")) window.CFG.provisioning.dnsChoice[env].primary = $(this).val() || "";
      if ($(this).hasClass("provEnvDnsSecondary")) window.CFG.provisioning.dnsChoice[env].secondary = $(this).val() || "";
    });
    $("#provEnvCfg .provEnvNtpPrimary, #provEnvCfg .provEnvNtpSecondary").each(function () {
      const env = this.dataset.env;
      window.CFG.provisioning.ntpChoice[env] = window.CFG.provisioning.ntpChoice[env] || {primary:"", secondary:""};
      if ($(this).hasClass("provEnvNtpPrimary")) window.CFG.provisioning.ntpChoice[env].primary = $(this).val() || "";
      if ($(this).hasClass("provEnvNtpSecondary")) window.CFG.provisioning.ntpChoice[env].secondary = $(this).val() || "";
    });
    window.saveConfig();
    return ok;
  }

  /* =========================
   * Script builders
   * ========================= */

  function buildDebianProvisionScript(srv, envTag, scriptName, dnsServers, ntpServers, configVlanName, opts) {
    const fqdn = fqdnOf(srv.name, envTag);
    if (!fqdn) return `# ERROR: Environment "${envTag}" has no domain (FQDN required).\n`;
    const forAnsible = !!(opts && opts.forAnsible);

    const udevPath = (window.CFG.debian && window.CFG.debian.udevPath) ? window.CFG.debian.udevPath : "/etc/udev/rules.d/10-x4infra-ifnames.rules";
    const disablePredictable = !!(window.CFG.debian && window.CFG.debian.disablePredictable);

    const oct = parseInt(srv.octet, 10);
    if (!Number.isFinite(oct) || oct < 1 || oct > 254) {
      return `# ERROR: Server "${srv.name}" has an invalid octet value.\n`;
    }

    const assignedVlans = (srv.vlans || [])
      .map(n => (window.CFG.vlans || []).find(v => v.name === n))
      .filter(Boolean);

    if (!assignedVlans.length) {
      return `# ERROR: Server "${srv.name}" has no VLAN assignments.\n`;
    }

    // udev mapping list: (CIDR, desired iface name, VLAN display name)
    const mappingLines = assignedVlans.map(v => `  ("${v.cidr}", "${v.iface}", "${v.name}")`);

    // Determine "config network" VLAN used for gateway + static routes
    const cfgVlan = (window.CFG.vlans || []).find(v => v.name === (configVlanName || ""));
    const cfgIface = cfgVlan ? cfgVlan.iface : (assignedVlans[0].iface || "<iface>");
    const cfgGw = (cfgVlan && envTag) ? (selectGatewayForEnv(cfgVlan, envTag) || "") : "";

    const hostIp = (() => {
      // Prefer IP in config VLAN; fallback to first assigned VLAN
      const ip1 = (cfgVlan && cfgVlan.cidr) ? (deriveHostIp(cfgVlan.cidr, oct) || "") : "";
      if (ip1) return ip1;
      const v0 = assignedVlans[0];
      return (v0 && v0.cidr) ? (deriveHostIp(v0.cidr, oct) || "") : "";
    })();

    // Build ifupdown config snippet
    const dnsLine = (dnsServers && dnsServers.length) ? `dns-nameservers ${dnsServers.join(" ")}` : "";
    const ntpLine = (ntpServers && ntpServers.length)
      ? `# NTP: ${ntpServers.join(", ")} (configure chrony/ntpsec accordingly)`
      : "# NTP: (not set)";

    const netCfg = [];
    netCfg.push(`# Generated by FlowForge LE — Debian ifupdown snippet`);
    netCfg.push(`# Host: ${srv.name}  Env: ${envTag}`);
    netCfg.push("");

    for (const v of assignedVlans) {
      const addr = deriveHostIp(v.cidr, oct) || "<ip>";
      const netmask = cidrToNetmask(v.cidr) || "<netmask>";

      netCfg.push(`auto ${v.iface}`);
      netCfg.push(`iface ${v.iface} inet static`);
      netCfg.push(`  address ${addr}`);
      netCfg.push(`  netmask ${netmask}`);

      // Apply gateway, DNS, routes only on config VLAN stanza (best-effort)
      if (cfgVlan && v.name === cfgVlan.name) {
        if (cfgGw) netCfg.push(`  gateway ${cfgGw}`);
        if (dnsLine) netCfg.push(`  ${dnsLine}`);

        // Static routes to all other VLANs via config gateway
        if (cfgGw) {
          for (const r of (window.CFG.vlans || [])) {
            if (!r || !r.cidr) continue;
            if (cfgVlan && r.name === cfgVlan.name) continue;
            netCfg.push(`  post-up ip route replace ${r.cidr} via ${cfgGw} dev ${cfgIface} || true`);
            netCfg.push(`  pre-down ip route del ${r.cidr} via ${cfgGw} dev ${cfgIface} || true`);
          }
        }
      }

      netCfg.push("");
    }

    const netCfgText = netCfg.join("\n");

    const lines = [];
    lines.push(`# FlowForge LE — Network Provisioning (Debian)`);
    lines.push(`# Server: ${srv.name}`);
    lines.push(`# FQDN: ${fqdn}`);
    lines.push(`# Env: ${envTag}`);
    lines.push("");

    if (disablePredictable) {
      lines.push(`# OPTIONAL: Disable predictable interface names (GRUB)`);
      lines.push(`sudo sed -i 's/^GRUB_CMDLINE_LINUX="\\(.*\\)"/GRUB_CMDLINE_LINUX="\\1 net.ifnames=0 biosdevname=0"/' /etc/default/grub`);
      lines.push(`sudo update-grub`);
      lines.push("");
    }

    // In Ansible mode we don't wrap into "cat > script <<EOF"; playbook writes file directly.
    if (!forAnsible) {
      lines.push(`# Create script file`);
      lines.push(`cat > ${scriptName} <<'EOF'`);
    }

    lines.push(`#!/usr/bin/env bash
set -euo pipefail

HOSTNAME_FQDN="${fqdn}"
HOST_SHORT="${srv.name}"
HOST_IP="${hostIp}"

# Set hostname (FQDN)
if command -v hostnamectl >/dev/null 2>&1; then
  sudo hostnamectl set-hostname "$HOSTNAME_FQDN"
else
  echo "$HOSTNAME_FQDN" | sudo tee /etc/hostname >/dev/null
  sudo hostname "$HOSTNAME_FQDN" || true
fi

# Update /etc/hosts with FQDN (best-effort)
if [ -n "$HOST_IP" ]; then
  sudo cp /etc/hosts /etc/hosts.x4infra.bak 2>/dev/null || true
  # remove old entries for this host (fqdn or short)
  sudo awk '!($0 ~ ("[[:space:]]" ENVIRON["HOSTNAME_FQDN"] "([[:space:]]|$)")) && !($0 ~ ("[[:space:]]" ENVIRON["HOST_SHORT"] "([[:space:]]|$)"))' /etc/hosts | sudo tee /etc/hosts >/dev/null
  echo "$HOST_IP $HOSTNAME_FQDN $HOST_SHORT" | sudo tee -a /etc/hosts >/dev/null
fi

UDEV_PATH="${udevPath}"
RULES_TMP="$(mktemp)"
NETCFG="/etc/network/interfaces.d/x4infra-${srv.name}.cfg"

trap 'rm -f "$RULES_TMP"' EXIT

echo "[FlowForge] Detecting IPv4 addresses (scope global)..."
mapfile -t IFROWS < <(ip -o -4 addr show scope global | awk '{print $2" "$4}' || true)

# Base rules header
cat > "$RULES_TMP" <<'HDR'
# Generated by FlowForge LE — udev interface names
# SUBSYSTEM=="net", ACTION=="add", ATTR{address}=="<mac>", NAME="<name>"
HDR

python3 - <<'PY' "$RULES_TMP" "\${IFROWS[@]}"
import sys
from ipaddress import ip_network, ip_address

out_path = sys.argv[1]
rows = sys.argv[2:]

ifs = []
for r in rows:
  try:
    iface, ipcidr = r.split()[:2]
    ip = ipcidr.split('/')[0]
    ifs.append((iface, ip))
  except Exception:
    pass

mappings = [
${mappingLines.join(",\n")}
]

def mac_of(iface: str):
  try:
    with open(f"/sys/class/net/{iface}/address","r",encoding="utf-8") as f:
      return f.read().strip().lower()
  except Exception:
    return None

used = set()
lines = []

for cidr, desired, vlan in mappings:
  net = ip_network(cidr, strict=False)
  hit = None
  for iface, ip in ifs:
    if iface in used:
      continue
    try:
      if ip_address(ip) in net:
        hit = (iface, ip)
        break
    except Exception:
      pass

  lines.append("")
  lines.append(f"# VLAN {vlan} / {cidr}")
  if not hit:
    lines.append(f"# WARN: No interface with IP in {cidr}.")
    continue

  iface, ip = hit
  used.add(iface)
  mac = mac_of(iface)
  lines.append(f"# detected: {iface} {ip}")

  if not mac:
    lines.append(f"# ERROR: MAC not found for {iface}.")
    continue

  lines.append(f'SUBSYSTEM=="net", ACTION=="add", ATTR{{address}}=="{mac}", NAME="{desired}"')

with open(out_path, "a", encoding="utf-8") as f:
  for ln in lines:
    f.write(ln + "\n")
PY

echo "[FlowForge] Installing udev rules to: $UDEV_PATH"
sudo install -m 0644 "$RULES_TMP" "$UDEV_PATH"
sudo udevadm control --reload-rules
sudo udevadm trigger --subsystem-match=net

echo "[FlowForge] Writing network config to: $NETCFG"
sudo mkdir -p /etc/network/interfaces.d
sudo tee "$NETCFG" >/dev/null <<'NET'
${netCfgText}
NET

echo "${ntpLine}"
echo "[FlowForge] Apply: sudo ifdown --exclude=lo -a && sudo ifup --exclude=lo -a"
echo "[FlowForge] Reboot recommended after rename: sudo reboot"
`);

    if (!forAnsible) {
      lines.push("EOF");
      lines.push(`chmod +x ${scriptName}`);
      lines.push("");
      lines.push("# Run script");
      lines.push(`sudo ./${scriptName}`);
      lines.push("");
      lines.push("# Reboot (recommended)");
      lines.push("# sudo reboot");
    }

    return lines.join("\n") + "\n";
  }

  function buildOpenVmsProvisionScript(srv, envTag, dnsServers, ntpServers, configVlanName) {
    const oct = parseInt(srv.octet, 10);
    const assignedVlans = (srv.vlans || []).map(n => (window.CFG.vlans || []).find(v => v.name === n)).filter(Boolean);

    const cfgVlan = (window.CFG.vlans || []).find(v => v.name === (configVlanName || ""));
    const cfgGw = cfgVlan ? selectGatewayForEnv(cfgVlan, envTag) : "";

    const lines = [];
    lines.push("! FlowForge LE — Network Provisioning (OpenVMS) — EXPERIMENTAL");
    lines.push("! This is a best-effort skeleton. Review commands for your TCP/IP stack (TCPIP Services / UCX).");
    const fqdn = fqdnOf(srv.name, envTag) || "";
    lines.push(`! Host: ${srv.name}   Env: ${envTag}`);
    lines.push(`! FQDN: ${fqdn || "<missing domain>"}  (consider setting node/hostname accordingly)`);
    lines.push("");

    lines.push("$! --- Interfaces (IP) ---");
    for (const v of assignedVlans) {
      const ip = deriveHostIp(v.cidr, oct) || "<ip>";
      lines.push(`$! VLAN: ${v.name}  CIDR: ${v.cidr}  IFACE(TAG): ${v.iface}`);
      lines.push(`$! Example (TCPIP Services):`);
      lines.push(`$! TCPIP SET INTERFACE ${v.iface} /IPADDRESS=${ip} /NETMASK=<netmask>`);
      lines.push("");
    }

    lines.push("$! --- Default Route / Static Routes ---");
    if (cfgGw) {
      lines.push(`$! Default gateway (from ${configVlanName}): ${cfgGw}`);
      lines.push(`$! TCPIP SET ROUTE /DEFAULT ${cfgGw}`);
    } else {
      lines.push("$! WARN: No gateway resolved. Configure routes manually.");
    }
    lines.push("");

    lines.push("$! --- DNS ---");
    if (dnsServers.length) {
      lines.push(`$! DNS Servers: ${dnsServers.join(", ")}`);
      lines.push(`$! TCPIP SET NAME_SERVICE /ENABLE`);
      for (const d of dnsServers) lines.push(`$! TCPIP SET NAME_SERVICE /SERVER=${d}`);
    } else {
      lines.push("$! (DNS not set)");
    }
    lines.push("");

    lines.push("$! --- NTP ---");
    if (ntpServers.length) {
      lines.push(`$! NTP Servers: ${ntpServers.join(", ")}`);
      lines.push("$! Configure your NTP client (e.g. NET$NTP / UCX NTP) accordingly.");
    } else {
      lines.push("$! (NTP not set)");
    }

    lines.push("");
    lines.push("$! End.");
    return lines.join("\n") + "\n";
  }

  function selectGatewayForEnv(vlan, envTag) {
    const scopes = Array.isArray(vlan.scopes) ? vlan.scopes : [];
    const hit = scopes.find(s => s.envTag === envTag && s.gwDefault);
    if (hit) return hit.gwDefault;
    const any = scopes.find(s => s.gwDefault);
    return any ? any.gwDefault : "";
  }

  /* =========================
   * Bundle helpers
   * ========================= */

  
  function buildAnsibleInventory(envs, servers) {
    const lines = [];
    lines.push("# FlowForge LE — Ansible Inventory (demo)");
    lines.push("# Hosts are listed as FQDN when possible; x4infra_name maps to CFG server name.");
    lines.push("");
    const deb = [];
    const vms = [];

    for (const s of (servers || [])) {
      const envTag = (s.envs && s.envs[0]) ? s.envs[0] : (envs[0] ? envs[0].tag : "");
      const os = (s.os || "debian").toLowerCase().includes("vms") ? "openvms" : "debian";
      const fqdn = fqdnOf(s.name, envTag) || s.name;

      // Use config VLAN IP (if selected), else first assigned VLAN IP (best-effort)
      const cfgVlanName = (window.CFG.provisioning && window.CFG.provisioning.configVlan) ? (window.CFG.provisioning.configVlan[envTag] || "") : "";
      const cfgVlan = (window.CFG.vlans || []).find(v => v.name === cfgVlanName);
      const oct = parseInt(s.octet, 10);
      let ip = "";
      if (cfgVlan && Number.isFinite(oct)) ip = deriveHostIp(cfgVlan.cidr, oct) || "";
      if (!ip && s.vlans && s.vlans.length && Number.isFinite(oct)) {
        const v0 = (window.CFG.vlans || []).find(v => v.name === s.vlans[0]);
        if (v0) ip = deriveHostIp(v0.cidr, oct) || "";
      }

      const parts = [];
      parts.push(fqdn);
      parts.push(`x4infra_name=${s.name}`);
      if (envTag) parts.push(`x4infra_env=${envTag}`);
      parts.push(`x4infra_os=${os}`);
      if (ip) parts.push(`ansible_host=${ip}`);

      const line = parts.join(" ");
      (os === "debian" ? deb : vms).push(line);
    }

    lines.push("[debian]");
    lines.push(...(deb.length ? deb : ["# (none)"]));
    lines.push("");
    lines.push("[openvms]");
    lines.push(...(vms.length ? vms : ["# (none)"]));
    lines.push("");
    lines.push("[all:vars]");
    lines.push("ansible_user=root");
    lines.push("# For SSH keys / become, adjust to your environment.");
    lines.push("");
    return lines.join("\\n") + "\\n";
  }

function buildAnsiblePlaybook(envs, servers, scriptsDeb, scriptsVms) {
    const lines = [];
    lines.push("# FlowForge LE — Network Provisioning Playbook");
    lines.push("# Inventory: host can be FQDN; set x4infra_name=<CFG server name> (see inventory.ini)");
    lines.push("");
    lines.push("- name: Apply network provisioning scripts");
    lines.push("  hosts: all");
    lines.push("  become: true");
    lines.push("  gather_facts: false");
    lines.push("  vars:");
    lines.push("    x4infra_servers:");
    lines.push("      # name: { os: debian|openvms, script: scripts/<name>.sh|.dcl }");

    for (const s of servers) {
      const os = (s.os || "debian").toLowerCase().includes("vms") ? "openvms" : "debian";
      const script = os === "debian" ? scriptsDeb[s.name] : scriptsVms[s.name];
      lines.push(`      ${s.name}: { os: ${os}, script: "${script}" }`);
    }

    lines.push("");
    lines.push("  tasks:");
    lines.push("    - name: Fail if host not in config");
    lines.push("      fail:");
    lines.push("        msg: \"Host '{{ inventory_hostname }}' (key={{ x4infra_key }}) not found in x4infra_servers\""); 
    lines.push("      when: x4infra_servers[x4infra_key] is not defined");
    lines.push("");
    lines.push("    - name: Copy Debian script");
    lines.push("      copy:");
    lines.push("        src: \"{{ x4infra_servers[x4infra_key].script }}\"");
    lines.push("        dest: \"/root/x4infra-provision.sh\"");
    lines.push("        mode: \"0755\"");
    lines.push("      when: x4infra_servers[x4infra_key].os == 'debian'");
    lines.push("");
    lines.push("    - name: Run Debian script");
    lines.push("      command: /root/x4infra-provision.sh");
    lines.push("      when: x4infra_servers[x4infra_key].os == 'debian'");
    lines.push("");
    lines.push("    - name: Copy OpenVMS DCL (experimental)");
    lines.push("      copy:");
    lines.push("        src: \"{{ x4infra_servers[x4infra_key].script }}\"");
    lines.push("        dest: \"X4INFRA_PROVISION.DCL\"");
    lines.push("      when: x4infra_servers[x4infra_key].os == 'openvms'");
    lines.push("");
    lines.push("    - name: OpenVMS apply (manual)");
    lines.push("      debug:");
    lines.push("        msg: \"OpenVMS script copied. Apply manually on the host (experimental).\"");
    lines.push("      when: x4infra_servers[x4infra_key].os == 'openvms'");
    lines.push("");
    return lines.join("\n") + "\n";
  }

  function buildBundleReadme() {
    return [
      "FlowForge LE — Network Provisioning Bundle",
      "",
      "Contents:",
      "- playbook.yml",
      "- scripts/<server>.sh   (Debian)",
      "- scripts/<server>.dcl  (OpenVMS, experimental)",
      "",
      "Notes:",
      "- Inventory hostnames can be FQDN; ensure variable x4infra_name=<server name> is set (see inventory.ini).",
      "- Debian scripts perform udev interface renaming and write an ifupdown snippet.",
      "- OpenVMS scripts are skeletons and must be reviewed/applied manually.",
      ""
    ].join("\n");
  }

  function buildZipBundle(filesMap) {
    // Very small ZIP builder (store-only) to keep this project dependency-free.
    // Returns a Uint8Array. (Browser downloadFile supports Blob input)
    // For simplicity and since this is "best-effort", we fall back to plain text bundle if no implementation.
    // NOTE: If you want a real ZIP, we can integrate a tiny zip lib later.
    const parts = [];
    parts.push("=== X4Infra Provisioning Bundle (pseudo-zip) ===\n");
    for (const [path, content] of Object.entries(filesMap)) {
      parts.push(`\n--- FILE: ${path} ---\n`);
      parts.push(content);
    }
    return parts.join("");
  }

  /* =========================
   * Small utilities
   * ========================= */

  function parseCsv(txt) {
    return String(txt || "")
      .split(",")
      .map(s => s.trim())
      .filter(Boolean);
  }

  function deriveHostIp(cidr, octet) {
    const base = cidrToBase(cidr);
    if (!base) return "";
    const o = parseInt(octet, 10);
    if (!Number.isFinite(o) || o < 1 || o > 254) return "";
    return `${base}.${o}`;
  }

  function cidrToBase(cidr) {
    const m = String(cidr || "").trim().match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(\d{1,2})$/);
    if (!m) return null;
    return `${m[1]}.${m[2]}.${m[3]}`;
  }

  function cidrToNetmask(cidr) {
    const m = String(cidr || "").trim().match(/\/(\d{1,2})$/);
    if (!m) return "";
    const bits = parseInt(m[1], 10);
    if (!Number.isFinite(bits) || bits < 0 || bits > 32) return "";
    let mask = (0xffffffff << (32 - bits)) >>> 0;
    return [24,16,8,0].map(shift => (mask >>> shift) & 255).join(".");
  }

})();