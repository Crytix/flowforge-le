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
  <img src="https://img.shields.io/badge/state_model-json--based-455a64?style=for-the-badge">
</p>

<p align="center">
  <img src="https://github.com/Crytix/flowforge-le/blob/main/readme/flowforge_logo.png?raw=true"
       alt="FlowForge LE Logo"
       width="420">
</p>
<p align="center"><em>Where network flows are forged.</em></p>

---

## Table of Contents

- [Screenshots](#screenshots)
- [Purpose](#purpose)
- [Scope](#scope)
- [Design Principles](#design-principles)
- [Data Model](#data-model)
    - [Entity Responsibilities](#entity-responsibilities)
- [User Interface Behavior](#user-interface-behavior)
    - [Structural Constraints](#structural-constraints)
- [Usage Workflow](#usage-workflow)
- [Local Execution](#local-execution)
- [Non-Goals](#non-goals)
- [License](#license)

---

## Screenshots

| Firewall & Routing                                                                                      | Network Provisioning                                                                                      | Servers                                                                                      | Services                                                                                      |
|---------------------------------------------------------------------------------------------------------|-----------------------------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------|-----------------------------------------------------------------------------------------------|
| ![Firewall & Routing](https://github.com/Crytix/flowforge-le/blob/main/readme/flowforge01.png?raw=true) | ![Network Provisioning](https://github.com/Crytix/flowforge-le/blob/main/readme/flowforge02.png?raw=true) | ![Servers](https://github.com/Crytix/flowforge-le/blob/main/readme/flowforge03.png?raw=true) | ![Services](https://github.com/Crytix/flowforge-le/blob/main/readme/flowforge04.png?raw=true) |

- GitHub repository: https://github.com/Crytix/flowforge-le

---

## Purpose

**FlowForge LE (Local Edition)** is a frontend-only application for modeling and planning
logical network and infrastructure flows.

The tool focuses on **design-time structure**, **relationships**, and **consistency**.  
It does **not** provision, deploy, configure, or operate infrastructure components.

---

## Scope

FlowForge LE supports the following use cases:

- Modeling of environments, zones, and network segments
- Definition of VLANs, gateways, and logical scopes
- Planning and visualization of logical network flows
- Definition of routes and firewall rules at design time
- Validation of structural dependencies and segmentation
- Preparation of clean, deterministic input for downstream tooling

Operational execution is explicitly out of scope.

---

## Design Principles

- Explicit relationships over implicit assumptions
- Enforced hierarchy instead of optional conventions
- Prevention of invalid states by design
- Deterministic and reviewable data structures
- Predictable and side-effect-free UI behavior

The Local Edition deliberately avoids:

- Backend services or APIs
- Persistent databases or server-side storage
- Automation or provisioning logic
- Environment-specific runtime assumptions

---

## Data Model

The internal model follows a strict hierarchical structure:

    └─ Environment
        └─ Service
        └─ Zone
            └─ Network / VLAN
            └─ Firewall
        └─ Server
---


### Entity Responsibilities

| Entity        | Description                                    |
|---------------|------------------------------------------------|
| Environment   | Logical boundary representing an environment   |
| Zone          | Functional or security-related segmentation    |
| Network/VLAN  | Network addressing and segmentation definition |
| Interface Tag | Reusable identifier for consistent naming      |


All relationships are mandatory and explicitly defined.

### Entity Responsibilities

| Entity        | Description                                    |
|---------------|------------------------------------------------|
| Environment   | Logical boundary representing an environment   |
| Zone          | Functional or security-related segmentation    |
| Network/VLAN  | Network addressing and segmentation definition |
| Interface Tag | Reusable identifier for consistent naming      |
| Service       | Logical service definition (ports / protocols) |
| Server        | Logical system with roles, routes, and rules   |

---

## User Interface Behavior

- Each entity level is rendered in a dedicated full-width section
- Create and edit operations are performed via modal dialogs
- Overview views are intentionally read-only
- Edit and delete actions are icon-based and consistently positioned
- Required fields are validated before persistence

### Structural Constraints

- Zones require at least one existing environment
- Networks/VLANs require at least one existing zone
- Invalid dependency states cannot be created through the UI

---

## Usage Workflow

1. Define one or more **Environments**
2. Define **Zones** and associate them with environments
3. Define **Networks / VLANs** and associate them with zones
4. Define **Services**, **Servers**, **Routes**, and **Firewall Rules**

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

- Replace infrastructure-as-code tools
- Validate live network reachability or routing
- Manage deployment or lifecycle states
- Act as an operational source of truth

It exists solely as a **local modeling and planning tool**.

---

## License

MIT License

© Crytix  
https://buymeacoffee.com/crytix
