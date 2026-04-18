const ADMIN_TOKEN_KEY = "jukebox.admin.token";
const EMPLOYEE_TOKEN_KEY = "jukebox.employee.token";

let adminToken = sessionStorage.getItem(ADMIN_TOKEN_KEY) || localStorage.getItem(ADMIN_TOKEN_KEY) || "";
let audioJackDebounce = null;
let logsTimer = null;
let streamHealthTimer = null;

const els = {
  loginDialog: document.getElementById("loginDialog"),
  loginForm: document.getElementById("loginForm"),
  usernameInput: document.getElementById("usernameInput"),
  passwordInput: document.getElementById("passwordInput"),
  toast: document.getElementById("toast"),
  audioJackStatusText: document.getElementById("audioJackStatusText"),
  audioJackCardSelect: document.getElementById("audioJackCardSelect"),
  audioJackControlSelect: document.getElementById("audioJackControlSelect"),
  audioJackRefreshBtn: document.getElementById("audioJackRefreshBtn"),
  audioJackSaveBtn: document.getElementById("audioJackSaveBtn"),
  audioJackMuteToggleBtn: document.getElementById("audioJackMuteToggleBtn"),
  audioJackVolumeInput: document.getElementById("audioJackVolumeInput"),
  audioJackVolumeValue: document.getElementById("audioJackVolumeValue"),
  diagSummary: document.getElementById("diagSummary"),
  diagBody: document.getElementById("diagBody"),
  diagRefreshBtn: document.getElementById("diagRefreshBtn"),
  streamHealthSummary: document.getElementById("streamHealthSummary"),
  streamHealthPills: document.getElementById("streamHealthPills"),
  streamHealthAutoRefreshToggle: document.getElementById("streamHealthAutoRefreshToggle"),
  streamHealthRefreshBtn: document.getElementById("streamHealthRefreshBtn"),
  bufferingSummary: document.getElementById("bufferingSummary"),
  bufferingBody: document.getElementById("bufferingBody"),
  logSummary: document.getElementById("logSummary"),
  logBody: document.getElementById("logBody"),
  logUnitSelect: document.getElementById("logUnitSelect"),
  logLinesSelect: document.getElementById("logLinesSelect"),
  logAutoRefreshToggle: document.getElementById("logAutoRefreshToggle"),
  logRefreshBtn: document.getElementById("logRefreshBtn")
};

function escapeHtml(v) {
  return `${v || ""}`
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function toast(message, isError = false) {
  if (!els.toast) return;
  els.toast.textContent = message;
  els.toast.className = `toast show${isError ? " error" : ""}`;
  window.clearTimeout(els.toast._timer);
  els.toast._timer = window.setTimeout(() => els.toast.classList.remove("show"), 2200);
}

function setAudioJackMutedToUi(muted) {
  if (!els.audioJackMuteToggleBtn) return;
  const isMuted = Boolean(muted);
  els.audioJackMuteToggleBtn.dataset.active = String(isMuted);
  els.audioJackMuteToggleBtn.textContent = isMuted ? "UNMUTE" : "MUTE";
}

function getAudioJackMutedFromUi() {
  return els.audioJackMuteToggleBtn?.dataset?.active === "true";
}

async function api(url, opts = {}) {
  const res = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...(adminToken ? { Authorization: `Bearer ${adminToken}` } : {}),
      ...(opts.headers || {})
    },
    ...opts
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = payload.suggestion
      ? `${payload.error || `HTTP ${res.status}`} Suggested: ${payload.suggestion}`
      : (payload.error || `HTTP ${res.status}`);
    const error = new Error(detail);
    error.status = res.status;
    throw error;
  }
  return payload;
}

async function login(username, password) {
  const result = await api("/api/admin/session", {
    method: "POST",
    body: JSON.stringify({ username, password })
  });
  adminToken = result.token;
  sessionStorage.setItem(ADMIN_TOKEN_KEY, adminToken);
  localStorage.setItem(ADMIN_TOKEN_KEY, adminToken);
}

async function loadAudioJackRoutingSettings(selectedCard = "") {
  const query = selectedCard ? `?card=${encodeURIComponent(selectedCard)}` : "";
  const data = await api(`/api/admin/settings/audio-jack/controls${query}`);
  const cards = Array.isArray(data.cards) ? data.cards : [];
  const controls = Array.isArray(data.controls) ? data.controls : [];
  const activeCard = `${data.active?.card || data.selectedCard || "0"}`;
  const activeControl = `${data.active?.control || controls[0] || ""}`;

  els.audioJackCardSelect.innerHTML = cards
    .map((card) => `<option value="${escapeHtml(card.id)}">Card ${escapeHtml(card.id)} - ${escapeHtml(card.shortName || card.name || "ALSA")}</option>`)
    .join("");
  if (!cards.length) {
    els.audioJackCardSelect.innerHTML = `<option value="${escapeHtml(activeCard)}">Card ${escapeHtml(activeCard)}</option>`;
  }
  els.audioJackCardSelect.value = `${data.selectedCard || activeCard}`;

  els.audioJackControlSelect.innerHTML = controls
    .map((control) => `<option value="${escapeHtml(control)}">${escapeHtml(control)}</option>`)
    .join("");
  if (!controls.length) {
    els.audioJackControlSelect.innerHTML = `<option value="${escapeHtml(activeControl)}">${escapeHtml(activeControl || "No controls found")}</option>`;
  }
  if (controls.includes(activeControl)) {
    els.audioJackControlSelect.value = activeControl;
  }

  els.audioJackStatusText.textContent = `AUX routing active: card ${activeCard}, control ${activeControl || "unknown"}`;
}

async function saveAudioJackRoutingSettings() {
  const card = `${els.audioJackCardSelect.value || ""}`.trim();
  const control = `${els.audioJackControlSelect.value || ""}`.trim();
  if (!card || !control) {
    throw new Error("Select both card and control before applying AUX routing.");
  }
  const data = await api("/api/admin/settings/audio-jack/controls", {
    method: "POST",
    body: JSON.stringify({ card, control })
  });
  await Promise.all([
    loadAudioJackRoutingSettings(card),
    loadAudioJackSettings()
  ]);
  els.audioJackStatusText.textContent = `AUX routing applied: card ${data.card}, control ${data.control}`;
}

async function loadAudioJackSettings() {
  const data = await api("/api/admin/settings/audio-jack");
  const volume = Number(data.volume || 0);
  els.audioJackVolumeInput.value = `${volume}`;
  els.audioJackVolumeValue.textContent = `${volume}%`;
  setAudioJackMutedToUi(Boolean(data.muted));

  if (data.supportsMute === false && els.audioJackMuteToggleBtn) {
    els.audioJackMuteToggleBtn.title = "Selected ALSA control has no mute switch; mute is emulated by setting volume to 0.";
  }
}

async function saveAudioJackSettings() {
  const payload = {
    volume: Number(els.audioJackVolumeInput.value || 0),
    muted: getAudioJackMutedFromUi()
  };
  const data = await api("/api/admin/settings/audio-jack", {
    method: "POST",
    body: JSON.stringify(payload)
  });
  const volume = Number(data.volume || 0);
  els.audioJackVolumeInput.value = `${volume}`;
  els.audioJackVolumeValue.textContent = `${volume}%`;
  setAudioJackMutedToUi(Boolean(data.muted));
}

async function loadDiagnostics() {
  const data = await api("/api/admin/settings/audio-path/diagnostics");
  const warnings = Array.isArray(data.warnings) ? data.warnings : [];
  els.diagSummary.textContent = warnings.length
    ? `Diagnostics found ${warnings.length} warning(s).`
    : "Diagnostics clean. Hardware and stream paths look configured.";
  els.diagBody.textContent = JSON.stringify(data, null, 2);
}

async function loadServiceLogs() {
  const unit = `${els.logUnitSelect?.value || "hsnba-jukebox"}`.trim() || "hsnba-jukebox";
  const lines = Number(els.logLinesSelect?.value || 200);
  const data = await api(`/api/admin/debug/logs?unit=${encodeURIComponent(unit)}&lines=${encodeURIComponent(lines)}`);
  els.logSummary.textContent = `Showing ${data.lines} lines from ${data.unit} • Updated ${new Date(data.fetchedAt).toLocaleTimeString()}`;
  els.logBody.textContent = `${data.output || "(no logs returned)"}`.trim() || "(no logs returned)";
}

function stopLogsPolling() {
  if (logsTimer) {
    window.clearInterval(logsTimer);
    logsTimer = null;
  }
}

function stopStreamHealthPolling() {
  if (streamHealthTimer) {
    window.clearInterval(streamHealthTimer);
    streamHealthTimer = null;
  }
}

function renderStreamHealth(data) {
  const stats = data?.stats || {};
  const pills = [];
  pills.push(`<span class="pill">Listeners: ${Number(data?.activeListeners || 0)}</span>`);
  pills.push(`<span class="pill">Delivery: ${data?.streamDeliveryEnabled === false ? "Off" : "On"}</span>`);
  pills.push(`<span class="pill">Mopidy: ${data?.mopidyOnline ? "Online" : "Offline"}</span>`);
  pills.push(`<span class="pill">Icecast: ${data?.icecastReachable ? "Reachable" : "Unreachable"}</span>`);
  pills.push(`<span class="pill">Upstream Errors: ${Number(stats.totalUpstreamErrors || 0)}</span>`);
  pills.push(`<span class="pill">Proxy Errors: ${Number(stats.totalProxyErrors || 0)}</span>`);
  els.streamHealthPills.innerHTML = pills.join("");

  const updatedAt = stats.lastEventAt || data?.events?.[0]?.at || "";
  els.streamHealthSummary.textContent = updatedAt
    ? `Updated ${new Date(updatedAt).toLocaleTimeString()} • Connections ${Number(stats.totalClientConnections || 0)} • Disconnects ${Number(stats.totalClientDisconnects || 0)}`
    : "No stream traffic observed yet.";

  const events = Array.isArray(data?.events) ? data.events : [];
  if (!events.length) {
    els.bufferingSummary.textContent = "No stream events recorded yet.";
    els.bufferingBody.textContent = "No stream events recorded yet.";
    return;
  }

  const noisyEvents = events.filter((entry) => ["upstream-error", "upstream-unavailable", "upstream-closed", "proxy-error", "client-disconnected"].includes(entry?.type));
  els.bufferingSummary.textContent = noisyEvents.length
    ? `${noisyEvents.length} potential buffering indicators in the latest ${events.length} events.`
    : `No obvious buffering indicators in the latest ${events.length} events.`;

  els.bufferingBody.textContent = events
    .map((entry) => {
      const at = entry?.at ? new Date(entry.at).toLocaleTimeString() : "--:--:--";
      const type = `${entry?.type || "event"}`;
      const detail = entry?.detail && typeof entry.detail === "object" ? JSON.stringify(entry.detail) : `${entry?.detail || ""}`;
      return `[${at}] ${type}${detail ? ` | ${detail}` : ""}`;
    })
    .join("\n");
}

async function loadStreamHealth() {
  const data = await api("/api/admin/debug/stream-health?limit=60");
  renderStreamHealth(data);
}

function startStreamHealthPolling() {
  stopStreamHealthPolling();
  if (!els.streamHealthAutoRefreshToggle?.checked) return;
  streamHealthTimer = window.setInterval(async () => {
    try {
      await loadStreamHealth();
    } catch {}
  }, 4000);
}

function startLogsPolling() {
  stopLogsPolling();
  if (!els.logAutoRefreshToggle?.checked) return;
  logsTimer = window.setInterval(async () => {
    try {
      await loadServiceLogs();
    } catch {}
  }, 4000);
}

async function initialize() {
  await Promise.all([
    loadAudioJackRoutingSettings(),
    loadAudioJackSettings(),
    loadDiagnostics(),
    loadStreamHealth(),
    loadServiceLogs()
  ]);
  startLogsPolling();
  startStreamHealthPolling();
}

els.loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await login(els.usernameInput.value, els.passwordInput.value);
    els.passwordInput.value = "";
    els.loginDialog.close();
    await initialize();
    toast("Welcome to Debug");
  } catch (error) {
    toast(error.message, true);
  }
});

els.audioJackRefreshBtn.addEventListener("click", async () => {
  try {
    await Promise.all([
      loadAudioJackRoutingSettings(els.audioJackCardSelect?.value || ""),
      loadAudioJackSettings(),
      loadDiagnostics(),
      loadServiceLogs()
    ]);
    toast("Debug settings refreshed");
  } catch (error) {
    toast(error.message, true);
  }
});

els.audioJackSaveBtn.addEventListener("click", async () => {
  try {
    await saveAudioJackRoutingSettings();
    await loadDiagnostics();
    toast("AUX routing applied");
  } catch (error) {
    toast(error.message, true);
  }
});

els.audioJackCardSelect.addEventListener("change", async () => {
  try {
    await loadAudioJackRoutingSettings(els.audioJackCardSelect.value || "");
  } catch (error) {
    toast(error.message, true);
  }
});

els.audioJackVolumeInput.addEventListener("input", () => {
  els.audioJackVolumeValue.textContent = `${Number(els.audioJackVolumeInput.value || 0)}%`;
  window.clearTimeout(audioJackDebounce);
  audioJackDebounce = window.setTimeout(async () => {
    try {
      await saveAudioJackSettings();
    } catch (error) {
      toast(error.message, true);
    }
  }, 250);
});

els.audioJackMuteToggleBtn.addEventListener("click", async () => {
  try {
    const current = getAudioJackMutedFromUi();
    setAudioJackMutedToUi(!current);
    await saveAudioJackSettings();
    toast(!current ? "AUX muted" : "AUX unmuted");
  } catch (error) {
    toast(error.message, true);
  }
});

els.diagRefreshBtn.addEventListener("click", async () => {
  try {
    await Promise.all([loadDiagnostics(), loadStreamHealth()]);
    toast("Diagnostics refreshed");
  } catch (error) {
    toast(error.message, true);
  }
});

els.streamHealthRefreshBtn.addEventListener("click", async () => {
  try {
    await loadStreamHealth();
    toast("Stream health refreshed");
  } catch (error) {
    toast(error.message, true);
  }
});

els.streamHealthAutoRefreshToggle.addEventListener("change", () => {
  startStreamHealthPolling();
});

els.logRefreshBtn.addEventListener("click", async () => {
  try {
    await loadServiceLogs();
    toast("Logs refreshed");
  } catch (error) {
    toast(error.message, true);
  }
});

els.logUnitSelect.addEventListener("change", async () => {
  try {
    await loadServiceLogs();
    startLogsPolling();
  } catch (error) {
    toast(error.message, true);
  }
});

els.logLinesSelect.addEventListener("change", async () => {
  try {
    await loadServiceLogs();
  } catch (error) {
    toast(error.message, true);
  }
});

els.logAutoRefreshToggle.addEventListener("change", () => {
  startLogsPolling();
});

(async () => {
  if (!adminToken) {
    els.loginDialog.showModal();
    return;
  }
  try {
    await initialize();
  } catch (error) {
    const isAuthError = error?.status === 401 || error?.status === 403;
    if (isAuthError) {
      sessionStorage.removeItem(ADMIN_TOKEN_KEY);
      localStorage.removeItem(ADMIN_TOKEN_KEY);
      localStorage.removeItem(EMPLOYEE_TOKEN_KEY);
      adminToken = "";
      els.loginDialog.showModal();
      return;
    }
    toast(error.message, true);
  }
})();

window.addEventListener("beforeunload", () => {
  stopLogsPolling();
  stopStreamHealthPolling();
});
