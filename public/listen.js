import { initAudioBar } from "/audio-bar.js";
initAudioBar();

function resolveLiveAudio() {
  const local = document.getElementById("liveAudio");
  if (local) {
    return local;
  }
  try {
    return window.top?.document?.getElementById("liveAudio") || null;
  } catch {
    return null;
  }
}

const els = {
  liveAudio: resolveLiveAudio(),
  playBtn: document.getElementById("playBtn"),
  reloadBtn: document.getElementById("reloadBtn"),
  statusText: document.getElementById("statusText")
};

function setStatus(text) {
  els.statusText.textContent = text;
}

async function playStream() {
  if (!els.liveAudio) {
    setStatus("Live stream control unavailable.");
    return;
  }
  try {
    await els.liveAudio.play();
    setStatus("Live stream is playing.");
  } catch (error) {
    setStatus(`Unable to autoplay. Tap browser play control. ${error.message || ""}`.trim());
  }
}

function reconnect() {
  if (!els.liveAudio) {
    setStatus("Live stream control unavailable.");
    return;
  }
  const ts = Date.now();
  els.liveAudio.src = `/live.mp3?t=${ts}`;
  setStatus("Reconnecting stream...");
}

els.playBtn.addEventListener("click", playStream);
els.reloadBtn.addEventListener("click", reconnect);

let _reconnectTimer = null;
function scheduleReconnect(statusText) {
  setStatus(statusText);
  if (_reconnectTimer) window.clearTimeout(_reconnectTimer);
  _reconnectTimer = window.setTimeout(() => {
    _reconnectTimer = null;
    reconnect();
  }, 3000);
}

if (els.liveAudio) {
  els.liveAudio.addEventListener("playing", () => {
    if (_reconnectTimer) { window.clearTimeout(_reconnectTimer); _reconnectTimer = null; }
    setStatus("Live stream is playing.");
  });
  els.liveAudio.addEventListener("waiting", () => setStatus("Buffering..."));
  els.liveAudio.addEventListener("stalled", () => scheduleReconnect("Stream stalled. Reconnecting..."));
  els.liveAudio.addEventListener("error", () => scheduleReconnect("Stream unavailable. Reconnecting..."));
} else {
  setStatus("Live stream control unavailable.");
}
