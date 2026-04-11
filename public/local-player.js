import { initAudioBar } from "/audio-bar.js";
initAudioBar();

const els = {
  connectBtn: document.getElementById("connectBtn"),
  startBtn: document.getElementById("startBtn"),
  activateBtn: document.getElementById("activateBtn"),
  statusText: document.getElementById("statusText"),
  trackTitle: document.getElementById("trackTitle"),
  trackMeta: document.getElementById("trackMeta"),
  coverArt: document.getElementById("coverArt"),
  coverFallback: document.getElementById("coverFallback"),
  prevBtn: document.getElementById("prevBtn"),
  playPauseBtn: document.getElementById("playPauseBtn"),
  nextBtn: document.getElementById("nextBtn"),
  volumeSlider: document.getElementById("volumeSlider"),
  volumeValue: document.getElementById("volumeValue")
};

let player = null;
let localDeviceId = "";
let sdkReadyPromise = null;
let isPlaying = false;

function setStatus(msg) {
  els.statusText.textContent = msg;
}

function setCover(url) {
  const wrap = els.coverArt.parentElement;
  if (!url) {
    els.coverArt.removeAttribute("src");
    wrap.classList.remove("has-image");
    return;
  }
  els.coverArt.src = url;
  wrap.classList.add("has-image");
}

function fmtMeta(artists = [], album = "") {
  const names = (artists || []).map((a) => a.name).join(", ");
  return [names, album].filter(Boolean).join(" - ") || "Unknown artist";
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || `Request failed (${response.status})`);
  }
  return payload;
}

async function fetchSpotifyToken() {
  const data = await api("/api/auth/token");
  return data.accessToken;
}

async function ensureConnected() {
  const data = await api("/api/auth/status");
  if (!data.connected) {
    setStatus("Spotify is not connected. Click Connect Spotify first.");
    return false;
  }
  return true;
}

function waitForSpotifySdk() {
  if (sdkReadyPromise) {
    return sdkReadyPromise;
  }

  sdkReadyPromise = new Promise((resolve, reject) => {
    if (window.Spotify && window.Spotify.Player) {
      resolve();
      return;
    }

    const timer = window.setTimeout(() => {
      reject(new Error("Spotify SDK did not load."));
    }, 12000);

    window.onSpotifyWebPlaybackSDKReady = () => {
      window.clearTimeout(timer);
      resolve();
    };
  });

  return sdkReadyPromise;
}

function wirePlayerListeners() {
  player.addListener("ready", ({ device_id }) => {
    localDeviceId = device_id;
    els.activateBtn.disabled = false;
    setStatus(`Local player ready. Device ID: ${device_id.slice(0, 8)}...`);
  });

  player.addListener("not_ready", () => {
    setStatus("Local player went offline.");
  });

  player.addListener("player_state_changed", (state) => {
    if (!state || !state.track_window) {
      return;
    }

    const current = state.track_window.current_track;
    isPlaying = !state.paused;
    els.playPauseBtn.textContent = isPlaying ? "⏸" : "▶";

    els.trackTitle.textContent = current?.name || "Nothing playing";
    els.trackMeta.textContent = fmtMeta(current?.artists || [], current?.album?.name || "");
    setCover(current?.album?.images?.[0]?.url || "");
  });

  player.addListener("initialization_error", ({ message }) => setStatus(`Init error: ${message}`));
  player.addListener("authentication_error", ({ message }) => setStatus(`Auth error: ${message}. Reconnect Spotify.`));
  player.addListener("account_error", ({ message }) => setStatus(`Account error: ${message}`));
  player.addListener("playback_error", ({ message }) => setStatus(`Playback error: ${message}`));
}

async function startLocalPlayer() {
  const connected = await ensureConnected();
  if (!connected) {
    return;
  }

  await waitForSpotifySdk();

  if (!player) {
    player = new window.Spotify.Player({
      name: "HSNBA Local Device",
      getOAuthToken: async (cb) => {
        try {
          cb(await fetchSpotifyToken());
        } catch {
          cb("");
        }
      },
      volume: 0.8
    });

    wirePlayerListeners();
    await player.connect();
  }

  setStatus("Player started in this browser. Click 'Use This Device'.");
}

async function activateThisDevice() {
  if (!localDeviceId) {
    setStatus("Start local player first.");
    return;
  }

  await api("/api/device/select", {
    method: "POST",
    body: JSON.stringify({ deviceId: localDeviceId })
  });

  await api("/api/device/activate", { method: "POST" });
  setStatus("This browser is now the active Spotify playback device.");
}

async function togglePlayPause() {
  if (!player) {
    setStatus("Start local player first.");
    return;
  }
  await player.togglePlay();
}

async function previousTrack() {
  if (!player) {
    setStatus("Start local player first.");
    return;
  }
  await player.previousTrack();
}

async function nextTrack() {
  if (!player) {
    setStatus("Start local player first.");
    return;
  }
  await player.nextTrack();
}

async function setVolume(value) {
  if (!player) {
    return;
  }
  const v = Math.max(0, Math.min(100, Number(value || 0))) / 100;
  await player.setVolume(v);
}

els.connectBtn.addEventListener("click", () => {
  window.location.href = "/auth/login";
});

els.startBtn.addEventListener("click", async () => {
  try {
    await startLocalPlayer();
  } catch (error) {
    setStatus(error.message);
  }
});

els.activateBtn.addEventListener("click", async () => {
  try {
    await activateThisDevice();
  } catch (error) {
    setStatus(error.message);
  }
});

els.playPauseBtn.addEventListener("click", async () => {
  try {
    await togglePlayPause();
  } catch (error) {
    setStatus(error.message);
  }
});

els.prevBtn.addEventListener("click", async () => {
  try {
    await previousTrack();
  } catch (error) {
    setStatus(error.message);
  }
});

els.nextBtn.addEventListener("click", async () => {
  try {
    await nextTrack();
  } catch (error) {
    setStatus(error.message);
  }
});

els.volumeSlider.addEventListener("input", async (e) => {
  const value = Number(e.target.value || 0);
  els.volumeValue.textContent = `${value}%`;
  try {
    await setVolume(value);
  } catch {
    // Ignore transient slider errors.
  }
});

(async () => {
  try {
    const connected = await ensureConnected();
    if (connected) {
      setStatus("Connected to Spotify. Click 'Start Local Player'.");
    }
  } catch (error) {
    setStatus(error.message);
  }
})();
