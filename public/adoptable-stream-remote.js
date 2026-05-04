const els = {
  fullscreenBtn: document.getElementById("fullscreenBtn"),

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
const IMAGE_MOTION_CLASSES = [
  "kb-pan-left",
  "kb-pan-right",
  "kb-pan-up",
  "kb-pan-down",
  "kb-focus-center",
  "kb-focus-tight"
];
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

function setTransitionContent(element, nextValue, { html = false } = {}) {
  if (!element) return;
  const next = `${nextValue ?? ""}`;
  const current = html ? `${element.innerHTML ?? ""}` : `${element.textContent ?? ""}`;
  if (current === next) {
    return;
  }

  element.classList.add("text-transition-host");
  element.querySelectorAll('.text-transition-outgoing').forEach((node) => node.remove());

  if (html) {
    element.innerHTML = next;
  } else {
    element.textContent = next;
  }

  if (current.trim()) {
    const outgoing = document.createElement("div");
    outgoing.className = "text-transition-outgoing";
    outgoing.innerHTML = current;
    element.appendChild(outgoing);
    outgoing.addEventListener("animationend", () => outgoing.remove(), { once: true });
  }

  element.classList.remove("text-transition-incoming");
  void element.offsetWidth;
  element.classList.add("text-transition-incoming");
  element.addEventListener("animationend", () => {
    element.classList.remove("text-transition-incoming");
  }, { once: true });
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
  setTransitionContent(els.animalName, "No adoptables available");
  setTransitionContent(els.animalDetails, "");
  setTransitionContent(els.animalBio, "Configure ASM connection to load adoptable animals.");
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
  photoWrap.classList.remove(...IMAGE_MOTION_CLASSES);
  photoWrap.classList.add(pickImageMotionClass(seed));
  photoWrap.style.setProperty("--kb-duration", `${durationSeconds}s`);
}

function showAnimalSlide(animal, slideMeta = {}) {
  const a = animal || {};
  els.animalSlide.hidden = false;
  els.specialSlide.hidden = true;

  setTransitionContent(els.animalName, a.name || "Unknown");

  const details = buildDisplayLines(a);
  setTransitionContent(els.animalDetails, details.length
    ? details.map((line) => `<div>${escapeHtml(line)}</div>`).join("")
    : "", { html: true });

  const bio = `${a.bio || ""}`.trim();
  setTransitionContent(els.animalBio, bio ? bio.slice(0, 360) : "");

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
    setTransitionContent(els.specialCategory, item.category || "General PSA and Alerts");
    setTransitionContent(els.specialTitle, item.title || "Special Page");
    setTransitionContent(els.specialBody, item.richText || "", { html: true });
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
  showAnimalSlide(slide.animal || {}, slide);
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

    showSlide(0);
    startSlideTimer();
  } catch (error) {
    animals = [];
    slides = [];
    showSlide(0);
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

els.fullscreenBtn.addEventListener("click", () => toggleFullscreen());
document.addEventListener("fullscreenchange", syncFullscreenButton);
document.addEventListener("webkitfullscreenchange", syncFullscreenButton);
document.addEventListener("mozfullscreenchange", syncFullscreenButton);
document.addEventListener("MSFullscreenChange", syncFullscreenButton);

els.prevAnimalBtn.addEventListener("click", () => showSlide(currentIndex - 1));
els.nextAnimalBtn.addEventListener("click", () => showSlide(currentIndex + 1));
els.refreshAnimalsBtn.addEventListener("click", () => loadAdoptables(true));

(async () => {
  syncFullscreenButton();
  await loadAdoptables();
  startAdoptablesRefreshTimer();
})();
