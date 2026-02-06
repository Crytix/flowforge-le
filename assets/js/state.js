/*
  FlowForge LE — State & Configuration Lifecycle

  Resolution order:
  1) localStorage
  2) conf/flowforge.default.json
  3) internal fallback
*/

(() => {
  "use strict";

  window.CFG = null;
  const NAMESPACE = "crx.hub";
  const STORAGE_KEY = "crx.hub.flowforge.le.config";
    // Legacy key from the former legacy app Manager (kept for automatic migration)
  const LEGACY_STORAGE_KEY = ["x","4infra_manager_config"].join("");
  const LEGACY_STORAGE_KEY_2 = "flowforge_le_config";

  const INTERNAL_DEFAULT = {
    meta: { app: "FlowForge LE", version: "1.0.0" },
    debian: { udevPath: "/etc/udev/rules.d/10-flowforge-ifnames.rules", disablePredictable: true },
    envs: [],
    zones: [],
    vlans: [],
    firewalls: [],
    services: [],
    servers: []
  };

  function migrateLegacyConfig(cfg) {
    try {
      if (!cfg || typeof cfg !== "object") return cfg;
      // Migrate old udev path naming (legacy app → FlowForge)
      // Old configs used "x"+"4infra" in the generated udev rules path.
      // Keep this migration forever; it is harmless when not applicable.
      const legacyToken = ["x","4infra"].join("");
      if (cfg.debian && typeof cfg.debian.udevPath === "string" && cfg.debian.udevPath.includes(legacyToken)) {
        cfg.debian.udevPath = cfg.debian.udevPath.replace(legacyToken, "flowforge");
      }

      // Normalize meta/app
      if (!cfg.meta) cfg.meta = {};
      if (!cfg.meta.app) cfg.meta.app = "FlowForge LE";
      if (!cfg.meta.tagline) cfg.meta.tagline = "Where network flows are forged.";
      return cfg;
    } catch {
      return cfg;
    }
  }


  function loadFromLocalStorage() {
    try {
      let raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) raw = localStorage.getItem(LEGACY_STORAGE_KEY);
      if (!raw) raw = localStorage.getItem(LEGACY_STORAGE_KEY_2);
      if (!raw) return null;
      return migrateLegacyConfig(JSON.parse(raw));
    } catch (err) {
      console.warn("[FlowForge] Failed to parse localStorage config, ignoring.", err);
      return null;
    }
  }

  function saveToLocalStorage() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(window.CFG));
    } catch (err) {
      console.error("[FlowForge] Failed to save config to localStorage.", err);
    }
  }

  async function loadFromDefaultFile() {
    const response = await fetch("conf/flowforge.default.json", { cache: "no-store" });
    if (!response.ok) throw new Error("Default config not found");
    return response.json();
  }

  function normalizeConfig(cfg) {
    // Backward compatibility: older configs may not have zones or vlans.scopes
    cfg = cfg || {};
    cfg.meta = cfg.meta || { app: "FlowForge Manager" };
    cfg.debian = cfg.debian || INTERNAL_DEFAULT.debian;

    cfg.envs = Array.isArray(cfg.envs) ? cfg.envs : [];
    cfg.zones = Array.isArray(cfg.zones) ? cfg.zones : [];
    cfg.vlans = Array.isArray(cfg.vlans) ? cfg.vlans : [];
    cfg.firewalls = Array.isArray(cfg.firewalls) ? cfg.firewalls : [];
    cfg.services = Array.isArray(cfg.services) ? cfg.services : [];
    cfg.servers = Array.isArray(cfg.servers) ? cfg.servers : [];

    // --- Normalize env objects (and add optional domain) ---
    cfg.envs = cfg.envs
      .map(e => {
        if (!e) return null;
        // legacy: env could be a string tag
        if (typeof e === "string") {
          return { name: e, tag: e, comment: "", domain: "" };
        }
        return {
          name: e.name || "",
          tag: e.tag || "",
          comment: e.comment || "",
          domain: e.domain || ""
        };
      })
      .filter(Boolean);

    // --- Normalize zones ---
    cfg.zones = cfg.zones
      .map(z => {
        if (!z) return null;
        return {
          name: z.name || "",
          tag: z.tag || "",
          envTags: Array.isArray(z.envTags) ? z.envTags : (Array.isArray(z.envs) ? z.envs : [])
        };
      })
      .filter(Boolean);

    // Migrate VLAN gateways -> scopes (best-effort)
    cfg.vlans.forEach(v => {
      // normalize minimal shape
      v.name = v.name || "";
      v.vlanId = (v.vlanId ?? v.id ?? "") + "";
      v.cidr = v.cidr || "";
      v.iface = v.iface || v.interface || "";

      if (Array.isArray(v.scopes)) return;
      v.scopes = [];
      if (v.gateways && typeof v.gateways === "object") {
        for (const [envTag, gw] of Object.entries(v.gateways)) {
          v.scopes.push({ envTag, zoneTag: "CORE", gwDefault: (gw||{}).default || "", gwFallback: (gw||{}).fallback || "" });
        }
        delete v.gateways;
      }
    });

    // Migrate firewalls envs[] -> scopes[]
    cfg.firewalls.forEach(f => {
      f.name = f.name || "";
      if (Array.isArray(f.scopes)) return;
      f.scopes = [];
      (f.envs || []).forEach(envTag => f.scopes.push({ envTag, zoneTag: "CORE" }));
      delete f.envs;
    });

    // --- Normalize services (comment + portItems) ---
    cfg.services = cfg.services
      .map(s => {
        if (!s) return null;

        // legacy: service might be a string name
        if (typeof s === "string") {
          return { name: s, comment: "", portItems: [] };
        }

        const out = {
          name: s.name || "",
          comment: s.comment || s.description || "",
          portItems: Array.isArray(s.portItems) ? s.portItems.slice() : []
        };

        // legacy: proto + ports (string)
        if (!out.portItems.length) {
          const legacyProto = (s.proto || "TCP").toUpperCase();
          const legacyPorts = s.ports || s.port || "";
          if (legacyPorts) {
            out.portItems.push({ proto: legacyProto === "TCP/UDP" ? "TCP/UDP" : legacyProto, value: String(legacyPorts) });
          }
        }

        // normalize portItems values
        out.portItems = out.portItems
          .map(pi => {
            if (!pi) return null;
            const proto = String(pi.proto || "TCP").toUpperCase();
            const value = String(pi.value ?? pi.ports ?? "").trim();
            return { proto: (proto === "TCPUDP" ? "TCP/UDP" : proto), value };
          })
          .filter(pi => pi && pi.value);

        return out;
      })
      .filter(Boolean);

    // --- Normalize servers (os + roles + arrays) ---
    cfg.servers = cfg.servers
      .map(s => {
        if (!s) return null;
        const envs = Array.isArray(s.envs) ? s.envs : (Array.isArray(s.environments) ? s.environments : []);
        const vlans = Array.isArray(s.vlans) ? s.vlans : (Array.isArray(s.networks) ? s.networks : []);
        const services = Array.isArray(s.services) ? s.services : [];
        const roles = (s.roles && typeof s.roles === "object") ? s.roles : {};
        const routes = Array.isArray(s.routes) ? s.routes : [];
        const firewallRules = Array.isArray(s.firewallRules) ? s.firewallRules : (Array.isArray(s.fwRules) ? s.fwRules : []);
        return {
          name: s.name || "",
          octet: (s.octet ?? "") + "",
          os: (s.os || "debian").toLowerCase(),
          envs,
          vlans,
          services,
          routes: routes.filter(Boolean),
          firewallRules: firewallRules.filter(Boolean),
          roles: {
            dns: !!roles.dns,
            ntp: !!roles.ntp
          }
        };
      })
      .filter(Boolean);

    // Keep provisioning settings container for future compatibility
    cfg.provisioning = (cfg.provisioning && typeof cfg.provisioning === "object") ? cfg.provisioning : {};

    return cfg;
  }

  // Expose normalization for the Settings import (and advanced users).
  // Keeping this public ensures imported configs won't break views by
  // missing arrays or legacy fields.
  window.normalizeConfig = normalizeConfig;

  window.initConfig = async function initConfig() {
    const stored = loadFromLocalStorage();
    if (stored) {
      window.CFG = normalizeConfig(stored);
      console.info("[FlowForge] Configuration loaded from localStorage.");
      saveToLocalStorage();
      return;
    }

    try {
      const fileCfg = await loadFromDefaultFile();
      window.CFG = normalizeConfig(fileCfg);
      saveToLocalStorage();
      console.info("[FlowForge] Default configuration loaded from conf/.");
      return;
    } catch (err) {
      console.warn("[FlowForge] Default config file not available.", err);
    }

    window.CFG = structuredClone(INTERNAL_DEFAULT);
    saveToLocalStorage();
    console.info("[FlowForge] Internal fallback configuration initialized.");
  };

  window.saveConfig = function saveConfig() {
    saveToLocalStorage();
  };

  window.resetConfig = async function resetConfig() {
    // Remove current key and any legacy keys so "Reset" truly resets.
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(LEGACY_STORAGE_KEY);
      localStorage.removeItem(LEGACY_STORAGE_KEY_2);
    } catch (_) {}

    await window.initConfig();
  };
})();
