# GitHub Notes

Last updated: 2026-04-30

## Purpose

This file is the GitHub-facing operations note for release context, configuration tracking, and current project status.

## Project Overview

HSNBAJukebox is a self-hosted operations platform that combines:

- Jukebox playback and queue administration
- Staff request and voting workflows
- Adoptable slideshow streaming from ASM
- Reporting dashboards and GIS reporting workflows
- Proxmox-first deployment automation

Primary app runtime:

- Node/Express app on port 3000
- Service unit: hsnba-jukebox
- Runtime path: /opt/HSNBA

## Current Config Inventory

Core runtime config source:

- .env in deployment target (container)
- Template reference: .env.example

Important config groups:

- Server: PORT, BASE_URL
- Spotify Web API: SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, SPOTIFY_REDIRECT_URI, SPOTIFY_DEVICE_ID
- Mopidy RPC: MOPIDY_URL
- Audio jack controls: AUDIO_JACK_ALSA_*
- Request controls: MAX_PENDING_PER_USER, EMPLOYEE_SESSION_TTL_MINUTES, REQUESTS_RATE_*
- ASM integration: ASM_SERVICE_URL, ASM_ACCOUNT, ASM_API_KEY, ASM_USERNAME, ASM_PASSWORD, ASM_ADOPTABLE_METHOD
- Slideshow: SLIDESHOW_*

Operational note:

- The normal deploy script archives Git HEAD and does not overwrite runtime .env.

## Tracked Change Themes

Recent tracked changes from changelog and repo docs include:

- Queue-master randomization behavior and playlist load hardening
- GIS report expansion and county precinct/address enrichment
- ASM throttle handling for json_report workflows
- Reporting host/login reliability improvements
- Account recovery and admin hardening
- Spotify enrollment and playlist editor UX improvements
- Admin diagnostics, stream health, and audio automation controls

## Deploy and Execution Methods

Standard deploy to existing container:

- powershell -NoProfile -ExecutionPolicy Bypass -File .\deploy.proxmox.ps1

Deploy with dependency refresh:

- powershell -NoProfile -ExecutionPolicy Bypass -File .\deploy.proxmox.ps1

Bootstrap a new Proxmox container:

- bash <(curl -fsSL https://raw.githubusercontent.com/Awebbtx/HSNBAJukebox/main/proxmox-jukebox-bootstrap.sh)

## Documentation Policy

When changes are made, update these in the same PR/commit whenever applicable:

1. CHANGELOG.md for user-visible behavior changes.
2. GITHUB-NOTES.md for operational status/config tracking.
3. LETS-BUILD-NOTES.md for implementation playbooks and AI execution notes.
4. README.md links when new docs are added or renamed.
