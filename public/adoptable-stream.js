import { initAudioBar } from "/audio-bar.js";
initAudioBar();

const els = {
  fullscreenBtn: document.getElementById("fullscreenBtn"),
  localDateTime: document.getElementById("localDateTime"),
  nowPlayingTitle: document.getElementById("nowPlayingTitle"),
  nowPlayingMeta: document.getElementById("nowPlayingMeta"),

  animalImage: document.getElementById("animalImage"),
  imageFallback: document.getElementById("imageFallback"),
  animalName: document.getElementById("animalName"),
  animalDetails: document.getElementById("animalDetails"),
  animalBio: document.getElementById("animalBio"),
  animalProfileLink: document.getElementById("animalProfileLink"),
  animalCopyStage: document.getElementById("animalCopyStage"),
  animalSlide: document.getElementById("animalSlide"),
  specialSlide: document.getElementById("specialSlide"),
  specialImageTemplate: document.getElementById("specialImageTemplate"),
  specialSplitTemplate: document.getElementById("specialSplitTemplate"),
  specialImageOnly: document.getElementById("specialImageOnly"),
  specialSplitImage: document.getElementById("specialSplitImage"),
  specialCategory: document.getElementById("specialCategory"),
  specialTitle: document.getElementById("specialTitle"),
  specialBody: document.getElementById("specialBody"),
  specialCopyStage: document.getElementById("specialCopyStage"),
  slideCounter: document.getElementById("slideCounter"),
  adoptableStatus: document.getElementById("adoptableStatus"),

  prevAnimalBtn: document.getElementById("prevAnimalBtn"),
  nextAnimalBtn: document.getElementById("nextAnimalBtn"),
  refreshAnimalsBtn: document.getElementById("refreshAnimalsBtn")
};

let animals = [];
let slides = [];
let currentIndex = 0;
let slideTimer = null;
let adoptablesRefreshTimer = null;
const INTER_SLIDE_BREAK_MS = 1000;
const IMAGE_PRELOAD_TIMEOUT_MS = 5000;
let slideAdvanceToken = 0;
const IMAGE_MOTION_CLASSES = [
  "kb-pan-left",
  "kb-pan-right",
  "kb-pan-up",
  "kb-pan-down",
  "kb-focus-center",
  "kb-focus-tight"
];

// Emoji Shower Configuration (defaults - will be overridden by server settings)
let emojiShowerSettings = {
  enabled: true,
  frequency: 3,
  duration: 3000,
  intensity: 15,
  emojis: ["❤️", "⭐", "🎵", "🐾"]
};
let slideShowCount = 0; // Track slides for emoji trigger
let emojiShowerBurstId = 0;

const DEFAULT_SLIDESHOW_DISPLAY_FIELDS = [
  "raw:NEUTERED",
  "raw:ISGOODWITHCATS",
  "raw:ISGOODWITHDOGS",
  "raw:ISGOODWITHCHILDREN",
  "raw:ISHOUSETRAINED",
  "raw:WEIGHT",
  "raw:TIMEONSHELTER",
  "raw:SIZE",
  "skip",
  "skip"
];
const SLIDESHOW_DISPLAY_FIELD_SLOT_MIN = 1;
const DISPLAY_FIELD_RENDERERS = {
  skip: () => "",
  readyToday: (animal) => (animal.readyToday ? "Ready today" : "Not ready today"),
  species: (animal) => `${animal.species || ""}`.trim(),
  breed: (animal) => `${animal.breed || ""}`.trim(),
  sex: (animal) => `${animal.sex || ""}`.trim(),
  ageGroup: (animal) => `${animal.ageGroup || ""}`.trim(),
  location: (animal) => `${animal.location || ""}`.trim(),
  name: (animal) => `${animal.name || ""}`.trim(),
  bio: (animal) => `${animal.bio || ""}`.trim()
};
let slideshowRawFieldCatalog = [];
let slideshowSettings = {
  intervalSeconds: 15,
  defaultLimit: 50,
  audioEnabled: true,
  audioSource: "/live.mp3",
  audioVolume: 70,
  audioAutoplay: true,
  displayFields: [...DEFAULT_SLIDESHOW_DISPLAY_FIELDS]
};

function escapeHtml(value) {
  return `${value || ""}`
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function runCopyStageTransition(stage, updater) {
  if (!stage || typeof updater !== "function") {
    return;
  }
  const frame = stage.closest(".copy-frame");
  if (!frame) {
    updater();
    return;
  }

  frame.querySelectorAll(".copy-stage-outgoing").forEach((node) => node.remove());
  const previousHtml = `${stage.innerHTML || ""}`.trim();

  updater();

  stage.classList.remove("copy-stage-incoming");
  void stage.offsetWidth;
  stage.classList.add("copy-stage-incoming");
  stage.addEventListener("animationend", () => {
    stage.classList.remove("copy-stage-incoming");
  }, { once: true });

  if (!previousHtml) {
    return;
  }

  const outgoing = document.createElement("div");
  outgoing.className = "copy-stage-outgoing";
  outgoing.innerHTML = previousHtml;
  outgoing.querySelectorAll("[id]").forEach((node) => node.removeAttribute("id"));
  frame.appendChild(outgoing);
  outgoing.addEventListener("animationend", () => outgoing.remove(), { once: true });
}

function updateDateTime() {
  const now = new Date();
  els.localDateTime.textContent = now.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit"
  });
}

async function toggleFullscreen() {
  const root = document.documentElement;
  const isFull = Boolean(
    document.fullscreenElement
    || document.webkitFullscreenElement
    || document.mozFullScreenElement
    || document.msFullscreenElement
  );

  if (!isFull) {
    if (root.requestFullscreen) {
      await root.requestFullscreen().catch(() => {});
      return;
    }
    if (root.webkitRequestFullscreen) {
      root.webkitRequestFullscreen();
      return;
    }
    if (root.mozRequestFullScreen) {
      root.mozRequestFullScreen();
      return;
    }
    if (root.msRequestFullscreen) {
      root.msRequestFullscreen();
    }
    return;
  }

  if (document.exitFullscreen) {
    await document.exitFullscreen().catch(() => {});
    return;
  }
  if (document.webkitExitFullscreen) {
    document.webkitExitFullscreen();
    return;
  }
  if (document.mozCancelFullScreen) {
    document.mozCancelFullScreen();
    return;
  }
  if (document.msExitFullscreen) {
    document.msExitFullscreen();
  }
}

function syncFullscreenButton() {
  els.fullscreenBtn.textContent = document.fullscreenElement ? "Exit Fullscreen" : "Fullscreen";
}

function normalizeDisplayFields(raw) {
  const allowed = new Set([
    ...Object.keys(DISPLAY_FIELD_RENDERERS),
    ...slideshowRawFieldCatalog.map((entry) => entry.key)
  ]);
  const source = Array.isArray(raw) ? raw : [];
  const hasNonEmptySourceValue = source.some((value) => `${value || ""}`.trim());
  const targetLength = Math.max(
    SLIDESHOW_DISPLAY_FIELD_SLOT_MIN,
    hasNonEmptySourceValue ? source.length : DEFAULT_SLIDESHOW_DISPLAY_FIELDS.length
  );
  const normalized = Array.from({ length: targetLength }, (_fallback, index) => {
    const value = `${source[index] || ""}`.trim();
    return allowed.has(value) ? value : "skip";
  });
  const hasSelectedValue = normalized.some((value) => value !== "skip");
  if (hasSelectedValue) {
    return normalized;
  }
  const fallback = Array.from({ length: targetLength }, () => "skip");
  for (let index = 0; index < targetLength; index += 1) {
    fallback[index] = DEFAULT_SLIDESHOW_DISPLAY_FIELDS[index] || "skip";
  }
  return fallback;
}

function formatRawFieldLabel(fieldName) {
  return `${fieldName || ""}`
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .trim();
}

function buildRawValueLookupCandidates(rawValue) {
  const text = `${rawValue ?? ""}`.trim();
  if (!text) {
    return [];
  }
  const candidates = new Set([text]);
  const lower = text.toLowerCase();
  if (lower === "true") {
    candidates.add("1");
  } else if (lower === "false") {
    candidates.add("0");
  }
  const asNumber = Number(text);
  if (Number.isFinite(asNumber)) {
    candidates.add(`${asNumber}`);
    if (Number.isInteger(asNumber)) {
      candidates.add(`${Math.trunc(asNumber)}`);
    }
  }
  return Array.from(candidates);
}

function getMappedValueLabel(valueLabels, rawValue) {
  if (!valueLabels || typeof valueLabels !== "object") {
    return "";
  }
  const candidates = buildRawValueLookupCandidates(rawValue);
  for (const candidate of candidates) {
    const mapped = `${valueLabels[candidate] ?? ""}`.trim();
    if (mapped) {
      return mapped;
    }
  }
  return "";
}

function buildRawFieldDisplayLine(label, valueText) {
  const safeLabel = `${label || ""}`.trim();
  const safeValue = `${valueText || ""}`.trim();
  if (!safeValue) {
    return "";
  }
  return safeLabel ? `${safeLabel} ${safeValue}` : safeValue;
}

function normalizeDisplayFieldCatalog(raw) {
  if (!Array.isArray(raw)) {
    return [];
  }
  const seen = new Set();
  const catalog = [];
  for (const item of raw) {
    const sourceKey = `${item?.sourceKey || ""}`.trim();
    if (!sourceKey) {
      continue;
    }
    const dedupeKey = sourceKey.toUpperCase();
    if (seen.has(dedupeKey)) {
      continue;
    }
    seen.add(dedupeKey);
    const valueLabels = Object.fromEntries(
      Object.entries(item?.valueLabels && typeof item.valueLabels === "object" ? item.valueLabels : {})
        .map(([valueKey, label]) => {
          const safeValueKey = `${valueKey || ""}`.trim().slice(0, 64);
          const safeLabel = `${label || ""}`.trim().slice(0, 80);
          return safeValueKey && safeLabel ? [safeValueKey, safeLabel] : null;
        })
        .filter(Boolean)
        .slice(0, 40)
    );
    const catalogEntry = {
      key: `${item?.key || `raw:${sourceKey}`}`,
      sourceKey,
      label: `${item?.label || formatRawFieldLabel(sourceKey)}`.trim() || formatRawFieldLabel(sourceKey),
      enabled: item?.enabled !== false,
      valueLabels
    };
    catalog.push(catalogEntry);
  }
  return catalog;
}

function buildDisplayLines(animal) {
  const fields = normalizeDisplayFields(slideshowSettings.displayFields);
  return fields
    .map((fieldKey) => {
      if (fieldKey.startsWith("raw:")) {
        const rawFieldName = fieldKey.slice(4);
        const rawValue = `${animal?.rawFields?.[rawFieldName] ?? ""}`.trim();
        if (!rawValue) {
          return "";
        }
        const entry = slideshowRawFieldCatalog.find((item) => item.key === fieldKey || item.sourceKey === rawFieldName);
        const mappedValue = getMappedValueLabel(entry?.valueLabels, rawValue);
        if (mappedValue.toLowerCase() === "hide") {
          return "";
        }
        return buildRawFieldDisplayLine(entry?.label || formatRawFieldLabel(rawFieldName), mappedValue || rawValue);
      }
      const formatter = DISPLAY_FIELD_RENDERERS[fieldKey] || DISPLAY_FIELD_RENDERERS.skip;
      return `${formatter(animal) || ""}`.trim();
    })
    .filter(Boolean)
    .slice(0, 10);
}

function renderEmptySlide() {
    els.slideCounter.textContent = "0 / 0";
    els.animalSlide.hidden = false;
    els.specialSlide.hidden = true;
    runCopyStageTransition(els.animalCopyStage, () => {
      els.animalName.textContent = "No adoptables available";
      els.animalDetails.textContent = "";
      els.animalBio.textContent = "Configure ASM connection to load adoptable animals.";
    });
    els.animalProfileLink.setAttribute("href", "#");
    els.animalProfileLink.style.pointerEvents = "none";
    els.animalProfileLink.style.opacity = "0.5";
    els.animalImage.removeAttribute("src");
    const photoWrap = els.animalImage.parentElement;
    photoWrap.classList.remove("has-image", "portrait", "landscape", ...IMAGE_MOTION_CLASSES);
    photoWrap.style.removeProperty("--kb-duration");
}

function pickImageMotionClass(seed = "") {
  const text = `${seed || ""}`;
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) - hash) + text.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % IMAGE_MOTION_CLASSES.length;
  return IMAGE_MOTION_CLASSES[index];
}

function applyAnimalImageMotion(photoWrap, seed, displaySeconds) {
  const durationSeconds = Math.max(8, Number(displaySeconds || slideshowSettings.intervalSeconds || 12) - 0.25);
  const image = photoWrap.querySelector("img");
  if (image) {
    image.style.animation = "none";
    void image.offsetWidth;
    image.style.removeProperty("animation");
  }
  photoWrap.classList.remove(...IMAGE_MOTION_CLASSES);
  photoWrap.classList.add(pickImageMotionClass(seed));
  photoWrap.style.setProperty("--kb-duration", `${durationSeconds}s`);
}

function showAnimalSlide(animal, slideMeta = {}) {
  const a = animal || {};
  els.animalSlide.hidden = false;
  els.specialSlide.hidden = true;

  runCopyStageTransition(els.animalCopyStage, () => {
    els.animalName.textContent = a.name || "Unknown";

    const details = buildDisplayLines(a);
    els.animalDetails.innerHTML = details.length
      ? details.map((line) => `<div>${escapeHtml(line)}</div>`).join("")
      : "";

    const bio = `${a.bio || ""}`.trim();
    els.animalBio.textContent = bio ? bio.slice(0, 360) : "";
  });

  if (a.profileUrl) {
    els.animalProfileLink.setAttribute("href", a.profileUrl);
    els.animalProfileLink.style.pointerEvents = "auto";
    els.animalProfileLink.style.opacity = "1";
  } else {
    els.animalProfileLink.setAttribute("href", "#");
    els.animalProfileLink.style.pointerEvents = "none";
    els.animalProfileLink.style.opacity = "0.5";
  }

  if (a.imageUrl) {
    const photoWrap = els.animalImage.parentElement;
    applyAnimalImageMotion(photoWrap, `${a.imageUrl}|${currentIndex}`, slideMeta?.displaySeconds);
    els.animalImage.onload = function () {
      const portrait = this.naturalHeight > this.naturalWidth;
      photoWrap.classList.toggle("portrait", portrait);
      photoWrap.classList.toggle("landscape", !portrait);
      applyAnimalImageMotion(photoWrap, `${a.imageUrl}|${currentIndex}`, slideMeta?.displaySeconds);
    };
    els.animalImage.src = a.imageUrl;
    photoWrap.classList.add("has-image");
  } else {
    const photoWrap = els.animalImage.parentElement;
    els.animalImage.onload = null;
    els.animalImage.removeAttribute("src");
    photoWrap.classList.remove("has-image", "portrait", "landscape", ...IMAGE_MOTION_CLASSES);
    photoWrap.style.removeProperty("--kb-duration");
  }
}

function showSpecialSlide(page) {
  const item = page || {};
  els.animalSlide.hidden = true;
  els.specialSlide.hidden = false;
  els.specialImageTemplate.hidden = item.template !== "image";
  els.specialSplitTemplate.hidden = item.template === "image";

  if (item.template === "image") {
    els.specialImageOnly.src = item.imageUrl || "";
    els.specialImageOnly.alt = item.title || "Special slide";
  } else {
    els.specialSplitImage.src = item.imageUrl || "";
    els.specialSplitImage.alt = item.title || "Special slide";
    runCopyStageTransition(els.specialCopyStage, () => {
      els.specialCategory.textContent = item.category || "General PSA and Alerts";
      els.specialTitle.textContent = item.title || "Special Page";
      els.specialBody.innerHTML = item.richText || "";
    });
  }
}

function triggerEmojiShower() {
  if (!emojiShowerSettings.enabled) return;

  const container = document.getElementById("emojiShower");
  if (!container) return;

  const intensity = Math.max(1, Math.min(400, Number(emojiShowerSettings.intensity || 15)));
  const emojis = emojiShowerSettings.emojis || ["❤️", "⭐", "🎵", "🐾"];
  const baseDuration = Math.max(500, Number(emojiShowerSettings.duration || 3000));
  const staggerWindowMs = Math.min(6000, Math.max(300, Math.round(baseDuration * 0.9)));
  const burstId = ++emojiShowerBurstId;
  const viewportWidth = Math.max(320, window.innerWidth || 0);
  const horizontalMarginPx = Math.max(24, Math.round(viewportWidth * 0.04));
  const minLeftPx = horizontalMarginPx;
  const maxLeftPx = Math.max(minLeftPx, viewportWidth - horizontalMarginPx);

  const spawnParticle = () => {
    const emoji = emojis[Math.floor(Math.random() * emojis.length)];
    const span = document.createElement("span");
    span.className = "emoji-rain";
    span.textContent = emoji;
    span.dataset.burstId = `${burstId}`;

    const leftPx = minLeftPx + Math.random() * (maxLeftPx - minLeftPx);
    span.style.left = `${leftPx}px`;
    span.style.top = "-50px";

    // Keep variance in fall speed while honoring configured duration.
    const fallDuration = Math.max(500, Math.round(baseDuration * (0.8 + Math.random() * 0.5)));
    span.style.animationDuration = `${fallDuration}ms`;
    span.style.animationDelay = "0ms";

    container.appendChild(span);
    window.setTimeout(() => span.remove(), fallDuration + 250);
  };

  // Emit particles across time so high counts remain visible.
  for (let i = 0; i < intensity; i++) {
    const spawnDelay = Math.random() * staggerWindowMs;
    window.setTimeout(spawnParticle, spawnDelay);
  }

  // Cleanup this burst only (prevents removing particles from newer bursts).
  window.setTimeout(() => {
    container.querySelectorAll(`.emoji-rain[data-burst-id="${burstId}"]`).forEach((el) => el.remove());
  }, staggerWindowMs + baseDuration + 400);
}

function showSlide(index) {
  if (!slides.length) {
    renderEmptySlide();
    return;
  }
  currentIndex = (index + slides.length) % slides.length;
  const slide = slides[currentIndex] || {};
  els.slideCounter.textContent = `${currentIndex + 1} / ${slides.length}`;

  // Trigger emoji shower based on settings (in fullscreen only)
  try {
    if (emojiShowerSettings && emojiShowerSettings.enabled) {
      slideShowCount++;
      if (
        slideShowCount % emojiShowerSettings.frequency === 0
        && (document.fullscreenElement || document.webkitFullscreenElement)
      ) {
        triggerEmojiShower();
      }
    }
  } catch (err) {
    console.error("Error in emoji shower:", err);
  }

  if (slide.type === "special") {
    showSpecialSlide(slide.page || {});
    return;
  }
  showAnimalSlide(slide.animal || {}, slide);
}

function waitMs(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, Math.max(0, Number(ms || 0))));
}

function preloadSlideImage(slide) {
  const imageUrl = `${slide?.animal?.imageUrl || ""}`.trim();
  if (!imageUrl) {
    return Promise.resolve(false);
  }

  return new Promise((resolve) => {
    const probe = new Image();
    let done = false;
    const finish = (loaded) => {
      if (done) return;
      done = true;
      window.clearTimeout(timer);
      probe.onload = null;
      probe.onerror = null;
      resolve(Boolean(loaded));
    };
    const timer = window.setTimeout(() => finish(false), IMAGE_PRELOAD_TIMEOUT_MS);
    probe.onload = () => finish(true);
    probe.onerror = () => finish(false);
    probe.src = imageUrl;
  });
}

async function transitionToSlide(index, { withBreak = false } = {}) {
  if (!slides.length) {
    renderEmptySlide();
    return;
  }

  const normalizedIndex = (index + slides.length) % slides.length;
  const nextSlide = slides[normalizedIndex] || {};
  const token = ++slideAdvanceToken;

  const preloadPromise = nextSlide.type === "animal"
    ? preloadSlideImage(nextSlide)
    : Promise.resolve(false);

  if (withBreak) {
    await Promise.all([preloadPromise, waitMs(INTER_SLIDE_BREAK_MS)]);
  } else {
    await preloadPromise;
  }

  if (token !== slideAdvanceToken) {
    return;
  }

  showSlide(normalizedIndex);
}

function startSlideTimer() {
  if (slideTimer) {
    window.clearTimeout(slideTimer);
  }
  const scheduleNext = () => {
    const current = slides[currentIndex] || null;
    const seconds = Math.max(4, Number(current?.displaySeconds || slideshowSettings.intervalSeconds || 12));
    slideTimer = window.setTimeout(() => {
      if (slides.length > 1) {
        transitionToSlide(currentIndex + 1, { withBreak: true })
          .catch(() => {})
          .finally(scheduleNext);
        return;
      }
      scheduleNext();
    }, seconds * 1000);
  };
  scheduleNext();
}

function applySlideshowSettings(settings = {}) {
  slideshowSettings = {
    ...slideshowSettings,
    ...(settings || {})
  };
  slideshowRawFieldCatalog = normalizeDisplayFieldCatalog(settings?.displayFieldCatalog || slideshowRawFieldCatalog);
  slideshowSettings.displayFields = normalizeDisplayFields(slideshowSettings.displayFields);

  // Apply emoji shower settings from server
  if (settings.emojiShower) {
    emojiShowerSettings = {
      enabled: settings.emojiShower.enabled !== false,
      frequency: Math.max(1, Number(settings.emojiShower.frequency || 3)),
      duration: Math.max(500, Number(settings.emojiShower.duration || 3000)),
      intensity: Math.max(1, Number(settings.emojiShower.intensity || 15)),
      emojis: Array.isArray(settings.emojiShower.emojis) && settings.emojiShower.emojis.length
        ? settings.emojiShower.emojis
        : ["❤️", "⭐", "🎵", "🐾"]
    };
  }
}

async function loadAdoptables(force = false) {
  try {
    const cacheBust = `&_ts=${Date.now()}`;
    const url = `/api/adoptables/slideshow?limit=${Math.max(1, Number(slideshowSettings.defaultLimit || 20))}${force ? "&refresh=1" : ""}${cacheBust}`;
    const res = await fetch(url, { cache: "no-store" });
    const payload = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(payload.error || `HTTP ${res.status}`);
    }

    applySlideshowSettings(payload.settings || {});

    const wasEmpty = slides.length === 0;
    animals = payload.animals || [];
    slides = payload.slides || (animals || []).map((animal) => ({ type: "animal", animal }));
    if (!payload.configured) {
      els.adoptableStatus.textContent = "ASM is not configured yet (set service URL and credentials).";
    } else if (payload.error) {
      els.adoptableStatus.textContent = `ASM error: ${payload.error} — retrying in 20s`;
      window.setTimeout(() => loadAdoptables().catch(() => {}), 20000);
    } else {
      els.adoptableStatus.textContent = payload.fetchedAt
        ? `Adoptables synced ${new Date(payload.fetchedAt).toLocaleTimeString()}`
        : "Adoptables synced";
    }

    if (wasEmpty || force) {
      // First load or manual refresh: start from beginning
      showSlide(0);
      startSlideTimer();
    } else if (slides.length > 0) {
      // Background refresh: stay on current slide (clamp in case list shrank)
      currentIndex = Math.min(currentIndex, slides.length - 1);
      els.slideCounter.textContent = `${currentIndex + 1} / ${slides.length}`;
    }
  } catch (error) {
    if (slides.length === 0) {
      animals = [];
      slides = [];
      showSlide(0);
    }
    els.adoptableStatus.textContent = error.message;
  }
}

function startAdoptablesRefreshTimer() {
  if (adoptablesRefreshTimer) {
    window.clearInterval(adoptablesRefreshTimer);
  }
  adoptablesRefreshTimer = window.setInterval(() => {
    loadAdoptables().catch(() => {});
  }, 30000);
}

async function loadNowPlaying() {
  try {
    const res = await fetch("/api/display/queue");
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(payload.error || `HTTP ${res.status}`);

    const c = payload.current;
    if (!c) {
      els.nowPlayingTitle.textContent = "Nothing playing";
      els.nowPlayingMeta.textContent = "Queue up a song to begin";
      return;
    }

    els.nowPlayingTitle.textContent = c.name || "Unknown";
    const byline = [c.artists, c.album].filter(Boolean).join(" - ");
    els.nowPlayingMeta.textContent = byline || "On-air stream";
  } catch {
    els.nowPlayingMeta.textContent = "Now playing unavailable";
  }
}
els.fullscreenBtn.addEventListener("click", () => toggleFullscreen());
document.addEventListener("fullscreenchange", syncFullscreenButton);
document.addEventListener("webkitfullscreenchange", syncFullscreenButton);
document.addEventListener("mozfullscreenchange", syncFullscreenButton);
document.addEventListener("MSFullscreenChange", syncFullscreenButton);

els.prevAnimalBtn.addEventListener("click", () => {
  transitionToSlide(currentIndex - 1).catch(() => {});
});
els.nextAnimalBtn.addEventListener("click", () => {
  transitionToSlide(currentIndex + 1).catch(() => {});
});
els.refreshAnimalsBtn.addEventListener("click", () => loadAdoptables(true));

(async () => {
  updateDateTime();
  syncFullscreenButton();
  await Promise.all([loadAdoptables(), loadNowPlaying()]);
  startAdoptablesRefreshTimer();
  window.setInterval(loadNowPlaying, 6000);
  window.setInterval(updateDateTime, 1000);
})();
