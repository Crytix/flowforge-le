/*
  X4Infra Manager — Interface Rename View (Debian)

  Generates a copy/paste script to create udev naming rules based on VLAN CIDR
  and detected IPs on the target host.
*/

(() => {
  "use strict";

  window.renderRenameView = function renderRenameView() {
    const $view = $("#renameView");

    const servers = window.CFG.servers || [];
    const serverOptions = servers.map(s => `<option value="${x4EscapeAttr(s.name)}">${x4EscapeHtml(s.name)}</option>`).join("");

    const defaultUdevPath = (window.CFG.debian && window.CFG.debian.udevPath)
      ? window.CFG.debian.udevPath
      : "/etc/udev/rules.d/10-x4infra-ifnames.rules";

    const defaultDisablePredictable = (window.CFG.debian && window.CFG.debian.disablePredictable) ? "true" : "false";

    const html = `
      <div class="grid">
        <div class="card">
          <div class="hd">
            <h2>Interface Rename (Debian)</h2>
            <div class="hint">Erzeugt ein Copy/Paste-Skript (udev rules + optional GRUB Hinweis).</div>
          </div>
          <div class="bd">
            <div class="two" style="margin-bottom:10px">
              <div>
                <label>Server</label>
                <select id="renameServerSel">
                  ${serverOptions || `<option value="">(keine Server definiert)</option>`}
                </select>
              </div>
              <div>
                <label>Skript-Dateiname</label>
                <input id="renameScriptName" value="x4infra-ifrename.sh" />
              </div>
            </div>

            <div class="two" style="margin-bottom:10px">
              <div>
                <label>udev Rule Path</label>
                <input id="renameUdevPath" value="${x4EscapeAttr(defaultUdevPath)}" />
              </div>
              <div>
                <label>GRUB: Predictable Names deaktivieren (optional)</label>
                <select id="renameDisablePredictable">
                  <option value="true" ${defaultDisablePredictable === "true" ? "selected" : ""}>Ja</option>
                  <option value="false" ${defaultDisablePredictable === "false" ? "selected" : ""}>Nein</option>
                </select>
              </div>
            </div>

            <div class="rowActions" style="justify-content:flex-end">
              <button id="renameBuildBtn">Copy-Block erzeugen</button>
              <button class="secondary" id="renameCopyBtn">Kopieren</button>
            </div>

            <div class="status small" id="renameStatus"></div>
          </div>
        </div>

        <div class="card">
          <div class="hd">
            <h2>Copy-Block</h2>
            <div class="hint">Skript mit sudo ausführen; Reboot wird empfohlen.</div>
          </div>
          <div class="bd">
            <textarea id="renameOut" readonly style="min-height:520px"></textarea>
          </div>
        </div>

      </div>
    `;

    $view.html(html);
    bindRenameEvents();
  };

  function bindRenameEvents() {
    $("#renameBuildBtn").on("click", () => {
      const serverName = $("#renameServerSel").val();
      if (!serverName) {
        setStatus("#renameStatus", "Bitte einen Server auswählen.", "warn");
        return;
      }

      window.CFG.debian = window.CFG.debian || {};
      window.CFG.debian.udevPath = $("#renameUdevPath").val().trim() || "/etc/udev/rules.d/10-x4infra-ifnames.rules";
      window.CFG.debian.disablePredictable = $("#renameDisablePredictable").val() === "true";
      window.saveConfig();

      const block = buildCopyBlock(serverName);
      $("#renameOut").val(block);
      setStatus("#renameStatus", "Copy-Block erzeugt.", "ok");
    });

    $("#renameCopyBtn").on("click", async () => {
      const txt = $("#renameOut").val();
      if (!txt) {
        setStatus("#renameStatus", "Kein Output vorhanden.", "warn");
        return;
      }
      try {
        await navigator.clipboard.writeText(txt);
        setStatus("#renameStatus", "Kopiert.", "ok");
      } catch {
        setStatus("#renameStatus", "Kopieren nicht möglich (Browser Rechte).", "bad");
      }
    });
  }

  function buildCopyBlock(serverName) {
    const srv = (window.CFG.servers || []).find(s => s.name === serverName);
    if (!srv) return "# ERROR: Server not found\n";

    const oct = parseInt(srv.octet, 10);
    if (!Number.isFinite(oct) || oct < 1 || oct > 254) {
      return `# ERROR: Server "${serverName}" has an invalid octet value.\n`;
    }

    const assignedVlans = (srv.vlans || [])
      .map(name => (window.CFG.vlans || []).find(v => v.name === name))
      .filter(Boolean);

    if (!assignedVlans.length) {
      return `# ERROR: Server "${serverName}" has no VLAN assignments.\n`;
    }

    const mappingLines = assignedVlans.map(v => `  ("${v.cidr}", "${v.iface}", "${v.name}")`);

    const udevPath = (window.CFG.debian && window.CFG.debian.udevPath)
      ? window.CFG.debian.udevPath
      : "/etc/udev/rules.d/10-x4infra-ifnames.rules";

    const disablePredictable = !!(window.CFG.debian && window.CFG.debian.disablePredictable);
    const scriptName = $("#renameScriptName").val().trim() || "x4infra-ifrename.sh";

    const copy = [];
    copy.push("# X4Infra Manager — Debian Interface Rename");
    copy.push(`# Server: ${serverName}`);
    copy.push("");

    if (disablePredictable) {
      copy.push("# OPTIONAL: Disable predictable interface names (GRUB)");
      copy.push("sudo sed -i 's/^GRUB_CMDLINE_LINUX=\"\\(.*\\)\"/GRUB_CMDLINE_LINUX=\"\\1 net.ifnames=0 biosdevname=0\"/' /etc/default/grub");
      copy.push("sudo update-grub");
      copy.push("");
    }

    copy.push("# Create script file");
    copy.push(`cat > ${scriptName} <<'EOF'`);
    copy.push(`#!/usr/bin/env bash
set -euo pipefail

UDEV_PATH="${udevPath}"
TMP_RULES="$(mktemp)"
trap 'rm -f "$TMP_RULES"' EXIT

echo "[X4Infra] Detecting IPv4 addresses (scope global)..."
mapfile -t IFROWS < <(ip -o -4 addr show scope global | awk '{print $2" "$4}')
if [ \${#IFROWS[@]} -eq 0 ]; then
  echo "[X4Infra] ERROR: No global IPv4 addresses found." >&2
  exit 2
fi

# Base rules header
cat > "$TMP_RULES" <<'HDR'
# Generated by X4Infra Manager
# SUBSYSTEM=="net", ACTION=="add", ATTR{address}=="<mac>", NAME="<name>"
HDR

python3 - <<'PY' "$TMP_RULES" "\${IFROWS[@]}"
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
    f.write(ln + "\\n")
PY

echo "[X4Infra] Installing udev rules to: $UDEV_PATH"
sudo install -m 0644 "$TMP_RULES" "$UDEV_PATH"
sudo udevadm control --reload-rules
sudo udevadm trigger --subsystem-match=net

echo "[X4Infra] Done. Reboot is recommended."
echo "[X4Infra] Suggested: sudo reboot"
`);
    copy.push("EOF");
    copy.push(`chmod +x ${scriptName}`);
    copy.push("");
    copy.push("# Run script");
    copy.push(`sudo ./${scriptName}`);
    copy.push("");
    copy.push("# Reboot (recommended)");
    copy.push("# sudo reboot");

    return copy.join("\n");
  }

})();
