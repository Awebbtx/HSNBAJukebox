import "dotenv/config";
import { execFile } from "child_process";
import crypto from "crypto";
import express from "express";
import fetch from "node-fetch";
import fs from "fs";
import path from "path";
import { promisify } from "util";
import { fileURLToPath } from "url";
import {
  createAuthState,
  createAuthorizeUrl,
  exchangeCodeForToken,
  refreshAccessToken,
  spotifyApiRequest
} from "./spotify.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const execFileAsync = promisify(execFile);

const PORT = Number(process.env.PORT || 3000);
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
const MOPIDY_URL = process.env.MOPIDY_URL || "http://127.0.0.1:6680/mopidy/rpc";
const MAX_PENDING_PER_USER = Number(process.env.MAX_PENDING_PER_USER || 3);
const EMPLOYEE_SESSION_TTL_MINUTES = Number(process.env.EMPLOYEE_SESSION_TTL_MINUTES || 480);
const REQUESTS_RATE_WINDOW_MS = Number(process.env.REQUESTS_RATE_WINDOW_MS || 60000);
const REQUESTS_RATE_MAX = Number(process.env.REQUESTS_RATE_MAX || 40);
const ADMIN_BOOTSTRAP_PASSWORD = process.env.ADMIN_BOOTSTRAP_PASSWORD || "";
const EXPLICIT_FILTER_ENABLED = `${process.env.EXPLICIT_FILTER_ENABLED || "false"}`.toLowerCase() === "true";
const SLIDESHOW_EXCLUDE_FERAL = `${process.env.SLIDESHOW_EXCLUDE_FERAL || "true"}`.toLowerCase() !== "false";
const SLIDESHOW_READY_TODAY_ONLY = `${process.env.SLIDESHOW_READY_TODAY_ONLY || "true"}`.toLowerCase() !== "false";
const SLIDESHOW_CUSTOM_FILTERS_ENABLED = `${process.env.SLIDESHOW_CUSTOM_FILTERS_ENABLED || "false"}`.toLowerCase() === "true";
const SLIDESHOW_CUSTOM_FILTERS = `${process.env.SLIDESHOW_CUSTOM_FILTERS || ""}`
  .split("|")
  .map((item) => item.trim().toLowerCase())
  .filter(Boolean)
  .slice(0, 25);
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
const ENV_FILE_PATH = path.resolve(__dirname, "../.env");
const USER_DB_PATH = path.resolve(__dirname, "../data/user-db.json");
const ADMIN_DB_PATH = path.resolve(__dirname, "../data/admin-db.json");
const SLIDESHOW_CONFIG_PATH = path.resolve(__dirname, "../data/slideshow-config.json");
const AUDIO_AUTOMATION_CONFIG_PATH = path.resolve(__dirname, "../data/audio-automation.json");
const SPECIAL_PAGE_UPLOAD_DIR = path.resolve(__dirname, "../public/uploads/special-pages");
const SPECIAL_PAGE_UPLOAD_WEB_PATH = "/uploads/special-pages";
const SPECIAL_PAGE_CATEGORIES = [
  "Special Thanks",
  "Employee of the Month",
  "Volunteer of the Month",
  "Upcoming Events",
  "TNR Program",
  "Become a Volunteer",
  "General PSA and Alerts"
];
const AUDIO_AUTOMATION_TARGET_ACTIONS = {
  stream: ["start", "stop"],
  playback: ["play", "pause", "stop"],
  "audio-jack": ["mute", "unmute"]
};

if (!process.env.SPOTIFY_CLIENT_ID || !process.env.SPOTIFY_CLIENT_SECRET) {
  console.warn("Missing SPOTIFY_CLIENT_ID or SPOTIFY_CLIENT_SECRET in environment.");
}

const app = express();
app.use(express.json({ limit: "8mb" }));
app.use(express.static(path.resolve(__dirname, "../public")));

const state = {
  oauthState: null,
  oauthReturnPath: "/",
  tokens: null,
  spotify: {
    clientId: `${process.env.SPOTIFY_CLIENT_ID || ""}`.trim(),
    clientSecret: `${process.env.SPOTIFY_CLIENT_SECRET || ""}`.trim(),
    redirectUri: `${process.env.SPOTIFY_REDIRECT_URI || `${BASE_URL}/auth/callback`}`.trim(),
    activeDeviceId: `${process.env.SPOTIFY_DEVICE_ID || ""}`.trim() || null
  },
  localQueue: [],
  asm: {
    serviceUrl: `${process.env.ASM_SERVICE_URL || ""}`.trim(),
    account: `${process.env.ASM_ACCOUNT || ""}`.trim(),
    apiKey: `${process.env.ASM_API_KEY || ""}`.trim(),
    username: `${process.env.ASM_USERNAME || ""}`.trim(),
    password: `${process.env.ASM_PASSWORD || ""}`.trim(),
    adoptableMethod: `${process.env.ASM_ADOPTABLE_METHOD || "json_adoptable_animals"}`.trim(),
    cacheSeconds: Number(process.env.ASM_ADOPTABLE_CACHE_SECONDS || 600)
  },
  slideshow: {
    intervalSeconds: Math.max(5, Number(process.env.SLIDESHOW_INTERVAL_SECONDS || 12)),
    defaultLimit: Math.max(1, Math.min(50, Number(process.env.SLIDESHOW_DEFAULT_LIMIT || 20))),
    audioEnabled: `${process.env.SLIDESHOW_AUDIO_ENABLED || "true"}`.toLowerCase() !== "false",
    audioSource: `${process.env.SLIDESHOW_AUDIO_SOURCE || "/live.mp3"}`.trim() || "/live.mp3",
    audioVolume: Math.max(0, Math.min(100, Number(process.env.SLIDESHOW_AUDIO_VOLUME || 70))),
    audioAutoplay: `${process.env.SLIDESHOW_AUDIO_AUTOPLAY || "false"}`.toLowerCase() === "true",
    excludeFeral: SLIDESHOW_EXCLUDE_FERAL,
    readyTodayOnly: SLIDESHOW_READY_TODAY_ONLY,
    customFiltersEnabled: SLIDESHOW_CUSTOM_FILTERS_ENABLED,
    customFilters: SLIDESHOW_CUSTOM_FILTERS,
    displayFieldCatalog: [],
    displayFields: [...DEFAULT_SLIDESHOW_DISPLAY_FIELDS],
    specialPages: [],
    adoptablesPerSpecial: Math.max(1, Number(process.env.SLIDESHOW_ADOPTABLES_PER_SPECIAL || 3)),
    alertEveryXSlides: Math.max(2, Number(process.env.SLIDESHOW_ALERT_EVERY_X_SLIDES || 6)),
    specialImageMaxMb: Math.max(1, Math.min(12, Number(process.env.SLIDESHOW_SPECIAL_IMAGE_MAX_MB || 4)))
  },
  employeeSessions: new Map(),
  requestMetaByTlid: new Map(),
  requestRateByKey: new Map(),
  adminSessions: new Map(),
  userDb: null,
  adminDb: null,
  lastKnownCurrentTrackUri: null,
  explicitFilter: EXPLICIT_FILTER_ENABLED,
  audioAutomation: {
    streamDeliveryEnabled: true,
    schedules: []
  },
  audioAutomationRuntime: {
    activeLiveStreams: new Set(),
    recentExecutionKeys: new Map(),
    timer: null
  },
  asmCache: {
    fetchedAt: 0,
    items: [],
    error: "",
    sourceCount: 0,
    requestUrl: "",
    responseStatus: 0,
    contentType: "",
    fieldNames: [],
    bodyPreview: ""
  }
};

function getLocalDateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function normalizeUserDb(raw) {
  const db = raw && typeof raw === "object" ? raw : {};
  const defaults = db.defaults && typeof db.defaults === "object" ? db.defaults : {};
  const staff = Array.isArray(db.staff) ? db.staff : [];
  const requests = Array.isArray(db.requests) ? db.requests : [];
  const votes = db.votes && typeof db.votes === "object" ? db.votes : {};
  const voteLedger = db.voteLedger && typeof db.voteLedger === "object" ? db.voteLedger : {};
  const daily = db.daily && typeof db.daily === "object" ? db.daily : {};
  const dateKey = `${daily.dateKey || ""}`.trim() || getLocalDateKey();
  const perUser = daily.perUser && typeof daily.perUser === "object" ? daily.perUser : {};

  const trackStats = db.trackStats && typeof db.trackStats === "object" ? db.trackStats : {};

  return {
    version: 1,
    defaults: {
      requestLimit: Math.max(1, Number(defaults.requestLimit || MAX_PENDING_PER_USER || 3))
    },
    staff: staff
      .filter((item) => item && typeof item === "object")
      .map((item) => ({
        id: `${item.id || crypto.randomUUID()}`,
        firstName: `${item.firstName || ""}`.trim().slice(0, 40),
        lastInitial: `${item.lastInitial || ""}`.trim().slice(0, 1).toUpperCase(),
        legacyCode: `${item.code || ""}`.trim().slice(0, 4),
        requestLimit: Math.max(1, Number(item.requestLimit || defaults.requestLimit || MAX_PENDING_PER_USER || 3)),
        active: item.active !== false,
        createdAt: item.createdAt || new Date().toISOString(),
        updatedAt: item.updatedAt || new Date().toISOString()
      }))
      .filter((item) => item.firstName && item.lastInitial && /^\d{4}$/.test(item.legacyCode)),
    requests: requests
      .filter((item) => item && typeof item === "object")
      .map((item) => ({
        id: `${item.id || crypto.randomUUID()}`,
        userId: `${item.userId || ""}`,
        uri: `${item.uri || ""}`,
        name: `${item.name || ""}`,
        artists: `${item.artists || ""}`,
        album: `${item.album || ""}`,
        requestedAt: item.requestedAt || new Date().toISOString(),
        dateKey: `${item.dateKey || ""}`.trim() || getLocalDateKey()
      }))
      .filter((item) => item.userId && item.uri),
    votes,
    voteLedger,
    daily: {
      dateKey,
      perUser
    },
    trackStats
  };
}

function saveUserDb() {
  if (!state.userDb) {
    return;
  }
  const dir = path.dirname(USER_DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(USER_DB_PATH, JSON.stringify(state.userDb, null, 2), "utf8");
}

function loadUserDb() {
  try {
    if (!fs.existsSync(USER_DB_PATH)) {
      const initial = normalizeUserDb(null);
      state.userDb = initial;
      saveUserDb();
      return initial;
    }
    const text = fs.readFileSync(USER_DB_PATH, "utf8");
    const parsed = JSON.parse(text);
    const normalized = normalizeUserDb(parsed);
    state.userDb = normalized;
    return normalized;
  } catch (error) {
    console.warn(`Failed to load user db: ${error.message}`);
    const fallback = normalizeUserDb(null);
    state.userDb = fallback;
    return fallback;
  }
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
    const sourceKey = `${item?.sourceKey || item || ""}`.trim();
    if (!sourceKey || !/^[A-Za-z0-9_]{1,64}$/.test(sourceKey)) {
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
    if (catalog.length >= 80) {
      break;
    }
  }
  return catalog;
}

function getLegacySlideshowCatalogDefaults() {
  const legacyMap = `${process.env.SLIDESHOW_DISPLAY_FIELD_MAP || ""}`.split("|");
  return sanitizeSlideshowDisplayFieldCatalog(legacyMap.map((sourceKey) => ({ sourceKey })));
}

function buildSlideshowDisplayFieldOptions(displayFieldCatalog = []) {
  const rawOptions = sanitizeSlideshowDisplayFieldCatalog(displayFieldCatalog)
    .filter((entry) => entry.enabled !== false)
    .map((entry) => ({
      key: entry.key,
      label: entry.label
    }));
  return [...SLIDESHOW_DISPLAY_FIELD_OPTIONS, ...rawOptions];
}

function sanitizeSlideshowDisplayFields(raw, displayFieldCatalog = []) {
  const allowed = new Set(buildSlideshowDisplayFieldOptions(displayFieldCatalog).map((option) => option.key));
  const source = Array.isArray(raw) ? raw : [];
  const normalized = DEFAULT_SLIDESHOW_DISPLAY_FIELDS.map((_fallback, index) => {
    const value = `${source[index] || ""}`.trim();
    return allowed.has(value) ? value : "skip";
  });
  const hasSelectedValue = normalized.some((value) => value !== "skip");
  return hasSelectedValue ? normalized : [...DEFAULT_SLIDESHOW_DISPLAY_FIELDS];
}

function parseIsoDate(value) {
  const text = `${value || ""}`.trim();
  if (!text) return null;
  const ms = Date.parse(text);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

function sanitizeAudioAutomationTarget(value) {
  const target = `${value || ""}`.trim();
  return Object.prototype.hasOwnProperty.call(AUDIO_AUTOMATION_TARGET_ACTIONS, target)
    ? target
    : "stream";
}

function sanitizeAudioAutomationAction(target, value) {
  const safeTarget = sanitizeAudioAutomationTarget(target);
  const action = `${value || ""}`.trim();
  return AUDIO_AUTOMATION_TARGET_ACTIONS[safeTarget].includes(action)
    ? action
    : AUDIO_AUTOMATION_TARGET_ACTIONS[safeTarget][0];
}

function sanitizeAudioAutomationTime(value) {
  const text = `${value || ""}`.trim();
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(text) ? text : "08:00";
}

function sanitizeAudioAutomationDays(raw) {
  const source = Array.isArray(raw) ? raw : [];
  const seen = new Set();
  const days = [];
  for (const item of source) {
    const day = Number(item);
    if (!Number.isInteger(day) || day < 0 || day > 6 || seen.has(day)) {
      continue;
    }
    seen.add(day);
    days.push(day);
  }
  return days.length ? days.sort((a, b) => a - b) : [0, 1, 2, 3, 4, 5, 6];
}

function sanitizeAudioAutomationSchedule(raw = {}) {
  const id = `${raw.id || crypto.randomUUID()}`;
  const target = sanitizeAudioAutomationTarget(raw.target);
  const nowIso = new Date().toISOString();
  return {
    id,
    label: `${raw.label || "Untitled Schedule"}`.trim().slice(0, 80) || "Untitled Schedule",
    target,
    action: sanitizeAudioAutomationAction(target, raw.action),
    time: sanitizeAudioAutomationTime(raw.time),
    days: sanitizeAudioAutomationDays(raw.days),
    enabled: raw.enabled !== false,
    lastTriggeredAt: parseIsoDate(raw.lastTriggeredAt),
    createdAt: parseIsoDate(raw.createdAt) || nowIso,
    updatedAt: nowIso
  };
}

function sanitizeAudioAutomationSchedules(raw) {
  const source = Array.isArray(raw) ? raw : [];
  const seen = new Set();
  const schedules = [];
  for (const item of source) {
    const rule = sanitizeAudioAutomationSchedule(item || {});
    if (seen.has(rule.id)) {
      continue;
    }
    seen.add(rule.id);
    schedules.push(rule);
    if (schedules.length >= 250) {
      break;
    }
  }
  return schedules;
}

function normalizeAudioAutomationConfig(raw) {
  const config = raw && typeof raw === "object" ? raw : {};
  return {
    version: 1,
    streamDeliveryEnabled: config.streamDeliveryEnabled !== false,
    schedules: sanitizeAudioAutomationSchedules(config.schedules || [])
  };
}

function saveAudioAutomationConfig() {
  const config = normalizeAudioAutomationConfig({
    streamDeliveryEnabled: state.audioAutomation?.streamDeliveryEnabled !== false,
    schedules: state.audioAutomation?.schedules || []
  });
  const dir = path.dirname(AUDIO_AUTOMATION_CONFIG_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(AUDIO_AUTOMATION_CONFIG_PATH, JSON.stringify(config, null, 2), "utf8");
}

function loadAudioAutomationConfig() {
  try {
    if (!fs.existsSync(AUDIO_AUTOMATION_CONFIG_PATH)) {
      const initial = normalizeAudioAutomationConfig(null);
      state.audioAutomation.streamDeliveryEnabled = initial.streamDeliveryEnabled;
      state.audioAutomation.schedules = initial.schedules;
      saveAudioAutomationConfig();
      return initial;
    }
    const text = fs.readFileSync(AUDIO_AUTOMATION_CONFIG_PATH, "utf8");
    const parsed = JSON.parse(text);
    const normalized = normalizeAudioAutomationConfig(parsed);
    state.audioAutomation.streamDeliveryEnabled = normalized.streamDeliveryEnabled;
    state.audioAutomation.schedules = normalized.schedules;
    return normalized;
  } catch (error) {
    console.warn(`Failed to load audio automation config: ${error.message}`);
    const fallback = normalizeAudioAutomationConfig(null);
    state.audioAutomation.streamDeliveryEnabled = fallback.streamDeliveryEnabled;
    state.audioAutomation.schedules = fallback.schedules;
    return fallback;
  }
}

function getLocalMinuteKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${d}T${hh}:${mm}`;
}

function disconnectActiveLiveStreams() {
  for (const entry of state.audioAutomationRuntime.activeLiveStreams) {
    try {
      entry.upstream?.destroy?.();
    } catch {}
    try {
      entry.res?.destroy?.();
    } catch {}
  }
  state.audioAutomationRuntime.activeLiveStreams.clear();
}

async function setStreamDeliveryEnabled(enabled) {
  const next = enabled !== false;
  state.audioAutomation.streamDeliveryEnabled = next;
  if (!next) {
    disconnectActiveLiveStreams();
  }
  saveAudioAutomationConfig();
  return {
    enabled: next,
    activeListeners: state.audioAutomationRuntime.activeLiveStreams.size
  };
}

async function executeAudioAutomationAction(target, action) {
  const safeTarget = sanitizeAudioAutomationTarget(target);
  const safeAction = sanitizeAudioAutomationAction(safeTarget, action);
  if (safeTarget === "stream") {
    return {
      target: safeTarget,
      action: safeAction,
      ...(await setStreamDeliveryEnabled(safeAction === "start"))
    };
  }
  if (safeTarget === "playback") {
    await mopidyRpc(`core.playback.${safeAction}`);
    const playbackState = await mopidyRpc("core.playback.get_state");
    return {
      target: safeTarget,
      action: safeAction,
      playbackState: `${playbackState || "stopped"}`
    };
  }
  const current = await getAudioJackSettings();
  const updated = await setAudioJackSettings({
    volume: current.volume,
    muted: safeAction === "mute"
  });
  return {
    target: safeTarget,
    action: safeAction,
    ...updated
  };
}

async function runAudioAutomationSchedule(schedule, source = "schedule") {
  const existing = sanitizeAudioAutomationSchedules(state.audioAutomation.schedules || []).find((item) => item.id === schedule.id);
  const rule = existing || sanitizeAudioAutomationSchedule(schedule || {});
  const result = await executeAudioAutomationAction(rule.target, rule.action);
  state.audioAutomation.schedules = sanitizeAudioAutomationSchedules((state.audioAutomation.schedules || []).map((item) => (
    item.id === rule.id
      ? { ...item, lastTriggeredAt: new Date().toISOString(), updatedAt: item.updatedAt, createdAt: item.createdAt }
      : item
  )));
  saveAudioAutomationConfig();
  return {
    ok: true,
    source,
    rule: state.audioAutomation.schedules.find((item) => item.id === rule.id) || rule,
    result
  };
}

async function processAudioAutomationSchedules(now = new Date()) {
  const minuteKey = getLocalMinuteKey(now);
  for (const [key, ts] of state.audioAutomationRuntime.recentExecutionKeys.entries()) {
    if (Date.now() - ts > 48 * 60 * 60 * 1000) {
      state.audioAutomationRuntime.recentExecutionKeys.delete(key);
    }
  }
  const day = now.getDay();
  const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const schedules = sanitizeAudioAutomationSchedules(state.audioAutomation.schedules || []);
  for (const rule of schedules) {
    if (!rule.enabled || !rule.days.includes(day) || rule.time !== time) {
      continue;
    }
    const dedupeKey = `${rule.id}:${minuteKey}`;
    if (state.audioAutomationRuntime.recentExecutionKeys.has(dedupeKey)) {
      continue;
    }
    state.audioAutomationRuntime.recentExecutionKeys.set(dedupeKey, Date.now());
    try {
      await runAudioAutomationSchedule(rule, "scheduler");
    } catch (error) {
      console.warn(`Audio automation rule failed (${rule.id}): ${error.message}`);
    }
  }
}

function startAudioAutomationScheduler() {
  if (state.audioAutomationRuntime.timer) {
    clearInterval(state.audioAutomationRuntime.timer);
  }
  state.audioAutomationRuntime.timer = setInterval(() => {
    processAudioAutomationSchedules().catch((error) => {
      console.warn(`Audio automation scheduler error: ${error.message}`);
    });
  }, 15000);
  state.audioAutomationRuntime.timer.unref?.();
  processAudioAutomationSchedules().catch((error) => {
    console.warn(`Audio automation scheduler startup error: ${error.message}`);
  });
}

function sanitizeSpecialPageTemplate(value) {
  return `${value || ""}`.trim() === "image" ? "image" : "split";
}

function sanitizeSpecialPageCategory(value) {
  const text = `${value || ""}`.trim();
  return SPECIAL_PAGE_CATEGORIES.includes(text) ? text : "General PSA and Alerts";
}

function sanitizeSpecialPageImagePath(value) {
  const text = `${value || ""}`.trim();
  if (!text) return "";
  if (text.startsWith(`${SPECIAL_PAGE_UPLOAD_WEB_PATH}/`)) {
    return text;
  }
  return "";
}

function sanitizeRichTextHtml(value, maxLength = 12000) {
  const allowedTags = new Set(["p", "br", "strong", "em", "u", "ul", "ol", "li", "a", "h2", "h3", "h4", "blockquote", "font"]);
  const input = `${value || ""}`.slice(0, maxLength);
  const withoutScript = input
    .replace(/<\s*script[^>]*>[\s\S]*?<\s*\/\s*script\s*>/gi, "")
    .replace(/<\s*style[^>]*>[\s\S]*?<\s*\/\s*style\s*>/gi, "")
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son\w+\s*=\s*'[^']*'/gi, "")
    .replace(/\sstyle\s*=\s*"[^"]*"/gi, "")
    .replace(/\sstyle\s*=\s*'[^']*'/gi, "");

  return withoutScript.replace(/<\/?([a-zA-Z0-9]+)([^>]*)>/g, (tag, name, attrs) => {
    const lower = `${name || ""}`.toLowerCase();
    if (!allowedTags.has(lower)) {
      return "";
    }
    const isClosing = tag.startsWith("</");
    if (isClosing) {
      return `</${lower}>`;
    }
    if (lower === "a") {
      const hrefMatch = attrs.match(/href\s*=\s*"([^"]*)"|href\s*=\s*'([^']*)'/i);
      const href = `${hrefMatch?.[1] || hrefMatch?.[2] || ""}`.trim();
      const safeHref = /^(https?:\/\/|mailto:)/i.test(href) ? href : "";
      if (!safeHref) {
        return "<a>";
      }
      return `<a href="${safeHref}" target="_blank" rel="noopener noreferrer">`;
    }
    if (lower === "font") {
      const sizeMatch = attrs.match(/size\s*=\s*"([1-7])"|size\s*=\s*'([1-7])'/i);
      const colorMatch = attrs.match(/color\s*=\s*"([^"]*)"|color\s*=\s*'([^']*)'/i);
      const size = `${sizeMatch?.[1] || sizeMatch?.[2] || ""}`.trim();
      const rawColor = `${colorMatch?.[1] || colorMatch?.[2] || ""}`.trim();
      const safeColor = /^#([A-Fa-f0-9]{3}|[A-Fa-f0-9]{6})$/.test(rawColor)
        || /^(?:black|white|gray|grey|silver|maroon|red|purple|fuchsia|green|lime|olive|yellow|navy|blue|teal|aqua|orange)$/i.test(rawColor)
        ? rawColor
        : "";
      const attrParts = [];
      if (size) attrParts.push(`size="${size}"`);
      if (safeColor) attrParts.push(`color="${safeColor}"`);
      return attrParts.length ? `<font ${attrParts.join(" ")}>` : "<font>";
    }
    return `<${lower}>`;
  }).trim();
}

function sanitizeSpecialPage(raw = {}) {
  const id = `${raw.id || crypto.randomUUID()}`;
  const nowIso = new Date().toISOString();
  const displaySeconds = Math.max(4, Math.min(60, Number(raw.displaySeconds || 10)));
  const priority = Math.max(0, Math.min(10, Number(raw.priority || 0)));
  return {
    id,
    title: `${raw.title || "Untitled Page"}`.trim().slice(0, 100) || "Untitled Page",
    category: sanitizeSpecialPageCategory(raw.category),
    template: sanitizeSpecialPageTemplate(raw.template),
    imageUrl: sanitizeSpecialPageImagePath(raw.imageUrl),
    richText: sanitizeRichTextHtml(raw.richText || ""),
    active: raw.active !== false,
    isAlert: raw.isAlert === true,
    displaySeconds,
    priority,
    startAt: parseIsoDate(raw.startAt),
    endAt: parseIsoDate(raw.endAt),
    createdAt: parseIsoDate(raw.createdAt) || nowIso,
    updatedAt: nowIso
  };
}

function sanitizeSpecialPages(raw) {
  const source = Array.isArray(raw) ? raw : [];
  const seen = new Set();
  const pages = [];
  for (const item of source) {
    const sanitized = sanitizeSpecialPage(item || {});
    if (seen.has(sanitized.id)) continue;
    seen.add(sanitized.id);
    pages.push(sanitized);
    if (pages.length >= 200) break;
  }
  return pages;
}

function isSpecialPageActiveNow(page, nowMs = Date.now()) {
  if (!page?.active) return false;
  const startMs = page.startAt ? Date.parse(page.startAt) : null;
  const endMs = page.endAt ? Date.parse(page.endAt) : null;
  if (Number.isFinite(startMs) && nowMs < startMs) return false;
  if (Number.isFinite(endMs) && nowMs > endMs) return false;
  return true;
}

function buildMixedSlideshowSlides(animals = [], specialPages = [], options = {}) {
  const adoptablesPerSpecial = Math.max(1, Number(options.adoptablesPerSpecial || 3));
  const alertEveryXSlides = Math.max(2, Number(options.alertEveryXSlides || 6));
  const nowMs = Date.now();
  const pages = sanitizeSpecialPages(specialPages)
    .filter((page) => isSpecialPageActiveNow(page, nowMs))
    .sort((a, b) => (Number(b.priority || 0) - Number(a.priority || 0)) || `${b.updatedAt || ""}`.localeCompare(`${a.updatedAt || ""}`));
  const alerts = pages.filter((page) => page.isAlert);
  const regularPages = pages.filter((page) => !page.isAlert);
  const adoptableSlides = (Array.isArray(animals) ? animals : []).map((animal) => ({
    type: "animal",
    displaySeconds: Math.max(5, Number(options.defaultAnimalSeconds || 12)),
    animal
  }));

  const base = [];
  let aIndex = 0;
  let pIndex = 0;
  while (aIndex < adoptableSlides.length || pIndex < regularPages.length) {
    for (let i = 0; i < adoptablesPerSpecial && aIndex < adoptableSlides.length; i += 1) {
      base.push(adoptableSlides[aIndex]);
      aIndex += 1;
    }
    if (pIndex < regularPages.length) {
      base.push({
        type: "special",
        displaySeconds: Number(regularPages[pIndex].displaySeconds || 10),
        page: regularPages[pIndex]
      });
      pIndex += 1;
    }
    if (pIndex >= regularPages.length && aIndex < adoptableSlides.length && regularPages.length === 0) {
      continue;
    }
    if (aIndex >= adoptableSlides.length && pIndex < regularPages.length) {
      base.push({
        type: "special",
        displaySeconds: Number(regularPages[pIndex].displaySeconds || 10),
        page: regularPages[pIndex]
      });
      pIndex += 1;
    }
  }

  if (!base.length && alerts.length) {
    return alerts.map((page) => ({
      type: "special",
      displaySeconds: Number(page.displaySeconds || 10),
      page
    }));
  }

  if (!alerts.length) {
    return base;
  }

  const output = [];
  let alertIndex = 0;
  let nonAlertCount = 0;
  for (const slide of base) {
    output.push(slide);
    nonAlertCount += 1;
    if (nonAlertCount % alertEveryXSlides === 0) {
      const alert = alerts[alertIndex % alerts.length];
      output.push({
        type: "special",
        displaySeconds: Number(alert.displaySeconds || 10),
        page: alert
      });
      alertIndex += 1;
    }
  }
  return output;
}

function ensureSpecialPageUploadDir() {
  if (!fs.existsSync(SPECIAL_PAGE_UPLOAD_DIR)) {
    fs.mkdirSync(SPECIAL_PAGE_UPLOAD_DIR, { recursive: true });
  }
}

function getSpecialPageImageStorageStats() {
  ensureSpecialPageUploadDir();
  const entries = fs.readdirSync(SPECIAL_PAGE_UPLOAD_DIR, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && /\.(png|jpe?g|webp)$/i.test(entry.name))
    .map((entry) => {
      const fullPath = path.join(SPECIAL_PAGE_UPLOAD_DIR, entry.name);
      const stat = fs.statSync(fullPath);
      return {
        name: entry.name,
        fullPath,
        sizeBytes: Number(stat.size || 0),
        updatedAt: new Date(stat.mtimeMs || Date.now()).toISOString()
      };
    })
    .sort((a, b) => `${b.updatedAt}`.localeCompare(`${a.updatedAt}`));

  const totalBytes = files.reduce((sum, file) => sum + Number(file.sizeBytes || 0), 0);
  let availableBytes = null;
  try {
    const fsStats = fs.statfsSync(SPECIAL_PAGE_UPLOAD_DIR);
    if (fsStats && Number.isFinite(Number(fsStats.bavail)) && Number.isFinite(Number(fsStats.bsize))) {
      availableBytes = Number(fsStats.bavail) * Number(fsStats.bsize);
    }
  } catch {
    availableBytes = null;
  }

  return {
    files,
    totalBytes,
    count: files.length,
    availableBytes
  };
}

function saveSpecialPageImageDataUrl(pageId, dataUrl) {
  const match = `${dataUrl || ""}`.match(/^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/i);
  if (!match) {
    throw new Error("Image data must be PNG, JPG, or WEBP.");
  }
  const imageType = `${match[1] || ""}`.toLowerCase();
  const base64Body = `${match[2] || ""}`;
  const buffer = Buffer.from(base64Body, "base64");
  const maxBytes = Math.max(1, Math.min(12, Number(state.slideshow.specialImageMaxMb || 4))) * 1024 * 1024;
  if (buffer.byteLength > maxBytes) {
    throw new Error(`Image exceeds max size of ${state.slideshow.specialImageMaxMb || 4}MB.`);
  }
  const ext = imageType === "jpeg" || imageType === "jpg" ? "jpg" : imageType;
  const fileName = `${pageId}-${Date.now()}.${ext}`;
  ensureSpecialPageUploadDir();
  fs.writeFileSync(path.join(SPECIAL_PAGE_UPLOAD_DIR, fileName), buffer);
  return `${SPECIAL_PAGE_UPLOAD_WEB_PATH}/${fileName}`;
}

function normalizeSlideshowConfig(raw) {
  const config = raw && typeof raw === "object" ? raw : {};
  const legacyCatalog = getLegacySlideshowCatalogDefaults();
  const displayFieldCatalog = sanitizeSlideshowDisplayFieldCatalog(config.displayFieldCatalog || legacyCatalog);
  const legacyDisplayFields = `${process.env.SLIDESHOW_DISPLAY_FIELDS || ""}`.split("|");
  const displayFields = sanitizeSlideshowDisplayFields(config.displayFields || legacyDisplayFields, displayFieldCatalog);
  const specialPages = sanitizeSpecialPages(config.specialPages || []);
  return {
    version: 1,
    displayFieldCatalog,
    displayFields,
    specialPages,
    adoptablesPerSpecial: Math.max(1, Number(config.adoptablesPerSpecial || process.env.SLIDESHOW_ADOPTABLES_PER_SPECIAL || 3)),
    alertEveryXSlides: Math.max(2, Number(config.alertEveryXSlides || process.env.SLIDESHOW_ALERT_EVERY_X_SLIDES || 6)),
    specialImageMaxMb: Math.max(1, Math.min(12, Number(config.specialImageMaxMb || process.env.SLIDESHOW_SPECIAL_IMAGE_MAX_MB || 4)))
  };
}

function saveSlideshowConfig() {
  const config = normalizeSlideshowConfig({
    displayFieldCatalog: state.slideshow?.displayFieldCatalog || [],
    displayFields: state.slideshow?.displayFields || [],
    specialPages: state.slideshow?.specialPages || [],
    adoptablesPerSpecial: state.slideshow?.adoptablesPerSpecial || 3,
    alertEveryXSlides: state.slideshow?.alertEveryXSlides || 6,
    specialImageMaxMb: state.slideshow?.specialImageMaxMb || 4
  });
  const dir = path.dirname(SLIDESHOW_CONFIG_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(SLIDESHOW_CONFIG_PATH, JSON.stringify(config, null, 2), "utf8");
}

function loadSlideshowConfig() {
  try {
    if (!fs.existsSync(SLIDESHOW_CONFIG_PATH)) {
      const initial = normalizeSlideshowConfig(null);
      state.slideshow.displayFieldCatalog = initial.displayFieldCatalog;
      state.slideshow.displayFields = initial.displayFields;
      state.slideshow.specialPages = initial.specialPages;
      state.slideshow.adoptablesPerSpecial = initial.adoptablesPerSpecial;
      state.slideshow.alertEveryXSlides = initial.alertEveryXSlides;
      state.slideshow.specialImageMaxMb = initial.specialImageMaxMb;
      saveSlideshowConfig();
      return initial;
    }
    const text = fs.readFileSync(SLIDESHOW_CONFIG_PATH, "utf8");
    const parsed = JSON.parse(text);
    const normalized = normalizeSlideshowConfig(parsed);
    state.slideshow.displayFieldCatalog = normalized.displayFieldCatalog;
    state.slideshow.displayFields = normalized.displayFields;
    state.slideshow.specialPages = normalized.specialPages;
    state.slideshow.adoptablesPerSpecial = normalized.adoptablesPerSpecial;
    state.slideshow.alertEveryXSlides = normalized.alertEveryXSlides;
    state.slideshow.specialImageMaxMb = normalized.specialImageMaxMb;
    return normalized;
  } catch (error) {
    console.warn(`Failed to load slideshow config: ${error.message}`);
    const fallback = normalizeSlideshowConfig(null);
    state.slideshow.displayFieldCatalog = fallback.displayFieldCatalog;
    state.slideshow.displayFields = fallback.displayFields;
    state.slideshow.specialPages = fallback.specialPages;
    state.slideshow.adoptablesPerSpecial = fallback.adoptablesPerSpecial;
    state.slideshow.alertEveryXSlides = fallback.alertEveryXSlides;
    state.slideshow.specialImageMaxMb = fallback.specialImageMaxMb;
    return fallback;
  }
}

function ensureDailyRequestWindow() {
  const today = getLocalDateKey();
  if (!state.userDb) {
    state.userDb = normalizeUserDb(null);
  }
  if (state.userDb.daily.dateKey !== today) {
    state.userDb.daily = {
      dateKey: today,
      perUser: {}
    };
    saveUserDb();
  }
}

function getDailyRequestsUsed(userId) {
  ensureDailyRequestWindow();
  return Math.max(0, Number(state.userDb.daily.perUser[userId] || 0));
}

function incrementDailyRequestsUsed(userId) {
  ensureDailyRequestWindow();
  const next = getDailyRequestsUsed(userId) + 1;
  state.userDb.daily.perUser[userId] = next;
  saveUserDb();
  return next;
}

function formatStaffDisplayName(staff) {
  return `${staff.firstName} ${staff.lastInitial}.`.trim();
}

function sanitizeFirstName(value) {
  return `${value || ""}`.trim().replace(/\s+/g, " ").slice(0, 40);
}

function sanitizeLastInitial(value) {
  return `${value || ""}`.trim().slice(0, 1).toUpperCase();
}

function recordSongRequest({ staff, track }) {
  const item = {
    id: crypto.randomUUID(),
    userId: staff.id,
    uri: `${track.uri || ""}`,
    name: `${track.name || ""}`,
    artists: `${track.artists || ""}`,
    album: `${track.album || ""}`,
    requestedAt: new Date().toISOString(),
    dateKey: getLocalDateKey()
  };
  state.userDb.requests.push(item);
  saveUserDb();
}

function getTrackVoteSummary(uri) {
  const key = `${uri || ""}`;
  const vote = state.userDb.votes[key] || null;
  if (!vote) {
    return { upvotes: 0, downvotes: 0, score: 0 };
  }
  return {
    upvotes: Math.max(0, Number(vote.upvotes || 0)),
    downvotes: Math.max(0, Number(vote.downvotes || 0)),
    score: Math.max(0, Number(vote.upvotes || 0)) - Math.max(0, Number(vote.downvotes || 0))
  };
}

function getUserVoteForTrack(userId, uri) {
  const key = `${userId}:${uri}`;
  return Number(state.userDb.voteLedger[key] || 0);
}

function applyVote({ userId, uri, vote, name, artists, album }) {
  const normalizedVote = vote === -1 ? -1 : vote === 1 ? 1 : 0;
  if (!uri || !normalizedVote) {
    throw new Error("uri and vote are required");
  }

  const trackKey = `${uri}`;
  if (!state.userDb.votes[trackKey]) {
    state.userDb.votes[trackKey] = {
      uri: trackKey,
      name: `${name || ""}`,
      artists: `${artists || ""}`,
      album: `${album || ""}`,
      upvotes: 0,
      downvotes: 0,
      updatedAt: new Date().toISOString()
    };
  }

  const voteEntry = state.userDb.votes[trackKey];
  if (!voteEntry.name && name) voteEntry.name = `${name}`;
  if (!voteEntry.artists && artists) voteEntry.artists = `${artists}`;
  if (!voteEntry.album && album) voteEntry.album = `${album}`;

  const ledgerKey = `${userId}:${trackKey}`;
  const previous = Number(state.userDb.voteLedger[ledgerKey] || 0);
  if (previous === normalizedVote) {
    return {
      changed: false,
      userVote: previous,
      ...getTrackVoteSummary(trackKey)
    };
  }

  if (previous === 1) {
    voteEntry.upvotes = Math.max(0, Number(voteEntry.upvotes || 0) - 1);
  } else if (previous === -1) {
    voteEntry.downvotes = Math.max(0, Number(voteEntry.downvotes || 0) - 1);
  }

  if (normalizedVote === 1) {
    voteEntry.upvotes = Math.max(0, Number(voteEntry.upvotes || 0) + 1);
  } else if (normalizedVote === -1) {
    voteEntry.downvotes = Math.max(0, Number(voteEntry.downvotes || 0) + 1);
  }

  state.userDb.voteLedger[ledgerKey] = normalizedVote;
  voteEntry.updatedAt = new Date().toISOString();
  saveUserDb();

  return {
    changed: true,
    userVote: normalizedVote,
    ...getTrackVoteSummary(trackKey)
  };
}

function getTopRequested(limit = 10) {
  const map = new Map();
  for (const req of state.userDb.requests) {
    const key = req.uri;
    const existing = map.get(key) || {
      uri: key,
      name: req.name || "Unknown",
      artists: req.artists || "",
      album: req.album || "",
      requestCount: 0
    };
    existing.requestCount += 1;
    if (!existing.name && req.name) existing.name = req.name;
    if (!existing.artists && req.artists) existing.artists = req.artists;
    if (!existing.album && req.album) existing.album = req.album;
    map.set(key, existing);
  }
  return Array.from(map.values())
    .sort((a, b) => b.requestCount - a.requestCount)
    .slice(0, Math.max(1, limit));
}

function getTopUpvoted(limit = 10) {
  return Object.values(state.userDb.votes || {})
    .map((item) => ({
      uri: item.uri,
      name: item.name || "Unknown",
      artists: item.artists || "",
      album: item.album || "",
      upvotes: Math.max(0, Number(item.upvotes || 0)),
      downvotes: Math.max(0, Number(item.downvotes || 0)),
      score: Math.max(0, Number(item.upvotes || 0)) - Math.max(0, Number(item.downvotes || 0))
    }))
    .sort((a, b) => (b.upvotes - a.upvotes) || (b.score - a.score))
    .slice(0, Math.max(1, limit));
}

function getTopDownvoted(limit = 10) {
  return Object.values(state.userDb.votes || {})
    .map((item) => ({
      uri: item.uri,
      name: item.name || "Unknown",
      artists: item.artists || "",
      album: item.album || "",
      downvotes: Math.max(0, Number(item.downvotes || 0))
    }))
    .filter((item) => item.downvotes > 0)
    .sort((a, b) => b.downvotes - a.downvotes)
    .slice(0, Math.max(1, limit));
}

function recordTrackStat(uri, name, artists, album, field) {
  if (!uri || !state.userDb) return;
  const stats = state.userDb.trackStats;
  if (!stats[uri]) {
    stats[uri] = { uri, name: name || "Unknown", artists: artists || "", album: album || "", playCount: 0, skipCount: 0 };
  }
  if (name && !stats[uri].name) stats[uri].name = name;
  if (artists && !stats[uri].artists) stats[uri].artists = artists;
  stats[uri][field] = (stats[uri][field] || 0) + 1;
  saveUserDb();
}

function getTopPlayed(limit = 10) {
  return Object.values(state.userDb.trackStats || {})
    .filter((t) => (t.playCount || 0) > 0)
    .sort((a, b) => b.playCount - a.playCount)
    .slice(0, Math.max(1, limit));
}

function getTopSkipped(limit = 10) {
  return Object.values(state.userDb.trackStats || {})
    .filter((t) => (t.skipCount || 0) > 0)
    .sort((a, b) => b.skipCount - a.skipCount)
    .slice(0, Math.max(1, limit));
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const normalized = `${password || ""}`;
  const derived = crypto.scryptSync(normalized, salt, 64).toString("hex");
  return {
    salt,
    hash: derived
  };
}

function verifyPassword(password, salt, expectedHash) {
  if (!salt || !expectedHash) {
    return false;
  }
  try {
    const attempt = crypto.scryptSync(`${password || ""}`, salt, 64).toString("hex");
    return crypto.timingSafeEqual(Buffer.from(attempt, "hex"), Buffer.from(expectedHash, "hex"));
  } catch {
    return false;
  }
}

function sanitizeUsername(value) {
  return `${value || ""}`.trim().toLowerCase().slice(0, 120);
}

function sanitizeAdminDisplayName(value) {
  return `${value || ""}`.trim().replace(/\s+/g, " ").slice(0, 60);
}

function toEmailSuggestion(value) {
  const raw = sanitizeUsername(value);
  const local = raw
    .replace(/[^a-z0-9._-]/g, "")
    .replace(/^[._-]+/, "")
    .replace(/[._-]+$/, "")
    .slice(0, 48);
  return `${local || "user"}@hsnba.local`;
}

function isValidEmailUsername(value) {
  const email = sanitizeUsername(value);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function normalizeEmailUsername(value, { requireValid = true } = {}) {
  const email = sanitizeUsername(value);
  if (isValidEmailUsername(email)) {
    return { ok: true, email, suggestion: "" };
  }
  const suggestion = toEmailSuggestion(email);
  if (!requireValid) {
    return { ok: true, email: suggestion, suggestion };
  }
  return { ok: false, email: "", suggestion };
}

function ensureUniqueEmail(email, usedSet) {
  if (!usedSet.has(email)) {
    usedSet.add(email);
    return email;
  }
  const [localRaw, domainRaw] = email.split("@");
  const local = localRaw || "user";
  const domain = domainRaw || "hsnba.local";
  let n = 2;
  let candidate = `${local}+${n}@${domain}`;
  while (usedSet.has(candidate)) {
    n += 1;
    candidate = `${local}+${n}@${domain}`;
  }
  usedSet.add(candidate);
  return candidate;
}

function isUserAdmin(user) {
  return Array.isArray(user?.groups) && user.groups.includes("admins");
}

function formatUserDisplayName(user) {
  const firstName = `${user?.firstName || ""}`.trim();
  const lastInitial = `${user?.lastInitial || ""}`.trim();
  if (firstName && lastInitial) {
    return `${firstName} ${lastInitial}.`.trim();
  }
  return sanitizeAdminDisplayName(user?.displayName || user?.username || "User");
}

function getUserById(userId) {
  return (state.adminDb?.users || []).find((item) => item.id === userId && item.active !== false) || null;
}

function findUserByUsername(username) {
  const normalized = sanitizeUsername(username);
  if (!normalized) {
    return null;
  }
  return (state.adminDb?.users || []).find((user) => user.active !== false && user.username === normalized) || null;
}

function normalizeAdminDb(raw) {
  const db = raw && typeof raw === "object" ? raw : {};
  const history = Array.isArray(db.history) ? db.history : [];
  const usersRaw = Array.isArray(db.users) ? db.users : [];
  const staffDefaults = db.staffDefaults && typeof db.staffDefaults === "object" ? db.staffDefaults : {};
  const usedEmails = new Set();

  const unifiedUsers = [];

  for (const item of usersRaw) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const usernameResult = normalizeEmailUsername(item.username, { requireValid: false });
    const username = ensureUniqueEmail(usernameResult.email, usedEmails);
    const groups = Array.isArray(item.groups)
      ? item.groups.map((entry) => `${entry || ""}`.trim().toLowerCase()).filter(Boolean)
      : [];
    unifiedUsers.push({
      id: `${item.id || crypto.randomUUID()}`,
      username,
      displayName: sanitizeAdminDisplayName(item.displayName || item.username || "User"),
      firstName: sanitizeFirstName(item.firstName),
      lastInitial: sanitizeLastInitial(item.lastInitial),
      passwordSalt: `${item.passwordSalt || ""}`,
      passwordHash: `${item.passwordHash || ""}`,
      requestLimit: Math.max(1, Number(item.requestLimit || staffDefaults.requestLimit || state?.userDb?.defaults?.requestLimit || MAX_PENDING_PER_USER || 3)),
      groups,
      active: item.active !== false,
      createdAt: item.createdAt || new Date().toISOString(),
      updatedAt: item.updatedAt || new Date().toISOString(),
      lastLoginAt: item.lastLoginAt || null
    });
  }

  return {
    version: 2,
    users: unifiedUsers
      .filter((item) => item.username && item.passwordSalt && item.passwordHash),
    staffDefaults: {
      requestLimit: Math.max(1, Number(staffDefaults.requestLimit || state?.userDb?.defaults?.requestLimit || MAX_PENDING_PER_USER || 3))
    },
    history: history
      .filter((item) => item && typeof item === "object")
      .map((item) => ({
        id: `${item.id || crypto.randomUUID()}`,
        adminId: `${item.adminId || ""}`,
        action: `${item.action || ""}`,
        detail: `${item.detail || ""}`,
        createdAt: item.createdAt || new Date().toISOString()
      }))
      .filter((item) => item.action)
      .slice(-500)
  };
}

function saveAdminDb() {
  if (!state.adminDb) {
    return;
  }
  const dir = path.dirname(ADMIN_DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(ADMIN_DB_PATH, JSON.stringify(state.adminDb, null, 2), "utf8");
}

function logAdminHistory(adminId, action, detail = "") {
  if (!state.adminDb) {
    return;
  }
  state.adminDb.history.push({
    id: crypto.randomUUID(),
    adminId: `${adminId || ""}`,
    action: `${action || ""}`,
    detail: `${detail || ""}`,
    createdAt: new Date().toISOString()
  });
  if (state.adminDb.history.length > 500) {
    state.adminDb.history = state.adminDb.history.slice(-500);
  }
  saveAdminDb();
}

function bootstrapDefaultAdminIfNeeded() {
  if (!state.adminDb) {
    return;
  }
  const hasAdmins = (state.adminDb.users || []).some((item) => isUserAdmin(item) && item.active !== false);
  if (hasAdmins) {
    return;
  }

  const fallbackPassword = `${ADMIN_BOOTSTRAP_PASSWORD || ""}`.trim() || "admin1234";
  const pwd = hashPassword(fallbackPassword);
  const now = new Date().toISOString();
  state.adminDb.users.push({
    id: crypto.randomUUID(),
    username: "admin@hsnba.local",
    displayName: "Admin",
    firstName: "Admin",
    lastInitial: "",
    passwordSalt: pwd.salt,
    passwordHash: pwd.hash,
    requestLimit: Math.max(1, Number(state.adminDb.staffDefaults?.requestLimit || MAX_PENDING_PER_USER || 3)),
    groups: ["admins"],
    active: true,
    createdAt: now,
    updatedAt: now,
    lastLoginAt: null
  });
  saveAdminDb();
}

function loadAdminDb() {
  try {
    if (!fs.existsSync(ADMIN_DB_PATH)) {
      state.adminDb = normalizeAdminDb(null);
      bootstrapDefaultAdminIfNeeded();
      saveAdminDb();
      return state.adminDb;
    }
    const text = fs.readFileSync(ADMIN_DB_PATH, "utf8");
    state.adminDb = normalizeAdminDb(JSON.parse(text));
    bootstrapDefaultAdminIfNeeded();
    saveAdminDb();
    return state.adminDb;
  } catch (error) {
    console.warn(`Failed to load admin db: ${error.message}`);
    state.adminDb = normalizeAdminDb(null);
    bootstrapDefaultAdminIfNeeded();
    saveAdminDb();
    return state.adminDb;
  }
}

function getAdminBySessionToken(token) {
  const session = token ? state.adminSessions.get(token) : null;
  if (!session?.userId) {
    return null;
  }
  const user = getUserById(session.userId);
  return user && isUserAdmin(user) ? user : null;
}

loadUserDb();
loadAdminDb();
loadSlideshowConfig();
loadAudioAutomationConfig();
startAudioAutomationScheduler();

function buildAsmServiceUrl(method, extraParams = {}) {
  if (!state.asm.serviceUrl) {
    return "";
  }
  const url = new URL(state.asm.serviceUrl);
  url.searchParams.set("method", method);
  if (state.asm.account) {
    url.searchParams.set("account", state.asm.account);
  }
  if (state.asm.apiKey) {
    url.searchParams.set("key", state.asm.apiKey);
  } else if (state.asm.username && state.asm.password) {
    url.searchParams.set("username", state.asm.username);
    url.searchParams.set("password", state.asm.password);
  }
  for (const [k, v] of Object.entries(extraParams || {})) {
    if (v !== undefined && v !== null && `${v}`.length) {
      url.searchParams.set(k, `${v}`);
    }
  }
  return url.toString();
}

function buildMappedRawFieldValues(item = {}) {
  const rawValues = {};
  const fields = sanitizeSlideshowDisplayFieldCatalog(state.slideshow?.displayFieldCatalog || []);
  for (const field of fields) {
    const value = item[field.sourceKey];
    if (value === undefined || value === null) {
      continue;
    }
    const text = `${value}`.trim();
    if (!text) {
      continue;
    }
    rawValues[field.sourceKey] = text;
  }
  return rawValues;
}

function mapAsmAnimal(item = {}) {
  const id = item.ID || item.ANIMALID || 0;
  const directImage = item.WEBSITEIMAGEURL || item.IMAGEURL || item.WEBSITEIMAGE || item.WEBIMAGE || "";
  const imageUrl = directImage || (id ? `/api/adoptables/image/${id}` : "");
  const profileUrl = id ? buildAsmServiceUrl("animal_view", { animalid: id }) : "";
  const neuteredRaw = item.NEUTERED;
  const readyToday = `${neuteredRaw ?? ""}` === "1";
  return {
    id,
    name: item.ANIMALNAME || item.NAME || "Unknown",
    species: item.SPECIESNAME || "",
    breed: item.BREEDNAME || item.BREEDNAME1 || "",
    sex: item.SEXNAME || "",
    ageGroup: item.AGEGROUP || "",
    location: item.DISPLAYLOCATIONNAME || item.SHELTERLOCATIONNAME || "",
    bio: item.WEBSITEMEDIANOTES || item.ANIMALCOMMENTS || "",
    readyToday,
    imageUrl,
    profileUrl,
    rawFields: buildMappedRawFieldValues(item)
  };
}

function hasFeralFlag(item = {}) {
  const flags = item.ADDITIONALFLAGS;
  if (Array.isArray(flags)) {
    return flags.some((entry) => `${entry || ""}`.toUpperCase().includes("FERAL"));
  }
  const raw = `${flags || ""}`.toUpperCase();
  return raw.includes("FERAL");
}

function isReadyToday(item = {}) {
  return `${item.NEUTERED ?? ""}` === "1";
}

function sanitizeCustomFilters(raw) {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .map((item) => `${item || ""}`.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 25);
}

function applyAdoptableCustomFilters(items) {
  const filters = sanitizeCustomFilters(state.slideshow.customFilters || []);
  if (!state.slideshow.customFiltersEnabled || !filters.length) {
    return items;
  }

  return (items || []).filter((item) => {
    const haystack = [
      item.name,
      item.species,
      item.breed,
      item.sex,
      item.ageGroup,
      item.location,
      item.bio
    ].join(" ").toLowerCase();

    return filters.some((term) => haystack.includes(term));
  });
}

function sanitizeAsmUrl(value) {
  if (!value) {
    return "";
  }
  try {
    const url = new URL(value);
    for (const key of ["key", "password", "username"]) {
      if (url.searchParams.has(key)) {
        url.searchParams.set(key, "***");
      }
    }
    return url.toString();
  } catch {
    return value;
  }
}

function extractAsmRows(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }
  if (!payload || typeof payload !== "object") {
    return [];
  }
  for (const key of ["animals", "items", "results", "data", "rows", "result"]) {
    if (Array.isArray(payload[key])) {
      return payload[key];
    }
  }
  return [];
}

async function fetchAsmDiagnostics() {
  const requestUrl = buildAsmServiceUrl(state.asm.adoptableMethod || "json_adoptable_animals");
  if (!requestUrl) {
    return {
      ok: false,
      requestUrl: "",
      responseStatus: 0,
      contentType: "",
      sourceCount: 0,
      fieldNames: [],
      bodyPreview: "",
      firstItem: null,
      rows: [],
      mappedItems: [],
      error: "ASM service is not configured"
    };
  }

  const response = await fetch(requestUrl, { headers: { Accept: "application/json" } });
  const contentType = `${response.headers.get("content-type") || ""}`;
  const bodyText = await response.text();
  const bodyPreview = bodyText.slice(0, 500).replace(/\s+/g, " ").trim();

  if (!response.ok) {
    return {
      ok: false,
      requestUrl: sanitizeAsmUrl(requestUrl),
      responseStatus: response.status,
      contentType,
      sourceCount: 0,
      fieldNames: [],
      bodyPreview,
      firstItem: null,
      rows: [],
      mappedItems: [],
      error: `ASM HTTP ${response.status}`
    };
  }

  let parsed;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    return {
      ok: false,
      requestUrl: sanitizeAsmUrl(requestUrl),
      responseStatus: response.status,
      contentType,
      sourceCount: 0,
      fieldNames: [],
      bodyPreview,
      firstItem: null,
      rows: [],
      mappedItems: [],
      error: `ASM returned non-JSON content: ${bodyPreview || "empty response"}`
    };
  }

  const rows = extractAsmRows(parsed);
  const mappedItems = applyAdoptableCustomFilters(
    rows
      .filter((item) => (state.slideshow.excludeFeral ? !hasFeralFlag(item) : true))
      .filter((item) => (state.slideshow.readyTodayOnly ? isReadyToday(item) : true))
      .map(mapAsmAnimal)
      .filter((item) => item.id)
  );
  const firstItem = rows[0] && typeof rows[0] === "object" ? rows[0] : null;
  const fieldNames = firstItem ? Object.keys(firstItem) : [];
  const error = rows.length > 0 && mappedItems.length === 0
    ? "ASM returned records, but none matched the expected animal ID fields."
    : "";

  return {
    ok: !error,
    requestUrl: sanitizeAsmUrl(requestUrl),
    responseStatus: response.status,
    contentType,
    sourceCount: rows.length,
    fieldNames,
    bodyPreview,
    firstItem,
    rows,
    mappedItems,
    error
  };
}

async function getAsmAdoptables(force = false) {
  const now = Date.now();
  const ttlMs = Math.max(30, Number(state.asm.cacheSeconds || 600)) * 1000;
  if (!force && state.asmCache.fetchedAt > 0 && now - state.asmCache.fetchedAt < ttlMs) {
    return state.asmCache;
  }

  if (!state.asm.serviceUrl || !(state.asm.apiKey || (state.asm.username && state.asm.password))) {
    state.asmCache = {
      fetchedAt: now,
      items: [],
      error: "ASM service is not configured",
      sourceCount: 0,
      requestUrl: "",
      responseStatus: 0,
      contentType: "",
      fieldNames: [],
      bodyPreview: ""
    };
    return state.asmCache;
  }

  try {
    const result = await fetchAsmDiagnostics();
    state.asmCache = {
      fetchedAt: now,
      items: result.mappedItems || [],
      error: result.error || "",
      sourceCount: Number(result.sourceCount || 0),
      requestUrl: result.requestUrl || "",
      responseStatus: Number(result.responseStatus || 0),
      contentType: result.contentType || "",
      fieldNames: result.fieldNames || [],
      bodyPreview: result.bodyPreview || ""
    };
    return state.asmCache;
  } catch (error) {
    state.asmCache = {
      fetchedAt: now,
      items: [],
      error: error.message || "Failed to load adoptables",
      sourceCount: 0,
      requestUrl: "",
      responseStatus: 0,
      contentType: "",
      fieldNames: [],
      bodyPreview: ""
    };
    return state.asmCache;
  }
}

function persistEnvSetting(key, value) {
  try {
    const line = `${key}=${value}`;
    let text = "";
    if (fs.existsSync(ENV_FILE_PATH)) {
      text = fs.readFileSync(ENV_FILE_PATH, "utf8");
    }
    const pattern = new RegExp(`^${key}=.*$`, "m");
    if (pattern.test(text)) {
      text = text.replace(pattern, line);
    } else {
      text = `${text.trimEnd()}\n${line}\n`;
    }
    fs.writeFileSync(ENV_FILE_PATH, text, "utf8");
  } catch (error) {
    console.warn(`Unable to persist ${key} in .env: ${error.message}`);
  }
}

function readIniFile(filePath) {
  const result = {};
  if (!fs.existsSync(filePath)) {
    return result;
  }
  const text = fs.readFileSync(filePath, "utf8");
  let section = "";
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || line.startsWith(";")) {
      continue;
    }
    if (line.startsWith("[") && line.endsWith("]")) {
      section = line.slice(1, -1).trim().toLowerCase();
      if (!result[section]) {
        result[section] = {};
      }
      continue;
    }
    const eq = line.indexOf("=");
    if (eq < 0 || !section) {
      continue;
    }
    const key = line.slice(0, eq).trim().toLowerCase();
    const value = line.slice(eq + 1).trim();
    result[section][key] = value;
  }
  return result;
}

async function getAudioJackSettings() {
  const { stdout } = await execFileAsync("amixer", ["-c", "0", "sget", "Master"]);
  const pctMatch = stdout.match(/\[(\d+)%\]/);
  const switchMatch = stdout.match(/\[(on|off)\]/i);
  const volume = Math.max(0, Math.min(100, Number(pctMatch?.[1] || 0)));
  const muted = `${switchMatch?.[1] || "off"}`.toLowerCase() !== "on";
  return { volume, muted };
}

async function setAudioJackSettings({ volume, muted }) {
  const clamped = Math.max(0, Math.min(100, Number(volume || 0)));
  await execFileAsync("amixer", ["-c", "0", "set", "Master", `${clamped}%`, muted ? "mute" : "unmute"]);
  await execFileAsync("alsactl", ["store"]);
  return getAudioJackSettings();
}

function createEmployeeToken() {
  return crypto.randomBytes(24).toString("hex");
}

function sanitizeDisplayName(value) {
  const cleaned = `${value || ""}`.trim().replace(/\s+/g, " ");
  if (!cleaned) {
    return "Guest";
  }
  return cleaned.slice(0, 40);
}

function isSessionExpired(session) {
  const ttlMs = Math.max(1, EMPLOYEE_SESSION_TTL_MINUTES) * 60 * 1000;
  const issuedAt = Date.parse(session.createdAt || "");
  if (!Number.isFinite(issuedAt)) {
    return true;
  }
  return Date.now() - issuedAt > ttlMs;
}

function getActiveListenerCount() {
  let count = 0;
  for (const [token, session] of state.employeeSessions.entries()) {
    if (isSessionExpired(session)) {
      state.employeeSessions.delete(token);
      continue;
    }
    count += 1;
  }
  return count;
}

function rateLimitEmployeeRequests(req, res, next) {
  const token = req.employeeToken || "";
  const ip = req.ip || req.socket?.remoteAddress || "unknown";
  const key = `${token}:${ip}`;
  const now = Date.now();
  const existing = state.requestRateByKey.get(key);

  if (!existing || now - existing.windowStart > REQUESTS_RATE_WINDOW_MS) {
    state.requestRateByKey.set(key, { windowStart: now, count: 1, lastSeen: now });
    next();
    return;
  }

  existing.count += 1;
  existing.lastSeen = now;
  state.requestRateByKey.set(key, existing);

  if (existing.count > REQUESTS_RATE_MAX) {
    res.status(429).json({ error: "Too many requests. Please slow down." });
    return;
  }

  next();
}

async function cleanupRequestMetadata() {
  const tlTracks = await mopidyRpc("core.tracklist.get_tl_tracks");
  const activeTlids = new Set((tlTracks || []).map((item) => item.tlid));
  for (const tlid of state.requestMetaByTlid.keys()) {
    if (!activeTlids.has(tlid)) {
      state.requestMetaByTlid.delete(tlid);
    }
  }
}

function requireEmployee(req, res, next) {
  const authHeader = req.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  const session = token ? state.employeeSessions.get(token) : null;

  if (!session) {
    res.status(401).json({ error: "Not authorized." });
    return;
  }

  if (isSessionExpired(session)) {
    state.employeeSessions.delete(token);
    res.status(401).json({ error: "Session expired. Please join again." });
    return;
  }

  if (session.userId) {
    const user = getUserById(session.userId);
    if (!user) {
      state.employeeSessions.delete(token);
      res.status(401).json({ error: "User account is inactive. Contact an admin." });
      return;
    }
    req.staffAccount = user;
    if (isUserAdmin(user)) {
      req.adminStreamAccount = user;
    }
  }

  req.employeeSession = session;
  req.employeeToken = token;
  next();
}

async function mopidyRpc(method, params = {}) {
  const response = await fetch(MOPIDY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: Date.now(),
      method,
      params
    })
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Mopidy request failed: ${response.status}`);
  }

  if (payload.error) {
    throw new Error(payload.error.message || "Mopidy RPC error");
  }

  return payload.result;
}

function mapMopidyTrack(track = {}) {
  const rawImage = track.album?.images?.[0]?.uri || track.album?.images?.[0]?.url || "";
  let imageUrl = "";
  if (typeof rawImage === "string") {
    if (rawImage.startsWith("http://") || rawImage.startsWith("https://")) {
      imageUrl = rawImage;
    } else if (rawImage.startsWith("spotify:image:")) {
      imageUrl = `https://i.scdn.co/image/${rawImage.slice("spotify:image:".length)}`;
    }
  }

  return {
    uri: track.uri,
    name: track.name || "Unknown track",
    album: track.album?.name || "",
    artists: (track.artists || []).map((artist) => artist.name).join(", "),
    durationMs: Number(track.length || 0),
    explicit: Boolean(track.explicit),
    imageUrl
  };
}

function mapQueueTrack(entry = {}) {
  const mapped = mapMopidyTrack(entry.track || {});
  const meta = state.requestMetaByTlid.get(entry.tlid) || null;
  const voteStats = getTrackVoteSummary(mapped.uri || "");
  return {
    tlid: entry.tlid,
    ...mapped,
    requestedBy: meta?.requestedBy || "",
    requestedAt: meta?.requestedAt || null,
    requestedByToken: meta?.requestedByToken || "",
    upvotes: voteStats.upvotes,
    downvotes: voteStats.downvotes,
    voteScore: voteStats.score
  };
}

function shuffleArray(items = []) {
  const list = [...items];
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

async function randomizeQueuePreservingCurrent() {
  const tlTracks = await mopidyRpc("core.tracklist.get_tl_tracks");
  const queue = Array.isArray(tlTracks) ? [...tlTracks] : [];
  if (queue.length < 2) {
    return queue;
  }

  let currentTlTrack = null;
  try {
    currentTlTrack = await mopidyRpc("core.playback.get_current_tl_track");
  } catch {
    currentTlTrack = null;
  }
  const currentTlid = Number(currentTlTrack?.tlid || 0);

  const movable = currentTlid
    ? queue.filter((entry) => Number(entry.tlid) !== currentTlid)
    : queue;
  const shuffled = shuffleArray(movable);
  const desiredOrder = currentTlid
    ? [queue.find((entry) => Number(entry.tlid) === currentTlid), ...shuffled].filter(Boolean)
    : shuffled;

  const workingOrder = [...queue];
  for (let targetIndex = 0; targetIndex < desiredOrder.length; targetIndex += 1) {
    const desiredTlid = Number(desiredOrder[targetIndex]?.tlid || 0);
    const currentIndex = workingOrder.findIndex((entry) => Number(entry.tlid) === desiredTlid);
    if (currentIndex < 0 || currentIndex === targetIndex) {
      continue;
    }

    await mopidyRpc("core.tracklist.move", {
      start: currentIndex,
      end: currentIndex + 1,
      to_position: targetIndex
    });

    const [moved] = workingOrder.splice(currentIndex, 1);
    workingOrder.splice(targetIndex, 0, moved);
  }

  return workingOrder;
}

async function getPendingCountForToken(token) {
  await cleanupRequestMetadata();
  let count = 0;
  for (const [tlid, meta] of state.requestMetaByTlid.entries()) {
    if (meta.requestedByToken === token) {
      count += 1;
    }
  }
  return count;
}

const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [token, session] of state.employeeSessions.entries()) {
    if (isSessionExpired(session)) {
      state.employeeSessions.delete(token);
    }
  }

  for (const [key, bucket] of state.requestRateByKey.entries()) {
    if (now - bucket.lastSeen > REQUESTS_RATE_WINDOW_MS * 3) {
      state.requestRateByKey.delete(key);
    }
  }

  cleanupRequestMetadata().catch(() => {
    // Ignore cleanup errors; request handlers will retry as needed.
  });

  // Admin session cleanup (no TTL enforced — explicit logout only, but prune
  // any sessions that somehow have no createdAt).
  for (const [token, session] of state.adminSessions.entries()) {
    const admin = session?.userId
      ? getUserById(session.userId)
      : null;
    if (!session?.createdAt || !admin || !isUserAdmin(admin)) {
      state.adminSessions.delete(token);
    }
  }
}, 60000);

cleanupTimer.unref();

async function getValidAccessToken() {
  if (!state.tokens?.access_token) {
    throw new Error("Not authenticated with Spotify.");
  }

  if (!state.spotify.clientId || !state.spotify.clientSecret) {
    throw new Error("Spotify credentials are not configured.");
  }

  const isExpiring = Date.now() >= (state.tokens.expires_at || 0) - 30 * 1000;
  if (isExpiring) {
    state.tokens = await refreshAccessToken({
      clientId: state.spotify.clientId,
      clientSecret: state.spotify.clientSecret,
      refreshToken: state.tokens.refresh_token
    });
  }

  return state.tokens.access_token;
}

async function spotify({ method = "GET", path, query, body }) {
  const accessToken = await getValidAccessToken();
  return spotifyApiRequest({ accessToken, method, path, query, body });
}

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    spotifyConnected: Boolean(state.tokens?.access_token),
    activeDeviceId: state.spotify.activeDeviceId,
    queueLength: state.localQueue.length
  });
});

function requireAdmin(req, res, next) {
  const authHeader = req.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!token || !state.adminSessions.has(token)) {
    res.status(401).json({ error: "Admin access required." });
    return;
  }
  const admin = getAdminBySessionToken(token);
  if (!admin) {
    state.adminSessions.delete(token);
    res.status(401).json({ error: "Admin session is invalid." });
    return;
  }
  req.adminToken = token;
  req.adminAccount = admin;
  next();
}

app.get("/api/requests/health", async (_req, res) => {
  try {
    await mopidyRpc("core.get_uri_schemes");
    res.json({ ok: true, mopidyOnline: true });
  } catch (error) {
    res.status(503).json({ ok: false, mopidyOnline: false, error: error.message });
  }
});

app.get("/requests", (_req, res) => {
  res.redirect("/requests.html");
});

app.get("/admin", (_req, res) => {
  res.redirect("/admin.html");
});

app.get("/local-player", (_req, res) => {
  res.redirect("/local-player.html");
});

app.get("/listen", (_req, res) => {
  res.redirect("/listen.html");
});

app.get("/adoptable-stream", (_req, res) => {
  res.redirect("/adoptable-stream.html");
});

app.get("/live.mp3", async (_req, res) => {
  if (state.audioAutomation.streamDeliveryEnabled === false) {
    res.status(503).json({ error: "Live stream delivery is currently scheduled off." });
    return;
  }
  try {
    const upstream = await fetch("http://127.0.0.1:8000/stream.mp3");
    if (!upstream.ok || !upstream.body) {
      res.status(503).json({ error: "Live stream is not available yet." });
      return;
    }

    const streamEntry = {
      res,
      upstream: upstream.body
    };
    state.audioAutomationRuntime.activeLiveStreams.add(streamEntry);
    const cleanup = () => {
      state.audioAutomationRuntime.activeLiveStreams.delete(streamEntry);
    };
    res.on("close", cleanup);
    res.on("finish", cleanup);
    upstream.body.on?.("close", cleanup);
    upstream.body.on?.("end", cleanup);

    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "no-store");
    upstream.body.pipe(res);
  } catch (error) {
    res.status(503).json({ error: error.message || "Live stream unavailable." });
  }
});

// ── Admin auth ────────────────────────────────────────────────────────────────

app.post("/api/admin/session", (req, res) => {
  const usernameResult = normalizeEmailUsername(req.body?.username, { requireValid: true });
  const username = usernameResult.ok ? usernameResult.email : "";
  const password = `${req.body?.password || ""}`;
  if (!usernameResult.ok) {
    res.status(400).json({
      error: "username must be a valid email address.",
      suggestion: usernameResult.suggestion
    });
    return;
  }
  if (!username || !password) {
    res.status(400).json({ error: "username and password are required." });
    return;
  }
  const admin = findUserByUsername(username);
  if (!admin || !isUserAdmin(admin) || !verifyPassword(password, admin.passwordSalt, admin.passwordHash)) {
    res.status(401).json({ error: "Invalid username or password." });
    return;
  }

  const token = crypto.randomBytes(32).toString("hex");
  const now = new Date().toISOString();
  state.adminSessions.set(token, { userId: admin.id, createdAt: now });
  admin.lastLoginAt = now;
  admin.updatedAt = now;
  saveAdminDb();
  logAdminHistory(admin.id, "login", `User ${admin.username} logged in`);

  res.status(201).json({
    token,
    admin: {
      id: admin.id,
      username: admin.username,
      displayName: admin.displayName,
      lastLoginAt: admin.lastLoginAt
    }
  });
});

app.post("/api/admin/session/logout", requireAdmin, (req, res) => {
  logAdminHistory(req.adminAccount.id, "logout", `User ${req.adminAccount.username} logged out`);
  state.adminSessions.delete(req.adminToken);
  res.json({ ok: true });
});

app.post("/api/admin/stream/session", requireAdmin, (req, res) => {
  const token = createEmployeeToken();
  const session = {
    displayName: req.adminAccount.displayName || req.adminAccount.username,
    userId: req.adminAccount.id,
    createdAt: new Date().toISOString()
  };
  state.employeeSessions.set(token, session);
  res.status(201).json({ ok: true, token, session });
});

app.post("/api/admin/session/from-employee", requireEmployee, (req, res) => {
  const admin = req.adminStreamAccount || null;
  if (!admin) {
    res.status(403).json({ error: "Admin access required." });
    return;
  }

  const token = crypto.randomBytes(32).toString("hex");
  const now = new Date().toISOString();
  state.adminSessions.set(token, { userId: admin.id, createdAt: now });
  admin.lastLoginAt = now;
  admin.updatedAt = now;
  saveAdminDb();
  logAdminHistory(admin.id, "login", `User ${admin.username} elevated from employee session`);

  res.status(201).json({
    token,
    admin: {
      id: admin.id,
      username: admin.username,
      displayName: admin.displayName,
      lastLoginAt: admin.lastLoginAt
    }
  });
});

app.get("/api/admin/account/me", requireAdmin, (req, res) => {
  try {
    const admin = req.adminAccount;
    if (!admin || !admin.id) {
      res.status(404).json({ error: "Account not found." });
      return;
    }
    // Refresh from database to get latest profile data
    const current = getUserById(admin.id);
    if (!current) {
      res.status(404).json({ error: "Account not found." });
      return;
    }
    res.json({
      id: current.id,
      username: current.username,
      displayName: current.displayName,
      firstName: current.firstName || "",
      lastInitial: current.lastInitial || "",
      requestLimit: Math.max(1, Number(current.requestLimit || state.adminDb.staffDefaults?.requestLimit || MAX_PENDING_PER_USER)),
      groups: Array.isArray(current.groups) ? current.groups : [],
      isAdmin: isUserAdmin(current),
      active: current.active !== false,
      createdAt: current.createdAt,
      updatedAt: current.updatedAt,
      lastLoginAt: current.lastLoginAt
    });
  } catch (error) {
    console.error("GET /api/admin/account/me error:", error);
    res.status(500).json({ error: "Internal server error." });
  }
});

app.patch("/api/admin/account/profile", requireAdmin, (req, res) => {
  try {
    const account = req.adminAccount;
    if (!account || !account.id) {
      res.status(404).json({ error: "Account not found." });
      return;
    }
    // Refresh from database to ensure we're updating the latest version
    const current = getUserById(account.id);
    if (!current) {
      res.status(404).json({ error: "Account not found." });
      return;
    }
    const displayName = sanitizeAdminDisplayName(req.body?.displayName);
    if (!displayName) {
      res.status(400).json({ error: "displayName is required." });
      return;
    }
    current.displayName = displayName;
    current.updatedAt = new Date().toISOString();
    saveAdminDb();
    logAdminHistory(account.id, "profile-update", `Display name changed to ${displayName}`);
    res.json({ ok: true, displayName });
  } catch (error) {
    console.error("PATCH /api/admin/account/profile error:", error);
    res.status(500).json({ error: "Internal server error." });
  }
});

app.post("/api/admin/account/password", requireAdmin, (req, res) => {
  try {
    const account = req.adminAccount;
    if (!account || !account.id) {
      res.status(404).json({ error: "Account not found." });
      return;
    }
    // Refresh from database to ensure we're updating the latest version
    const current = getUserById(account.id);
    if (!current) {
      res.status(404).json({ error: "Account not found." });
      return;
    }
    const currentPassword = `${req.body?.currentPassword || ""}`;
    const newPassword = `${req.body?.newPassword || ""}`;

    if (!currentPassword || !newPassword) {
      res.status(400).json({ error: "currentPassword and newPassword are required." });
      return;
    }
    if (newPassword.length < 8) {
      res.status(400).json({ error: "New password must be at least 8 characters." });
      return;
    }
    if (!verifyPassword(currentPassword, current.passwordSalt, current.passwordHash)) {
      res.status(401).json({ error: "Current password is incorrect." });
      return;
    }

    const next = hashPassword(newPassword);
    current.passwordSalt = next.salt;
    current.passwordHash = next.hash;
    current.updatedAt = new Date().toISOString();
    saveAdminDb();
    logAdminHistory(account.id, "password-change", "Password was changed");
    res.json({ ok: true });
  } catch (error) {
    console.error("POST /api/admin/account/password error:", error);
    res.status(500).json({ error: "Internal server error." });
  }
});

app.get("/api/admin/account/history", requireAdmin, (req, res) => {
  const limit = Math.max(1, Math.min(100, Number(req.query.limit || 25)));
  const history = (state.adminDb.history || [])
    .slice()
    .reverse()
    .slice(0, limit)
    .map((entry) => {
      const actor = (state.adminDb.users || []).find((item) => item.id === entry.adminId);
      return {
        id: entry.id,
        adminId: entry.adminId,
        actor: actor ? actor.username : "system",
        action: entry.action,
        detail: entry.detail,
        createdAt: entry.createdAt
      };
    });
  res.json({ history });
});

app.get("/api/admin/account/users", requireAdmin, (_req, res) => {
  const users = (state.adminDb.users || []).map((item) => ({
    id: item.id,
    username: item.username,
    displayName: item.displayName,
    firstName: item.firstName || "",
    lastInitial: item.lastInitial || "",
    requestLimit: Math.max(1, Number(item.requestLimit || state.adminDb.staffDefaults?.requestLimit || MAX_PENDING_PER_USER)),
    groups: Array.isArray(item.groups) ? item.groups : [],
    isAdmin: isUserAdmin(item),
    active: item.active !== false,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    lastLoginAt: item.lastLoginAt
  }));
  res.json({ users });
});

app.post("/api/admin/account/users", requireAdmin, (req, res) => {
  const usernameInput = req.body?.username;
  const usernameResult = normalizeEmailUsername(usernameInput, { requireValid: true });
  const username = usernameResult.ok ? usernameResult.email : "";
  const displayName = sanitizeAdminDisplayName(req.body?.displayName || username || "User");
  const firstName = sanitizeFirstName(req.body?.firstName || req.body?.displayName || "");
  const lastInitial = sanitizeLastInitial(req.body?.lastInitial || "");
  const password = `${req.body?.password || ""}`;
  const requestLimit = Math.max(1, Number(req.body?.requestLimit || state.adminDb.staffDefaults?.requestLimit || MAX_PENDING_PER_USER));
  const groups = Array.isArray(req.body?.groups)
    ? req.body.groups.map((item) => `${item || ""}`.trim().toLowerCase()).filter(Boolean)
    : [];
  if (req.body?.isAdmin === true && !groups.includes("admins")) {
    groups.push("admins");
  }

  if (!usernameResult.ok) {
    res.status(400).json({
      error: "username must be a valid email address.",
      suggestion: usernameResult.suggestion
    });
    return;
  }
  if (!displayName) {
    res.status(400).json({ error: "displayName is required." });
    return;
  }
  if (password.length < 8) {
    res.status(400).json({ error: "Password must be at least 8 characters." });
    return;
  }
  if ((state.adminDb.users || []).some((item) => item.username === username)) {
    res.status(409).json({ error: "Username already exists." });
    return;
  }

  const now = new Date().toISOString();
  const pwd = hashPassword(password);
  const user = {
    id: crypto.randomUUID(),
    username,
    displayName,
    firstName,
    lastInitial,
    passwordSalt: pwd.salt,
    passwordHash: pwd.hash,
    requestLimit,
    groups,
    active: true,
    createdAt: now,
    updatedAt: now,
    lastLoginAt: null
  };
  state.adminDb.users.push(user);
  saveAdminDb();
  logAdminHistory(req.adminAccount.id, "user-create", `Created user ${username}`);

  res.status(201).json({
    ok: true,
    user: {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      firstName: user.firstName,
      lastInitial: user.lastInitial,
      requestLimit: user.requestLimit,
      groups: user.groups,
      isAdmin: isUserAdmin(user),
      active: user.active,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      lastLoginAt: user.lastLoginAt
    }
  });
});

app.delete("/api/admin/account/users/:id", requireAdmin, (req, res) => {
  const id = `${req.params.id || ""}`;
  const target = (state.adminDb.users || []).find((item) => item.id === id);
  if (!target) {
    res.status(404).json({ error: "User not found." });
    return;
  }
  if (target.id === req.adminAccount.id) {
    res.status(400).json({ error: "You cannot delete the account currently signed in." });
    return;
  }

  state.adminDb.users = (state.adminDb.users || []).filter((item) => item.id !== id);
  for (const [token, session] of state.adminSessions.entries()) {
    if (session?.userId === id) {
      state.adminSessions.delete(token);
    }
  }
  saveAdminDb();
  logAdminHistory(req.adminAccount.id, "user-delete", `Deleted user ${target.username}`);
  res.json({ ok: true });
});

app.patch("/api/admin/account/users/:id/groups", requireAdmin, (req, res) => {
  const id = `${req.params.id || ""}`;
  const target = (state.adminDb.users || []).find((item) => item.id === id);
  if (!target) {
    res.status(404).json({ error: "User not found." });
    return;
  }

  const requestedGroups = Array.isArray(req.body?.groups)
    ? req.body.groups.map((item) => `${item || ""}`.trim().toLowerCase()).filter(Boolean)
    : [];
  const groups = Array.from(new Set(requestedGroups));
  if (target.id === req.adminAccount.id && !groups.includes("admins")) {
    res.status(400).json({ error: "You cannot remove your own admin rights." });
    return;
  }

  target.groups = groups;
  target.updatedAt = new Date().toISOString();
  saveAdminDb();
  logAdminHistory(req.adminAccount.id, "user-groups-update", `Updated groups for ${target.username} to ${groups.join(",") || "none"}`);
  res.json({ ok: true, groups: target.groups, isAdmin: isUserAdmin(target) });
});

// ── User access settings ─────────────────────────────────────────────────────

app.get("/api/admin/staff", requireAdmin, (_req, res) => {
  ensureDailyRequestWindow();
  const staff = (state.adminDb.users || []).map((item) => ({
    id: item.id,
    firstName: item.firstName || "",
    lastInitial: item.lastInitial || "",
    username: item.username,
    displayName: formatUserDisplayName(item),
    isAdmin: isUserAdmin(item),
    active: item.active !== false,
    requestLimit: Math.max(1, Number(item.requestLimit || state.adminDb.staffDefaults?.requestLimit || MAX_PENDING_PER_USER)),
    usedToday: getDailyRequestsUsed(item.id),
    createdAt: item.createdAt,
    updatedAt: item.updatedAt
  }));
  res.json({
    defaults: {
      requestLimit: Math.max(1, Number(state.adminDb.staffDefaults?.requestLimit || MAX_PENDING_PER_USER))
    },
    daily: {
      dateKey: state.userDb.daily.dateKey
    },
    staff
  });
});

app.post("/api/admin/staff", requireAdmin, (req, res) => {
  const firstName = sanitizeFirstName(req.body?.firstName);
  const lastInitial = sanitizeLastInitial(req.body?.lastInitial);
  const usernameResult = normalizeEmailUsername(req.body?.username, { requireValid: true });
  const username = usernameResult.ok ? usernameResult.email : "";
  const password = `${req.body?.password || ""}`;
  const requestLimit = Math.max(1, Number(req.body?.requestLimit || state.adminDb.staffDefaults?.requestLimit || MAX_PENDING_PER_USER));
  const groups = Array.isArray(req.body?.groups)
    ? req.body.groups.map((item) => `${item || ""}`.trim().toLowerCase()).filter(Boolean)
    : [];
  if (req.body?.isAdmin === true && !groups.includes("admins")) {
    groups.push("admins");
  }

  if (!firstName || !lastInitial) {
    res.status(400).json({ error: "firstName and lastInitial are required." });
    return;
  }
  if (!usernameResult.ok) {
    res.status(400).json({
      error: "username must be a valid email address.",
      suggestion: usernameResult.suggestion
    });
    return;
  }
  if (password.length < 6) {
    res.status(400).json({ error: "Password must be at least 6 characters." });
    return;
  }
  if ((state.adminDb.users || []).some((item) => item.username === username)) {
    res.status(409).json({ error: "That username is already in use." });
    return;
  }

  const now = new Date().toISOString();
  const pwd = hashPassword(password);
  const staff = {
    id: crypto.randomUUID(),
    firstName,
    lastInitial,
    displayName: sanitizeAdminDisplayName(`${firstName} ${lastInitial}.`),
    username,
    passwordSalt: pwd.salt,
    passwordHash: pwd.hash,
    requestLimit,
    groups,
    active: true,
    createdAt: now,
    updatedAt: now
  };
  state.adminDb.users.push(staff);
  saveAdminDb();
  logAdminHistory(req.adminAccount.id, "user-create", `Created user ${formatUserDisplayName(staff)} (${username})`);

  res.status(201).json({
    ok: true,
    staff: {
      id: staff.id,
      firstName: staff.firstName,
      lastInitial: staff.lastInitial,
      username: staff.username,
      displayName: formatUserDisplayName(staff),
      requestLimit: staff.requestLimit,
      groups: staff.groups,
      isAdmin: isUserAdmin(staff),
      active: staff.active
    }
  });
});

app.patch("/api/admin/staff/:id", requireAdmin, (req, res) => {
  const id = `${req.params.id || ""}`;
  const staff = (state.adminDb.users || []).find((item) => item.id === id);
  if (!staff) {
    res.status(404).json({ error: "User account not found." });
    return;
  }

  if (req.body?.username !== undefined) {
    const usernameResult = normalizeEmailUsername(req.body.username, { requireValid: true });
    if (!usernameResult.ok) {
      res.status(400).json({
        error: "username must be a valid email address.",
        suggestion: usernameResult.suggestion
      });
      return;
    }
    const value = usernameResult.email;
    if ((state.adminDb.users || []).some((item) => item.id !== id && item.username === value)) {
      res.status(409).json({ error: "That username is already in use." });
      return;
    }
    staff.username = value;
  }

  if (req.body?.firstName !== undefined) {
    const value = sanitizeFirstName(req.body.firstName);
    if (!value) {
      res.status(400).json({ error: "firstName cannot be empty." });
      return;
    }
    staff.firstName = value;
  }

  if (req.body?.lastInitial !== undefined) {
    const value = sanitizeLastInitial(req.body.lastInitial);
    if (!value) {
      res.status(400).json({ error: "lastInitial cannot be empty." });
      return;
    }
    staff.lastInitial = value;
  }

  if (req.body?.password !== undefined) {
    const newPass = `${req.body.password || ""}`;
    if (newPass.length < 6) {
      res.status(400).json({ error: "Password must be at least 6 characters." });
      return;
    }
    const hashed = hashPassword(newPass);
    staff.passwordSalt = hashed.salt;
    staff.passwordHash = hashed.hash;
  }

  if (req.body?.requestLimit !== undefined) {
    staff.requestLimit = Math.max(1, Number(req.body.requestLimit || state.adminDb.staffDefaults?.requestLimit || MAX_PENDING_PER_USER));
  }

  if (req.body?.active !== undefined) {
    staff.active = Boolean(req.body.active);
  }

  if (req.body?.groups !== undefined || req.body?.isAdmin !== undefined) {
    const groups = Array.isArray(req.body?.groups)
      ? req.body.groups.map((item) => `${item || ""}`.trim().toLowerCase()).filter(Boolean)
      : Array.isArray(staff.groups)
        ? [...staff.groups]
        : [];
    if (req.body?.isAdmin === true && !groups.includes("admins")) {
      groups.push("admins");
    }
    if (req.body?.isAdmin === false) {
      if (staff.id === req.adminAccount.id) {
        res.status(400).json({ error: "You cannot remove your own admin rights." });
        return;
      }
      staff.groups = groups.filter((entry) => entry !== "admins");
    } else {
      staff.groups = Array.from(new Set(groups));
    }
  }

  staff.displayName = sanitizeAdminDisplayName(staff.displayName || formatUserDisplayName(staff));

  staff.updatedAt = new Date().toISOString();
  saveAdminDb();
  logAdminHistory(req.adminAccount.id, "user-update", `Updated user ${formatUserDisplayName(staff)}`);
  res.json({ ok: true });
});

app.post("/api/admin/staff/:id/reset-password", requireAdmin, (req, res) => {
  const id = `${req.params.id || ""}`;
  const staff = (state.adminDb.users || []).find((item) => item.id === id);
  if (!staff) {
    res.status(404).json({ error: "User account not found." });
    return;
  }
  const newPassword = `${req.body?.password || ""}`;
  if (newPassword.length < 6) {
    res.status(400).json({ error: "Password must be at least 6 characters." });
    return;
  }
  const hashed = hashPassword(newPassword);
  staff.passwordSalt = hashed.salt;
  staff.passwordHash = hashed.hash;
  staff.updatedAt = new Date().toISOString();
  saveAdminDb();
  logAdminHistory(req.adminAccount.id, "user-reset-password", `Reset password for ${formatUserDisplayName(staff)}`);
  res.json({ ok: true });
});

app.delete("/api/admin/staff/:id", requireAdmin, (req, res) => {
  const id = `${req.params.id || ""}`;
  const staff = (state.adminDb.users || []).find((item) => item.id === id);
  if (!staff) {
    res.status(404).json({ error: "User account not found." });
    return;
  }
  if (staff.id === req.adminAccount.id) {
    res.status(400).json({ error: "You cannot delete the account currently signed in." });
    return;
  }

  state.adminDb.users = (state.adminDb.users || []).filter((item) => item.id !== id);
  if (state.userDb?.daily?.perUser && state.userDb.daily.perUser[id] !== undefined) {
    delete state.userDb.daily.perUser[id];
    saveUserDb();
  }
  for (const [token, session] of state.employeeSessions.entries()) {
    if (session?.userId === id) {
      state.employeeSessions.delete(token);
    }
  }
  saveAdminDb();
  logAdminHistory(req.adminAccount.id, "user-delete", `Deleted user ${formatUserDisplayName(staff)}`);
  res.json({ ok: true });
});

app.post("/api/admin/staff/default-limit", requireAdmin, (req, res) => {
  const requestLimit = Math.max(1, Number(req.body?.requestLimit || state.adminDb.staffDefaults?.requestLimit || MAX_PENDING_PER_USER));
  state.adminDb.staffDefaults = {
    ...(state.adminDb.staffDefaults || {}),
    requestLimit
  };
  saveAdminDb();
  logAdminHistory(req.adminAccount.id, "staff-default-limit", `Set user default request limit to ${requestLimit}`);
  res.json({ ok: true, requestLimit });
});

app.get("/api/admin/requests/stats", requireAdmin, (_req, res) => {
  res.json({
    topPlayed: getTopPlayed(10),
    topSkipped: getTopSkipped(10),
    topUpvoted: getTopUpvoted(10),
    topDownvoted: getTopDownvoted(10),
    daily: {
      dateKey: state.userDb.daily.dateKey,
      perUser: state.userDb.daily.perUser
    }
  });
});

app.get("/api/admin/settings/audio-jack", requireAdmin, async (_req, res) => {
  try {
    const current = await getAudioJackSettings();
    res.json({
      ok: true,
      card: 0,
      ...current
    });
  } catch (error) {
    res.status(500).json({ error: error.message || "Unable to read audio jack settings" });
  }
});

app.post("/api/admin/settings/audio-jack", requireAdmin, async (req, res) => {
  try {
    const body = req.body || {};
    if (body.volume === undefined && body.muted === undefined) {
      res.status(400).json({ error: "Provide volume and/or muted" });
      return;
    }
    const current = await getAudioJackSettings();
    const nextVolume = body.volume === undefined ? current.volume : Number(body.volume);
    const nextMuted = body.muted === undefined ? current.muted : Boolean(body.muted);
    const updated = await setAudioJackSettings({ volume: nextVolume, muted: nextMuted });
    res.json({ ok: true, card: 0, ...updated });
  } catch (error) {
    res.status(500).json({ error: error.message || "Unable to update audio jack settings" });
  }
});

app.get("/api/admin/settings/stream-delivery", requireAdmin, (_req, res) => {
  res.json({
    ok: true,
    enabled: state.audioAutomation.streamDeliveryEnabled !== false,
    activeListeners: state.audioAutomationRuntime.activeLiveStreams.size
  });
});

app.post("/api/admin/settings/stream-delivery", requireAdmin, async (req, res) => {
  try {
    const enabled = req.body?.enabled !== false;
    const result = await setStreamDeliveryEnabled(enabled);
    res.json({ ok: true, ...result });
  } catch (error) {
    res.status(500).json({ error: error.message || "Unable to update stream delivery" });
  }
});

app.get("/api/admin/settings/audio-automation", requireAdmin, async (_req, res) => {
  try {
    const [audioJack, playbackState] = await Promise.all([
      getAudioJackSettings(),
      mopidyRpc("core.playback.get_state").catch(() => "unknown")
    ]);
    const now = new Date();
    const serverTime = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    res.json({
      ok: true,
      streamDeliveryEnabled: state.audioAutomation.streamDeliveryEnabled !== false,
      activeListeners: state.audioAutomationRuntime.activeLiveStreams.size,
      schedules: sanitizeAudioAutomationSchedules(state.audioAutomation.schedules || []),
      targetActions: AUDIO_AUTOMATION_TARGET_ACTIONS,
      audioJack,
      playbackState: `${playbackState || "unknown"}`,
      serverTime
    });
  } catch (error) {
    res.status(500).json({ error: error.message || "Unable to load audio automation settings" });
  }
});

app.post("/api/admin/audio-automation/schedules", requireAdmin, (req, res) => {
  const rule = sanitizeAudioAutomationSchedule(req.body || {});
  state.audioAutomation.schedules = [
    ...sanitizeAudioAutomationSchedules(state.audioAutomation.schedules || []),
    rule
  ];
  saveAudioAutomationConfig();
  res.status(201).json({ ok: true, schedule: rule });
});

app.patch("/api/admin/audio-automation/schedules/:id", requireAdmin, (req, res) => {
  const id = `${req.params.id || ""}`.trim();
  const current = sanitizeAudioAutomationSchedules(state.audioAutomation.schedules || []);
  const existing = current.find((item) => item.id === id);
  if (!existing) {
    res.status(404).json({ error: "Schedule not found." });
    return;
  }
  const next = sanitizeAudioAutomationSchedule({
    ...existing,
    ...(req.body || {}),
    id: existing.id,
    createdAt: existing.createdAt,
    lastTriggeredAt: existing.lastTriggeredAt
  });
  state.audioAutomation.schedules = current.map((item) => (item.id === id ? next : item));
  saveAudioAutomationConfig();
  res.json({ ok: true, schedule: next });
});

app.delete("/api/admin/audio-automation/schedules/:id", requireAdmin, (req, res) => {
  const id = `${req.params.id || ""}`.trim();
  const current = sanitizeAudioAutomationSchedules(state.audioAutomation.schedules || []);
  const existing = current.find((item) => item.id === id);
  if (!existing) {
    res.status(404).json({ error: "Schedule not found." });
    return;
  }
  state.audioAutomation.schedules = current.filter((item) => item.id !== id);
  saveAudioAutomationConfig();
  res.json({ ok: true });
});

app.post("/api/admin/audio-automation/schedules/:id/run", requireAdmin, async (req, res) => {
  try {
    const id = `${req.params.id || ""}`.trim();
    const rule = sanitizeAudioAutomationSchedules(state.audioAutomation.schedules || []).find((item) => item.id === id);
    if (!rule) {
      res.status(404).json({ error: "Schedule not found." });
      return;
    }
    const result = await runAudioAutomationSchedule(rule, "manual-run");
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message || "Unable to run schedule" });
  }
});

// ── Admin Spotify enrollment/settings ────────────────────────────────────────

app.get("/api/admin/settings/spotify", requireAdmin, async (_req, res) => {
  const configPath = "/etc/mopidy/mopidy.conf";
  try {
    const ini = readIniFile(configPath);
    const spotifyCfg = ini.spotify || {};
    const audioCfg = ini.audio || {};
    const uriSchemes = await mopidyRpc("core.get_uri_schemes");
    const spotifySchemeAvailable = Array.isArray(uriSchemes) && uriSchemes.includes("spotify");
    const enabled = `${spotifyCfg.enabled || ""}`.toLowerCase() === "true";
    res.json({
      mode: "mopidy-spotify",
      configPath,
      enabled,
      configured: enabled && Boolean(spotifyCfg.client_id) && Boolean(spotifyCfg.client_secret),
      spotifySchemeAvailable,
      clientIdConfigured: Boolean(spotifyCfg.client_id),
      clientSecretConfigured: Boolean(spotifyCfg.client_secret),
      bitrate: spotifyCfg.bitrate || "",
      allowPlaylists: `${spotifyCfg.allow_playlists || ""}`.toLowerCase() === "true",
      searchTrackCount: Number(spotifyCfg.search_track_count || 0),
      activeDeviceId: state.spotify.activeDeviceId,
      outputSummary: audioCfg.output || "",
      uriSchemes: Array.isArray(uriSchemes) ? uriSchemes : []
    });
  } catch (error) {
    res.status(500).json({
      mode: "mopidy-spotify",
      configured: false,
      enabled: false,
      spotifySchemeAvailable: false,
      clientIdConfigured: false,
      clientSecretConfigured: false,
      bitrate: "",
      allowPlaylists: false,
      searchTrackCount: 0,
      activeDeviceId: state.spotify.activeDeviceId,
      outputSummary: "",
      uriSchemes: [],
      error: error.message
    });
  }
});

app.post("/api/admin/settings/spotify", requireAdmin, (req, res) => {
  const body = req.body || {};
  const clientId = body.clientId !== undefined ? `${body.clientId}`.trim() : state.spotify.clientId;
  const clientSecretCandidate = body.clientSecret !== undefined ? `${body.clientSecret}`.trim() : undefined;
  const redirectUri = body.redirectUri !== undefined ? `${body.redirectUri}`.trim() : state.spotify.redirectUri;

  state.spotify.clientId = clientId;
  state.spotify.clientSecret = clientSecretCandidate === undefined || clientSecretCandidate === ""
    ? state.spotify.clientSecret
    : clientSecretCandidate;
  state.spotify.redirectUri = redirectUri || `${BASE_URL}/auth/callback`;
  state.tokens = null;

  persistEnvSetting("SPOTIFY_CLIENT_ID", state.spotify.clientId);
  persistEnvSetting("SPOTIFY_CLIENT_SECRET", state.spotify.clientSecret);
  persistEnvSetting("SPOTIFY_REDIRECT_URI", state.spotify.redirectUri);

  res.json({
    ok: true,
    configured: Boolean(state.spotify.clientId && state.spotify.clientSecret),
    redirectUri: state.spotify.redirectUri,
    clientIdHint: state.spotify.clientId ? `${state.spotify.clientId.slice(0, 6)}...` : "",
    hasClientSecret: Boolean(state.spotify.clientSecret)
  });
});

app.post("/api/admin/settings/spotify/disconnect", requireAdmin, (_req, res) => {
  state.tokens = null;
  state.spotify.activeDeviceId = null;
  persistEnvSetting("SPOTIFY_DEVICE_ID", "");
  res.json({ ok: true });
});

app.post("/api/admin/settings/spotify/device", requireAdmin, async (req, res) => {
  const { deviceId } = req.body || {};
  if (!deviceId) {
    res.status(400).json({ error: "deviceId is required." });
    return;
  }
  try {
    state.spotify.activeDeviceId = deviceId;
    persistEnvSetting("SPOTIFY_DEVICE_ID", state.spotify.activeDeviceId);
    await spotify({
      method: "PUT",
      path: "/me/player",
      body: {
        device_ids: [deviceId],
        play: false
      }
    });
    res.json({ ok: true, activeDeviceId: state.spotify.activeDeviceId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/admin/settings/asm", requireAdmin, async (_req, res) => {
  const result = await getAsmAdoptables(false);
  const specialImageStorage = getSpecialPageImageStorageStats();
  res.json({
    configured: Boolean(state.asm.serviceUrl && (state.asm.apiKey || (state.asm.username && state.asm.password))),
    serviceUrl: state.asm.serviceUrl,
    account: state.asm.account,
    authMode: state.asm.apiKey ? "apiKey" : state.asm.username ? "userpass" : "none",
    apiKeyHint: state.asm.apiKey ? `${state.asm.apiKey.slice(0, 6)}...` : "",
    username: state.asm.username,
    hasPassword: Boolean(state.asm.password),
    adoptableMethod: state.asm.adoptableMethod,
    cacheSeconds: Number(state.asm.cacheSeconds || 600),
    slideshow: {
      intervalSeconds: Number(state.slideshow.intervalSeconds || 12),
      defaultLimit: Number(state.slideshow.defaultLimit || 20),
      audioEnabled: Boolean(state.slideshow.audioEnabled),
      audioSource: state.slideshow.audioSource || "/live.mp3",
      audioVolume: Number(state.slideshow.audioVolume || 70),
      audioAutoplay: Boolean(state.slideshow.audioAutoplay),
      excludeFeral: Boolean(state.slideshow.excludeFeral),
      readyTodayOnly: Boolean(state.slideshow.readyTodayOnly),
      customFiltersEnabled: Boolean(state.slideshow.customFiltersEnabled),
      customFilters: sanitizeCustomFilters(state.slideshow.customFilters || []),
      displayFieldCatalog: sanitizeSlideshowDisplayFieldCatalog(state.slideshow.displayFieldCatalog || []),
      displayFields: sanitizeSlideshowDisplayFields(state.slideshow.displayFields || [], state.slideshow.displayFieldCatalog || []),
      specialPages: sanitizeSpecialPages(state.slideshow.specialPages || []),
      adoptablesPerSpecial: Math.max(1, Number(state.slideshow.adoptablesPerSpecial || 3)),
      alertEveryXSlides: Math.max(2, Number(state.slideshow.alertEveryXSlides || 6)),
      specialImageMaxMb: Math.max(1, Math.min(12, Number(state.slideshow.specialImageMaxMb || 4))),
      specialImageStorage: {
        count: Number(specialImageStorage.count || 0),
        totalBytes: Number(specialImageStorage.totalBytes || 0),
        availableBytes: Number.isFinite(Number(specialImageStorage.availableBytes))
          ? Number(specialImageStorage.availableBytes)
          : null
      }
    },
    displayFieldOptions: buildSlideshowDisplayFieldOptions(state.slideshow.displayFieldCatalog || []),
    fetchedAt: result.fetchedAt ? new Date(result.fetchedAt).toISOString() : null,
    itemCount: (result.items || []).length,
    sourceCount: Number(result.sourceCount || 0),
    requestUrl: result.requestUrl || "",
    responseStatus: Number(result.responseStatus || 0),
    contentType: result.contentType || "",
    fieldNames: result.fieldNames || [],
    bodyPreview: result.bodyPreview || "",
    error: result.error || ""
  });
});

app.post("/api/admin/settings/asm", requireAdmin, (req, res) => {
  const body = req.body || {};
  state.asm.serviceUrl = body.serviceUrl !== undefined ? `${body.serviceUrl}`.trim() : state.asm.serviceUrl;
  state.asm.account = body.account !== undefined ? `${body.account}`.trim() : state.asm.account;
  const apiKeyCandidate = body.apiKey !== undefined ? `${body.apiKey}`.trim() : undefined;
  state.asm.username = body.username !== undefined ? `${body.username}`.trim() : state.asm.username;
  const passwordCandidate = body.password !== undefined ? `${body.password}`.trim() : undefined;
  state.asm.apiKey = apiKeyCandidate === undefined || apiKeyCandidate === "" ? state.asm.apiKey : apiKeyCandidate;
  state.asm.password = passwordCandidate === undefined || passwordCandidate === "" ? state.asm.password : passwordCandidate;
  state.asm.adoptableMethod = body.adoptableMethod !== undefined ? `${body.adoptableMethod}`.trim() || "json_adoptable_animals" : state.asm.adoptableMethod;
  state.asm.cacheSeconds = body.cacheSeconds !== undefined ? Math.max(30, Number(body.cacheSeconds || 600)) : state.asm.cacheSeconds;
  state.slideshow.intervalSeconds = body.intervalSeconds !== undefined
    ? Math.max(5, Number(body.intervalSeconds || 12))
    : state.slideshow.intervalSeconds;
  state.slideshow.defaultLimit = body.defaultLimit !== undefined
    ? Math.max(1, Math.min(50, Number(body.defaultLimit || 20)))
    : state.slideshow.defaultLimit;
  state.slideshow.audioEnabled = body.audioEnabled !== undefined
    ? `${body.audioEnabled}` === "true" || body.audioEnabled === true
    : state.slideshow.audioEnabled;
  state.slideshow.audioSource = body.audioSource !== undefined
    ? `${body.audioSource}`.trim() || "/live.mp3"
    : state.slideshow.audioSource;
  state.slideshow.audioVolume = body.audioVolume !== undefined
    ? Math.max(0, Math.min(100, Number(body.audioVolume || 70)))
    : state.slideshow.audioVolume;
  state.slideshow.audioAutoplay = body.audioAutoplay !== undefined
    ? `${body.audioAutoplay}` === "true" || body.audioAutoplay === true
    : state.slideshow.audioAutoplay;
  state.slideshow.excludeFeral = body.excludeFeral !== undefined
    ? `${body.excludeFeral}` === "true" || body.excludeFeral === true
    : state.slideshow.excludeFeral;
  state.slideshow.readyTodayOnly = body.readyTodayOnly !== undefined
    ? `${body.readyTodayOnly}` === "true" || body.readyTodayOnly === true
    : state.slideshow.readyTodayOnly;
  state.slideshow.customFiltersEnabled = body.customFiltersEnabled !== undefined
    ? `${body.customFiltersEnabled}` === "true" || body.customFiltersEnabled === true
    : state.slideshow.customFiltersEnabled;
  state.slideshow.customFilters = body.customFilters !== undefined
    ? sanitizeCustomFilters(Array.isArray(body.customFilters) ? body.customFilters : `${body.customFilters}`.split(/[\n,|]/g))
    : sanitizeCustomFilters(state.slideshow.customFilters || []);
  state.slideshow.displayFieldCatalog = body.displayFieldCatalog !== undefined
    ? sanitizeSlideshowDisplayFieldCatalog(Array.isArray(body.displayFieldCatalog) ? body.displayFieldCatalog : [])
    : sanitizeSlideshowDisplayFieldCatalog(state.slideshow.displayFieldCatalog || []);
  state.slideshow.displayFields = body.displayFields !== undefined
    ? sanitizeSlideshowDisplayFields(
        Array.isArray(body.displayFields) ? body.displayFields : `${body.displayFields}`.split(/[\n,|]/g),
        state.slideshow.displayFieldCatalog || []
      )
    : sanitizeSlideshowDisplayFields(state.slideshow.displayFields || [], state.slideshow.displayFieldCatalog || []);
  state.slideshow.adoptablesPerSpecial = body.adoptablesPerSpecial !== undefined
    ? Math.max(1, Number(body.adoptablesPerSpecial || 3))
    : Math.max(1, Number(state.slideshow.adoptablesPerSpecial || 3));
  state.slideshow.alertEveryXSlides = body.alertEveryXSlides !== undefined
    ? Math.max(2, Number(body.alertEveryXSlides || 6))
    : Math.max(2, Number(state.slideshow.alertEveryXSlides || 6));
  state.slideshow.specialImageMaxMb = body.specialImageMaxMb !== undefined
    ? Math.max(1, Math.min(12, Number(body.specialImageMaxMb || 4)))
    : Math.max(1, Math.min(12, Number(state.slideshow.specialImageMaxMb || 4)));
  state.asmCache = { fetchedAt: 0, items: [], error: "" };
  saveSlideshowConfig();

  persistEnvSetting("ASM_SERVICE_URL", state.asm.serviceUrl);
  persistEnvSetting("ASM_ACCOUNT", state.asm.account);
  persistEnvSetting("ASM_API_KEY", state.asm.apiKey);
  persistEnvSetting("ASM_USERNAME", state.asm.username);
  persistEnvSetting("ASM_PASSWORD", state.asm.password);
  persistEnvSetting("ASM_ADOPTABLE_METHOD", state.asm.adoptableMethod);
  persistEnvSetting("ASM_ADOPTABLE_CACHE_SECONDS", `${state.asm.cacheSeconds}`);
  persistEnvSetting("SLIDESHOW_INTERVAL_SECONDS", `${state.slideshow.intervalSeconds}`);
  persistEnvSetting("SLIDESHOW_DEFAULT_LIMIT", `${state.slideshow.defaultLimit}`);
  persistEnvSetting("SLIDESHOW_AUDIO_ENABLED", state.slideshow.audioEnabled ? "true" : "false");
  persistEnvSetting("SLIDESHOW_AUDIO_SOURCE", state.slideshow.audioSource);
  persistEnvSetting("SLIDESHOW_AUDIO_VOLUME", `${state.slideshow.audioVolume}`);
  persistEnvSetting("SLIDESHOW_AUDIO_AUTOPLAY", state.slideshow.audioAutoplay ? "true" : "false");
  persistEnvSetting("SLIDESHOW_EXCLUDE_FERAL", state.slideshow.excludeFeral ? "true" : "false");
  persistEnvSetting("SLIDESHOW_READY_TODAY_ONLY", state.slideshow.readyTodayOnly ? "true" : "false");
  persistEnvSetting("SLIDESHOW_CUSTOM_FILTERS_ENABLED", state.slideshow.customFiltersEnabled ? "true" : "false");
  persistEnvSetting("SLIDESHOW_CUSTOM_FILTERS", sanitizeCustomFilters(state.slideshow.customFilters || []).join("|"));
  persistEnvSetting("SLIDESHOW_ADOPTABLES_PER_SPECIAL", `${state.slideshow.adoptablesPerSpecial}`);
  persistEnvSetting("SLIDESHOW_ALERT_EVERY_X_SLIDES", `${state.slideshow.alertEveryXSlides}`);
  persistEnvSetting("SLIDESHOW_SPECIAL_IMAGE_MAX_MB", `${state.slideshow.specialImageMaxMb}`);

  res.json({ ok: true });
});

app.get("/api/admin/slideshow/pages", requireAdmin, (_req, res) => {
  const specialImageStorage = getSpecialPageImageStorageStats();
  res.json({
    pages: sanitizeSpecialPages(state.slideshow.specialPages || []),
    settings: {
      adoptablesPerSpecial: Math.max(1, Number(state.slideshow.adoptablesPerSpecial || 3)),
      alertEveryXSlides: Math.max(2, Number(state.slideshow.alertEveryXSlides || 6)),
      specialImageMaxMb: Math.max(1, Math.min(12, Number(state.slideshow.specialImageMaxMb || 4))),
      specialImageStorage: {
        count: Number(specialImageStorage.count || 0),
        totalBytes: Number(specialImageStorage.totalBytes || 0),
        availableBytes: Number.isFinite(Number(specialImageStorage.availableBytes))
          ? Number(specialImageStorage.availableBytes)
          : null
      }
    }
  });
});

app.get("/api/admin/slideshow/images", requireAdmin, (_req, res) => {
  const pages = sanitizeSpecialPages(state.slideshow.specialPages || []);
  const byBaseName = new Map(
    pages
      .filter((page) => page.imageUrl)
      .map((page) => [path.basename(page.imageUrl), page])
  );
  const storage = getSpecialPageImageStorageStats();
  const images = storage.files.map((file) => {
    const linkedPage = byBaseName.get(file.name) || null;
    return {
      fileName: file.name,
      url: `${SPECIAL_PAGE_UPLOAD_WEB_PATH}/${file.name}`,
      sizeBytes: Number(file.sizeBytes || 0),
      updatedAt: file.updatedAt,
      pageId: linkedPage?.id || "",
      pageTitle: linkedPage?.title || ""
    };
  });
  res.json({
    images,
    storage: {
      count: Number(storage.count || 0),
      totalBytes: Number(storage.totalBytes || 0),
      availableBytes: Number.isFinite(Number(storage.availableBytes))
        ? Number(storage.availableBytes)
        : null
    }
  });
});

app.post("/api/admin/slideshow/pages", requireAdmin, (req, res) => {
  const page = sanitizeSpecialPage(req.body || {});
  state.slideshow.specialPages = [
    ...sanitizeSpecialPages(state.slideshow.specialPages || []),
    page
  ];
  saveSlideshowConfig();
  res.status(201).json({ ok: true, page });
});

app.patch("/api/admin/slideshow/pages/:id", requireAdmin, (req, res) => {
  const id = `${req.params.id || ""}`.trim();
  const current = sanitizeSpecialPages(state.slideshow.specialPages || []);
  const existing = current.find((item) => item.id === id);
  if (!existing) {
    res.status(404).json({ error: "Special page not found." });
    return;
  }
  const next = sanitizeSpecialPage({ ...existing, ...(req.body || {}), id: existing.id, createdAt: existing.createdAt });
  state.slideshow.specialPages = current.map((item) => (item.id === id ? next : item));
  saveSlideshowConfig();
  res.json({ ok: true, page: next });
});

app.post("/api/admin/slideshow/pages/:id/image", requireAdmin, (req, res) => {
  const id = `${req.params.id || ""}`.trim();
  const current = sanitizeSpecialPages(state.slideshow.specialPages || []);
  const existing = current.find((item) => item.id === id);
  if (!existing) {
    res.status(404).json({ error: "Special page not found." });
    return;
  }
  try {
    const imageUrl = saveSpecialPageImageDataUrl(id, req.body?.dataUrl || "");
    if (existing.imageUrl && existing.imageUrl.startsWith(`${SPECIAL_PAGE_UPLOAD_WEB_PATH}/`)) {
      const oldPath = path.join(SPECIAL_PAGE_UPLOAD_DIR, path.basename(existing.imageUrl));
      if (fs.existsSync(oldPath)) {
        fs.unlinkSync(oldPath);
      }
    }
    const updated = sanitizeSpecialPage({ ...existing, imageUrl, id: existing.id, createdAt: existing.createdAt });
    state.slideshow.specialPages = current.map((item) => (item.id === id ? updated : item));
    saveSlideshowConfig();
    res.json({ ok: true, page: updated });
  } catch (error) {
    res.status(400).json({ error: error.message || "Image upload failed." });
  }
});

app.delete("/api/admin/slideshow/pages/:id/image", requireAdmin, (req, res) => {
  const id = `${req.params.id || ""}`.trim();
  const current = sanitizeSpecialPages(state.slideshow.specialPages || []);
  const existing = current.find((item) => item.id === id);
  if (!existing) {
    res.status(404).json({ error: "Special page not found." });
    return;
  }
  if (existing.imageUrl && existing.imageUrl.startsWith(`${SPECIAL_PAGE_UPLOAD_WEB_PATH}/`)) {
    const oldPath = path.join(SPECIAL_PAGE_UPLOAD_DIR, path.basename(existing.imageUrl));
    if (fs.existsSync(oldPath)) {
      fs.unlinkSync(oldPath);
    }
  }
  const updated = sanitizeSpecialPage({ ...existing, imageUrl: "", id: existing.id, createdAt: existing.createdAt });
  state.slideshow.specialPages = current.map((item) => (item.id === id ? updated : item));
  saveSlideshowConfig();
  res.json({ ok: true, page: updated });
});

app.delete("/api/admin/slideshow/images/:fileName", requireAdmin, (req, res) => {
  const fileName = `${req.params.fileName || ""}`.trim();
  if (!/^[A-Za-z0-9._-]+\.(png|jpe?g|webp)$/i.test(fileName)) {
    res.status(400).json({ error: "Invalid file name." });
    return;
  }
  ensureSpecialPageUploadDir();
  const targetPath = path.join(SPECIAL_PAGE_UPLOAD_DIR, fileName);
  if (!fs.existsSync(targetPath)) {
    res.status(404).json({ error: "Image not found." });
    return;
  }
  fs.unlinkSync(targetPath);

  const imageUrl = `${SPECIAL_PAGE_UPLOAD_WEB_PATH}/${fileName}`;
  const current = sanitizeSpecialPages(state.slideshow.specialPages || []);
  let changed = false;
  state.slideshow.specialPages = current.map((item) => {
    if (item.imageUrl !== imageUrl) {
      return item;
    }
    changed = true;
    return sanitizeSpecialPage({ ...item, imageUrl: "", id: item.id, createdAt: item.createdAt });
  });
  if (changed) {
    saveSlideshowConfig();
  }
  res.json({ ok: true, clearedPageImage: changed });
});

app.delete("/api/admin/slideshow/pages/:id", requireAdmin, (req, res) => {
  const id = `${req.params.id || ""}`.trim();
  const current = sanitizeSpecialPages(state.slideshow.specialPages || []);
  const existing = current.find((item) => item.id === id);
  if (!existing) {
    res.status(404).json({ error: "Special page not found." });
    return;
  }
  if (existing.imageUrl && existing.imageUrl.startsWith(`${SPECIAL_PAGE_UPLOAD_WEB_PATH}/`)) {
    const oldPath = path.join(SPECIAL_PAGE_UPLOAD_DIR, path.basename(existing.imageUrl));
    if (fs.existsSync(oldPath)) {
      fs.unlinkSync(oldPath);
    }
  }
  state.slideshow.specialPages = current.filter((item) => item.id !== id);
  saveSlideshowConfig();
  res.json({ ok: true });
});

app.post("/api/admin/settings/asm/test", requireAdmin, async (_req, res) => {
  const result = await getAsmAdoptables(true);
  res.json({
    ok: !result.error,
    itemCount: (result.items || []).length,
    sourceCount: Number(result.sourceCount || 0),
    fetchedAt: result.fetchedAt ? new Date(result.fetchedAt).toISOString() : null,
    error: result.error || ""
  });
});

app.get("/api/admin/settings/asm/inspect", requireAdmin, async (_req, res) => {
  try {
    const result = await fetchAsmDiagnostics();
    res.json({
      ok: !result.error,
      requestUrl: result.requestUrl,
      responseStatus: Number(result.responseStatus || 0),
      contentType: result.contentType || "",
      sourceCount: Number(result.sourceCount || 0),
      mappedCount: (result.mappedItems || []).length,
      fieldNames: result.fieldNames || [],
      bodyPreview: result.bodyPreview || "",
      firstItem: result.firstItem || null,
      error: result.error || ""
    });
  } catch (error) {
    res.status(500).json({ error: error.message || "ASM inspect failed" });
  }
});

// ── Admin playback ────────────────────────────────────────────────────────────

app.get("/api/admin/playback/state", requireAdmin, async (_req, res) => {
  try {
    const [playbackState, currentTrack, position, volume] = await Promise.all([
      mopidyRpc("core.playback.get_state"),
      mopidyRpc("core.playback.get_current_track"),
      mopidyRpc("core.playback.get_time_position"),
      mopidyRpc("core.mixer.get_volume")
    ]);
    const mapped = currentTrack ? mapMopidyTrack(currentTrack) : null;
    if (mapped?.uri && mapped.uri !== state.lastKnownCurrentTrackUri) {
      state.lastKnownCurrentTrackUri = mapped.uri;
      recordTrackStat(mapped.uri, mapped.name, mapped.artists, mapped.album, "playCount");
    }
    res.json({
      state: playbackState || "stopped",
      current: mapped,
      positionMs: position || 0,
      volume: volume ?? 80
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

for (const action of ["play", "pause", "previous"]) {
  const rpcMethod = action === "previous"
    ? "core.playback.previous"
    : `core.playback.${action}`;

  app.post(`/api/admin/playback/${action}`, requireAdmin, async (_req, res) => {
    try {
      await mopidyRpc(rpcMethod);
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
}

app.post("/api/admin/playback/next", requireAdmin, async (_req, res) => {
  try {
    const currentTrack = await mopidyRpc("core.playback.get_current_track").catch(() => null);
    if (currentTrack) {
      const mapped = mapMopidyTrack(currentTrack);
      if (mapped?.uri) recordTrackStat(mapped.uri, mapped.name, mapped.artists, mapped.album, "skipCount");
    }
    await mopidyRpc("core.playback.next");
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── Admin volume ──────────────────────────────────────────────────────────────

app.get("/api/admin/volume", requireAdmin, async (_req, res) => {
  try {
    const volume = await mopidyRpc("core.mixer.get_volume");
    res.json({ volume: volume ?? 80 });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/admin/volume", requireAdmin, async (req, res) => {
  const volume = Number(req.body?.volume ?? -1);
  if (volume < 0 || volume > 100) {
    res.status(400).json({ error: "volume must be 0-100" });
    return;
  }
  try {
    await mopidyRpc("core.mixer.set_volume", { volume });
    res.json({ ok: true, volume });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── Admin queue ───────────────────────────────────────────────────────────────

app.get("/api/admin/queue", requireAdmin, async (_req, res) => {
  try {
    const tlTracks = await mopidyRpc("core.tracklist.get_tl_tracks");
    const queue = (tlTracks || []).map(mapQueueTrack);
    res.json({ queue });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete("/api/admin/queue/:tlid", requireAdmin, async (req, res) => {
  const tlid = Number(req.params.tlid);
  if (!Number.isFinite(tlid)) {
    res.status(400).json({ error: "Invalid tlid." });
    return;
  }
  try {
    await mopidyRpc("core.tracklist.remove", { criteria: { tlid: [tlid] } });
    state.requestMetaByTlid.delete(tlid);
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/admin/queue/clear", requireAdmin, async (_req, res) => {
  try {
    await mopidyRpc("core.tracklist.clear");
    state.requestMetaByTlid.clear();
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/admin/queue/shuffle", requireAdmin, async (_req, res) => {
  try {
    await randomizeQueuePreservingCurrent();
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/admin/queue/randomize", requireAdmin, async (_req, res) => {
  try {
    await randomizeQueuePreservingCurrent();
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/admin/queue/move", requireAdmin, async (req, res) => {
  const { tlid, direction } = req.body || {};
  if (!tlid || !direction) {
    res.status(400).json({ error: "tlid and direction are required." });
    return;
  }
  try {
    const tlTracks = await mopidyRpc("core.tracklist.get_tl_tracks");
    const idx = (tlTracks || []).findIndex((t) => t.tlid === tlid);
    if (idx < 0) {
      res.status(404).json({ error: "Track not found in queue." });
      return;
    }
    if (direction === "up" && idx > 0) {
      await mopidyRpc("core.tracklist.move", { start: idx, end: idx + 1, to_position: idx - 1 });
    } else if (direction === "down" && idx < tlTracks.length - 1) {
      await mopidyRpc("core.tracklist.move", { start: idx, end: idx + 1, to_position: idx + 1 });
    }
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── Admin playback modes ──────────────────────────────────────────────────────

app.get("/api/admin/modes", requireAdmin, async (_req, res) => {
  try {
    const [repeat] = await Promise.all([
      mopidyRpc("core.tracklist.get_repeat"),
    ]);
    res.json({ repeat: Boolean(repeat), random: false });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/admin/modes", requireAdmin, async (req, res) => {
  const { repeat } = req.body || {};
  try {
    const ops = [];
    if (repeat !== undefined) ops.push(mopidyRpc("core.tracklist.set_repeat", { value: Boolean(repeat) }));
    // Keep Mopidy random mode disabled so queue order stays authoritative in UI.
    ops.push(mopidyRpc("core.tracklist.set_random", { value: false }));
    await Promise.all(ops);
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/requests/session", (req, res) => {
  const password = `${req.body?.password || ""}`;
  const usernameResult = normalizeEmailUsername(req.body?.username, { requireValid: true });
  if (!usernameResult.ok) {
    res.status(400).json({
      error: "username must be a valid email address.",
      suggestion: usernameResult.suggestion
    });
    return;
  }
  const staff = findUserByUsername(usernameResult.email);
  if (!staff || !verifyPassword(password, staff.passwordSalt, staff.passwordHash)) {
    res.status(401).json({ error: "Invalid username or password." });
    return;
  }

  const token = createEmployeeToken();
  const session = {
    displayName: formatUserDisplayName(staff),
    userId: staff.id,
    createdAt: new Date().toISOString()
  };

  state.employeeSessions.set(token, session);
  res.status(201).json({ token, session });
});

app.post("/api/requests/session/logout", requireEmployee, (req, res) => {
  state.employeeSessions.delete(req.employeeToken);
  res.json({ ok: true });
});

app.get("/api/requests/me", requireEmployee, async (req, res) => {
  try {
    const staff = req.staffAccount || null;
    const maxPending = Math.max(1, Number(staff?.requestLimit || state.adminDb.staffDefaults?.requestLimit || MAX_PENDING_PER_USER));
    const pendingCount = staff ? getDailyRequestsUsed(staff.id) : await getPendingCountForToken(req.employeeToken);
    res.json({
      displayName: req.employeeSession.displayName,
      isAdmin: isUserAdmin(staff),
      maxPending,
      pendingCount,
      resetAt: `${getLocalDateKey()}T23:59:59`
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/requests/search", requireEmployee, rateLimitEmployeeRequests, async (req, res) => {
  const q = `${req.query.q || ""}`.trim();
  if (!q) {
    res.json({ tracks: [] });
    return;
  }

  try {
    const result = await mopidyRpc("core.library.search", {
      query: { any: [q] },
      uris: ["spotify:"]
    });

    const tracks = [];
    for (const bucket of result || []) {
      for (const track of bucket.tracks || []) {
        tracks.push(mapMopidyTrack(track));
      }
    }

    const filtered = state.explicitFilter ? tracks.filter((t) => !t.explicit) : tracks;
    const staffId = req.employeeSession.userId || "";
    const enriched = filtered.slice(0, 40).map((track) => ({
      ...track,
      ...getTrackVoteSummary(track.uri || ""),
      userVote: staffId ? getUserVoteForTrack(staffId, track.uri || "") : 0
    }));
    res.json({ tracks: enriched });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/requests/queue", requireEmployee, rateLimitEmployeeRequests, async (_req, res) => {
  try {
    const staffId = _req.employeeSession.userId || "";
    const [currentTrack, tlTracks] = await Promise.all([
      mopidyRpc("core.playback.get_current_track"),
      mopidyRpc("core.tracklist.get_tl_tracks")
    ]);

    const queue = (tlTracks || []).map((entry) => {
      const mapped = mapQueueTrack(entry);
      return {
        ...mapped,
        userVote: staffId ? getUserVoteForTrack(staffId, mapped.uri || "") : 0
      };
    });
    const currentUri = currentTrack?.uri || "";
    const current = currentUri ? queue.find((item) => item.uri === currentUri) || {
      ...mapMopidyTrack(currentTrack),
      ...getTrackVoteSummary(currentUri),
      userVote: staffId ? getUserVoteForTrack(staffId, currentUri) : 0
    } : null;

    res.json({
      current,
      queue,
      activeListeners: getActiveListenerCount(),
      now: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/display/queue", async (_req, res) => {
  try {
    const [currentTrack, tlTracks] = await Promise.all([
      mopidyRpc("core.playback.get_current_track"),
      mopidyRpc("core.tracklist.get_tl_tracks")
    ]);

    const queue = (tlTracks || []).map(mapQueueTrack);
    const currentUri = currentTrack?.uri || "";
    const current = currentUri
      ? queue.find((item) => item.uri === currentUri) || {
        ...mapMopidyTrack(currentTrack),
        ...getTrackVoteSummary(currentUri)
      }
      : null;

    const upNext = current?.uri ? queue.filter((item) => item.uri !== current.uri).slice(0, 8) : queue.slice(0, 8);

    res.json({
      current,
      upNext,
      activeListeners: getActiveListenerCount(),
      now: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/adoptables/image/:animalId", async (req, res) => {
  const animalId = Number(req.params.animalId || 0);
  if (!animalId) {
    res.status(400).json({ error: "Invalid animal id" });
    return;
  }

  if (!state.asm.serviceUrl || !(state.asm.apiKey || (state.asm.username && state.asm.password))) {
    res.status(503).json({ error: "ASM service is not configured" });
    return;
  }

  const methods = ["animal_image", "animal_photo", "animal_thumbnail"];
  for (const method of methods) {
    try {
      const upstreamUrl = buildAsmServiceUrl(method, { animalid: animalId });
      if (!upstreamUrl) {
        continue;
      }
      const upstream = await fetch(upstreamUrl, {
        headers: { Accept: "image/*,*/*;q=0.8" }
      });
      const type = `${upstream.headers.get("content-type") || ""}`;
      if (!upstream.ok || !upstream.body || !type.toLowerCase().startsWith("image/")) {
        continue;
      }
      res.setHeader("Content-Type", type);
      res.setHeader("Cache-Control", "public, max-age=300");
      upstream.body.pipe(res);
      return;
    } catch {
      // Try the next method.
    }
  }

  res.status(404).json({ error: "No adoptable image available" });
});

app.get("/api/adoptables/slideshow", async (req, res) => {
  const force = `${req.query.refresh || ""}` === "1";
  const limit = Math.max(1, Math.min(50, Number(req.query.limit || state.slideshow.defaultLimit || 20)));
  const result = await getAsmAdoptables(force);
  const animals = (result.items || []).slice(0, limit);
  const slides = buildMixedSlideshowSlides(animals, state.slideshow.specialPages || [], {
    defaultAnimalSeconds: Number(state.slideshow.intervalSeconds || 12),
    adoptablesPerSpecial: Number(state.slideshow.adoptablesPerSpecial || 3),
    alertEveryXSlides: Number(state.slideshow.alertEveryXSlides || 6)
  });
  res.json({
    configured: Boolean(state.asm.serviceUrl && (state.asm.apiKey || (state.asm.username && state.asm.password))),
    fetchedAt: result.fetchedAt ? new Date(result.fetchedAt).toISOString() : null,
    error: result.error || "",
    settings: {
      intervalSeconds: Number(state.slideshow.intervalSeconds || 12),
      defaultLimit: Number(state.slideshow.defaultLimit || 20),
      audioEnabled: Boolean(state.slideshow.audioEnabled),
      audioSource: state.slideshow.audioSource || "/live.mp3",
      audioVolume: Number(state.slideshow.audioVolume || 70),
      audioAutoplay: Boolean(state.slideshow.audioAutoplay),
      adoptablesPerSpecial: Math.max(1, Number(state.slideshow.adoptablesPerSpecial || 3)),
      alertEveryXSlides: Math.max(2, Number(state.slideshow.alertEveryXSlides || 6)),
      specialImageMaxMb: Math.max(1, Math.min(12, Number(state.slideshow.specialImageMaxMb || 4))),
      displayFieldCatalog: sanitizeSlideshowDisplayFieldCatalog(state.slideshow.displayFieldCatalog || []),
      displayFields: sanitizeSlideshowDisplayFields(state.slideshow.displayFields || [], state.slideshow.displayFieldCatalog || []),
      specialPages: sanitizeSpecialPages(state.slideshow.specialPages || [])
    },
    animals,
    slides
  });
});

app.post("/api/requests/queue", requireEmployee, rateLimitEmployeeRequests, async (req, res) => {
  const { uri } = req.body || {};
  if (!uri) {
    res.status(400).json({ error: "uri is required." });
    return;
  }

  try {
    const staff = req.staffAccount;
    const maxPerDay = Math.max(1, Number(staff?.requestLimit || state.adminDb.staffDefaults?.requestLimit || MAX_PENDING_PER_USER));
    const pendingCount = staff ? getDailyRequestsUsed(staff.id) : await getPendingCountForToken(req.employeeToken);
    if (pendingCount >= maxPerDay) {
      res.status(429).json({
        error: `You reached your daily limit (${maxPerDay}) for today.`
      });
      return;
    }

    const added = await mopidyRpc("core.tracklist.add", { uris: [uri] });
    const createdAt = new Date().toISOString();
    const result = (added || []).map((entry) => {
      const mappedTrack = mapMopidyTrack(entry.track || {});
      state.requestMetaByTlid.set(entry.tlid, {
        requestedBy: req.employeeSession.displayName,
        requestedByToken: req.employeeToken,
        requestedAt: createdAt
      });
      if (staff) {
        recordSongRequest({ staff, track: mappedTrack });
      }
      return {
        ...mapQueueTrack(entry),
        userVote: staff ? getUserVoteForTrack(staff.id, mappedTrack.uri || "") : 0
      };
    });

    if (staff) {
      incrementDailyRequestsUsed(staff.id);
    }

    res.status(201).json({ ok: true, items: result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/requests/vote", requireEmployee, rateLimitEmployeeRequests, async (req, res) => {
  try {
    const vote = Number(req.body?.vote || 0);
    const uri = `${req.body?.uri || ""}`.trim();
    const name = `${req.body?.name || ""}`.trim();
    const artists = `${req.body?.artists || ""}`.trim();
    const album = `${req.body?.album || ""}`.trim();

    if (!uri) {
      res.status(400).json({ error: "uri is required." });
      return;
    }
    if (![1, -1].includes(vote)) {
      res.status(400).json({ error: "vote must be 1 or -1." });
      return;
    }
    const voterId = req.employeeSession.userId || "";
    if (!voterId) {
      res.status(400).json({ error: "A user session is required for voting." });
      return;
    }

    const result = applyVote({
      userId: voterId,
      uri,
      vote,
      name,
      artists,
      album
    });

    let autoSkipped = false;
    const activeListeners = getActiveListenerCount();
    if (activeListeners > 0) {
      const downvoteRatio = Number(result.downvotes || 0) / activeListeners;
      if (downvoteRatio > 0.5) {
        const currentTrack = await mopidyRpc("core.playback.get_current_track");
        const currentUri = `${currentTrack?.uri || ""}`;
        if (currentUri && currentUri === uri) {
          await mopidyRpc("core.playback.next");
          recordTrackStat(uri, name, artists, album, "skipCount");
          autoSkipped = true;
        }
      }
    }

    res.json({ ok: true, autoSkipped, activeListeners, ...result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/requests/stats", requireEmployee, rateLimitEmployeeRequests, (_req, res) => {
  res.json({
    topRequested: getTopRequested(10),
    topUpvoted: getTopUpvoted(10)
  });
});

app.get("/auth/login", (req, res) => {
  if (!state.spotify.clientId || !state.spotify.clientSecret) {
    res.status(500).send("Spotify credentials are not configured.");
    return;
  }

  const returnTo = `${req.query.return || ""}`.trim();
  if (returnTo.startsWith("/")) {
    state.oauthReturnPath = returnTo;
  } else {
    state.oauthReturnPath = "/";
  }

  state.oauthState = createAuthState();
  const authorizeUrl = createAuthorizeUrl({
    clientId: state.spotify.clientId,
    redirectUri: state.spotify.redirectUri,
    state: state.oauthState
  });

  res.redirect(authorizeUrl);
});

app.get("/auth/callback", async (req, res) => {
  try {
    if (req.query.state !== state.oauthState) {
      res.status(400).send("Invalid OAuth state.");
      return;
    }

    if (!req.query.code) {
      res.status(400).send("Missing authorization code.");
      return;
    }

    state.tokens = await exchangeCodeForToken({
      clientId: state.spotify.clientId,
      clientSecret: state.spotify.clientSecret,
      code: req.query.code,
      redirectUri: state.spotify.redirectUri
    });

    res.redirect(state.oauthReturnPath || "/");
  } catch (error) {
    res.status(500).send(`OAuth callback failed: ${error.message}`);
  }
});

app.get("/api/auth/status", (_req, res) => {
  res.json({ connected: Boolean(state.tokens?.access_token) });
});

app.get("/api/auth/token", async (_req, res) => {
  try {
    const accessToken = await getValidAccessToken();
    res.json({ accessToken, expiresAt: state.tokens?.expires_at || null });
  } catch (error) {
    res.status(401).json({ error: error.message });
  }
});

app.get("/api/devices", async (_req, res) => {
  try {
    const payload = await spotify({ path: "/me/player/devices" });
    res.json({
      activeDeviceId: state.spotify.activeDeviceId,
      devices: payload.devices || []
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/device/select", (req, res) => {
  const { deviceId } = req.body || {};
  if (!deviceId) {
    res.status(400).json({ error: "deviceId is required" });
    return;
  }

  state.spotify.activeDeviceId = deviceId;
  persistEnvSetting("SPOTIFY_DEVICE_ID", state.spotify.activeDeviceId);
  res.json({ ok: true, activeDeviceId: state.spotify.activeDeviceId });
});

app.post("/api/device/activate", async (_req, res) => {
  if (!state.spotify.activeDeviceId) {
    res.status(400).json({ error: "No active device selected." });
    return;
  }

  try {
    await spotify({
      method: "PUT",
      path: "/me/player",
      body: {
        device_ids: [state.spotify.activeDeviceId],
        play: false
      }
    });

    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/search", async (req, res) => {
  const q = `${req.query.q || ""}`.trim();
  if (!q) {
    res.json({ tracks: [] });
    return;
  }

  try {
    const payload = await spotify({
      path: "/search",
      query: { q, type: "track", limit: 20, market: "US" }
    });

    const tracks = (payload.tracks?.items || []).map((track) => ({
      id: track.id,
      uri: track.uri,
      name: track.name,
      album: track.album?.name,
      artists: (track.artists || []).map((a) => a.name).join(", "),
      durationMs: track.duration_ms
    }));

    res.json({ tracks });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/top-tracks", async (req, res) => {
  const timeRange = `${req.query.time_range || "long_term"}`;
  const limit = Number(req.query.limit || 5);

  try {
    const payload = await spotify({
      path: "/me/top/tracks",
      query: {
        time_range: timeRange,
        limit: Math.max(1, Math.min(50, limit))
      }
    });

    const tracks = (payload.items || []).map((track) => ({
      id: track.id,
      uri: track.uri,
      name: track.name,
      album: track.album?.name,
      artists: (track.artists || []).map((a) => a.name).join(", "),
      durationMs: track.duration_ms
    }));

    res.json({ tracks });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/queue", (_req, res) => {
  res.json({
    activeDeviceId: state.activeDeviceId,
    queue: state.localQueue
  });
});

app.post("/api/queue", (req, res) => {
  const { uri, name, artists } = req.body || {};
  if (!uri || !name) {
    res.status(400).json({ error: "uri and name are required." });
    return;
  }

  const item = {
    id: crypto.randomUUID(),
    uri,
    name,
    artists: artists || ""
  };

  state.localQueue.push(item);
  res.status(201).json({ item, queueLength: state.localQueue.length });
});

app.delete("/api/queue/:id", (req, res) => {
  const before = state.localQueue.length;
  state.localQueue = state.localQueue.filter((item) => item.id !== req.params.id);
  const removed = before !== state.localQueue.length;
  res.json({ ok: removed, queueLength: state.localQueue.length });
});

app.post("/api/queue/:id/send", async (req, res) => {
  const item = state.localQueue.find((entry) => entry.id === req.params.id);
  if (!item) {
    res.status(404).json({ error: "Queue item not found." });
    return;
  }

  if (!state.activeDeviceId) {
    res.status(400).json({ error: "No active device selected." });
    return;
  }

  try {
    await spotify({
      method: "POST",
      path: "/me/player/queue",
      query: {
        uri: item.uri,
        device_id: state.activeDeviceId
      }
    });

    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/queue/send-all", async (_req, res) => {
  if (!state.activeDeviceId) {
    res.status(400).json({ error: "No active device selected." });
    return;
  }

  const sent = [];
  const failed = [];

  for (const item of state.localQueue) {
    try {
      await spotify({
        method: "POST",
        path: "/me/player/queue",
        query: {
          uri: item.uri,
          device_id: state.activeDeviceId
        }
      });
      sent.push(item.id);
    } catch (error) {
      failed.push({ id: item.id, error: error.message });
    }
  }

  res.json({ ok: failed.length === 0, sentCount: sent.length, failed });
});

app.post("/api/queue/:id/play-now", async (req, res) => {
  const item = state.localQueue.find((entry) => entry.id === req.params.id);
  if (!item) {
    res.status(404).json({ error: "Queue item not found." });
    return;
  }

  if (!state.activeDeviceId) {
    res.status(400).json({ error: "No active device selected." });
    return;
  }

  try {
    await spotify({
      method: "PUT",
      path: "/me/player/play",
      query: { device_id: state.activeDeviceId },
      body: { uris: [item.uri] }
    });

    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/queue/play-next", async (_req, res) => {
  if (!state.activeDeviceId) {
    res.status(400).json({ error: "No active device selected." });
    return;
  }

  const item = state.localQueue.shift();
  if (!item) {
    res.status(404).json({ error: "Queue is empty." });
    return;
  }

  try {
    await spotify({
      method: "PUT",
      path: "/me/player/play",
      query: { device_id: state.activeDeviceId },
      body: { uris: [item.uri] }
    });

    res.json({ ok: true, item });
  } catch (error) {
    state.localQueue.unshift(item);
    res.status(500).json({ error: error.message });
  }
});

// ── Admin explicit filter ────────────────────────────────────────────────────
app.get("/api/admin/explicit", requireAdmin, (_req, res) => {
  res.json({ explicitFilter: state.explicitFilter });
});

app.post("/api/admin/explicit", requireAdmin, (req, res) => {
  const { enabled } = req.body || {};
  state.explicitFilter = Boolean(enabled);
  persistEnvSetting("EXPLICIT_FILTER_ENABLED", state.explicitFilter ? "true" : "false");
  res.json({ ok: true, explicitFilter: state.explicitFilter });
});

// ── Admin playlists ──────────────────────────────────────────────────────────
app.get("/api/admin/playlists", requireAdmin, async (_req, res) => {
  try {
    const playlists = await mopidyRpc("core.playlists.as_list");
    res.json({ playlists: playlists || [] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/admin/playlists", requireAdmin, async (req, res) => {
  const name = `${req.body?.name || ""}`.trim();
  if (!name) {
    res.status(400).json({ error: "name is required." });
    return;
  }
  try {
    const tlTracks = await mopidyRpc("core.tracklist.get_tl_tracks");
    const tracks = (tlTracks || []).map((t) => t.track);
    if (!tracks.length) {
      res.status(400).json({ error: "Queue is empty — nothing to save." });
      return;
    }
    const playlist = await mopidyRpc("core.playlists.create", { name });
    const saved = await mopidyRpc("core.playlists.save", { playlist: { ...playlist, tracks } });
    res.status(201).json({ ok: true, uri: saved?.uri || playlist.uri, name: saved?.name || name });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/admin/playlists/load", requireAdmin, async (req, res) => {
  const { uri, replace = false } = req.body || {};
  if (!uri) {
    res.status(400).json({ error: "uri is required." });
    return;
  }
  try {
    const tracks = await mopidyRpc("core.playlists.get_items", { uri });
    const uris = (tracks || []).map((t) => t.uri).filter(Boolean);
    if (!uris.length) {
      res.status(400).json({ error: "Playlist is empty." });
      return;
    }
    if (replace) {
      await mopidyRpc("core.tracklist.clear");
      state.requestMetaByTlid.clear();
    }
    const added = await mopidyRpc("core.tracklist.add", { uris });
    res.json({ ok: true, added: (added || []).length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Jukebox server running at ${BASE_URL}`);
});
