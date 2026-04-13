#!/bin/bash
set -euo pipefail

MOPIDY_CONF="/etc/mopidy/mopidy.conf"
ALSA_CARD="${AUDIO_JACK_ALSA_CARD:-0}"
ALSA_CONTROL="${AUDIO_JACK_ALSA_CONTROL:-PCM}"
STREAM_URL="${STREAM_URL:-http://127.0.0.1:8000/stream.mp3}"

say() { printf '%s\n' "$*"; }
section() { printf '\n== %s ==\n' "$*"; }

section "Audio Path Diagnostics"
say "Mopidy config: ${MOPIDY_CONF}"
say "ALSA target: card=${ALSA_CARD} control=${ALSA_CONTROL}"
say "Stream URL: ${STREAM_URL}"

section "Mopidy [audio] output"
if [[ -f "${MOPIDY_CONF}" ]]; then
  output_line=$(awk '
    BEGIN { in_audio=0 }
    /^\[audio\]/ { in_audio=1; next }
    /^\[/ { in_audio=0 }
    in_audio && $0 ~ /^\s*output\s*=/ { print; found=1 }
    END { if (!found) exit 1 }
  ' "${MOPIDY_CONF}" || true)

  if [[ -n "${output_line}" ]]; then
    say "${output_line}"
    lower=$(printf '%s' "${output_line}" | tr '[:upper:]' '[:lower:]')
    if [[ "${lower}" == *"alsasink"* ]]; then
      say "OK: Mopidy output includes alsasink (hardware/AUX path present)."
    else
      say "WARN: Mopidy output does not include alsasink (AUX hardware can be silent)."
    fi
    if [[ "${lower}" == *"shout2send"* || "${lower}" == *"icecast"* || "${lower}" == *"stream.mp3"* ]]; then
      say "OK: Mopidy output appears to feed stream output."
    else
      say "WARN: Mopidy output does not look configured for stream.mp3/icecast."
    fi
  else
    say "WARN: No [audio] output line found in ${MOPIDY_CONF}."
  fi
else
  say "WARN: ${MOPIDY_CONF} not found."
fi

section "ALSA Control Check"
if command -v amixer >/dev/null 2>&1; then
  if amixer -c "${ALSA_CARD}" sget "${ALSA_CONTROL}" >/tmp/hsnba-amixer-check.out 2>/tmp/hsnba-amixer-check.err; then
    say "OK: ALSA control is readable."
    sed -n '1,12p' /tmp/hsnba-amixer-check.out
  else
    say "ERROR: Cannot read ALSA control ${ALSA_CONTROL} on card ${ALSA_CARD}."
    sed -n '1,8p' /tmp/hsnba-amixer-check.err || true
    say "Available simple controls:"
    amixer -c "${ALSA_CARD}" scontrols || true
  fi
else
  say "ERROR: amixer not installed or not in PATH."
fi

section "Stream Reachability"
if command -v curl >/dev/null 2>&1; then
  if curl -fsS -m 5 -I "${STREAM_URL}" >/tmp/hsnba-stream-head.out 2>/tmp/hsnba-stream-head.err; then
    say "OK: Stream endpoint reachable."
    sed -n '1,8p' /tmp/hsnba-stream-head.out
  else
    say "WARN: Stream endpoint not reachable."
    sed -n '1,8p' /tmp/hsnba-stream-head.err || true
  fi
else
  say "WARN: curl not installed; skipping stream HEAD check."
fi

section "Mopidy Service"
if command -v systemctl >/dev/null 2>&1; then
  systemctl is-active mopidy || true
  systemctl --no-pager --full status mopidy | sed -n '1,24p' || true
else
  say "WARN: systemctl unavailable; skipping Mopidy service check."
fi

section "Done"
say "If AUX is silent and stream works, most likely cause is Mopidy output missing alsasink or wrong ALSA card/control."
