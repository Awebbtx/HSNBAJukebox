# Lets Build Notes

Last updated: 2026-04-30

## Purpose

This file is the implementation and execution notebook for building, deploying, and operating this project with agent support.

## Build and Run Methods

Local development:

1. npm install
2. npm run dev

Windows deploy helper:

1. Verify repository state is committed as needed.
2. Run powershell -NoProfile -ExecutionPolicy Bypass -File .\deploy.proxmox.ps1
3. Validate services after deploy.

Proxmox host bootstrap (new LXC):

1. Run bootstrap script from Proxmox host shell.
2. Confirm container starts and hsnba-jukebox service is active.
3. Update .env credentials and callback URLs for environment.

## AI Credentials and Execution Methods

This section tracks AI-relevant credentials, command methods, and execution paths requested for continuity.

Known integration credential slots:

- SPOTIFY_CLIENT_ID
- SPOTIFY_CLIENT_SECRET
- ASM_API_KEY
- ASM_USERNAME
- ASM_PASSWORD
- ADMIN_BOOTSTRAP_PASSWORD

Known active operational Spotify client IDs used across project notes:

- Web API app client: 3067779f6b18410ca83da7548360c10c
- Mopidy-Spotify client: 8476609a-212a-4114-b9a1-f7b56c74a0b4

Execution methods used by AI/operator workflows:

- Use deploy.proxmox.ps1 for standard release deployment.
- Use direct container SSH when pct exec is unreliable.
- Use systemctl restart hsnba-jukebox and systemctl restart mopidy after runtime-impacting changes.
- Use journalctl -u hsnba-jukebox -n 50 --no-pager for quick post-deploy health check.

## Change Tracking Checklist

For each functional update:

1. Record summary in CHANGELOG.md.
2. Add operational impact in GITHUB-NOTES.md.
3. Update this file with command/runbook changes.
4. Reconfirm config keys touched in .env.example.

## Project Overview Snapshot

High-level components:

- Backend API and route surface: src/server.js
- Admin and reporting UI pages: public/admin-*.html and public/admin-*.js
- Adoptable stream UI: public/adoptable-stream.js
- GIS reporting assets and overlays: GIS/
- Service startup: hsnba-jukebox.service

Deployment assumptions:

- Runtime data and environment are preserved between code deploys.
- Credentials and host-specific values are managed in container .env.
