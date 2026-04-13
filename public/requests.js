import { initAudioBar } from "/audio-bar.js";
initAudioBar();

const storageKey = "jukebox.employee.token";

const els = {
  joinDialog: document.getElementById("joinDialog"),
  joinForm: document.getElementById("joinForm"),
  staffUsernameInput: document.getElementById("staffUsernameInput"),
  staffPasswordInput: document.getElementById("staffPasswordInput"),
  searchForm: document.getElementById("searchForm"),
  searchInput: document.getElementById("searchInput"),
  searchResults: document.getElementById("searchResults"),
  queueList: document.getElementById("queueList"),
  topRequestedList: document.getElementById("topRequestedList"),
  topUpvotedList: document.getElementById("topUpvotedList"),
  queueCount: document.getElementById("queueCount"),
  currentTrack: document.getElementById("currentTrack"),
  refreshBtn: document.getElementById("refreshBtn"),
  quotaText: document.getElementById("quotaText"),
  toast: document.getElementById("toast")
};

let authToken = localStorage.getItem(storageKey) || "";
let refreshTimer = null;

function notifyShellSessionUpdate(scope = "employee") {
  try {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ type: "jukebox-session-update", scope }, window.location.origin);
    }
  } catch {}
}

function escapeHtml(value) {
  return `${value || ""}`
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function toast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  window.setTimeout(() => els.toast.classList.remove("show"), 1800);
}

function formatDuration(ms) {
  const totalSeconds = Math.floor(Number(ms || 0) / 1000);
  const mins = Math.floor(totalSeconds / 60);
  const secs = `${totalSeconds % 60}`.padStart(2, "0");
  return `${mins}:${secs}`;
}

async function api(url, options = {}, requiresAuth = true) {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {})
  };

  if (requiresAuth && authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }

  const response = await fetch(url, {
    ...options,
    headers
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = payload.suggestion
      ? `${payload.error || `Request failed (${response.status})`} Suggested: ${payload.suggestion}`
      : (payload.error || `Request failed (${response.status})`);
    throw new Error(detail);
  }

  return payload;
}

async function submitVote(track, vote) {
  try {
    await api("/api/requests/vote", {
      method: "POST",
      body: JSON.stringify({
        uri: track.uri,
        vote,
        name: track.name || "",
        artists: track.artists || "",
        album: track.album || ""
      })
    });
    await Promise.all([loadQueue(), loadStats()]);
  } catch (error) {
    toast(error.message);
  }
}

function toQueueItem(track, showAddButton = false) {
  const li = document.createElement("li");
  li.className = "item";

  const byline = [];
  if (track.artists) {
    byline.push(track.artists);
  }
  if (track.album) {
    byline.push(track.album);
  }
  if (track.durationMs) {
    byline.push(formatDuration(track.durationMs));
  }

  li.innerHTML = `
    <div>
      <div class="track-title">${escapeHtml(track.name || "Unknown")}</div>
      <div class="track-meta">${escapeHtml(byline.join(" • "))}</div>
      ${track.requestedBy ? `<div class="tag">Added by ${escapeHtml(track.requestedBy)}</div>` : ""}
      <div class="track-meta">👍 ${Number(track.upvotes || 0)} • 👎 ${Number(track.downvotes || 0)}</div>
    </div>
    <div class="item-actions">
      ${showAddButton ? '<button class="btn-accent" type="button">Add</button>' : ""}
    </div>
  `;

  if (showAddButton) {
    li.querySelector(".btn-accent")?.addEventListener("click", async () => {
      try {
        await api("/api/requests/queue", {
          method: "POST",
          body: JSON.stringify({ uri: track.uri })
        });
        toast("Added to queue");
        await Promise.all([loadMyStatus(), loadQueue(), loadStats()]);
      } catch (error) {
        toast(error.message);
      }
    });
  }

  return li;
}

async function loadMyStatus() {
  const me = await api("/api/requests/me");
  els.quotaText.textContent = `${me.displayName} • ${me.pendingCount}/${me.maxPending} used today`;
}

function renderStatsList(container, rows, labelKey) {
  container.innerHTML = "";
  if (!rows.length) {
    const li = document.createElement("li");
    li.className = "item";
    li.innerHTML = '<div class="track-meta">No data yet.</div>';
    container.append(li);
    return;
  }
  rows.forEach((row, idx) => {
    const li = document.createElement("li");
    li.className = "item";
    const byline = [row.artists, row.album].filter(Boolean).join(" • ");
    li.innerHTML = `
      <div>
        <div class="track-title">${idx + 1}. ${escapeHtml(row.name || "Unknown")}</div>
        <div class="track-meta">${escapeHtml(byline)}</div>
      </div>
      <div class="tag">${escapeHtml(`${row[labelKey] || 0}`)}</div>
    `;
    container.append(li);
  });
}

async function loadStats() {
  const data = await api("/api/requests/stats");
  renderStatsList(els.topRequestedList, data.topRequested || [], "requestCount");
  renderStatsList(els.topUpvotedList, data.topUpvoted || [], "upvotes");
}

async function loadQueue() {
  const result = await api("/api/requests/queue");
  els.queueList.innerHTML = "";

  const queue = result.queue || [];
  const [, ...upNext] = queue;

  els.queueCount.textContent = `${upNext.length} songs waiting`;

  const current = result.current;
  if (current && current.name) {
    els.currentTrack.classList.remove("empty");
    els.currentTrack.innerHTML = `
      <div class="track-title">${escapeHtml(current.name)}</div>
      <div class="track-meta">${escapeHtml(current.artists || "Unknown artist")}</div>
      ${current.requestedBy ? `<div class="tag">Requested by ${escapeHtml(current.requestedBy)}</div>` : ""}
    `;
  } else {
    els.currentTrack.classList.add("empty");
    els.currentTrack.textContent = "No active track";
  }

  if (!upNext.length) {
    const li = document.createElement("li");
    li.className = "item";
    li.innerHTML = '<div class="track-meta">Queue is empty. Search and add a track.</div>';
    els.queueList.append(li);
    return;
  }

  for (const track of upNext) {
    els.queueList.append(toQueueItem(track));
  }
}

async function runSearch() {
  const q = els.searchInput.value.trim();
  if (!q) {
    return;
  }

  const result = await api(`/api/requests/search?q=${encodeURIComponent(q)}`);
  els.searchResults.innerHTML = "";

  if (!result.tracks?.length) {
    const li = document.createElement("li");
    li.className = "item";
    li.innerHTML = '<div class="track-meta">No matches found.</div>';
    els.searchResults.append(li);
    return;
  }

  for (const track of result.tracks) {
    els.searchResults.append(toQueueItem(track, true));
  }
}

async function createSession(event) {
  event.preventDefault();
  const username = els.staffUsernameInput.value.trim();
  const password = els.staffPasswordInput.value;

  try {
    const result = await api(
      "/api/requests/session",
      {
        method: "POST",
        body: JSON.stringify({ username, password })
      },
      false
    );

    authToken = result.token;
    localStorage.setItem(storageKey, authToken);
    notifyShellSessionUpdate("employee");
    els.staffPasswordInput.value = "";
    els.joinDialog.close();

    await initializeBoard();
    toast("Welcome in");
  } catch (error) {
    toast(error.message);
  }
}

async function initializeBoard() {
  await Promise.all([loadMyStatus(), loadQueue(), loadStats()]);

  if (refreshTimer) {
    window.clearInterval(refreshTimer);
  }
  refreshTimer = window.setInterval(async () => {
    try {
      await Promise.all([loadMyStatus(), loadQueue(), loadStats()]);
    } catch (_error) {
      // Keep silent to avoid spam while network is unstable.
    }
  }, 8000);
}

async function bootstrap() {
  try {
    await api("/api/requests/health", {}, false);
  } catch (error) {
    toast(`Mopidy is offline: ${error.message}`);
  }

  if (!authToken) {
    els.joinDialog.showModal();
    return;
  }

  try {
    await initializeBoard();
  } catch (_error) {
    localStorage.removeItem(storageKey);
    notifyShellSessionUpdate("employee");
    authToken = "";
    els.joinDialog.showModal();
  }
}

els.joinForm.addEventListener("submit", createSession);
els.searchForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await runSearch();
  } catch (error) {
    toast(error.message);
  }
});
els.refreshBtn.addEventListener("click", async () => {
  try {
    await Promise.all([loadMyStatus(), loadQueue(), loadStats()]);
    toast("Queue refreshed");
  } catch (error) {
    toast(error.message);
  }
});

bootstrap();
