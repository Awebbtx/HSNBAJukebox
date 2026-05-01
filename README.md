# HSNBAJukebox

Self-hosted jukebox and request platform designed for Proxmox environments.

This project combines:

- Spotify search and queue controls for admins
- Staff-friendly request/voting experience
- Group-based user management (admins and staff)
- An adoptable-animal slideshow stream backed by Shelter Manager (ASM)
- A dedicated reporting host and reporting dashboards for operational metrics
- Deployment helpers for both incremental deploy and full Proxmox container bootstrap

For deeper product and architecture detail, see [ABOUT.md](ABOUT.md).
Release notes are tracked in [CHANGELOG.md](CHANGELOG.md).
Operational release/context notes are tracked in [GITHUB-NOTES.md](GITHUB-NOTES.md).
Build and execution runbook notes are tracked in [LETS-BUILD-NOTES.md](LETS-BUILD-NOTES.md).

## Current State

- Main runtime is the jukebox/admin service on port `3000` with a reporting-oriented host flow also served from the same codebase.
- Reporting requests are host-gated and expose dedicated reporting pages plus `/api/admin/reporting/*` endpoints.
- Admin, reporting, and staff access are username/password based with group/permission-based authorization.
- Saved playlists can be created, loaded, edited, and deleted from the admin UI.
- Spotify enrollment now includes Mopidy-Spotify credential guidance in the admin settings UI.
- Deployments performed with [deploy.proxmox.ps1](deploy.proxmox.ps1) package Git `HEAD`, so local edits must be committed to be included.

## Core Features

### Playback and Queue Control

- Search Spotify tracks and add to queue
- Randomize, clear, reorder, and remove queued tracks
- Save, load, edit, and delete playlists
- Display now-playing metadata
- Local queue persistence and clearer playlist-load failure handling

### Staff Request Experience

- Mobile-first request page at `/requests.html`
- Username/password sign-in (email usernames)
- Per-user daily request limits
- Queue voting with up/down feedback

### Account and Access Model

- Unified user/account model with admin, reporting, and jukebox permissions
- Session-backed admin and employee auth
- Password reset and invite workflows via shared SMTP/email settings
- Admin account recovery and snapshot-oriented hardening

### Reporting

- Dedicated reporting login and reporting host routing
- Operational dashboards backed by `/api/admin/reporting/*`
- Linked-report support and reporting timeout protections

### Adoptable Stream + ASM Integration

- Pulls adoptable data from ASM service endpoint
- Slideshow controls for interval, limit, and filtering
- Configurable field catalog for slideshow details
- Ordered display slots (1-10) driven by admin settings

### System and Operations

- Server timezone management in admin settings
- SMTP/email service configuration for invites, resets, alerts, and reports
- Audio automation schedules and audio-path diagnostics
- Service log and stream-health diagnostics in admin tooling

### Deployment Tooling

- Windows deploy helper for existing container deployments
- Proxmox-host bootstrap helper to create and configure a brand-new LXC

## Architecture

- Node.js + Express backend in [src/server.js](src/server.js)
- Static frontend pages/scripts under [public](public)
- Mopidy JSON-RPC integration for queue/search
- Mopidy-Spotify enrollment guidance plus Spotify playback controls
- ASM (Shelter Manager) integration for adoptables
- Reporting-host routing and reporting API endpoints from the shared backend

## Authentication Summary

- Admin login endpoint: `/api/admin/session`
- Employee login endpoint: `/api/requests/session`
- Usernames must be email format
- Authorization is permission-driven for admin, reporting, and jukebox operations
- Reporting login uses the same account system with reporting permission checks

## Quick Start (Local)

1. Copy [.env.example](.env.example) to `.env`.
2. Fill required values (`BASE_URL`, Spotify keys, etc).
3. Install and run:

```bash
npm install
npm run dev
```

Default web entry points:

- Home: `http://YOUR_HOST:3000/`
- Admin: `http://YOUR_HOST:3000/admin.html`
- Staff requests: `http://YOUR_HOST:3000/requests.html`

## Deployment Workflows

### 1) Fast Deploy to Existing Container (Windows)

Use [deploy.proxmox.ps1](deploy.proxmox.ps1):

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\deploy.proxmox.ps1
```

This packages current `HEAD`, uploads to Proxmox, deploys into container, installs prod deps, and restarts `hsnba-jukebox`.

Important: this workflow deploys committed Git `HEAD`, not arbitrary working-tree edits.

### 2) Full Proxmox Host Bootstrap (New Container)

Use [proxmox-jukebox-bootstrap.sh](proxmox-jukebox-bootstrap.sh) directly on Proxmox host:

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/Awebbtx/HSNBAJukebox/main/proxmox-jukebox-bootstrap.sh)
```

This helper:

- Finds next available CTID
- Creates Debian 12 LXC
- Installs Node.js + prerequisites
- Clones this repo and installs dependencies
- Seeds default `.env`
- Installs and starts `hsnba-jukebox` service

Override example:

```bash
CTID=120 BRIDGE=vmbr0 ROOTFS_STORAGE=local-lvm TEMPLATE_STORAGE=local REPO_URL=https://github.com/Awebbtx/HSNBAJukebox.git BRANCH=main bash <(curl -fsSL https://raw.githubusercontent.com/Awebbtx/HSNBAJukebox/main/proxmox-jukebox-bootstrap.sh)
```

## Configuration

Environment defaults and comments live in [.env.example](.env.example).

Key groups:

- Server/runtime: `PORT`, `BASE_URL`
- Spotify: `SPOTIFY_*`
- Request controls: `MAX_PENDING_PER_USER`, `REQUESTS_RATE_*`, `EMPLOYEE_SESSION_TTL_MINUTES`
- ASM + slideshow: `ASM_*`, `SLIDESHOW_*`

## Service Unit

Systemd unit template: [hsnba-jukebox.service](hsnba-jukebox.service)

Default runtime path:

- App root: `/opt/HSNBA`
- Service file: `/etc/systemd/system/hsnba-jukebox.service`

## Project Files of Interest

- Backend API: [src/server.js](src/server.js)
- Spotify integration: [src/spotify.js](src/spotify.js)
- Admin UI logic: [public/admin.js](public/admin.js)
- Staff requests UI: [public/requests.js](public/requests.js)
- Adoptable stream UI: [public/adoptable-stream.js](public/adoptable-stream.js)

## Notes

- Spotify playback control typically requires a Premium Spotify account.
- Mopidy endpoint must be reachable from this app host/container.
- If local audio hardware is not available on host, run playback target in a VM/LXC with proper audio passthrough.
- Mopidy-Spotify saved-playlist resolution depends on valid Mopidy Spotify credentials in `mopidy.conf`.
