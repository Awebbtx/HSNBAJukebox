# Changelog

All notable changes to this project are documented in this file.

## 2026-04-28

### Jukebox Queue Master and Playlist UX Hardening

- Restored server-side queue randomization helper used by admin randomize/shuffle endpoints to keep queue reordering on the local queue model.
- Confirmed admin mode updates keep Mopidy random disabled so queue order remains the single source of truth.
- Added a blocking playlist-load overlay in admin UI while loading saved playlists into queue to prevent conflicting user actions.
- Added playlist-load busy-state guards and temporary button disabling to avoid duplicate queue-load requests during large playlist ingestion.
- Updated remaining admin-page shuffle labels to queue-randomize wording for consistency with queue-master playback behavior.

### GIS Reporting Expansion and County Data Integration

- Added a dedicated GIS report builder page and wiring for dynamic ASM report field probing, map build, and printable report output.
- Added support for additional county GIS datasets, including Guadalupe address/precinct integration and map/report enrichment across overlays.
- Added overlay controls, display options, and upload-replace support for multiple precinct layers in GIS reporting.
- Improved GIS point enrichment so precinct metadata is backfilled from overlay geometry when source rows are missing mapped values.

### GIS Load Experience and Reliability

- Added a blocking loading screen with staged progress messaging during geocoding, overlay resolution, and report rendering.
- Increased GIS geocoding processing window to improve completion rates on larger report runs.
- Added frontend render-yield checkpoints to reduce browser lockups while building large map/report payloads.

### ASM json_report Throttle Handling

- Added backend handling for ASM json_report temporary lock windows by parsing throttle-until responses and retrying automatically.
- Added clearer rate-limit messaging when ASM remains blocked after retries.

## 2026-04-20

### Reporting Host and Dashboard Reliability

- Added a dedicated reporting-host experience with reporting-specific login and page routing.
- Added reporting API timeouts and safer linked-report loading to prevent indefinite dashboard hangs.
- Added linked-report data endpoints and cached reporting snapshot support for admin reporting views.
- Expanded reporting surface with operational dashboards such as shelter health, adoption follow-ups, pathway planning, TNR clinic, yearly reviews, and animal-control heatmap views.

### Account Recovery and Admin Hardening

- Hardened admin account storage with backup/snapshot behavior and restore-oriented recovery workflows.
- Added self-service password reset request flow for reporting login.
- Added stronger admin session handling and recovery-oriented tooling for damaged account state.

### Spotify and Playlist Administration

- Added Spotify enrollment tools in admin settings for Mopidy-Spotify credential setup and re-auth guidance.
- Added saved-playlist editing from the admin UI, including rename, per-track removal, and delete workflows.
- Updated playlist row actions to icon-based Edit, Add, and Delete controls.
- Improved playlist editor popup spacing, wrapping, and bounded scrolling for long track names.
- Improved playlist-load failure messaging when Mopidy cannot resolve saved playlist tracks.

### System and Admin Operations

- Added system settings support for server timezone management.
- Added SMTP/email service configuration for invites, resets, reports, and alerts.
- Added audio automation schedule management and diagnostics for playback, stream delivery, and hardware output.
- Added service-log and stream-health diagnostics in admin tooling.

### Deployment and Operational Notes

- Windows deploy helper probing was hardened for container reachability checks.
- Confirmed deploy workflow packages Git `HEAD`, which means uncommitted changes are not included unless they are hot-deployed manually.

## 2026-04-11

### Playback and Queue Reliability

- Added resilient live-stream reconnect behavior in the shared audio bar.
- Preserved user play intent across brief stream interruptions (such as skip transitions).
- Kept explicit user pause behavior authoritative (no forced auto-resume after manual pause).

### Queue Randomization and Sync

- Replaced playback random-mode control with queue-order randomization.
- Added server-side queue randomizer that preserves the currently playing track and randomizes the remaining queue.
- Updated admin controls and labels to use Randomize Queue behavior.
- Kept Mopidy random mode disabled from admin mode updates so queue UI remains authoritative and in sync.

### Admin UX Text Updates

- Updated audio admin page labels from shuffle-mode wording to queue-randomizer wording.