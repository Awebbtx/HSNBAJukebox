import { initAudioBar } from "/audio-bar.js";
initAudioBar();

const ADMIN_TOKEN_KEY = "jukebox.admin.token";
const EMPLOYEE_TOKEN_KEY = "jukebox.employee.token";

let adminToken = sessionStorage.getItem(ADMIN_TOKEN_KEY) || localStorage.getItem(ADMIN_TOKEN_KEY) || "";
let currentPlaybackState = null;
let playbackTimer = null;
let queueTimer = null;
let volumeDebounce = null;
let audioJackDebounce = null;
let masterVolumeBeforeMute = 80;
let settingsTab = "request";
let asmSubtab = "connection";
const pageMode = document.body?.dataset?.adminPage || "full";
const SLIDESHOW_DISPLAY_FIELD_OPTIONS = [
  { key: "skip", label: "Skip" },
  { key: "readyToday", label: "Ready Today" },
  { key: "species", label: "Species" },
  { key: "breed", label: "Breed" },
  { key: "sex", label: "Sex" },
  { key: "ageGroup", label: "Age Group" },
  { key: "location", label: "Location" },
  { key: "name", label: "Name" },
  { key: "bio", label: "Bio" }
];
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
let slideshowDisplayFieldCatalog = [];
let slideshowDisplayFieldOptions = [...SLIDESHOW_DISPLAY_FIELD_OPTIONS];
let asmKnownFieldNames = [];
let specialPages = [];
let audioAutomationSchedules = [];
const AUDIO_AUTOMATION_TARGET_ACTIONS = {
  stream: ["start", "stop"],
  playback: ["play", "pause", "stop"],
  "audio-jack": ["mute", "unmute"]
};
const AUDIO_AUTOMATION_DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const SPECIAL_PAGE_CATEGORIES = [
  "Special Thanks",
  "Employee of the Month",
  "Volunteer of the Month",
  "Upcoming Events",
  "TNR Program",
  "Become a Volunteer",
  "General PSA and Alerts"
];

if (pageMode === "audio") {
  settingsTab = "audio-jack";
} else if (pageMode === "scheduler") {
  settingsTab = "audio-jack";
} else if (pageMode === "system") {
  settingsTab = "spotify";
} else if (pageMode === "staff") {
  settingsTab = "request";
} else if (pageMode === "stats") {
  settingsTab = "request";
} else if (pageMode === "users") {
  settingsTab = "account";
} else if (pageMode === "account") {
  settingsTab = "account";
} else if (pageMode === "adoptable") {
  settingsTab = "asm";
  asmSubtab = "slideshow";
} else if (pageMode === "custom-slides") {
  settingsTab = "asm";
  asmSubtab = "slideshow";
}

const els = {
  logoutBtn:    document.getElementById("logoutBtn"),
  topSaveBtn:   document.getElementById("topSaveBtn"),
  trackTitle:   document.getElementById("trackTitle"),
  trackMeta:    document.getElementById("trackMeta"),
  posText:      document.getElementById("posText"),
  durText:      document.getElementById("durText"),
  progBar:      document.getElementById("progBar"),
  prevBtn:      document.getElementById("prevBtn"),
  playPauseBtn: document.getElementById("playPauseBtn"),
  nextBtn:      document.getElementById("nextBtn"),
  masterMuteToggleBtn: document.getElementById("masterMuteToggleBtn"),
  volumeSlider: document.getElementById("volumeSlider"),
  volVal:       document.getElementById("volVal"),
  repeatBtn:    document.getElementById("repeatBtn"),
  randomBtn:    document.getElementById("randomBtn"),
  shuffleBtn:   document.getElementById("shuffleBtn"),
  clearBtn:     document.getElementById("clearBtn"),
  queueList:    document.getElementById("queueList"),
  queueCount:   document.getElementById("queueCount"),
  requesterList:document.getElementById("requesterList"),
  loginDialog:  document.getElementById("loginDialog"),
  loginForm:          document.getElementById("loginForm"),
  usernameInput:      document.getElementById("usernameInput"),
  passwordInput:      document.getElementById("passwordInput"),
  toast:              document.getElementById("toast"),
  explicitToggle:     document.getElementById("explicitToggle"),
  savePlaylistBtn:    document.getElementById("savePlaylistBtn"),
  refreshPlaylistsBtn:document.getElementById("refreshPlaylistsBtn"),
  playlistNameInput:  document.getElementById("playlistNameInput"),
  playlistList:       document.getElementById("playlistList"),

  tabAccount: document.getElementById("tabAccount"),
  tabRequestAccess: document.getElementById("tabRequestAccess"),
  tabAudioJack: document.getElementById("tabAudioJack"),
  tabSpotify: document.getElementById("tabSpotify"),
  tabAsm: document.getElementById("tabAsm"),
  panelAccount: document.getElementById("panelAccount"),
  panelRequestAccess: document.getElementById("panelRequestAccess"),
  panelAudioJack: document.getElementById("panelAudioJack"),
  panelSpotify: document.getElementById("panelSpotify"),
  panelAsm: document.getElementById("panelAsm"),
  asmSubtabConnection: document.getElementById("asmSubtabConnection"),
  asmSubtabSlideshow: document.getElementById("asmSubtabSlideshow"),
  asmSubtabDiagnostics: document.getElementById("asmSubtabDiagnostics"),
  asmPanelConnection: document.getElementById("asmPanelConnection"),
  asmPanelSlideshow: document.getElementById("asmPanelSlideshow"),
  asmPanelDiagnostics: document.getElementById("asmPanelDiagnostics"),

  saveRequestAccessSettingsBtn: document.getElementById("saveRequestAccessSettingsBtn"),
  defaultRequestLimitInput: document.getElementById("defaultRequestLimitInput"),
  saveDefaultRequestLimitBtn: document.getElementById("saveDefaultRequestLimitBtn"),
  staffFirstNameInput: document.getElementById("staffFirstNameInput"),
  staffLastInitialInput: document.getElementById("staffLastInitialInput"),
  staffUsernameInput: document.getElementById("staffUsernameInput"),
  staffPasswordInput: document.getElementById("staffPasswordInput"),
  staffLimitInput: document.getElementById("staffLimitInput"),
  createStaffBtn: document.getElementById("createStaffBtn"),
  staffStatusText: document.getElementById("staffStatusText"),
  staffList: document.getElementById("staffList"),
  refreshRequestStatsBtn: document.getElementById("refreshRequestStatsBtn"),
  topRequestedAdminList: document.getElementById("topRequestedAdminList"),
  topUpvotedAdminList: document.getElementById("topUpvotedAdminList"),
  topPlayedAdminList: document.getElementById("topPlayedAdminList"),
  topSkippedAdminList: document.getElementById("topSkippedAdminList"),
  topDownvotedAdminList: document.getElementById("topDownvotedAdminList"),

  accountStatusText: document.getElementById("accountStatusText"),
  accountUsernameInput: document.getElementById("accountUsernameInput"),
  accountDisplayNameInput: document.getElementById("accountDisplayNameInput"),
  saveAccountProfileBtn: document.getElementById("saveAccountProfileBtn"),
  accountCurrentPasswordInput: document.getElementById("accountCurrentPasswordInput"),
  accountNewPasswordInput: document.getElementById("accountNewPasswordInput"),
  saveAccountPasswordBtn: document.getElementById("saveAccountPasswordBtn"),
  adminUsersList: document.getElementById("adminUsersList"),
  refreshAccountHistoryBtn: document.getElementById("refreshAccountHistoryBtn"),
  accountHistoryList: document.getElementById("accountHistoryList"),

  audioJackStatusText: document.getElementById("audioJackStatusText"),
  audioJackMuteToggleBtn: document.getElementById("audioJackMuteToggleBtn"),
  audioJackVolumeInput: document.getElementById("audioJackVolumeInput"),
  audioJackVolumeValue: document.getElementById("audioJackVolumeValue"),
  audioJackMutedToggle: document.getElementById("audioJackMutedToggle"),
  audioJackRefreshBtn: document.getElementById("audioJackRefreshBtn"),
  audioJackSaveBtn: document.getElementById("audioJackSaveBtn"),
  streamDeliveryToggleBtn: document.getElementById("streamDeliveryToggleBtn"),
  streamDeliveryStatusText: document.getElementById("streamDeliveryStatusText"),
  audioAutomationStatusText: document.getElementById("audioAutomationStatusText"),
  audioAutomationSummaryPills: document.getElementById("audioAutomationSummaryPills"),
  audioAutomationList: document.getElementById("audioAutomationList"),
  audioAutomationIdInput: document.getElementById("audioAutomationIdInput"),
  audioAutomationLabelInput: document.getElementById("audioAutomationLabelInput"),
  audioAutomationTargetInput: document.getElementById("audioAutomationTargetInput"),
  audioAutomationActionInput: document.getElementById("audioAutomationActionInput"),
  audioAutomationTimeInput: document.getElementById("audioAutomationTimeInput"),
  audioAutomationDaysWrap: document.getElementById("audioAutomationDaysWrap"),
  audioAutomationEnabledInput: document.getElementById("audioAutomationEnabledInput"),
  newAudioAutomationBtn: document.getElementById("newAudioAutomationBtn"),
  saveAudioAutomationBtn: document.getElementById("saveAudioAutomationBtn"),
  runAudioAutomationNowBtn: document.getElementById("runAudioAutomationNowBtn"),
  deleteAudioAutomationBtn: document.getElementById("deleteAudioAutomationBtn"),

  spotifyStatusText: document.getElementById("spotifyStatusText"),
  spotifyAccountText: document.getElementById("spotifyAccountText"),
  spotifyRefreshBtn: document.getElementById("spotifyRefreshBtn"),
  spotifyDetails: document.getElementById("spotifyDetails"),

  asmStatusText: document.getElementById("asmStatusText"),
  asmDetailsText: document.getElementById("asmDetailsText"),
  asmServiceUrlInput: document.getElementById("asmServiceUrlInput"),
  asmAccountInput: document.getElementById("asmAccountInput"),
  asmApiKeyInput: document.getElementById("asmApiKeyInput"),
  asmUsernameInput: document.getElementById("asmUsernameInput"),
  asmPasswordInput: document.getElementById("asmPasswordInput"),
  asmMethodInput: document.getElementById("asmMethodInput"),
  asmCacheSecondsInput: document.getElementById("asmCacheSecondsInput"),
  asmShowSettingsText: document.getElementById("asmShowSettingsText"),
  asmInspectSummary: document.getElementById("asmInspectSummary"),
  asmInspectPills: document.getElementById("asmInspectPills"),
  asmFieldNames: document.getElementById("asmFieldNames"),
  asmBodyPreview: document.getElementById("asmBodyPreview"),
  asmFirstItem: document.getElementById("asmFirstItem"),
  slideshowIntervalInput: document.getElementById("slideshowIntervalInput"),
  slideshowLimitInput: document.getElementById("slideshowLimitInput"),
  slideshowAudioEnabledToggle: document.getElementById("slideshowAudioEnabledToggle"),
  slideshowAudioAutoplayToggle: document.getElementById("slideshowAudioAutoplayToggle"),
  slideshowExcludeFeralToggle: document.getElementById("slideshowExcludeFeralToggle"),
  slideshowReadyTodayToggle: document.getElementById("slideshowReadyTodayToggle"),
  slideshowCustomFiltersEnabledToggle: document.getElementById("slideshowCustomFiltersEnabledToggle"),
  slideshowCustomFiltersInput: document.getElementById("slideshowCustomFiltersInput"),
  adoptablesPerSpecialInput: document.getElementById("adoptablesPerSpecialInput"),
  alertEveryXSlidesInput: document.getElementById("alertEveryXSlidesInput"),
  specialImageMaxMbInput: document.getElementById("specialImageMaxMbInput"),
  specialImageStorageText: document.getElementById("specialImageStorageText"),
  slideshowDisplayFieldsContainer: document.getElementById("slideshowDisplayFieldsContainer"),
  specialPagesList: document.getElementById("specialPagesList"),
  specialPageIdInput: document.getElementById("specialPageIdInput"),
  specialPageTitleInput: document.getElementById("specialPageTitleInput"),
  specialPageCategoryInput: document.getElementById("specialPageCategoryInput"),
  specialPageTemplateInput: document.getElementById("specialPageTemplateInput"),
  specialPageDurationInput: document.getElementById("specialPageDurationInput"),
  specialPageActiveInput: document.getElementById("specialPageActiveInput"),
  specialPageAlertInput: document.getElementById("specialPageAlertInput"),
  specialPageStartAtInput: document.getElementById("specialPageStartAtInput"),
  specialPageEndAtInput: document.getElementById("specialPageEndAtInput"),
  specialPageImageInput: document.getElementById("specialPageImageInput"),
  specialPageImageNameInput: document.getElementById("specialPageImageNameInput"),
  specialPageImageHint: document.getElementById("specialPageImageHint"),
  specialPageRichToolbar: document.getElementById("specialPageRichToolbar"),
  specialPageFontSizeInput: document.getElementById("specialPageFontSizeInput"),
  specialPageTextColorInput: document.getElementById("specialPageTextColorInput"),
  specialPageRichTextInput: document.getElementById("specialPageRichTextInput"),
  newSpecialPageBtn: document.getElementById("newSpecialPageBtn"),
  saveSpecialPageBtn: document.getElementById("saveSpecialPageBtn"),
  deleteSpecialPageBtn: document.getElementById("deleteSpecialPageBtn"),
  viewSpecialPageImageBtn: document.getElementById("viewSpecialPageImageBtn"),
  removeSpecialPageImageBtn: document.getElementById("removeSpecialPageImageBtn"),
  openSlideshowFieldMapBtn: document.getElementById("openSlideshowFieldMapBtn"),
  slideshowFieldMapDialog: document.getElementById("slideshowFieldMapDialog"),
  slideshowFieldMapList: document.getElementById("slideshowFieldMapList"),
  saveSlideshowFieldMapBtn: document.getElementById("saveSlideshowFieldMapBtn"),
  cancelSlideshowFieldMapBtn: document.getElementById("cancelSlideshowFieldMapBtn"),
  inspectAsmBtn: document.getElementById("inspectAsmBtn"),
  saveAsmApplyBtn: document.getElementById("saveAsmApplyBtn"),
  saveAsmConfigBtn: document.getElementById("saveAsmConfigBtn"),
  testAsmConfigBtn: document.getElementById("testAsmConfigBtn")
};

function escapeHtml(v) {
  return `${v || ""}`
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatBytes(bytes) {
  const value = Number(bytes || 0);
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const power = Math.min(units.length - 1, Math.floor(Math.log(value) / Math.log(1024)));
  const scaled = value / (1024 ** power);
  const digits = scaled >= 100 ? 0 : scaled >= 10 ? 1 : 2;
  return `${scaled.toFixed(digits)} ${units[power]}`;
}

function toast(msg, isError = false) {
  els.toast.textContent = msg;
  els.toast.className = `toast show${isError ? " error" : ""}`;
  window.clearTimeout(els.toast._timer);
  els.toast._timer = window.setTimeout(() => els.toast.classList.remove("show"), 2200);
}

function fmt(ms) {
  const s = Math.floor(Number(ms || 0) / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function setMasterMuteUi(muted) {
  if (!els.masterMuteToggleBtn) return;
  els.masterMuteToggleBtn.dataset.active = String(Boolean(muted));
  els.masterMuteToggleBtn.textContent = Boolean(muted) ? "UNMUTE" : "MUTE";
}

function getAudioJackMutedFromUi() {
  if (els.audioJackMuteToggleBtn) {
    return els.audioJackMuteToggleBtn.dataset.active === "true";
  }
  if (els.audioJackMutedToggle) {
    return Boolean(els.audioJackMutedToggle.checked);
  }
  return false;
}

function setAudioJackMutedToUi(muted) {
  const isMuted = Boolean(muted);
  if (els.audioJackMuteToggleBtn) {
    els.audioJackMuteToggleBtn.dataset.active = String(isMuted);
    els.audioJackMuteToggleBtn.textContent = isMuted ? "UNMUTE" : "MUTE";
  }
  if (els.audioJackMutedToggle) {
    els.audioJackMutedToggle.checked = isMuted;
  }
}

function sanitizeAsmFieldName(value) {
  const name = `${value || ""}`.trim();
  if (!name || !/^[A-Za-z0-9_]{1,64}$/.test(name)) {
    return "";
  }
  return name;
}

function sanitizeAsmFieldNameList(raw, max = 80) {
  const source = Array.isArray(raw) ? raw : [];
  const seen = new Set();
  const results = [];
  for (const item of source) {
    const name = sanitizeAsmFieldName(item);
    if (!name) continue;
    const key = name.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    results.push(name);
    if (results.length >= max) break;
  }
  return results;
}

function formatSlideshowFieldLabel(value) {
  const text = `${value || ""}`.trim();
  if (!text) {
    return "Field";
  }
  return text
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function sanitizeSlideshowDisplayFieldCatalog(raw) {
  if (!Array.isArray(raw)) {
    return [];
  }
  const seen = new Set();
  const catalog = [];
  for (const item of raw) {
    const sourceKey = sanitizeAsmFieldName(item?.sourceKey || item);
    if (!sourceKey) {
      continue;
    }
    const dedupeKey = sourceKey.toUpperCase();
    if (seen.has(dedupeKey)) {
      continue;
    }
    seen.add(dedupeKey);
    catalog.push({
      key: `raw:${sourceKey}`,
      sourceKey,
      label: `${item?.label || formatSlideshowFieldLabel(sourceKey)}`.trim().slice(0, 60) || formatSlideshowFieldLabel(sourceKey),
      enabled: item?.enabled !== false
    });
  }
  return catalog;
}

function buildSlideshowDisplayFieldOptions(catalog = slideshowDisplayFieldCatalog) {
  const mapped = sanitizeSlideshowDisplayFieldCatalog(catalog)
    .filter((entry) => entry.enabled !== false)
    .map((entry) => ({
      key: entry.key,
      label: entry.label
    }));
  return [...SLIDESHOW_DISPLAY_FIELD_OPTIONS, ...mapped];
}

function normalizeSlideshowDisplayFields(raw) {
  const allowed = new Set((slideshowDisplayFieldOptions || []).map((option) => option.key));
  const source = Array.isArray(raw) ? raw : [];
  const normalized = DEFAULT_SLIDESHOW_DISPLAY_FIELDS.map((fallback, index) => {
    const value = `${source[index] || ""}`.trim();
    return allowed.has(value) ? value : "skip";
  });
  const hasSelectedValue = normalized.some((value) => value !== "skip");
  return hasSelectedValue ? normalized : [...DEFAULT_SLIDESHOW_DISPLAY_FIELDS];
}

function renderSlideshowDisplayFieldSelectors(selectedFields, rawOptions) {
  if (!els.slideshowDisplayFieldsContainer) {
    return;
  }
  const fallbackOptions = buildSlideshowDisplayFieldOptions();
  const options = Array.isArray(rawOptions) && rawOptions.length
    ? rawOptions
        .map((entry) => ({
          key: `${entry?.key || ""}`.trim(),
          label: `${entry?.label || entry?.key || ""}`.trim()
        }))
        .filter((entry) => entry.key)
    : fallbackOptions;
  slideshowDisplayFieldOptions = options;
  const sanitizedSelection = normalizeSlideshowDisplayFields(selectedFields);

  const optionsMarkup = options
    .map((option) => `<option value="${escapeHtml(option.key)}">${escapeHtml(option.label)}</option>`)
    .join("");

  els.slideshowDisplayFieldsContainer.innerHTML = "";
  for (let index = 0; index < 10; index += 1) {
    const row = document.createElement("div");
    row.className = "slideshow-display-row";
    row.innerHTML = `
      <span class="slot-label">${index + 1}.</span>
      <select data-display-slot="${index}">${optionsMarkup}</select>
    `;
    const select = row.querySelector("select");
    select.value = sanitizedSelection[index] || "skip";
    els.slideshowDisplayFieldsContainer.append(row);
  }
}

function getSelectedSlideshowDisplayFields() {
  if (!els.slideshowDisplayFieldsContainer) {
    return [...DEFAULT_SLIDESHOW_DISPLAY_FIELDS];
  }
  const selected = Array.from(els.slideshowDisplayFieldsContainer.querySelectorAll("select[data-display-slot]"))
    .slice(0, 10)
    .map((select) => `${select.value || "skip"}`.trim() || "skip");
  return normalizeSlideshowDisplayFields(selected);
}

function renderSlideshowFieldMapDialogList() {
  if (!els.slideshowFieldMapList) {
    return;
  }
  const known = sanitizeAsmFieldNameList(asmKnownFieldNames, 120);
  if (!known.length) {
    els.slideshowFieldMapList.innerHTML = '<div class="setting-desc">No ASM fields found yet. Run Inspect Response first.</div>';
    return;
  }
  const catalogByField = new Map(
    sanitizeSlideshowDisplayFieldCatalog(slideshowDisplayFieldCatalog)
      .map((entry) => [entry.sourceKey.toUpperCase(), entry])
  );
  els.slideshowFieldMapList.innerHTML = known
    .map((fieldName) => `
      <label>
        <input type="checkbox" data-asm-field="${escapeHtml(fieldName)}" ${catalogByField.get(fieldName.toUpperCase())?.enabled !== false ? "checked" : ""} />
        <span>${escapeHtml(fieldName)}</span>
        <input type="text" data-asm-label="${escapeHtml(fieldName)}" value="${escapeHtml(catalogByField.get(fieldName.toUpperCase())?.label || formatSlideshowFieldLabel(fieldName))}" maxlength="60" placeholder="Label" />
      </label>
    `)
    .join("");
}

async function openSlideshowFieldMapDialog() {
  if (!els.slideshowFieldMapDialog) {
    return;
  }
  try {
    const inspect = await api("/api/admin/settings/asm/inspect");
    asmKnownFieldNames = sanitizeAsmFieldNameList(inspect.fieldNames || [], 120);
  } catch {
    // Keep last known fields if inspect fails.
  }
  renderSlideshowFieldMapDialogList();
  if (typeof els.slideshowFieldMapDialog.showModal === "function") {
    els.slideshowFieldMapDialog.showModal();
  }
}

function saveSlideshowFieldMapSelection() {
  if (!els.slideshowFieldMapList) {
    return;
  }
  const labelsByField = new Map(
    Array.from(els.slideshowFieldMapList.querySelectorAll('input[type="text"][data-asm-label]'))
      .map((input) => [
        `${input.getAttribute("data-asm-label") || ""}`.trim().toUpperCase(),
        `${input.value || ""}`.trim().slice(0, 60)
      ])
  );
  const selected = Array.from(els.slideshowFieldMapList.querySelectorAll('input[type="checkbox"][data-asm-field]:checked'))
    .map((checkbox) => sanitizeAsmFieldName(checkbox.getAttribute("data-asm-field")))
    .filter(Boolean)
    .slice(0, 80)
    .map((sourceKey) => ({
      sourceKey,
      label: labelsByField.get(sourceKey.toUpperCase()) || formatSlideshowFieldLabel(sourceKey),
      enabled: true
    }));
  slideshowDisplayFieldCatalog = sanitizeSlideshowDisplayFieldCatalog(selected);
  const priorSelection = getSelectedSlideshowDisplayFields();
  renderSlideshowDisplayFieldSelectors(priorSelection, buildSlideshowDisplayFieldOptions(slideshowDisplayFieldCatalog));
  els.slideshowFieldMapDialog?.close();
  toast("Available slideshow fields updated. Save / Apply to persist.");
}

function toDatetimeLocalValue(value) {
  if (!value) return "";
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return "";
  const date = new Date(ms);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${d}T${hh}:${mm}`;
}

function parseDatetimeLocalValue(value) {
  const text = `${value || ""}`.trim();
  if (!text) return "";
  const ms = Date.parse(text);
  if (!Number.isFinite(ms)) return "";
  return new Date(ms).toISOString();
}

function sanitizeSpecialPageCategory(value) {
  const text = `${value || ""}`.trim();
  return SPECIAL_PAGE_CATEGORIES.includes(text) ? text : "General PSA and Alerts";
}

const IMAGE_HINTS = {
  image: "Recommended: 1920 × 1080 px (16:9 landscape)",
  split: "Recommended: 1080 × 1080 px (1:1 square)"
};

function updateSpecialPageImageHint() {
  if (!els.specialPageImageHint) return;
  const tpl = els.specialPageTemplateInput?.value || "split";
  els.specialPageImageHint.textContent = IMAGE_HINTS[tpl] || "";
}

function updateSpecialImageStorageText(storage) {
  if (!els.specialImageStorageText) return;
  const count = Number(storage?.count || 0);
  const usedText = formatBytes(storage?.totalBytes || 0);
  const freeText = storage?.availableBytes !== null && storage?.availableBytes !== undefined
    ? formatBytes(storage.availableBytes)
    : "Unknown";
  els.specialImageStorageText.textContent = `Uploaded images: ${count} • Used: ${usedText} • Available disk: ${freeText}`;
}

function getSpecialPageById(pageId) {
  const id = `${pageId || ""}`.trim();
  if (!id) return null;
  return specialPages.find((page) => `${page.id || ""}` === id) || null;
}

function updateSpecialPageImageButtons() {
  const page = getSpecialPageById(els.specialPageIdInput?.value || "");
  const hasImage = Boolean(page?.imageUrl);
  if (els.viewSpecialPageImageBtn) {
    els.viewSpecialPageImageBtn.disabled = !hasImage;
  }
  if (els.removeSpecialPageImageBtn) {
    els.removeSpecialPageImageBtn.disabled = !hasImage;
  }
}

function resetSpecialPageEditor() {
  if (!els.specialPageIdInput) return;
  els.specialPageIdInput.value = "";
  els.specialPageTitleInput.value = "";
  els.specialPageCategoryInput.value = "General PSA and Alerts";
  els.specialPageTemplateInput.value = "split";
  els.specialPageDurationInput.value = "10";
  els.specialPageActiveInput.checked = true;
  els.specialPageAlertInput.checked = false;
  els.specialPageStartAtInput.value = "";
  els.specialPageEndAtInput.value = "";
  els.specialPageImageInput.value = "";
  els.specialPageImageNameInput.value = "No image selected";
  els.specialPageRichTextInput.innerHTML = "";
  updateSpecialPageImageHint();
  updateSpecialPageImageButtons();
}

function renderSpecialPagesList() {
  if (!els.specialPagesList) return;
  els.specialPagesList.innerHTML = "";
  if (!specialPages.length) {
    const empty = document.createElement("div");
    empty.className = "special-page-item empty";
    empty.textContent = "No special pages yet.";
    els.specialPagesList.append(empty);
    return;
  }
  const sorted = [...specialPages].sort((a, b) => `${b.updatedAt || ""}`.localeCompare(`${a.updatedAt || ""}`));
  for (const page of sorted) {
    const row = document.createElement("div");
    row.className = "special-page-item";
    const chips = [
      page.template === "image" ? "Image" : "Split",
      page.active ? "Active" : "Inactive",
      page.isAlert ? "Alert" : "Standard",
      `${Math.max(4, Number(page.displaySeconds || 10))}s`
    ];
    row.innerHTML = `
      <div class="special-page-main">
        <div class="special-page-title">${escapeHtml(page.title || "Untitled")}</div>
        <div class="special-page-meta">${escapeHtml(page.category || "General PSA and Alerts")}</div>
        <div class="inline-list">${chips.map((chip) => `<span class="pill">${escapeHtml(chip)}</span>`).join("")}</div>
      </div>
      <div class="special-page-actions">
        <button type="button" class="q-btn" data-action="edit">Edit</button>
        <button type="button" class="q-btn" data-action="view-image" ${page.imageUrl ? "" : "disabled"}>View Image</button>
        <button type="button" class="q-btn" data-action="delete-image" ${page.imageUrl ? "" : "disabled"}>Delete Image</button>
      </div>
    `;
    row.querySelector('[data-action="edit"]')?.addEventListener("click", () => {
      els.specialPageIdInput.value = page.id || "";
      els.specialPageTitleInput.value = page.title || "";
      els.specialPageCategoryInput.value = sanitizeSpecialPageCategory(page.category);
      els.specialPageTemplateInput.value = page.template === "image" ? "image" : "split";
      els.specialPageDurationInput.value = `${Math.max(4, Number(page.displaySeconds || 10))}`;
      els.specialPageActiveInput.checked = page.active !== false;
      els.specialPageAlertInput.checked = page.isAlert === true;
      els.specialPageStartAtInput.value = toDatetimeLocalValue(page.startAt);
      els.specialPageEndAtInput.value = toDatetimeLocalValue(page.endAt);
      els.specialPageImageNameInput.value = page.imageUrl || "No image selected";
      els.specialPageImageInput.value = "";
      els.specialPageRichTextInput.innerHTML = `${page.richText || ""}`;
      updateSpecialPageImageHint();
      updateSpecialPageImageButtons();
    });
    row.querySelector('[data-action="view-image"]')?.addEventListener("click", () => {
      if (!page.imageUrl) return;
      window.open(page.imageUrl, "_blank", "noopener,noreferrer");
    });
    row.querySelector('[data-action="delete-image"]')?.addEventListener("click", async () => {
      if (!page.imageUrl) return;
      try {
        await deleteSpecialPageImage(page.id, page.title || "Untitled");
      } catch (e) {
        toast(e.message, true);
      }
    });
    els.specialPagesList.append(row);
  }
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(`${reader.result || ""}`);
    reader.onerror = () => reject(new Error("Unable to read image."));
    reader.readAsDataURL(file);
  });
}

async function uploadSpecialPageImageIfNeeded(pageId) {
  const file = els.specialPageImageInput?.files?.[0] || null;
  if (!file) {
    return;
  }
  const maxMb = Math.max(1, Number(els.specialImageMaxMbInput?.value || 4));
  if (file.size > maxMb * 1024 * 1024) {
    throw new Error(`Image exceeds ${maxMb}MB limit.`);
  }
  const dataUrl = await readFileAsDataUrl(file);
  await api(`/api/admin/slideshow/pages/${encodeURIComponent(pageId)}/image`, {
    method: "POST",
    body: JSON.stringify({ dataUrl })
  });
}

async function saveSpecialPage() {
  if (!els.specialPageTitleInput) return;
  const id = `${els.specialPageIdInput?.value || ""}`.trim();
  const payload = {
    title: els.specialPageTitleInput.value.trim(),
    category: sanitizeSpecialPageCategory(els.specialPageCategoryInput.value),
    template: els.specialPageTemplateInput.value === "image" ? "image" : "split",
    displaySeconds: Number(els.specialPageDurationInput.value || 10),
    active: Boolean(els.specialPageActiveInput.checked),
    isAlert: Boolean(els.specialPageAlertInput.checked),
    startAt: parseDatetimeLocalValue(els.specialPageStartAtInput.value),
    endAt: parseDatetimeLocalValue(els.specialPageEndAtInput.value),
    richText: `${els.specialPageRichTextInput.innerHTML || ""}`
  };
  if (!payload.title) {
    throw new Error("Special page title is required.");
  }

  const result = id
    ? await api(`/api/admin/slideshow/pages/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(payload) })
    : await api("/api/admin/slideshow/pages", { method: "POST", body: JSON.stringify(payload) });
  const page = result?.page || null;
  if (!page?.id) {
    throw new Error("Unable to save page.");
  }
  await uploadSpecialPageImageIfNeeded(page.id);
  await loadAsmSettings();
  resetSpecialPageEditor();
  toast("Special page saved");
}

async function deleteSpecialPage() {
  const id = `${els.specialPageIdInput?.value || ""}`.trim();
  if (!id) {
    throw new Error("Select a page first.");
  }
  if (!window.confirm("Delete this special page?")) {
    return;
  }
  await api(`/api/admin/slideshow/pages/${encodeURIComponent(id)}`, { method: "DELETE" });
  await loadAsmSettings();
  resetSpecialPageEditor();
  toast("Special page deleted");
}

async function deleteSpecialPageImage(pageId, pageTitle = "") {
  const id = `${pageId || ""}`.trim();
  if (!id) {
    throw new Error("Select a page first.");
  }
  const label = pageTitle ? ` for "${pageTitle}"` : "";
  if (!window.confirm(`Delete uploaded image${label}?`)) {
    return;
  }
  await api(`/api/admin/slideshow/pages/${encodeURIComponent(id)}/image`, { method: "DELETE" });
  await loadAsmSettings();
  const activeId = `${els.specialPageIdInput?.value || ""}`.trim();
  if (activeId === id) {
    els.specialPageImageInput.value = "";
    els.specialPageImageNameInput.value = "No image selected";
  }
  updateSpecialPageImageButtons();
  toast("Special page image deleted");
}

function runRichTextCommand(command) {
  document.execCommand("styleWithCSS", false, false);
  if (command === "createLink") {
    const href = window.prompt("Enter URL (https://...)", "https://");
    if (!href) return;
    document.execCommand("createLink", false, href.trim());
    return;
  }
  document.execCommand(command, false);
}

function runRichTextCommandWithValue(command, value) {
  document.execCommand("styleWithCSS", false, false);
  document.execCommand(command, false, value);
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

function notifyShellSessionUpdate(scope) {
  try {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ type: "jukebox-session-update", scope }, window.location.origin);
    }
  } catch {}
}

// ── Auth ──────────────────────────────────────────────────────────────────────

async function login(username, password) {
  const result = await api("/api/admin/session", {
    method: "POST",
    body: JSON.stringify({ username, password })
  });
  adminToken = result.token;
  sessionStorage.setItem(ADMIN_TOKEN_KEY, adminToken);
  localStorage.setItem(ADMIN_TOKEN_KEY, adminToken);
  notifyShellSessionUpdate("admin");
  await connectAdminToStreamSession();
}

async function connectAdminToStreamSession() {
  const result = await api("/api/admin/stream/session", {
    method: "POST"
  });
  if (result?.token) {
    localStorage.setItem(EMPLOYEE_TOKEN_KEY, result.token);
  }
}

async function tryElevateEmployeeSessionToAdmin() {
  const employeeToken = localStorage.getItem(EMPLOYEE_TOKEN_KEY) || "";
  if (!employeeToken) {
    return false;
  }
  const result = await api("/api/admin/session/from-employee", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${employeeToken}`
    }
  });
  const token = `${result?.token || ""}`.trim();
  if (!token) {
    return false;
  }
  adminToken = token;
  sessionStorage.setItem(ADMIN_TOKEN_KEY, token);
  localStorage.setItem(ADMIN_TOKEN_KEY, token);
  notifyShellSessionUpdate("admin");
  return true;
}

async function logout() {
  try { await api("/api/admin/session/logout", { method: "POST" }); } catch {}
  sessionStorage.removeItem(ADMIN_TOKEN_KEY);
  localStorage.removeItem(ADMIN_TOKEN_KEY);
  localStorage.removeItem(EMPLOYEE_TOKEN_KEY);
  notifyShellSessionUpdate("admin");
  notifyShellSessionUpdate("employee");
  adminToken = "";
  stopPolling();
  els.loginDialog.showModal();
}

// ── Playback ──────────────────────────────────────────────────────────────────

async function loadPlayback() {
  const data = await api("/api/admin/playback/state");
  currentPlaybackState = data;

  const c = data.current;
  if (c) {
    els.trackTitle.textContent = c.name || "Unknown";
    els.trackMeta.textContent = [c.artists, c.album].filter(Boolean).join(" • ") || "—";
    els.durText.textContent = fmt(c.durationMs);
    els.posText.textContent = fmt(data.positionMs);
    const pct = c.durationMs > 0 ? Math.min(100, (data.positionMs / c.durationMs) * 100) : 0;
    els.progBar.style.width = `${pct}%`;
  } else {
    els.trackTitle.textContent = "—";
    els.trackMeta.textContent = "Nothing playing";
    els.posText.textContent = "0:00";
    els.durText.textContent = "0:00";
    els.progBar.style.width = "0%";
  }

  els.playPauseBtn.textContent = data.state === "playing" ? "⏸" : "▶";
  els.playPauseBtn.title = data.state === "playing" ? "Pause" : "Play";

  const vol = data.volume ?? 80;
  els.volumeSlider.value = vol;
  els.volVal.textContent = `${vol}%`;
  if (vol > 0) {
    masterVolumeBeforeMute = vol;
  }
  setMasterMuteUi(vol <= 0);
}

async function loadModes() {
  const data = await api("/api/admin/modes");
  els.repeatBtn.dataset.active = String(data.repeat);
  els.randomBtn.dataset.active = "false";
}

// ── Queue ─────────────────────────────────────────────────────────────────────

async function loadQueue() {
  const data = await api("/api/admin/queue");
  const items = data.queue || [];

  els.queueCount.textContent = `${items.length} track${items.length !== 1 ? "s" : ""}`;
  els.queueList.innerHTML = "";

  if (!items.length) {
    const li = document.createElement("li");
    li.className = "q-item empty";
    li.textContent = "Queue is empty";
    els.queueList.append(li);
    renderRequesterStats([]);
    return;
  }

  items.forEach((item, idx) => {
    const li = document.createElement("li");
    li.className = "q-item";
    const byline = [item.artists, item.album].filter(Boolean).join(" • ");
    const reqTag = item.requestedBy
      ? `<span class="req-tag">• Added by ${escapeHtml(item.requestedBy)}</span>`
      : "";
    li.innerHTML = `
      <span class="q-num">${idx + 1}</span>
      <div class="q-info">
        <div class="q-title">${escapeHtml(item.name)}</div>
        <div class="q-meta">${escapeHtml(byline)} ${reqTag}</div>
      </div>
      <div class="q-btns">
        <button class="q-btn" data-action="up" title="Move up" ${idx === 0 ? "disabled" : ""}>↑</button>
        <button class="q-btn" data-action="dn" title="Move down" ${idx === items.length - 1 ? "disabled" : ""}>↓</button>
        <button class="q-btn danger" data-action="rm" title="Remove">✕</button>
      </div>
    `;
    li.querySelector('[data-action="up"]').addEventListener("click", () => moveTrack(item.tlid, "up"));
    li.querySelector('[data-action="dn"]').addEventListener("click", () => moveTrack(item.tlid, "down"));
    li.querySelector('[data-action="rm"]').addEventListener("click", () => removeTrack(item.tlid));
    els.queueList.append(li);
  });

  renderRequesterStats(items);
}

function renderRequesterStats(items) {
  const counts = {};
  for (const item of items) {
    if (item.requestedBy) {
      counts[item.requestedBy] = (counts[item.requestedBy] || 0) + 1;
    }
  }
  els.requesterList.innerHTML = "";
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (!entries.length) {
    const li = document.createElement("li");
    li.className = "req-item empty";
    li.textContent = "No active requesters";
    els.requesterList.append(li);
    return;
  }
  for (const [name, count] of entries) {
    const li = document.createElement("li");
    li.className = "req-item";
    li.innerHTML = `
      <span class="req-name">${escapeHtml(name)}</span>
      <span class="req-count">${count} song${count !== 1 ? "s" : ""}</span>
    `;
    els.requesterList.append(li);
  }
}

async function removeTrack(tlid) {
  try {
    await api(`/api/admin/queue/${tlid}`, { method: "DELETE" });
    await loadQueue();
  } catch (e) { toast(e.message, true); }
}

async function moveTrack(tlid, direction) {
  try {
    await api("/api/admin/queue/move", {
      method: "POST",
      body: JSON.stringify({ tlid, direction })
    });
    await loadQueue();
  } catch (e) { toast(e.message, true); }
}

// ── Polling loops ──────────────────────────────────────────────────────────────

function stopPolling() {
  if (playbackTimer) window.clearInterval(playbackTimer);
  if (queueTimer) window.clearInterval(queueTimer);
}

async function initializeApp() {
  const startupTasks = [
    ["playback", loadPlayback],
    ["modes", loadModes],
    ["queue", loadQueue],
    ["account", loadAccountSettings],
    ["explicit", loadExplicit],
    ["audio-jack", loadAudioJackSettings],
    ["audio-automation", loadAudioAutomationSettings],
    ["playlists", loadPlaylists],
    ["staff", loadStaffSettings],
    ["request-stats", loadAdminRequestStats],
    ["spotify", loadSpotifySettings],
    ["asm", loadAsmSettings]
  ];

  const results = await Promise.allSettled(startupTasks.map(([, task]) => task()));
  results.forEach((result, index) => {
    if (result.status === "rejected") {
      const taskName = startupTasks[index]?.[0] || "unknown";
      const message = result.reason?.message || String(result.reason || "Unknown error");
      console.warn(`Startup task failed (${taskName}): ${message}`);
    }
  });
  stopPolling();
  playbackTimer = window.setInterval(async () => {
    try { await loadPlayback(); } catch {}
  }, 3000);
  queueTimer = window.setInterval(async () => {
    try { await loadQueue(); } catch {}
  }, 6000);
}

function setSettingsTab(name) {
  settingsTab = ["account", "request", "audio-jack", "spotify", "asm"].includes(name) ? name : "request";
  els.tabAccount.classList.toggle("active", settingsTab === "account");
  els.tabRequestAccess.classList.toggle("active", settingsTab === "request");
  els.tabAudioJack.classList.toggle("active", settingsTab === "audio-jack");
  els.tabSpotify.classList.toggle("active", settingsTab === "spotify");
  els.tabAsm.classList.toggle("active", settingsTab === "asm");
  els.panelAccount.classList.toggle("active", settingsTab === "account");
  els.panelRequestAccess.classList.toggle("active", settingsTab === "request");
  els.panelAudioJack.classList.toggle("active", settingsTab === "audio-jack");
  els.panelSpotify.classList.toggle("active", settingsTab === "spotify");
  els.panelAsm.classList.toggle("active", settingsTab === "asm");
}

function populateAudioAutomationActionOptions(target, selectedAction = "") {
  if (!els.audioAutomationActionInput) return;
  const safeTarget = Object.prototype.hasOwnProperty.call(AUDIO_AUTOMATION_TARGET_ACTIONS, target) ? target : "stream";
  const actions = AUDIO_AUTOMATION_TARGET_ACTIONS[safeTarget] || AUDIO_AUTOMATION_TARGET_ACTIONS.stream;
  els.audioAutomationActionInput.innerHTML = actions
    .map((action) => `<option value="${escapeHtml(action)}">${escapeHtml(action.replaceAll("-", " ").replace(/\b\w/g, (char) => char.toUpperCase()))}</option>`)
    .join("");
  els.audioAutomationActionInput.value = actions.includes(selectedAction) ? selectedAction : actions[0];
}

function readAudioAutomationDaysFromForm() {
  if (!els.audioAutomationDaysWrap) {
    return [0, 1, 2, 3, 4, 5, 6];
  }
  const values = Array.from(els.audioAutomationDaysWrap.querySelectorAll('input[type="checkbox"]:checked'))
    .map((input) => Number(input.value))
    .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
    .sort((a, b) => a - b);
  return values.length ? values : [0, 1, 2, 3, 4, 5, 6];
}

function writeAudioAutomationDaysToForm(days = []) {
  if (!els.audioAutomationDaysWrap) return;
  const selected = new Set((Array.isArray(days) && days.length ? days : [0, 1, 2, 3, 4, 5, 6]).map((value) => Number(value)));
  els.audioAutomationDaysWrap.querySelectorAll('input[type="checkbox"]').forEach((input) => {
    input.checked = selected.has(Number(input.value));
  });
}

function getAudioAutomationScheduleById(scheduleId) {
  const id = `${scheduleId || ""}`.trim();
  if (!id) return null;
  return audioAutomationSchedules.find((item) => `${item.id || ""}` === id) || null;
}

function updateAudioAutomationActionChoices() {
  populateAudioAutomationActionOptions(els.audioAutomationTargetInput?.value || "stream", els.audioAutomationActionInput?.value || "");
}

function updateAudioAutomationButtons() {
  const schedule = getAudioAutomationScheduleById(els.audioAutomationIdInput?.value || "");
  const hasSchedule = Boolean(schedule?.id);
  if (els.runAudioAutomationNowBtn) {
    els.runAudioAutomationNowBtn.disabled = !hasSchedule;
  }
  if (els.deleteAudioAutomationBtn) {
    els.deleteAudioAutomationBtn.disabled = !hasSchedule;
  }
}

function resetAudioAutomationEditor() {
  if (!els.audioAutomationIdInput) return;
  els.audioAutomationIdInput.value = "";
  els.audioAutomationLabelInput.value = "";
  els.audioAutomationTargetInput.value = "stream";
  populateAudioAutomationActionOptions("stream", "start");
  els.audioAutomationTimeInput.value = "08:00";
  writeAudioAutomationDaysToForm([1, 2, 3, 4, 5]);
  els.audioAutomationEnabledInput.checked = true;
  updateAudioAutomationButtons();
}

function renderAudioAutomationList() {
  if (!els.audioAutomationList) return;
  els.audioAutomationList.innerHTML = "";
  if (!audioAutomationSchedules.length) {
    const empty = document.createElement("div");
    empty.className = "schedule-item empty";
    empty.textContent = "No schedules yet.";
    els.audioAutomationList.append(empty);
    return;
  }
  const sorted = [...audioAutomationSchedules].sort((a, b) => `${a.time || ""}`.localeCompare(`${b.time || ""}`) || `${a.label || ""}`.localeCompare(`${b.label || ""}`));
  for (const schedule of sorted) {
    const row = document.createElement("div");
    row.className = "schedule-item";
    const dayText = (Array.isArray(schedule.days) && schedule.days.length ? schedule.days : [0, 1, 2, 3, 4, 5, 6])
      .map((day) => AUDIO_AUTOMATION_DAY_LABELS[Number(day)] || "?")
      .join(", ");
    const chips = [
      schedule.target || "stream",
      schedule.action || "start",
      schedule.enabled === false ? "Disabled" : "Enabled",
      schedule.time || "08:00"
    ];
    row.innerHTML = `
      <div class="special-page-main">
        <div class="special-page-title">${escapeHtml(schedule.label || "Untitled Schedule")}</div>
        <div class="special-page-meta">${escapeHtml(dayText)}</div>
        <div class="inline-list">${chips.map((chip) => `<span class="pill">${escapeHtml(chip)}</span>`).join("")}</div>
      </div>
      <div class="special-page-actions">
        <button type="button" class="q-btn" data-action="edit">Edit</button>
        <button type="button" class="q-btn" data-action="run">Run Now</button>
        <button type="button" class="q-btn danger" data-action="delete">Delete</button>
      </div>
    `;
    row.querySelector('[data-action="edit"]')?.addEventListener("click", () => {
      els.audioAutomationIdInput.value = schedule.id || "";
      els.audioAutomationLabelInput.value = schedule.label || "";
      els.audioAutomationTargetInput.value = schedule.target || "stream";
      populateAudioAutomationActionOptions(schedule.target || "stream", schedule.action || "start");
      els.audioAutomationTimeInput.value = schedule.time || "08:00";
      writeAudioAutomationDaysToForm(schedule.days || []);
      els.audioAutomationEnabledInput.checked = schedule.enabled !== false;
      updateAudioAutomationButtons();
    });
    row.querySelector('[data-action="run"]')?.addEventListener("click", async () => {
      try {
        await runAudioAutomationScheduleNow(schedule.id);
      } catch (e) {
        toast(e.message, true);
      }
    });
    row.querySelector('[data-action="delete"]')?.addEventListener("click", async () => {
      try {
        await deleteAudioAutomationSchedule(schedule.id, schedule.label || "Untitled Schedule");
      } catch (e) {
        toast(e.message, true);
      }
    });
    els.audioAutomationList.append(row);
  }
}

async function loadStreamDeliverySettings() {
  try {
    const data = await api("/api/admin/settings/stream-delivery");
    if (els.streamDeliveryToggleBtn) {
      els.streamDeliveryToggleBtn.dataset.active = String(Boolean(data.enabled));
      els.streamDeliveryToggleBtn.textContent = data.enabled
        ? `📡 Stream Delivery On`
        : `📡 Stream Delivery Off`;
    }
    if (els.streamDeliveryStatusText) {
      els.streamDeliveryStatusText.textContent = data.enabled
        ? `Iframe stream delivery live • ${Number(data.activeListeners || 0)} active listener(s)`
        : `Iframe stream delivery stopped • ${Number(data.activeListeners || 0)} active listener(s)`;
    }
  } catch (e) {
    if (els.streamDeliveryStatusText) {
      els.streamDeliveryStatusText.textContent = e.message;
    }
  }
}

async function setStreamDeliveryState(enabled) {
  const data = await api("/api/admin/settings/stream-delivery", {
    method: "POST",
    body: JSON.stringify({ enabled: Boolean(enabled) })
  });
  await loadStreamDeliverySettings();
  return data;
}

async function loadAudioJackSettings() {
  if (!els.audioJackVolumeInput) return;
  try {
    const data = await api("/api/admin/settings/audio-jack");
    const volume = Number(data.volume || 0);
    els.audioJackVolumeInput.value = `${volume}`;
    els.audioJackVolumeValue.textContent = `${volume}%`;
    setAudioJackMutedToUi(Boolean(data.muted));
  } catch (e) {
    console.warn(`Unable to load AUX settings: ${e.message}`);
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

async function loadAudioAutomationSettings() {
  if (!els.audioAutomationStatusText) return;
  try {
    const data = await api("/api/admin/settings/audio-automation");
    audioAutomationSchedules = Array.isArray(data.schedules) ? data.schedules : [];
    renderAudioAutomationList();
    updateAudioAutomationButtons();
    els.audioAutomationStatusText.textContent = `Server scheduler active • Playback ${data.playbackState || "unknown"} • Jack ${data.audioJack?.muted ? "muted" : "live"}${data.serverTime ? ` • Server time ${data.serverTime}` : ""}`;  
    els.audioAutomationSummaryPills.innerHTML = [
      data.streamDeliveryEnabled ? "Iframe stream live" : "Iframe stream stopped",
      `Active listeners ${Number(data.activeListeners || 0)}`,
      `Schedules ${audioAutomationSchedules.length}`
    ].map((item) => `<span class="pill">${escapeHtml(item)}</span>`).join("");
    await loadStreamDeliverySettings();
  } catch (e) {
    els.audioAutomationStatusText.textContent = e.message;
  }
}

async function saveAudioAutomationSchedule() {
  const id = `${els.audioAutomationIdInput?.value || ""}`.trim();
  const payload = {
    label: els.audioAutomationLabelInput.value.trim(),
    target: els.audioAutomationTargetInput.value,
    action: els.audioAutomationActionInput.value,
    time: els.audioAutomationTimeInput.value || "08:00",
    days: readAudioAutomationDaysFromForm(),
    enabled: Boolean(els.audioAutomationEnabledInput.checked)
  };
  if (!payload.label) {
    throw new Error("Schedule label is required.");
  }
  if (!payload.time) {
    throw new Error("Schedule time is required.");
  }
  await api(id ? `/api/admin/audio-automation/schedules/${encodeURIComponent(id)}` : "/api/admin/audio-automation/schedules", {
    method: id ? "PATCH" : "POST",
    body: JSON.stringify(payload)
  });
  await loadAudioAutomationSettings();
  resetAudioAutomationEditor();
}

async function deleteAudioAutomationSchedule(scheduleId, scheduleLabel = "") {
  const id = `${scheduleId || els.audioAutomationIdInput?.value || ""}`.trim();
  if (!id) {
    throw new Error("Select a schedule first.");
  }
  const label = scheduleLabel || getAudioAutomationScheduleById(id)?.label || "this schedule";
  if (!window.confirm(`Delete schedule "${label}"?`)) {
    return;
  }
  await api(`/api/admin/audio-automation/schedules/${encodeURIComponent(id)}`, { method: "DELETE" });
  await loadAudioAutomationSettings();
  resetAudioAutomationEditor();
}

async function runAudioAutomationScheduleNow(scheduleId) {
  const id = `${scheduleId || els.audioAutomationIdInput?.value || ""}`.trim();
  if (!id) {
    throw new Error("Select a schedule first.");
  }
  const result = await api(`/api/admin/audio-automation/schedules/${encodeURIComponent(id)}/run`, { method: "POST" });
  await loadAudioAutomationSettings();
  await loadAudioJackSettings();
  toast(`Schedule ran: ${result.rule?.label || "rule"}`);
}

function setAsmSubtab(name) {
  asmSubtab = ["connection", "slideshow", "diagnostics"].includes(name) ? name : "connection";
  els.asmSubtabConnection.classList.toggle("active", asmSubtab === "connection");
  els.asmSubtabSlideshow.classList.toggle("active", asmSubtab === "slideshow");
  els.asmSubtabDiagnostics.classList.toggle("active", asmSubtab === "diagnostics");
  els.asmPanelConnection.classList.toggle("active", asmSubtab === "connection");
  els.asmPanelSlideshow.classList.toggle("active", asmSubtab === "slideshow");
  els.asmPanelDiagnostics.classList.toggle("active", asmSubtab === "diagnostics");
}

if (els.audioAutomationIdInput) {
  resetAudioAutomationEditor();
}

// ── Event listeners ───────────────────────────────────────────────────────────

els.loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    await login(els.usernameInput.value, els.passwordInput.value);
    els.passwordInput.value = "";
    els.loginDialog.close();
    await initializeApp();
    toast("Welcome back");
  } catch (err) { toast(err.message, true); }
});

if (els.logoutBtn) {
  els.logoutBtn.addEventListener("click", logout);
}

els.prevBtn.addEventListener("click", async () => {
  try {
    await api("/api/admin/playback/previous", { method: "POST" });
    window.setTimeout(loadPlayback, 600);
  } catch (e) { toast(e.message, true); }
});

els.playPauseBtn.addEventListener("click", async () => {
  const action = currentPlaybackState?.state === "playing" ? "pause" : "play";
  try {
    await api(`/api/admin/playback/${action}`, { method: "POST" });
    window.setTimeout(loadPlayback, 400);
  } catch (e) { toast(e.message, true); }
});

els.nextBtn.addEventListener("click", async () => {
  try {
    await api("/api/admin/playback/next", { method: "POST" });
    window.setTimeout(loadPlayback, 600);
    window.setTimeout(loadQueue, 1200);
  } catch (e) { toast(e.message, true); }
});

els.volumeSlider.addEventListener("input", () => {
  const vol = Number(els.volumeSlider.value);
  els.volVal.textContent = `${vol}%`;
  if (vol > 0) {
    masterVolumeBeforeMute = vol;
  }
  setMasterMuteUi(vol <= 0);
  window.clearTimeout(volumeDebounce);
  volumeDebounce = window.setTimeout(async () => {
    try { await api("/api/admin/volume", { method: "POST", body: JSON.stringify({ volume: vol }) }); }
    catch (e) { toast(e.message, true); }
  }, 300);
});

if (els.masterMuteToggleBtn) {
  els.masterMuteToggleBtn.addEventListener("click", async () => {
    try {
      const current = Number(els.volumeSlider.value || 0);
      const next = current > 0 ? 0 : Math.max(1, Number(masterVolumeBeforeMute || 80));
      if (current > 0) {
        masterVolumeBeforeMute = current;
      }
      els.volumeSlider.value = `${next}`;
      els.volVal.textContent = `${next}%`;
      setMasterMuteUi(next <= 0);
      await api("/api/admin/volume", { method: "POST", body: JSON.stringify({ volume: next }) });
      toast(next <= 0 ? "Master muted" : "Master unmuted");
    } catch (e) { toast(e.message, true); }
  });
}

els.repeatBtn.addEventListener("click", async () => {
  const newVal = els.repeatBtn.dataset.active !== "true";
  try {
    await api("/api/admin/modes", { method: "POST", body: JSON.stringify({ repeat: newVal }) });
    els.repeatBtn.dataset.active = String(newVal);
    toast(`Repeat ${newVal ? "on" : "off"}`);
  } catch (e) { toast(e.message, true); }
});

els.randomBtn.addEventListener("click", async () => {
  try {
    await api("/api/admin/queue/randomize", { method: "POST" });
    await loadQueue();
    toast("Queue randomized");
  } catch (e) { toast(e.message, true); }
});

els.shuffleBtn.addEventListener("click", async () => {
  try {
    await api("/api/admin/queue/randomize", { method: "POST" });
    await loadQueue();
    toast("Queue randomized");
  } catch (e) { toast(e.message, true); }
});

els.clearBtn.addEventListener("click", async () => {
  if (!window.confirm("Clear the entire queue?")) return;
  try {
    await api("/api/admin/queue/clear", { method: "POST" });
    await loadQueue();
    toast("Queue cleared");
  } catch (e) { toast(e.message, true); }
});

// ── Explicit filter ───────────────────────────────────────────────────────────
async function loadExplicit() {
  if (!els.explicitToggle) {
    return;
  }
  try {
    const data = await api("/api/admin/explicit");
    els.explicitToggle.dataset.active = String(Boolean(data.explicitFilter));
  } catch {}
}

async function saveExplicitSetting() {
  if (!els.explicitToggle) {
    return { explicitFilter: false };
  }
  const enabled = els.explicitToggle.dataset.active === "true";
  const data = await api("/api/admin/explicit", {
    method: "POST",
    body: JSON.stringify({ enabled })
  });
  els.explicitToggle.dataset.active = String(Boolean(data.explicitFilter));
}

async function loadAccountSettings() {
  if (!els.accountStatusText) return;
  try {
    const me = await api("/api/admin/account/me");

    els.accountUsernameInput.value = me.username || "";
    els.accountDisplayNameInput.value = me.displayName || "";
    els.accountStatusText.textContent = `Signed in as ${me.displayName || me.username} (${me.username})`;

    let users;
    let history;
    const optionalFetches = [];
    if (els.adminUsersList) {
      optionalFetches.push(
        api("/api/admin/account/users").then((data) => {
          users = data;
        })
      );
    }
    if (els.accountHistoryList) {
      optionalFetches.push(
        api("/api/admin/account/history?limit=25").then((data) => {
          history = data;
        })
      );
    }
    if (optionalFetches.length) {
      await Promise.allSettled(optionalFetches);
    }

    if (els.adminUsersList) {
      els.adminUsersList.innerHTML = "";
      const userRows = (users && users.users) || [];
      if (!userRows.length) {
        const li = document.createElement("li");
        li.className = "req-item empty";
        li.textContent = "No users found.";
        els.adminUsersList.append(li);
      } else {
        userRows.forEach((user) => {
        const li = document.createElement("li");
        li.className = "req-item";
        const status = user.active ? "Active" : "Disabled";
        li.innerHTML = `
          <span class="req-name">${escapeHtml(user.displayName)} (${escapeHtml(user.username)})</span>
          <button class="btn-sm" data-action="toggle-admin">${user.isAdmin ? "Remove Admin" : "Make Admin"}</button>
          <span class="req-count">${escapeHtml(status)}</span>
          <button class="btn-sm danger" data-action="delete-admin">Delete</button>
        `;
        li.querySelector('[data-action="toggle-admin"]')?.addEventListener("click", async () => {
          const groups = Array.isArray(user.groups) ? [...user.groups] : [];
          const nextGroups = user.isAdmin
            ? groups.filter((entry) => entry !== "admins")
            : Array.from(new Set([...groups, "admins"]));
          try {
            await api(`/api/admin/account/users/${user.id}/groups`, {
              method: "PATCH",
              body: JSON.stringify({ groups: nextGroups })
            });
            await loadAccountSettings();
            toast(user.isAdmin ? "Admin rights removed" : "Admin rights granted");
          } catch (e) {
            toast(e.message, true);
          }
        });
        li.querySelector('[data-action="delete-admin"]')?.addEventListener("click", async () => {
          if (!window.confirm(`Delete admin user ${user.username}?`)) return;
          try {
            await api(`/api/admin/account/users/${user.id}`, { method: "DELETE" });
            await loadAccountSettings();
            toast("Admin user deleted");
          } catch (e) {
            toast(e.message, true);
          }
        });
        els.adminUsersList.append(li);
        });
      }
    }

    if (els.accountHistoryList) {
      els.accountHistoryList.innerHTML = "";
      const events = (history && history.history) || [];
      if (!events.length) {
        const li = document.createElement("li");
        li.className = "req-item empty";
        li.textContent = "No history yet.";
        els.accountHistoryList.append(li);
      } else {
        events.forEach((entry) => {
          const li = document.createElement("li");
          li.className = "req-item";
          const when = entry.createdAt ? new Date(entry.createdAt).toLocaleString() : "";
          li.innerHTML = `
            <span class="req-name">${escapeHtml(entry.actor || "system")} • ${escapeHtml(entry.action || "event")}</span>
            <span class="req-count">${escapeHtml(when)}</span>
          `;
          els.accountHistoryList.append(li);
        });
      }
    }
  } catch (e) {
    els.accountStatusText.textContent = e.message;
  }
}

async function saveAccountProfile() {
  await api("/api/admin/account/profile", {
    method: "PATCH",
    body: JSON.stringify({
      displayName: els.accountDisplayNameInput.value.trim()
    })
  });
}

async function saveAccountPassword() {
  await api("/api/admin/account/password", {
    method: "POST",
    body: JSON.stringify({
      currentPassword: els.accountCurrentPasswordInput.value,
      newPassword: els.accountNewPasswordInput.value
    })
  });
  els.accountCurrentPasswordInput.value = "";
  els.accountNewPasswordInput.value = "";
}

async function loadStaffSettings() {
  if (!els.staffStatusText) return;
  try {
    const data = await api("/api/admin/staff");
    els.defaultRequestLimitInput.value = `${Number(data.defaults?.requestLimit || 3)}`;
    els.staffStatusText.textContent = `Daily window ${data.daily?.dateKey || "today"} • ${data.staff?.length || 0} user account(s)`;

    els.staffList.innerHTML = "";
    const staff = data.staff || [];
    if (!staff.length) {
      const li = document.createElement("li");
      li.className = "req-item empty";
      li.textContent = "No user accounts yet";
      els.staffList.append(li);
      return;
    }

    for (const item of staff) {
      const li = document.createElement("li");
      li.className = "req-item staff-row";
      li.innerHTML = `
        <span class="req-name">${escapeHtml(item.displayName || `${item.firstName} ${item.lastInitial}.`)}</span>
        <span class="req-count">@${escapeHtml(item.username || "")}</span>
        <span class="req-count">${item.isAdmin ? "Admin" : "Standard"}</span>
        <span class="req-count">${item.usedToday}/${item.requestLimit} today</span>
        <input class="staff-limit-input" data-action="limit" type="number" min="1" step="1" value="${Number(item.requestLimit || 1)}" />
        <button class="btn-sm" data-action="save-limit">Save Limit</button>
        <button class="btn-sm" data-action="toggle-admin">${item.isAdmin ? "Remove Admin" : "Make Admin"}</button>
        <button class="btn-sm" data-action="reset-password">Reset PW</button>
        <button class="btn-sm" data-action="toggle">${item.active ? "Disable" : "Enable"}</button>
        <button class="btn-sm danger" data-action="delete">Delete</button>
      `;
      li.querySelector('[data-action="save-limit"]').addEventListener("click", async () => {
        try {
          const limit = Number(li.querySelector('[data-action="limit"]').value || item.requestLimit || 1);
          await api(`/api/admin/staff/${item.id}`, {
            method: "PATCH",
            body: JSON.stringify({ requestLimit: Math.max(1, limit) })
          });
          await loadStaffSettings();
          toast("User limit updated");
        } catch (e) {
          toast(e.message, true);
        }
      });
      li.querySelector('[data-action="toggle"]').addEventListener("click", async () => {
        try {
          await api(`/api/admin/staff/${item.id}`, {
            method: "PATCH",
            body: JSON.stringify({ active: !item.active })
          });
          await loadStaffSettings();
          toast(`User ${item.active ? "disabled" : "enabled"}`);
        } catch (e) {
          toast(e.message, true);
        }
      });
      li.querySelector('[data-action="reset-password"]').addEventListener("click", async () => {
        const newPw = window.prompt(`Set new password for ${item.displayName || item.firstName} (@${item.username}):`);
        if (!newPw) return;
        if (newPw.length < 6) {
          toast("Password must be at least 6 characters", true);
          return;
        }
        try {
          await api(`/api/admin/staff/${item.id}/reset-password`, {
            method: "POST",
            body: JSON.stringify({ password: newPw })
          });
          toast("Password updated");
        } catch (e) {
          toast(e.message, true);
        }
      });
      li.querySelector('[data-action="toggle-admin"]').addEventListener("click", async () => {
        try {
          const groups = item.isAdmin ? [] : ["admins"];
          await api(`/api/admin/staff/${item.id}`, {
            method: "PATCH",
            body: JSON.stringify({ groups })
          });
          await loadStaffSettings();
          toast(item.isAdmin ? "Admin rights removed" : "Admin rights granted");
        } catch (e) {
          toast(e.message, true);
        }
      });
      li.querySelector('[data-action="delete"]').addEventListener("click", async () => {
        if (!window.confirm(`Delete user account ${item.displayName || item.firstName}?`)) return;
        try {
          await api(`/api/admin/staff/${item.id}`, { method: "DELETE" });
          await loadStaffSettings();
          toast("User account deleted");
        } catch (e) {
          toast(e.message, true);
        }
      });
      els.staffList.append(li);
    }
  } catch (e) {
    els.staffStatusText.textContent = e.message;
  }
}

async function saveDefaultRequestLimit() {
  const requestLimit = Math.max(1, Number(els.defaultRequestLimitInput.value || 3));
  await api("/api/admin/staff/default-limit", {
    method: "POST",
    body: JSON.stringify({ requestLimit })
  });
}

async function createStaffAccount() {
  const firstName = els.staffFirstNameInput.value.trim();
  const lastInitial = els.staffLastInitialInput.value.trim();
  const username = els.staffUsernameInput?.value.trim() || "";
  const password = els.staffPasswordInput?.value || "";
  const requestLimit = Math.max(1, Number(els.staffLimitInput.value || els.defaultRequestLimitInput.value || 3));

  await api("/api/admin/staff", {
    method: "POST",
    body: JSON.stringify({ firstName, lastInitial, username, password, requestLimit })
  });

  els.staffFirstNameInput.value = "";
  els.staffLastInitialInput.value = "";
  if (els.staffUsernameInput) els.staffUsernameInput.value = "";
  if (els.staffPasswordInput) els.staffPasswordInput.value = "";
  els.staffLimitInput.value = "";
}

function renderTopList(listEl, rows, scoreKey) {
  listEl.innerHTML = "";
  const items = rows || [];
  if (!items.length) {
    const li = document.createElement("li");
    li.className = "req-item empty";
    li.textContent = "No data yet";
    listEl.append(li);
    return;
  }

  for (const row of items) {
    const li = document.createElement("li");
    li.className = "req-item";
    li.innerHTML = `
      <span class="req-name">${escapeHtml(row.name || "Unknown")}</span>
      <span class="req-count">${Number(row[scoreKey] || 0)}</span>
    `;
    listEl.append(li);
  }
}

async function loadAdminRequestStats() {
  if (!els.topPlayedAdminList && !els.topUpvotedAdminList) return;
  const data = await api("/api/admin/requests/stats");
  if (els.topPlayedAdminList) renderTopList(els.topPlayedAdminList, data.topPlayed || [], "playCount");
  if (els.topSkippedAdminList) renderTopList(els.topSkippedAdminList, data.topSkipped || [], "skipCount");
  if (els.topUpvotedAdminList) renderTopList(els.topUpvotedAdminList, data.topUpvoted || [], "upvotes");
  if (els.topDownvotedAdminList) renderTopList(els.topDownvotedAdminList, data.topDownvoted || [], "downvotes");
}

// ── Spotify backend settings ─────────────────────────────────────────────────
function renderSpotifyDetails(items) {
  els.spotifyDetails.innerHTML = items
    .filter(Boolean)
    .map((item) => `<span class="pill">${escapeHtml(item)}</span>`)
    .join("");
}

async function loadSpotifySettings() {
  if (!els.spotifyStatusText) return;
  try {
    const data = await api("/api/admin/settings/spotify");
    els.spotifyStatusText.textContent = data.configured
      ? "Mopidy-Spotify is configured on the server."
      : data.enabled
        ? "Mopidy-Spotify is enabled, but required credentials are missing."
        : "Mopidy-Spotify is not enabled in Mopidy.";
    els.spotifyAccountText.textContent = data.spotifySchemeAvailable
      ? `Spotify URIs are available through Mopidy. Config file: ${data.configPath || "/etc/mopidy/mopidy.conf"}`
      : "Spotify URI handling is not currently exposed by Mopidy.";
    renderSpotifyDetails([
      data.enabled ? "Backend enabled" : "Backend disabled",
      data.clientIdConfigured ? "Client ID set" : "Client ID missing",
      data.clientSecretConfigured ? "Client secret set" : "Client secret missing",
      data.allowPlaylists ? "Playlists enabled" : "Playlists disabled",
      data.bitrate ? `Bitrate ${data.bitrate}` : "Bitrate default",
      data.searchTrackCount ? `Search tracks ${data.searchTrackCount}` : "Search tracks default",
      data.outputSummary ? `Output ${data.outputSummary}` : "Output not reported"
    ]);
  } catch (e) {
    els.spotifyStatusText.textContent = e.message;
    els.spotifyAccountText.textContent = "Unable to read Mopidy Spotify backend status.";
    renderSpotifyDetails([]);
  }
}

async function loadAsmSettings() {
  if (!els.asmServiceUrlInput) return;
  try {
    const data = await api("/api/admin/settings/asm");
    els.asmServiceUrlInput.value = data.serviceUrl || "";
    els.asmAccountInput.value = data.account || "";
    els.asmApiKeyInput.value = "";
    els.asmUsernameInput.value = data.username || "";
    els.asmPasswordInput.value = "";
    els.asmMethodInput.value = data.adoptableMethod || "json_adoptable_animals";
    els.asmCacheSecondsInput.value = `${data.cacheSeconds || 600}`;
    const show = data.slideshow || {};
    els.slideshowIntervalInput.value = `${show.intervalSeconds || 12}`;
    els.slideshowLimitInput.value = `${show.defaultLimit || 20}`;
    els.slideshowAudioEnabledToggle.checked = Boolean(show.audioEnabled);
    els.slideshowAudioAutoplayToggle.checked = Boolean(show.audioAutoplay);
    if (els.slideshowExcludeFeralToggle) {
      els.slideshowExcludeFeralToggle.checked = show.excludeFeral !== false;
    }
    if (els.slideshowReadyTodayToggle) {
      els.slideshowReadyTodayToggle.checked = show.readyTodayOnly !== false;
    }
    if (els.slideshowCustomFiltersEnabledToggle) {
      els.slideshowCustomFiltersEnabledToggle.checked = Boolean(show.customFiltersEnabled);
    }
    if (els.slideshowCustomFiltersInput) {
      els.slideshowCustomFiltersInput.value = Array.isArray(show.customFilters) ? show.customFilters.join(", ") : "";
    }
    if (els.adoptablesPerSpecialInput) {
      els.adoptablesPerSpecialInput.value = `${Math.max(1, Number(show.adoptablesPerSpecial || 3))}`;
    }
    if (els.alertEveryXSlidesInput) {
      els.alertEveryXSlidesInput.value = `${Math.max(2, Number(show.alertEveryXSlides || 6))}`;
    }
    if (els.specialImageMaxMbInput) {
      els.specialImageMaxMbInput.value = `${Math.max(1, Number(show.specialImageMaxMb || 4))}`;
    }
    updateSpecialImageStorageText(show.specialImageStorage || null);
    specialPages = Array.isArray(show.specialPages) ? show.specialPages : [];
    renderSpecialPagesList();
    updateSpecialPageImageButtons();
    slideshowDisplayFieldCatalog = sanitizeSlideshowDisplayFieldCatalog(show.displayFieldCatalog || []);
    asmKnownFieldNames = sanitizeAsmFieldNameList(data.fieldNames || [], 120);
    const options = Array.isArray(data.displayFieldOptions) && data.displayFieldOptions.length
      ? data.displayFieldOptions
      : buildSlideshowDisplayFieldOptions(slideshowDisplayFieldCatalog);
    renderSlideshowDisplayFieldSelectors(show.displayFields, options);

    const authSummary = data.authMode === "apiKey"
      ? `API key ${data.apiKeyHint || "set"}`
      : data.authMode === "userpass"
        ? `Username ${data.username || "set"} • Password ${data.hasPassword ? "set" : "missing"}`
        : "No auth configured";
    els.asmStatusText.textContent = data.configured
      ? `${data.serviceUrl || "ASM configured"} • ${authSummary}`
      : "ASM not configured yet.";
    els.asmDetailsText.textContent = data.error
      ? `Last error: ${data.error}`
      : data.fetchedAt
        ? `Last sync ${data.fetchedAt} • ${data.itemCount} animals cached from ${data.sourceCount || 0} source rows`
        : "No sync information yet.";
    els.asmShowSettingsText.textContent = `Interval ${show.intervalSeconds || 12}s • Default count ${show.defaultLimit || 20} • Display slots configured`;
    els.asmInspectSummary.textContent = data.error
      ? `Current issue: ${data.error}`
      : data.requestUrl
        ? `Last request ${data.responseStatus || 0} • ${data.contentType || "unknown content type"}`
        : "Inspect the raw ASM response, returned field names, and cache state.";
    els.asmInspectPills.innerHTML = [
      data.requestUrl ? `Request ready` : "No request URL",
      `Source rows ${data.sourceCount || 0}`,
      `Mapped animals ${data.itemCount || 0}`,
      data.contentType ? `Content ${data.contentType}` : "Content type unknown"
    ].map((item) => `<span class="pill">${escapeHtml(item)}</span>`).join("");
    els.asmFieldNames.textContent = (data.fieldNames || []).length
      ? JSON.stringify(data.fieldNames, null, 2)
      : "No fields captured yet.";
    els.asmBodyPreview.textContent = data.bodyPreview || "No response preview available.";
    els.asmFirstItem.textContent = "Use Inspect Response to fetch a live sample item.";
  } catch (e) {
    els.asmStatusText.textContent = e.message;
  }
}

async function saveAsmSettings() {
  await api("/api/admin/settings/asm", {
    method: "POST",
    body: JSON.stringify({
      serviceUrl: els.asmServiceUrlInput.value.trim(),
      account: els.asmAccountInput.value.trim(),
      apiKey: els.asmApiKeyInput.value.trim(),
      username: els.asmUsernameInput.value.trim(),
      password: els.asmPasswordInput.value.trim(),
      adoptableMethod: els.asmMethodInput.value.trim(),
      cacheSeconds: Number(els.asmCacheSecondsInput.value || 600),
      intervalSeconds: Number(els.slideshowIntervalInput.value || 12),
      defaultLimit: Number(els.slideshowLimitInput.value || 20),
      audioEnabled: Boolean(els.slideshowAudioEnabledToggle.checked),
      audioAutoplay: Boolean(els.slideshowAudioAutoplayToggle.checked),
      excludeFeral: Boolean(els.slideshowExcludeFeralToggle?.checked),
      readyTodayOnly: Boolean(els.slideshowReadyTodayToggle?.checked),
      customFiltersEnabled: Boolean(els.slideshowCustomFiltersEnabledToggle?.checked),
      displayFieldCatalog: sanitizeSlideshowDisplayFieldCatalog(slideshowDisplayFieldCatalog),
      displayFields: getSelectedSlideshowDisplayFields(),
      adoptablesPerSpecial: Number(els.adoptablesPerSpecialInput?.value || 3),
      alertEveryXSlides: Number(els.alertEveryXSlidesInput?.value || 6),
      specialImageMaxMb: Number(els.specialImageMaxMbInput?.value || 4),
      customFilters: `${els.slideshowCustomFiltersInput?.value || ""}`
        .split(/[\n,|]/g)
        .map((item) => item.trim())
        .filter(Boolean)
    })
  });
  els.asmApiKeyInput.value = "";
  els.asmPasswordInput.value = "";
  await loadAsmSettings();
}

async function testAsmSettings() {
  const data = await api("/api/admin/settings/asm/test", { method: "POST" });
  els.asmDetailsText.textContent = data.ok
    ? `Connection OK • ${data.itemCount} animals mapped from ${data.sourceCount || 0} rows at ${data.fetchedAt || "now"}`
    : `Connection failed: ${data.error || "Unknown error"}`;
}

async function inspectAsmSettings() {
  const data = await api("/api/admin/settings/asm/inspect");
  els.asmInspectSummary.textContent = data.ok
    ? `Live response ${data.responseStatus || 0} • ${data.mappedCount || 0} mapped from ${data.sourceCount || 0} source rows`
    : `Inspect failed: ${data.error || "Unknown error"}`;
  els.asmInspectPills.innerHTML = [
    data.requestUrl ? `Request URL ready` : "No request URL",
    data.responseStatus ? `HTTP ${data.responseStatus}` : "No HTTP status",
    data.contentType ? `Content ${data.contentType}` : "Content type unknown",
    `Source rows ${data.sourceCount || 0}`,
    `Mapped animals ${data.mappedCount || 0}`
  ].map((item) => `<span class="pill">${escapeHtml(item)}</span>`).join("");
  els.asmFieldNames.textContent = (data.fieldNames || []).length
    ? JSON.stringify(data.fieldNames, null, 2)
    : "No fields returned.";
  asmKnownFieldNames = sanitizeAsmFieldNameList(data.fieldNames || [], 120);
  if (els.slideshowFieldMapDialog?.open) {
    renderSlideshowFieldMapDialogList();
  }
  els.asmBodyPreview.textContent = data.bodyPreview || "No response body preview available.";
  els.asmFirstItem.textContent = data.firstItem
    ? JSON.stringify(data.firstItem, null, 2)
    : "No sample item returned.";
}

// ── Playlists ─────────────────────────────────────────────────────────────────
async function loadPlaylists() {
  try {
    const data = await api("/api/admin/playlists");
    const playlists = data.playlists || [];
    els.playlistList.innerHTML = "";
    if (!playlists.length) {
      const li = document.createElement("li");
      li.className = "playlist-item empty";
      li.textContent = "No saved playlists";
      els.playlistList.append(li);
      return;
    }
    for (const pl of playlists) {
      const li = document.createElement("li");
      li.className = "playlist-item";
      li.innerHTML = `
        <span class="playlist-name">${escapeHtml(pl.name || pl.uri)}</span>
        <div class="playlist-btns">
          <button class="q-btn" data-action="add" title="Add to end of queue">+ Add</button>
          <button class="q-btn" data-action="replace" title="Clear queue then load">↺ Replace</button>
        </div>
      `;
      li.querySelector('[data-action="add"]').addEventListener("click", () => loadPlaylist(pl.uri, false));
      li.querySelector('[data-action="replace"]').addEventListener("click", () => loadPlaylist(pl.uri, true));
      els.playlistList.append(li);
    }
  } catch (e) { toast(e.message, true); }
}

async function savePlaylist() {
  const name = els.playlistNameInput.value.trim();
  if (!name) { toast("Enter a playlist name first.", true); return; }
  try {
    await api("/api/admin/playlists", { method: "POST", body: JSON.stringify({ name }) });
    els.playlistNameInput.value = "";
    await loadPlaylists();
    toast(`Saved "${name}"`);
  } catch (e) { toast(e.message, true); }
}

async function loadPlaylist(uri, replace) {
  try {
    const result = await api("/api/admin/playlists/load", {
      method: "POST",
      body: JSON.stringify({ uri, replace })
    });
    await loadQueue();
    toast(`Loaded ${result.added} track${result.added !== 1 ? "s" : ""}${replace ? " (replaced queue)" : ""}`);
  } catch (e) { toast(e.message, true); }
}

if (els.explicitToggle) {
  els.explicitToggle.addEventListener("click", async () => {
    const newVal = els.explicitToggle.dataset.active !== "true";
    els.explicitToggle.dataset.active = String(newVal);
    toast(`Explicit filter ${newVal ? "enabled" : "disabled"} (not saved yet)`);
  });
}

els.tabAccount.addEventListener("click", () => setSettingsTab("account"));
els.tabRequestAccess.addEventListener("click", () => setSettingsTab("request"));
els.tabAudioJack.addEventListener("click", () => setSettingsTab("audio-jack"));
els.tabSpotify.addEventListener("click", () => setSettingsTab("spotify"));
els.tabAsm.addEventListener("click", () => setSettingsTab("asm"));
els.asmSubtabConnection.addEventListener("click", () => setAsmSubtab("connection"));
els.asmSubtabSlideshow.addEventListener("click", () => setAsmSubtab("slideshow"));
els.asmSubtabDiagnostics.addEventListener("click", () => setAsmSubtab("diagnostics"));
if (els.openSlideshowFieldMapBtn) {
  els.openSlideshowFieldMapBtn.addEventListener("click", async () => {
    try {
      await openSlideshowFieldMapDialog();
    } catch (e) {
      toast(e.message, true);
    }
  });
}
if (els.saveSlideshowFieldMapBtn) {
  els.saveSlideshowFieldMapBtn.addEventListener("click", saveSlideshowFieldMapSelection);
}
if (els.cancelSlideshowFieldMapBtn) {
  els.cancelSlideshowFieldMapBtn.addEventListener("click", () => els.slideshowFieldMapDialog?.close());
}
if (els.newSpecialPageBtn) {
  els.newSpecialPageBtn.addEventListener("click", resetSpecialPageEditor);
}
if (els.saveSpecialPageBtn) {
  els.saveSpecialPageBtn.addEventListener("click", async () => {
    try {
      await saveSpecialPage();
    } catch (e) {
      toast(e.message, true);
    }
  });
}
if (els.deleteSpecialPageBtn) {
  els.deleteSpecialPageBtn.addEventListener("click", async () => {
    try {
      await deleteSpecialPage();
    } catch (e) {
      toast(e.message, true);
    }
  });
}
if (els.viewSpecialPageImageBtn) {
  els.viewSpecialPageImageBtn.addEventListener("click", () => {
    const page = getSpecialPageById(els.specialPageIdInput?.value || "");
    if (!page?.imageUrl) {
      toast("No uploaded image on selected page.", true);
      return;
    }
    window.open(page.imageUrl, "_blank", "noopener,noreferrer");
  });
}
if (els.removeSpecialPageImageBtn) {
  els.removeSpecialPageImageBtn.addEventListener("click", async () => {
    try {
      const page = getSpecialPageById(els.specialPageIdInput?.value || "");
      if (!page) {
        throw new Error("Select a page first.");
      }
      if (!page.imageUrl) {
        throw new Error("Selected page has no uploaded image.");
      }
      await deleteSpecialPageImage(page.id, page.title || "Untitled");
    } catch (e) {
      toast(e.message, true);
    }
  });
}
if (els.specialPageImageInput) {
  els.specialPageImageInput.addEventListener("change", () => {
    const file = els.specialPageImageInput.files?.[0] || null;
    els.specialPageImageNameInput.value = file ? `${file.name} (${Math.ceil(file.size / 1024)} KB)` : "No image selected";
  });
}
if (els.specialPageTemplateInput) {
  els.specialPageTemplateInput.addEventListener("change", updateSpecialPageImageHint);
}
if (els.specialPageRichToolbar) {
  els.specialPageRichToolbar.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-cmd]");
    if (!button) return;
    runRichTextCommand(button.getAttribute("data-cmd") || "");
  });
}
if (els.specialPageFontSizeInput) {
  els.specialPageFontSizeInput.addEventListener("change", () => {
    const size = `${els.specialPageFontSizeInput.value || ""}`.trim();
    if (!size) return;
    runRichTextCommandWithValue("fontSize", size);
  });
}
if (els.specialPageTextColorInput) {
  els.specialPageTextColorInput.addEventListener("input", () => {
    const color = `${els.specialPageTextColorInput.value || ""}`.trim();
    if (!color) return;
    runRichTextCommandWithValue("foreColor", color);
  });
}

async function saveTopSettings() {
  try {
    await Promise.all([
      saveExplicitSetting()
    ]);
    toast("Settings saved");
  } catch (e) { toast(e.message, true); }
}

if (els.saveRequestAccessSettingsBtn) {
  els.saveRequestAccessSettingsBtn.addEventListener("click", saveTopSettings);
}

if (els.topSaveBtn) {
  els.topSaveBtn.addEventListener("click", saveTopSettings);
}

els.audioJackVolumeInput.addEventListener("input", () => {
  els.audioJackVolumeValue.textContent = `${Number(els.audioJackVolumeInput.value || 0)}%`;
  window.clearTimeout(audioJackDebounce);
  audioJackDebounce = window.setTimeout(async () => {
    try {
      await saveAudioJackSettings();
    } catch (e) {
      toast(e.message, true);
    }
  }, 250);
});

if (els.audioJackRefreshBtn) {
  els.audioJackRefreshBtn.addEventListener("click", async () => {
    await loadAudioJackSettings();
    toast("Audio jack settings refreshed");
  });
}

if (els.audioJackMutedToggle) {
  els.audioJackMutedToggle.addEventListener("change", async () => {
    try {
      await saveAudioJackSettings();
      toast("AUX mute updated");
    } catch (e) { toast(e.message, true); }
  });
}

if (els.audioJackMuteToggleBtn) {
  els.audioJackMuteToggleBtn.addEventListener("click", async () => {
    try {
      const currentMuted = getAudioJackMutedFromUi();
      setAudioJackMutedToUi(!currentMuted);
      await saveAudioJackSettings();
      toast(!currentMuted ? "AUX muted" : "AUX unmuted");
    } catch (e) { toast(e.message, true); }
  });
}

if (els.audioJackSaveBtn) {
  els.audioJackSaveBtn.addEventListener("click", async () => {
    try {
      await saveAudioJackSettings();
      toast("Audio jack settings saved");
    } catch (e) { toast(e.message, true); }
  });
}

if (els.streamDeliveryToggleBtn) {
  els.streamDeliveryToggleBtn.addEventListener("click", async () => {
    try {
      const currentlyEnabled = els.streamDeliveryToggleBtn.dataset.active === "true";
      await setStreamDeliveryState(!currentlyEnabled);
      await loadAudioAutomationSettings();
      toast(!currentlyEnabled ? "Iframe stream delivery started" : "Iframe stream delivery stopped");
    } catch (e) { toast(e.message, true); }
  });
}

if (els.audioAutomationTargetInput) {
  els.audioAutomationTargetInput.addEventListener("change", updateAudioAutomationActionChoices);
}

if (els.newAudioAutomationBtn) {
  els.newAudioAutomationBtn.addEventListener("click", resetAudioAutomationEditor);
}

if (els.saveAudioAutomationBtn) {
  els.saveAudioAutomationBtn.addEventListener("click", async () => {
    try {
      await saveAudioAutomationSchedule();
      toast("Audio schedule saved");
    } catch (e) { toast(e.message, true); }
  });
}

if (els.deleteAudioAutomationBtn) {
  els.deleteAudioAutomationBtn.addEventListener("click", async () => {
    try {
      await deleteAudioAutomationSchedule();
      toast("Audio schedule deleted");
    } catch (e) { toast(e.message, true); }
  });
}

if (els.runAudioAutomationNowBtn) {
  els.runAudioAutomationNowBtn.addEventListener("click", async () => {
    try {
      await runAudioAutomationScheduleNow();
    } catch (e) { toast(e.message, true); }
  });
}

if (els.saveAccountProfileBtn) {
  els.saveAccountProfileBtn.addEventListener("click", async () => {
    try {
      await saveAccountProfile();
      await loadAccountSettings();
      toast("Account profile saved");
    } catch (e) { toast(e.message, true); }
  });
}

if (els.saveAccountPasswordBtn) {
  els.saveAccountPasswordBtn.addEventListener("click", async () => {
    try {
      await saveAccountPassword();
      await loadAccountSettings();
      toast("Password updated");
    } catch (e) { toast(e.message, true); }
  });
}

if (els.refreshAccountHistoryBtn) {
  els.refreshAccountHistoryBtn.addEventListener("click", async () => {
    try {
      await loadAccountSettings();
      toast("Account data refreshed");
    } catch (e) { toast(e.message, true); }
  });
}

if (els.saveDefaultRequestLimitBtn) {
  els.saveDefaultRequestLimitBtn.addEventListener("click", async () => {
    try {
      await saveDefaultRequestLimit();
      await loadStaffSettings();
      toast("Default request limit saved");
    } catch (e) { toast(e.message, true); }
  });
}

if (els.createStaffBtn) {
  els.createStaffBtn.addEventListener("click", async () => {
    try {
      await createStaffAccount();
      await loadStaffSettings();
      toast("User account created");
    } catch (e) { toast(e.message, true); }
  });
}

if (els.refreshRequestStatsBtn) {
  els.refreshRequestStatsBtn.addEventListener("click", async () => {
    try {
      await loadAdminRequestStats();
      toast("Request stats refreshed");
    } catch (e) { toast(e.message, true); }
  });
}

if (els.spotifyRefreshBtn) {
  els.spotifyRefreshBtn.addEventListener("click", async () => {
    await loadSpotifySettings();
    toast("Spotify settings refreshed");
  });
}

if (els.saveAsmConfigBtn) {
  els.saveAsmConfigBtn.addEventListener("click", async () => {
    try {
      await saveAsmSettings();
      toast("ASM config saved");
    } catch (e) { toast(e.message, true); }
  });
}

if (els.saveAsmApplyBtn) {
  els.saveAsmApplyBtn.addEventListener("click", async () => {
    try {
      await saveAsmSettings();
      toast("ASM settings saved and applied");
    } catch (e) { toast(e.message, true); }
  });
}

if (els.testAsmConfigBtn) {
  els.testAsmConfigBtn.addEventListener("click", async () => {
    try {
      await saveAsmSettings();
      await testAsmSettings();
      toast("ASM connection tested");
    } catch (e) { toast(e.message, true); }
  });
}

if (els.inspectAsmBtn) {
  els.inspectAsmBtn.addEventListener("click", async () => {
    try {
      await inspectAsmSettings();
      setAsmSubtab("diagnostics");
      toast("ASM response inspected");
    } catch (e) { toast(e.message, true); }
  });
}

if (els.savePlaylistBtn) {
  els.savePlaylistBtn.addEventListener("click", savePlaylist);
}

if (els.refreshPlaylistsBtn) {
  els.refreshPlaylistsBtn.addEventListener("click", loadPlaylists);
}

if (els.playlistNameInput) {
  els.playlistNameInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); savePlaylist(); }
  });
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────

async function bootstrap() {
  setSettingsTab(settingsTab);
  setAsmSubtab(asmSubtab);
  if (adminToken) {
    try {
      await connectAdminToStreamSession().catch(() => {});
      await initializeApp();
    } catch (err) {
      console.error("initializeApp failed:", err);
      const isAuthError = err?.status === 401 || err?.status === 403 || err?.message?.includes("401") || err?.message?.includes("403") || err?.message?.includes("Unauthorized") || err?.message?.includes("Forbidden");
      if (isAuthError) {
        sessionStorage.removeItem(ADMIN_TOKEN_KEY);
        localStorage.removeItem(ADMIN_TOKEN_KEY);
        localStorage.removeItem(EMPLOYEE_TOKEN_KEY);
        notifyShellSessionUpdate("admin");
        notifyShellSessionUpdate("employee");
        adminToken = "";
        els.loginDialog.showModal();
      } else {
        toast(`Load error: ${err.message}`, true);
      }
    }
  } else {
    try {
      const elevated = await tryElevateEmployeeSessionToAdmin();
      if (elevated) {
        await connectAdminToStreamSession().catch(() => {});
        await initializeApp();
        return;
      }
    } catch {}
    els.loginDialog.showModal();
  }
}

bootstrap();
