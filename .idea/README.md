<p align="center">
  <img src="https://img.shields.io/github/repo-size/Crytix/flowforge-le?style=for-the-badge">
  <img src="https://img.shields.io/github/license/Crytix/flowforge-le?style=for-the-badge">
  <img src="https://img.shields.io/github/last-commit/Crytix/flowforge-le?style=for-the-badge">
  <img src="https://img.shields.io/github/issues/Crytix/flowforge-le?style=for-the-badge">
</p>

<p align="center">
  <img src="https://img.shields.io/badge/edition-local--edition-37474f?style=for-the-badge">
  <img src="https://img.shields.io/badge/status-active-2e7d32?style=for-the-badge">
  <img src="https://img.shields.io/badge/architecture-frontend--only-263238?style=for-the-badge">
  <img src="https://img.shields.io/badge/state-model-json--based-455a64?style=for-the-badge">
</p>

<p align="center">
  <strong>FlowForge LE</strong> — Where network flows are forged.
</p>

---

## Purpose

**FlowForge LE (Local Edition)** is a frontend-only application for modeling and planning
logical network and infrastructure flows.

The tool focuses exclusively on **design-time structure** and **relationships**.
It does not provision, deploy, configure, or operate infrastructure components.

---

## Scope

FlowForge LE supports the following use cases:

- modeling of environments, zones, and network segments
- planning and visualization of logical network flows
- validation of structural dependencies and segmentation
- preparation of clean input for downstream tooling (e.g. IaC, architecture reviews)

Operational execution is explicitly out of scope.

---

## Design Principles

- explicit relationships over implicit assumptions
- enforced hierarchy instead of optional conventions
- prevention of invalid states by design
- deterministic and reviewable data structures
- predictable UI behavior

The Local Edition deliberately avoids:
- backend services or APIs
- persistent storage layers
- automation or provisioning logic
- environment-specific runtime assumptions

---

## Data Model

The internal model follows a strict hierarchical structure:

Environment

└─ Zone

└─ Network / VLAN

---


### Entity Responsibilities

| Entity        | Description |
|---------------|-------------|
| Environment   | Logical boundary representing an environment |
| Zone          | Functional or security-related segmentation |
| Network/VLAN  | Network addressing and segmentation definition |
| Interface Tag | Reusable identifier for consistent naming |

All relationships are mandatory and explicitly defined.

---

## User Interface Behavior

- Each entity level is rendered in a dedicated full-width section
- Create and edit operations are performed via modal dialogs
- Overview views are intentionally read-only
- Edit and delete actions are icon-based and consistently positioned

### Structural Constraints

- Zones require at least one existing environment
- Networks/VLANs require at least one existing zone
- Invalid dependency states cannot be created through the UI

---

## Usage Workflow

1. Define one or more **Environments**
2. Define **Zones** and associate them with environments
3. Define **Networks / VLANs** and associate them with zones

The enforced workflow directly reflects the underlying data model.

---

## Local Execution

Due to browser security restrictions, `fetch()` requests are blocked when loading the application via `file://`.

A local HTTP server is required.

Example using Python:

```bash
python -m http.server 8080
```

Access the application via:

```html
http://localhost:8080
```

---

## Non-Goals

FlowForge LE does not aim to:

- replace infrastructure-as-code tools
- validate live network reachability or routing
- manage deployment or lifecycle states
- act as an operational source of truth

It exists solely as a **local modeling and planning tool**.

---

## License

MIT License

© Crytix  
https://buymeacoffee.com/crytix