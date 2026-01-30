/*
  FlowForge LE — Servers View (modal-based)

  Purpose:
  - Manage logical hosts
  - Assign environment tags, VLANs and service tags
  - Define host IP addressing via last octet

  Refactor (2026-01-29):
  - Consistent, display-only table
  - Add/Edit via shared modal (window.X4Modal)
  - Delete via icon button (right aligned)
*/

(() => {
  "use strict";

  const esc = (v) => window.x4EscapeHtml(v);
  const escA = (v) => window.x4EscapeAttr(v);

  function getVlansList() {
    const c = window.CFG || {};
    const v1 = Array.isArray(c.vlans) ? c.vlans : [];
    const v2 = Array.isArray(c.networks) ? c.networks : [];          // legacy / future-proof
    const v3 = Array.isArray(c.infra?.vlans) ? c.infra.vlans : [];   // legacy / future-proof
    const merged = [...v1, ...v2, ...v3].filter(Boolean);
    // de-dup by name if possible
    const seen = new Set();
    const out = [];
    for (const v of merged) {
      const k = (v && (v.name || v.tag || v.vlanId)) ? String(v.name || v.tag || v.vlanId) : JSON.stringify(v);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(v);
    }
    return out;
  }

  window.renderServersView = function renderServersView() {
    ensureArrays();

    const netBlocked = (getVlansList().length === 0);

    const $view = $("#serversView");
    const html = `
      <div class="blockedWrap">
        <div class="card">
          <div class="hd">
            <h2>Servers</h2>
            <div class="rowActions">
              <button class="secondary btnIcon" id="btnAddServer" ${netBlocked ? "disabled" : ""}>+ Server</button>
            </div>
          </div>
          <div class="bd" style="overflow:auto">
            ${renderTable()}
            <div class="hint small" style="margin-top:10px">
              Note: IP addresses are derived from network (CIDR) + last octet.
            </div>
          </div>
        </div>

        ${netBlocked ? renderBlockedOverlay("Servers are available after you create at least one network/VLAN.") : ""}
      </div>
    `;

    $view.html(html);
    bindEvents();
  };

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

  function renderTable() {
    const rows = (window.CFG.servers || []).map((s, idx) => `
      <tr>
        <td>${esc(s.name || "")}</td>
        <td><span class="tag static on"><span class="name">${esc((s.os || 'debian').toString().toUpperCase())}</span></span></td>
        <td><span class="mono">${esc(s.octet || "")}</span></td>
        <td>${renderStaticTags(s.envs || [])}</td>
        <td>${renderStaticTags(s.vlans || [])}</td>
        <td>${renderStaticTags(s.services || [])}</td>
        <td class="actionsCol">
          <div class="rowActions">
            ${iconBtn("view", idx)}
            ${iconBtn("edit", idx)}
            ${iconBtn("delete", idx)}
          </div>
        </td>
      </tr>
    `).join("");

    return `
      <table>
        <thead>
          <tr>
            <th>Servername</th>
            <th>OS</th>
            <th>IP Oktett</th>
            <th>Environments</th>
            <th>Networks</th>
            <th>Services</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${rows || `<tr><td colspan="7" class="hint">No servers.</td></tr>`}
        </tbody>
      </table>
    `;
  }

  function renderStaticTags(tags) {
    if (!tags || !tags.length) return `<span class="hint small">–</span>`;
    return `
      <div class="tagGrid">
        ${tags.map(t => `
          <div class="tag static on">
            <span class="name">${esc(t)}</span>
          </div>
        `).join("")}
      </div>
    `;
  }

  function iconBtn(kind, idx) {
    const isDelete = (kind === "delete");
    const cls = `iconBtn ${isDelete ? "danger" : ""}`;
    const symbol = (kind === "view") ? "🔎" : (isDelete ? "🗑" : "✎");
    const title = (kind === "view") ? "Details" : (isDelete ? "Delete" : "Edit");
    return `<button class="${cls}" title="${title}" data-srv-action="${kind}" data-srv-idx="${idx}">${symbol}</button>`;
  }

  function bindEvents() {
    const $root = $("#serversView");

    // Bind within view root to avoid accidental unbinding by other views
    $root.off("click.servers");
    $root.on("click.servers", "#btnAddServer", () => openServerModal(null));

    $root.on("click.servers", "[data-srv-action]", function () {
        const action = this.dataset.srvAction;
        const idx = +this.dataset.srvIdx;
        if (!Number.isFinite(idx)) return;

        if (action === "delete") {
          const s = window.CFG.servers[idx];
          const name = s?.name || "";
          if (!confirm(`"${name}" delete this item?`)) return;
          window.CFG.servers.splice(idx, 1);
          saveAndRefresh("Server entfernt.");
          return;
        }

        if (action === "edit") {
          openServerModal(idx);
        }

        if (action === "view") {
          openServerDetails(idx);
        }
      });
  }

  function openServerDetails(idx) {
    const s = window.CFG.servers[idx];
    if (!s) return;

    const envMap = new Map((window.CFG.envs || []).map(e => [e.tag, e]));
    const envs = (s.envs || []).slice();

    const fqdnLines = envs.map(tag => {
      const e = envMap.get(tag);
      const dom = (e && e.domain) ? String(e.domain).trim() : "";
      const fqdn = dom ? `${s.name}.${dom}` : s.name;
      return `<div class="mono">${esc(fqdn)} <span class="hint small">(${esc(tag)}${dom ? ": " + esc(dom) : ""})</span></div>`;
    }).join("") || `<span class="hint">–</span>`;

    const routes = Array.isArray(s.routes) ? s.routes : [];
    const fw = Array.isArray(s.firewallRules) ? s.firewallRules : [];

    const routesTable = routes.length ? `
      <table>
        <thead><tr><th>Destination</th><th>Via</th><th>Gateway</th><th>Metric</th><th>Environment</th><th>Comment</th></tr></thead>
        <tbody>
          ${routes.map(r => `
            <tr>
              <td class="mono">${esc(r.dst || "")}</td>
              <td>${esc(r.viaVlan || "")}</td>
              <td class="mono">${esc(r.gateway || "")}</td>
              <td class="mono">${esc(r.metric ?? "")}</td>
              <td>${esc(r.envTag || "")}</td>
              <td>${esc(r.comment || "")}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>` : `<div class="hint">No routes saved.</div>`;

    const fwTable = fw.length ? `
      <table>
        <thead><tr><th>Direction</th><th>Source</th><th>Destination</th><th>Protocol</th><th>Ports</th><th>Environment</th><th>Comment</th></tr></thead>
        <tbody>
          ${fw.map(x => `
            <tr>
              <td>${esc((x.dir || "").toUpperCase())}</td>
              <td>${esc(x.src || "")}</td>
              <td>${esc(x.dst || "")}</td>
              <td>${esc((x.proto || "").toUpperCase())}</td>
              <td class="mono">${esc(x.ports || "")}</td>
              <td>${esc(x.envTag || "")}</td>
              <td>${esc(x.comment || "")}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>` : `<div class="hint">No firewall rules saved.</div>`;

    const body = `
      <div>
        <label>FQDNs (Servername + Domain je Environment)</label>
        <div style="margin-top:6px">${fqdnLines}</div>
      </div>

      <div style="margin-top:14px">
        <label>Routes</label>
        <div style="overflow:auto; margin-top:6px">${routesTable}</div>
      </div>

      <div style="margin-top:14px">
        <label>Firewallregeln</label>
        <div style="overflow:auto; margin-top:6px">${fwTable}</div>
      </div>

      <div class="hint small" style="margin-top:12px">
        Note: Rules/routes werden vom Generator als Konfigurations-Items in diesem Server gespeichert.
      </div>
    `;

    window.X4Modal.open({
      title: `Server details — ${s.name}`,
      bodyHtml: body,
      onSave: null
    });
  }

  function openServerModal(editIdx) {
    const isEdit = (editIdx !== null && editIdx !== undefined);
    const item = isEdit
      ? structuredClone(window.CFG.servers[editIdx])
      : { name: "", os: "debian", octet: "", envs: [], vlans: [], services: [], roles: { dns: false, ntp: false } };

    // normalize legacy
    item.os = item.os || "debian";
    item.roles = item.roles || { dns: false, ntp: false };

    const allEnvTags = (window.CFG.envs || []).map(e => e.tag).filter(Boolean);
    const allVlans = getVlansList();
    const allSvcNames = (window.CFG.services || []).map(s => s.name).filter(Boolean);

    const body = `
      <div class="two">
        <div>
          <label for="mSrvName">Servername</label>
          <input id="mSrvName" required data-x4-label="Servername" value="${escA(item.name)}" placeholder="z.B. db01" />
        </div>
        <div>
          <label for="mSrvOctet">IP Oktett</label>
          <input id="mSrvOctet" required data-x4-label="IP Oktett" value="${escA(item.octet)}" placeholder="z.B. 11" />
        </div>
      </div>

      <div class="two" style="margin-top:10px">
        <div>
          <label for="mSrvOs">OS</label>
          <select id="mSrvOs" required data-x4-label="OS">
            <option value="debian" ${String(item.os||"debian").toLowerCase().includes("vms") ? "" : "selected"}>Debian</option>
            <option value="openvms" ${String(item.os||"debian").toLowerCase().includes("vms") ? "selected" : ""}>OpenVMS (experimental)</option>
          </select>
        </div>
        <div>
          <label>Zentrale Rollen</label>
          <div class="hint small" style="margin-bottom:6px">Can be referenced later in Generator/Provisioning.</div>
          <label style="display:flex;align-items:center;gap:8px;margin:6px 0">
            <input id="mSrvRoleDns" type="checkbox" ${item.roles?.dns ? "checked" : ""} style="width:auto" />
            <span>Zentraler DNS Server</span>
          </label>
          <label style="display:flex;align-items:center;gap:8px;margin:6px 0">
            <input id="mSrvRoleNtp" type="checkbox" ${item.roles?.ntp ? "checked" : ""} style="width:auto" />
            <span>Zentraler NTP Server</span>
          </label>
        </div>
      </div>

      <div style="margin-top:10px">
        <label>Environments (Tags)</label>
        <input type="hidden" id="mSrvEnvReq" required data-x4-label="Environments" value="${escA((item.envs||[]).join(","))}">
        <div class="tagGrid" id="mSrvEnvs">
          ${renderToggleTags(allEnvTags, item.envs)}
        </div>
      </div>

      <div style="margin-top:10px">
        <label>Networks/VLANs</label>
        <input type="hidden" id="mSrvVlanReq" required data-x4-label="Networks/VLANs" value="${escA((item.vlans||[]).join(","))}">
        <div class="hint small" id="mSrvVlanHint" style="margin-bottom:6px"></div>
        <div class="tagGrid" id="mSrvVlans"></div>
      </div>

      <div style="margin-top:10px">
        <label>Services</label>
        <div class="tagGrid" id="mSrvSvcs">
          ${renderToggleTags(allSvcNames, item.services)}
        </div>
      </div>

      <div class="hint small" style="margin-top:10px">
        Note: Generator & Provisioning use VLAN CIDR + octet to derive host IPs.
      </div>
    `;

    window.X4Modal.open({
      title: isEdit ? "Edit server" : "Create server",
      bodyHtml: body,
      onOpen: () => {
        const renderVlans = () => {
          const selEnvs = window.X4Modal.collectToggleTags("#mSrvEnvs");
          $("#mSrvEnvReq").val(selEnvs.join(","));
          const available = getVlanNamesForEnvs(selEnvs, allVlans);
          const current = window.X4Modal.collectToggleTags("#mSrvVlans");
          const keep = current.filter(v => available.includes(v));
          const act = keep.length ? keep : (item.vlans || []).filter(v => available.includes(v));

          $("#mSrvVlans").html(renderToggleTags(available, act));
          // keep required hidden in sync
          $("#mSrvVlanReq").val(act.join(","));

          if (!selEnvs.length) {
            $("#mSrvVlanHint").text("Select at least one environment to list VLANs.");
          } else if (!available.length) {
            $("#mSrvVlanHint").text("No VLANs are defined for the selected environments.");
          } else {
            $("#mSrvVlanHint").text("");
          }
        };

        renderVlans();

        // Update VLAN list when environments change
        $(document).off("click.srvEnvFilter").on("click.srvEnvFilter", "#mSrvEnvs .tag[data-toggle='1']", () => {
          setTimeout(renderVlans, 0);
        });

        // Keep required hidden in sync when VLAN tags toggle
        $(document).off("click.srvVlanReq").on("click.srvVlanReq", "#mSrvVlans .tag[data-toggle='1']", () => {
          setTimeout(() => {
            const v = window.X4Modal.collectToggleTags("#mSrvVlans");
            $("#mSrvVlanReq").val(v.join(","));
          }, 0);
        });
      },
      onSave: () => {
        // sync hidden required fields
        const envsNow = window.X4Modal.collectToggleTags("#mSrvEnvs");
        const vlansNow = window.X4Modal.collectToggleTags("#mSrvVlans");
        $("#mSrvEnvReq").val(envsNow.join(","));
        $("#mSrvVlanReq").val(vlansNow.join(","));

        const req = window.x4ValidateRequired("#x4ModalBack");
        if (!req.ok) return req;

        const name = $("#mSrvName").val().trim();
        const octet = $("#mSrvOctet").val().trim();

        const o = parseInt(octet, 10);
        if (!Number.isFinite(o) || o < 1 || o > 254) {
          return { ok: false, msg: "Oktett muss zwischen 1 und 254 liegen." };
        }

        const envs = window.X4Modal.collectToggleTags("#mSrvEnvs");
        const vlans = window.X4Modal.collectToggleTags("#mSrvVlans");
        const services = window.X4Modal.collectToggleTags("#mSrvSvcs");

        const existing = isEdit ? (window.CFG.servers[editIdx] || {}) : {};
        const payload = {
          name,
          os: $("#mSrvOs").val(),
          octet: String(o),
          envs,
          vlans,
          services,
          // preserve generated config items
          routes: Array.isArray(existing.routes) ? existing.routes : (Array.isArray(item.routes) ? item.routes : []),
          firewallRules: Array.isArray(existing.firewallRules) ? existing.firewallRules : (Array.isArray(item.firewallRules) ? item.firewallRules : []),
          roles: {
            dns: $("#mSrvRoleDns").is(":checked"),
            ntp: $("#mSrvRoleNtp").is(":checked")
          }
        };

        if (isEdit) window.CFG.servers[editIdx] = payload;
        else window.CFG.servers.push(payload);

        saveAndRefresh(isEdit ? "Server updated." : "Server added.");
        // clean up modal-specific handler
        $(document).off("click.srvEnvFilter");
        return { ok: true };
      }
    });
  }

  function getVlanNamesForEnvs(envTags, vlans) {
    const sel = Array.isArray(envTags) ? envTags : [];
    if (!sel.length) return [];

    const out = [];
    for (const v of (vlans || [])) {
      const name = (v && v.name) ? String(v.name) : "";
      if (!name) continue;

      // If VLAN has scopes, only include when envTag matches
      if (Array.isArray(v.scopes) && v.scopes.length) {
        const ok = v.scopes.some(s => sel.includes(String(s.envTag || "")));
        if (!ok) continue;
      }

      // legacy gateway maps (no scopes) → allow
      out.push(name);
    }

    // de-dup and stable sort
    return Array.from(new Set(out)).sort((a,b) => a.localeCompare(b));
  }

  function renderToggleTags(all, active) {
    if (!all || !all.length) return `<span class="hint small">–</span>`;
    const set = new Set(active || []);
    return all.map(t => window.X4Modal.renderToggleTag(t, set.has(t))).join("");
  }

  function ensureArrays() {
    window.CFG.servers = window.CFG.servers || [];
    window.CFG.envs = window.CFG.envs || [];
    window.CFG.vlans = window.CFG.vlans || [];
    window.CFG.services = window.CFG.services || [];
  }

  function saveAndRefresh(msg) {
    window.saveConfig();
    window.renderServersView();
    window.setStatus("#serversStatus", msg, "ok");
  }

})();
