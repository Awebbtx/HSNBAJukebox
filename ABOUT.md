# About HSNBAJukebox

## Project Understanding

HSNBAJukebox is a self-hosted operations + engagement platform for a real-world environment (staff, visitors, and admins), not just a music toy app.

It combines three domains in one deployable service:

- Collaborative queue and playback control
- Staff authentication and request governance
- ASM-powered adoptable slideshow presentation
- Reporting-host dashboards for shelter and animal-control operational metrics

The project is designed to run cleanly in Proxmox-backed infrastructure with reproducible deployment paths.

## Product Goals

- Give staff an easy way to request and vote on songs from phones
- Give admins reliable queue/playback control and account governance
- Show adoptable animals in a public-facing slideshow stream
- Keep deployment repeatable and low-friction for operators

## Functional Surface

### Audio + Queue Operations

- Search and queue tracks
- Playback controls (transport, volume, modes)
- Queue moderation (move, delete, clear, shuffle)
- Playlist save/load/edit/delete workflows
- Playlist editor popup in admin UI for rename and per-track removal

### Staff Request Workflow

- Email + password sign-in
- Daily request limits per user
- Vote signals on tracks
- Session and API rate control protections

### Admin Governance

- Unified user directory
- Group/permission-based admin privileges
- Password/profile management
- History/audit visibility in settings panels
- Recovery-oriented account hardening and snapshot support

### Reporting Surface

- Dedicated reporting-host routing and reporting login experience
- Reporting dashboards backed by shared admin accounts with reporting permission checks
- Linked-report loading, caching, and timeout protections for operational dashboards

### Adoptable Stream Integration

- Pulls ASM adoptable records
- Applies optional filters and slideshow limits
- Displays mapped data fields in configurable order
- Supports admin-managed field catalog and labeling

### Operations and Diagnostics

- Audio automation schedules for playback, stream delivery, and hardware output behavior
- Server timezone management for scheduler correctness
- SMTP/email configuration for invites, resets, alerts, and reports
- Service-log, stream-health, and audio-path diagnostics in admin tooling

## Technical Design

- Backend: Node.js + Express API in `src/server.js`
- Frontend: static pages in `public/` with focused JS modules
- Storage: JSON-backed operational files in `data/`
- Integrations:
  - Spotify API OAuth + playback
  - Mopidy JSON-RPC
  - ASM/Shelter Manager service API

## Authentication Model (Current)

- Username/password based for both admin and staff use-cases
- Email format usernames
- Single user model with group-based authorization
- Admin APIs require valid admin session token
- Reporting access is permission-gated within the same account system
- Password reset and invite flows are part of the current operational model

## Deployment Design

### Existing Container Deploy

Use `deploy.proxmox.ps1` from Windows to package current Git `HEAD` and deploy to an existing CT.

Operational note: uncommitted local edits are not included in this workflow unless separately hot-deployed.

### New Container Bootstrap

Use `proxmox-jukebox-bootstrap.sh` on Proxmox host to create a fresh LXC, install prerequisites, deploy app, and enable systemd service in one run.

## Configuration Philosophy

- Keep runtime secrets and host-specific values in `.env`
- Keep rich slideshow field mapping in JSON-backed app config (`data/slideshow-config.json`)
- Preserve backwards-compatible env fallbacks only for migration safety

## Key Operational Files

- Service unit: `hsnba-jukebox.service`
- Environment template: `.env.example`
- Windows deploy helper: `deploy.proxmox.ps1`
- Proxmox host bootstrap helper: `proxmox-jukebox-bootstrap.sh`

## Intended Audience

- Shelter/event operators who need reliable music + request controls
- Admin users managing user access and settings
- Technical maintainers operating Proxmox-based hosting

## Current Strengths

- Practical deployment automation
- Unified auth model with permission-driven admin/reporting control
- Configurable adoptable slideshow fields without recurring code edits
- Clear separation between operational controls and public request UI
- Reporting host support without a separate codebase
- Direct admin management for saved playlists and Spotify enrollment guidance

## Future Extension Opportunities

- Rollback helper for data snapshots pre-deploy
- CI checks for lint/test/package quality gates
- Extended slideshow formatting presets (units, transforms, conditional hide)
- Structured backup/restore commands for `data/` and `.env`
