const els = {
  loginBtn: document.getElementById("loginBtn"),
  authStatus: document.getElementById("authStatus"),
  deviceSelect: document.getElementById("deviceSelect"),
  refreshDevicesBtn: document.getElementById("refreshDevicesBtn"),
  activateDeviceBtn: document.getElementById("activateDeviceBtn"),
  deviceStatus: document.getElementById("deviceStatus"),
  searchForm: document.getElementById("searchForm"),
  searchInput: document.getElementById("searchInput"),
  searchResults: document.getElementById("searchResults"),
  queueList: document.getElementById("queueList"),
  sendAllBtn: document.getElementById("sendAllBtn"),
  playNextBtn: document.getElementById("playNextBtn")
};

async function api(url, options = {}) {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || `Request failed: ${response.status}`);
  }
  return payload;
}

function toDuration(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = `${totalSeconds % 60}`.padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function renderSearchResults(tracks) {
  els.searchResults.innerHTML = "";
  for (const track of tracks) {
    const li = document.createElement("li");
    li.className = "list-item";
    li.innerHTML = `
      <div>
        <strong>${track.name}</strong>
        <div class="meta">${track.artists} • ${track.album} • ${toDuration(track.durationMs)}</div>
      </div>
      <button class="btn">Add</button>
    `;

    li.querySelector("button").addEventListener("click", async () => {
      try {
        await api("/api/queue", {
          method: "POST",
          body: JSON.stringify({
            uri: track.uri,
            name: track.name,
            artists: track.artists
          })
        });
        await loadQueue();
      } catch (error) {
        alert(error.message);
      }
    });

    els.searchResults.append(li);
  }
}

function queueItemTemplate(item) {
  const li = document.createElement("li");
  li.className = "list-item";
  li.innerHTML = `
    <div>
      <strong>${item.name}</strong>
      <div class="meta">${item.artists}</div>
    </div>
    <div class="row">
      <button class="btn" data-action="send">Send</button>
      <button class="btn accent" data-action="play">Play</button>
      <button class="btn danger" data-action="remove">Remove</button>
    </div>
  `;

  li.querySelector('[data-action="send"]').addEventListener("click", () => sendOne(item.id));
  li.querySelector('[data-action="play"]').addEventListener("click", () => playNow(item.id));
  li.querySelector('[data-action="remove"]').addEventListener("click", () => removeOne(item.id));

  return li;
}

async function loadAuthStatus() {
  try {
    const result = await api("/api/auth/status");
    els.authStatus.textContent = result.connected ? "Spotify connected" : "Not connected";
    if (result.connected) {
      await loadDevices();
      await loadQueue();
    }
  } catch (error) {
    els.authStatus.textContent = error.message;
  }
}

async function loadDevices() {
  try {
    const result = await api("/api/devices");
    const selectedId = result.activeDeviceId;
    els.deviceSelect.innerHTML = "";

    for (const device of result.devices) {
      const opt = document.createElement("option");
      opt.value = device.id;
      opt.textContent = `${device.name} (${device.type})${device.is_active ? " [active]" : ""}`;
      if (device.id === selectedId) {
        opt.selected = true;
      }
      els.deviceSelect.append(opt);
    }

    if (!result.devices.length) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "No devices found";
      els.deviceSelect.append(opt);
    }
  } catch (error) {
    els.deviceStatus.textContent = error.message;
  }
}

async function saveSelectedDevice() {
  const deviceId = els.deviceSelect.value;
  if (!deviceId) {
    return;
  }

  await api("/api/device/select", {
    method: "POST",
    body: JSON.stringify({ deviceId })
  });
}

async function loadQueue() {
  const result = await api("/api/queue");
  els.queueList.innerHTML = "";
  for (const item of result.queue) {
    els.queueList.append(queueItemTemplate(item));
  }
}

async function sendOne(id) {
  try {
    await saveSelectedDevice();
    await api(`/api/queue/${id}/send`, { method: "POST" });
    els.deviceStatus.textContent = "Sent to Spotify queue";
  } catch (error) {
    alert(error.message);
  }
}

async function playNow(id) {
  try {
    await saveSelectedDevice();
    await api(`/api/queue/${id}/play-now`, { method: "POST" });
    els.deviceStatus.textContent = "Playing now";
  } catch (error) {
    alert(error.message);
  }
}

async function removeOne(id) {
  try {
    await api(`/api/queue/${id}`, { method: "DELETE" });
    await loadQueue();
  } catch (error) {
    alert(error.message);
  }
}

els.loginBtn.addEventListener("click", () => {
  window.location.href = "/auth/login";
});

els.refreshDevicesBtn.addEventListener("click", loadDevices);

els.activateDeviceBtn.addEventListener("click", async () => {
  try {
    await saveSelectedDevice();
    await api("/api/device/activate", { method: "POST" });
    els.deviceStatus.textContent = "Device activated";
  } catch (error) {
    alert(error.message);
  }
});

els.searchForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const q = els.searchInput.value.trim();
  if (!q) {
    return;
  }

  try {
    const result = await api(`/api/search?q=${encodeURIComponent(q)}`);
    renderSearchResults(result.tracks || []);
  } catch (error) {
    alert(error.message);
  }
});

els.sendAllBtn.addEventListener("click", async () => {
  try {
    await saveSelectedDevice();
    const result = await api("/api/queue/send-all", { method: "POST" });
    els.deviceStatus.textContent = `Sent ${result.sentCount} tracks`;
  } catch (error) {
    alert(error.message);
  }
});

els.playNextBtn.addEventListener("click", async () => {
  try {
    await saveSelectedDevice();
    await api("/api/queue/play-next", { method: "POST" });
    await loadQueue();
    els.deviceStatus.textContent = "Playing next queued track";
  } catch (error) {
    alert(error.message);
  }
});

loadAuthStatus();
