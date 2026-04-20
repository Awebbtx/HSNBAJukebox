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
  animalSlide: document.getElementById("animalSlide"),
  specialSlide: document.getElementById("specialSlide"),
  specialImageTemplate: document.getElementById("specialImageTemplate"),
  specialSplitTemplate: document.getElementById("specialSplitTemplate"),
  specialImageOnly: document.getElementById("specialImageOnly"),
  specialSplitImage: document.getElementById("specialSplitImage"),
  specialCategory: document.getElementById("specialCategory"),
  specialTitle: document.getElementById("specialTitle"),
  specialBody: document.getElementById("specialBody"),
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
const DEFAULT_SLIDESHOW_DISPLAY_FIELDS = [
  "readyToday",
  "species",
  "breed",
  "sex",
  "ageGroup",
  "location",
  "skip",
  "skip",
  "skip",
  "skip"
];
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
  intervalSeconds: 12,
  defaultLimit: 20,
  audioEnabled: true,
  audioSource: "/live.mp3",
  audioVolume: 70,
  audioAutoplay: false,
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
  if (!document.fullscreenElement) {
    await document.documentElement.requestFullscreen().catch(() => {});
    return;
  }
  await document.exitFullscreen().catch(() => {});
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
  const normalized = DEFAULT_SLIDESHOW_DISPLAY_FIELDS.map((_fallback, index) => {
    const value = `${source[index] || ""}`.trim();
    return allowed.has(value) ? value : "skip";
  });
  const hasSelectedValue = normalized.some((value) => value !== "skip");
  return hasSelectedValue ? normalized : [...DEFAULT_SLIDESHOW_DISPLAY_FIELDS];
}

function formatRawFieldLabel(fieldName) {
  return `${fieldName || ""}`
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .trim();
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
    catalog.push({
      key: `${item?.key || `raw:${sourceKey}`}`,
      sourceKey,
      label: `${item?.label || formatRawFieldLabel(sourceKey)}`.trim() || formatRawFieldLabel(sourceKey),
      enabled: item?.enabled !== false
    });
  }
  return catalog;
}

function buildDisplayLines(animal) {
  const fields = normalizeDisplayFields(slideshowSettings.displayFields);
  return fields
    .map((fieldKey) => {
      if (fieldKey.startsWith("raw:")) {
        const rawFieldName = fieldKey.slice(4);
        const rawValue = `${animal?.rawFields?.[rawFieldName] || ""}`.trim();
        if (!rawValue) {
          return "";
        }
        const entry = slideshowRawFieldCatalog.find((item) => item.key === fieldKey || item.sourceKey === rawFieldName);
        return `${entry?.label || formatRawFieldLabel(rawFieldName)}: ${rawValue}`;
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
    els.animalName.textContent = "No adoptables available";
    els.animalDetails.textContent = "";
    els.animalBio.textContent = "Configure ASM connection to load adoptable animals.";
    els.animalProfileLink.setAttribute("href", "#");
    els.animalProfileLink.style.pointerEvents = "none";
    els.animalProfileLink.style.opacity = "0.5";
    els.animalImage.removeAttribute("src");
    els.animalImage.parentElement.classList.remove("has-image", "portrait", "landscape");
}

function showAnimalSlide(animal) {
  const a = animal || {};
  els.animalSlide.hidden = false;
  els.specialSlide.hidden = true;

  els.animalName.textContent = a.name || "Unknown";

  const details = buildDisplayLines(a);
  els.animalDetails.innerHTML = details.length
    ? details.map((line) => `<div>${escapeHtml(line)}</div>`).join("")
    : "";

  const bio = `${a.bio || ""}`.trim();
  els.animalBio.textContent = bio ? bio.slice(0, 360) : "";

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
    els.animalImage.onload = function () {
      const portrait = this.naturalHeight > this.naturalWidth;
      photoWrap.classList.toggle("portrait", portrait);
      photoWrap.classList.toggle("landscape", !portrait);
    };
    els.animalImage.src = a.imageUrl;
    photoWrap.classList.add("has-image");
  } else {
    els.animalImage.onload = null;
    els.animalImage.removeAttribute("src");
    els.animalImage.parentElement.classList.remove("has-image", "portrait", "landscape");
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
    els.specialCategory.textContent = item.category || "General PSA and Alerts";
    els.specialTitle.textContent = item.title || "Special Page";
    els.specialBody.innerHTML = item.richText || "";
  }
}

function showSlide(index) {
  if (!slides.length) {
    renderEmptySlide();
    return;
  }
  currentIndex = (index + slides.length) % slides.length;
  const slide = slides[currentIndex] || {};
  els.slideCounter.textContent = `${currentIndex + 1} / ${slides.length}`;
  if (slide.type === "special") {
    showSpecialSlide(slide.page || {});
    return;
  }
  showAnimalSlide(slide.animal || {});
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
        showSlide(currentIndex + 1);
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
      els.adoptableStatus.textContent = `ASM error: ${payload.error}`;
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

els.prevAnimalBtn.addEventListener("click", () => showSlide(currentIndex - 1));
els.nextAnimalBtn.addEventListener("click", () => showSlide(currentIndex + 1));
els.refreshAnimalsBtn.addEventListener("click", () => loadAdoptables(true));

(async () => {
  updateDateTime();
  syncFullscreenButton();
  await Promise.all([loadAdoptables(), loadNowPlaying()]);
  startAdoptablesRefreshTimer();
  window.setInterval(loadNowPlaying, 6000);
  window.setInterval(updateDateTime, 1000);
})();
