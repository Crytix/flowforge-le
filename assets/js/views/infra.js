/*
  FlowForge LE — Infrastructure View

  Implemented:
  - Sections stacked vertically (full width) in this order:
    1) Environments
    2) Zonen (blocked until >=1 environment)
    3) Netzwerke/VLANs (blocked until >=1 zone)
    4) Firewalls (blocked until >=1 VLAN)

  - Add/Edit uses a modal (shared modal: window.X4Modal.open)
  - Display area shows only current configuration values
  - Each row has Edit + Delete icons (right aligned)

  Data model:
  - CFG.envs[]:     { name, tag, comment }
  - CFG.zones[]:    { name, tag, envTags[] }
  - CFG.vlans[]:    { name, vlanId, cidr, iface, scopes:[{ envTag, zoneTag, gwDefault, gwFallback }] }
  - CFG.firewalls[]:{ name, scopes:[{ envTag, zoneTag }] }
*/

(() => {
  "use strict";

  const esc = window.x4EscapeHtml;
  const escA = window.x4EscapeAttr;

  window.renderInfraView = function renderInfraView() {
    ensureInfraArrays();

    const envBlocked = (window.CFG.envs.length === 0);
    const zoneBlocked = (window.CFG.zones.length === 0);
    const vlanBlocked = (window.CFG.vlans.length === 0);

    const html = `
      <div class="stack">
        ${renderEnvironmentsSection()}

        <div class="blockedWrap">
          ${renderZonesSection()}
          ${envBlocked ? renderBlockedOverlay("Zones are available after you create at least one environment.") : ""}
        </div>

        <div class="blockedWrap">
          ${renderVlansSection()}
          ${zoneBlocked ? renderBlockedOverlay("VLANs sind erst nutzbar, wenn mindestens eine Zone angelegt wurde.") : ""}
        </div>

        <div class="blockedWrap">
          ${renderFirewallsSection()}
          ${vlanBlocked ? renderBlockedOverlay("Firewalls are available after you create at least one network/VLAN.") : ""}
        </div>
      </div>
    `;

    $("#infraView").html(html);
    bindInfraEvents();
  };

  /* ---------------- Sections ---------------- */

  function renderEnvironmentsSection() {
    return `
      <div class="card">
        <div class="hd">
          <h2>Environments</h2>
          <button class="secondary" id="btnAddEnv">+ Environment</button>
        </div>
        <div class="bd" style="overflow:auto">
          ${renderEnvTable()}
        </div>
      </div>
    `;
  }

  function renderZonesSection() {
    const disabled = window.CFG.envs.length === 0;
    return `
      <div class="card">
        <div class="hd">
          <h2>Zones</h2>
          <button class="secondary" id="btnAddZone" ${disabled ? "disabled" : ""}>+ Zone</button>
        </div>
        <div class="bd" style="overflow:auto">
          ${renderZoneTable()}
        </div>
      </div>
    `;
  }

  function renderVlansSection() {
    const disabled = window.CFG.zones.length === 0;
    return `
      <div class="card">
        <div class="hd">
          <h2>Networks / VLANs</h2>
          <button class="secondary" id="btnAddVlan" ${disabled ? "disabled" : ""}>+ VLAN</button>
        </div>
        <div class="bd" style="overflow:auto">
          ${renderVlanTable()}
        </div>
      </div>
    `;
  }

  function renderFirewallsSection() {
    const disabled = window.CFG.vlans.length === 0;
    return `
      <div class="card">
        <div class="hd">
          <h2>Firewalls</h2>
          <button class="secondary" id="btnAddFw" ${disabled ? "disabled" : ""}>+ Firewall</button>
        </div>
        <div class="bd" style="overflow:auto">
          ${renderFirewallTable()}
        </div>
      </div>
    `;
  }

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

  /* ---------------- Tables (display only) ---------------- */

  function renderEnvTable() {
    const rows = (window.CFG.envs || []).map((e, idx) => `
      <tr>
        <td>${esc(e.name || "")}</td>
        <td><span class="mono">${esc(e.tag || "")}</span></td>
        <td><span class="mono">${esc(e.domain || "")}</span></td>
        <td>${esc(e.comment || "")}</td>
        <td class="actionsCol">
          <div class="rowActions">
            ${iconBtn("edit", "env", idx)}
            ${iconBtn("delete", "env", idx)}
          </div>
        </td>
      </tr>
    `).join("");

    return `
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Tag</th>
            <th>Domain</th>
            <th>Comment</th>
            <th></th>
          </tr>
        </thead>
        <tbody>${rows || `<tr><td colspan="5" class="hint">No environments.</td></tr>`}</tbody>
      </table>
    `;
  }

  function renderZoneTable() {
    const rows = (window.CFG.zones || []).map((z, idx) => `
      <tr>
        <td>${esc(z.name || "")}</td>
        <td><span class="mono">${esc(z.tag || "")}</span></td>
        <td>${renderStaticTags(z.envTags || [])}</td>
        <td class="actionsCol">
          <div class="rowActions">
            ${iconBtn("edit", "zone", idx)}
            ${iconBtn("delete", "zone", idx)}
          </div>
        </td>
      </tr>
    `).join("");

    return `
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Tag</th>
            <th>Environments</th>
            <th></th>
          </tr>
        </thead>
        <tbody>${rows || `<tr><td colspan="4" class="hint">No zones.</td></tr>`}</tbody>
      </table>
    `;
  }

  function renderVlanTable() {
    const rows = (window.CFG.vlans || []).map((v, idx) => `
      <tr>
        <td>${esc(v.name || "")}</td>
        <td><span class="mono">${esc(v.vlanId || "")}</span></td>
        <td><span class="mono">${esc(v.cidr || "")}</span></td>
        <td>${renderStaticTag(v.iface || "")}</td>
        <td>${renderVlanScopesSummary(v.scopes || [])}</td>
        <td class="actionsCol">
          <div class="rowActions">
            ${iconBtn("edit", "vlan", idx)}
            ${iconBtn("delete", "vlan", idx)}
          </div>
        </td>
      </tr>
    `).join("");

    return `
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>VLAN ID</th>
            <th>CIDR</th>
            <th>Interface</th>
            <th>Environment/Zone + Gateways</th>
            <th></th>
          </tr>
        </thead>
        <tbody>${rows || `<tr><td colspan="6" class="hint">No VLANs.</td></tr>`}</tbody>
      </table>
    `;
  }

  function renderVlanScopesSummary(scopes) {
    if (!scopes.length) return `<span class="hint small">–</span>`;
    return `
      <div style="display:flex;flex-direction:column;gap:6px">
        ${scopes.map(s => `
          <div class="inlineBox" style="margin:0">
            <div class="mono"><b>${esc(s.envTag)}/${esc(s.zoneTag)}</b></div>
            <div class="hint small">
              default: <span class="mono">${esc(s.gwDefault || "")}</span>
              · fallback: <span class="mono">${esc(s.gwFallback || "")}</span>
            </div>
          </div>
        `).join("")}
      </div>
    `;
  }

  function renderFirewallTable() {
    const rows = (window.CFG.firewalls || []).map((f, idx) => `
      <tr>
        <td>${esc(f.name || "")}</td>
        <td>${renderFwScopesSummary(f.scopes || [])}</td>
        <td class="actionsCol">
          <div class="rowActions">
            ${iconBtn("edit", "fw", idx)}
            ${iconBtn("delete", "fw", idx)}
          </div>
        </td>
      </tr>
    `).join("");

    return `
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Environment/Zone</th>
            <th></th>
          </tr>
        </thead>
        <tbody>${rows || `<tr><td colspan="3" class="hint">No firewalls.</td></tr>`}</tbody>
      </table>
    `;
  }

  function renderFwScopesSummary(scopes) {
    if (!scopes.length) return `<span class="hint small">–</span>`;
    return `
      <div class="tagGrid">
        ${scopes.map(s => `
          <div class="tag on" style="cursor:default">
            <span class="name">${esc(s.envTag)}/${esc(s.zoneTag)}</span>
            <span class="state">✔</span>
          </div>
        `).join("")}
      </div>
    `;
  }

  /* ---------------- Events ---------------- */

  function bindInfraEvents() {
    $("#btnAddEnv").off("click").on("click", () => openEnvModal(null));
    $("#btnAddZone").off("click").on("click", () => {
      if (window.CFG.envs.length === 0) return;
      openZoneModal(null);
    });
    $("#btnAddVlan").off("click").on("click", () => {
      if (window.CFG.zones.length === 0) return;
      openVlanModal(null);
    });
    $("#btnAddFw").off("click").on("click", () => {
      if (window.CFG.vlans.length === 0) return;
      openFirewallModal(null);
    });

    // Row icon actions
    $(document).off("click.infraIcons").on("click.infraIcons", "[data-infra-action]", function () {
      const action = this.dataset.infraAction;
      const type = this.dataset.infraType;
      const idx = Number(this.dataset.infraIdx);
      if (!Number.isFinite(idx)) return;

      if (action === "delete") return handleDelete(type, idx);
      if (action === "edit") return handleEdit(type, idx);
    });
  }

  function handleDelete(type, idx) {
    const map = { env: window.CFG.envs, zone: window.CFG.zones, vlan: window.CFG.vlans, fw: window.CFG.firewalls };
    const arr = map[type];
    if (!arr || !arr[idx]) return;

    const name = arr[idx].name || arr[idx].tag || "";
    if (!confirm(`"${name}" delete this item?`)) return;

    arr.splice(idx, 1);
    saveAndRefresh();
  }

  function handleEdit(type, idx) {
    if (type === "env") return openEnvModal(idx);
    if (type === "zone") return openZoneModal(idx);
    if (type === "vlan") return openVlanModal(idx);
    if (type === "fw") return openFirewallModal(idx);
  }

  /* ---------------- Modals ---------------- */

  function openEnvModal(editIdx) {
    const isEdit = editIdx !== null && editIdx !== undefined;
    const item = isEdit ? window.CFG.envs[editIdx] : { name: "", tag: "", domain: "", comment: "" };

    const body = `
      <div class="two">
        <div>
          <label for="mEnvName">Name</label>
          <input id="mEnvName" required data-x4-label="Name" value="${escA(item.name)}" />
        </div>
        <div>
          <label for="mEnvTag">Tag</label>
          <input id="mEnvTag" required data-x4-label="Tag" value="${escA(item.tag)}" placeholder="e.g. PRD" />
        </div>
      </div>

      <div class="two" style="margin-top:10px">
        <div>
          <label for="mEnvDomain">Domain (optional)</label>
          <input id="mEnvDomain" value="${escA(item.domain)}" placeholder="e.g. prd.example.local" />
        </div>
        <div>
          <label for="mEnvComment">Comment</label>
          <input id="mEnvComment" value="${escA(item.comment)}" />
        </div>
      </div>
    `;

    window.X4Modal.open({
      title: isEdit ? "Edit environment" : "Create environment",
      bodyHtml: body,
      onSave: () => {
        const req = window.x4ValidateRequired("#x4ModalBack");
        if (!req.ok) return req;

        const n = $("#mEnvName").val().trim();
        const t = $("#mEnvTag").val().trim();
        const d = $("#mEnvDomain").val().trim();
        const c = $("#mEnvComment").val().trim();

        const payload = { name: n, tag: t, domain: d, comment: c };
        if (isEdit) window.CFG.envs[editIdx] = payload;
        else window.CFG.envs.push(payload);

        saveAndRefresh();
        return { ok: true };
      }
    });
  }

  function openZoneModal(editIdx) {
    const isEdit = editIdx !== null && editIdx !== undefined;
    const item = isEdit ? window.CFG.zones[editIdx] : { name: "", tag: "", envTags: [] };

    const envTagsAll = (window.CFG.envs || []).map(e => e.tag).filter(Boolean);

    const body = `
      <div class="two">
        <div>
          <label for="mZoneName">Name</label>
          <input id="mZoneName" required data-x4-label="Name" value="${escA(item.name)}" />
        </div>
        <div>
          <label for="mZoneTag">Tag</label>
          <input id="mZoneTag" required data-x4-label="Tag" value="${escA(item.tag)}" placeholder="e.g. DMZ" />
        </div>
      </div>

      <div style="margin-top:10px">
        <label>Environments (Tags)</label>
        <input type="hidden" id="mZoneEnvReq" required data-x4-label="Environments" value="${escA((item.envTags || []).join(","))}">
        <div class="tagGrid" id="mZoneEnvTags">
          ${envTagsAll.map(t => renderToggleTag(t, (item.envTags || []).includes(t))).join("")}
        </div>
      </div>
    `;

    window.X4Modal.open({
      title: isEdit ? "Edit zone" : "Create zone",
      bodyHtml: body,
      onSave: () => {
        // sync hidden required field
        const sel = collectToggleTags("#mZoneEnvTags");
        $("#mZoneEnvReq").val(sel.join(","));

        const req = window.x4ValidateRequired("#x4ModalBack");
        if (!req.ok) return req;

        const n = $("#mZoneName").val().trim();
        const t = $("#mZoneTag").val().trim();

        const payload = { name: n, tag: t, envTags: sel };
        if (isEdit) window.CFG.zones[editIdx] = payload;
        else window.CFG.zones.push(payload);

        saveAndRefresh();
        return { ok: true };
      }
    });
  }

  function openVlanModal(editIdx) {
    const isEdit = editIdx !== null && editIdx !== undefined;
    const item = isEdit ? window.CFG.vlans[editIdx] : { name: "", vlanId: "", cidr: "", iface: "", scopes: [] };

    const combos = getEnvZoneCombos();
    const ifaceExisting = getExistingIfaceTags();

    const selectedKeys = new Set((item.scopes || []).map(s => `${s.envTag}::${s.zoneTag}`));

    const body = `
      <div class="two">
        <div>
          <label for="mVlanName">Name</label>
          <input id="mVlanName" required data-x4-label="Name" value="${escA(item.name)}" />
        </div>
        <div>
          <label for="mVlanId">VLAN ID</label>
          <input id="mVlanId" required data-x4-label="VLAN ID" value="${escA(item.vlanId)}" placeholder="e.g. 210" />
        </div>
      </div>

      <div class="two" style="margin-top:10px">
        <div>
          <label for="mVlanCidr">CIDR</label>
          <input id="mVlanCidr" required data-x4-label="CIDR" value="${escA(item.cidr)}" placeholder="e.g. 10.10.10.0/24" />
        </div>
        <div>
          <label for="mVlanIface">Interface (Tag)</label>
          <input id="mVlanIface" required data-x4-label="Interface" value="${escA(item.iface)}" placeholder="e.g. mgmt" />
          ${ifaceExisting}
        </div>
      </div>

      <div style="margin-top:10px">
        <label>Environment/Zone Auswahl (kombinierte Tags)</label>
        <input type="hidden" id="mVlanCombosReq" required data-x4-label="Environment/Zone Kombination" value="${escA(Array.from(selectedKeys).join(","))}">
        <div class="tagGrid" id="mVlanCombos">
          ${combos.map(c => renderToggleTag(c.label, selectedKeys.has(`${c.envTag}::${c.zoneTag}`), c.envTag, c.zoneTag)).join("")}
        </div>
      </div>

      <div style="margin-top:10px">
        <div class="inlineBox">
          <div class="miniHd">
            <div class="ttl">Gateways je Environment/Zone-Kombination</div>
            <div class="hint small">Fields appear for each selected combination.</div>
          </div>
          <div id="mVlanGwArea"></div>
        </div>
      </div>
    `;

    window.X4Modal.open({
      title: isEdit ? "Edit VLAN" : "Create VLAN",
      bodyHtml: body,
      onOpen: () => {
        // interface quick pick
        $(document).off("click.pickIface").on("click.pickIface", "[data-pick-iface]", function () {
          const v = this.dataset.pickIface;
          if ($("#mVlanIface").length) $("#mVlanIface").val(v);
        });

        bindComboGatewayArea(item);
      },
      onSave: () => {
        const chosen = collectComboTags("#mVlanCombos");
        $("#mVlanCombosReq").val(chosen.map(c => `${c.envTag}::${c.zoneTag}`).join(","));

        const req = window.x4ValidateRequired("#x4ModalBack");
        if (!req.ok) return req;

        const n = $("#mVlanName").val().trim();
        const id = $("#mVlanId").val().trim();
        const cidr = $("#mVlanCidr").val().trim();
        const iface = $("#mVlanIface").val().trim();

        const scopes = chosen.map(c => {
          const key = `${c.envTag}::${c.zoneTag}`;
          const escKey = cssKey(key);
          const gwD = $("#gwD_" + escKey).val().trim();
          const gwF = $("#gwF_" + escKey).val().trim();
          return { envTag: c.envTag, zoneTag: c.zoneTag, gwDefault: gwD, gwFallback: gwF };
        });

        const payload = { name: n, vlanId: id, cidr, iface, scopes };
        if (isEdit) window.CFG.vlans[editIdx] = payload;
        else window.CFG.vlans.push(payload);

        saveAndRefresh();
        return { ok: true };
      }
    });
  }

  function openFirewallModal(editIdx) {
    const isEdit = editIdx !== null && editIdx !== undefined;
    const item = isEdit ? window.CFG.firewalls[editIdx] : { name: "", scopes: [] };

    const combos = getEnvZoneCombos();
    const selectedKeys = new Set((item.scopes || []).map(s => `${s.envTag}::${s.zoneTag}`));

    const body = `
      <div>
        <label for="mFwName">Name</label>
        <input id="mFwName" required data-x4-label="Name" value="${escA(item.name)}" />
      </div>
      <div style="margin-top:10px">
        <label>Environment/Zone (kombiniert)</label>
        <input type="hidden" id="mFwCombosReq" required data-x4-label="Environment/Zone Kombination" value="${escA(Array.from(selectedKeys).join(","))}">
        <div class="tagGrid" id="mFwCombos">
          ${combos.map(c => renderToggleTag(c.label, selectedKeys.has(`${c.envTag}::${c.zoneTag}`), c.envTag, c.zoneTag)).join("")}
        </div>
      </div>
    `;

    window.X4Modal.open({
      title: isEdit ? "Edit firewall" : "Create firewall",
      bodyHtml: body,
      onSave: () => {
        const chosen = collectComboTags("#mFwCombos");
        $("#mFwCombosReq").val(chosen.map(c => `${c.envTag}::${c.zoneTag}`).join(","));

        const req = window.x4ValidateRequired("#x4ModalBack");
        if (!req.ok) return req;

        const n = $("#mFwName").val().trim();

        const payload = { name: n, scopes: chosen.map(c => ({ envTag: c.envTag, zoneTag: c.zoneTag })) };
        if (isEdit) window.CFG.firewalls[editIdx] = payload;
        else window.CFG.firewalls.push(payload);

        saveAndRefresh();
        return { ok: true };
      }
    });
  }

  /* ---------------- VLAN gateway area binding ---------------- */

  function bindComboGatewayArea(existingItem) {
    renderVlanGwArea(existingItem);
    $(document).off("click.vlanCombos").on("click.vlanCombos", "#mVlanCombos .tag", function () {
      // tag toggle handled by modal framework
      renderVlanGwArea(existingItem);
    });
  }

  function renderVlanGwArea(existingItem) {
    const chosen = collectComboTags("#mVlanCombos");
    const existingScopes = (existingItem.scopes || []).reduce((acc, s) => {
      acc[`${s.envTag}::${s.zoneTag}`] = s;
      return acc;
    }, {});

    if (!chosen.length) {
      $("#mVlanGwArea").html(`<div class="hint small">No combination selected.</div>`);
      return;
    }

    const rows = chosen.map(c => {
      const key = `${c.envTag}::${c.zoneTag}`;
      const escKey = cssKey(key);
      const old = existingScopes[key] || {};
      return `
        <div class="miniRow">
          <div class="envTag">${esc(c.label)}</div>
          <input id="gwD_${escKey}" required data-x4-label="Gateway Default (${escA(c.label)})" placeholder="Gateway Default" value="${escA(old.gwDefault || "")}">
          <input id="gwF_${escKey}" placeholder="Gateway Fallback" value="${escA(old.gwFallback || "")}">
        </div>
      `;
    }).join("");

    $("#mVlanGwArea").html(rows);
    // Newly injected required fields need label marking + invalid clearing hooks
    window.x4ApplyRequiredUI("#x4ModalBack");
  }

  /* ---------------- Helpers ---------------- */

  function iconBtn(kind, type, idx) {
    const isDelete = kind === "delete";
    const cls = `iconBtn ${isDelete ? "danger" : ""}`;
    const symbol = isDelete ? "🗑" : "✎";
    const title = isDelete ? "Delete" : "Edit";
    return `<button class="${cls}" title="${title}" data-infra-action="${kind}" data-infra-type="${type}" data-infra-idx="${idx}">${symbol}</button>`;
  }

  function renderStaticTag(txt) {
    if (!txt) return `<span class="hint small">–</span>`;
    return `
      <div class="tag static">
        <span class="name">${esc(txt)}</span>
      </div>
    `;
  }

  function renderStaticTags(tags) {
    if (!tags || !tags.length) return `<span class="hint small">–</span>`;
    return `
      <div class="tagGrid">
        ${tags.map(t => `
          <div class="tag static">
            <span class="name">${esc(t)}</span>
          </div>
        `).join("")}
      </div>
    `;
  }

  function renderToggleTag(label, isOn, envTag, zoneTag) {
    const on = !!isOn;
    const data = [
      `data-toggle="1"`,
      envTag ? `data-env="${escA(envTag)}"` : "",
      zoneTag ? `data-zone="${escA(zoneTag)}"` : "",
      `data-label="${escA(label)}"`
    ].filter(Boolean).join(" ");

    return `
      <div class="tag ${on ? "on" : "off"}" ${data}>
        <span class="name">${esc(label)}</span>
        <span class="state">${on ? "✔" : "✖"}</span>
      </div>
    `;
  }

  function collectToggleTags(containerSel) {
    const tags = [];
    $(`${containerSel} .tag`).each(function () {
      if ($(this).hasClass("on")) tags.push($(this).find(".name").text().trim());
    });
    return tags;
  }

  function collectComboTags(containerSel) {
    const out = [];
    $(`${containerSel} .tag`).each(function () {
      if (!$(this).hasClass("on")) return;
      const envTag = this.dataset.env || "";
      const zoneTag = this.dataset.zone || "";
      const label = this.dataset.label || "";
      if (envTag && zoneTag) out.push({ envTag, zoneTag, label });
    });
    return out;
  }

  function getEnvZoneCombos() {
    const combos = [];
    (window.CFG.zones || []).forEach(z => {
      (z.envTags || []).forEach(envTag => {
        combos.push({ envTag, zoneTag: z.tag, label: `${envTag}/${z.tag}` });
      });
    });
    combos.sort((a, b) => a.label.localeCompare(b.label));
    return combos;
  }

  function getExistingIfaceTags() {
    const set = new Set((window.CFG.vlans || []).map(v => (v.iface || "").trim()).filter(Boolean));
    if (set.size === 0) return "";

    const tags = Array.from(set).sort();
    return `
      <div class="hint small" style="margin-top:6px">Vorhandene Interface-Tags:</div>
      <div class="tagGrid" style="margin-top:6px">
        ${tags.map(t => `
          <div class="tag on" style="cursor:pointer" data-pick-iface="${escA(t)}">
            <span class="name">${esc(t)}</span>
            <span class="state">✔</span>
          </div>
        `).join("")}
      </div>
    `;
  }

  function ensureInfraArrays() {
    window.CFG.envs = window.CFG.envs || [];
    window.CFG.zones = window.CFG.zones || [];
    window.CFG.vlans = window.CFG.vlans || [];
    window.CFG.firewalls = window.CFG.firewalls || [];
  }

  function saveAndRefresh() {
    window.saveConfig();
    window.renderInfraView();

    // Other views depend on infra data (envs/zones/vlans):
    // - Servers: blocker + VLAN tag options
    // - Generator: endpoints + gateway selection
    // - Rename: VLAN iface mapping
    if (typeof window.renderServersView === "function") window.renderServersView();
    if (typeof window.renderGeneratorView === "function") window.renderGeneratorView();
        if (typeof window.renderProvisioningView === "function") window.renderProvisioningView();
  }

  function cssKey(s) {
    return String(s).replaceAll(/[^a-zA-Z0-9]/g, "_");
  }

})();
