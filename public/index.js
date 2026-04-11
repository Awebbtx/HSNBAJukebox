import { initAudioBar } from "/audio-bar.js";
initAudioBar();

const els = {
  albumArt: document.getElementById("albumArt"),
  artFallback: document.getElementById("artFallback"),
  trackTitle: document.getElementById("trackTitle"),
  trackMeta: document.getElementById("trackMeta"),
  queueCount: document.getElementById("queueCount"),
  upNextList: document.getElementById("upNextList")
};

function escapeHtml(value) {
  return `${value || ""}`
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function fmtTrackMeta(track) {
  const parts = [];
  if (track.artists) parts.push(track.artists);
  if (track.album) parts.push(track.album);
  return parts.join(" - ") || "Unknown artist";
}

async function loadDisplay() {
  const response = await fetch("/api/display/queue");
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.error || "Failed to load display data.");
  }

  const current = payload.current || null;
  const upNext = payload.upNext || [];

  if (!current) {
    els.trackTitle.textContent = "Nothing playing";
    els.trackMeta.textContent = "Queue up a song to get started.";
    els.albumArt.removeAttribute("src");
    els.albumArt.alt = "Album art";
    els.albumArt.parentElement.classList.remove("has-image");
  } else {
    els.trackTitle.textContent = current.name || "Unknown track";
    els.trackMeta.textContent = fmtTrackMeta(current);

    if (current.imageUrl) {
      els.albumArt.src = current.imageUrl;
      els.albumArt.alt = `${current.name || "Track"} album art`;
      els.albumArt.parentElement.classList.add("has-image");
    } else {
      els.albumArt.removeAttribute("src");
      els.albumArt.alt = "Album art";
      els.albumArt.parentElement.classList.remove("has-image");
    }
  }

  els.queueCount.textContent = `${upNext.length} track${upNext.length === 1 ? "" : "s"}`;
  els.upNextList.innerHTML = "";

  if (!upNext.length) {
    const li = document.createElement("li");
    li.className = "item";
    li.innerHTML = '<div class="track-meta">No tracks queued.</div>';
    els.upNextList.append(li);
    return;
  }

  for (const track of upNext) {
    const li = document.createElement("li");
    li.className = "item";
    li.innerHTML = `
      <div class="track-title">${escapeHtml(track.name || "Unknown track")}</div>
      <div class="track-meta">${escapeHtml(fmtTrackMeta(track))}</div>
    `;
    els.upNextList.append(li);
  }
}

async function bootstrap() {
  try {
    await loadDisplay();
  } catch {
    els.trackTitle.textContent = "Unable to load player state";
    els.trackMeta.textContent = "Check Mopidy connection.";
  }

  window.setInterval(async () => {
    try {
      await loadDisplay();
    } catch {
      // Silent retry loop for display mode.
    }
  }, 5000);
}

bootstrap();
