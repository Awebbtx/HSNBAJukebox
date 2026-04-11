/**
 * Persistent live audio bar — shared across all pages.
 *
 * Creates <audio id="liveAudio"> in the DOM so existing page scripts can
 * reference it via document.getElementById("liveAudio") without changes.
 * Uses sessionStorage to auto-resume playback across page navigations.
 */

const STREAM_SRC = "/live.mp3";
const SK_PLAYING = "ab_playing";
const SK_VOLUME  = "ab_volume";
const EMPLOYEE_TOKEN_KEY = "jukebox.employee.token";
const RECONNECT_DELAY_MS = 1200;

let _audio     = null;
let _bar       = null;
let _toggleBtn = null;
let _statusEl  = null;
let _nowEl     = null;
let _voteUpBtn = null;
let _voteDownBtn = null;
let _voteUpCountEl = null;
let _voteDownCountEl = null;
let _currentTrack = null;
let _pollTimer = null;
let _signInRequired = false;
let _playIntent = false;
let _reconnectTimer = null;

function setUI(playing) {
  if (!_toggleBtn) return;
  _toggleBtn.textContent = playing ? "⏸ Pause" : "▶ Play";
  _bar.classList.toggle("ab--playing", playing);
}

function clearReconnectTimer() {
  if (_reconnectTimer) {
    window.clearTimeout(_reconnectTimer);
    _reconnectTimer = null;
  }
}

function reconnectWithIntent() {
  if (!_audio || !_playIntent) {
    return;
  }
  _audio.src = `${STREAM_SRC}?t=${Date.now()}`;
  _audio.play().catch(() => {});
}

function scheduleReconnect(statusText = "Reconnecting…") {
  if (!_playIntent) {
    return;
  }
  _statusEl.textContent = statusText;
  clearReconnectTimer();
  _reconnectTimer = window.setTimeout(() => {
    reconnectWithIntent();
  }, RECONNECT_DELAY_MS);
}

function startPlay() {
  _playIntent = true;
  clearReconnectTimer();
  reconnectWithIntent();
  sessionStorage.setItem(SK_PLAYING, "1");
}

function stopPlay() {
  _playIntent = false;
  clearReconnectTimer();
  _audio.pause();
  _audio.removeAttribute("src");
  _audio.load();
  sessionStorage.setItem(SK_PLAYING, "0");
  setUI(false);
}

function getEmployeeToken() {
  return localStorage.getItem(EMPLOYEE_TOKEN_KEY) || "";
}

function setSignInStatus(enabled) {
  _signInRequired = Boolean(enabled);
  _statusEl.classList.toggle("ab-status--cta", _signInRequired);
  _statusEl.tabIndex = _signInRequired ? 0 : -1;
  _statusEl.setAttribute("role", _signInRequired ? "button" : "status");
  _statusEl.setAttribute("aria-label", _signInRequired ? "Sign in to vote" : "Audio status");
}

async function promptAndSignIn() {
  const hasShell = Boolean(document.getElementById("contentFrame"));
  window.location.href = hasShell ? "/?page=%2Frequests.html" : "/requests.html";
}

function formatNowPlaying(track) {
  if (!track) {
    return "No song playing";
  }
  const title = `${track.name || "Unknown"}`.trim() || "Unknown";
  const artist = `${track.artists || "Unknown artist"}`.trim() || "Unknown artist";
  return `${title} - ${artist}`;
}

function updateVoteUiFromTrack(track, isSignedIn) {
  const upvotes = Number(track?.upvotes || 0);
  const downvotes = Number(track?.downvotes || 0);
  const userVote = Number(track?.userVote || 0);

  _voteUpCountEl.textContent = `${upvotes}`;
  _voteDownCountEl.textContent = `${downvotes}`;
  _voteUpBtn.classList.toggle("is-active", isSignedIn && userVote === 1);
  _voteDownBtn.classList.toggle("is-active", isSignedIn && userVote === -1);
  _voteUpBtn.disabled = !isSignedIn || !track?.uri;
  _voteDownBtn.disabled = !isSignedIn || !track?.uri;
}

async function loadNowPlaying() {
  const token = getEmployeeToken();
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  let payload = null;
  let signedIn = Boolean(token);

  if (token) {
    const authed = await fetch("/api/requests/queue", { headers });
    if (authed.ok) {
      payload = await authed.json().catch(() => ({}));
      signedIn = true;
    } else if (authed.status === 401) {
      signedIn = false;
      localStorage.removeItem(EMPLOYEE_TOKEN_KEY);
    }
  }

  if (!payload) {
    const response = await fetch("/api/display/queue");
    payload = await response.json().catch(() => ({}));
  }

  _currentTrack = payload.current || null;
  _nowEl.textContent = formatNowPlaying(_currentTrack);
  updateVoteUiFromTrack(_currentTrack, signedIn);

  if (!signedIn) {
    _statusEl.textContent = "Sign in to vote";
    setSignInStatus(true);
  } else if (_audio && !_audio.paused && _audio.src) {
    _statusEl.textContent = "";
    setSignInStatus(false);
  } else {
    setSignInStatus(false);
  }
}

async function submitVote(vote) {
  const token = getEmployeeToken();
  if (!token) {
    _statusEl.textContent = "Sign in to vote";
    const hasShell = Boolean(document.getElementById("contentFrame"));
    window.location.href = hasShell ? "/?page=%2Frequests.html" : "/requests.html";
    return;
  }
  if (!_currentTrack?.uri) {
    return;
  }

  const response = await fetch("/api/requests/vote", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({
      uri: _currentTrack.uri,
      vote,
      name: _currentTrack.name || "",
      artists: _currentTrack.artists || "",
      album: _currentTrack.album || ""
    })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    _statusEl.textContent = payload.error || "Vote failed";
    return;
  }

  _currentTrack = {
    ..._currentTrack,
    upvotes: Number(payload.upvotes || 0),
    downvotes: Number(payload.downvotes || 0),
    userVote: Number(payload.userVote || 0)
  };
  updateVoteUiFromTrack(_currentTrack, true);
  _statusEl.textContent = payload.autoSkipped
    ? "Song skipped by listener vote"
    : "";
}

export function initAudioBar() {
  if (window.self !== window.top) {
    return;
  }
  if (document.getElementById("audio-bar") || document.getElementById("liveAudio")) {
    return;
  }

  // Create the shared audio element with id="liveAudio" so existing page
  // scripts that do document.getElementById("liveAudio") still work.
  _audio = document.createElement("audio");
  _audio.id = "liveAudio";
  _audio.preload = "none";
  _audio.controls = false;
  _audio.style.display = "none";
  document.body.appendChild(_audio);

  // Restore persisted volume
  const savedVol = parseFloat(sessionStorage.getItem(SK_VOLUME) ?? "0.8");
  _audio.volume  = savedVol;

  // Build fixed bar
  _bar = document.createElement("div");
  _bar.id = "audio-bar";
  _bar.innerHTML = `
    <div class="ab-brand">
      <span class="ab-dot"></span>
      <span class="ab-live-label">LIVE</span>
    </div>
    <span class="ab-now" id="ab-now">Loading current song...</span>
    <div class="ab-votes" aria-label="Song votes">
      <button class="ab-vote-btn" id="ab-vote-up" type="button" title="Upvote current song">👍 <span id="ab-vote-up-count">0</span></button>
      <button class="ab-vote-btn" id="ab-vote-down" type="button" title="Downvote current song">👎 <span id="ab-vote-down-count">0</span></button>
    </div>
    <button class="ab-toggle" id="ab-toggle" type="button">▶ Play</button>
    <span class="ab-status" id="ab-status"></span>
    <div class="ab-vol-wrap">
      <span class="ab-vol-label">VOL</span>
      <input class="ab-vol" id="ab-vol" type="range" min="0" max="1" step="0.02"
             value="${savedVol}" />
    </div>
  `;
  document.body.appendChild(_bar);
  document.body.classList.add("has-audio-bar");

  _toggleBtn      = _bar.querySelector("#ab-toggle");
  _statusEl       = _bar.querySelector("#ab-status");
  _nowEl          = _bar.querySelector("#ab-now");
  _voteUpBtn      = _bar.querySelector("#ab-vote-up");
  _voteDownBtn    = _bar.querySelector("#ab-vote-down");
  _voteUpCountEl  = _bar.querySelector("#ab-vote-up-count");
  _voteDownCountEl = _bar.querySelector("#ab-vote-down-count");
  const volInput  = _bar.querySelector("#ab-vol");

  _toggleBtn.addEventListener("click", () => {
    if (_audio.src && !_audio.paused) {
      stopPlay();
    } else {
      startPlay();
    }
  });

  _voteUpBtn.addEventListener("click", async () => {
    await submitVote(1);
  });

  _voteDownBtn.addEventListener("click", async () => {
    await submitVote(-1);
  });

  _statusEl.addEventListener("click", async () => {
    if (!_signInRequired) {
      return;
    }
    await promptAndSignIn();
  });

  _statusEl.addEventListener("keydown", async (event) => {
    if (!_signInRequired) {
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      await promptAndSignIn();
    }
  });

  volInput.addEventListener("input", () => {
    _audio.volume = parseFloat(volInput.value);
    sessionStorage.setItem(SK_VOLUME, volInput.value);
  });

  _audio.addEventListener("playing", () => {
    clearReconnectTimer();
    setUI(true);
    _statusEl.textContent = "";
  });
  _audio.addEventListener("waiting", () => { _statusEl.textContent = "Buffering…"; });
  _audio.addEventListener("stalled", () => {
    setUI(false);
    scheduleReconnect("Stream stalled. Reconnecting…");
  });
  _audio.addEventListener("error", () => {
    setUI(false);
    scheduleReconnect("Stream unavailable. Reconnecting…");
  });
  _audio.addEventListener("pause", () => {
    setUI(false);
    if (_playIntent) {
      scheduleReconnect("Stream paused. Reconnecting…");
    }
  });

  // Auto-resume if the stream was playing before the last navigation
  if (sessionStorage.getItem(SK_PLAYING) === "1") {
    startPlay();
  }

  loadNowPlaying().catch(() => {
    _nowEl.textContent = "Unable to load current song";
    _statusEl.textContent = "";
  });

  _pollTimer = window.setInterval(() => {
    loadNowPlaying().catch(() => {
      // Keep silent in polling loop.
    });
  }, 5000);

  setUI(false);
}
