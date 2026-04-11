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

if (els.liveAudio) {
  els.liveAudio.addEventListener("playing", () => setStatus("Live stream is playing."));
  els.liveAudio.addEventListener("waiting", () => setStatus("Buffering..."));
  els.liveAudio.addEventListener("stalled", () => setStatus("Stream stalled. Tap Reconnect."));
  els.liveAudio.addEventListener("error", () => setStatus("Stream unavailable right now. Try Reconnect."));
} else {
  setStatus("Live stream control unavailable.");
}
