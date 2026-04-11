# Changelog

All notable changes to this project are documented in this file.

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