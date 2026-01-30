/*
  X4Infra Manager — State & Configuration Lifecycle

  Resolution order:
  1) localStorage
  2) conf/x4infra.default.json
  3) internal fallback
*/

(() => {
  "use strict";

  window.CFG = null;
  const STORAGE_KEY = "x4infra_manager_config";

  const INTERNAL_DEFAULT = {
    meta: { app: "X4Infra Manager", version: "1.1" },
    debian: { udevPath: "/etc/udev/rules.d/10-x4infra-ifnames.rules", disablePredictable: true },
    envs: [],
    zones: [],
    vlans: [],
    firewalls: [],
    services: [],
    servers: []
  };

  function loadFromLocalStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (err) {
      console.warn("[X4Infra] Failed to parse localStorage config, ignoring.", err);
      return null;
    }
  }

  function saveToLocalStorage() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(window.CFG));
    } catch (err) {
      console.error("[X4Infra] Failed to save config to localStorage.", err);
    }
  }

  async function loadFromDefaultFile() {
    const response = await fetch("conf/x4infra.default.json", { cache: "no-store" });
    if (!response.ok) throw new Error("Default config not found");
    return response.json();
  }

  function normalizeConfig(cfg) {
    // Backward compatibility: older configs may not have zones or vlans.scopes
    cfg = cfg || {};
    cfg.meta = cfg.meta || { app: "X4Infra Manager" };
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

  window.initConfig = async function initConfig() {
    const stored = loadFromLocalStorage();
    if (stored) {
      window.CFG = normalizeConfig(stored);
      console.info("[X4Infra] Configuration loaded from localStorage.");
      saveToLocalStorage();
      return;
    }

    try {
      const fileCfg = await loadFromDefaultFile();
      window.CFG = normalizeConfig(fileCfg);
      saveToLocalStorage();
      console.info("[X4Infra] Default configuration loaded from conf/.");
      return;
    } catch (err) {
      console.warn("[X4Infra] Default config file not available.", err);
    }

    window.CFG = structuredClone(INTERNAL_DEFAULT);
    saveToLocalStorage();
    console.info("[X4Infra] Internal fallback configuration initialized.");
  };

  window.saveConfig = function saveConfig() {
    saveToLocalStorage();
  };

  window.resetConfig = async function resetConfig() {
    localStorage.removeItem(STORAGE_KEY);
    await window.initConfig();
  };
})();
