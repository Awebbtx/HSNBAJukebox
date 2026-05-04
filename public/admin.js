import { initAudioBar } from "/audio-bar.js";
initAudioBar();

const ADMIN_TOKEN_KEY = "jukebox.admin.token";
const EMPLOYEE_TOKEN_KEY = "jukebox.employee.token";

let adminToken = sessionStorage.getItem(ADMIN_TOKEN_KEY) || localStorage.getItem(ADMIN_TOKEN_KEY) || "";
let currentPlaybackState = null;
let playbackTimer = null;
let queueTimer = null;
let settingsSyncTimer = null;
let volumeDebounce = null;
let audioJackDebounce = null;
let audioJackSaveSequence = 0;
let masterVolumeBeforeMute = 80;
let playlistLoadBusy = false;
const PLAYLIST_LOAD_TIMEOUT_MS = 90000;
let settingsTab = "request";
let asmSubtab = "connection";
const pageMode = document.body?.dataset?.adminPage || "full";
const SLIDESHOW_DISPLAY_FIELD_OPTIONS = [
  { key: "skip", label: "Skip" }
];
const DEFAULT_SLIDESHOW_DISPLAY_FIELDS = [
  "skip",
  "skip",
  "skip",
  "skip",
  "skip",
  "skip",
  "skip",
  "skip",
  "skip",
  "skip"
];
const SLIDESHOW_DISPLAY_FIELD_SLOT_MIN = 1;
const DEFAULT_CUSTOM_FILTER_FIELD_OPTIONS = [];
let slideshowDisplayFieldCatalog = [];
let slideshowDisplayFieldOptions = [...SLIDESHOW_DISPLAY_FIELD_OPTIONS];
let slideshowCustomFilterRules = [];
let slideshowFieldMapDraftRows = [];
let slideshowFieldMapActiveInput = null;
let asmKnownFieldNames = [];
let asmFieldTypes = {};
let specialPages = [];
let audioAutomationSchedules = [];
const FIELD_MAP_EMOJI_OPTIONS = [
  "😀", "😄", "🙂", "😉", "😍", "🤩", "😘", "🤗", "🤔", "🤷",
  "🐶", "🐱", "🐾", "🦴", "🏠", "❤️", "💙", "⭐", "✅", "❌",
  "⚠️", "⏳", "🎉", "📣", "🔔", "📌", "🧼", "🩺", "💊", "🚫"
];
const playlistEditorState = {
  uri: "",
  name: "",
  tracks: []
};
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
const STAFF_GROUP_OPTIONS = [
  { value: "user", label: "User" },
  { value: "jukebox-admin", label: "Jukebox admin" },
  { value: "reporting", label: "Reporting" },
  { value: "superadmin", label: "Superadmin" },
  { value: "global-admin", label: "Global admin" }
];

if (pageMode === "audio") {
  settingsTab = "audio-jack";
} else if (pageMode === "debug") {
  settingsTab = "audio-jack";
} else if (pageMode === "scheduler") {
  settingsTab = "audio-jack";
} else if (pageMode === "system") {
  settingsTab = "clock";
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
  spotifyImportUrlInput: document.getElementById("spotifyImportUrlInput"),
  spotifyImportBtn:   document.getElementById("spotifyImportBtn"),
  spotifyImportStatus: document.getElementById("spotifyImportStatus"),
  playlistNameInput:  document.getElementById("playlistNameInput"),
  playlistList:       document.getElementById("playlistList"),
  playlistEditorDialog: document.getElementById("playlistEditorDialog"),
  playlistEditorTitle: document.getElementById("playlistEditorTitle"),
  playlistEditorStatus: document.getElementById("playlistEditorStatus"),
  playlistEditorNameInput: document.getElementById("playlistEditorNameInput"),
  playlistEditorCount: document.getElementById("playlistEditorCount"),
  playlistEditorTracks: document.getElementById("playlistEditorTracks"),
  playlistEditorCloseBtn: document.getElementById("playlistEditorCloseBtn"),
  playlistEditorSaveBtn: document.getElementById("playlistEditorSaveBtn"),
  playlistEditorDeleteBtn: document.getElementById("playlistEditorDeleteBtn"),

  tabAccount: document.getElementById("tabAccount"),
  tabRequestAccess: document.getElementById("tabRequestAccess"),
  tabClock: document.getElementById("tabClock"),
  tabAudioJack: document.getElementById("tabAudioJack"),
  tabEmail: document.getElementById("tabEmail"),
  tabSpotify: document.getElementById("tabSpotify"),
  tabAsm: document.getElementById("tabAsm"),
  panelAccount: document.getElementById("panelAccount"),
  panelRequestAccess: document.getElementById("panelRequestAccess"),
  panelClock: document.getElementById("panelClock"),
  panelAudioJack: document.getElementById("panelAudioJack"),
  panelEmail: document.getElementById("panelEmail"),
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
  staffDisplayNameInput: document.getElementById("staffDisplayNameInput"),
  staffUsernameInput: document.getElementById("staffUsernameInput"),
  staffPasswordInput: document.getElementById("staffPasswordInput"),
  staffLimitInput: document.getElementById("staffLimitInput"),
  staffGroupUser: document.getElementById("staffGroupUser"),
  staffGroupJukeboxAdmin: document.getElementById("staffGroupJukeboxAdmin"),
  staffGroupReporting: document.getElementById("staffGroupReporting"),
  staffGroupSuperadmin: document.getElementById("staffGroupSuperadmin"),
  staffGroupGlobalAdmin: document.getElementById("staffGroupGlobalAdmin"),
  createStaffBtn: document.getElementById("createStaffBtn"),
  staffStatusText: document.getElementById("staffStatusText"),
  asmImportLoadBtn: document.getElementById("asmImportLoadBtn"),
  asmImportCandidatesList: document.getElementById("asmImportCandidatesList"),
  asmImportStatus: document.getElementById("asmImportStatus"),
  asmImportList: document.getElementById("asmImportList"),
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
  audioJackCardSelect: document.getElementById("audioJackCardSelect"),
  audioJackControlSelect: document.getElementById("audioJackControlSelect"),
  systemTimezoneInput: document.getElementById("systemTimezoneInput"),
  systemClockStatusText: document.getElementById("systemClockStatusText"),
  systemClockPills: document.getElementById("systemClockPills"),
  saveSystemTimezoneBtn: document.getElementById("saveSystemTimezoneBtn"),
  refreshSystemClockBtn: document.getElementById("refreshSystemClockBtn"),
  smtpStatusText: document.getElementById("smtpStatusText"),
  smtpStatusPills: document.getElementById("smtpStatusPills"),
  smtpHostInput: document.getElementById("smtpHostInput"),
  smtpPortInput: document.getElementById("smtpPortInput"),
  smtpFromInput: document.getElementById("smtpFromInput"),
  smtpReplyToInput: document.getElementById("smtpReplyToInput"),
  smtpUserInput: document.getElementById("smtpUserInput"),
  smtpPassInput: document.getElementById("smtpPassInput"),
  smtpSecureToggle: document.getElementById("smtpSecureToggle"),
  smtpRequireTlsToggle: document.getElementById("smtpRequireTlsToggle"),
  smtpPoolToggle: document.getElementById("smtpPoolToggle"),
  smtpTestToInput: document.getElementById("smtpTestToInput"),
  smtpSaveBtn: document.getElementById("smtpSaveBtn"),
  smtpVerifyBtn: document.getElementById("smtpVerifyBtn"),
  smtpSendTestBtn: document.getElementById("smtpSendTestBtn"),
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

  // Jukebox Spotify Web API (OAuth / search token)
  jukeboxSpotifyStatusText: document.getElementById("jukeboxSpotifyStatusText"),
  jukeboxSpotifyRefreshBtn: document.getElementById("jukeboxSpotifyRefreshBtn"),
  spotifyDisconnectBtn: document.getElementById("spotifyDisconnectBtn"),
  spotifyCycleConnectBtn: document.getElementById("spotifyCycleConnectBtn"),
  // Mopidy-Spotify plugin
  spotifyStatusText: document.getElementById("spotifyStatusText"),
  spotifyAccountText: document.getElementById("spotifyAccountText"),
  spotifyRefreshBtn: document.getElementById("spotifyRefreshBtn"),
  spotifyAuthBtn: document.getElementById("spotifyAuthBtn"),
  spotifyDetails: document.getElementById("spotifyDetails"),
  spotifyMopidyCredentialsPasteInput: document.getElementById("spotifyMopidyCredentialsPasteInput"),
  spotifyApplyCredentialsBtn: document.getElementById("spotifyApplyCredentialsBtn"),

  asmStatusText: document.getElementById("asmStatusText"),
  asmDetailsText: document.getElementById("asmDetailsText"),
  asmServiceUrlInput: document.getElementById("asmServiceUrlInput"),
  asmAccountInput: document.getElementById("asmAccountInput"),
  asmApiKeyInput: document.getElementById("asmApiKeyInput"),
  asmUsernameInput: document.getElementById("asmUsernameInput"),
  asmPasswordInput: document.getElementById("asmPasswordInput"),
  asmMethodInput: document.getElementById("asmMethodInput"),
  asmAnimalControlReportTitleInput: document.getElementById("asmAnimalControlReportTitleInput"),
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
  panZoomSpeedSecondsInput: document.getElementById("panZoomSpeedSecondsInput"),
  panZoomStartPercentInput: document.getElementById("panZoomStartPercentInput"),
  panZoomEndPercentInput: document.getElementById("panZoomEndPercentInput"),
  photoFitModeInput: document.getElementById("photoFitModeInput"),
  slideshowExcludeFeralToggle: document.getElementById("slideshowExcludeFeralToggle"),
  slideshowCustomFiltersEnabledToggle: document.getElementById("slideshowCustomFiltersEnabledToggle"),
  slideshowCustomFiltersBuilder: document.getElementById("slideshowCustomFiltersBuilder"),
  addCustomFilterRuleBtn: document.getElementById("addCustomFilterRuleBtn"),
  applyCustomFiltersBtn: document.getElementById("applyCustomFiltersBtn"),
  emojiShowerEnabledToggle: document.getElementById("emojiShowerEnabledToggle"),
  emojiShowerFrequencyInput: document.getElementById("emojiShowerFrequencyInput"),
  emojiShowerDurationInput: document.getElementById("emojiShowerDurationInput"),
  emojiShowerIntensityInput: document.getElementById("emojiShowerIntensityInput"),
  emojiShowerChoiceCheckboxes: document.querySelectorAll('input[name="emojiChoice"]'),
  saveEmojiShowerBtn: document.getElementById("saveEmojiShowerBtn"),
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

function queueItemNeedsMetadataHydration(item = {}) {
  const uri = `${item.uri || ""}`.trim();
  if (!/^spotify:track:[A-Za-z0-9]+$/.test(uri) || item.metadataHydrationExhausted === true) {
    return false;
  }

  const name = `${item.name || ""}`.trim();
  const artists = `${item.artists || ""}`.trim();
  const album = `${item.album || ""}`.trim();
  const imageUrl = `${item.imageUrl || ""}`.trim();
  const durationMs = Number(item.durationMs || 0);
  const hasExplicit = typeof item.explicit === "boolean";

  return (
    !name
    || name === "Unknown track"
    || /^Spotify track \(/.test(name)
    || !artists
    || !album
    || !imageUrl
    || durationMs <= 0
    || !hasExplicit
  );
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

function sanitizeSlideshowValueLabels(valueLabels) {
  if (!valueLabels || typeof valueLabels !== "object") {
    return {};
  }
  const entries = Object.entries(valueLabels)
    .map(([rawValue, label]) => {
      const valueKey = `${rawValue || ""}`.trim().slice(0, 64);
      const displayLabel = `${label || ""}`.trim().slice(0, 80);
      return valueKey && displayLabel ? [valueKey, displayLabel] : null;
    })
    .filter(Boolean)
    .slice(0, 40);
  return Object.fromEntries(entries);
}

function parseValueLabelsInput(text) {
  const source = `${text || ""}`.trim();
  if (!source) {
    return {};
  }
  const valueLabels = {};
  // Split on pipes, newlines, OR spaces (but be smart about it)
  // First try to split on pipes/newlines; if none exist, split on spaces
  const hasPipeOrNewline = /[\|\n\r]/.test(source);
  const entries = hasPipeOrNewline
    ? source.split(/\||\n|\r/g)
    : source.split(/\s+/g);

  entries
    .map((entry) => `${entry || ""}`.trim())
    .filter(Boolean)
    .forEach((entry) => {
      const hasEquals = entry.includes("=");
      const hasColon = entry.includes(":");
      const separatorIndex = hasEquals ? entry.indexOf("=") : (hasColon ? entry.indexOf(":") : -1);
      if (separatorIndex <= 0) {
        return;
      }
      const key = entry.slice(0, separatorIndex).trim().slice(0, 64);
      const label = entry.slice(separatorIndex + 1).trim().slice(0, 80);
      if (key && label) {
        valueLabels[key] = label;
      }
    });
  return sanitizeSlideshowValueLabels(valueLabels);
}

function insertTextAtCursor(input, text) {
  const target = input;
  if (!target || typeof target.value !== "string") {
    return false;
  }
  const start = Number.isInteger(target.selectionStart) ? target.selectionStart : target.value.length;
  const end = Number.isInteger(target.selectionEnd) ? target.selectionEnd : target.value.length;
  const before = target.value.slice(0, start);
  const after = target.value.slice(end);
  target.value = `${before}${text}${after}`;
  const caret = start + text.length;
  target.setSelectionRange(caret, caret);
  target.dispatchEvent(new Event("input", { bubbles: true }));
  return true;
}

async function copyTextToClipboard(text) {
  const value = `${text || ""}`;
  if (!value) {
    return false;
  }
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // Fallback below.
  }
  try {
    const fallback = document.createElement("textarea");
    fallback.value = value;
    fallback.setAttribute("readonly", "readonly");
    fallback.style.position = "fixed";
    fallback.style.opacity = "0";
    document.body.append(fallback);
    fallback.select();
    const copied = document.execCommand("copy");
    fallback.remove();
    return copied;
  } catch {
    return false;
  }
}

function formatValueLabelsInput(valueLabels) {
  return Object.entries(sanitizeSlideshowValueLabels(valueLabels || {}))
    .map(([valueKey, label]) => `${valueKey}=${label}`)
    .join(" | ");
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
      enabled: item?.enabled !== false,
      valueLabels: sanitizeSlideshowValueLabels(item?.valueLabels || {})
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
  const slotCount = sanitizedSelection.length;
  for (let index = 0; index < slotCount; index += 1) {
    const row = document.createElement("div");
    row.className = "slideshow-display-row";
    row.innerHTML = `
      <span class="slot-label">${index + 1}.</span>
      <select data-display-slot="${index}">${optionsMarkup}</select>
      <button type="button" class="btn-sm slideshow-display-remove" data-display-remove-index="${index}" title="Remove slot" aria-label="Remove slot" ${slotCount <= SLIDESHOW_DISPLAY_FIELD_SLOT_MIN ? "disabled" : ""}>X</button>
    `;
    const select = row.querySelector("select");
    select.value = sanitizedSelection[index] || "skip";
    els.slideshowDisplayFieldsContainer.append(row);
  }

  const controls = document.createElement("div");
  controls.className = "slideshow-display-controls";
  controls.innerHTML = `
    <button type="button" class="btn-sm" data-display-add>Add Slot</button>
    <span class="setting-desc">${slotCount} slot${slotCount === 1 ? "" : "s"}</span>
  `;
  els.slideshowDisplayFieldsContainer.append(controls);

  const addBtn = controls.querySelector("button[data-display-add]");
  if (addBtn) {
    addBtn.addEventListener("click", () => {
      const next = normalizeSlideshowDisplayFields([...getSelectedSlideshowDisplayFields(), "skip"]);
      renderSlideshowDisplayFieldSelectors(next, slideshowDisplayFieldOptions);
    });
  }

  Array.from(els.slideshowDisplayFieldsContainer.querySelectorAll("button[data-display-remove-index]"))
    .forEach((removeBtn) => {
      removeBtn.addEventListener("click", () => {
      const current = getSelectedSlideshowDisplayFields();
      if (current.length <= SLIDESHOW_DISPLAY_FIELD_SLOT_MIN) {
        return;
      }
      const removeIndex = Number(removeBtn.getAttribute("data-display-remove-index") || -1);
      const next = normalizeSlideshowDisplayFields(current.filter((_value, index) => index !== removeIndex));
      renderSlideshowDisplayFieldSelectors(next, slideshowDisplayFieldOptions);
    });
  });
}

function getSelectedSlideshowDisplayFields() {
  if (!els.slideshowDisplayFieldsContainer) {
    return [...DEFAULT_SLIDESHOW_DISPLAY_FIELDS];
  }
  const selected = Array.from(els.slideshowDisplayFieldsContainer.querySelectorAll("select[data-display-slot]"))
    .map((select) => `${select.value || "skip"}`.trim() || "skip");
  return normalizeSlideshowDisplayFields(selected);
}

const CUSTOM_FILTER_METHOD_OPTIONS = [
  { key: "eq", label: "=" },
  { key: "gte", label: ">=" },
  { key: "lte", label: "<=" },
  { key: "match", label: "Match" },
  { key: "contains", label: "Partial Match" }
];
const CUSTOM_FILTER_METHOD_OPTIONS_BY_TYPE = {
  boolean: ["eq"],
  number: ["eq", "gte", "lte"],
  date: ["eq", "gte", "lte"],
  text: ["match", "contains"],
  unknown: ["eq", "gte", "lte", "match", "contains"]
};

function sanitizeAsmFieldTypeMap(raw) {
  if (!raw || typeof raw !== "object") {
    return {};
  }
  return Object.fromEntries(
    Object.entries(raw)
      .map(([key, value]) => {
        const sourceKey = sanitizeAsmFieldName(key);
        const type = `${value || ""}`.trim().toLowerCase();
        const allowedType = ["boolean", "number", "date", "text"].includes(type) ? type : "unknown";
        return sourceKey ? [sourceKey.toUpperCase(), allowedType] : null;
      })
      .filter(Boolean)
  );
}

function getCustomFilterFieldType(sourceKey) {
  return asmFieldTypes?.[`${sourceKey || ""}`.trim().toUpperCase()] || "unknown";
}

function getAllowedCustomFilterMethodOptions(sourceKey) {
  const fieldType = getCustomFilterFieldType(sourceKey);
  const allowed = new Set(CUSTOM_FILTER_METHOD_OPTIONS_BY_TYPE[fieldType] || CUSTOM_FILTER_METHOD_OPTIONS_BY_TYPE.unknown);
  return CUSTOM_FILTER_METHOD_OPTIONS.filter((option) => allowed.has(option.key));
}

function getDefaultCustomFilterMethod(sourceKey) {
  return getAllowedCustomFilterMethodOptions(sourceKey)[0]?.key || "contains";
}

function sanitizeCustomFilterRules(raw) {
  if (!Array.isArray(raw)) {
    return [];
  }
  const allowedMethods = new Set(CUSTOM_FILTER_METHOD_OPTIONS.map((item) => item.key));
  return raw
    .map((item) => {
      const sourceKey = sanitizeAsmFieldName(item?.sourceKey || "");
      const method = `${item?.method || "contains"}`.trim().toLowerCase();
      const value = `${item?.value || ""}`.trim().slice(0, 160);
      if (!sourceKey || !value) {
        return null;
      }
      return {
        sourceKey,
        method: allowedMethods.has(method) ? method : "contains",
        value
      };
    })
    .filter(Boolean)
    .slice(0, 50);
}

function getAsmFieldOptionsForCustomFilters() {
  const fromInspect = sanitizeAsmFieldNameList(asmKnownFieldNames || [], 120);
  const fromCatalog = sanitizeSlideshowDisplayFieldCatalog(slideshowDisplayFieldCatalog)
    .map((entry) => sanitizeAsmFieldName(entry.sourceKey || ""))
    .filter(Boolean);
  const fromDefaults = DEFAULT_CUSTOM_FILTER_FIELD_OPTIONS
    .map((entry) => sanitizeAsmFieldName(entry.sourceKey || ""))
    .filter(Boolean);
  const merged = Array.from(new Set([...fromInspect, ...fromCatalog, ...fromDefaults]));
  if (!merged.length) {
    return [];
  }
  const catalogByField = new Map(
    sanitizeSlideshowDisplayFieldCatalog(slideshowDisplayFieldCatalog)
      .map((entry) => [entry.sourceKey.toUpperCase(), entry])
  );
  const defaultsByField = new Map(
    DEFAULT_CUSTOM_FILTER_FIELD_OPTIONS
      .map((entry) => [entry.sourceKey.toUpperCase(), entry])
  );
  return merged.map((sourceKey) => {
    const mapped = catalogByField.get(sourceKey.toUpperCase());
    const fallback = defaultsByField.get(sourceKey.toUpperCase());
    return {
      sourceKey,
      label: mapped?.label || fallback?.label || formatSlideshowFieldLabel(sourceKey)
    };
  });
}

function collectCustomFilterRulesFromUi() {
  if (!els.slideshowCustomFiltersBuilder) {
    return sanitizeCustomFilterRules(slideshowCustomFilterRules);
  }
  const rows = Array.from(els.slideshowCustomFiltersBuilder.querySelectorAll(".custom-filter-row"));
  const rules = rows.map((row) => ({
    sourceKey: sanitizeAsmFieldName(row.querySelector('select[data-filter-field]')?.value || ""),
    method: `${row.querySelector('select[data-filter-method]')?.value || "contains"}`.trim().toLowerCase(),
    value: `${row.querySelector('input[data-filter-value]')?.value || ""}`.trim()
  }));
  return sanitizeCustomFilterRules(rules);
}

function collectCustomFilterRuleDraftsFromUi() {
  if (!els.slideshowCustomFiltersBuilder) {
    return Array.isArray(slideshowCustomFilterRules) ? [...slideshowCustomFilterRules] : [];
  }
  return Array.from(els.slideshowCustomFiltersBuilder.querySelectorAll(".custom-filter-row")).map((row) => ({
    sourceKey: sanitizeAsmFieldName(row.querySelector('select[data-filter-field]')?.value || ""),
    method: `${row.querySelector('select[data-filter-method]')?.value || "contains"}`.trim().toLowerCase(),
    value: `${row.querySelector('input[data-filter-value]')?.value || ""}`.trim()
  }));
}

function renderCustomFilterRuleRows(rules = slideshowCustomFilterRules) {
  if (!els.slideshowCustomFiltersBuilder) {
    return;
  }
  const draftRules = Array.isArray(rules)
    ? rules
        .map((item) => ({
          sourceKey: sanitizeAsmFieldName(item?.sourceKey || ""),
          method: `${item?.method || "contains"}`.trim().toLowerCase(),
          value: `${item?.value || ""}`.trim().slice(0, 160)
        }))
        .filter((item) => item.sourceKey)
        .slice(0, 50)
    : [];
  const safeRules = sanitizeCustomFilterRules(draftRules);
  const fieldOptions = getAsmFieldOptionsForCustomFilters();

  if (!fieldOptions.length) {
    els.slideshowCustomFiltersBuilder.innerHTML = '<div class="setting-desc">No ASM fields available yet. Run Inspect Response first.</div>';
    return;
  }

  const fieldOptionsMarkup = fieldOptions
    .map((option) => `<option value="${escapeHtml(option.sourceKey)}">${escapeHtml(option.label)} (${escapeHtml(option.sourceKey)})</option>`)
    .join("");

  const rows = draftRules.length ? draftRules : (safeRules.length ? safeRules : [{ sourceKey: fieldOptions[0].sourceKey, method: getDefaultCustomFilterMethod(fieldOptions[0].sourceKey), value: "" }]);
  els.slideshowCustomFiltersBuilder.innerHTML = rows.map((rule, index) => `
    <div class="custom-filter-row" data-filter-index="${index}">
      <select data-filter-field>${fieldOptionsMarkup}</select>
      <select data-filter-method>${getAllowedCustomFilterMethodOptions(rule.sourceKey).map((option) => `<option value="${escapeHtml(option.key)}">${escapeHtml(option.label)}</option>`).join("")}</select>
      <input type="text" data-filter-value placeholder="Filter value" value="${escapeHtml(rule.value || "")}" maxlength="160" />
      <button type="button" class="btn-sm danger" data-remove-filter="${index}" title="Remove filter">✕</button>
    </div>
  `).join("");

  const rowsEls = Array.from(els.slideshowCustomFiltersBuilder.querySelectorAll(".custom-filter-row"));
  rowsEls.forEach((row, index) => {
    const safeRule = rows[index] || rows[0];
    const fieldSelect = row.querySelector('select[data-filter-field]');
    const methodSelect = row.querySelector('select[data-filter-method]');
    if (fieldSelect) {
      fieldSelect.value = safeRule.sourceKey || fieldOptions[0].sourceKey;
    }
    if (methodSelect) {
      const allowedMethods = getAllowedCustomFilterMethodOptions(fieldSelect?.value || safeRule.sourceKey || fieldOptions[0].sourceKey);
      methodSelect.value = allowedMethods.some((option) => option.key === safeRule.method)
        ? safeRule.method
        : (allowedMethods[0]?.key || "contains");
    }
  });

  Array.from(els.slideshowCustomFiltersBuilder.querySelectorAll('select[data-filter-field]')).forEach((select) => {
    select.addEventListener("change", () => {
      const drafts = collectCustomFilterRuleDraftsFromUi().map((rule) => ({
        ...rule,
        method: getAllowedCustomFilterMethodOptions(rule.sourceKey).some((option) => option.key === rule.method)
          ? rule.method
          : getDefaultCustomFilterMethod(rule.sourceKey)
      }));
      renderCustomFilterRuleRows(drafts);
    });
  });

  Array.from(els.slideshowCustomFiltersBuilder.querySelectorAll("button[data-remove-filter]")).forEach((button) => {
    button.addEventListener("click", () => {
      const next = collectCustomFilterRulesFromUi();
      const idx = Number(button.getAttribute("data-remove-filter") || -1);
      const remaining = next.filter((_row, i) => i !== idx);
      slideshowCustomFilterRules = sanitizeCustomFilterRules(remaining);
      renderCustomFilterRuleRows(slideshowCustomFilterRules);
    });
  });
}

function renderSlideshowFieldMapDialogList() {
  if (!els.slideshowFieldMapList) {
    return;
  }
  const known = sanitizeAsmFieldNameList(asmKnownFieldNames, 120);
  const rows = Array.isArray(slideshowFieldMapDraftRows) && slideshowFieldMapDraftRows.length
    ? slideshowFieldMapDraftRows
    : sanitizeSlideshowDisplayFieldCatalog(slideshowDisplayFieldCatalog).map((entry) => ({
        sourceKey: entry.sourceKey,
        label: entry.label,
        enabled: entry.enabled !== false,
        valueLabels: sanitizeSlideshowValueLabels(entry.valueLabels || {})
      }));
  const safeRows = rows.length
    ? rows
    : [{ sourceKey: "", label: "", enabled: true }];

  const datalistId = "asmFieldMapKnownFields";
  const rowMarkup = safeRows
    .map((entry, index) => `
      <div class="map-row" data-map-row="${index}">
        <label class="map-cell map-cell-enable">
          <input type="checkbox" data-map-enabled ${entry.enabled !== false ? "checked" : ""} />
        </label>
        <input class="map-cell" type="text" data-map-source value="${escapeHtml(entry.sourceKey || "")}" maxlength="64" list="${datalistId}" placeholder="ASM field (e.g. BREEDNAME)" />
        <input class="map-cell" type="text" data-map-label value="${escapeHtml(entry.label || "")}" maxlength="60" placeholder="Display label" />
        <input class="map-cell" type="text" data-map-values value="${escapeHtml(formatValueLabelsInput(entry.valueLabels || {}))}" maxlength="420" placeholder="All values for this field: 0=hide 1=Yes 3=Maybe (space, pipe, or line-separated)" />
        <button type="button" class="btn-sm map-cell map-remove-btn" data-map-remove="${index}" title="Remove field" aria-label="Remove field">X</button>
      </div>
    `)
    .join("");

  const datalistMarkup = `
    <datalist id="${datalistId}">
      ${known.map((fieldName) => `<option value="${escapeHtml(fieldName)}"></option>`).join("")}
    </datalist>
  `;
  const emojiMarkup = FIELD_MAP_EMOJI_OPTIONS
    .map((emoji) => `<button type="button" class="emoji-chip" data-map-emoji="${escapeHtml(emoji)}" title="Copy ${escapeHtml(emoji)}">${escapeHtml(emoji)}</button>`)
    .join("");

  els.slideshowFieldMapList.innerHTML = `
    <div class="map-table-head">
      <span>Show</span>
      <span>ASM Data Field</span>
      <span>Custom Label</span>
      <span>Data Map Values</span>
      <span>X</span>
    </div>
    <div class="map-table-rows">${rowMarkup}</div>
    <div class="setting-form-actions map-actions">
      <button type="button" class="btn-sm" data-map-add>Add Field</button>
      <button type="button" class="btn-sm" data-map-emoji-toggle>Emoji Menu</button>
    </div>
    <div class="map-emoji-panel" data-map-emoji-panel hidden>
      <div class="map-emoji-grid">${emojiMarkup}</div>
      <div class="setting-desc">Click an emoji to copy it. If a Label or Value Labels input is focused, it will be inserted there too.</div>
    </div>
    ${datalistMarkup}
  `;

  const collectRows = () =>
    Array.from(els.slideshowFieldMapList.querySelectorAll(".map-row")).map((row) => ({
      sourceKey: `${row.querySelector("input[data-map-source]")?.value || ""}`.trim(),
      label: `${row.querySelector("input[data-map-label]")?.value || ""}`.trim().slice(0, 60),
      enabled: Boolean(row.querySelector("input[data-map-enabled]")?.checked),
      valueLabels: parseValueLabelsInput(row.querySelector("input[data-map-values]")?.value || "")
    }));

  Array.from(els.slideshowFieldMapList.querySelectorAll("button[data-map-remove]")).forEach((button) => {
    button.addEventListener("click", () => {
      const idx = Number(button.getAttribute("data-map-remove") || -1);
      const remaining = collectRows().filter((_row, rowIndex) => rowIndex !== idx);
      slideshowFieldMapDraftRows = remaining.length ? remaining : [{ sourceKey: "", label: "", enabled: true }];
      renderSlideshowFieldMapDialogList();
    });
  });

  const addBtn = els.slideshowFieldMapList.querySelector("button[data-map-add]");
  if (addBtn) {
    addBtn.addEventListener("click", () => {
      slideshowFieldMapDraftRows = [...collectRows(), { sourceKey: "", label: "", enabled: true }];
      renderSlideshowFieldMapDialogList();
    });
  }

  Array.from(els.slideshowFieldMapList.querySelectorAll('input[data-map-label], input[data-map-values]')).forEach((input) => {
    const rememberFocus = () => {
      slideshowFieldMapActiveInput = input;
    };
    input.addEventListener("focus", rememberFocus);
    input.addEventListener("click", rememberFocus);
  });

  const emojiToggleBtn = els.slideshowFieldMapList.querySelector("button[data-map-emoji-toggle]");
  const emojiPanel = els.slideshowFieldMapList.querySelector("[data-map-emoji-panel]");
  if (emojiToggleBtn && emojiPanel) {
    emojiToggleBtn.addEventListener("click", () => {
      emojiPanel.hidden = !emojiPanel.hidden;
    });
  }

  Array.from(els.slideshowFieldMapList.querySelectorAll("button[data-map-emoji]")).forEach((button) => {
    button.addEventListener("click", async () => {
      const emoji = `${button.getAttribute("data-map-emoji") || ""}`;
      if (!emoji) {
        return;
      }
      const activeInput = slideshowFieldMapActiveInput;
      if (activeInput && document.contains(activeInput)) {
        activeInput.focus();
        insertTextAtCursor(activeInput, emoji);
      }
      const copied = await copyTextToClipboard(emoji);
      toast(copied ? `Copied ${emoji}` : `Selected ${emoji}`);
    });
  });
}

async function openSlideshowFieldMapDialog() {
  if (!els.slideshowFieldMapDialog) {
    return;
  }
  slideshowFieldMapDraftRows = sanitizeSlideshowDisplayFieldCatalog(slideshowDisplayFieldCatalog).map((entry) => ({
    sourceKey: entry.sourceKey,
    label: entry.label,
    enabled: entry.enabled !== false,
    valueLabels: sanitizeSlideshowValueLabels(entry.valueLabels || {})
  }));
  try {
    const inspect = await api("/api/admin/settings/asm/inspect");
    asmKnownFieldNames = sanitizeAsmFieldNameList(inspect.fieldNames || [], 120);
    asmFieldTypes = sanitizeAsmFieldTypeMap(inspect.fieldTypes || {});
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
  const priorFilterDrafts = collectCustomFilterRuleDraftsFromUi();
  const selected = Array.from(els.slideshowFieldMapList.querySelectorAll(".map-row"))
    .map((row) => {
      const sourceKey = sanitizeAsmFieldName(row.querySelector("input[data-map-source]")?.value || "");
      if (!sourceKey) {
        return null;
      }
      const labelRaw = `${row.querySelector("input[data-map-label]")?.value || ""}`.trim().slice(0, 60);
      const valueLabelsRaw = row.querySelector("input[data-map-values]")?.value || "";
      const parsed = parseValueLabelsInput(valueLabelsRaw);
      return {
        sourceKey,
        label: labelRaw || formatSlideshowFieldLabel(sourceKey),
        enabled: Boolean(row.querySelector("input[data-map-enabled]")?.checked),
        valueLabels: parsed
      };
    })
    .filter(Boolean);
  slideshowDisplayFieldCatalog = sanitizeSlideshowDisplayFieldCatalog(selected);
  slideshowFieldMapDraftRows = sanitizeSlideshowDisplayFieldCatalog(slideshowDisplayFieldCatalog).map((entry) => ({
    sourceKey: entry.sourceKey,
    label: entry.label,
    enabled: entry.enabled !== false,
    valueLabels: sanitizeSlideshowValueLabels(entry.valueLabels || {})
  }));
  const priorSelection = getSelectedSlideshowDisplayFields();
  renderSlideshowDisplayFieldSelectors(priorSelection, buildSlideshowDisplayFieldOptions(slideshowDisplayFieldCatalog));
  renderCustomFilterRuleRows(priorFilterDrafts);
  if (els.slideshowFieldMapDialog?.open) {
    els.slideshowFieldMapDialog.close();
  }
  toast("Field table applied. Save / Apply Settings to persist.");
}

function syncSlideshowFieldMapSelectionFromUi() {
  if (!els.slideshowFieldMapList) {
    return;
  }
  const selected = Array.from(els.slideshowFieldMapList.querySelectorAll(".map-row"))
    .map((row) => {
      const sourceKey = sanitizeAsmFieldName(row.querySelector("input[data-map-source]")?.value || "");
      if (!sourceKey) {
        return null;
      }
      const labelRaw = `${row.querySelector("input[data-map-label]")?.value || ""}`.trim().slice(0, 60);
      const valueLabelsRaw = row.querySelector("input[data-map-values]")?.value || "";
      const valueLabels = parseValueLabelsInput(valueLabelsRaw);
      return {
        sourceKey,
        label: labelRaw || formatSlideshowFieldLabel(sourceKey),
        enabled: Boolean(row.querySelector("input[data-map-enabled]")?.checked),
        valueLabels
      };
    })
    .filter(Boolean);
  slideshowDisplayFieldCatalog = sanitizeSlideshowDisplayFieldCatalog(selected);
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
  const [data, explicitData] = await Promise.all([
    api("/api/admin/queue"),
    api("/api/admin/explicit").catch(() => ({ explicitFilter: false }))
  ]);
  const items = data.queue || [];
  const explicitFilterOn = Boolean(explicitData.explicitFilter);
  const hydration = data.metadataHydration || null;

  const baseCountLabel = `${items.length} track${items.length !== 1 ? "s" : ""}`;
  if (hydration && Number(hydration.total || 0) > 0) {
    const hydrated = Number(hydration.hydrated || 0);
    const total = Number(hydration.total || 0);
    const percent = Number(hydration.percent || 0);
    const pending = Number(hydration.pending || 0);
    const activePending = Number(hydration.activePending || 0);
    const backoffPending = Number(hydration.backoffPending || 0);
    const exhausted = Number(hydration.exhausted || 0);
    let suffix = " • Metadata ready";
    if (pending > 0) {
      suffix = ` • Metadata ${hydrated}/${total} (${percent}%)`;
      if (activePending > 0 || backoffPending > 0) {
        suffix += ` • Fetching ${activePending}`;
        if (backoffPending > 0) {
          suffix += ` • Waiting ${backoffPending}`;
        }
      }
    }
    if (exhausted > 0) {
      suffix += ` • Unavailable ${exhausted}`;
    }
    els.queueCount.textContent = `${baseCountLabel}${suffix}`;
  } else {
    els.queueCount.textContent = baseCountLabel;
  }
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
    const needsHydration = queueItemNeedsMetadataHydration(item);
    const isHydrationExhausted = item.metadataHydrationExhausted === true;
    const nextAttemptAt = Number(item.metadataHydrationNextAttemptAt || 0);
    const isBackoff = needsHydration && nextAttemptAt > Date.now();

    let byline = [item.artists, item.album].filter(Boolean).join(" • ");
    if (!byline && needsHydration) {
      byline = "Metadata pending...";
    } else if (!byline && isHydrationExhausted) {
      byline = "Metadata unavailable";
    } else if (!byline) {
      byline = "Unknown artist";
    }

    const metadataStatusTag = isHydrationExhausted
      ? '<span class="req-tag held">Metadata unavailable</span>'
      : (needsHydration
        ? `<span class="req-tag">${isBackoff ? "Metadata retrying" : "Metadata fetching"}</span>`
        : "");

    const isHeld = item.explicit && !item.explicitApproved && explicitFilterOn;
    const explicitTag = item.explicit
      ? `<span class="req-tag${isHeld ? " held" : ""}">[E]</span>`
      : "";
    const reqTag = item.requestedBy
      ? `<span class="req-tag">• Added by ${escapeHtml(item.requestedBy)}</span>`
      : "";
    const allowBtn = isHeld
      ? `<button class="q-btn allow-explicit" data-action="allow" title="Bypass explicit filter for this song" aria-label="Bypass explicit filter">&#x2713;</button>`
      : "";
    li.innerHTML = `
      <span class="q-num">${idx + 1}</span>
      <div class="q-info">
        <div class="q-title">${escapeHtml(item.name)} ${explicitTag}</div>
        <div class="q-meta">${escapeHtml(byline)} ${metadataStatusTag}${reqTag}${isHeld ? '<span class="req-tag held">⏸ Held — explicit filter on</span>' : ""}</div>
      </div>
      <div class="q-btns">
        ${allowBtn}
        <button class="q-btn" data-action="top" title="Move to top" aria-label="Move to top" ${idx === 0 || item.isPlaying ? "disabled" : ""}>⇡</button>
        <button class="q-btn" data-action="up" title="Move up" ${idx === 0 || item.isPlaying ? "disabled" : ""}>↑</button>
        <button class="q-btn" data-action="dn" title="Move down" ${idx === items.length - 1 || item.isPlaying ? "disabled" : ""}>↓</button>
        <button class="q-btn danger" data-action="rm" title="Remove">✕</button>
      </div>
    `;
    li.querySelector('[data-action="top"]').addEventListener("click", () => moveTrack(item.id, "top"));
    li.querySelector('[data-action="up"]').addEventListener("click", () => moveTrack(item.id, "up"));
    li.querySelector('[data-action="dn"]').addEventListener("click", () => moveTrack(item.id, "down"));
    li.querySelector('[data-action="rm"]').addEventListener("click", () => removeTrack(item.id));
    if (isHeld) {
      li.querySelector('[data-action="allow"]').addEventListener("click", () => approveExplicit(item.id));
    }
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

async function removeTrack(id) {
  try {
    await api(`/api/admin/queue/${id}`, { method: "DELETE" });
    await loadQueue();
  } catch (e) { toast(e.message, true); }
}

async function approveExplicit(id) {
  try {
    await api("/api/admin/queue/approve-explicit", {
      method: "POST",
      body: JSON.stringify({ id })
    });
    toast("Explicit bypass approved for this song.");
    await loadQueue();
  } catch (e) { toast(e.message, true); }
}

async function moveTrack(id, direction) {
  try {
    await api("/api/admin/queue/move", {
      method: "POST",
      body: JSON.stringify({ id, direction })
    });
    await loadQueue();
  } catch (e) { toast(e.message, true); }
}

// ── Polling loops ──────────────────────────────────────────────────────────────

function stopPolling() {
  if (playbackTimer) window.clearInterval(playbackTimer);
  if (queueTimer) window.clearInterval(queueTimer);
  if (settingsSyncTimer) window.clearInterval(settingsSyncTimer);
}

async function initializeApp() {
  const startupTasks = [
    ["playback", loadPlayback],
    ["modes", loadModes],
    ["queue", loadQueue],
    ["account", loadAccountSettings],
    ["explicit", loadExplicit],
    ["audio-jack", loadAudioJackSettings],
    ["audio-jack-routing", loadAudioJackRoutingSettings],
    ["audio-automation", loadAudioAutomationSettings],
    ["system", loadSystemSettings],
    ["playlists", loadPlaylists],
    ["staff", loadStaffSettings],
    ["request-stats", loadAdminRequestStats],
    ["spotify", async () => { await Promise.all([loadJukeboxSpotifyStatus(), loadSpotifySettings()]); }],
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
  settingsSyncTimer = window.setInterval(async () => {
    try {
      await Promise.all([
        loadAudioJackSettings(),
        loadAudioAutomationSettings()
      ]);
    } catch {}
  }, 10000);
}

function setSettingsTab(name) {
  settingsTab = ["account", "request", "clock", "audio-jack", "email", "spotify", "asm"].includes(name) ? name : "request";
  els.tabAccount?.classList.toggle("active", settingsTab === "account");
  els.tabRequestAccess?.classList.toggle("active", settingsTab === "request");
  els.tabClock?.classList.toggle("active", settingsTab === "clock");
  els.tabAudioJack?.classList.toggle("active", settingsTab === "audio-jack");
  els.tabEmail?.classList.toggle("active", settingsTab === "email");
  els.tabSpotify?.classList.toggle("active", settingsTab === "spotify");
  els.tabAsm?.classList.toggle("active", settingsTab === "asm");
  els.panelAccount?.classList.toggle("active", settingsTab === "account");
  els.panelRequestAccess?.classList.toggle("active", settingsTab === "request");
  els.panelClock?.classList.toggle("active", settingsTab === "clock");
  els.panelAudioJack?.classList.toggle("active", settingsTab === "audio-jack");
  els.panelEmail?.classList.toggle("active", settingsTab === "email");
  els.panelSpotify?.classList.toggle("active", settingsTab === "spotify");
  els.panelAsm?.classList.toggle("active", settingsTab === "asm");
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

async function loadSystemSettings() {
  if (!els.systemTimezoneInput) return;
  try {
    const data = await api("/api/admin/settings/system");
    els.systemTimezoneInput.value = data.serverTimezone || "";
    if (els.systemClockPills) {
      els.systemClockPills.innerHTML = [
        data.serverTimezone,
        data.serverDate,
        data.serverTime
      ].filter(Boolean).map((item) => `<span class="pill">${escapeHtml(item)}</span>`).join("");
    }
    if (els.systemClockStatusText) {
      els.systemClockStatusText.textContent = "Controls the timezone used by all server-side schedulers (audio automation, daily request windows, custom slide scheduling).";
    }
    await loadSmtpSettings();
  } catch (e) {
    if (els.systemClockStatusText) els.systemClockStatusText.textContent = e.message;
  }
}

function setSmtpStatusText(message, isError = false) {
  if (!els.smtpStatusText) return;
  els.smtpStatusText.textContent = message;
  els.smtpStatusText.style.color = isError ? "var(--danger, #e54444)" : "";
}

async function loadSmtpSettings() {
  if (!els.smtpHostInput) return;
  try {
    const data = await api("/api/admin/settings/email");
    const smtp = data.smtp || {};
    els.smtpHostInput.value = smtp.host || "";
    els.smtpPortInput.value = `${Number(smtp.port || 587)}`;
    els.smtpFromInput.value = smtp.from || "";
    els.smtpReplyToInput.value = smtp.replyTo || "";
    els.smtpUserInput.value = smtp.authUser || "";
    if (els.smtpPassInput) els.smtpPassInput.value = "";
    els.smtpSecureToggle.checked = Boolean(smtp.secure);
    els.smtpRequireTlsToggle.checked = Boolean(smtp.requireTls);
    els.smtpPoolToggle.checked = smtp.pool !== false;

    if (els.smtpStatusPills) {
      els.smtpStatusPills.innerHTML = [
        smtp.configured ? "Configured" : "Not Configured",
        smtp.authConfigured ? `Auth ${smtp.authUser || "enabled"}` : "Auth optional",
        smtp.host ? `${smtp.host}:${smtp.port}` : "Host missing",
        smtp.secure ? "Secure SMTP" : "Plain/STARTTLS"
      ].filter(Boolean).map((item) => `<span class="pill">${escapeHtml(item)}</span>`).join("");
    }
    setSmtpStatusText("Shared SMTP transport for invites, reports, and system alerts.");
  } catch (e) {
    setSmtpStatusText(e.message, true);
  }
}

function buildSmtpPayload({ verifyNow = false } = {}) {
  const passwordValue = `${els.smtpPassInput?.value || ""}`;
  const payload = {
    host: `${els.smtpHostInput?.value || ""}`.trim(),
    port: Math.max(1, Number(els.smtpPortInput?.value || 587)),
    from: `${els.smtpFromInput?.value || ""}`.trim(),
    replyTo: `${els.smtpReplyToInput?.value || ""}`.trim(),
    user: `${els.smtpUserInput?.value || ""}`.trim(),
    secure: Boolean(els.smtpSecureToggle?.checked),
    requireTls: Boolean(els.smtpRequireTlsToggle?.checked),
    pool: els.smtpPoolToggle?.checked !== false,
    verifyNow
  };
  if (passwordValue) {
    payload.pass = passwordValue;
  }
  return payload;
}

async function saveSmtpSettings({ verifyNow = false } = {}) {
  if (!els.smtpHostInput) return;
  const payload = buildSmtpPayload({ verifyNow });
  await api("/api/admin/settings/email", {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
  if (els.smtpPassInput) {
    els.smtpPassInput.value = "";
  }
  await loadSmtpSettings();
}

async function verifySmtpSettings() {
  await api("/api/admin/settings/email/verify", {
    method: "POST"
  });
}

async function sendSmtpTestEmail() {
  const to = `${els.smtpTestToInput?.value || ""}`.trim();
  if (!to) {
    throw new Error("Enter a test recipient email first.");
  }
  await api("/api/admin/settings/email/test", {
    method: "POST",
    body: JSON.stringify({ to })
  });
}

async function saveSystemTimezone() {
  const tz = `${els.systemTimezoneInput?.value || ""}`.trim();
  if (!tz) throw new Error("Enter an IANA timezone (e.g. America/Chicago).");
  const data = await api("/api/admin/settings/system", {
    method: "PATCH",
    body: JSON.stringify({ serverTimezone: tz })
  });
  if (els.systemClockPills) {
    els.systemClockPills.innerHTML = [
      data.serverTimezone,
      data.serverDate,
      data.serverTime
    ].filter(Boolean).map((item) => `<span class="pill">${escapeHtml(item)}</span>`).join("");
  }
  toast(`Timezone set to ${data.serverTimezone}`);
}

async function loadAudioJackRoutingSettings(selectedCard = "") {
  if (!els.audioJackCardSelect || !els.audioJackControlSelect) return;
  try {
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
    } else if (controls.length) {
      els.audioJackControlSelect.value = controls[0];
    }

    if (els.audioJackStatusText) {
      els.audioJackStatusText.textContent = `AUX routing active: card ${activeCard}, control ${activeControl || "unknown"}`;
    }
  } catch (e) {
    if (els.audioJackStatusText) {
      els.audioJackStatusText.textContent = `AUX routing load failed: ${e.message}`;
    }
  }
}

async function saveAudioJackRoutingSettings() {
  if (!els.audioJackCardSelect || !els.audioJackControlSelect) return;
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
  if (els.audioJackStatusText) {
    els.audioJackStatusText.textContent = `AUX routing applied: card ${data.card}, control ${data.control}`;
  }
}

async function saveAudioJackSettings() {
  const requestSequence = ++audioJackSaveSequence;
  const payload = {
    volume: Number(els.audioJackVolumeInput.value || 0),
    muted: getAudioJackMutedFromUi()
  };
  const data = await api("/api/admin/settings/audio-jack", {
    method: "POST",
    body: JSON.stringify(payload)
  });
  if (requestSequence !== audioJackSaveSequence) {
    return data;
  }
  const volume = Number(data.volume || 0);
  els.audioJackVolumeInput.value = `${volume}`;
  els.audioJackVolumeValue.textContent = `${volume}%`;
  setAudioJackMutedToUi(Boolean(data.muted));
  return data;
}

async function loadAudioAutomationSettings() {
  if (!els.audioAutomationStatusText) return;
  try {
    const data = await api("/api/admin/settings/audio-automation");
    audioAutomationSchedules = Array.isArray(data.schedules) ? data.schedules : [];
    renderAudioAutomationList();
    updateAudioAutomationButtons();
    const jackControlSummary = `${data.audioJackCard ?? "?"}:${data.audioJackControl || "unknown"}`;
    els.audioAutomationStatusText.textContent = "";
    els.audioAutomationSummaryPills.innerHTML = [
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

document.getElementById("forgotPasswordBtn")?.addEventListener("click", async () => {
  const email = els.usernameInput?.value.trim();
  const address = email || window.prompt("Enter your email address to receive a password reset link:");
  if (!address) return;
  try {
    const result = await fetch("/api/account/password-reset-request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: address })
    }).then((r) => r.json());
    toast(result.message || "If that account exists, a reset email has been sent.");
  } catch {
    toast("Unable to send reset email. Check server connection.", true);
  }
});

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
    if (els.defaultRequestLimitInput) els.defaultRequestLimitInput.value = `${Number(data.defaults?.requestLimit || 3)}`;
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

    const normalizeGroup = (group) => {
      const normalized = `${group || ""}`.trim().toLowerCase();
      if (normalized === "admins" || normalized === "admin") return "global-admin";
      return normalized;
    };

    const normalizeGroups = (groups) => Array.from(
      new Set((Array.isArray(groups) ? groups : []).map(normalizeGroup).filter(Boolean))
    );

    const groupBadges = (groups) => normalizeGroups(groups)
      .map((g) => `<span class="badge">${escapeHtml(g)}</span>`)
      .join("");

    const renderGroupEditor = (item) => {
      const groups = normalizeGroups(item.groups);
      return STAFF_GROUP_OPTIONS.map((group) => `
        <label class="staff-perm-check">
          <input type="checkbox" data-group-value="${escapeHtml(group.value)}" ${groups.includes(group.value) ? "checked" : ""} />
          ${escapeHtml(group.label)}
        </label>
      `).join("");
    };

    const togglePermEditor = (userId, open) => {
      const editors = document.querySelectorAll(".staff-perm-editor");
      editors.forEach((editor) => { editor.hidden = true; });
      if (!open) return;
      const target = document.getElementById(`staff-perm-editor-${userId}`);
      if (target) target.hidden = false;
    };

    const saveGroups = async (item) => {
      const editor = document.getElementById(`staff-perm-editor-${item.id}`);
      if (!editor) return;
      const groups = Array.from(editor.querySelectorAll("input[data-group-value]:checked"))
        .map((input) => normalizeGroup(input.getAttribute("data-group-value")));
      await api(`/api/admin/account/users/${item.id}/groups`, {
        method: "PATCH",
        body: JSON.stringify({ groups })
      });
    };

    for (const item of staff) {
      const li = document.createElement("li");
      li.className = "req-item";
      const initialsSource = `${item.displayName || item.username || "?"}`.trim();
      const initials = (initialsSource.slice(0, 1) || "?").toUpperCase();
      li.innerHTML = `
        <div class="staff-user-row">
          <div class="staff-avatar">${escapeHtml(initials)}</div>
          <div class="staff-user-meta">
            <div class="staff-user-name">${escapeHtml(item.displayName || `${item.firstName} ${item.lastInitial}.`)}${item.active ? "" : ' <span class="badge">inactive</span>'}</div>
            <div class="staff-user-email">${escapeHtml(item.username || "")}</div>
            <div class="staff-user-groups">${groupBadges(item.groups)}</div>
            <div class="staff-limit-row">
              <span class="meta">Requests today ${Number(item.usedToday || 0)}/${Number(item.requestLimit || 1)}</span>
              <input class="staff-limit-input" data-action="limit" type="number" min="1" step="1" value="${Number(item.requestLimit || 1)}" title="Daily request limit" />
            </div>
            <div class="staff-perm-editor" id="staff-perm-editor-${escapeHtml(item.id)}" hidden>
              <div class="staff-perm-grid">${renderGroupEditor(item)}</div>
              <div class="staff-perm-actions">
                <button class="btn-sm" data-action="save-permissions" type="button">Save Permissions</button>
                <button class="btn-sm" data-action="cancel-permissions" type="button">Cancel</button>
              </div>
            </div>
          </div>
          <div class="staff-actions">
            <button class="btn-sm" data-action="edit-permissions" type="button">Edit Permissions</button>
            <button class="btn-sm" data-action="send-invite" type="button">Send Invite</button>
            <button class="btn-sm" data-action="send-reset" type="button">Email Reset</button>
            <button class="btn-sm" data-action="toggle">${item.active ? "Disable" : "Enable"}</button>
            <button class="btn-sm danger" data-action="delete">Delete</button>
          </div>
        </div>
      `;
      const limitInput = li.querySelector('[data-action="limit"]');
      let lastLimitValue = Number(item.requestLimit || 1);
      let applyingLimit = false;
      const applyLimit = async () => {
        if (!limitInput || applyingLimit) return;
        const nextLimit = Math.max(1, Number(limitInput.value || lastLimitValue || 1));
        limitInput.value = `${nextLimit}`;
        if (nextLimit === lastLimitValue) return;
        applyingLimit = true;
        try {
          await api(`/api/admin/staff/${item.id}`, {
            method: "PATCH",
            body: JSON.stringify({ requestLimit: nextLimit })
          });
          lastLimitValue = nextLimit;
          await loadStaffSettings();
          toast("User limit updated");
        } catch (e) {
          toast(e.message, true);
          limitInput.value = `${lastLimitValue}`;
        } finally {
          applyingLimit = false;
        }
      };
      limitInput.addEventListener("change", applyLimit);
      limitInput.addEventListener("blur", applyLimit);
      limitInput.addEventListener("keydown", async (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          await applyLimit();
        }
      });
      li.querySelector('[data-action="edit-permissions"]')?.addEventListener("click", () => {
        togglePermEditor(item.id, true);
      });
      li.querySelector('[data-action="cancel-permissions"]')?.addEventListener("click", () => {
        togglePermEditor(item.id, false);
      });
      li.querySelector('[data-action="save-permissions"]')?.addEventListener("click", async () => {
        try {
          await saveGroups(item);
          await loadStaffSettings();
          toast("User permissions updated");
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
      li.querySelector('[data-action="send-invite"]').addEventListener("click", async () => {
        try {
          await api(`/api/admin/account/users/${item.id}/send-invite`, {
            method: "POST"
          });
          toast("Invite email sent");
        } catch (e) {
          toast(e.message, true);
        }
      });
      li.querySelector('[data-action="send-reset"]').addEventListener("click", async () => {
        try {
          await api(`/api/admin/account/users/${item.id}/send-password-reset`, {
            method: "POST"
          });
          toast("Password reset email sent");
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
  const displayName = els.staffDisplayNameInput?.value.trim() || "";
  const username = els.staffUsernameInput?.value.trim() || "";
  const requestLimit = Math.max(1, Number(els.staffLimitInput.value || 5));
  const groups = [];
  if (els.staffGroupUser?.checked) groups.push("user");
  if (els.staffGroupJukeboxAdmin?.checked) groups.push("jukebox-admin");
  if (els.staffGroupReporting?.checked) groups.push("reporting");
  if (els.staffGroupSuperadmin?.checked) groups.push("superadmin");
  if (els.staffGroupGlobalAdmin?.checked) groups.push("global-admin");

  const result = await api("/api/admin/staff", {
    method: "POST",
    body: JSON.stringify({ displayName: displayName || username, username, requestLimit, groups, sendInvite: true })
  });

  if (els.staffDisplayNameInput) els.staffDisplayNameInput.value = "";
  if (els.staffUsernameInput) els.staffUsernameInput.value = "";
  els.staffLimitInput.value = "";
  if (els.staffGroupUser) els.staffGroupUser.checked = true;
  if (els.staffGroupJukeboxAdmin) els.staffGroupJukeboxAdmin.checked = false;
  if (els.staffGroupReporting) els.staffGroupReporting.checked = false;
  if (els.staffGroupSuperadmin) els.staffGroupSuperadmin.checked = false;
  if (els.staffGroupGlobalAdmin) els.staffGroupGlobalAdmin.checked = false;
  return result;
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

// ── Jukebox Spotify Web API status ──────────────────────────────────────────
async function loadJukeboxSpotifyStatus() {
  if (!els.jukeboxSpotifyStatusText) return;
  try {
    const data = await api("/api/auth/status");
    els.jukeboxSpotifyStatusText.textContent = data.connected
      ? "Connected — OAuth token is active and will auto-refresh."
      : "Not connected. Use Connect / Reconnect to complete OAuth login.";
  } catch (e) {
    els.jukeboxSpotifyStatusText.textContent = `Unable to read status: ${e.message}`;
  }
}

// ── Mopidy-Spotify plugin settings ───────────────────────────────────────────
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
    if (els.asmAnimalControlReportTitleInput) {
      els.asmAnimalControlReportTitleInput.value = data.animalControlReportTitle || "";
    }
    els.asmCacheSecondsInput.value = `${data.cacheSeconds || 600}`;
    const show = data.slideshow || {};
    els.slideshowIntervalInput.value = `${show.intervalSeconds || 12}`;
    els.slideshowLimitInput.value = `${show.defaultLimit || 20}`;
    els.slideshowAudioEnabledToggle.checked = Boolean(show.audioEnabled);
    els.slideshowAudioAutoplayToggle.checked = Boolean(show.audioAutoplay);
    if (els.slideshowExcludeFeralToggle) {
      els.slideshowExcludeFeralToggle.checked = show.excludeFeral !== false;
    }
    if (els.slideshowCustomFiltersEnabledToggle) {
      els.slideshowCustomFiltersEnabledToggle.checked = Boolean(show.customFiltersEnabled);
    }
    slideshowCustomFilterRules = sanitizeCustomFilterRules(show.customFilterRules || []);
    renderCustomFilterRuleRows(slideshowCustomFilterRules);
    if (els.adoptablesPerSpecialInput) {
      els.adoptablesPerSpecialInput.value = `${Math.max(1, Number(show.adoptablesPerSpecial || 3))}`;
    }
    if (els.alertEveryXSlidesInput) {
      els.alertEveryXSlidesInput.value = `${Math.max(2, Number(show.alertEveryXSlides || 6))}`;
    }
    if (els.specialImageMaxMbInput) {
      els.specialImageMaxMbInput.value = `${Math.max(1, Number(show.specialImageMaxMb || 4))}`;
    }
    const panZoom = show.panZoom || {};
    if (els.panZoomSpeedSecondsInput) {
      els.panZoomSpeedSecondsInput.value = `${Math.max(4, Number(panZoom.speedSeconds || 12))}`;
    }
    if (els.panZoomStartPercentInput) {
      els.panZoomStartPercentInput.value = `${Math.max(80, Number(panZoom.startPercent || 105))}`;
    }
    if (els.panZoomEndPercentInput) {
      els.panZoomEndPercentInput.value = `${Math.max(80, Number(panZoom.endPercent || 112))}`;
    }
    if (els.photoFitModeInput) {
      els.photoFitModeInput.value = show.photoFit === "contain" ? "contain" : "cover";
    }
    updateSpecialImageStorageText(show.specialImageStorage || null);
    specialPages = Array.isArray(show.specialPages) ? show.specialPages : [];
    renderSpecialPagesList();
    updateSpecialPageImageButtons();
    slideshowDisplayFieldCatalog = sanitizeSlideshowDisplayFieldCatalog(show.displayFieldCatalog || []);
    asmKnownFieldNames = sanitizeAsmFieldNameList(data.fieldNames || [], 120);
    asmFieldTypes = sanitizeAsmFieldTypeMap(data.fieldTypes || {});

    // Load emoji shower settings
    const emojiShower = show.emojiShower || {};
    if (els.emojiShowerEnabledToggle) {
      els.emojiShowerEnabledToggle.checked = emojiShower.enabled !== false;
    }
    if (els.emojiShowerFrequencyInput) {
      els.emojiShowerFrequencyInput.value = `${Math.max(1, Number(emojiShower.frequency || 3))}`;
    }
    if (els.emojiShowerDurationInput) {
      els.emojiShowerDurationInput.value = `${Math.max(500, Number(emojiShower.duration || 3000))}`;
    }
    if (els.emojiShowerIntensityInput) {
      els.emojiShowerIntensityInput.value = `${Math.max(1, Number(emojiShower.intensity || 15))}`;
    }
    if (els.emojiShowerChoiceCheckboxes && Array.isArray(emojiShower.emojis)) {
      els.emojiShowerChoiceCheckboxes.forEach((checkbox) => {
        checkbox.checked = emojiShower.emojis.includes(checkbox.value);
      });
    }

    renderSlideshowFieldMapDialogList();
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
    renderCustomFilterRuleRows(slideshowCustomFilterRules);
    els.asmBodyPreview.textContent = data.bodyPreview || "No response preview available.";
    els.asmFirstItem.textContent = "Use Inspect Response to fetch a live sample item.";
  } catch (e) {
    els.asmStatusText.textContent = e.message;
  }
}

async function saveAsmSettings() {
  slideshowCustomFilterRules = collectCustomFilterRulesFromUi();
  syncSlideshowFieldMapSelectionFromUi();
  
  // Collect emoji shower settings
  const selectedEmojis = Array.from(els.emojiShowerChoiceCheckboxes || [])
    .filter((cb) => cb.checked)
    .map((cb) => cb.value);

  const payload = {
    serviceUrl: els.asmServiceUrlInput.value.trim(),
    account: els.asmAccountInput.value.trim(),
    apiKey: els.asmApiKeyInput.value.trim(),
    username: els.asmUsernameInput.value.trim(),
    password: els.asmPasswordInput.value.trim(),
    adoptableMethod: els.asmMethodInput.value.trim(),
    animalControlReportTitle: els.asmAnimalControlReportTitleInput?.value.trim() || "",
    cacheSeconds: Number(els.asmCacheSecondsInput.value || 600),
    intervalSeconds: Number(els.slideshowIntervalInput.value || 12),
    defaultLimit: Number(els.slideshowLimitInput.value || 20),
    audioEnabled: Boolean(els.slideshowAudioEnabledToggle.checked),
    audioAutoplay: Boolean(els.slideshowAudioAutoplayToggle.checked),
    excludeFeral: els.slideshowExcludeFeralToggle ? Boolean(els.slideshowExcludeFeralToggle.checked) : true,
    customFiltersEnabled: Boolean(els.slideshowCustomFiltersEnabledToggle?.checked),
    customFilterRules: sanitizeCustomFilterRules(slideshowCustomFilterRules),
    displayFieldCatalog: sanitizeSlideshowDisplayFieldCatalog(slideshowDisplayFieldCatalog),
    displayFields: getSelectedSlideshowDisplayFields(),
    adoptablesPerSpecial: Number(els.adoptablesPerSpecialInput?.value || 3),
    alertEveryXSlidesInput: Number(els.alertEveryXSlidesInput?.value || 6),
    specialImageMaxMb: Number(els.specialImageMaxMbInput?.value || 4),
    panZoomSpeedSeconds: Number(els.panZoomSpeedSecondsInput?.value || 12),
    panZoomStartPercent: Number(els.panZoomStartPercentInput?.value || 105),
    panZoomEndPercent: Number(els.panZoomEndPercentInput?.value || 112),
    photoFit: els.photoFitModeInput?.value === "contain" ? "contain" : "cover",
    emojiShowerEnabled: Boolean(els.emojiShowerEnabledToggle?.checked),
    emojiShowerFrequency: Number(els.emojiShowerFrequencyInput?.value || 3),
    emojiShowerDuration: Number(els.emojiShowerDurationInput?.value || 3000),
    emojiShowerIntensity: Number(els.emojiShowerIntensityInput?.value || 15),
    emojiShowerEmojis: selectedEmojis,
    customFilters: []
  };
  await api("/api/admin/settings/asm", {
    method: "POST",
    body: JSON.stringify(payload)
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
  asmFieldTypes = sanitizeAsmFieldTypeMap(data.fieldTypes || {});
  renderSlideshowFieldMapDialogList();
  els.asmBodyPreview.textContent = data.bodyPreview || "No response body preview available.";
  els.asmFirstItem.textContent = data.firstItem
    ? JSON.stringify(data.firstItem, null, 2)
    : "No sample item returned.";
}

// ── Playlists ─────────────────────────────────────────────────────────────────
function ensurePlaylistEditorDialog() {
  if (els.playlistEditorDialog) return;
  const dialog = document.createElement("dialog");
  dialog.id = "playlistEditorDialog";
  dialog.className = "map-dialog playlist-editor-dialog";
  dialog.innerHTML = `
    <form method="dialog" class="map-dialog-form playlist-editor-form">
      <div class="map-dialog-head">
        <h3 id="playlistEditorTitle">Edit Playlist</h3>
        <button id="playlistEditorCloseBtn" class="btn-sm" type="button">Close</button>
      </div>
      <p id="playlistEditorStatus" class="setting-desc">Loading playlist...</p>
      <div class="setting-row stack playlist-editor-name-row">
        <div class="setting-name">Playlist Name</div>
        <input id="playlistEditorNameInput" type="text" maxlength="120" placeholder="Playlist name" />
      </div>
      <div class="setting-row stack playlist-editor-tracks-row">
        <div class="setting-name">Tracks</div>
        <div id="playlistEditorCount" class="setting-desc">0 tracks</div>
        <ul id="playlistEditorTracks" class="req-list playlist-editor-tracks"></ul>
      </div>
      <div class="setting-form-actions playlist-editor-actions">
        <button id="playlistEditorDeleteBtn" class="btn-sm danger" type="button">Delete Playlist</button>
        <div class="playlist-editor-actions-right">
          <button id="playlistEditorSaveBtn" class="btn-sm" type="button">Save Changes</button>
        </div>
      </div>
    </form>
  `;
  document.body.append(dialog);
  els.playlistEditorDialog = document.getElementById("playlistEditorDialog");
  els.playlistEditorTitle = document.getElementById("playlistEditorTitle");
  els.playlistEditorStatus = document.getElementById("playlistEditorStatus");
  els.playlistEditorNameInput = document.getElementById("playlistEditorNameInput");
  els.playlistEditorCount = document.getElementById("playlistEditorCount");
  els.playlistEditorTracks = document.getElementById("playlistEditorTracks");
  els.playlistEditorCloseBtn = document.getElementById("playlistEditorCloseBtn");
  els.playlistEditorSaveBtn = document.getElementById("playlistEditorSaveBtn");
  els.playlistEditorDeleteBtn = document.getElementById("playlistEditorDeleteBtn");

  els.playlistEditorCloseBtn?.addEventListener("click", () => els.playlistEditorDialog?.close());
  els.playlistEditorSaveBtn?.addEventListener("click", savePlaylistEditorChanges);
  els.playlistEditorDeleteBtn?.addEventListener("click", deletePlaylistFromEditor);
}

function renderPlaylistEditorTracks() {
  if (!els.playlistEditorTracks || !els.playlistEditorCount) return;
  els.playlistEditorTracks.innerHTML = "";
  if (!playlistEditorState.tracks.length) {
    const li = document.createElement("li");
    li.className = "req-item empty playlist-editor-track-empty";
    li.textContent = "No tracks remain in this playlist.";
    els.playlistEditorTracks.append(li);
    els.playlistEditorCount.textContent = "0 tracks";
    return;
  }
  playlistEditorState.tracks.forEach((track, displayIndex) => {
    const li = document.createElement("li");
    li.className = "req-item playlist-editor-track";
    const artistText = Array.isArray(track.artists) && track.artists.length ? track.artists.join(", ") : "Unknown artist";
    li.innerHTML = `
      <div class="playlist-editor-track-main">
        <span class="playlist-editor-track-name">${escapeHtml(`${displayIndex + 1}. ${track.name || "Unknown track"}`)}</span>
        <span class="playlist-editor-track-meta">${escapeHtml(artistText)}</span>
      </div>
      <button class="q-btn danger" data-action="remove" type="button">✕</button>
    `;
    li.querySelector('[data-action="remove"]')?.addEventListener("click", () => {
      playlistEditorState.tracks.splice(displayIndex, 1);
      renderPlaylistEditorTracks();
    });
    els.playlistEditorTracks.append(li);
  });
  const count = playlistEditorState.tracks.length;
  els.playlistEditorCount.textContent = `${count} track${count === 1 ? "" : "s"}`;
}

async function openPlaylistEditor(uri) {
  ensurePlaylistEditorDialog();
  playlistEditorState.uri = `${uri || ""}`.trim();
  if (!playlistEditorState.uri) {
    toast("Playlist URI is missing.", true);
    return;
  }
  if (els.playlistEditorStatus) els.playlistEditorStatus.textContent = "Loading playlist details...";
  if (els.playlistEditorTracks) els.playlistEditorTracks.innerHTML = "";
  if (els.playlistEditorNameInput) els.playlistEditorNameInput.value = "";
  if (typeof els.playlistEditorDialog?.showModal === "function") {
    els.playlistEditorDialog.showModal();
  }
  try {
    const data = await api(`/api/admin/playlists/details?uri=${encodeURIComponent(playlistEditorState.uri)}`);
    playlistEditorState.name = `${data.playlist?.name || ""}`.trim() || "Untitled Playlist";
    playlistEditorState.tracks = (data.tracks || []).map((track) => ({
      ...track,
      originalIndex: Number(track.index)
    }));
    if (els.playlistEditorTitle) {
      els.playlistEditorTitle.textContent = `Edit Playlist: ${playlistEditorState.name}`;
    }
    if (els.playlistEditorStatus) {
      els.playlistEditorStatus.textContent = "Remove tracks, rename the playlist, then click Save Changes.";
    }
    if (els.playlistEditorNameInput) {
      els.playlistEditorNameInput.value = playlistEditorState.name;
    }
    renderPlaylistEditorTracks();
  } catch (error) {
    if (els.playlistEditorStatus) {
      els.playlistEditorStatus.textContent = error.message;
    }
    toast(error.message, true);
  }
}

async function savePlaylistEditorChanges() {
  if (!playlistEditorState.uri) return;
  const name = (els.playlistEditorNameInput?.value || "").trim();
  if (!name) {
    toast("Playlist name cannot be empty.", true);
    return;
  }
  const keepIndexes = playlistEditorState.tracks
    .map((track) => Number(track.originalIndex))
    .filter((index) => Number.isInteger(index) && index >= 0);
  try {
    const result = await api("/api/admin/playlists/update", {
      method: "POST",
      body: JSON.stringify({
        uri: playlistEditorState.uri,
        name,
        keepIndexes
      })
    });
    toast(`Saved playlist (${result.trackCount} tracks)`);
    els.playlistEditorDialog?.close();
    await loadPlaylists();
  } catch (error) {
    toast(error.message, true);
  }
}

async function deletePlaylistFromEditor() {
  if (!playlistEditorState.uri) return;
  const targetName = (els.playlistEditorNameInput?.value || playlistEditorState.name || "this playlist").trim();
  if (!window.confirm(`Delete ${targetName}? This cannot be undone.`)) {
    return;
  }
  try {
    await api(`/api/admin/playlists?uri=${encodeURIComponent(playlistEditorState.uri)}`, { method: "DELETE" });
    toast("Playlist deleted");
    els.playlistEditorDialog?.close();
    await loadPlaylists();
  } catch (error) {
    toast(error.message, true);
  }
}

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
          <button class="q-btn" data-action="edit" title="Edit saved playlist" aria-label="Edit playlist">✎</button>
          <button class="q-btn" data-action="add" title="Add to end of queue" aria-label="Add playlist to queue">+</button>
          <button class="q-btn danger" data-action="delete" title="Delete saved playlist" aria-label="Delete playlist">✕</button>
        </div>
      `;
      li.querySelector('[data-action="add"]').addEventListener("click", () => loadPlaylist(pl.uri, false));
      li.querySelector('[data-action="edit"]').addEventListener("click", () => openPlaylistEditor(pl.uri));
      li.querySelector('[data-action="delete"]').addEventListener("click", () => deletePlaylist(pl.uri, pl.name || pl.uri));
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

function ensurePlaylistLoadOverlay() {
  let overlay = document.getElementById("playlistLoadOverlay");
  if (overlay) return overlay;

  overlay = document.createElement("div");
  overlay.id = "playlistLoadOverlay";
  overlay.setAttribute("role", "status");
  overlay.setAttribute("aria-live", "assertive");
  overlay.style.position = "fixed";
  overlay.style.inset = "0";
  overlay.style.zIndex = "99999";
  overlay.style.display = "grid";
  overlay.style.placeItems = "center";
  overlay.style.background = "rgba(6, 10, 16, 0.72)";
  overlay.style.backdropFilter = "blur(3px)";
  overlay.style.visibility = "hidden";
  overlay.style.pointerEvents = "none";
  overlay.innerHTML = `
    <div style="width:min(420px,90vw);border-radius:12px;border:1px solid rgba(255,255,255,0.16);background:rgba(16,24,36,0.96);box-shadow:0 20px 50px rgba(0,0,0,0.45);padding:1rem 1.1rem;display:grid;gap:0.7rem;">
      <div style="display:flex;align-items:center;gap:0.7rem;">
        <span aria-hidden="true" style="width:24px;height:24px;border-radius:999px;border:3px solid rgba(245,166,35,0.24);border-top-color:#f5a623;animation:playlistLoadSpin .8s linear infinite;"></span>
        <strong style="font:700 1rem/1.2 'Sora',sans-serif;color:#fff;">Queueing Playlist</strong>
      </div>
      <p id="playlistLoadOverlayMessage" style="margin:0;color:#d6e2ed;font:500 0.92rem/1.35 'Outfit',sans-serif;">Adding songs to the queue. Please wait…</p>
    </div>
  `;

  const styleEl = document.createElement("style");
  styleEl.id = "playlistLoadOverlayStyle";
  styleEl.textContent = "@keyframes playlistLoadSpin { to { transform: rotate(360deg); } }";
  document.head.appendChild(styleEl);
  document.body.appendChild(overlay);
  return overlay;
}

function setPlaylistLoadBusy(isBusy, message = "") {
  const overlay = ensurePlaylistLoadOverlay();
  const messageEl = document.getElementById("playlistLoadOverlayMessage");
  if (messageEl) {
    messageEl.textContent = message || "Adding songs to the queue. Please wait…";
  }
  overlay.style.visibility = isBusy ? "visible" : "hidden";
  overlay.style.pointerEvents = isBusy ? "auto" : "none";
  if (isBusy) {
    document.body.setAttribute("aria-busy", "true");
  } else {
    document.body.removeAttribute("aria-busy");
  }
}

async function loadPlaylist(uri, replace) {
  if (playlistLoadBusy) {
    toast("Playlist load already in progress. Please wait.");
    return;
  }

  const queueButtons = document.querySelectorAll("#playlistList button, #queueList button, #randomBtn, #shuffleBtn, #clearBtn, #savePlaylistBtn, #refreshPlaylistsBtn");
  queueButtons.forEach((btn) => { btn.disabled = true; });
  playlistLoadBusy = true;
  setPlaylistLoadBusy(true, "Adding songs to the queue. Please do not close or refresh this page.");

  const statusTimers = [];
  const setPhase = (text) => setPlaylistLoadBusy(true, text);
  statusTimers.push(window.setTimeout(() => setPhase("Still queueing songs. Large playlists can take a bit."), 2500));
  statusTimers.push(window.setTimeout(() => setPhase("Queue first, metadata fills in shortly after…"), 7000));
  statusTimers.push(window.setTimeout(() => setPhase("Almost done. Refreshing queue view…"), 15000));

  const abortController = new AbortController();
  const timeoutId = window.setTimeout(() => abortController.abort(), PLAYLIST_LOAD_TIMEOUT_MS);
  let uiReleased = false;
  const releaseUiLock = () => {
    if (uiReleased) return;
    uiReleased = true;
    playlistLoadBusy = false;
    setPlaylistLoadBusy(false);
    queueButtons.forEach((btn) => { btn.disabled = false; });
  };

  try {
    const result = await api("/api/admin/playlists/load", {
      method: "POST",
      body: JSON.stringify({ uri, replace }),
      signal: abortController.signal
    });
    // Unlock as soon as queue commit returns; metadata and queue refresh can trail behind.
    releaseUiLock();
    setTimeout(() => {
      loadQueue().catch(() => {});
    }, 0);
    const meta = result?.metadataHydration || null;
    const hydrationSuffix = meta && Number(meta.total || 0) > 0
      ? ` Metadata ${Number(meta.hydrated || 0)}/${Number(meta.total || 0)} ready.`
      : "";
    toast(`Queued ${result.added} track${result.added !== 1 ? "s" : ""}${replace ? " (replaced queue)" : ""}. Metadata continues loading in background.${hydrationSuffix}`);
  } catch (e) {
    const isAbort = e?.name === "AbortError";
    toast(isAbort ? "Queueing timed out. Please retry; metadata can continue loading after songs are queued." : e.message, true);
  } finally {
    window.clearTimeout(timeoutId);
    for (const timer of statusTimers) window.clearTimeout(timer);
    releaseUiLock();
  }
}

async function deletePlaylist(uri, name) {
  const label = `${name || "this playlist"}`.trim();
  if (!window.confirm(`Delete ${label}? This cannot be undone.`)) return;
  try {
    await api(`/api/admin/playlists?uri=${encodeURIComponent(uri)}`, { method: "DELETE" });
    toast("Playlist deleted");
    await loadPlaylists();
  } catch (e) {
    toast(e.message, true);
  }
}

if (els.explicitToggle) {
  els.explicitToggle.addEventListener("click", async () => {
    const newVal = els.explicitToggle.dataset.active !== "true";
    const prevVal = !newVal;
    els.explicitToggle.dataset.active = String(newVal);
    try {
      await saveExplicitSetting();
      toast(`Explicit filter ${newVal ? "enabled" : "disabled"}`);
    } catch (e) {
      els.explicitToggle.dataset.active = String(prevVal);
      toast(e.message, true);
    }
  });
}

els.tabAccount?.addEventListener("click", () => setSettingsTab("account"));
els.tabRequestAccess?.addEventListener("click", () => setSettingsTab("request"));
els.tabAudioJack?.addEventListener("click", () => setSettingsTab("audio-jack"));
els.tabEmail?.addEventListener("click", () => setSettingsTab("email"));
els.tabSpotify?.addEventListener("click", () => setSettingsTab("spotify"));
els.tabAsm?.addEventListener("click", () => setSettingsTab("asm"));
document.querySelectorAll(".settings-tabs").forEach((tabsEl) => {
  tabsEl.addEventListener("click", (event) => {
    const button = event.target.closest(".settings-tab[data-tab]");
    if (!button) return;
    event.preventDefault();
    const nextTab = `${button.getAttribute("data-tab") || ""}`.trim();
    if (!nextTab) return;
    setSettingsTab(nextTab);
  });
});
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
if (els.addCustomFilterRuleBtn) {
  els.addCustomFilterRuleBtn.addEventListener("click", () => {
    const current = collectCustomFilterRuleDraftsFromUi();
    const options = getAsmFieldOptionsForCustomFilters();
    if (!options.length) {
      toast("Run Inspect Response first to load ASM fields.", true);
      return;
    }
    current.push({ sourceKey: options[0].sourceKey, method: "contains", value: "" });
    renderCustomFilterRuleRows(current);
  });
}
if (els.applyCustomFiltersBtn) {
  els.applyCustomFiltersBtn.addEventListener("click", () => {
    slideshowCustomFilterRules = collectCustomFilterRulesFromUi();
    renderCustomFilterRuleRows(slideshowCustomFilterRules);
    toast("Filters staged. Click Save / Apply Settings to persist.");
  });
}
if (els.saveSlideshowFieldMapBtn) {
  els.saveSlideshowFieldMapBtn.addEventListener("click", saveSlideshowFieldMapSelection);
}
if (els.saveEmojiShowerBtn) {
  els.saveEmojiShowerBtn.addEventListener("click", saveAsmSettings);
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

if (els.audioJackVolumeInput && els.audioJackVolumeValue) {
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
}

if (els.audioJackRefreshBtn) {
  els.audioJackRefreshBtn.addEventListener("click", async () => {
    await Promise.all([
      loadAudioJackSettings(),
      loadAudioJackRoutingSettings(els.audioJackCardSelect?.value || "")
    ]);
    toast("Audio jack settings refreshed");
  });
}

if (els.audioJackCardSelect) {
  els.audioJackCardSelect.addEventListener("change", async () => {
    await loadAudioJackRoutingSettings(els.audioJackCardSelect.value || "");
  });
}

if (els.audioJackMutedToggle) {
  els.audioJackMutedToggle.addEventListener("change", async () => {
    try {
      window.clearTimeout(audioJackDebounce);
      await saveAudioJackSettings();
      toast("AUX mute updated");
    } catch (e) { toast(e.message, true); }
  });
}

if (els.audioJackMuteToggleBtn) {
  els.audioJackMuteToggleBtn.addEventListener("click", async () => {
    try {
      window.clearTimeout(audioJackDebounce);
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
      await saveAudioJackRoutingSettings();
      toast("AUX routing applied");
    } catch (e) { toast(e.message, true); }
  });
}

if (els.saveSystemTimezoneBtn) {
  els.saveSystemTimezoneBtn.addEventListener("click", async () => {
    try {
      await saveSystemTimezone();
    } catch (e) { toast(e.message, true); }
  });
}

if (els.refreshSystemClockBtn) {
  els.refreshSystemClockBtn.addEventListener("click", async () => {
    try {
      await loadSystemSettings();
      toast("Server clock refreshed");
    } catch (e) { toast(e.message, true); }
  });
}

if (els.smtpSaveBtn) {
  els.smtpSaveBtn.addEventListener("click", async () => {
    try {
      await saveSmtpSettings({ verifyNow: false });
      toast("SMTP settings saved");
    } catch (e) { toast(e.message, true); }
  });
}

if (els.smtpVerifyBtn) {
  els.smtpVerifyBtn.addEventListener("click", async () => {
    try {
      await verifySmtpSettings();
      toast("SMTP verification passed");
      await loadSmtpSettings();
    } catch (e) { toast(e.message, true); }
  });
}

if (els.smtpSendTestBtn) {
  els.smtpSendTestBtn.addEventListener("click", async () => {
    try {
      await sendSmtpTestEmail();
      toast("SMTP test email sent");
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
      const result = await createStaffAccount();
      await loadStaffSettings();
      toast(result?.invite?.sent ? "User created and invite sent" : "User created (invite not sent)");
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

// Jukebox Web API buttons
if (els.jukeboxSpotifyRefreshBtn) {
  els.jukeboxSpotifyRefreshBtn.addEventListener("click", async () => {
    await loadJukeboxSpotifyStatus();
    toast("Jukebox Spotify status refreshed");
  });
}

if (els.spotifyDisconnectBtn) {
  els.spotifyDisconnectBtn.addEventListener("click", async () => {
    try {
      await api("/api/admin/settings/spotify/disconnect", { method: "POST" });
      toast("Jukebox Spotify session disconnected");
      await loadJukeboxSpotifyStatus();
    } catch (e) {
      toast(e.message, true);
    }
  });
}

if (els.spotifyCycleConnectBtn) {
  els.spotifyCycleConnectBtn.addEventListener("click", async () => {
    try {
      await api("/api/admin/settings/spotify/disconnect", { method: "POST" });
      toast("Disconnected. Opening Spotify login…");
      window.open("/auth/login?return=/admin-system.html", "_blank", "noopener,noreferrer");
      await loadJukeboxSpotifyStatus();
    } catch (e) {
      toast(e.message, true);
    }
  });
}

// Mopidy-Spotify plugin buttons
if (els.spotifyRefreshBtn) {
  els.spotifyRefreshBtn.addEventListener("click", async () => {
    await loadSpotifySettings();
    toast("Mopidy-Spotify status refreshed");
  });
}

if (els.spotifyAuthBtn) {
  els.spotifyAuthBtn.addEventListener("click", () => {
    window.open("https://mopidy.com/ext/spotify/", "_blank", "noopener,noreferrer");
  });
}

if (els.spotifyApplyCredentialsBtn) {
  els.spotifyApplyCredentialsBtn.addEventListener("click", async () => {
    const raw = els.spotifyMopidyCredentialsPasteInput?.value || "";
    const clientIdMatch = raw.match(/client_id\s*=\s*([^\s]+)/);
    const clientSecretMatch = raw.match(/client_secret\s*=\s*([^\s]+)/);
    const clientId = (clientIdMatch?.[1] || "").trim();
    const clientSecret = (clientSecretMatch?.[1] || "").trim();
    if (!clientId || !clientSecret) {
      toast("Could not find client_id and client_secret in pasted text. Paste the full [spotify] block from mopidy.com/ext/spotify.", true);
      return;
    }
    try {
      const result = await api("/api/admin/settings/spotify/mopidy-credentials", {
        method: "POST",
        body: JSON.stringify({ clientId, clientSecret })
      });
      if (els.spotifyMopidyCredentialsPasteInput) els.spotifyMopidyCredentialsPasteInput.value = "";
      toast(result.message || "Mopidy credentials applied and Mopidy restarted.");
      await loadSpotifySettings();
    } catch (e) {
      toast(e.message, true);
    }
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

if (els.spotifyImportBtn) {
  els.spotifyImportBtn.addEventListener("click", async () => {
    const url = els.spotifyImportUrlInput?.value.trim();
    if (!url) { toast("Paste a Spotify playlist share URL first.", true); return; }
    const statusEl = els.spotifyImportStatus;
    function setStatus(msg, isError = false) {
      if (!statusEl) return;
      statusEl.style.display = "";
      statusEl.style.color = isError ? "var(--danger, #e55)" : "var(--muted)";
      statusEl.textContent = msg;
    }
    const phaseTimers = [];
    const clearPhaseTimers = () => {
      for (const timer of phaseTimers) window.clearTimeout(timer);
    };
    const phase = (msg, isError = false) => {
      setStatus(msg, isError);
      toast(msg, isError);
    };

    phase("Import started. Fetching playlist from Spotify…");
    phaseTimers.push(window.setTimeout(() => {
      phase("Still fetching songs from Spotify…");
    }, 1400));
    phaseTimers.push(window.setTimeout(() => {
      phase("Spotify is slow. Trying Mopidy fallback…");
    }, 3600));

    els.spotifyImportBtn.disabled = true;
    try {
      const data = await api("/api/admin/playlists/import-spotify", {
        method: "POST",
        body: JSON.stringify({ url })
      });
      clearPhaseTimers();

      if (data.importSource === "mopidy-fallback") {
        phase("Fetched songs via Mopidy fallback.");
      } else {
        phase("Fetched songs via Spotify API.");
      }

      const saved = data.saved ?? data.tracks?.length ?? 0;
      const total = data.total || saved;
      const summary = `Saved "${data.name}" as a playlist (${saved} track${saved !== 1 ? "s" : ""}${total > saved ? ` — first ${saved} of ${total}` : ""}).`;
      setStatus(`✓ ${summary}`);
      toast(summary);
      if (els.spotifyImportUrlInput) els.spotifyImportUrlInput.value = "";
      await loadPlaylists();
    } catch (err) {
      clearPhaseTimers();
      const msg = err.message || "Import failed.";
      setStatus(msg, true);
      toast(msg, true);
    } finally {
      els.spotifyImportBtn.disabled = false;
    }
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
