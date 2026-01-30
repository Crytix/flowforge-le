/*
  FlowForge LE — Services View (modal-based)

  Refactor:
  - Consistent tables (display-only)
  - Add/Edit via shared modal
  - Right-aligned icon actions
*/

(() => {
  "use strict";

  window.renderServicesView = function renderServicesView() {
    const $view = $("#servicesView");
    const html = `
      <div class="card">
        <div class="hd">
          <h2>Services</h2>
          <div class="rowActions">
            <button class="secondary btnIcon" id="btnAddService">+ Service</button>
          </div>
        </div>
        <div class="bd" style="overflow:auto">
          ${renderTable()}
          <div class="hint small" style="margin-top:10px">
            Note: Services are pure definitions. Assignment to servers happens in the “Servers” section.
          </div>
        </div>
      </div>
    `;
    $view.html(html);
    bind();
  };

  function renderTable() {
    const items = window.CFG.services || [];
    const rows = items.map((s, idx) => `
      <tr>
        <td>${x4EscapeHtml(s.name || "")}</td>
        <td>${renderPortsSummary(s)}</td>
        <td>${x4EscapeHtml(s.comment || "")}</td>
        <td class="actionsCol">
          <div class="rowActions">
            ${window.x4IconBtn("edit", "svc", idx)}
            ${window.x4IconBtn("delete", "svc", idx)}
          </div>
        </td>
      </tr>
    `).join("");

    return `
      <table>
        <thead>
          <tr>
            <th>Service Name</th>
            <th>Ports / Ranges</th>
            <th>Comment</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${rows || `<tr><td colspan="4" class="hint">No services.</td></tr>`}
        </tbody>
      </table>
    `;
  }

  function renderPortsSummary(service) {
    const items = normalizePortItems(service);
    if (!items.length) return `<span class="hint small">–</span>`;

    return `
      <div class="tagGrid">
        ${items.map(p => `
          <div class="tag static">
            <span class="name">${x4EscapeHtml(p.proto)}:${x4EscapeHtml(p.value)}</span>
          </div>
        `).join("")}
      </div>
    `;
  }

  function bind() {
    $("#btnAddService").off("click").on("click", () => openModal(null));

    $(document)
      .off("click.servicesActions")
      .on("click.servicesActions", "[data-x4-action][data-x4-type='svc']", function () {
        const action = this.dataset.x4Action;
        const idx = +this.dataset.x4Idx;
        if (!Number.isFinite(idx)) return;

        if (action === "delete") {
          const item = (window.CFG.services || [])[idx];
          const name = item?.name || "";
          if (!confirm(`"${name}" delete this item?`)) return;
          window.CFG.services.splice(idx, 1);
          window.saveConfig();
          window.renderServicesView();
          return;
        }

        if (action === "edit") {
          openModal(idx);
        }
      });
  }

  function openModal(editIdx) {
    const isEdit = editIdx !== null && editIdx !== undefined;
    const item = isEdit
      ? window.CFG.services[editIdx]
      : { name: "", comment: "", portItems: [] };

    // Ensure a normalized working copy for the modal
    const portItems = normalizePortItems(item);

    const body = `
      <div class="two">
        <div>
          <label for="mSvcName">Name</label>
          <input id="mSvcName" required data-x4-label="Name" value="${x4EscapeAttr(item.name)}" placeholder="z.B. Postgres" />
        </div>
        <div>
          <label for="mSvcComment">Comment</label>
          <input id="mSvcComment" required data-x4-label="Comment" value="${x4EscapeAttr(item.comment)}" placeholder="e.g. database access" />
        </div>
      </div>

      <div style="margin-top:10px">
        <div class="inlineBox">
          <div class="miniHd">
            <div class="ttl">Ports / Ranges</div>
            <div class="rowActions">
              <button class="secondary btnIcon" id="mSvcAddPort">+ Port</button>
            </div>
          </div>

          <div class="hint small" style="margin-bottom:8px">
            Add one or more entries. For each entry select a protocol (TCP / UDP / TCP/UDP) and enter the port value.
            Beispiele: <span class="mono">22</span> · <span class="mono">80,443</span> · <span class="mono">20000-20100</span>
          </div>

          <div id="mSvcPortsArea"></div>
        </div>
      </div>
    `;

    window.X4Modal.open({
      title: isEdit ? "Edit service" : "Create service",
      bodyHtml: body,
      onSave: () => {
        const req = window.x4ValidateRequired("#x4ModalBack");
        if (!req.ok) return req;

        const items = collectModalPortItems();
        if (!items.length) return { ok: false, msg: "At least one port/range must be defined." };
        const ports = items.map(x => x.value).filter(Boolean).join(", ");
        const proto = deriveServiceProto(items);

        window.CFG.services = window.CFG.services || [];
        // Keep .proto/.ports for backward compatibility (Generator prefill, legacy configs)
        const name = $("#mSvcName").val().trim();
        const comment = $("#mSvcComment").val().trim();
        const payload = { name, proto, ports, comment, portItems: items };
        if (isEdit) window.CFG.services[editIdx] = payload;
        else window.CFG.services.push(payload);

        window.saveConfig();
        window.renderServicesView();
        return { ok: true };
      },
      onOpen: () => {
        // Render existing port items and bind events
        window.__X4_SVC_PORTS__ = portItems.slice();
        renderPortsArea();

        $("#mSvcAddPort").on("click", () => {
          window.__X4_SVC_PORTS__ = window.__X4_SVC_PORTS__ || [];
          window.__X4_SVC_PORTS__.push({ proto: "TCP", value: "" });
          renderPortsArea();
        });

        $(document)
          .off("click.svcPorts")
          .on("click.svcPorts", "[data-svc-port-del]", function () {
            const i = +this.dataset.svcPortDel;
            if (!Number.isFinite(i)) return;
            window.__X4_SVC_PORTS__.splice(i, 1);
            renderPortsArea();
          });

        $(document)
          .off("input.svcPorts")
          .on("input.svcPorts change.svcPorts", "[data-svc-port-idx]", function () {
            const i = +this.dataset.svcPortIdx;
            const field = this.dataset.field;
            if (!Number.isFinite(i) || !field) return;
            window.__X4_SVC_PORTS__[i][field] = this.value;
          });
      }
    });
  }

  function normalizePortItems(service) {
    // Preferred: structured items
    if (Array.isArray(service.portItems) && service.portItems.length) {
      return service.portItems
        .map(x => ({
          proto: toProtoUpper(x.proto || service.proto || "TCP"),
          value: String(x.value || "").trim()
        }))
        .filter(x => x.value);
    }

    // Backward compat: single string in .ports
    const legacy = String(service.ports || "").trim();
    if (!legacy) return [];
    return [{ proto: toProtoUpper(service.proto || "TCP"), value: legacy }];
  }

  function renderPortsArea() {
    const items = window.__X4_SVC_PORTS__ || [];
    if (!items.length) {
      $("#mSvcPortsArea").html(`<div class="hint small">No ports defined yet.</div>`);
      return;
    }

    const rows = items.map((p, idx) => {
      const proto = toProtoUpper(p.proto || "TCP");
      return `
        <div class="miniRow" style="grid-template-columns: 140px 1fr 44px; align-items:center">
          <select required data-x4-label="Protocol (Eintrag ${idx + 1})" data-svc-port-idx="${idx}" data-field="proto">
            <option value="TCP" ${proto === "TCP" ? "selected" : ""}>TCP</option>
            <option value="UDP" ${proto === "UDP" ? "selected" : ""}>UDP</option>
            <option value="TCP/UDP" ${proto === "TCP/UDP" ? "selected" : ""}>TCP/UDP</option>
          </select>
          <input required data-x4-label="Port/Range (Eintrag ${idx + 1})" data-svc-port-idx="${idx}" data-field="value" value="${x4EscapeAttr(p.value || "")}" placeholder="22 | 80,443 | 20000-20100" />
          <button class="iconBtn danger" title="Remove" data-svc-port-del="${idx}">🗑</button>
        </div>
      `;
    }).join("");

    $("#mSvcPortsArea").html(rows);
  }

  function collectModalPortItems() {
    const items = (window.__X4_SVC_PORTS__ || []).map(x => ({
      proto: toProtoUpper(x.proto || "TCP"),
      value: String(x.value || "").trim()
    })).filter(x => x.value);
    return items;
  }

  function deriveServiceProto(items) {
    // Keep legacy .proto compatible with generator (lowercase)
    const set = new Set((items || []).map(x => toProtoLower(x.proto)).filter(Boolean));
    if (set.size === 1) return Array.from(set)[0];
    const hasTcp = set.has("tcp") || set.has("tcp/udp");
    const hasUdp = set.has("udp") || set.has("tcp/udp");
    if (hasTcp && hasUdp && set.size <= 2) return "tcp/udp";
    return "any";
  }

  function toProtoUpper(p) {
    const s = String(p || "").trim().toLowerCase();
    if (s === "tcp") return "TCP";
    if (s === "udp") return "UDP";
    if (s === "tcp/udp" || s === "udp/tcp") return "TCP/UDP";
    // fall back: keep as-is but uppercase
    return String(p || "TCP").trim().toUpperCase();
  }

  function toProtoLower(p) {
    const s = String(p || "").trim().toLowerCase();
    if (s === "tcp") return "tcp";
    if (s === "udp") return "udp";
    if (s === "tcp/udp" || s === "udp/tcp") return "tcp/udp";
    return s || "";
  }

})();
