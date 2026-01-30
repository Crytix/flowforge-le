/*
  FlowForge LE — UI Router & Shared UI Utilities

  Includes:
  - View navigation
  - Status helper
  - Download helper
  - Escaping helpers
  - Shared modal framework (used by views)
*/

(() => {
  "use strict";

  /* ---------------- View routing ---------------- */

  function switchView(viewId) {
    $("section[id$='View']").addClass("hidden");
    $("#" + viewId).removeClass("hidden");

    $(".tabbtn").removeClass("active").attr("aria-selected", "false");
    $(`.tabbtn[data-view="${viewId}"]`).addClass("active").attr("aria-selected", "true");
  }

  $(document).on("click", ".tabbtn, [data-view]", function () {
    const viewId = $(this).data("view");
    if (viewId) switchView(viewId);
  });

  // Expose for bootstrap and debugging
  window.switchView = switchView;

  /* ---------------- Status ---------------- */

  /* ---------------- Toasts ---------------- */

  function ensureToastHost() {
    let host = document.getElementById("x4ToastHost");
    if (host) return host;
    host = document.createElement("div");
    host.id = "x4ToastHost";
    host.setAttribute("aria-live", "polite");
    host.setAttribute("aria-relevant", "additions");
    document.body.appendChild(host);
    // Align to the main content container so toasts are flush with the app layout,
    // not the browser edge.
    alignToastHostToContent();
    return host;
  }

  function alignToastHostToContent() {
    const host = document.getElementById("x4ToastHost");
    if (!host) return;

    // Primary layout container in this project
    const wrap = document.querySelector("main.wrap") || document.querySelector(".wrap") || document.querySelector("main") || document.body;
    const rect = wrap.getBoundingClientRect();

    const cs = window.getComputedStyle(wrap);
    const pr = parseFloat(cs.paddingRight || "0") || 0;
    const gap = 0; // flush with content edge

    // Right edge of inner content (wrap right minus padding)
    const contentRight = rect.right - pr - gap;
    const rightPx = Math.max(8, Math.round(window.innerWidth - contentRight));

    host.style.right = `${rightPx}px`;
  }

  window.addEventListener("resize", () => alignToastHostToContent());
  window.addEventListener("orientationchange", () => alignToastHostToContent());
  document.addEventListener("DOMContentLoaded", () => alignToastHostToContent());

  const TOAST_DEFAULTS = {
    info: { ttl: 3500, sticky: false },
    warning: { ttl: 6000, sticky: false },
    // In this project we want errors to disappear automatically (no sticky).
    critical: { ttl: 9000, sticky: false }
  };

  const toastState = {
    maxVisible: 4,
    dedupeWindowMs: 2000,
    lastByKey: new Map(),
    toasts: []
  };

  function nowMs() {
    return Date.now();
  }

  function normalizeLevel(level) {
    const v = String(level || "info").toLowerCase();
    if (v === "warn" || v === "warning") return "warning";
    if (v === "bad" || v === "error" || v === "critical") return "critical";
    return "info";
  }

  function toastKey(level, message) {
    return `${level}::${String(message || "")}`;
  }

  function removeToast(id) {
    const host = ensureToastHost();
    const el = host.querySelector(`[data-toast-id="${id}"]`);
    if (!el) return;
    el.classList.add("closing");
    window.setTimeout(() => {
      try { el.remove(); } catch (_) {}
    }, 220);
  }

  function renderToast({ id, level, message, count }) {
    const lvl = normalizeLevel(level);
    const icon = lvl === "critical" ? iconCriticalSvg() : lvl === "warning" ? iconWarningSvg() : iconInfoSvg();
    const safe = window.x4EscapeHtml(message || "");
    const badge = count && count > 1 ? `<span class="x4Toast__count">×${count}</span>` : "";
    return `
      <div class="x4Toast x4Toast--${lvl}" role="status" data-toast-id="${id}">
        <div class="x4Toast__icon" aria-hidden="true">${icon}</div>
        <div class="x4Toast__msg">${safe}${badge}</div>
        <button class="x4Toast__close" type="button" aria-label="Close">✕</button>
      </div>
    `;
  }

  function iconInfoSvg() {
    return `
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
        <path fill="currentColor" d="M12 2C6.49 2 2 6.49 2 12s4.49 10 10 10 10-4.49 10-10S17.51 2 12 2zm0 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16z"/>
        <path fill="currentColor" d="M11 10h2v7h-2z"/>
        <path fill="currentColor" d="M11 7h2v2h-2z"/>
      </svg>`;
  }
  function iconWarningSvg() {
    return `
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
        <path fill="currentColor" d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/>
      </svg>`;
  }
  function iconCriticalSvg() {
    return `
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
        <path fill="currentColor" d="M12 2C6.49 2 2 6.49 2 12s4.49 10 10 10 10-4.49 10-10S17.51 2 12 2zm3.54 13.46-1.08 1.08L12 13.08l-2.46 2.46-1.08-1.08L10.92 12 8.46 9.54l1.08-1.08L12 10.92l2.46-2.46 1.08 1.08L13.08 12l2.46 2.46z"/>
      </svg>`;
  }

  function showToast(message, level, opts = {}) {
    const host = ensureToastHost();
    const lvl = normalizeLevel(level);
    const cfg = { ...TOAST_DEFAULTS[lvl], ...opts };
    const key = toastKey(lvl, message);
    const ts = nowMs();

    // Dedupe: same message in short window -> increment counter
    const last = toastState.lastByKey.get(key);
    if (last && ts - last.ts <= toastState.dedupeWindowMs) {
      last.count = (last.count || 1) + 1;
      last.ts = ts;
      const el = host.querySelector(`[data-toast-id="${last.id}"] .x4Toast__msg`);
      if (el) {
        const safe = window.x4EscapeHtml(message || "");
        el.innerHTML = `${safe}<span class="x4Toast__count">×${last.count}</span>`;
      }
      return last.id;
    }

    const id = window.uid("toast");
    toastState.lastByKey.set(key, { id, ts, count: 1 });

    // Enforce max visible
    const existing = host.querySelectorAll(".x4Toast");
    if (existing.length >= toastState.maxVisible) {
      const first = existing[existing.length - 1];
      if (first) first.remove();
    }

    host.insertAdjacentHTML("afterbegin", renderToast({ id, level: lvl, message, count: 1 }));
    const toastEl = host.querySelector(`[data-toast-id="${id}"]`);
    if (!toastEl) return id;

    // Close interactions
    const closeBtn = toastEl.querySelector(".x4Toast__close");
    if (closeBtn) closeBtn.addEventListener("click", () => removeToast(id));
    toastEl.addEventListener("click", (e) => {
      // click anywhere except selecting text closes (nice UX)
      if (e.target && e.target.classList && e.target.classList.contains("x4Toast__close")) return;
      removeToast(id);
    });

    // Timer + hover pause
    let timer = null;
    let remaining = cfg.ttl || 0;
    let startedAt = 0;

    function startTimer() {
      if (cfg.sticky || !remaining || remaining <= 0) return;
      startedAt = nowMs();
      timer = window.setTimeout(() => removeToast(id), remaining);
    }

    function pauseTimer() {
      if (!timer) return;
      window.clearTimeout(timer);
      timer = null;
      const elapsed = nowMs() - startedAt;
      remaining = Math.max(0, remaining - elapsed);
    }

    toastEl.addEventListener("mouseenter", pauseTimer);
    toastEl.addEventListener("mouseleave", startTimer);
    startTimer();

    return id;
  }

  // Public API
  window.toast = function toast(message, level, opts) {
    return showToast(message, level, opts);
  };
  window.toast.info = (m, o) => showToast(m, "info", o);
  window.toast.warning = (m, o) => showToast(m, "warning", o);
  window.toast.critical = (m, o) => showToast(m, "critical", o);

  /* ---------------- Status (backwards compatible) ---------------- */

  window.setStatus = function setStatus(target, text, state) {
    // Project-wide: status feedback is shown exclusively via toasts.
    const msg = String(text || "").trim();
    if (!msg) return;

    const s = String(state || "").toLowerCase();
    const lvl = s === "warn" ? "warning" : s === "bad" ? "critical" : "info";
    showToast(msg, lvl);
  };

  /* ---------------- Escape helpers ---------------- */

  window.x4EscapeHtml = function x4EscapeHtml(v) {
    return String(v ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  };

  window.x4EscapeAttr = function x4EscapeAttr(v) {
    return window.x4EscapeHtml(v);
  };

  // Backwards-compatible aliases (older view modules may call these)
  // Keep these names stable to avoid runtime errors.
  window.escapeHtml = window.x4EscapeHtml;
  window.escapeAttr = window.x4EscapeAttr;
  window.escapeVal = function escapeVal(v) {
    return window.x4EscapeHtml(v);
  };

  /* ---------------- Required-field UI + validation ---------------- */

  function findLabelFor(el) {
    if (!el) return null;
    const id = el.getAttribute("id");
    if (id) {
      const byFor = document.querySelector(`label[for="${CSS.escape(id)}"]`);
      if (byFor) return byFor;
    }
    // common structure: <div><label>..</label><input..></div>
    const wrap = el.closest("div");
    if (wrap) {
      const lbl = wrap.querySelector("label");
      if (lbl) return lbl;
    }
    return null;
  }

  function ensureHint(el, text) {
    const wrap = el.closest("div") || el.parentElement;
    if (!wrap) return null;
    let hint = wrap.querySelector(".fieldHint");
    if (!hint) {
      hint = document.createElement("div");
      hint.className = "fieldHint";
      wrap.appendChild(hint);
    }
    hint.textContent = text || "Required field";
    return hint;
  }

  function clearInvalid(el) {
    try {
      el.classList.remove("is-invalid");
      // Special case: hidden required fields often back a visual selector (e.g. tagGrid)
      const t = (el.getAttribute("type") || "").toLowerCase();
      if (t === "hidden" && el.nextElementSibling && el.nextElementSibling.classList) {
        el.nextElementSibling.classList.remove("is-invalid");
      }

      const wrap = el.closest("div") || el.parentElement;
      const hint = wrap ? wrap.querySelector(".fieldHint") : null;
      if (hint) hint.remove();
    } catch (_) {}
  }

  window.x4ApplyRequiredUI = function x4ApplyRequiredUI(container) {
    const root = typeof container === "string" ? document.querySelector(container) : container;
    if (!root) return;

    root.querySelectorAll("input[required], select[required], textarea[required]").forEach((el) => {
      const lbl = findLabelFor(el);
      if (lbl) lbl.classList.add("req");

      // Clear invalid markers as user interacts
      const handler = () => clearInvalid(el);
      el.addEventListener("input", handler, { passive: true });
      el.addEventListener("change", handler, { passive: true });
    });
  };

  function isEmptyRequired(el) {
    const t = (el.getAttribute("type") || "").toLowerCase();
    if (t === "checkbox" || t === "radio") return !el.checked;
    if (el.tagName === "SELECT") return !String(el.value || "").trim();
    return !String(el.value || "").trim();
  }

  window.x4ValidateRequired = function x4ValidateRequired(container) {
    const root = typeof container === "string" ? document.querySelector(container) : container;
    if (!root) return { ok: true };

    // Make sure required labels are marked
    window.x4ApplyRequiredUI(root);

    const required = Array.from(root.querySelectorAll("input[required], select[required], textarea[required]"))
      .filter((el) => !el.disabled && el.getAttribute("aria-hidden") !== "true");

    for (const el of required) {
      if (!isEmptyRequired(el)) continue;

      const t = (el.getAttribute("type") || "").toLowerCase();
      el.classList.add("is-invalid");
      // Mirror invalid state to common visual controls
      if (t === "hidden" && el.nextElementSibling && el.nextElementSibling.classList) {
        el.nextElementSibling.classList.add("is-invalid");
      }

      ensureHint(el, el.getAttribute("data-x4-hint") || "Required field");

      const lblTxt = (el.getAttribute("data-x4-label") || (findLabelFor(el)?.textContent || "Required field"))
        .replace(/\s*\*\s*$/, "")
        .trim();

      const msg = `${lblTxt} is required.`;
      // Focus first invalid for convenience
      try { el.focus(); } catch (_) {}
      return { ok: false, msg };
    }

    return { ok: true };
  };

  /* ---------------- Utility helpers ---------------- */

  window.downloadFile = function downloadFile(filename, content, mime) {
    const blob = new Blob([content], { type: mime || "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  window.uid = function uid(prefix) {
    return (prefix || "id") + "_" + Math.random().toString(36).slice(2, 9);
  };

  /* ---------------- Consistent icon action buttons ---------------- */

  /**
   * Render a small icon button used in table action columns.
   * Uses the shared dataset convention: data-x4-action / data-x4-type / data-x4-idx
   *
   * @param {"edit"|"delete"} action
   * @param {string} type
   * @param {number} idx
   * @returns {string}
   */
  window.x4IconBtn = function x4IconBtn(action, type, idx) {
    const isDelete = action === "delete";
    const cls = `iconBtn ${isDelete ? "danger" : ""}`.trim();
    const title = isDelete ? "Delete" : "Edit";
    const symbol = isDelete ? "🗑" : "✎";
    return `<button class="${cls}" title="${title}" data-x4-action="${action}" data-x4-type="${window.x4EscapeAttr(type)}" data-x4-idx="${idx}">${symbol}</button>`;
  };

  /* ---------------- Blocked overlay helper ---------------- */

  /**
   * Render a consistent blocked overlay (used across views).
   * Kept global for backwards compatibility (some views call renderBlockedOverlay directly).
   *
   *  {string} text
   *  {string}
   */
  window.renderBlockedOverlay = function renderBlockedOverlay(text) {
    return `
      <div class="blockedOverlay" aria-hidden="true">
        <div class="blockedMsg">
          <div class="ttl">Section locked</div>
          <div class="txt">${window.x4EscapeHtml(text || "")}</div>
        </div>
      </div>
    `;
  };

  /* ---------------- Shared modal framework ----------------
   * Used by multiple views (Servers, Services, Provisioning, ...)
   * Keeps behavior consistent:
   * - solid modal, semi-transparent backdrop
   * - close via buttons or clicking backdrop
   * - tag toggles inside modal
   */

  function closeModal() {
    $("#x4ModalBack").remove();
    $(document).off("click.x4ModalTags");
  }

  function renderToggleTag(label, isOn, extraDataset = {}) {
    const on = !!isOn;
    const attrs = Object.entries(extraDataset || {})
      .map(([k, v]) => ` data-${window.x4EscapeAttr(k)}="${window.x4EscapeAttr(v)}"`)
      .join("");

    return `
      <div class="tag ${on ? "on" : "off"}" data-toggle="1"${attrs}>
        <span class="name">${window.x4EscapeHtml(label)}</span>
        <span class="state">${on ? "✔" : "✖"}</span>
      </div>
    `;
  }

  function collectToggleTags(containerSel) {
    const out = [];
    $(`${containerSel} .tag`).each(function () {
      if ($(this).hasClass("on")) {
        out.push($(this).find(".name").text().trim());
      }
    });
    return out;
  }

  window.X4Modal = {
    open({ title, bodyHtml, onSave, onOpen }) {
      closeModal();

      const html = `
        <div class="modalBack" id="x4ModalBack">
          <div class="modal" role="dialog" aria-modal="true">
            <div class="modalHd">
              <div class="ttl">${window.x4EscapeHtml(title || "")}</div>
              <button class="secondary" id="mClose">Close</button>
            </div>
            <div class="modalBd">
              ${bodyHtml || ""}
            </div>
            <div class="modalFt">
              <button class="secondary" id="mCancel">Cancel</button>
              <button id="mSave">Save</button>
            </div>
          </div>
        </div>
      `;

      $("body").append(html);

      $("#mClose, #mCancel").on("click", () => closeModal());
      $("#x4ModalBack").on("click", (e) => {
        if (e.target && e.target.id === "x4ModalBack") closeModal();
      });

      $("#mSave").on("click", () => {
        if (typeof onSave !== "function") {
          closeModal();
          return;
        }

        const res = onSave();
        if (res && res.ok === false) {
          const msg = String(res.msg || "Error").trim();
          if (msg) window.toast.critical(msg);
          return;
        }
        closeModal();
      });

      // Tag toggles inside modal
      $(document).on("click.x4ModalTags", "#x4ModalBack .tag[data-toggle='1']", function () {
        const on = $(this).hasClass("on");
        $(this).toggleClass("on", !on).toggleClass("off", on);
        $(this).find(".state").text(!on ? "✔" : "✖");
      });

      if (typeof onOpen === "function") onOpen();

      // Mark required labels and prepare validation UI
      window.x4ApplyRequiredUI("#x4ModalBack");
    },

    close: closeModal,
    renderToggleTag,
    collectToggleTags
  };


})();

