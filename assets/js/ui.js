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

  window.NAMESPACE = "crx.hub";

  /**
   * Generate a reasonably unique DOM id.
   *
   * This project is intentionally dependency-light; we do not pull in
   * external UUID libraries. A missing uid() previously caused runtime
   * exceptions during toast rendering, which then broke several flows
   * that rely on toast feedback (copy/apply/reset etc.).
   *
   * @param {string} [prefix="id"]
   * @returns {string}
   */
  window.uid = window.uid || function uid(prefix = "id") {
    const p = String(prefix || "id").replaceAll(/[^a-zA-Z0-9_-]/g, "");
    const rnd = Math.random().toString(36).slice(2, 8);
    return `${p}-${Date.now().toString(36)}-${rnd}`;
  };

  /**
   * Global namespace used for localStorage keys and download filenames.
   * Keep this stable once published to avoid breaking user configs.
   * @type {string}
   */


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
    let host = document.getElementById("ffToastHost");
    if (host) return host;
    host = document.createElement("div");
    host.id = "ffToastHost";
    host.setAttribute("aria-live", "polite");
    host.setAttribute("aria-relevant", "additions");
    document.body.appendChild(host);
    // Align to the main content container so toasts are flush with the app layout,
    // not the browser edge.
    alignToastHostToContent();
    return host;
  }

  function alignToastHostToContent() {
    const host = document.getElementById("ffToastHost");
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
    const safe = window.ffEscapeHtml(message || "");
    const badge = count && count > 1 ? `<span class="ffToast__count">×${count}</span>` : "";
    return `
      <div class="ffToast ffToast--${lvl}" role="status" data-toast-id="${id}">
        <div class="ffToast__icon" aria-hidden="true">${icon}</div>
        <div class="ffToast__msg">${safe}${badge}</div>
        <button class="ffToast__close" type="button" aria-label="Close">✕</button>
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
    // Toasts must never crash the app.
    // If anything goes wrong (DOM, missing helpers, CSP quirks), we degrade
    // gracefully by logging and returning.
    try {
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
      const el = host.querySelector(`[data-toast-id="${last.id}"] .ffToast__msg`);
      if (el) {
        const safe = window.ffEscapeHtml(message || "");
        el.innerHTML = `${safe}<span class="ffToast__count">×${last.count}</span>`;
      }
      return last.id;
    }

    const id = window.uid("toast");
    toastState.lastByKey.set(key, { id, ts, count: 1 });

    // Enforce max visible
    const existing = host.querySelectorAll(".ffToast");
    if (existing.length >= toastState.maxVisible) {
      const first = existing[existing.length - 1];
      if (first) first.remove();
    }

    host.insertAdjacentHTML("afterbegin", renderToast({ id, level: lvl, message, count: 1 }));
    const toastEl = host.querySelector(`[data-toast-id="${id}"]`);
    if (!toastEl) return id;

    // Close interactions
    const closeBtn = toastEl.querySelector(".ffToast__close");
    if (closeBtn) closeBtn.addEventListener("click", () => removeToast(id));
    toastEl.addEventListener("click", (e) => {
      // click anywhere except selecting text closes (nice UX)
      if (e.target && e.target.classList && e.target.classList.contains("ffToast__close")) return;
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
    } catch (err) {
      console.warn("[FlowForge] Toast failed:", err);
      return null;
    }
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

  window.ffEscapeHtml = function ffEscapeHtml(v) {
    return String(v ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  };

  window.ffEscapeAttr = function ffEscapeAttr(v) {
    return window.ffEscapeHtml(v);
  };

  // Backwards-compatible aliases (older view modules may call these)
  // Keep these names stable to avoid runtime errors.
  window.escapeHtml = window.ffEscapeHtml;
  window.escapeAttr = window.ffEscapeAttr;
  window.escapeVal = function escapeVal(v) {
    return window.ffEscapeHtml(v);
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

  window.ffApplyRequiredUI = function ffApplyRequiredUI(container) {
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

  window.ffValidateRequired = function ffValidateRequired(container) {
    const root = typeof container === "string" ? document.querySelector(container) : container;
    if (!root) return { ok: true };

    // Make sure required labels are marked
    window.ffApplyRequiredUI(root);

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

      ensureHint(el, el.getAttribute("data-ff-hint") || "Required field");

      const lblTxt = (el.getAttribute("data-ff-label") || (findLabelFor(el)?.textContent || "Required field"))
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

  /*
    Modal lifecycle helpers

    The view modules call FFModal.open() for all Add/Edit actions.
    FFModal.open() always attempts to close any existing modal first.
    If closeModal() is missing/undefined, the very first open() call will
    throw and no modal will ever be rendered.
  */

  /** @type {HTMLElement|null} */
  let lastActiveEl = null;

  function closeModal() {
    // Remove delegated modal handlers to avoid stacking duplicates.
    $(document).off("click.ffModalTags");
    $(document).off("keydown.ffModalEsc");

    const back = document.getElementById("ffModalBack");
    if (back) {
      try { back.remove(); } catch (_) {}
    }

    // Restore page scroll.
    document.documentElement.classList.remove("modalOpen");
    document.body.classList.remove("modalOpen");

    // Restore focus to the element that opened the modal (best effort).
    if (lastActiveEl && typeof lastActiveEl.focus === "function") {
      try { lastActiveEl.focus(); } catch (_) {}
    }
    lastActiveEl = null;
  }

  window.downloadFile = 
  function downloadFile(filename, data, mime = "application/octet-stream") {
    try {
      let blob;
      if (data instanceof Blob) {
        blob = data;
      } else if (data instanceof Uint8Array || ArrayBuffer.isView(data)) {
        blob = new Blob([data], { type: mime });
      } else if (data instanceof ArrayBuffer) {
        blob = new Blob([new Uint8Array(data)], { type: mime });
      } else {
        blob = new Blob([String(data ?? "")], { type: mime });
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename || "download";
      document.body.appendChild(a);
      a.click();
      a.remove();

      // Delay revoke to avoid truncated downloads in some browsers
      setTimeout(() => URL.revokeObjectURL(url), 1500);
    } catch (e) {
      console.error(e);
      window.toast?.critical("Download failed.");
    }
  }

  function renderToggleTag(label, isOn, extraDataset = {}) {
    const on = !!isOn;
    const attrs = Object.entries(extraDataset || {})
      .map(([k, v]) => ` data-${window.ffEscapeAttr(k)}="${window.ffEscapeAttr(v)}"`)
      .join("");

    return `
      <div class="tag ${on ? "on" : "off"}" data-toggle="1"${attrs}>
        <span class="name">${window.ffEscapeHtml(label)}</span>
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

  /**
   * Minimal modal framework used by all views.
   *
   * Goals:
   * - No external dependencies (besides jQuery already used in the app)
   * - One modal on screen at a time
   * - Supports form-style modals (OK/Cancel) and custom HTML bodies
   */
  window.FFModal = {
    open({ title, bodyHtml, onSave, onOpen }) {
      // Remember focus so we can restore it on close.
      lastActiveEl = document.activeElement instanceof HTMLElement ? document.activeElement : null;

      // Ensure we never have two modals at once.
      closeModal();

      const html = `
        <div class="modalBack" id="ffModalBack">
          <div class="modal" role="dialog" aria-modal="true">
            <div class="modalHd">
              <div class="ttl">${window.ffEscapeHtml(title || "")}</div>
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

      // Prevent background scroll (CSS can optionally use .modalOpen).
      document.documentElement.classList.add("modalOpen");
      document.body.classList.add("modalOpen");

      $("#mClose, #mCancel").on("click", () => closeModal());
      $("#ffModalBack").on("click", (e) => {
        if (e.target && e.target.id === "ffModalBack") closeModal();
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
      $(document).on("click.ffModalTags", "#ffModalBack .tag[data-toggle='1']", function () {
        const on = $(this).hasClass("on");
        $(this).toggleClass("on", !on).toggleClass("off", on);
        $(this).find(".state").text(!on ? "✔" : "✖");
      });

      // ESC closes the modal (common UX expectation).
      $(document).on("keydown.ffModalEsc", (e) => {
        if (e.key === "Escape") closeModal();
      });

      if (typeof onOpen === "function") onOpen();

      // Mark required labels and prepare validation UI
      window.ffApplyRequiredUI("#ffModalBack");

      // Focus the first focusable control for keyboard users.
      try {
        const first = document.querySelector("#ffModalBack input, #ffModalBack select, #ffModalBack textarea, #ffModalBack button");
        first?.focus?.();
      } catch (_) {}
    },

    close: closeModal,
    renderToggleTag,
    collectToggleTags
  };


})();

