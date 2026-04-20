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
import {
  getSmtpStatus,
  resetSmtpTransport,
  sendSystemEmail,
  verifySmtpConnection
} from "./mailer.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const execFileAsync = promisify(execFile);

const PORT = Number(process.env.PORT || 3000);
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
const REPORTING_HOST = `${process.env.REPORTING_HOST || "reporting.hsnba.org"}`.trim().toLowerCase();
const ASM_FETCH_TIMEOUT_MS = Math.max(3000, Number(process.env.ASM_FETCH_TIMEOUT_MS || 15000));
const ADMIN_SESSION_COOKIE = "hsnba_admin_session";
const MOPIDY_URL = process.env.MOPIDY_URL || "http://127.0.0.1:6680/mopidy/rpc";
const MAX_PENDING_PER_USER = Number(process.env.MAX_PENDING_PER_USER || 3);
const EMPLOYEE_SESSION_TTL_MINUTES = Number(process.env.EMPLOYEE_SESSION_TTL_MINUTES || 480);
const REQUESTS_RATE_WINDOW_MS = Number(process.env.REQUESTS_RATE_WINDOW_MS || 60000);
const REQUESTS_RATE_MAX = Number(process.env.REQUESTS_RATE_MAX || 40);
const ADMIN_BOOTSTRAP_PASSWORD = process.env.ADMIN_BOOTSTRAP_PASSWORD || "";
const SERVER_TZ_DEFAULT = process.env.SERVER_TZ || "America/Chicago";
let audioJackAlsaCard = `${process.env.AUDIO_JACK_ALSA_CARD || "0"}`.trim() || "0";
let audioJackAlsaControl = `${process.env.AUDIO_JACK_ALSA_CONTROL || "Master"}`.trim() || "Master";
const AUDIO_JACK_STORE_ON_CHANGE = `${process.env.AUDIO_JACK_STORE_ON_CHANGE || "true"}`.toLowerCase() !== "false";
const SESSION_SECRET = `${process.env.SESSION_SECRET || ""}`.trim();
const ADMIN_SESSION_TTL_HOURS = Math.max(1, Number(process.env.ADMIN_SESSION_TTL_HOURS || 12));
const ACCOUNT_INVITE_TTL_HOURS = Math.max(1, Number(process.env.ACCOUNT_INVITE_TTL_HOURS || 72));
const ACCOUNT_RESET_TTL_HOURS = Math.max(1, Number(process.env.ACCOUNT_RESET_TTL_HOURS || 2));
if (!SESSION_SECRET) {
  console.warn("WARNING: SESSION_SECRET is not set. Admin sessions will not be valid across process restarts or between jukebox/reporting processes.");
}
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
const ADMIN_DB_BACKUP_PATH = path.resolve(__dirname, "../data/admin-db.backup.json");
const ADMIN_DB_SNAPSHOT_DIR = path.resolve(__dirname, "../data/admin-db-snapshots");
const ADMIN_DB_SNAPSHOT_INTERVAL_MS = Math.max(5 * 60 * 1000, Number(process.env.ADMIN_DB_SNAPSHOT_INTERVAL_MS || 60 * 60 * 1000));
const ADMIN_DB_SNAPSHOT_KEEP = Math.max(10, Number(process.env.ADMIN_DB_SNAPSHOT_KEEP || 72));
const SLIDESHOW_CONFIG_PATH = path.resolve(__dirname, "../data/slideshow-config.json");
const AUDIO_AUTOMATION_CONFIG_PATH = path.resolve(__dirname, "../data/audio-automation.json");
const SPOTIFY_TOKENS_PATH = path.resolve(__dirname, "../data/spotify-tokens.json");
const LOCAL_QUEUE_PATH = path.resolve(__dirname, "../data/local-queue.json");
const OAUTH_PENDING_PATH = path.resolve(__dirname, "../data/oauth-pending.json");
const SYSTEM_CONFIG_PATH = path.resolve(__dirname, "../data/system-config.json");
const REPORTING_SNAPSHOT_PATH = path.resolve(__dirname, "../data/reporting-snapshot.json");
const AC_GEOCODE_CACHE_PATH = path.resolve(__dirname, "../data/ac-geocode-cache.json");
const LINKED_REPORTS_PATH = path.resolve(__dirname, "../data/linked-reports.json");
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

function isReportingHostRequest(req) {
  const hostHeader = `${req.headers.host || ""}`.trim().toLowerCase();
  if (!hostHeader) {
    return false;
  }
  const host = hostHeader.split(":")[0];
  return host === REPORTING_HOST;
}

function parseCookieHeader(req) {
  const header = `${req.headers.cookie || ""}`;
  const out = {};
  for (const part of header.split(";")) {
    const piece = `${part || ""}`.trim();
    if (!piece) continue;
    const idx = piece.indexOf("=");
    if (idx <= 0) continue;
    const key = piece.slice(0, idx).trim();
    const rawValue = piece.slice(idx + 1).trim();
    let value = rawValue;
    try {
      value = decodeURIComponent(rawValue);
    } catch {
      // Malformed cookie values should not crash request handling.
      value = rawValue;
    }
    if (key) {
      out[key] = value;
    }
  }
  return out;
}

function getAdminTokenFromRequest(req) {
  const authHeader = req.get("authorization") || "";
  if (authHeader.startsWith("Bearer ")) {
    return authHeader.slice(7).trim();
  }
  const cookies = parseCookieHeader(req);
  return `${cookies[ADMIN_SESSION_COOKIE] || ""}`.trim();
}

function getAdminFromRequest(req) {
  const token = getAdminTokenFromRequest(req);
  const admin = getAdminBySessionToken(token);
  if (!token || !admin) {
    return { token: "", admin: null };
  }
  return { token, admin };
}

function setAdminSessionCookie(req, res, token) {
  const attrs = [
    `${ADMIN_SESSION_COOKIE}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax"
  ];
  if (req.secure || `${req.headers["x-forwarded-proto"] || ""}`.toLowerCase() === "https") {
    attrs.push("Secure");
  }
  res.setHeader("Set-Cookie", attrs.join("; "));
}

function clearAdminSessionCookie(req, res) {
  const attrs = [
    `${ADMIN_SESSION_COOKIE}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0"
  ];
  if (req.secure || `${req.headers["x-forwarded-proto"] || ""}`.toLowerCase() === "https") {
    attrs.push("Secure");
  }
  res.setHeader("Set-Cookie", attrs.join("; "));
}

app.use((req, res, next) => {
  if (!isReportingHostRequest(req)) {
    next();
    return;
  }

  const pathName = `${req.path || "/"}`.trim() || "/";
  const isApi = pathName.startsWith("/api/");
  const { admin } = getAdminFromRequest(req);
  const isAuthenticated = Boolean(admin);

  const publicPaths = new Set([
    "/reporting-login.html",
    "/reporting-login.js",
    "/account-access.html",
    "/account-access.js",
    "/admin.css",
    "/admin-pages.css",
    "/shell.css",
    "/shell.js"
  ]);

  if (pathName === "/api/admin/session" || pathName.startsWith("/api/account/")) {
    next();
    return;
  }

  if (!isAuthenticated) {
    if (pathName === "/") {
      res.redirect(302, "/reporting-login.html");
      return;
    }
    if (publicPaths.has(pathName)) {
      next();
      return;
    }
    if (isApi) {
      res.status(401).json({ error: "Admin authentication required." });
      return;
    }
    res.redirect(302, "/reporting-login.html");
    return;
  }

  if (pathName === "/") {
    res.redirect(302, "/admin-reporting.html");
    return;
  }

  if (isApi) {
      if (pathName === "/api/admin/session/logout"
        || pathName.startsWith("/api/admin/account/")
        || pathName.startsWith("/api/admin/reporting/")) {
      next();
      return;
    }
    res.status(403).json({ error: "This API is not available on reporting host." });
    return;
  }

  if (pathName === "/admin-reporting.html"
    || pathName === "/admin-reporting.js"
    || pathName === "/admin-layout-editor.js"
    || pathName === "/admin-report-cards.js"
    || pathName === "/admin-report-cards.css"
    || pathName === "/admin-animal-control.html"
    || pathName === "/admin-animal-control.js"
    || pathName === "/admin-animal-control-calls.html"
    || pathName === "/admin-animal-control-calls.js"
    || pathName === "/admin-animal-control-heatmap.html"
    || pathName === "/admin-animal-control-heatmap.js"
    || pathName === "/admin-shelter-reports.html"
    || pathName === "/admin-shelter-reports.js"
    || pathName === "/admin-linked-report.html"
    || pathName === "/admin-linked-report.js"
    || pathName === "/admin-active-fosters.html"
    || pathName === "/admin-active-fosters.js"
    || pathName === "/admin-shelter-health.html"
    || pathName === "/admin-shelter-health.js"
    || pathName === "/admin-city-daily-in-out.html"
    || pathName === "/admin-city-daily-in-out.js"
    || pathName === "/admin-staff-weekly-pathway-planning.html"
    || pathName === "/admin-staff-weekly-pathway-planning.js"
    || pathName === "/admin-daily-foster-movements.html"
    || pathName === "/admin-daily-foster-movements.js"
    || pathName === "/admin-adoption-followups.html"
    || pathName === "/admin-adoption-followups.js"
    || pathName === "/admin-donations-and-thank-yous.html"
    || pathName === "/admin-donations-and-thank-yous.js"
    || pathName === "/admin-pathway-planning.html"
    || pathName === "/admin-pathway-planning.js"
    || pathName === "/admin-yearly-reviews-upcoming.html"
    || pathName === "/admin-yearly-reviews-upcoming.js"
    || pathName === "/admin-tnr-clinic.html"
    || pathName === "/admin-tnr-clinic.js"
    || pathName === "/admin-reporting-account.html"
    || pathName === "/admin-reporting-account.js"
    || pathName === "/admin-reporting-users.html"
    || pathName === "/admin-reporting-users.js"
    || publicPaths.has(pathName)) {
    next();
    return;
  }

  res.status(404).send("Not Found");
});

app.use(express.static(path.resolve(__dirname, "../public")));

const state = {
  oauthState: null,
  oauthReturnPath: "/",
  oauthDerivedRedirectUri: null,
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
    animalControlReportTitle: `${process.env.ASM_ANIMALCONTROL_REPORT_TITLE || ""}`.trim(),
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
  revokedAdminTokens: new Map(),
  adminDbLoadedAt: 0,
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
    streamStats: {
      totalClientConnections: 0,
      totalClientDisconnects: 0,
      totalUpstreamErrors: 0,
      totalProxyErrors: 0,
      lastUpstreamStatus: null,
      lastError: "",
      lastClientConnectedAt: "",
      lastClientDisconnectedAt: "",
      lastUpstreamConnectedAt: "",
      lastUpstreamEndedAt: "",
      lastEventAt: ""
    },
    streamEvents: [],
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
  },
  reportingSnapshot: null,
  acGeocodeCache: {},
  linkedReports: [],
  linkedReportProbeCache: new Map(),
  linkedReportDataCache: new Map()
};

const STREAM_EVENT_LIMIT = 160;
const LINKED_REPORT_PROBE_CACHE_MS = 5 * 60 * 1000;

function addStreamEvent(type, detail = {}) {
  const event = {
    at: new Date().toISOString(),
    type: `${type || "event"}`.trim() || "event",
    detail: detail && typeof detail === "object" ? detail : { message: `${detail || ""}` }
  };
  state.audioAutomationRuntime.streamEvents.push(event);
  if (state.audioAutomationRuntime.streamEvents.length > STREAM_EVENT_LIMIT) {
    state.audioAutomationRuntime.streamEvents.splice(0, state.audioAutomationRuntime.streamEvents.length - STREAM_EVENT_LIMIT);
  }
  state.audioAutomationRuntime.streamStats.lastEventAt = event.at;
  return event;
}

function getLocalDateKey(date = new Date()) {
  const { year: y, month: m, day: d } = getServerTzParts(date);
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
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

const _tzDayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
let _activeTz = SERVER_TZ_DEFAULT;
let _tzFmt = buildTzFmt(_activeTz);

function buildTzFmt(tz) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hour12: false
  });
}

function setActiveTimezone(tz) {
  const safe = `${tz || ""}`.trim();
  if (!safe) throw new Error("Timezone cannot be empty.");
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: safe });
  } catch {
    throw new Error(`Invalid IANA timezone: ${safe}`);
  }
  _activeTz = safe;
  _tzFmt = buildTzFmt(safe);
}

function getActiveTimezone() {
  return _activeTz;
}

function getServerTzParts(date = new Date()) {
  const parts = Object.fromEntries(_tzFmt.formatToParts(date).map(({ type, value }) => [type, value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
    weekday: _tzDayNames.indexOf(parts.weekday)
  };
}

function getLocalMinuteKey(date = new Date()) {
  const { year: y, month: m, day: d, hour: hh, minute: mm } = getServerTzParts(date);
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
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
    const streamState = await setStreamDeliveryEnabled(safeAction === "start");
    return {
      target: safeTarget,
      action: safeAction,
      route: "stream-delivery",
      control: "state.audioAutomation.streamDeliveryEnabled",
      ...streamState
    };
  }
  if (safeTarget === "playback") {
    await mopidyRpc(`core.playback.${safeAction}`);
    const playbackState = await mopidyRpc("core.playback.get_state");
    return {
      target: safeTarget,
      action: safeAction,
      route: "mopidy",
      control: `core.playback.${safeAction}`,
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
    route: "alsa",
    card: getAudioJackRoutingConfig().card,
    control: getAudioJackRoutingConfig().control,
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
  const { hour: _h, minute: _m, weekday: day } = getServerTzParts(now);
  const time = `${String(_h).padStart(2, "0")}:${String(_m).padStart(2, "0")}`;
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

// ── JWT helpers (HS256, no external dependency) ───────────────────────────────
function _b64u(str) {
  return Buffer.from(str).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}
function _b64uDecode(str) {
  return Buffer.from(str.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}
function _jwtHmac(data) {
  const secret = SESSION_SECRET || "insecure-no-secret-set";
  return crypto.createHmac("sha256", secret).update(data).digest("base64")
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}
function signAdminJwt(userId, userUpdatedAt) {
  const header = _b64u(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const now = Math.floor(Date.now() / 1000);
  const payload = _b64u(JSON.stringify({
    sub: userId,
    uid: userUpdatedAt,
    jti: crypto.randomBytes(16).toString("hex"),
    iat: now,
    exp: now + ADMIN_SESSION_TTL_HOURS * 3600
  }));
  return `${header}.${payload}.${_jwtHmac(`${header}.${payload}`)}`;
}
function verifyAdminJwt(token) {
  try {
    const parts = `${token || ""}`.split(".");
    if (parts.length !== 3) return null;
    const [header, payload, sig] = parts;
    const expected = _jwtHmac(`${header}.${payload}`);
    const eBuf = Buffer.from(expected);
    const sBuf = Buffer.from(sig);
    if (eBuf.length !== sBuf.length) return null;
    if (!crypto.timingSafeEqual(sBuf, eBuf)) return null;
    const claims = JSON.parse(_b64uDecode(payload));
    if (!claims.exp || Math.floor(Date.now() / 1000) > claims.exp) return null;
    return claims;
  } catch {
    return null;
  }
}

function signAccountActionJwt({ userId, userUpdatedAt, username, action, ttlHours }) {
  const header = _b64u(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const now = Math.floor(Date.now() / 1000);
  const payload = _b64u(JSON.stringify({
    typ: "account-action",
    act: action,
    sub: userId,
    em: username,
    uid: userUpdatedAt,
    jti: crypto.randomBytes(16).toString("hex"),
    iat: now,
    exp: now + Math.max(1, Number(ttlHours || 1)) * 3600
  }));
  return `${header}.${payload}.${_jwtHmac(`${header}.${payload}`)}`;
}

function verifyAccountActionJwt(token, expectedAction = "") {
  const claims = verifyAdminJwt(token);
  if (!claims) return null;
  if (claims.typ !== "account-action") return null;
  if (!claims.sub || !claims.act) return null;
  if (expectedAction && claims.act !== expectedAction) return null;
  return claims;
}

function getRequestOrigin(req) {
  const forwardedProto = `${req.headers?.["x-forwarded-proto"] || ""}`.split(",")[0].trim().toLowerCase();
  const proto = forwardedProto || req.protocol || "http";
  const host = `${req.get("host") || ""}`.trim();
  if (host) {
    return `${proto}://${host}`;
  }
  return `${BASE_URL}`.replace(/\/$/, "");
}

function buildAccountActionUrl(req, token) {
  return `${getRequestOrigin(req)}/account-access.html?token=${encodeURIComponent(token)}`;
}

async function sendAccountActionEmail({ req, targetUser, action, actor }) {
  const ttlHours = action === "invite" ? ACCOUNT_INVITE_TTL_HOURS : ACCOUNT_RESET_TTL_HOURS;
  const token = signAccountActionJwt({
    userId: targetUser.id,
    userUpdatedAt: targetUser.updatedAt,
    username: targetUser.username,
    action,
    ttlHours
  });
  const actionUrl = buildAccountActionUrl(req, token);
  const displayName = targetUser.displayName || targetUser.username;
  const actionTitle = action === "invite" ? "Account invitation" : "Password reset";
  const subject = action === "invite"
    ? "HSNBA account invitation"
    : "HSNBA password reset";
  const actorLabel = actor?.displayName || actor?.username || "An administrator";
  const text = [
    `${actionTitle} for ${displayName}.`,
    "",
    `${actorLabel} requested this action.`,
    `Complete it here: ${actionUrl}`,
    `This link expires in ${ttlHours} hour(s).`,
    "",
    "If you did not expect this email, you can ignore it."
  ].join("\n");
  const html = [
    `<p><strong>${actionTitle}</strong> for ${displayName}.</p>`,
    `<p>${actorLabel} requested this action.</p>`,
    `<p><a href="${actionUrl}">Open secure account link</a></p>`,
    `<p>This link expires in ${ttlHours} hour(s).</p>`,
    "<p>If you did not expect this email, you can ignore it.</p>"
  ].join("");

  const result = await sendSystemEmail({
    to: targetUser.username,
    subject,
    text,
    html
  });

  return {
    ok: true,
    action,
    to: targetUser.username,
    expiresInHours: ttlHours,
    actionUrl,
    messageId: result.messageId || ""
  };
}
// ─────────────────────────────────────────────────────────────────────────────

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

const SECURITY_GROUPS = Object.freeze({
  USER: "user",
  JUKEBOX_ADMIN: "jukebox-admin",
  REPORTING: "reporting",
  SUPERADMIN: "superadmin",
  GLOBAL_ADMIN: "global-admin"
});

const SECURITY_GROUP_ALIASES = Object.freeze({
  admin: SECURITY_GROUPS.GLOBAL_ADMIN,
  admins: SECURITY_GROUPS.GLOBAL_ADMIN,
  "global_admin": SECURITY_GROUPS.GLOBAL_ADMIN,
  "global-admin": SECURITY_GROUPS.GLOBAL_ADMIN,
  "jukebox_admin": SECURITY_GROUPS.JUKEBOX_ADMIN,
  "jukebox-admin": SECURITY_GROUPS.JUKEBOX_ADMIN,
  "jukebox admin": SECURITY_GROUPS.JUKEBOX_ADMIN,
  "super-admin": SECURITY_GROUPS.SUPERADMIN,
  super_admin: SECURITY_GROUPS.SUPERADMIN
});

const PERMISSIONS = Object.freeze({
  ADMIN_PORTAL_LOGIN: "admin.portal.login",
  REQUESTS_PORTAL_USE: "jukebox.requests.portal.use",
  REQUESTS_QUEUE_ADD: "jukebox.requests.queue.add",
  REQUESTS_VOTE_CAST: "jukebox.requests.vote.cast",
  JUKEBOX_PLAYBACK_MANAGE: "jukebox.playback.manage",
  JUKEBOX_QUEUE_MANAGE: "jukebox.queue.manage",
  JUKEBOX_SLIDES_MANAGE: "jukebox.slides.manage",
  REPORTING_PORTAL_ACCESS: "reporting.portal.access",
  ACCOUNT_USERS_READ: "account.users.read",
  ACCOUNT_USERS_MANAGE: "account.users.manage",
  WILDCARD: "*"
});

const GROUP_PERMISSION_MAP = Object.freeze({
  [SECURITY_GROUPS.USER]: [
    PERMISSIONS.REQUESTS_PORTAL_USE,
    PERMISSIONS.REQUESTS_QUEUE_ADD,
    PERMISSIONS.REQUESTS_VOTE_CAST
  ],
  [SECURITY_GROUPS.JUKEBOX_ADMIN]: [
    PERMISSIONS.ADMIN_PORTAL_LOGIN,
    PERMISSIONS.REQUESTS_PORTAL_USE,
    PERMISSIONS.REQUESTS_QUEUE_ADD,
    PERMISSIONS.REQUESTS_VOTE_CAST,
    PERMISSIONS.JUKEBOX_PLAYBACK_MANAGE,
    PERMISSIONS.JUKEBOX_QUEUE_MANAGE,
    PERMISSIONS.JUKEBOX_SLIDES_MANAGE
  ],
  [SECURITY_GROUPS.REPORTING]: [
    PERMISSIONS.ADMIN_PORTAL_LOGIN,
    PERMISSIONS.REPORTING_PORTAL_ACCESS
  ],
  [SECURITY_GROUPS.GLOBAL_ADMIN]: [PERMISSIONS.WILDCARD],
  [SECURITY_GROUPS.SUPERADMIN]: [PERMISSIONS.WILDCARD]
});

function normalizeSecurityGroup(value) {
  const raw = `${value || ""}`.trim().toLowerCase();
  if (!raw) return "";
  return SECURITY_GROUP_ALIASES[raw] || raw;
}

function normalizeSecurityGroups(groups) {
  const source = Array.isArray(groups) ? groups : [];
  const normalized = source
    .map((group) => normalizeSecurityGroup(group))
    .filter((group) =>
      group
      && Object.values(SECURITY_GROUPS).includes(group)
    );
  return Array.from(new Set(normalized));
}

function getUserGroups(user) {
  return normalizeSecurityGroups(user?.groups);
}

function getUserPermissions(user) {
  const permissions = new Set();
  for (const group of getUserGroups(user)) {
    const mapped = GROUP_PERMISSION_MAP[group] || [];
    for (const permission of mapped) {
      permissions.add(permission);
    }
  }
  return Array.from(permissions);
}

function userHasPermission(user, permission) {
  if (!permission) return false;
  const permissions = new Set(getUserPermissions(user));
  return permissions.has(PERMISSIONS.WILDCARD) || permissions.has(permission);
}

function userHasAnyPermission(user, requiredPermissions = []) {
  const required = Array.isArray(requiredPermissions) ? requiredPermissions : [];
  return required.some((permission) => userHasPermission(user, permission));
}

function isUserAdmin(user) {
  return userHasPermission(user, PERMISSIONS.ADMIN_PORTAL_LOGIN);
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
    const groups = normalizeSecurityGroups(item.groups);
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
  const serialized = JSON.stringify(state.adminDb, null, 2);
  const tempPath = `${ADMIN_DB_PATH}.tmp-${process.pid}-${Date.now()}`;
  try {
    if (fs.existsSync(ADMIN_DB_PATH)) {
      fs.copyFileSync(ADMIN_DB_PATH, ADMIN_DB_BACKUP_PATH);
    }
  } catch {
    // Backup failures should not block credential writes.
  }
  fs.writeFileSync(tempPath, serialized, "utf8");
  fs.renameSync(tempPath, ADMIN_DB_PATH);
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
    groups: [SECURITY_GROUPS.GLOBAL_ADMIN],
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
    } else {
      const text = fs.readFileSync(ADMIN_DB_PATH, "utf8");
      state.adminDb = normalizeAdminDb(JSON.parse(text));
      bootstrapDefaultAdminIfNeeded();
    }
  } catch (error) {
    console.warn(`Failed to load admin db: ${error.message}`);
    try {
      if (fs.existsSync(ADMIN_DB_BACKUP_PATH)) {
        const backupText = fs.readFileSync(ADMIN_DB_BACKUP_PATH, "utf8");
        state.adminDb = normalizeAdminDb(JSON.parse(backupText));
        bootstrapDefaultAdminIfNeeded();
        saveAdminDb();
      } else {
        state.adminDb = normalizeAdminDb(null);
        bootstrapDefaultAdminIfNeeded();
      }
    } catch (backupError) {
      console.warn(`Failed to load admin db backup: ${backupError.message}`);
      state.adminDb = normalizeAdminDb(null);
      bootstrapDefaultAdminIfNeeded();
    }
  }
  state.adminDbLoadedAt = Date.now();
  return state.adminDb;
}

function refreshAdminDbIfStale() {
  try {
    const { mtimeMs } = fs.statSync(ADMIN_DB_PATH);
    if (mtimeMs > state.adminDbLoadedAt) {
      loadAdminDb();
    }
  } catch {
    // File may not exist yet; no refresh needed.
  }
}

function ensureAdminDbSnapshotDir() {
  if (!fs.existsSync(ADMIN_DB_SNAPSHOT_DIR)) {
    fs.mkdirSync(ADMIN_DB_SNAPSHOT_DIR, { recursive: true });
  }
}

function listAdminDbSnapshots() {
  try {
    ensureAdminDbSnapshotDir();
    return fs.readdirSync(ADMIN_DB_SNAPSHOT_DIR)
      .filter((name) => name.startsWith("admin-db-") && name.endsWith(".json"))
      .map((name) => {
        const fullPath = path.join(ADMIN_DB_SNAPSHOT_DIR, name);
        const stat = fs.statSync(fullPath);
        return {
          fileName: name,
          size: stat.size,
          createdAt: stat.mtime.toISOString()
        };
      })
      .sort((a, b) => `${b.fileName}`.localeCompare(`${a.fileName}`));
  } catch {
    return [];
  }
}

function pruneAdminDbSnapshots() {
  const snapshots = listAdminDbSnapshots();
  if (snapshots.length <= ADMIN_DB_SNAPSHOT_KEEP) {
    return;
  }
  for (const item of snapshots.slice(ADMIN_DB_SNAPSHOT_KEEP)) {
    try {
      fs.unlinkSync(path.join(ADMIN_DB_SNAPSHOT_DIR, item.fileName));
    } catch {
      // Best effort prune.
    }
  }
}

function writeAdminDbSnapshot(reason = "periodic") {
  if (!state.adminDb) {
    return null;
  }
  ensureAdminDbSnapshotDir();
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const safeReason = `${reason || "manual"}`.replace(/[^a-z0-9_-]/gi, "-").toLowerCase();
  const fileName = `admin-db-${stamp}-${safeReason}.json`;
  const fullPath = path.join(ADMIN_DB_SNAPSHOT_DIR, fileName);
  fs.writeFileSync(fullPath, JSON.stringify(state.adminDb, null, 2), "utf8");
  pruneAdminDbSnapshots();
  return fileName;
}

function restoreAdminDbSnapshot(fileName) {
  const cleanName = path.basename(`${fileName || ""}`);
  if (!cleanName || cleanName !== fileName || !cleanName.startsWith("admin-db-") || !cleanName.endsWith(".json")) {
    throw new Error("Invalid snapshot file name.");
  }
  const snapshotPath = path.join(ADMIN_DB_SNAPSHOT_DIR, cleanName);
  if (!fs.existsSync(snapshotPath)) {
    throw new Error("Snapshot not found.");
  }
  const text = fs.readFileSync(snapshotPath, "utf8");
  state.adminDb = normalizeAdminDb(JSON.parse(text));
  bootstrapDefaultAdminIfNeeded();
  saveAdminDb();
  state.adminDbLoadedAt = Date.now();
  return cleanName;
}

function getAdminBySessionToken(token) {
  const claims = verifyAdminJwt(token);
  if (!claims?.sub) return null;
  if (claims.jti && state.revokedAdminTokens.has(claims.jti)) return null;
  const user = getUserById(claims.sub);
  if (!user || !isUserAdmin(user) || user.active === false) return null;
  // Invalidate if the user's account was updated (e.g. password change) after token was issued
  if (user.updatedAt && claims.uid !== user.updatedAt) return null;
  return user;
}

loadUserDb();
loadAdminDb();
try {
  writeAdminDbSnapshot("startup");
} catch (error) {
  console.warn(`Startup admin DB snapshot failed: ${error.message}`);
}
loadSlideshowConfig();
loadAudioAutomationConfig();
loadSystemConfig();
loadLocalQueue();
loadReportingSnapshot();
loadAcGeocodeCache();
loadLinkedReports();
startAudioAutomationScheduler();
startReportingScheduler();

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

async function fetchAsmRowsForMethod(method, extraParams = {}) {
  const requestUrl = buildAsmServiceUrl(method, extraParams);
  if (!requestUrl) {
    throw new Error(`ASM service URL missing for ${method}`);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ASM_FETCH_TIMEOUT_MS);
  let response;
  try {
    response = await fetch(requestUrl, {
      headers: { Accept: "application/json" },
      signal: controller.signal
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`ASM ${method} request timed out after ${Math.round(ASM_FETCH_TIMEOUT_MS / 1000)}s`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
  const bodyText = await response.text();
  if (!response.ok) {
    const detail = bodyText.slice(0, 240).replace(/\s+/g, " ").trim();
    throw new Error(detail ? `ASM ${method} HTTP ${response.status}: ${detail}` : `ASM ${method} HTTP ${response.status}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    throw new Error(`ASM ${method} returned non-JSON response`);
  }
  return extractAsmRows(parsed);
}

function normalizeAsmReportError(error, fallbackMessage) {
  const message = `${error?.message || ""}`.trim();
  if (/Reports must be based on a SELECT query/i.test(message)) {
    return "ASM report is not a SQL SELECT report. Update the Shelter Manager report query to a SELECT statement, then retry.";
  }
  return message || fallbackMessage;
}

function formatAsmReportDateInput(value) {
  const raw = `${value || ""}`.trim();
  const ymd = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (ymd) {
    return `${Number(ymd[2])}/${Number(ymd[3])}/${ymd[1]}`;
  }
  return raw;
}

function loadAcGeocodeCache() {
  try {
    if (!fs.existsSync(AC_GEOCODE_CACHE_PATH)) return;
    const text = fs.readFileSync(AC_GEOCODE_CACHE_PATH, "utf8");
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object") {
      state.acGeocodeCache = parsed;
    }
  } catch (error) {
    console.warn(`Could not load AC geocode cache: ${error.message}`);
  }
}

function saveAcGeocodeCache() {
  try {
    const dir = path.dirname(AC_GEOCODE_CACHE_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(AC_GEOCODE_CACHE_PATH, JSON.stringify(state.acGeocodeCache, null, 2), "utf8");
  } catch (error) {
    console.warn(`Could not save AC geocode cache: ${error.message}`);
  }
}

function sanitizeLinkedReportFields(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((f) => f && typeof f === "object")
    .map((f, i) => ({
      key: `${f.key || ""}`.trim().slice(0, 100),
      label: `${f.label || ""}`.trim().slice(0, 80),
      expanded: Boolean(f.expanded),
      groupBy: Boolean(f.groupBy),
      chartLeft: Boolean(f.chartLeft),
      chartRight: Boolean(f.chartRight),
      order: Number.isFinite(Number(f.order)) ? Number(f.order) : i
    }))
    .filter((f) => f.key)
    .sort((a, b) => a.order - b.order)
    .slice(0, 60);
}

function sanitizeLinkedReport(raw) {
  const allowedChartTypes = new Set(["bar", "line", "pie", "doughnut"]);
  const chartLeftTypeRaw = `${raw.chartLeftType || "bar"}`.trim().toLowerCase();
  const chartRightTypeRaw = `${raw.chartRightType || "bar"}`.trim().toLowerCase();
  return {
    id: `${raw.id || crypto.randomUUID()}`,
    title: `${raw.title || ""}`.trim().slice(0, 120),
    description: `${raw.description || ""}`.trim().slice(0, 300),
    asmReportTitle: `${raw.asmReportTitle || ""}`.trim().slice(0, 200),
    linkTemplate: `${raw.linkTemplate || ""}`.trim().slice(0, 400),
    linkLabel: `${raw.linkLabel || ""}`.trim().slice(0, 60),
    chartLeftTitle: `${raw.chartLeftTitle || ""}`.trim().slice(0, 80),
    chartRightTitle: `${raw.chartRightTitle || ""}`.trim().slice(0, 80),
    chartLeftType: allowedChartTypes.has(chartLeftTypeRaw) ? chartLeftTypeRaw : "bar",
    chartRightType: allowedChartTypes.has(chartRightTypeRaw) ? chartRightTypeRaw : "bar",
    showChartsOnDashboard: Boolean(raw.showChartsOnDashboard),
    fields: sanitizeLinkedReportFields(raw.fields || []),
    createdAt: `${raw.createdAt || new Date().toISOString()}`,
    updatedAt: new Date().toISOString()
  };
}

function loadLinkedReports() {
  try {
    if (!fs.existsSync(LINKED_REPORTS_PATH)) return;
    const text = fs.readFileSync(LINKED_REPORTS_PATH, "utf8");
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) {
      state.linkedReports = parsed;
    }
  } catch (error) {
    console.warn(`Could not load linked reports: ${error.message}`);
  }
}

function saveLinkedReports() {
  try {
    const dir = path.dirname(LINKED_REPORTS_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(LINKED_REPORTS_PATH, JSON.stringify(state.linkedReports, null, 2), "utf8");
  } catch (error) {
    console.warn(`Could not save linked reports: ${error.message}`);
  }
}

function extractAsmRetryHint(error) {
  const message = `${error?.message || ""}`;
  const untilMatch = message.match(/until\s+'([^']+)'/i);
  const waitMatch = message.match(/wait\s+(\d+)\s+seconds/i);
  return {
    retryAt: untilMatch?.[1] ? `${untilMatch[1]}`.trim() : "",
    waitSeconds: waitMatch?.[1] ? Number(waitMatch[1]) : 0
  };
}

function getLinkedReportProbePresetFields(asmReportTitle) {
  const title = `${asmReportTitle || ""}`.trim().toLowerCase();
  if (!title) return [];

  if (title.includes("active fosters")) {
    return ["fosteredTo", "ownerAddress", "homeTelephone", "mobileTelephone", "emailAddress", "animalId", "shelterCode", "animalName", "sex", "colour", "breedName", "dateOfBirth", "animalAge"];
  }
  if (title.includes("shelter health") || title.includes("health notes")) {
    return ["animalName", "logTypeName", "weight", "shortCode", "displayLocation", "comments", "date", "createdBy"];
  }
  if (title.includes("city daily in/out") || title.includes("city daily in out")) {
    return ["theDate", "reason", "shelterCode", "animalId", "identichipNumber", "animalName", "animalTypeName", "speciesName", "animalAge", "sexName", "locationFound", "categoryName", "outOrIn"];
  }
  if (title.includes("staff") && title.includes("weekly") && title.includes("pathway")) {
    return ["reason", "animalName", "holdDate", "animalAge", "daysOnShelter", "shortCode", "displayLocation", "weight", "comments", "pic", "lastChangedDate"];
  }
  if (title.includes("daily foster movements")) {
    return ["theDate", "reason", "categoryName", "shelterCode", "animalId", "identichipNumber", "animalName", "displayLocation", "speciesName", "animalAge", "sexName", "locationFound", "outOrIn"];
  }
  if (title.includes("pathway planning")) {
    return ["reason", "animalName", "holdDate", "animalAge", "daysOnShelter", "shortCode", "displayLocation", "weight", "comments", "pic", "lastChangedDate"];
  }
  if (title.includes("donations") && title.includes("thank")) {
    return ["ownerName", "ownerId", "comments", "donation", "emailAddress", "ownerAddress", "ownerTown", "ownerCounty", "ownerPostcode", "paymentName", "date", "donationName"];
  }
  if (title.includes("adoption follow-up") || title.includes("adoption followup")) {
    return ["ownerName", "ownerSurname", "ownerForenames", "ownerAddress", "homeTelephone", "mobileTelephone", "workTelephone", "ownerTown", "ownerCounty", "ownerPostcode", "emailAddress", "shelterCode", "animalId", "asmAnimalUrl", "animalName", "speciesName", "neuteredDate", "adoptionDate"];
  }
  if (title.includes("yearly reviews upcoming")) {
    return ["ownerName", "value"];
  }

  return [];
}

function getLinkedReportTimingHint(asmReportTitle, fieldKeys = []) {
  const title = `${asmReportTitle || ""}`.trim().toLowerCase();
  const normalizedFields = Array.isArray(fieldKeys)
    ? fieldKeys.map((key) => `${key || ""}`.toLowerCase().replace(/[^a-z0-9]/g, ""))
    : [];
  const hasField = (...keys) => keys.some((key) => normalizedFields.includes(`${key}`.toLowerCase().replace(/[^a-z0-9]/g, "")));

  if (!title) {
    return {
      kind: "unknown",
      label: "Unknown",
      description: "No timing hint available yet.",
      suggestDateRange: false
    };
  }

  if (title.includes("adoption follow-up") || title.includes("adoption followup") || title.includes("month") || title.includes("monthly")) {
    return {
      kind: "period",
      label: "Period-based",
      description: "This report likely uses a fixed period prompt such as month/year rather than a free-form from/to date range.",
      suggestDateRange: false
    };
  }

  if (title.includes("daily foster movements") || title.includes("city daily in/out") || title.includes("city daily in out") || title.includes("history") || title.includes("between") || title.includes("range")) {
    return {
      kind: "date-range",
      label: "Likely date range",
      description: "This report looks date-driven and is a good candidate for the report page date filter.",
      suggestDateRange: true
    };
  }

  if (title.includes("active fosters") || title.includes("pathway planning") || title.includes("yearly reviews upcoming") || title.includes("upcoming")) {
    return {
      kind: "current",
      label: "Likely current-state",
      description: "This report looks like a current snapshot rather than a user-selected date range.",
      suggestDateRange: false
    };
  }

  if (title.includes("shelter health") || title.includes("health notes") || title.includes("last day") || title.includes("today") || title.includes("current")) {
    return {
      kind: "rolling-window",
      label: "Likely rolling window",
      description: "This report appears to use an internal rolling window such as today or the last day, not a user-selected date range.",
      suggestDateRange: false
    };
  }

  if (hasField("theDate", "date", "fromdate", "todate", "holdDate") && (hasField("reason", "outOrIn") || title.includes("daily") || title.includes("movement"))) {
    return {
      kind: "date-range",
      label: "Possibly date range",
      description: "This report includes date-oriented fields and may support a report page date filter.",
      suggestDateRange: true
    };
  }

  return {
    kind: "unknown",
    label: "Unknown",
    description: "Could not confidently tell whether this report is date-ranged or current-state from the title and sampled fields.",
    suggestDateRange: false
  };
}

function pickFirstLinkedReportText(row, fields, fallback = "") {
  for (const field of fields) {
    const value = row?.[field];
    if (value === undefined || value === null) continue;
    const text = `${value}`.trim();
    if (text) return text;
  }
  return fallback;
}

function normalizeKnownLinkedReportRows(asmReportTitle, rows) {
  const title = `${asmReportTitle || ""}`.trim().toLowerCase();
  const list = Array.isArray(rows) ? rows : [];

  if (title.includes("active fosters")) {
    return list.map((row) => ({
      fosteredTo: pickFirstLinkedReportText(row, ["FosteredTo", "FOSTEREDTO", "CURRENTOWNERNAME", "OWNERNAME", "OWNER"]),
      ownerAddress: pickFirstLinkedReportText(row, ["OwnerAddress", "OWNERADDRESS", "CURRENTOWNERADDRESS", "ADDRESS"]),
      homeTelephone: pickFirstLinkedReportText(row, ["HomeTelephone", "HOMETELEPHONE", "CURRENTOWNERHOMETELEPHONE", "PHONE"]),
      mobileTelephone: pickFirstLinkedReportText(row, ["MobileTelephone", "MOBILETELEPHONE", "CURRENTOWNERMOBILETELEPHONE", "MOBILE"]),
      emailAddress: pickFirstLinkedReportText(row, ["EMAILADDRESS", "EmailAddress", "CURRENTOWNEREMAILADDRESS", "EMAIL"]),
      animalId: pickFirstLinkedReportText(row, ["ID", "ANIMALID", "AnimalID"]),
      shelterCode: pickFirstLinkedReportText(row, ["ShelterCode", "SHELTERCODE", "CODE"]),
      animalName: pickFirstLinkedReportText(row, ["AnimalName", "ANIMALNAME", "NAME"]),
      sex: pickFirstLinkedReportText(row, ["Sex", "SEX", "SEXNAME"]),
      colour: pickFirstLinkedReportText(row, ["Colour", "COLOR", "COLOUR", "BASECOLOURNAME"]),
      breedName: pickFirstLinkedReportText(row, ["BreedName", "BREEDNAME", "BREED", "BREEDNAME1"]),
      dateOfBirth: pickFirstLinkedReportText(row, ["DateOfBirth", "DATEOFBIRTH", "DOB"]),
      animalAge: pickFirstLinkedReportText(row, ["AnimalAge", "ANIMALAGE", "AGE"])
    }));
  }

  if (title.includes("shelter health") || title.includes("health notes")) {
    return list.map((row) => ({
      animalName: pickFirstLinkedReportText(row, ["AnimalName", "ANIMALNAME"]),
      logTypeName: pickFirstLinkedReportText(row, ["LogTypeName", "LOGTYPENAME"]),
      weight: pickFirstLinkedReportText(row, ["Weight", "WEIGHT"]),
      shortCode: pickFirstLinkedReportText(row, ["ShortCode", "SHORTCODE"]),
      displayLocation: pickFirstLinkedReportText(row, ["DisplayLocation", "DISPLAYLOCATION"]),
      comments: pickFirstLinkedReportText(row, ["Comments", "COMMENTS"]),
      date: pickFirstLinkedReportText(row, ["Date", "DATE"]),
      createdBy: pickFirstLinkedReportText(row, ["CreatedBy", "CREATEDBY"])
    }));
  }

  if (title.includes("city daily in/out") || title.includes("city daily in out")) {
    return list.map((row) => ({
      theDate: pickFirstLinkedReportText(row, ["thedate", "THEDATE", "DATE"]),
      reason: pickFirstLinkedReportText(row, ["Reason", "REASON"]),
      shelterCode: pickFirstLinkedReportText(row, ["ShelterCode", "SHELTERCODE"]),
      animalId: pickFirstLinkedReportText(row, ["ID", "ANIMALID", "AnimalID"]),
      identichipNumber: pickFirstLinkedReportText(row, ["IdentichipNumber", "IDENTICHIPNUMBER"]),
      animalName: pickFirstLinkedReportText(row, ["AnimalName", "ANIMALNAME"]),
      animalTypeName: pickFirstLinkedReportText(row, ["AnimalTypeName", "ANIMALTYPENAME"]),
      speciesName: pickFirstLinkedReportText(row, ["SpeciesName", "SPECIESNAME"]),
      animalAge: pickFirstLinkedReportText(row, ["AnimalAge", "ANIMALAGE"]),
      sexName: pickFirstLinkedReportText(row, ["SexName", "SEXNAME"]),
      locationFound: pickFirstLinkedReportText(row, ["locationfound", "LOCATIONFOUND"]),
      categoryName: pickFirstLinkedReportText(row, ["CategoryName", "CATEGORYNAME"]),
      outOrIn: pickFirstLinkedReportText(row, ["OutOrIn", "OUTORIN"])
    }));
  }

  if ((title.includes("staff") && title.includes("weekly") && title.includes("pathway")) || title.includes("pathway planning")) {
    return list.map((row) => ({
      reason: pickFirstLinkedReportText(row, ["Reason", "REASON"]),
      animalName: pickFirstLinkedReportText(row, ["AnimalName", "ANIMALNAME"]),
      holdDate: pickFirstLinkedReportText(row, ["HoldDate", "HOLDDATE", "Holddate", "HOLDUNTILDATE"]),
      animalAge: pickFirstLinkedReportText(row, ["AnimalAge", "ANIMALAGE", "animalage"]),
      daysOnShelter: pickFirstLinkedReportText(row, ["DaysOnShelter", "DAYSONSHELTER", "daysonshelter"]),
      shortCode: pickFirstLinkedReportText(row, ["ShortCode", "SHORTCODE", "shortcode"]),
      displayLocation: pickFirstLinkedReportText(row, ["DisplayLocation", "DISPLAYLOCATION", "displaylocation"]),
      weight: pickFirstLinkedReportText(row, ["Weight", "WEIGHT", "weight"]),
      comments: pickFirstLinkedReportText(row, ["Comments", "COMMENTS"]),
      pic: pickFirstLinkedReportText(row, ["Pic", "PIC", "pic"]),
      lastChangedDate: pickFirstLinkedReportText(row, ["LastChangedDate", "LASTCHANGEDDATE"])
    }));
  }

  if (title.includes("daily foster movements")) {
    return list.map((row) => ({
      theDate: pickFirstLinkedReportText(row, ["thedate", "THEDATE", "DATE"]),
      reason: pickFirstLinkedReportText(row, ["Reason", "REASON"]),
      categoryName: pickFirstLinkedReportText(row, ["CategoryName", "CATEGORYNAME"]),
      shelterCode: pickFirstLinkedReportText(row, ["ShelterCode", "SHELTERCODE"]),
      animalId: pickFirstLinkedReportText(row, ["ID", "ANIMALID", "AnimalID"]),
      identichipNumber: pickFirstLinkedReportText(row, ["IdentichipNumber", "IDENTICHIPNUMBER"]),
      animalName: pickFirstLinkedReportText(row, ["AnimalName", "ANIMALNAME"]),
      displayLocation: pickFirstLinkedReportText(row, ["DisplayLocation", "DISPLAYLOCATION"]),
      speciesName: pickFirstLinkedReportText(row, ["SpeciesName", "SPECIESNAME"]),
      animalAge: pickFirstLinkedReportText(row, ["AnimalAge", "ANIMALAGE"]),
      sexName: pickFirstLinkedReportText(row, ["SexName", "SEXNAME"]),
      locationFound: pickFirstLinkedReportText(row, ["locationfound", "LOCATIONFOUND"]),
      outOrIn: pickFirstLinkedReportText(row, ["OutOrIn", "OUTORIN"])
    }));
  }

  if (title.includes("donations") && title.includes("thank")) {
    const extractOwnerName = (raw) => {
      const match = `${raw || ""}`.match(/>([^<]+)</);
      return match ? match[1].trim() : `${raw || ""}`.replace(/<[^>]*>/g, "").trim();
    };
    const extractOwnerId = (raw) => {
      const match = `${raw || ""}`.match(/\?id=(\d+)/i);
      return match ? match[1] : "";
    };

    return list.map((row) => {
      const ownerHtml = pickFirstLinkedReportText(row, ["?column?", "?COLUMN?", "OWNERLINK", "ownerlink"]);
      return {
        ownerName: extractOwnerName(ownerHtml),
        ownerId: extractOwnerId(ownerHtml),
        comments: pickFirstLinkedReportText(row, ["Comments", "COMMENTS"]),
        donation: pickFirstLinkedReportText(row, ["Donation", "DONATION"]),
        emailAddress: pickFirstLinkedReportText(row, ["emailaddress", "EMAILADDRESS", "EmailAddress"]),
        ownerAddress: pickFirstLinkedReportText(row, ["OwnerAddress", "OWNERADDRESS", "Owneraddress"]),
        ownerTown: pickFirstLinkedReportText(row, ["OwnerTown", "OWNERTOWN", "ownertown"]),
        ownerCounty: pickFirstLinkedReportText(row, ["OwnerCounty", "OWNERCOUNTY", "ownercounty"]),
        ownerPostcode: pickFirstLinkedReportText(row, ["OwnerPostcode", "OWNERPOSTCODE", "ownerpostcode"]),
        paymentName: pickFirstLinkedReportText(row, ["PaymentName", "PAYMENTNAME"]),
        date: pickFirstLinkedReportText(row, ["Date", "DATE"]),
        donationName: pickFirstLinkedReportText(row, ["DonationName", "DONATIONNAME"])
      };
    });
  }

  if (title.includes("adoption follow-up") || title.includes("adoption followup")) {
    const extractAnimalId = (row) => {
      const direct = pickFirstLinkedReportText(row, ["id", "ID", "animalid", "ANIMALID", "AnimalID"]);
      if (direct) return direct;

      const possibleHtml = [
        row?.AnimalName,
        row?.ANIMALNAME,
        row?.animalname,
        row?.ShelterCode,
        row?.SHELTERCODE,
        row?.sheltercode
      ];

      for (const raw of possibleHtml) {
        const match = `${raw || ""}`.match(/[?&]id=(\d+)/i);
        if (match) return match[1];
      }

      return "";
    };

    const extractAnimalLink = (row) => {
      const possibleHtml = [
        row?.AnimalName,
        row?.ANIMALNAME,
        row?.animalname,
        row?.ShelterCode,
        row?.SHELTERCODE,
        row?.sheltercode
      ];

      for (const raw of possibleHtml) {
        const html = `${raw || ""}`;
        const hrefMatch = html.match(/href\s*=\s*["']([^"']+)["']/i);
        if (!hrefMatch?.[1]) continue;

        const href = hrefMatch[1].trim();
        if (!href || /^javascript:/i.test(href)) continue;

        try {
          const url = new URL(href, "https://us10d.sheltermanager.com");
          if (/sheltermanager\.com$/i.test(url.hostname)) {
            url.protocol = "https:";
            url.hostname = "us10d.sheltermanager.com";
            url.port = "";
          }
          return url.toString();
        } catch {
          // Ignore malformed links and continue scanning other fields.
        }
      }

      return "";
    };

    return list.map((row) => {
      const asmAnimalUrl = extractAnimalLink(row);
      const animalId = extractAnimalId(row) || ((`${asmAnimalUrl}`.match(/[?&]id=(\d+)/i) || [])[1] || "");

      return {
        ownerName: pickFirstLinkedReportText(row, ["OwnerName", "OWNERNAME"]),
        ownerSurname: pickFirstLinkedReportText(row, ["OWNERSURNAME", "OwnerSurname"]),
        ownerForenames: pickFirstLinkedReportText(row, ["OWNERFORENAMES", "OwnerForenames"]),
        ownerAddress: pickFirstLinkedReportText(row, ["OwnerAddress", "OWNERADDRESS"]),
        homeTelephone: pickFirstLinkedReportText(row, ["HOMETELEPHONE", "HomeTelephone"]),
        mobileTelephone: pickFirstLinkedReportText(row, ["MOBILETELEPHONE", "MobileTelephone"]),
        workTelephone: pickFirstLinkedReportText(row, ["WORKTELEPHONE", "WorkTelephone"]),
        ownerTown: pickFirstLinkedReportText(row, ["OwnerTown", "OWNERTOWN"]),
        ownerCounty: pickFirstLinkedReportText(row, ["OwnerCounty", "OWNERCOUNTY"]),
        ownerPostcode: pickFirstLinkedReportText(row, ["OwnerPostcode", "OWNERPOSTCODE"]),
        emailAddress: pickFirstLinkedReportText(row, ["EmailAddress", "EMAILADDRESS"]),
        shelterCode: pickFirstLinkedReportText(row, ["ShelterCode", "SHELTERCODE"]),
        animalId,
        asmAnimalUrl,
        animalName: pickFirstLinkedReportText(row, ["AnimalName", "ANIMALNAME"]),
        speciesName: pickFirstLinkedReportText(row, ["SpeciesName", "SPECIESNAME"]),
        neuteredDate: pickFirstLinkedReportText(row, ["NEUTEREDDATE", "NeuteredDate"]),
        adoptionDate: pickFirstLinkedReportText(row, ["AdoptionDate", "ADOPTIONDATE"])
      };
    });
  }

  if (title.includes("yearly reviews upcoming")) {
    return list.map((row) => ({
      ownerName: pickFirstLinkedReportText(row, ["OWNERNAME", "OwnerName"]),
      value: pickFirstLinkedReportText(row, ["VALUE", "Value"])
    }));
  }

  return list;
}

async function fetchAnimalControlRowsForRange(fromDate, toDate) {
  const reportTitle = `${state.asm.animalControlReportTitle || ""}`.trim();
  const methodCandidates = [
    `${process.env.ASM_ANIMALCONTROL_METHOD || ""}`.trim(),
    "json_animalcontrol_incidents",
    "json_animalcontrol",
    "json_animalcontrolcalls"
  ].filter(Boolean);

  const typeFields = ["INCIDENTTYPE", "INCIDENTTYPENAME", "CALLTYPE", "CALLTYPENAME", "INCIDENTNAME", "TYPE", "CATEGORY", "SUBJECT"];
  const pickFirstText = (row, fields, fallback = "") => {
    for (const field of fields) {
      const value = row?.[field];
      if (value === undefined || value === null) continue;
      const text = `${value}`.trim();
      if (text) return text;
    }
    return fallback;
  };

  const dedupeRows = (rows) => {
    const idFields = [
      "ANIMALCONTROLINCIDENTID",
      "INCIDENTID",
      "INCIDENT_ID",
      "CASEID",
      "CALLID",
      "ID"
    ];
    const dateFields = [
      "INCIDENTDATETIME",
      "INCIDENTDATE",
      "CALLDATE",
      "REPORTEDDATE",
      "DATE",
      "CREATEDDATE",
      "LASTCHANGEDDATE"
    ];
    const codeFields = ["INCIDENTCODE", "INCIDENTNUMBER", "CALLNUMBER", "REFERENCE", "CASENUMBER"];
    const callerFields = ["CALLERNAME", "CALLER", "CONTACTNAME", "REPORTERNAME", "REPORTEDBY", "OWNERNAME"];
    const addressFields = ["DISPATCHADDRESS", "ADDRESS", "LOCATION", "SITE", "DISPATCHLOCATION"];
    const notesFields = ["NOTES", "DETAILS", "COMMENTS", "DESCRIPTION", "INCIDENTNOTES", "CALLNOTES"];

    const normalize = (value) => `${value ?? ""}`.trim().replace(/\s+/g, " ").toLowerCase();
    const seen = new Set();
    const deduped = [];

    for (const row of rows || []) {
      const stableId = pickFirstText(row, idFields, "");
      const key = stableId
        ? `id:${normalize(stableId)}`
        : [
            pickFirstText(row, dateFields, ""),
            pickFirstText(row, typeFields, ""),
            pickFirstText(row, codeFields, ""),
            pickFirstText(row, callerFields, ""),
            pickFirstText(row, addressFields, ""),
            pickFirstText(row, notesFields, "")
          ].map((part) => normalize(part)).join("|");

      if (!key || seen.has(key)) continue;
      seen.add(key);
      deduped.push(row);
    }

    return deduped;
  };

  let sourceMethod = "";
  let sourceRows = [];
  let lastError = "";

  if (reportTitle) {
    try {
      const rows = await fetchAsmRowsForMethod("json_report", {
        title: reportTitle,
        ASK1: formatAsmReportDateInput(fromDate),
        ASK2: formatAsmReportDateInput(toDate)
      });
      sourceMethod = `json_report:${reportTitle}`;
      sourceRows = dedupeRows(rows);
      return { sourceMethod, rows: sourceRows };
    } catch (error) {
      lastError = error.message || "Unable to fetch Animal Control report from ASM.";
    }
  }

  for (const method of methodCandidates) {
    try {
      const rows = await fetchAsmRowsForMethod(method, { fromdate: fromDate, todate: toDate });
      sourceMethod = method;
      sourceRows = dedupeRows(rows);
      if (!rows.length) continue;
      const hasTypeField = sourceRows.some((row) => Boolean(pickFirstText(row, typeFields, "")));
      if (hasTypeField) break;
    } catch (error) {
      lastError = error.message || lastError;
      // Try next candidate method.
    }
  }

  if (!sourceMethod) {
    throw new Error(lastError || "Unable to fetch animal control call data from ASM.");
  }

  return { sourceMethod, rows: sourceRows };
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

function saveSpotifyTokens() {
  try {
    if (state.tokens) {
      fs.writeFileSync(SPOTIFY_TOKENS_PATH, JSON.stringify(state.tokens), "utf8");
    } else if (fs.existsSync(SPOTIFY_TOKENS_PATH)) {
      fs.unlinkSync(SPOTIFY_TOKENS_PATH);
    }
  } catch (error) {
    console.warn(`Unable to persist Spotify tokens: ${error.message}`);
  }
}

function loadSpotifyTokens() {
  try {
    if (fs.existsSync(SPOTIFY_TOKENS_PATH)) {
      const tokens = JSON.parse(fs.readFileSync(SPOTIFY_TOKENS_PATH, "utf8"));
      if (tokens?.access_token && tokens?.refresh_token) {
        state.tokens = tokens;
        console.log("Loaded Spotify tokens from disk.");
      }
    }
  } catch (error) {
    console.warn(`Unable to load Spotify tokens: ${error.message}`);
  }
}

function saveLocalQueue() {
  try {
    const dir = path.dirname(LOCAL_QUEUE_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(LOCAL_QUEUE_PATH, JSON.stringify(state.localQueue, null, 2), "utf8");
  } catch (error) {
    console.warn(`Unable to persist local queue: ${error.message}`);
  }
}

function loadLocalQueue() {
  try {
    if (fs.existsSync(LOCAL_QUEUE_PATH)) {
      const parsed = JSON.parse(fs.readFileSync(LOCAL_QUEUE_PATH, "utf8"));
      if (Array.isArray(parsed)) {
        state.localQueue = parsed.filter(
          (item) => item && typeof item === "object" && item.id && item.uri && item.name
        );
        if (state.localQueue.length) {
          console.log(`Loaded ${state.localQueue.length} local queue item(s) from disk.`);
        }
      }
    }
  } catch (error) {
    console.warn(`Unable to load local queue: ${error.message}`);
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

function getAudioJackRoutingConfig() {
  return {
    card: `${audioJackAlsaCard || "0"}`.trim() || "0",
    control: `${audioJackAlsaControl || "PCM"}`.trim() || "PCM"
  };
}

function sanitizeAudioJackControlName(value) {
  const text = `${value || ""}`.trim();
  if (!text) return "";
  return text.replace(/[\r\n\t]/g, " ").slice(0, 80).trim();
}

async function getAlsaCards() {
  try {
    const { stdout } = await execFileAsync("amixer", ["-l"]);
    const cards = [];
    for (const line of `${stdout || ""}`.split(/\r?\n/)) {
      const match = line.match(/^\s*card\s+(\d+)\s*:\s*([^,]+),\s*(.+)$/i);
      if (!match) continue;
      cards.push({
        id: match[1],
        shortName: `${match[2] || ""}`.trim(),
        name: `${match[3] || ""}`.trim()
      });
    }
    if (cards.length) return cards;
  } catch {}
  const routing = getAudioJackRoutingConfig();
  return [{ id: routing.card, shortName: "unknown", name: "Detected card" }];
}

async function getAlsaSimpleControls(cardId) {
  const routing = getAudioJackRoutingConfig();
  const targetCard = `${cardId || ""}`.trim() || routing.card;
  const { stdout } = await execFileAsync("amixer", ["-c", targetCard, "scontrols"]);
  const controls = [];
  const seen = new Set();
  for (const line of `${stdout || ""}`.split(/\r?\n/)) {
    const match = line.match(/'([^']+)'/);
    const control = sanitizeAudioJackControlName(match?.[1] || "");
    if (!control) continue;
    const key = control.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    controls.push(control);
  }
  return controls;
}

function getMopidyAudioOutputDiagnostics() {
  const configPath = "/etc/mopidy/mopidy.conf";
  try {
    const ini = readIniFile(configPath);
    const output = `${ini.audio?.output || ""}`.trim();
    const normalized = output.toLowerCase();
    const hasAlsaSink = normalized.includes("alsasink");
    const feedsStream = normalized.includes("shout2send") || normalized.includes("icecast") || normalized.includes("stream.mp3");
    return {
      configPath,
      output,
      hasAlsaSink,
      feedsStream
    };
  } catch (error) {
    return {
      configPath,
      output: "",
      hasAlsaSink: false,
      feedsStream: false,
      error: error.message || "Unable to read Mopidy config"
    };
  }
}

async function getAudioJackSettings() {
  const routing = getAudioJackRoutingConfig();
  const { stdout } = await execFileAsync("amixer", ["-c", routing.card, "sget", routing.control]);
  const pctMatch = stdout.match(/\[(\d+)%\]/);
  const switchMatch = stdout.match(/\[(on|off)\]/i);
  const volume = Math.max(0, Math.min(100, Number(pctMatch?.[1] || 0)));
  const supportsMute = Boolean(switchMatch);
  const muted = supportsMute
    ? `${switchMatch?.[1] || "on"}`.toLowerCase() !== "on"
    : volume <= 0;
  return { volume, muted, supportsMute };
}

async function setAudioJackSettings({ volume, muted }) {
  const routing = getAudioJackRoutingConfig();
  const current = await getAudioJackSettings();
  const clamped = Math.max(0, Math.min(100, Number(volume || 0)));
  let targetVolume = clamped;
  if (!current.supportsMute && muted !== undefined) {
    if (Boolean(muted)) {
      targetVolume = 0;
    } else if (targetVolume <= 0) {
      targetVolume = Math.max(1, Number(current.volume || 1));
    }
  }
  const args = ["-c", routing.card, "set", routing.control, `${targetVolume}%`];
  if (current.supportsMute) {
    args.push(Boolean(muted) ? "mute" : "unmute");
  }
  await execFileAsync("amixer", args);
  if (AUDIO_JACK_STORE_ON_CHANGE) {
    await execFileAsync("alsactl", ["store"]);
  }
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
    if (!userHasPermission(user, PERMISSIONS.REQUESTS_PORTAL_USE)) {
      state.employeeSessions.delete(token);
      res.status(403).json({ error: "This account does not have jukebox request access." });
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

  // Revoked JWT cleanup: prune entries whose token expiry has passed.
  const nowSec = Math.floor(Date.now() / 1000);
  for (const [jti, exp] of state.revokedAdminTokens.entries()) {
    if (nowSec > exp) {
      state.revokedAdminTokens.delete(jti);
    }
  }
}, 60000);

cleanupTimer.unref();

const adminDbSnapshotTimer = setInterval(() => {
  try {
    refreshAdminDbIfStale();
    writeAdminDbSnapshot("periodic");
  } catch (error) {
    console.warn(`Admin DB snapshot failed: ${error.message}`);
  }
}, ADMIN_DB_SNAPSHOT_INTERVAL_MS);

adminDbSnapshotTimer.unref();

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
    saveSpotifyTokens();
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
  refreshAdminDbIfStale();
  const token = getAdminTokenFromRequest(req);
  if (!token) {
    res.status(401).json({ error: "Admin access required." });
    return;
  }
  const admin = getAdminBySessionToken(token);
  if (!admin) {
    res.status(401).json({ error: "Admin session is invalid." });
    return;
  }
  req.adminToken = token;
  req.adminAccount = admin;
  next();
}

function requireAdminPermission(permission, errorMessage = "Permission denied for this action.") {
  return (req, res, next) => {
    const admin = req.adminAccount;
    if (!admin) {
      res.status(401).json({ error: "Admin access required." });
      return;
    }
    if (!userHasPermission(admin, permission)) {
      res.status(403).json({ error: errorMessage });
      return;
    }
    next();
  };
}

const requireManageUsers = requireAdminPermission(
  PERMISSIONS.ACCOUNT_USERS_MANAGE,
  "This account cannot manage users."
);

const requireReadUsers = requireAdminPermission(
  PERMISSIONS.ACCOUNT_USERS_READ,
  "This account cannot view users."
);

const requireJukeboxPlaybackAdmin = requireAdminPermission(
  PERMISSIONS.JUKEBOX_PLAYBACK_MANAGE,
  "This account cannot manage jukebox playback."
);

const requireJukeboxQueueAdmin = requireAdminPermission(
  PERMISSIONS.JUKEBOX_QUEUE_MANAGE,
  "This account cannot manage jukebox queue."
);

const requireJukeboxSlidesAdmin = requireAdminPermission(
  PERMISSIONS.JUKEBOX_SLIDES_MANAGE,
  "This account cannot manage slideshow content."
);

// Reporting access: admins in the "reporting" group, or any admin if no "reporting" group members exist yet.
function requireReporting(req, res, next) {
  const admin = req.adminAccount;
  if (!admin) {
    res.status(401).json({ error: "Admin access required." });
    return;
  }
  const hasReportingGroup = (state.adminDb?.users || []).some((u) =>
    u.active !== false
    && userHasPermission(u, PERMISSIONS.REPORTING_PORTAL_ACCESS)
  );
  const allowed = userHasPermission(admin, PERMISSIONS.REPORTING_PORTAL_ACCESS)
    || (!hasReportingGroup && userHasPermission(admin, PERMISSIONS.ADMIN_PORTAL_LOGIN));
  if (!allowed) {
    res.status(403).json({ error: "Reporting access not granted for this account." });
    return;
  }
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
  const runtime = state.audioAutomationRuntime;
  const stats = runtime.streamStats;
  stats.totalClientConnections += 1;
  stats.lastClientConnectedAt = new Date().toISOString();
  addStreamEvent("client-connected", {
    activeListeners: runtime.activeLiveStreams.size + 1,
    streamDeliveryEnabled: state.audioAutomation.streamDeliveryEnabled !== false
  });

  if (state.audioAutomation.streamDeliveryEnabled === false) {
    stats.totalProxyErrors += 1;
    stats.lastError = "Live stream delivery is currently scheduled off.";
    addStreamEvent("stream-delivery-disabled", {
      activeListeners: runtime.activeLiveStreams.size,
      message: stats.lastError
    });
    res.status(503).json({ error: "Live stream delivery is currently scheduled off." });
    return;
  }

  let cleaned = false;
  try {
    const upstream = await fetch("http://127.0.0.1:8000/stream.mp3");
    stats.lastUpstreamStatus = Number(upstream.status || 0) || null;
    if (!upstream.ok || !upstream.body) {
      stats.totalUpstreamErrors += 1;
      stats.lastError = `Live stream upstream unavailable (HTTP ${upstream.status || 0}).`;
      addStreamEvent("upstream-unavailable", {
        status: Number(upstream.status || 0) || null,
        hasBody: Boolean(upstream.body)
      });
      res.status(503).json({ error: "Live stream is not available yet." });
      return;
    }

    stats.lastUpstreamConnectedAt = new Date().toISOString();
    addStreamEvent("upstream-connected", {
      status: stats.lastUpstreamStatus,
      activeListeners: runtime.activeLiveStreams.size + 1
    });

    const streamEntry = {
      res,
      upstream: upstream.body
    };
    runtime.activeLiveStreams.add(streamEntry);
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      runtime.activeLiveStreams.delete(streamEntry);
      stats.totalClientDisconnects += 1;
      stats.lastClientDisconnectedAt = new Date().toISOString();
      addStreamEvent("client-disconnected", {
        activeListeners: runtime.activeLiveStreams.size
      });
    };
    res.on("close", cleanup);
    res.on("finish", cleanup);
    upstream.body.on?.("close", () => {
      stats.lastUpstreamEndedAt = new Date().toISOString();
      addStreamEvent("upstream-closed", {
        activeListeners: runtime.activeLiveStreams.size
      });
      cleanup();
    });
    upstream.body.on?.("end", () => {
      stats.lastUpstreamEndedAt = new Date().toISOString();
      addStreamEvent("upstream-ended", {
        activeListeners: runtime.activeLiveStreams.size
      });
      cleanup();
    });
    upstream.body.on?.("error", (error) => {
      stats.totalUpstreamErrors += 1;
      stats.lastError = error?.message || "Upstream stream error";
      addStreamEvent("upstream-error", {
        error: stats.lastError
      });
    });

    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "no-store");
    upstream.body.pipe(res);
  } catch (error) {
    stats.totalProxyErrors += 1;
    stats.lastError = error.message || "Live stream unavailable.";
    addStreamEvent("proxy-error", {
      error: stats.lastError
    });
    res.status(503).json({ error: error.message || "Live stream unavailable." });
  }
});

app.get("/api/account/action", (req, res) => {
  const token = `${req.query?.token || ""}`.trim();
  if (!token) {
    res.status(400).json({ error: "token is required." });
    return;
  }
  const claims = verifyAccountActionJwt(token);
  if (!claims) {
    res.status(400).json({ error: "This link is invalid or expired." });
    return;
  }
  const user = getUserById(claims.sub);
  if (!user || `${user.username || ""}`.trim().toLowerCase() !== `${claims.em || ""}`.trim().toLowerCase()) {
    res.status(400).json({ error: "This link is invalid or expired." });
    return;
  }
  if (claims.uid && `${claims.uid}` !== `${user.updatedAt || ""}`) {
    res.status(400).json({ error: "This link has already been used or replaced." });
    return;
  }

  res.json({
    ok: true,
    action: claims.act,
    username: user.username,
    displayName: user.displayName || formatUserDisplayName(user),
    expiresAt: new Date(Number(claims.exp) * 1000).toISOString()
  });
});

app.post("/api/account/password-reset-request", async (req, res) => {
  const usernameResult = normalizeEmailUsername(req.body?.username, { requireValid: true });
  const genericMessage = "If that account exists, a password reset email has been sent.";

  if (!usernameResult.ok) {
    res.json({ ok: true, message: genericMessage });
    return;
  }

  try {
    loadAdminDb();
    const user = findUserByUsername(usernameResult.email);
    if (user && isUserAdmin(user) && user.active !== false) {
      await sendAccountActionEmail({
        req,
        targetUser: user,
        action: "reset",
        actor: null
      });
      logAdminHistory(user.id, "password-reset-request", `Self-service password reset requested for ${user.username}`);
    }
  } catch (error) {
    console.warn(`Password reset request failed: ${error.message}`);
  }

  res.json({ ok: true, message: genericMessage });
});

app.post("/api/account/action/complete", (req, res) => {
  const token = `${req.body?.token || ""}`.trim();
  const password = `${req.body?.password || ""}`;
  if (!token) {
    res.status(400).json({ error: "token is required." });
    return;
  }
  if (password.length < 8) {
    res.status(400).json({ error: "Password must be at least 8 characters." });
    return;
  }

  const claims = verifyAccountActionJwt(token);
  if (!claims) {
    res.status(400).json({ error: "This link is invalid or expired." });
    return;
  }
  const user = getUserById(claims.sub);
  if (!user || `${user.username || ""}`.trim().toLowerCase() !== `${claims.em || ""}`.trim().toLowerCase()) {
    res.status(400).json({ error: "This link is invalid or expired." });
    return;
  }
  if (claims.uid && `${claims.uid}` !== `${user.updatedAt || ""}`) {
    res.status(400).json({ error: "This link has already been used or replaced." });
    return;
  }

  const hashed = hashPassword(password);
  user.passwordSalt = hashed.salt;
  user.passwordHash = hashed.hash;
  user.active = true;
  user.updatedAt = new Date().toISOString();
  saveAdminDb();
  const actionLabel = claims.act === "invite" ? "invite-complete" : "password-reset-complete";
  logAdminHistory(user.id, actionLabel, `Completed secure ${claims.act} flow`);
  res.json({ ok: true });
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
  // Re-read from disk so both the jukebox and reporting processes always
  // see the latest credentials regardless of which process last updated them.
  loadAdminDb();
  const admin = findUserByUsername(username);
  if (!admin || !isUserAdmin(admin) || !verifyPassword(password, admin.passwordSalt, admin.passwordHash)) {
    res.status(401).json({ error: "Invalid username or password." });
    return;
  }

  const now = new Date().toISOString();
  admin.lastLoginAt = now;
  admin.updatedAt = now;
  saveAdminDb();
  const token = signAdminJwt(admin.id, admin.updatedAt);
  logAdminHistory(admin.id, "login", `User ${admin.username} logged in`);
  setAdminSessionCookie(req, res, token);

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
  const claims = verifyAdminJwt(req.adminToken);
  if (claims?.jti) {
    state.revokedAdminTokens.set(claims.jti, claims.exp);
  }
  clearAdminSessionCookie(req, res);
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

  const now = new Date().toISOString();
  admin.lastLoginAt = now;
  admin.updatedAt = now;
  saveAdminDb();
  const token = signAdminJwt(admin.id, admin.updatedAt);
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
      groups: getUserGroups(current),
      permissions: getUserPermissions(current),
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

app.get("/api/admin/account/users", requireAdmin, requireReadUsers, (_req, res) => {
  const users = (state.adminDb.users || []).map((item) => ({
    id: item.id,
    username: item.username,
    displayName: item.displayName,
    firstName: item.firstName || "",
    lastInitial: item.lastInitial || "",
    requestLimit: Math.max(1, Number(item.requestLimit || state.adminDb.staffDefaults?.requestLimit || MAX_PENDING_PER_USER)),
    groups: getUserGroups(item),
    permissions: getUserPermissions(item),
    isAdmin: isUserAdmin(item),
    active: item.active !== false,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    lastLoginAt: item.lastLoginAt
  }));
  res.json({ users });
});

app.post("/api/admin/account/users", requireAdmin, requireManageUsers, async (req, res) => {
  const usernameInput = req.body?.username;
  const usernameResult = normalizeEmailUsername(usernameInput, { requireValid: true });
  const username = usernameResult.ok ? usernameResult.email : "";
  const displayName = sanitizeAdminDisplayName(req.body?.displayName || username || "User");
  const firstName = sanitizeFirstName(req.body?.firstName || req.body?.displayName || "");
  const lastInitial = sanitizeLastInitial(req.body?.lastInitial || "");
  const password = `${req.body?.password || ""}`;
  const sendInvite = req.body?.sendInvite !== false;
  const requestLimit = Math.max(1, Number(req.body?.requestLimit || state.adminDb.staffDefaults?.requestLimit || MAX_PENDING_PER_USER));
  const groupsInput = Array.isArray(req.body?.groups) ? req.body.groups : [];
  const groups = normalizeSecurityGroups(groupsInput);
  if (req.body?.isAdmin === true && !groups.includes(SECURITY_GROUPS.GLOBAL_ADMIN)) {
    groups.push(SECURITY_GROUPS.GLOBAL_ADMIN);
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
  if (password && password.length < 8) {
    res.status(400).json({ error: "Password must be at least 8 characters." });
    return;
  }
  if (!password && !sendInvite) {
    res.status(400).json({ error: "Password is required when invite email is disabled." });
    return;
  }
  if ((state.adminDb.users || []).some((item) => item.username === username)) {
    res.status(409).json({ error: "Username already exists." });
    return;
  }

  const now = new Date().toISOString();
  const pwd = hashPassword(password || crypto.randomBytes(32).toString("base64url"));
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

  let invite = { sent: false, error: "" };
  if (sendInvite) {
    try {
      const inviteResult = await sendAccountActionEmail({
        req,
        targetUser: user,
        action: "invite",
        actor: req.adminAccount
      });
      invite = { sent: true, actionUrl: inviteResult.actionUrl };
      logAdminHistory(req.adminAccount.id, "user-invite", `Sent invite to ${username}`);
    } catch (error) {
      invite = { sent: false, error: error.message || "Failed to send invite email." };
      logAdminHistory(req.adminAccount.id, "user-invite-failed", `Failed invite for ${username}: ${invite.error}`);
    }
  }

  res.status(201).json({
    ok: true,
    invite,
    user: {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      firstName: user.firstName,
      lastInitial: user.lastInitial,
      requestLimit: user.requestLimit,
      groups: getUserGroups(user),
      permissions: getUserPermissions(user),
      isAdmin: isUserAdmin(user),
      active: user.active,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      lastLoginAt: user.lastLoginAt
    }
  });
});

app.delete("/api/admin/account/users/:id", requireAdmin, requireManageUsers, (req, res) => {
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
  saveAdminDb();
  logAdminHistory(req.adminAccount.id, "user-delete", `Deleted user ${target.username}`);
  res.json({ ok: true });
});

app.patch("/api/admin/account/users/:id", requireAdmin, requireManageUsers, (req, res) => {
  const id = `${req.params.id || ""}`;
  const target = (state.adminDb.users || []).find((item) => item.id === id);
  if (!target) {
    res.status(404).json({ error: "User not found." });
    return;
  }
  if (req.body?.requestLimit !== undefined) {
    target.requestLimit = Math.max(1, Number(req.body.requestLimit || MAX_PENDING_PER_USER));
  }
  if (req.body?.active !== undefined) {
    target.active = req.body.active !== false;
  }
  saveAdminDb();
  logAdminHistory(req.adminAccount.id, "user-update", `Updated user ${target.username}`);
  res.json({ ok: true });
});

app.patch("/api/admin/account/users/:id/groups", requireAdmin, requireManageUsers, (req, res) => {
  const id = `${req.params.id || ""}`;
  const target = (state.adminDb.users || []).find((item) => item.id === id);
  if (!target) {
    res.status(404).json({ error: "User not found." });
    return;
  }

  const groups = normalizeSecurityGroups(req.body?.groups);
  const callerCanManageUsers = userHasPermission(req.adminAccount, PERMISSIONS.ACCOUNT_USERS_MANAGE);
  if (target.id === req.adminAccount.id && !callerCanManageUsers) {
    res.status(400).json({ error: "You cannot remove your own user-management rights." });
    return;
  }
  if (target.id === req.adminAccount.id && !groups.includes(SECURITY_GROUPS.GLOBAL_ADMIN) && !groups.includes(SECURITY_GROUPS.SUPERADMIN)) {
    res.status(400).json({ error: "You cannot remove your own admin rights." });
    return;
  }

  target.groups = groups;
  target.updatedAt = new Date().toISOString();
  saveAdminDb();
  logAdminHistory(req.adminAccount.id, "user-groups-update", `Updated groups for ${target.username} to ${groups.join(",") || "none"}`);
  res.json({ ok: true, groups: getUserGroups(target), permissions: getUserPermissions(target), isAdmin: isUserAdmin(target) });
});

app.post("/api/admin/account/users/:id/send-invite", requireAdmin, requireManageUsers, async (req, res) => {
  const id = `${req.params.id || ""}`;
  const target = (state.adminDb.users || []).find((item) => item.id === id);
  if (!target) {
    res.status(404).json({ error: "User not found." });
    return;
  }

  try {
    const result = await sendAccountActionEmail({
      req,
      targetUser: target,
      action: "invite",
      actor: req.adminAccount
    });
    logAdminHistory(req.adminAccount.id, "user-invite", `Sent invite to ${target.username}`);
    res.json({ ok: true, ...result });
  } catch (error) {
    res.status(400).json({ error: error.message || "Failed to send invite email." });
  }
});

app.post("/api/admin/account/users/:id/send-password-reset", requireAdmin, requireManageUsers, async (req, res) => {
  const id = `${req.params.id || ""}`;
  const target = (state.adminDb.users || []).find((item) => item.id === id);
  if (!target) {
    res.status(404).json({ error: "User not found." });
    return;
  }

  try {
    const result = await sendAccountActionEmail({
      req,
      targetUser: target,
      action: "reset",
      actor: req.adminAccount
    });
    logAdminHistory(req.adminAccount.id, "user-reset-email", `Sent password reset email to ${target.username}`);
    res.json({ ok: true, ...result });
  } catch (error) {
    res.status(400).json({ error: error.message || "Failed to send password reset email." });
  }
});

app.get("/api/admin/account/admin-db-snapshots", requireAdmin, requireManageUsers, (_req, res) => {
  const snapshots = listAdminDbSnapshots();
  res.json({
    keep: ADMIN_DB_SNAPSHOT_KEEP,
    intervalMs: ADMIN_DB_SNAPSHOT_INTERVAL_MS,
    snapshots
  });
});

app.post("/api/admin/account/admin-db-snapshots", requireAdmin, requireManageUsers, (req, res) => {
  const reason = `${req.body?.reason || "manual"}`.trim() || "manual";
  try {
    refreshAdminDbIfStale();
    const fileName = writeAdminDbSnapshot(reason);
    logAdminHistory(req.adminAccount.id, "admin-db-snapshot", `Created admin DB snapshot ${fileName}`);
    res.status(201).json({ ok: true, fileName });
  } catch (error) {
    res.status(500).json({ error: error.message || "Failed to create snapshot." });
  }
});

app.post("/api/admin/account/admin-db-snapshots/restore", requireAdmin, requireManageUsers, (req, res) => {
  const fileName = `${req.body?.fileName || ""}`.trim();
  if (!fileName) {
    res.status(400).json({ error: "fileName is required." });
    return;
  }
  try {
    const restored = restoreAdminDbSnapshot(fileName);
    logAdminHistory(req.adminAccount.id, "admin-db-restore", `Restored admin DB from snapshot ${restored}`);
    res.json({ ok: true, restored: restored, users: (state.adminDb?.users || []).length });
  } catch (error) {
    res.status(400).json({ error: error.message || "Failed to restore snapshot." });
  }
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
    groups: getUserGroups(item),
    permissions: getUserPermissions(item),
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

app.post("/api/admin/staff", requireAdmin, requireManageUsers, async (req, res) => {
  const displayNameInput = sanitizeAdminDisplayName(req.body?.displayName || "");
  let firstName = sanitizeFirstName(req.body?.firstName);
  let lastInitial = sanitizeLastInitial(req.body?.lastInitial);

  if ((!firstName || !lastInitial) && displayNameInput) {
    const parts = displayNameInput.split(/\s+/).filter(Boolean);
    if (!firstName) {
      firstName = sanitizeFirstName(parts[0] || "");
    }
    if (!lastInitial) {
      const tail = parts[parts.length - 1] || "";
      lastInitial = sanitizeLastInitial(tail.slice(0, 1));
    }
  }
  const usernameResult = normalizeEmailUsername(req.body?.username, { requireValid: true });
  const username = usernameResult.ok ? usernameResult.email : "";
  const password = `${req.body?.password || ""}`;
  const sendInvite = req.body?.sendInvite !== false;
  const requestLimit = Math.max(1, Number(req.body?.requestLimit || state.adminDb.staffDefaults?.requestLimit || MAX_PENDING_PER_USER));
  const groupsInput = Array.isArray(req.body?.groups) ? req.body.groups : [];
  const groups = normalizeSecurityGroups(groupsInput);
  if (req.body?.isAdmin === true && !groups.includes(SECURITY_GROUPS.GLOBAL_ADMIN)) {
    groups.push(SECURITY_GROUPS.GLOBAL_ADMIN);
  }

  if (!firstName) {
    firstName = "User";
  }
  if (!lastInitial) {
    lastInitial = "X";
  }
  const displayName = displayNameInput || sanitizeAdminDisplayName(`${firstName} ${lastInitial}.`);
  if (!displayName) {
    res.status(400).json({ error: "displayName is required." });
    return;
  }
  if (!usernameResult.ok) {
    res.status(400).json({
      error: "username must be a valid email address.",
      suggestion: usernameResult.suggestion
    });
    return;
  }
  if (password && password.length < 8) {
    res.status(400).json({ error: "Password must be at least 8 characters." });
    return;
  }
  if (!password && !sendInvite) {
    res.status(400).json({ error: "Password is required when invite email is disabled." });
    return;
  }
  if ((state.adminDb.users || []).some((item) => item.username === username)) {
    res.status(409).json({ error: "That username is already in use." });
    return;
  }

  const now = new Date().toISOString();
  const pwd = hashPassword(password || crypto.randomBytes(32).toString("base64url"));
  const staff = {
    id: crypto.randomUUID(),
    firstName,
    lastInitial,
    displayName,
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

  let invite = { sent: false, error: "" };
  if (sendInvite) {
    try {
      const inviteResult = await sendAccountActionEmail({
        req,
        targetUser: staff,
        action: "invite",
        actor: req.adminAccount
      });
      invite = { sent: true, actionUrl: inviteResult.actionUrl };
      logAdminHistory(req.adminAccount.id, "user-invite", `Sent invite to ${staff.username}`);
    } catch (error) {
      invite = { sent: false, error: error.message || "Failed to send invite email." };
      logAdminHistory(req.adminAccount.id, "user-invite-failed", `Failed invite for ${staff.username}: ${invite.error}`);
    }
  }

  res.status(201).json({
    ok: true,
    invite,
    staff: {
      id: staff.id,
      firstName: staff.firstName,
      lastInitial: staff.lastInitial,
      username: staff.username,
      displayName: formatUserDisplayName(staff),
      requestLimit: staff.requestLimit,
      groups: getUserGroups(staff),
      permissions: getUserPermissions(staff),
      isAdmin: isUserAdmin(staff),
      active: staff.active
    }
  });
});

app.patch("/api/admin/staff/:id", requireAdmin, requireManageUsers, (req, res) => {
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
    const groups = req.body?.groups !== undefined
      ? normalizeSecurityGroups(req.body?.groups)
      : getUserGroups(staff);
    if (req.body?.isAdmin === true && !groups.includes(SECURITY_GROUPS.GLOBAL_ADMIN)) {
      groups.push(SECURITY_GROUPS.GLOBAL_ADMIN);
    }
    if (req.body?.isAdmin === false) {
      if (staff.id === req.adminAccount.id) {
        res.status(400).json({ error: "You cannot remove your own admin rights." });
        return;
      }
      staff.groups = groups.filter((entry) => entry !== SECURITY_GROUPS.GLOBAL_ADMIN && entry !== SECURITY_GROUPS.SUPERADMIN);
    } else {
      staff.groups = groups;
    }
  }

  staff.displayName = sanitizeAdminDisplayName(staff.displayName || formatUserDisplayName(staff));

  staff.updatedAt = new Date().toISOString();
  saveAdminDb();
  logAdminHistory(req.adminAccount.id, "user-update", `Updated user ${formatUserDisplayName(staff)}`);
  res.json({ ok: true });
});

app.post("/api/admin/staff/:id/reset-password", requireAdmin, requireManageUsers, (req, res) => {
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

app.delete("/api/admin/staff/:id", requireAdmin, requireManageUsers, (req, res) => {
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

// ── Reporting snapshot ───────────────────────────────────────────────────────

function loadReportingSnapshot() {
  try {
    if (!fs.existsSync(REPORTING_SNAPSHOT_PATH)) return;
    const text = fs.readFileSync(REPORTING_SNAPSHOT_PATH, "utf8");
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object" && parsed.generatedAt) {
      state.reportingSnapshot = parsed;
    }
  } catch (error) {
    console.warn(`Could not load reporting snapshot: ${error.message}`);
  }
}

function saveReportingSnapshot(data) {
  try {
    fs.writeFileSync(REPORTING_SNAPSHOT_PATH, JSON.stringify(data, null, 2), "utf8");
  } catch (error) {
    console.warn(`Could not save reporting snapshot: ${error.message}`);
  }
}

async function buildReportingOverview() {
  const formatDate = (value) => {
    const d = value ? new Date(value) : null;
    if (!d || Number.isNaN(d.getTime())) return "";
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };

  const monthKey = (value) => {
    const d = value ? new Date(value) : null;
    if (!d || Number.isNaN(d.getTime())) return "";
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    return `${y}-${m}`;
  };

  const dateFieldCandidates = ["ACTIVEMOVEMENTDATE", "MOVEMENTDATE", "ADOPTIONDATE", "DATEADOPTED", "OUTCOMEDATE", "LASTCHANGEDDATE", "CREATEDDATE"];
  const pickDateValue = (row) => {
    for (const key of dateFieldCandidates) {
      if (row?.[key]) return row[key];
    }
    return "";
  };

  const fetchAsmRows = async (method, extraParams = {}) => {
    const requestUrl = buildAsmServiceUrl(method, extraParams);
    if (!requestUrl) {
      throw new Error(`ASM service URL missing for ${method}`);
    }
    const response = await fetch(requestUrl, { headers: { Accept: "application/json" } });
    const bodyText = await response.text();
    if (!response.ok) {
      throw new Error(`ASM ${method} HTTP ${response.status}`);
    }
    let parsed;
    try {
      parsed = JSON.parse(bodyText);
    } catch {
      throw new Error(`ASM ${method} returned non-JSON response`);
    }
    return extractAsmRows(parsed);
  };

  const now = new Date();
  // Split 12-month window into 4 quarterly chunks to avoid ASM's 1000-row cap
  // Q1: month-11 to month-9, Q2: month-8 to month-6, Q3: month-5 to month-3, Q4: month-2 to now
  // qTo uses day-0 of the month AFTER the last quarter month (= last day of quarter's final month)
  const qFrom1 = formatDate(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1)));
  const qTo1   = formatDate(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 8,  0)));
  const qFrom2 = formatDate(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 8,  1)));
  const qTo2   = formatDate(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5,  0)));
  const qFrom3 = formatDate(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5,  1)));
  const qTo3   = formatDate(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 2,  0)));
  const qFrom4 = formatDate(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 2,  1)));
  const qTo4   = formatDate(now);
  const recentStart = new Date(Date.now() - 29 * 24 * 60 * 60 * 1000);

  const [adoptableRows, shelterRows, strayRows, heldRows, recentAdoptionsRows, adoptedQ1, adoptedQ2, adoptedQ3, adoptedQ4] = await Promise.all([
    fetchAsmRows(state.asm.adoptableMethod || "json_adoptable_animals"),
    fetchAsmRows("json_shelter_animals"),
    fetchAsmRows("json_stray_animals"),
    fetchAsmRows("json_held_animals"),
    fetchAsmRows("json_recent_adoptions"),
    fetchAsmRows("json_adopted_animals", { fromdate: qFrom1, todate: qTo1 }),
    fetchAsmRows("json_adopted_animals", { fromdate: qFrom2, todate: qTo2 }),
    fetchAsmRows("json_adopted_animals", { fromdate: qFrom3, todate: qTo3 }),
    fetchAsmRows("json_adopted_animals", { fromdate: qFrom4, todate: qTo4 })
  ]);
  const adoptedRows = [...adoptedQ1, ...adoptedQ2, ...adoptedQ3, ...adoptedQ4];

  console.log("[reporting] adopted rows Q1:", adoptedQ1.length, "Q2:", adoptedQ2.length, "Q3:", adoptedQ3.length, "Q4:", adoptedQ4.length, "total:", adoptedRows.length);

  const speciesMap = new Map();
  for (const row of adoptableRows) {
    const key = `${row.SPECIESNAME || "Unknown"}`.trim() || "Unknown";
    speciesMap.set(key, (speciesMap.get(key) || 0) + 1);
  }
  const species = Array.from(speciesMap.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);

  const speciesInCareMap = new Map();
  for (const row of shelterRows) {
    const key = `${row.SPECIESNAME || "Unknown"}`.trim() || "Unknown";
    speciesInCareMap.set(key, (speciesInCareMap.get(key) || 0) + 1);
  }
  const speciesInCare = Array.from(speciesInCareMap.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);

  // Jurisdiction breakdown — from raw adoptable rows
  const jurisdictionMap = new Map();
  let acIncidentCount = 0;
  for (const row of adoptableRows) {
    const jName = `${row.JURISDICTIONNAME || "Unknown"}`.trim() || "Unknown";
    jurisdictionMap.set(jName, (jurisdictionMap.get(jName) || 0) + 1);
    const acId = `${row.ANIMALCONTROLINCIDENTID ?? "0"}`.trim();
    if (acId && acId !== "0") acIncidentCount += 1;
  }

  const monthlyKeys = [];
  const monthlyCounts = new Map();
  for (let i = 11; i >= 0; i -= 1) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const key = monthKey(d);
    monthlyKeys.push(key);
    monthlyCounts.set(key, 0);
  }
  for (const row of adoptedRows) {
    const key = monthKey(pickDateValue(row));
    if (key && monthlyCounts.has(key)) {
      monthlyCounts.set(key, (monthlyCounts.get(key) || 0) + 1);
    }
  }

  const dailyKeys = [];
  const dailyCounts = new Map();
  for (let i = 29; i >= 0; i -= 1) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    const key = formatDate(d);
    dailyKeys.push(key);
    dailyCounts.set(key, 0);
  }
  for (const row of recentAdoptionsRows) {
    const key = formatDate(pickDateValue(row));
    if (key && dailyCounts.has(key)) {
      dailyCounts.set(key, (dailyCounts.get(key) || 0) + 1);
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      adoptableCount: Number(adoptableRows.length || 0),
      shelterCount: Number(shelterRows.length || 0),
      strayCount: Number(strayRows.length || 0),
      heldCount: Number(heldRows.length || 0),
      recentAdoptionsCount: Number(recentAdoptionsRows.length || 0),
      acIncidentCount: Number(acIncidentCount)
    },
    species,
    speciesInCare,
    jurisdictions: Array.from(jurisdictionMap.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count),
    monthlyAdoptions: {
      labels: monthlyKeys,
      values: monthlyKeys.map((key) => Number(monthlyCounts.get(key) || 0)),
      fromDate: qFrom1,
      toDate: qTo4
    },
    recentAdoptions: {
      labels: dailyKeys,
      values: dailyKeys.map((key) => Number(dailyCounts.get(key) || 0)),
      fromDate: formatDate(recentStart),
      toDate: formatDate(now)
    },
    source: {}
  };
}

let reportingRefreshInProgress = false;

async function refreshReportingSnapshot() {
  if (reportingRefreshInProgress) return;
  reportingRefreshInProgress = true;
  try {
    const snapshot = await buildReportingOverview();
    state.reportingSnapshot = snapshot;
    saveReportingSnapshot(snapshot);
    console.log(`Reporting snapshot updated at ${snapshot.generatedAt}`);
  } catch (error) {
    console.warn(`Reporting snapshot refresh failed: ${error.message}`);
  } finally {
    reportingRefreshInProgress = false;
  }
}

function startReportingScheduler() {
  // Only run the ASM fetch scheduler in the reporting service instance
  if (PORT === 3000) return;
  const INTERVAL_MS = 60 * 60 * 1000; // 1 hour
  // Fetch immediately on startup (delay 5s to let services settle)
  const initialTimer = setTimeout(() => {
    refreshReportingSnapshot().catch((error) => {
      console.warn(`Reporting initial fetch error: ${error.message}`);
    });
  }, 5000);
  initialTimer.unref?.();
  const timer = setInterval(() => {
    refreshReportingSnapshot().catch((error) => {
      console.warn(`Reporting scheduler error: ${error.message}`);
    });
  }, INTERVAL_MS);
  timer.unref?.();
}

app.get("/api/admin/reporting/overview", requireAdmin, requireReporting, (_req, res) => {
  const snapshot = state.reportingSnapshot;
  if (!snapshot) {
    return res.status(503).json({ error: "Reporting data not yet available. The first snapshot is being built — please wait a moment and try again." });
  }
  const ageMs = snapshot.generatedAt ? Date.now() - new Date(snapshot.generatedAt).getTime() : 0;
  res.json({ ...snapshot, cacheAgeSeconds: Math.floor(ageMs / 1000) });
});

app.post("/api/admin/reporting/refresh", requireAdmin, requireReporting, (_req, res) => {
  if (reportingRefreshInProgress) {
    return res.json({ ok: true, message: "Refresh already in progress." });
  }
  refreshReportingSnapshot().catch((error) => {
    console.warn(`Manual reporting refresh error: ${error.message}`);
  });
  res.json({ ok: true, message: "Reporting refresh started." });
});

app.get("/api/admin/reporting/monthly-district-calls", requireAdmin, requireReporting, async (req, res) => {
  try {
    const now = new Date();
    const month = Number.parseInt(`${req.query.month || now.getUTCMonth() + 1}`, 10);
    const year = Number.parseInt(`${req.query.year || now.getUTCFullYear()}`, 10);
    if (!Number.isFinite(month) || month < 1 || month > 12) {
      return res.status(400).json({ error: "month must be 1-12" });
    }
    if (!Number.isFinite(year) || year < 2000 || year > 2100) {
      return res.status(400).json({ error: "year must be between 2000 and 2100" });
    }

    const from = new Date(Date.UTC(year, month - 1, 1));
    const to = new Date(Date.UTC(year, month, 0));
    const formatDate = (d) => {
      const y = d.getUTCFullYear();
      const m = String(d.getUTCMonth() + 1).padStart(2, "0");
      const day = String(d.getUTCDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    };
    const fromDate = formatDate(from);
    const toDate = formatDate(to);

    const districtFields = ["COUNCILDISTRICTNAME", "COUNCILDISTRICT", "DISTRICTNAME", "DISTRICT", "JURISDICTIONNAME", "JURISDICTION", "AREA", "ZONE"];
    const incidentTypeFields = ["INCIDENTTYPE", "INCIDENTTYPENAME", "CALLTYPE", "CALLTYPENAME", "INCIDENTNAME", "TYPE", "CATEGORY", "SUBJECT"];

    const pickFirstText = (row, candidates, fallback = "Unknown") => {
      for (const field of candidates) {
        const value = row?.[field];
        if (value === undefined || value === null) continue;
        const text = `${value}`.trim();
        if (text) return text;
      }
      return fallback;
    };

    const pickDate = (row) => {
      for (const field of ["INCIDENTDATETIME", "INCIDENTDATE", "CALLDATE", "REPORTEDDATE", "DATE", "CREATEDDATE", "LASTCHANGEDDATE"]) {
        const value = row?.[field];
        if (!value) continue;
        const d = new Date(value);
        if (!Number.isNaN(d.getTime())) return d;
      }
      return null;
    };

    let sourceMethod = "";
    let sourceRows = [];
    let unavailableReason = "";
    try {
      const result = await fetchAnimalControlRowsForRange(fromDate, toDate);
      sourceMethod = result.sourceMethod;
      sourceRows = result.rows;
    } catch (error) {
      unavailableReason = error.message || "Unable to fetch animal control incident data from ASM.";
    }

    if (!sourceMethod) {
      return res.json({
        available: false,
        error: unavailableReason || "Animal Control data is not available from the current ASM service method.",
        month,
        year,
        fromDate,
        toDate,
        sourceMethod: "",
        rowCount: 0,
        districts: []
      });
    }

    const districtMap = new Map();
    for (const row of sourceRows) {
      const rowDate = pickDate(row);
      if (!rowDate) continue;
      if (rowDate < from || rowDate > new Date(Date.UTC(year, month, 0, 23, 59, 59, 999))) continue;

      const district = pickFirstText(row, districtFields, "Unknown District");
      const incidentType = pickFirstText(row, incidentTypeFields, "Unknown Incident");

      if (!districtMap.has(district)) {
        districtMap.set(district, { total: 0, incidentTypeMap: new Map() });
      }
      const districtEntry = districtMap.get(district);
      districtEntry.total += 1;
      districtEntry.incidentTypeMap.set(incidentType, (districtEntry.incidentTypeMap.get(incidentType) || 0) + 1);
    }

    const sortDistricts = (a, b) => {
      const ax = `${a}`.toLowerCase();
      const bx = `${b}`.toLowerCase();
      const am = ax.match(/district\s*(\d+)/);
      const bm = bx.match(/district\s*(\d+)/);
      if (am && bm) return Number(am[1]) - Number(bm[1]);
      if (am) return -1;
      if (bm) return 1;
      return ax.localeCompare(bx);
    };

    const districts = Array.from(districtMap.entries())
      .sort((a, b) => sortDistricts(a[0], b[0]))
      .map(([district, info]) => ({
        district,
        total: Number(info.total || 0),
        incidentTypes: Array.from(info.incidentTypeMap.entries())
          .map(([label, count]) => ({ label, count: Number(count || 0) }))
          .sort((a, b) => (b.count - a.count) || a.label.localeCompare(b.label))
      }));

    res.json({
      available: true,
      month,
      year,
      fromDate,
      toDate,
      sourceMethod,
      rowCount: Number(sourceRows.length || 0),
      districts
    });
  } catch (error) {
    res.status(500).json({ error: error.message || "Failed to build monthly district calls report." });
  }
});

app.get("/api/admin/reporting/calls-by-type", requireAdmin, requireReporting, async (req, res) => {
  try {
    const parseDateInput = (value) => {
      const raw = `${value || ""}`.trim();
      if (!raw) return null;
      const ymd = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (ymd) {
        return new Date(Date.UTC(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3])));
      }
      const mdy = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (mdy) {
        return new Date(Date.UTC(Number(mdy[3]), Number(mdy[1]) - 1, Number(mdy[2])));
      }
      const parsed = new Date(raw);
      if (!Number.isNaN(parsed.getTime())) {
        return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
      }
      return null;
    };

    const now = new Date();
    const defaultFrom = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const defaultTo = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

    const fromDateObj = parseDateInput(req.query.fromDate) || defaultFrom;
    const toDateObj = parseDateInput(req.query.toDate) || defaultTo;
    if (Number.isNaN(fromDateObj.getTime()) || Number.isNaN(toDateObj.getTime())) {
      return res.status(400).json({ error: "Invalid fromDate or toDate." });
    }
    if (fromDateObj > toDateObj) {
      return res.status(400).json({ error: "fromDate must be before or equal to toDate." });
    }

    const formatDate = (d) => {
      const y = d.getUTCFullYear();
      const m = String(d.getUTCMonth() + 1).padStart(2, "0");
      const day = String(d.getUTCDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    };

    const fromDate = formatDate(fromDateObj);
    const toDate = formatDate(toDateObj);
    const toDateEnd = new Date(Date.UTC(
      toDateObj.getUTCFullYear(),
      toDateObj.getUTCMonth(),
      toDateObj.getUTCDate(),
      23,
      59,
      59,
      999
    ));

    const pickFirstText = (row, fields, fallback = "") => {
      for (const field of fields) {
        const value = row?.[field];
        if (value === undefined || value === null) continue;
        const text = `${value}`.trim();
        if (text) return text;
      }
      return fallback;
    };

    const dateFields = ["INCIDENTDATETIME", "INCIDENTDATE", "CALLDATE", "REPORTEDDATE", "DATE", "CREATEDDATE", "LASTCHANGEDDATE"];
    const typeFields = ["INCIDENTTYPE", "INCIDENTTYPENAME", "CALLTYPE", "CALLTYPENAME", "INCIDENTNAME", "TYPE", "CATEGORY", "SUBJECT"];
    const codeFields = ["INCIDENTCODE", "INCIDENTNUMBER", "CALLNUMBER", "REFERENCE", "CASEID", "CASENUMBER"];
    const callerFields = ["CALLERNAME", "CALLER", "CONTACTNAME", "REPORTERNAME", "REPORTEDBY", "OWNERNAME"];
    const notesFields = ["NOTES", "DETAILS", "COMMENTS", "DESCRIPTION", "INCIDENTNOTES", "CALLNOTES"];
    const victimFields = ["VICTIM", "VICTIMNAME", "AFFECTEDPARTY", "PATIENTNAME"];
    const suspectFields = ["SUSPECT", "SUSPECTNAME", "RESPONSIBLEPARTY", "OWNERNAME"];
    const dispatchFields = ["DISPATCHADDRESS", "ADDRESS", "LOCATION", "SITE", "DISPATCHLOCATION"];
    const dispatchedFields = ["DISPATCHED", "DISPATCHEDDATE", "DISPATCHDATETIME", "DATEASSIGNED"];
    const respondedFields = ["RESPONDED", "RESPONDEDDATE", "RESPONDEDDATETIME", "DATEARRIVED"];
    const completedFields = ["COMPLETED", "COMPLETEDDATE", "COMPLETEDDATETIME", "DATECLOSED", "OUTCOME"];

    const pickDate = (row) => {
      for (const field of dateFields) {
        const value = row?.[field];
        if (!value) continue;
        const d = new Date(value);
        if (!Number.isNaN(d.getTime())) return d;
      }
      return null;
    };

    let sourceMethod = "";
    let sourceRows = [];
    let unavailableReason = "";
    try {
      const result = await fetchAnimalControlRowsForRange(fromDate, toDate);
      sourceMethod = result.sourceMethod;
      sourceRows = result.rows;
    } catch (error) {
      unavailableReason = error.message || "Unable to fetch animal control call data from ASM.";
    }

    if (!sourceMethod) {
      return res.json({
        available: false,
        error: unavailableReason || "Animal Control data is not available from the current ASM service method.",
        fromDate,
        toDate,
        sourceMethod: "",
        rowCount: 0,
        types: []
      });
    }

    const typeMap = new Map();
    for (const row of sourceRows) {
      const rowDate = pickDate(row);
      if (!rowDate) continue;
      if (rowDate < fromDateObj || rowDate > toDateEnd) continue;

      const incidentType = pickFirstText(row, typeFields, "Unknown");
      if (!typeMap.has(incidentType)) {
        typeMap.set(incidentType, []);
      }

      typeMap.get(incidentType).push({
        date: rowDate.toISOString(),
        incidentCode: pickFirstText(row, codeFields, ""),
        caller: pickFirstText(row, callerFields, ""),
        notes: pickFirstText(row, notesFields, ""),
        victim: pickFirstText(row, victimFields, ""),
        suspect: pickFirstText(row, suspectFields, ""),
        dispatch: pickFirstText(row, dispatchFields, ""),
        dispatched: pickFirstText(row, dispatchedFields, ""),
        responded: pickFirstText(row, respondedFields, ""),
        completed: pickFirstText(row, completedFields, "")
      });
    }

    const types = Array.from(typeMap.entries())
      .map(([incidentType, rows]) => ({
        incidentType,
        total: Number(rows.length || 0),
        rows: rows.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      }))
      .sort((a, b) => (b.total - a.total) || a.incidentType.localeCompare(b.incidentType));

    res.json({
      available: true,
      fromDate,
      toDate,
      sourceMethod,
      rowCount: Number(sourceRows.length || 0),
      types
    });
  } catch (error) {
    res.status(500).json({ error: error.message || "Failed to build calls-by-type report." });
  }
});

app.get("/api/admin/reporting/active-fosters-brief", requireAdmin, requireReporting, async (_req, res) => {
  const reportTitle = `${process.env.ASM_ACTIVE_FOSTERS_REPORT_TITLE || "Active Fosters (Brief)"}`.trim();
  const pickFirstText = (row, fields, fallback = "") => {
    for (const field of fields) {
      const value = row?.[field];
      if (value === undefined || value === null) continue;
      const text = `${value}`.trim();
      if (text) return text;
    }
    return fallback;
  };

  const mapRows = (rows) => rows.map((row) => ({
    fosteredTo: pickFirstText(row, ["FosteredTo", "FOSTEREDTO", "CURRENTOWNERNAME", "OWNERNAME", "OWNER"]),
    ownerAddress: pickFirstText(row, ["OwnerAddress", "OWNERADDRESS", "CURRENTOWNERADDRESS", "ADDRESS"]),
    homeTelephone: pickFirstText(row, ["HomeTelephone", "HOMETELEPHONE", "CURRENTOWNERHOMETELEPHONE", "PHONE"]),
    mobileTelephone: pickFirstText(row, ["MobileTelephone", "MOBILETELEPHONE", "CURRENTOWNERMOBILETELEPHONE", "MOBILE"]),
    emailAddress: pickFirstText(row, ["EMAILADDRESS", "EmailAddress", "CURRENTOWNEREMAILADDRESS", "EMAIL"]),
    animalId: pickFirstText(row, ["ID", "ANIMALID", "AnimalID"]),
    shelterCode: pickFirstText(row, ["ShelterCode", "SHELTERCODE", "CODE"]),
    animalName: pickFirstText(row, ["AnimalName", "ANIMALNAME", "NAME"]),
    sex: pickFirstText(row, ["Sex", "SEX", "SEXNAME"]),
    colour: pickFirstText(row, ["Colour", "COLOR", "COLOUR", "BASECOLOURNAME"]),
    breedName: pickFirstText(row, ["BreedName", "BREEDNAME", "BREED", "BREEDNAME1"]),
    dateOfBirth: pickFirstText(row, ["DateOfBirth", "DATEOFBIRTH", "DOB"]),
    animalAge: pickFirstText(row, ["AnimalAge", "ANIMALAGE", "AGE"])
  }));

  const isFosterMovement = (row) => {
    const movementType = `${row?.ACTIVEMOVEMENTTYPE ?? ""}`.trim();
    const movementTypeName = `${row?.ACTIVEMOVEMENTTYPENAME ?? ""}`.trim().toLowerCase();
    return movementType === "2" || movementTypeName === "foster";
  };

  try {
    let sourceMethod = `json_report:${reportTitle}`;
    let sourceRows = [];

    try {
      sourceRows = await fetchAsmRowsForMethod("json_report", { title: reportTitle });
    } catch (reportError) {
      const shelterRows = await fetchAsmRowsForMethod("json_shelter_animals");
      sourceRows = shelterRows.filter((row) => isFosterMovement(row));
      sourceMethod = `json_shelter_animals:foster_fallback(${reportTitle})`;
      if (!sourceRows.length) {
        throw reportError;
      }
    }

    const mappedRows = mapRows(sourceRows);

    res.json({
      available: true,
      sourceMethod,
      rowCount: Number(mappedRows.length || 0),
      rows: mappedRows
    });
  } catch (error) {
    res.json({
      available: false,
      sourceMethod: `json_report:${reportTitle}`,
      error: normalizeAsmReportError(error, "Unable to load Active Fosters report."),
      rowCount: 0,
      rows: []
    });
  }
});

app.get("/api/admin/reporting/shelter-health", requireAdmin, requireReporting, async (_req, res) => {
  const reportTitle = `${process.env.ASM_SHELTER_HEALTH_REPORT_TITLE || "Health Notes in the Last Day"}`.trim();
  try {
    const rows = await fetchAsmRowsForMethod("json_report", { title: reportTitle });

    const pickFirstText = (row, fields, fallback = "") => {
      for (const field of fields) {
        const value = row?.[field];
        if (value === undefined || value === null) continue;
        const text = `${value}`.trim();
        if (text) return text;
      }
      return fallback;
    };

    const mappedRows = rows.map((row) => ({
      animalName: pickFirstText(row, ["AnimalName", "ANIMALNAME"]),
      logTypeName: pickFirstText(row, ["LogTypeName", "LOGTYPENAME"]),
      weight: pickFirstText(row, ["Weight", "WEIGHT"]),
      shortCode: pickFirstText(row, ["ShortCode", "SHORTCODE"]),
      displayLocation: pickFirstText(row, ["DisplayLocation", "DISPLAYLOCATION"]),
      comments: pickFirstText(row, ["Comments", "COMMENTS"]),
      date: pickFirstText(row, ["Date", "DATE"]),
      createdBy: pickFirstText(row, ["CreatedBy", "CREATEDBY"])
    }));

    res.json({
      available: true,
      sourceMethod: `json_report:${reportTitle}`,
      rowCount: Number(mappedRows.length || 0),
      rows: mappedRows
    });
  } catch (error) {
    res.json({
      available: false,
      sourceMethod: `json_report:${reportTitle}`,
      error: normalizeAsmReportError(error, "Unable to load Shelter Health report."),
      rowCount: 0,
      rows: []
    });
  }
});

app.get("/api/admin/reporting/city-daily-in-out-staff", requireAdmin, requireReporting, async (_req, res) => {
  const reportTitle = `${process.env.ASM_CITY_DAILY_IN_OUT_REPORT_TITLE || "City Daily In/Out to Staff"}`.trim();
  try {
    const rows = await fetchAsmRowsForMethod("json_report", { title: reportTitle });

    const pickFirstText = (row, fields, fallback = "") => {
      for (const field of fields) {
        const value = row?.[field];
        if (value === undefined || value === null) continue;
        const text = `${value}`.trim();
        if (text) return text;
      }
      return fallback;
    };

    const mappedRows = rows.map((row) => ({
      theDate: pickFirstText(row, ["thedate", "THEDATE", "DATE"]),
      reason: pickFirstText(row, ["Reason", "REASON"]),
      shelterCode: pickFirstText(row, ["ShelterCode", "SHELTERCODE"]),
      animalId: pickFirstText(row, ["ID", "ANIMALID", "AnimalID"]),
      identichipNumber: pickFirstText(row, ["IdentichipNumber", "IDENTICHIPNUMBER"]),
      animalName: pickFirstText(row, ["AnimalName", "ANIMALNAME"]),
      animalTypeName: pickFirstText(row, ["AnimalTypeName", "ANIMALTYPENAME"]),
      speciesName: pickFirstText(row, ["SpeciesName", "SPECIESNAME"]),
      animalAge: pickFirstText(row, ["AnimalAge", "ANIMALAGE"]),
      sexName: pickFirstText(row, ["SexName", "SEXNAME"]),
      locationFound: pickFirstText(row, ["locationfound", "LOCATIONFOUND"]),
      categoryName: pickFirstText(row, ["CategoryName", "CATEGORYNAME"]),
      outOrIn: pickFirstText(row, ["OutOrIn", "OUTORIN"])
    }));

    res.json({
      available: true,
      sourceMethod: `json_report:${reportTitle}`,
      rowCount: Number(mappedRows.length || 0),
      rows: mappedRows
    });
  } catch (error) {
    res.json({
      available: false,
      sourceMethod: `json_report:${reportTitle}`,
      error: normalizeAsmReportError(error, "Unable to load City Daily In/Out to Staff report."),
      rowCount: 0,
      rows: []
    });
  }
});

app.get("/api/admin/reporting/staff-weekly-pathway-planning", requireAdmin, requireReporting, async (_req, res) => {
  const reportTitle = `${process.env.ASM_STAFF_WEEKLY_PATHWAY_REPORT_TITLE || "Staff's Weekly Pathway Planning"}`.trim();
  try {
    const rows = await fetchAsmRowsForMethod("json_report", { title: reportTitle });

    const pickFirstText = (row, fields, fallback = "") => {
      for (const field of fields) {
        const value = row?.[field];
        if (value === undefined || value === null) continue;
        const text = `${value}`.trim();
        if (text) return text;
      }
      return fallback;
    };

    const mappedRows = rows.map((row) => ({
      reason: pickFirstText(row, ["Reason", "REASON"]),
      animalName: pickFirstText(row, ["AnimalName", "ANIMALNAME"]),
      holdDate: pickFirstText(row, ["HoldDate", "HOLDDATE"]),
      animalAge: pickFirstText(row, ["AnimalAge", "ANIMALAGE"]),
      daysOnShelter: pickFirstText(row, ["DaysOnShelter", "DAYSONSHELTER"]),
      shortCode: pickFirstText(row, ["ShortCode", "SHORTCODE"]),
      displayLocation: pickFirstText(row, ["DisplayLocation", "DISPLAYLOCATION"]),
      weight: pickFirstText(row, ["Weight", "WEIGHT"]),
      comments: pickFirstText(row, ["Comments", "COMMENTS"]),
      pic: pickFirstText(row, ["Pic", "PIC"]),
      lastChangedDate: pickFirstText(row, ["LastChangedDate", "LASTCHANGEDDATE"])
    }));

    res.json({
      available: true,
      sourceMethod: `json_report:${reportTitle}`,
      rowCount: Number(mappedRows.length || 0),
      rows: mappedRows
    });
  } catch (error) {
    res.json({
      available: false,
      sourceMethod: `json_report:${reportTitle}`,
      error: normalizeAsmReportError(error, "Unable to load Staff's Weekly Pathway Planning report."),
      rowCount: 0,
      rows: []
    });
  }
});

app.get("/api/admin/reporting/daily-foster-movements", requireAdmin, requireReporting, async (_req, res) => {
  const reportTitle = `${process.env.ASM_DAILY_FOSTER_MOVEMENTS_REPORT_TITLE || "Daily Foster Movements"}`.trim();
  try {
    const rows = await fetchAsmRowsForMethod("json_report", { title: reportTitle });

    const pickFirstText = (row, fields, fallback = "") => {
      for (const field of fields) {
        const value = row?.[field];
        if (value === undefined || value === null) continue;
        const text = `${value}`.trim();
        if (text) return text;
      }
      return fallback;
    };

    const mappedRows = rows.map((row) => ({
      theDate: pickFirstText(row, ["thedate", "THEDATE", "DATE"]),
      reason: pickFirstText(row, ["Reason", "REASON"]),
      categoryName: pickFirstText(row, ["CategoryName", "CATEGORYNAME"]),
      shelterCode: pickFirstText(row, ["ShelterCode", "SHELTERCODE"]),
      animalId: pickFirstText(row, ["ID", "ANIMALID", "AnimalID"]),
      identichipNumber: pickFirstText(row, ["IdentichipNumber", "IDENTICHIPNUMBER"]),
      animalName: pickFirstText(row, ["AnimalName", "ANIMALNAME"]),
      displayLocation: pickFirstText(row, ["DisplayLocation", "DISPLAYLOCATION"]),
      speciesName: pickFirstText(row, ["SpeciesName", "SPECIESNAME"]),
      animalAge: pickFirstText(row, ["AnimalAge", "ANIMALAGE"]),
      sexName: pickFirstText(row, ["SexName", "SEXNAME"]),
      locationFound: pickFirstText(row, ["locationfound", "LOCATIONFOUND"]),
      outOrIn: pickFirstText(row, ["OutOrIn", "OUTORIN"])
    }));

    res.json({
      available: true,
      sourceMethod: `json_report:${reportTitle}`,
      rowCount: Number(mappedRows.length || 0),
      rows: mappedRows
    });
  } catch (error) {
    res.json({
      available: false,
      sourceMethod: `json_report:${reportTitle}`,
      error: normalizeAsmReportError(error, "Unable to load Daily Foster Movements report."),
      rowCount: 0,
      rows: []
    });
  }
});

app.get("/api/admin/reporting/tnr-clinic", requireAdmin, requireReporting, async (_req, res) => {
  const reportTitle = `${process.env.ASM_TNR_CLINIC_REPORT_TITLE || "TNR CLINIC"}`.trim();
  try {
    const rows = await fetchAsmRowsForMethod("json_report", { title: reportTitle });

    const pickFirstText = (row, fields, fallback = "") => {
      for (const field of fields) {
        const value = row?.[field];
        if (value === undefined || value === null) continue;
        const text = `${value}`.trim();
        if (text) return text;
      }
      return fallback;
    };

    const mappedRows = rows.map((row) => ({
      animalId: pickFirstText(row, ["animalid", "ANIMALID", "AnimalID", "ID"]),
      animalName: pickFirstText(row, ["ANIMALNAME", "AnimalName"]),
      shelterCode: pickFirstText(row, ["SHELTERCODE", "ShelterCode"]),
      animalType: pickFirstText(row, ["ANIMALTYPE", "AnimalType"]),
      sex: pickFirstText(row, ["SEX", "Sex"]),
      baseColour: pickFirstText(row, ["BASECOLOUR", "BaseColour"]),
      hiddenAnimalDetails: pickFirstText(row, ["HIDDENANIMALDETAILS", "HiddenAnimalDetails"]),
      animalComments: pickFirstText(row, ["ANIMALCOMMENTS", "AnimalComments"]),
      displayLocation: pickFirstText(row, ["DISPLAYLOCATION", "DisplayLocation"]),
      locationFound: pickFirstText(row, ["locationfound", "LOCATIONFOUND"]),
      ownerName: pickFirstText(row, ["ownername", "OWNERNAME", "OwnerName"]),
      ownerAddress: pickFirstText(row, ["owneraddress", "OWNERADDRESS", "OwnerAddress"]),
      ownerTown: pickFirstText(row, ["ownertown", "OWNERTOWN", "OwnerTown"]),
      placementNotes: pickFirstText(row, ["COMMENTS", "Comments"]),
      mostRecentEntryDate: pickFirstText(row, ["MOSTRECENTENTRYDATE", "MostRecentEntryDate"]),
      ready: pickFirstText(row, ["Ready", "READY"])
    }));

    res.json({
      available: true,
      sourceMethod: `json_report:${reportTitle}`,
      rowCount: Number(mappedRows.length || 0),
      rows: mappedRows
    });
  } catch (error) {
    res.json({
      available: false,
      sourceMethod: `json_report:${reportTitle}`,
      error: normalizeAsmReportError(error, "Unable to load TNR Clinic report."),
      rowCount: 0,
      rows: []
    });
  }
});

app.get("/api/admin/reporting/pathway-planning", requireAdmin, requireReporting, async (_req, res) => {
  const reportTitle = `${process.env.ASM_PATHWAY_PLANNING_REPORT_TITLE || "Pathway Planning"}`.trim();
  try {
    const rows = await fetchAsmRowsForMethod("json_report", { title: reportTitle });

    const pickFirstText = (row, fields, fallback = "") => {
      for (const field of fields) {
        const value = row?.[field];
        if (value === undefined || value === null) continue;
        const text = `${value}`.trim();
        if (text) return text;
      }
      return fallback;
    };

    const mappedRows = rows.map((row) => ({
      animalName: pickFirstText(row, ["animalname", "ANIMALNAME", "AnimalName"]),
      holdDate: pickFirstText(row, ["Holddate", "HOLDDATE", "HOLDUNTILDATE"]),
      daysOnShelter: pickFirstText(row, ["daysonshelter", "DAYSONSHELTER", "DaysOnShelter"]),
      shortCode: pickFirstText(row, ["shortcode", "SHORTCODE", "ShortCode"]),
      displayLocation: pickFirstText(row, ["displaylocation", "DISPLAYLOCATION", "DisplayLocation"]),
      weight: pickFirstText(row, ["weight", "WEIGHT", "Weight"]),
      comments: pickFirstText(row, ["Comments", "COMMENTS"]),
      reason: pickFirstText(row, ["Reason", "REASON"]),
      pic: pickFirstText(row, ["pic", "PIC", "Pic"]),
      lastChangedDate: pickFirstText(row, ["LastChangedDate", "LASTCHANGEDDATE"]),
      animalAge: pickFirstText(row, ["AnimalAge", "ANIMALAGE", "animalage"])
    }));

    res.json({
      available: true,
      sourceMethod: `json_report:${reportTitle}`,
      rowCount: Number(mappedRows.length || 0),
      rows: mappedRows
    });
  } catch (error) {
    res.json({
      available: false,
      sourceMethod: `json_report:${reportTitle}`,
      error: normalizeAsmReportError(error, "Unable to load Pathway Planning report."),
      rowCount: 0,
      rows: []
    });
  }
});

app.get("/api/admin/reporting/donations-and-thank-yous", requireAdmin, requireReporting, async (_req, res) => {
  const reportTitle = `${process.env.ASM_DONATIONS_THANKYOUS_REPORT_TITLE || "Donations and Thank Yous"}`.trim();
  try {
    const rows = await fetchAsmRowsForMethod("json_report", { title: reportTitle });

    const pickFirstText = (row, fields, fallback = "") => {
      for (const field of fields) {
        const value = row?.[field];
        if (value === undefined || value === null) continue;
        const text = `${value}`.trim();
        if (text) return text;
      }
      return fallback;
    };

    // First column is an HTML expression without alias; ASM returns it as "?column?"
    const extractOwnerName = (raw) => {
      const m = `${raw || ""}`.match(/>([^<]+)</);
      return m ? m[1].trim() : `${raw || ""}`.replace(/<[^>]*>/g, "").trim();
    };
    const extractOwnerId = (raw) => {
      const m = `${raw || ""}`.match(/\?id=(\d+)/i);
      return m ? m[1] : "";
    };

    const mappedRows = rows.map((row) => {
      const ownerHtml = pickFirstText(row, ["?column?", "?COLUMN?", "OWNERLINK", "ownerlink"]);
      return {
        ownerName: extractOwnerName(ownerHtml),
        ownerId: extractOwnerId(ownerHtml),
        comments: pickFirstText(row, ["Comments", "COMMENTS"]),
        donation: pickFirstText(row, ["Donation", "DONATION"]),
        emailAddress: pickFirstText(row, ["emailaddress", "EMAILADDRESS", "EmailAddress"]),
        ownerAddress: pickFirstText(row, ["OwnerAddress", "OWNERADDRESS", "Owneraddress"]),
        ownerTown: pickFirstText(row, ["OwnerTown", "OWNERTOWN", "ownertown"]),
        ownerCounty: pickFirstText(row, ["OwnerCounty", "OWNERCOUNTY", "ownercounty"]),
        ownerPostcode: pickFirstText(row, ["OwnerPostcode", "OWNERPOSTCODE", "ownerpostcode"]),
        paymentName: pickFirstText(row, ["PaymentName", "PAYMENTNAME"]),
        date: pickFirstText(row, ["Date", "DATE"]),
        donationName: pickFirstText(row, ["DonationName", "DONATIONNAME"])
      };
    });

    res.json({
      available: true,
      sourceMethod: `json_report:${reportTitle}`,
      rowCount: Number(mappedRows.length || 0),
      rows: mappedRows
    });
  } catch (error) {
    res.json({
      available: false,
      sourceMethod: `json_report:${reportTitle}`,
      error: normalizeAsmReportError(error, "Unable to load Donations and Thank Yous report."),
      rowCount: 0,
      rows: []
    });
  }
});

app.get("/api/admin/reporting/adoption-followups", requireAdmin, requireReporting, async (req, res) => {
  const reportTitle = `${process.env.ASM_ADOPTION_FOLLOWUPS_REPORT_TITLE || "Adoption Follow-Ups more info"}`.trim();
  const monthno = `${req.query.month || ""}`.trim();
  const yearno = `${req.query.year || ""}`.trim();

  if (!monthno || !yearno) {
    return res.json({ available: false, sourceMethod: `json_report:${reportTitle}`, error: "month and year query parameters are required.", rowCount: 0, rows: [] });
  }

  try {
    const rows = await fetchAsmRowsForMethod("json_report", {
      title: reportTitle,
      // Some ASM reports validate named parameters instead of positional ASK1/ASK2.
      monthno,
      yearno,
      MONTHNO: monthno,
      YEARNO: yearno,
      ASK1: monthno,
      ASK2: yearno
    });

    const pickFirstText = (row, fields, fallback = "") => {
      for (const field of fields) {
        const value = row?.[field];
        if (value === undefined || value === null) continue;
        const text = `${value}`.trim();
        if (text) return text;
      }
      return fallback;
    };

    const extractAnimalId = (row) => {
      const direct = pickFirstText(row, ["id", "ID", "animalid", "ANIMALID", "AnimalID"]);
      if (direct) return direct;

      const possibleHtml = [
        row?.AnimalName,
        row?.ANIMALNAME,
        row?.animalname,
        row?.ShelterCode,
        row?.SHELTERCODE,
        row?.sheltercode
      ];

      for (const raw of possibleHtml) {
        const match = `${raw || ""}`.match(/[?&]id=(\d+)/i);
        if (match) return match[1];
      }

      return "";
    };

    const extractAnimalLink = (row) => {
      const possibleHtml = [
        row?.AnimalName,
        row?.ANIMALNAME,
        row?.animalname,
        row?.ShelterCode,
        row?.SHELTERCODE,
        row?.sheltercode
      ];

      for (const raw of possibleHtml) {
        const html = `${raw || ""}`;
        const hrefMatch = html.match(/href\s*=\s*["']([^"']+)["']/i);
        if (!hrefMatch?.[1]) continue;

        const href = hrefMatch[1].trim();
        if (!href || /^javascript:/i.test(href)) continue;

        try {
          const url = new URL(href, "https://us10d.sheltermanager.com");
          if (/sheltermanager\.com$/i.test(url.hostname)) {
            url.protocol = "https:";
            url.hostname = "us10d.sheltermanager.com";
            url.port = "";
          }
          return url.toString();
        } catch {
          // Ignore malformed links and continue scanning other fields.
        }
      }

      return "";
    };

    const mappedRows = rows.map((row) => {
      const asmAnimalUrl = extractAnimalLink(row);
      const animalId = extractAnimalId(row) || ((`${asmAnimalUrl}`.match(/[?&]id=(\d+)/i) || [])[1] || "");

      return {
      ownerName: pickFirstText(row, ["OwnerName", "OWNERNAME"]),
      ownerSurname: pickFirstText(row, ["OWNERSURNAME", "OwnerSurname"]),
      ownerForenames: pickFirstText(row, ["OWNERFORENAMES", "OwnerForenames"]),
      ownerAddress: pickFirstText(row, ["OwnerAddress", "OWNERADDRESS"]),
      homeTelephone: pickFirstText(row, ["HOMETELEPHONE", "HomeTelephone"]),
      mobileTelephone: pickFirstText(row, ["MOBILETELEPHONE", "MobileTelephone"]),
      workTelephone: pickFirstText(row, ["WORKTELEPHONE", "WorkTelephone"]),
      ownerTown: pickFirstText(row, ["OwnerTown", "OWNERTOWN"]),
      ownerCounty: pickFirstText(row, ["OwnerCounty", "OWNERCOUNTY"]),
      ownerPostcode: pickFirstText(row, ["OwnerPostcode", "OWNERPOSTCODE"]),
      emailAddress: pickFirstText(row, ["EmailAddress", "EMAILADDRESS"]),
      shelterCode: pickFirstText(row, ["ShelterCode", "SHELTERCODE"]),
      animalId,
      asmAnimalUrl,
      animalName: pickFirstText(row, ["AnimalName", "ANIMALNAME"]),
      speciesName: pickFirstText(row, ["SpeciesName", "SPECIESNAME"]),
      neuteredDate: pickFirstText(row, ["NEUTEREDDATE", "NeuteredDate"]),
      adoptionDate: pickFirstText(row, ["AdoptionDate", "ADOPTIONDATE"])
    };
    });

    res.json({
      available: true,
      sourceMethod: `json_report:${reportTitle}`,
      rowCount: Number(mappedRows.length || 0),
      rows: mappedRows
    });
  } catch (error) {
    res.json({
      available: false,
      sourceMethod: `json_report:${reportTitle}`,
      error: normalizeAsmReportError(error, "Unable to load Adoption Follow-Ups report."),
      rowCount: 0,
      rows: []
    });
  }
});

app.get("/api/admin/reporting/yearly-reviews-upcoming", requireAdmin, requireReporting, async (_req, res) => {
  const reportTitle = `${process.env.ASM_YEARLY_REVIEWS_UPCOMING_REPORT_TITLE || "Yearly Reviews Upcoming"}`.trim();
  try {
    const rows = await fetchAsmRowsForMethod("json_report", { title: reportTitle });

    const pickFirstText = (row, fields, fallback = "") => {
      for (const field of fields) {
        const value = row?.[field];
        if (value === undefined || value === null) continue;
        const text = `${value}`.trim();
        if (text) return text;
      }
      return fallback;
    };

    const mappedRows = rows.map((row) => ({
      ownerName: pickFirstText(row, ["OWNERNAME", "OwnerName"]),
      value: pickFirstText(row, ["VALUE", "Value"])
    }));

    res.json({
      available: true,
      sourceMethod: `json_report:${reportTitle}`,
      rowCount: Number(mappedRows.length || 0),
      rows: mappedRows
    });
  } catch (error) {
    res.json({
      available: false,
      sourceMethod: `json_report:${reportTitle}`,
      error: normalizeAsmReportError(error, "Unable to load Yearly Reviews Upcoming report."),
      rowCount: 0,
      rows: []
    });
  }
});

app.get("/api/admin/reporting/animal-control-heatmap", requireAdmin, requireReporting, async (req, res) => {
  try {
    const parseDateInput = (value) => {
      const raw = `${value || ""}`.trim();
      if (!raw) return null;
      const ymd = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (ymd) {
        return new Date(Date.UTC(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3])));
      }
      const mdy = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (mdy) {
        return new Date(Date.UTC(Number(mdy[3]), Number(mdy[1]) - 1, Number(mdy[2])));
      }
      const parsed = new Date(raw);
      if (!Number.isNaN(parsed.getTime())) {
        return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
      }
      return null;
    };

    const now = new Date();
    const defaultFrom = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const defaultTo = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

    const fromDateObj = parseDateInput(req.query.fromDate) || defaultFrom;
    const toDateObj = parseDateInput(req.query.toDate) || defaultTo;
    if (Number.isNaN(fromDateObj.getTime()) || Number.isNaN(toDateObj.getTime())) {
      return res.status(400).json({ error: "Invalid fromDate or toDate." });
    }
    if (fromDateObj > toDateObj) {
      return res.status(400).json({ error: "fromDate must be before or equal to toDate." });
    }

    const formatDate = (d) => {
      const y = d.getUTCFullYear();
      const m = String(d.getUTCMonth() + 1).padStart(2, "0");
      const day = String(d.getUTCDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    };
    const fromDate = formatDate(fromDateObj);
    const toDate = formatDate(toDateObj);
    const toDateEnd = new Date(Date.UTC(
      toDateObj.getUTCFullYear(),
      toDateObj.getUTCMonth(),
      toDateObj.getUTCDate(),
      23,
      59,
      59,
      999
    ));

    let sourceMethod = "";
    let sourceRows = [];
    let unavailableReason = "";
    try {
      const result = await fetchAnimalControlRowsForRange(fromDate, toDate);
      sourceMethod = result.sourceMethod;
      sourceRows = result.rows;
    } catch (error) {
      unavailableReason = error.message || "Unable to fetch animal control call data from ASM.";
    }

    if (!sourceMethod) {
      return res.json({
        available: false,
        error: unavailableReason || "Animal Control data is not available from the current ASM service method.",
        fromDate,
        toDate,
        sourceMethod: "",
        rowCount: 0,
        filteredRowCount: 0,
        pointCount: 0,
        points: [],
        topHotspots: []
      });
    }

    const dateFields = ["INCIDENTDATETIME", "INCIDENTDATE", "CALLDATE", "REPORTEDDATE", "DATE", "CREATEDDATE", "LASTCHANGEDDATE"];
    const addressFields = ["DISPATCHADDRESS", "ADDRESS", "LOCATION", "SITE", "DISPATCHLOCATION"];
    const addressTownFields = ["DISPATCHTOWN", "TOWN", "CITY"];
    const addressCountyFields = ["DISPATCHCOUNTY", "COUNTY", "STATE", "PROVINCE"];
    const addressPostcodeFields = ["DISPATCHPOSTCODE", "POSTCODE", "ZIPCODE", "ZIP"];
    const latFields = ["LAT", "LATITUDE", "DISPATCHLAT", "DISPATCHLATITUDE", "LOCATIONLAT", "YCOORD"];
    const lonFields = ["LON", "LONG", "LONGITUDE", "DISPATCHLON", "DISPATCHLONG", "DISPATCHLONGITUDE", "LOCATIONLON", "XCOORD"];
    const latLongFields = ["LATLONG", "DISPATCHLATLONG", "LOCATIONLATLONG", "COORDINATES", "GPS"];

    const pickDate = (row) => {
      for (const field of dateFields) {
        const value = row?.[field];
        if (!value) continue;
        const d = new Date(value);
        if (!Number.isNaN(d.getTime())) return d;
      }
      return null;
    };

    const pickText = (row, fields) => {
      for (const field of fields) {
        const value = row?.[field];
        if (value === undefined || value === null) continue;
        const text = `${value}`.trim();
        if (text) return text;
      }
      return "";
    };

    const normalizeAddress = (rawAddress) => {
      let text = `${rawAddress || ""}`
        .replace(/\s+/g, " ")
        .replace(/\s+,/g, ",")
        .replace(/,+/g, ",")
        .trim()
        .replace(/^,|,$/g, "");
      if (!text) return "";
      return text;
    };

    const simplifyDispatchAddressForGeocode = (value) => {
      const raw = `${value || ""}`.replace(/\r/g, "").trim();
      if (!raw) return "";

      const lines = raw
        .split(/\n+/)
        .map((line) => normalizeAddress(line))
        .filter(Boolean);

      let primary = lines[0] || "";
      primary = primary
        .replace(/^([0-9]+)\s+block\s+of\s+/i, "$1 ")
        .replace(/\b(?:lot|unit|apt|apartment|suite|ste|trailer|space)\b.*$/i, "")
        .replace(/\s+/g, " ")
        .trim();

      // Keep intersections, but skip vague place labels that do not geocode reliably.
      if (!/^\d/.test(primary) && !/\s+&\s+/.test(primary) && !/\bat\b/i.test(primary)) {
        return "";
      }

      return normalizeAddress(primary);
    };

    const buildRowAddress = (row) => {
      const street = pickText(row, ["DISPATCHADDRESS"]);
      const town = pickText(row, addressTownFields);
      const county = pickText(row, addressCountyFields);
      const postcode = pickText(row, addressPostcodeFields);

      const parts = [street, town, county, postcode]
        .map((value) => normalizeAddress(value))
        .filter(Boolean);

      let address = normalizeAddress(parts.join(", "));
      if (!address) return "";

      // Reject vague non-location labels
      if (/^(phone|call|note|notes|tbd|unknown|pending|n\/a|na|none|blank|\?|--|__)/i.test(street)) {
        return "";
      }

      if (!town && !/new\s+braunfels/i.test(address)) {
        address = `${address}, New Braunfels`;
      }
      if (!/\btx\b|texas/i.test(address) && !/\b\d{5}(?:-\d{4})?\b/.test(address)) {
        address = `${address}, TX`;
      }

      return normalizeAddress(address);
    };

    const buildGeocodeQuery = (row) => {
      const dispatchRaw = pickText(row, ["DISPATCHADDRESS"]);
      const street = simplifyDispatchAddressForGeocode(dispatchRaw)
        || normalizeAddress(`${dispatchRaw || ""}`.split(/\n+/)[0] || "");
      if (!street) return "";

      const town = pickText(row, addressTownFields) || "New Braunfels";
      const county = pickText(row, addressCountyFields);
      const postcode = pickText(row, addressPostcodeFields);

      const countyNormalized = /comal/i.test(`${county || ""}`)
        ? county
        : "Comal County";

      // Force lookups into Comal County, Texas to avoid cross-region false matches.
      return normalizeAddress([street, town, countyNormalized, "Texas", postcode].filter(Boolean).join(", "));
    };

    const parseLatLon = (value) => {
      const raw = `${value || ""}`.trim();
      if (!raw) return null;
      const match = raw.match(/(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)/);
      if (!match) return null;
      const lat = Number(match[1]);
      const lon = Number(match[2]);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
      if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
      if (Math.abs(lat) < 0.000001 && Math.abs(lon) < 0.000001) return null;
      // Heat map is constrained to Comal County, TX area.
      if (lat < 29.35 || lat > 29.98 || lon < -98.65 || lon > -97.80) return null;
      return { lat, lon };
    };

    const extractRowCoords = (row) => {
      for (const field of latLongFields) {
        const parsed = parseLatLon(row?.[field]);
        if (parsed) return parsed;
      }
      const latRaw = pickText(row, latFields);
      const lonRaw = pickText(row, lonFields);
      const lat = Number(latRaw);
      const lon = Number(lonRaw);
      if (
        Number.isFinite(lat)
        && Number.isFinite(lon)
        && Math.abs(lat) <= 90
        && Math.abs(lon) <= 180
        && !(Math.abs(lat) < 0.000001 && Math.abs(lon) < 0.000001)
        && lat >= 29.35
        && lat <= 29.98
        && lon >= -98.65
        && lon <= -97.80
      ) {
        return { lat, lon };
      }
      return null;
    };

    const addressCounts = new Map();
    let filteredRowCount = 0;
    for (const row of sourceRows) {
      const rowDate = pickDate(row);
      if (!rowDate) continue;
      if (rowDate < fromDateObj || rowDate > toDateEnd) continue;
      filteredRowCount += 1;

      const directCoords = extractRowCoords(row);
      if (directCoords) {
        const key = `coord:${directCoords.lat.toFixed(6)},${directCoords.lon.toFixed(6)}`;
        const existing = addressCounts.get(key) || { count: 0, address: "Direct Coordinates", lat: directCoords.lat, lon: directCoords.lon, incidents: [] };
        existing.count += 1;
        const iid = row.IID ?? row.ANIMALCONTROLID ?? null;
        const code = row.INCIDENTCODE || null;
        const dt = row.INCIDENTDATETIME || row.CALLDATETIME || null;
        if (iid != null) existing.incidents.push({ iid, code, dt });
        addressCounts.set(key, existing);
        continue;
      }

      const address = buildRowAddress(row);
      if (!address) continue;
      const geocodeQuery = buildGeocodeQuery(row);
      const key = `addr:${address.toLowerCase()}`;
      const existing = addressCounts.get(key) || { count: 0, address, geocodeQuery, lat: null, lon: null, incidents: [] };
      existing.count += 1;
      if (!existing.geocodeQuery && geocodeQuery) {
        existing.geocodeQuery = geocodeQuery;
      }
      const iid = row.IID ?? row.ANIMALCONTROLID ?? null;
      const code = row.INCIDENTCODE || null;
      const dt = row.INCIDENTDATETIME || row.CALLDATETIME || null;
      if (iid != null) existing.incidents.push({ iid, code, dt });
      addressCounts.set(key, existing);
    }

    const geocodeAddress = async (address) => {
      const cacheKey = address.toLowerCase();
      const cached = state.acGeocodeCache[cacheKey];
      if (cached && typeof cached === "object") {
        if (cached.lat !== undefined && cached.lon !== undefined) {
          return { lat: Number(cached.lat), lon: Number(cached.lon) };
        }
        return null;
      }

      const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=us&bounded=1&viewbox=-98.65,29.98,-97.80,29.35&q=${encodeURIComponent(address)}`;
      const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

      let payload = [];
      for (let attempt = 1; attempt <= 2; attempt += 1) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2500);
        let response;
        try {
          response = await fetch(url, {
            headers: {
              Accept: "application/json",
              "User-Agent": "HSNBA-Reporting/1.0"
            },
            signal: controller.signal
          });
        } catch {
          clearTimeout(timeoutId);
          return null;
        }
        clearTimeout(timeoutId);

        if (response.status === 429) {
          const retryAfter = Number(response.headers.get("retry-after") || "0");
          const delayMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1500;
          if (attempt < 2) {
            await wait(delayMs);
            continue;
          }
          // Do not cache a miss on rate limit; try again on later requests.
          return null;
        }

        if (!response.ok) {
          // Temporary upstream errors should not be cached as misses.
          if (response.status >= 500) {
            return null;
          }
          state.acGeocodeCache[cacheKey] = { miss: true, updatedAt: new Date().toISOString() };
          return null;
        }

        payload = await response.json().catch(() => []);
        break;
      }

      const first = Array.isArray(payload) ? payload[0] : null;
      const lat = Number(first?.lat);
      const lon = Number(first?.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        state.acGeocodeCache[cacheKey] = { miss: true, updatedAt: new Date().toISOString() };
        return null;
      }

      state.acGeocodeCache[cacheKey] = { lat, lon, updatedAt: new Date().toISOString() };
      return { lat, lon };
    };

      const unresolved = Array.from(addressCounts.values())
      .filter((entry) => entry.lat === null || entry.lon === null)
      .sort((a, b) => b.count - a.count)
        .slice(0, 25);

      const geocodeDeadlineMs = Date.now() + 12000;
      let geocodeCounter = 0;
    for (const entry of unresolved) {
        if (Date.now() > geocodeDeadlineMs) {
          break;
        }
        const geocodeTarget = entry.geocodeQuery || entry.address;
        if (!geocodeTarget) continue;
        const geocoded = await geocodeAddress(geocodeTarget);
        geocodeCounter += 1;
      if (geocoded) {
        entry.lat = geocoded.lat;
        entry.lon = geocoded.lon;
      }
    }

    saveAcGeocodeCache();

    let asmBaseUrl = "";
    if (state.asm.serviceUrl) {
      try {
        const svcUrl = new URL(state.asm.serviceUrl);
        const envIncidentBaseUrl = `${process.env.ASM_INCIDENT_BASE_URL || ""}`.trim();
        if (envIncidentBaseUrl) {
          const overrideUrl = new URL(envIncidentBaseUrl);
          asmBaseUrl = `${overrideUrl.protocol}//${overrideUrl.host}`;
        }

        const svcHost = `${svcUrl.hostname || ""}`.trim().toLowerCase();
        const hasRegionalAsmHost = /^[a-z0-9-]+\.sheltermanager\.com$/i.test(svcHost) && svcHost !== "service.sheltermanager.com";
        const accountHost = `${state.asm.account || ""}`.trim().toLowerCase();
        if (!asmBaseUrl && accountHost === "hsnba") {
          // HSNBA incidents are served from the us10d tenant host.
          asmBaseUrl = `${svcUrl.protocol}//us10d.sheltermanager.com`;
        } else if (!asmBaseUrl && hasRegionalAsmHost) {
          asmBaseUrl = `${svcUrl.protocol}//${svcUrl.host}`;
        } else if (!asmBaseUrl && /^[a-z0-9][a-z0-9-]*$/i.test(accountHost)) {
          asmBaseUrl = `${svcUrl.protocol}//${accountHost}.sheltermanager.com`;
        } else if (!asmBaseUrl) {
          asmBaseUrl = `${svcUrl.protocol}//${svcUrl.host}`;
        }
      } catch { /* ignore */ }
    }

    const points = Array.from(addressCounts.values())
      .filter((entry) => Number.isFinite(entry.lat) && Number.isFinite(entry.lon))
      .map((entry) => ({
        lat: Number(entry.lat),
        lon: Number(entry.lon),
        weight: Number(entry.count || 0),
        count: Number(entry.count || 0),
        address: entry.address,
        incidents: entry.incidents || []
      }))
      .sort((a, b) => b.weight - a.weight);

    res.json({
      available: true,
      fromDate,
      toDate,
      sourceMethod,
      rowCount: Number(sourceRows.length || 0),
      filteredRowCount,
      pointCount: points.length,
      asmBaseUrl,
      points,
      topHotspots: points.slice(0, 25)
    });
  } catch (error) {
    res.status(500).json({ error: error.message || "Failed to build animal control heatmap." });
  }
});

// ── Linked Reports ────────────────────────────────────────────────────────────

app.get("/api/admin/reporting/linked-reports", requireAdmin, requireReporting, (_req, res) => {
  res.json({ reports: state.linkedReports });
});

// probe must be registered before /:id routes
app.post("/api/admin/reporting/linked-reports/probe", requireAdmin, requireReporting, async (req, res) => {
  const asmReportTitle = `${req.body?.asmReportTitle || ""}`.trim();
  if (!asmReportTitle) {
    return res.status(400).json({ error: "asmReportTitle is required." });
  }

  const cacheKey = asmReportTitle.toLowerCase();
  const now = Date.now();
  const cached = state.linkedReportProbeCache.get(cacheKey);
  if (cached && (now - Number(cached.fetchedAt || 0) <= LINKED_REPORT_PROBE_CACHE_MS) && Array.isArray(cached.fieldKeys) && cached.fieldKeys.length) {
    const timingHint = getLinkedReportTimingHint(asmReportTitle, cached.fieldKeys);
    return res.json({
      ok: true,
      fieldKeys: cached.fieldKeys,
      sampleRow: cached.sampleRow || null,
      rowCount: Number(cached.rowCount || 0),
      fromCache: true,
      timingHint
    });
  }

  const presetFields = getLinkedReportProbePresetFields(asmReportTitle);
  if (presetFields.length) {
    const timingHint = getLinkedReportTimingHint(asmReportTitle, presetFields);
    return res.json({
      ok: true,
      fieldKeys: presetFields,
      sampleRow: null,
      rowCount: 0,
      fromPreset: true,
      timingHint
    });
  }

  try {
    const rows = await fetchAsmRowsForMethod("json_report", { title: asmReportTitle });
    const sampleRow = rows[0] && typeof rows[0] === "object" ? rows[0] : null;
    const fieldKeys = sampleRow ? Object.keys(sampleRow) : [];
    const timingHint = getLinkedReportTimingHint(asmReportTitle, fieldKeys);
    if (fieldKeys.length) {
      state.linkedReportProbeCache.set(cacheKey, {
        fetchedAt: now,
        fieldKeys,
        sampleRow,
        rowCount: rows.length
      });
    }
    res.json({ ok: true, fieldKeys, sampleRow, rowCount: rows.length, fromLive: true, timingHint });
  } catch (error) {
    const retryHint = extractAsmRetryHint(error);
    if (cached && Array.isArray(cached.fieldKeys) && cached.fieldKeys.length) {
      const timingHint = getLinkedReportTimingHint(asmReportTitle, cached.fieldKeys);
      return res.json({
        ok: true,
        fieldKeys: cached.fieldKeys,
        sampleRow: cached.sampleRow || null,
        rowCount: Number(cached.rowCount || 0),
        fromCache: true,
        warning: normalizeAsmReportError(error, "Unable to probe ASM report."),
        timingHint
      });
    }
    res.json({
      ok: false,
      error: normalizeAsmReportError(error, "Unable to probe ASM report."),
      fieldKeys: [],
      sampleRow: null,
      rowCount: 0,
      retryAt: retryHint.retryAt,
      waitSeconds: retryHint.waitSeconds
    });
  }
});

app.post("/api/admin/reporting/linked-reports", requireAdmin, requireReporting, (req, res) => {
  const body = req.body || {};
  if (!`${body.title || ""}`.trim()) {
    return res.status(400).json({ error: "title is required." });
  }
  if (!`${body.asmReportTitle || ""}`.trim()) {
    return res.status(400).json({ error: "asmReportTitle is required." });
  }
  const report = sanitizeLinkedReport({ ...body, id: crypto.randomUUID(), createdAt: new Date().toISOString() });
  state.linkedReports.push(report);
  saveLinkedReports();
  res.json({ ok: true, report });
});

app.get("/api/admin/reporting/linked-reports/:id/data", requireAdmin, requireReporting, async (req, res) => {
  const id = `${req.params.id || ""}`.trim();
  const report = state.linkedReports.find((r) => r.id === id);
  if (!report) {
    return res.status(404).json({ error: "Linked report not found." });
  }
  const reportMeta = {
    id: report.id,
    title: report.title,
    description: report.description,
    linkTemplate: report.linkTemplate || "",
    linkLabel: report.linkLabel || "",
    chartLeftTitle: report.chartLeftTitle || "",
    chartRightTitle: report.chartRightTitle || "",
    chartLeftType: report.chartLeftType || "bar",
    chartRightType: report.chartRightType || "bar",
    showChartsOnDashboard: Boolean(report.showChartsOnDashboard),
    fields: report.fields
  };
  try {
    const asmTitle = `${report.asmReportTitle || ""}`.trim();
    const normalizedTitle = asmTitle.toLowerCase();
    const extraParams = { title: asmTitle };
    const monthQuery = `${req.query?.month || ""}`.trim();
    const yearQuery = `${req.query?.year || ""}`.trim();

    // Some ASM reports (notably Adoption Follow-Ups) require month/year parameters.
    if (normalizedTitle.includes("adoption follow-up")) {
      const now = new Date();
      const monthno = monthQuery || `${now.getMonth() + 1}`;
      const yearno = yearQuery || `${now.getFullYear()}`;
      Object.assign(extraParams, {
        monthno,
        yearno,
        MONTHNO: monthno,
        YEARNO: yearno,
        ASK1: monthno,
        ASK2: yearno
      });
    }

    const cacheKey = `${report.id}:${extraParams.monthno || ""}:${extraParams.yearno || ""}`;
    const REPORT_DATA_CACHE_TTL_MS = 5 * 60 * 1000;
    const cached = state.linkedReportDataCache.get(cacheKey);
    if (cached && Date.now() - cached.fetchedAt < REPORT_DATA_CACHE_TTL_MS) {
      return res.json(cached.payload);
    }

    const rawRows = await fetchAsmRowsForMethod("json_report", extraParams);
    const rows = normalizeKnownLinkedReportRows(asmTitle, rawRows);
    const payload = {
      available: true,
      report: reportMeta,
      sourceMethod: `json_report:${report.asmReportTitle}`,
      rowCount: rows.length,
      rows
    };
    state.linkedReportDataCache.set(cacheKey, { fetchedAt: Date.now(), payload });
    res.json(payload);
  } catch (error) {
    res.json({
      available: false,
      report: reportMeta,
      sourceMethod: `json_report:${report.asmReportTitle}`,
      error: normalizeAsmReportError(error, "Unable to load linked report data."),
      rowCount: 0,
      rows: []
    });
  }
});

app.patch("/api/admin/reporting/linked-reports/:id", requireAdmin, requireReporting, (req, res) => {
  const id = `${req.params.id || ""}`.trim();
  const idx = state.linkedReports.findIndex((r) => r.id === id);
  if (idx === -1) {
    return res.status(404).json({ error: "Linked report not found." });
  }
  const existing = state.linkedReports[idx];
  const updated = sanitizeLinkedReport({ ...existing, ...req.body, id: existing.id, createdAt: existing.createdAt });
  state.linkedReports[idx] = updated;
  saveLinkedReports();
  res.json({ ok: true, report: updated });
});

app.delete("/api/admin/reporting/linked-reports/:id", requireAdmin, requireReporting, (req, res) => {
  const id = `${req.params.id || ""}`.trim();
  const idx = state.linkedReports.findIndex((r) => r.id === id);
  if (idx === -1) {
    return res.status(404).json({ error: "Linked report not found." });
  }
  state.linkedReports.splice(idx, 1);
  saveLinkedReports();
  res.json({ ok: true });
});

app.get("/api/admin/settings/audio-jack", requireAdmin, requireJukeboxPlaybackAdmin, async (_req, res) => {
  try {
    const routing = getAudioJackRoutingConfig();
    const current = await getAudioJackSettings();
    res.json({
      ok: true,
      card: routing.card,
      control: routing.control,
      ...current
    });
  } catch (error) {
    const routing = getAudioJackRoutingConfig();
    res.status(500).json({
      error: error.message || "Unable to read audio jack settings",
      suggestion: `Verify ALSA control via amixer (card=${routing.card}, control=${routing.control}) or update AUX routing in Audio settings`
    });
  }
});

app.get("/api/admin/settings/audio-jack/controls", requireAdmin, requireJukeboxPlaybackAdmin, async (req, res) => {
  try {
    const cards = await getAlsaCards();
    const requestedCard = `${req.query?.card || ""}`.trim();
    const current = getAudioJackRoutingConfig();
    const selectedCard = requestedCard || current.card;
    const controls = await getAlsaSimpleControls(selectedCard);
    res.json({
      ok: true,
      active: {
        card: current.card,
        control: current.control
      },
      selectedCard,
      cards,
      controls
    });
  } catch (error) {
    res.status(500).json({ error: error.message || "Unable to enumerate ALSA controls" });
  }
});

app.post("/api/admin/settings/audio-jack/controls", requireAdmin, requireJukeboxPlaybackAdmin, async (req, res) => {
  try {
    const nextCard = `${req.body?.card || ""}`.trim();
    const nextControl = sanitizeAudioJackControlName(req.body?.control || "");
    if (!nextCard || !nextControl) {
      res.status(400).json({ error: "card and control are required" });
      return;
    }
    const available = await getAlsaSimpleControls(nextCard);
    const resolved = available.find((item) => item.toLowerCase() === nextControl.toLowerCase()) || "";
    if (!resolved) {
      res.status(400).json({
        error: `Control ${nextControl} is not available on card ${nextCard}`,
        suggestion: `Use one of: ${available.slice(0, 12).join(", ")}`
      });
      return;
    }

    audioJackAlsaCard = nextCard;
    audioJackAlsaControl = resolved;
    persistEnvSetting("AUDIO_JACK_ALSA_CARD", audioJackAlsaCard);
    persistEnvSetting("AUDIO_JACK_ALSA_CONTROL", audioJackAlsaControl);

    const current = await getAudioJackSettings();
    res.json({
      ok: true,
      card: audioJackAlsaCard,
      control: audioJackAlsaControl,
      ...current
    });
  } catch (error) {
    res.status(500).json({ error: error.message || "Unable to update AUX routing controls" });
  }
});

app.post("/api/admin/settings/audio-jack", requireAdmin, requireJukeboxPlaybackAdmin, async (req, res) => {
  try {
    const routing = getAudioJackRoutingConfig();
    const body = req.body || {};
    if (body.volume === undefined && body.muted === undefined) {
      res.status(400).json({ error: "Provide volume and/or muted" });
      return;
    }
    const current = await getAudioJackSettings();
    const nextVolume = body.volume === undefined ? current.volume : Number(body.volume);
    const nextMuted = body.muted === undefined ? current.muted : Boolean(body.muted);
    const updated = await setAudioJackSettings({ volume: nextVolume, muted: nextMuted });
    res.json({
      ok: true,
      card: routing.card,
      control: routing.control,
      ...updated
    });
  } catch (error) {
    const routing = getAudioJackRoutingConfig();
    res.status(500).json({
      error: error.message || "Unable to update audio jack settings",
      suggestion: `Verify ALSA control via amixer (card=${routing.card}, control=${routing.control}) or update AUX routing in Audio settings`
    });
  }
});

app.get("/api/admin/settings/stream-delivery", requireAdmin, requireJukeboxPlaybackAdmin, (_req, res) => {
  res.json({
    ok: true,
    enabled: state.audioAutomation.streamDeliveryEnabled !== false,
    activeListeners: state.audioAutomationRuntime.activeLiveStreams.size
  });
});

app.post("/api/admin/settings/stream-delivery", requireAdmin, requireJukeboxPlaybackAdmin, async (req, res) => {
  try {
    const enabled = req.body?.enabled !== false;
    const result = await setStreamDeliveryEnabled(enabled);
    res.json({ ok: true, ...result });
  } catch (error) {
    res.status(500).json({ error: error.message || "Unable to update stream delivery" });
  }
});

app.get("/api/admin/settings/audio-automation", requireAdmin, requireJukeboxPlaybackAdmin, async (_req, res) => {
  try {
    const routingConfig = getAudioJackRoutingConfig();
    const [audioJack, playbackState, masterVolume] = await Promise.all([
      getAudioJackSettings(),
      mopidyRpc("core.playback.get_state").catch(() => "unknown"),
      mopidyRpc("core.mixer.get_volume").catch(() => null)
    ]);
    const audioOutput = getMopidyAudioOutputDiagnostics();
    const now = new Date();
    const serverTime = now.toLocaleTimeString('en-US', { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: getActiveTimezone() });
    res.json({
      ok: true,
      streamDeliveryEnabled: state.audioAutomation.streamDeliveryEnabled !== false,
      activeListeners: state.audioAutomationRuntime.activeLiveStreams.size,
      schedules: sanitizeAudioAutomationSchedules(state.audioAutomation.schedules || []),
      targetActions: AUDIO_AUTOMATION_TARGET_ACTIONS,
      audioJack,
      audioJackCard: routingConfig.card,
      audioJackControl: routingConfig.control,
      masterVolume: Number.isFinite(Number(masterVolume)) ? Number(masterVolume) : null,
      audioOutput,
      hardwarePathReady: Boolean(audioOutput.hasAlsaSink),
      routing: {
        stream: "state.audioAutomation.streamDeliveryEnabled",
        playback: "mopidy core.playback.*",
        "audio-jack": `alsa amixer -c ${routingConfig.card} ${routingConfig.control}`
      },
      playbackState: `${playbackState || "unknown"}`,
      serverTime
    });
  } catch (error) {
    res.status(500).json({ error: error.message || "Unable to load audio automation settings" });
  }
});

app.get("/api/admin/settings/audio-path/diagnostics", requireAdmin, requireJukeboxPlaybackAdmin, async (_req, res) => {
  try {
    const routingConfig = getAudioJackRoutingConfig();
    const [audioJack, playbackState, masterVolume] = await Promise.all([
      getAudioJackSettings(),
      mopidyRpc("core.playback.get_state").catch(() => "unknown"),
      mopidyRpc("core.mixer.get_volume").catch(() => null)
    ]);
    const audioOutput = getMopidyAudioOutputDiagnostics();
    const warnings = [];
    if (!audioOutput.output) {
      warnings.push("Mopidy [audio] output is empty or unreadable.");
    }
    if (!audioOutput.hasAlsaSink) {
      warnings.push("Mopidy output does not include alsasink, so AUX hardware may be silent.");
    }
    if (!audioOutput.feedsStream) {
      warnings.push("Mopidy output does not look configured to feed stream.mp3/icecast.");
    }
    res.json({
      ok: warnings.length === 0,
      playbackState: `${playbackState || "unknown"}`,
      masterVolume: Number.isFinite(Number(masterVolume)) ? Number(masterVolume) : null,
      audioJack,
      audioJackCard: routingConfig.card,
      audioJackControl: routingConfig.control,
      audioOutput,
      warnings
    });
  } catch (error) {
    res.status(500).json({ error: error.message || "Unable to run audio path diagnostics" });
  }
});

app.get("/api/admin/debug/logs", requireAdmin, async (req, res) => {
  try {
    const allowedUnits = new Set(["hsnba-jukebox", "mopidy"]);
    const requestedUnit = `${req.query?.unit || "hsnba-jukebox"}`.trim();
    const unit = allowedUnits.has(requestedUnit) ? requestedUnit : "hsnba-jukebox";
    const requestedLines = Number(req.query?.lines || 200);
    const lines = Math.max(20, Math.min(1000, Number.isFinite(requestedLines) ? requestedLines : 200));

    const { stdout } = await execFileAsync("journalctl", [
      "-u",
      unit,
      "-n",
      `${lines}`,
      "--no-pager",
      "-o",
      "short-iso"
    ]);

    res.json({
      ok: true,
      unit,
      lines,
      fetchedAt: new Date().toISOString(),
      output: `${stdout || ""}`
    });
  } catch (error) {
    res.status(500).json({ error: error.message || "Unable to read service logs" });
  }
});

app.get("/api/admin/debug/stream-health", requireAdmin, async (req, res) => {
  try {
    const runtime = state.audioAutomationRuntime;
    const stats = runtime.streamStats || {};
    const requestedLimit = Number(req.query?.limit || 40);
    const limit = Math.max(10, Math.min(200, Number.isFinite(requestedLimit) ? requestedLimit : 40));
    const events = runtime.streamEvents.slice(-limit).reverse();

    const [mopidyOnline, icecastReachable] = await Promise.all([
      mopidyRpc("core.get_uri_schemes").then(() => true).catch(() => false),
      fetch("http://127.0.0.1:8000/").then((r) => r.ok).catch(() => false)
    ]);

    res.json({
      ok: true,
      streamDeliveryEnabled: state.audioAutomation.streamDeliveryEnabled !== false,
      activeListeners: runtime.activeLiveStreams.size,
      mopidyOnline,
      icecastReachable,
      stats: {
        totalClientConnections: Number(stats.totalClientConnections || 0),
        totalClientDisconnects: Number(stats.totalClientDisconnects || 0),
        totalUpstreamErrors: Number(stats.totalUpstreamErrors || 0),
        totalProxyErrors: Number(stats.totalProxyErrors || 0),
        lastUpstreamStatus: Number.isFinite(Number(stats.lastUpstreamStatus)) ? Number(stats.lastUpstreamStatus) : null,
        lastError: `${stats.lastError || ""}`,
        lastClientConnectedAt: `${stats.lastClientConnectedAt || ""}`,
        lastClientDisconnectedAt: `${stats.lastClientDisconnectedAt || ""}`,
        lastUpstreamConnectedAt: `${stats.lastUpstreamConnectedAt || ""}`,
        lastUpstreamEndedAt: `${stats.lastUpstreamEndedAt || ""}`,
        lastEventAt: `${stats.lastEventAt || ""}`
      },
      events
    });
  } catch (error) {
    res.status(500).json({ error: error.message || "Unable to read stream health" });
  }
});

app.post("/api/admin/audio-automation/schedules", requireAdmin, requireJukeboxPlaybackAdmin, (req, res) => {
  const rule = sanitizeAudioAutomationSchedule(req.body || {});
  state.audioAutomation.schedules = [
    ...sanitizeAudioAutomationSchedules(state.audioAutomation.schedules || []),
    rule
  ];
  saveAudioAutomationConfig();
  res.status(201).json({ ok: true, schedule: rule });
});

app.patch("/api/admin/audio-automation/schedules/:id", requireAdmin, requireJukeboxPlaybackAdmin, (req, res) => {
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

app.delete("/api/admin/audio-automation/schedules/:id", requireAdmin, requireJukeboxPlaybackAdmin, (req, res) => {
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

app.post("/api/admin/audio-automation/schedules/:id/run", requireAdmin, requireJukeboxPlaybackAdmin, async (req, res) => {
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

app.get("/api/admin/settings/spotify", requireAdmin, requireJukeboxPlaybackAdmin, async (_req, res) => {
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

app.post("/api/admin/settings/spotify", requireAdmin, requireJukeboxPlaybackAdmin, (req, res) => {
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
  saveSpotifyTokens();

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

app.post("/api/admin/settings/spotify/disconnect", requireAdmin, requireJukeboxPlaybackAdmin, (_req, res) => {
  state.tokens = null;
  saveSpotifyTokens();
  state.spotify.activeDeviceId = null;
  persistEnvSetting("SPOTIFY_DEVICE_ID", "");
  res.json({ ok: true });
});

app.post("/api/admin/settings/spotify/device", requireAdmin, requireJukeboxPlaybackAdmin, async (req, res) => {
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

app.get("/api/admin/settings/asm", requireAdmin, requireJukeboxSlidesAdmin, async (_req, res) => {
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
    animalControlReportTitle: state.asm.animalControlReportTitle,
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

app.post("/api/admin/settings/asm", requireAdmin, requireJukeboxSlidesAdmin, (req, res) => {
  const body = req.body || {};
  state.asm.serviceUrl = body.serviceUrl !== undefined ? `${body.serviceUrl}`.trim() : state.asm.serviceUrl;
  state.asm.account = body.account !== undefined ? `${body.account}`.trim() : state.asm.account;
  const apiKeyCandidate = body.apiKey !== undefined ? `${body.apiKey}`.trim() : undefined;
  state.asm.username = body.username !== undefined ? `${body.username}`.trim() : state.asm.username;
  const passwordCandidate = body.password !== undefined ? `${body.password}`.trim() : undefined;
  state.asm.apiKey = apiKeyCandidate === undefined || apiKeyCandidate === "" ? state.asm.apiKey : apiKeyCandidate;
  state.asm.password = passwordCandidate === undefined || passwordCandidate === "" ? state.asm.password : passwordCandidate;
  state.asm.adoptableMethod = body.adoptableMethod !== undefined ? `${body.adoptableMethod}`.trim() || "json_adoptable_animals" : state.asm.adoptableMethod;
  state.asm.animalControlReportTitle = body.animalControlReportTitle !== undefined
    ? `${body.animalControlReportTitle}`.trim()
    : state.asm.animalControlReportTitle;
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
  persistEnvSetting("ASM_ANIMALCONTROL_REPORT_TITLE", state.asm.animalControlReportTitle);
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

app.get("/api/admin/slideshow/pages", requireAdmin, requireJukeboxSlidesAdmin, (_req, res) => {
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

app.get("/api/admin/slideshow/images", requireAdmin, requireJukeboxSlidesAdmin, (_req, res) => {
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

app.post("/api/admin/slideshow/pages", requireAdmin, requireJukeboxSlidesAdmin, (req, res) => {
  const page = sanitizeSpecialPage(req.body || {});
  state.slideshow.specialPages = [
    ...sanitizeSpecialPages(state.slideshow.specialPages || []),
    page
  ];
  saveSlideshowConfig();
  res.status(201).json({ ok: true, page });
});

app.patch("/api/admin/slideshow/pages/:id", requireAdmin, requireJukeboxSlidesAdmin, (req, res) => {
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

app.post("/api/admin/slideshow/pages/:id/image", requireAdmin, requireJukeboxSlidesAdmin, (req, res) => {
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

app.delete("/api/admin/slideshow/pages/:id/image", requireAdmin, requireJukeboxSlidesAdmin, (req, res) => {
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

app.delete("/api/admin/slideshow/images/:fileName", requireAdmin, requireJukeboxSlidesAdmin, (req, res) => {
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

app.delete("/api/admin/slideshow/pages/:id", requireAdmin, requireJukeboxSlidesAdmin, (req, res) => {
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

app.post("/api/admin/settings/asm/test", requireAdmin, requireJukeboxSlidesAdmin, async (_req, res) => {
  const result = await getAsmAdoptables(true);
  res.json({
    ok: !result.error,
    itemCount: (result.items || []).length,
    sourceCount: Number(result.sourceCount || 0),
    fetchedAt: result.fetchedAt ? new Date(result.fetchedAt).toISOString() : null,
    error: result.error || ""
  });
});

app.get("/api/admin/settings/asm/inspect", requireAdmin, requireJukeboxSlidesAdmin, async (_req, res) => {
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

app.get("/api/admin/playback/state", requireAdmin, requireJukeboxPlaybackAdmin, async (_req, res) => {
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

  app.post(`/api/admin/playback/${action}`, requireAdmin, requireJukeboxPlaybackAdmin, async (_req, res) => {
    try {
      await mopidyRpc(rpcMethod);
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
}

app.post("/api/admin/playback/next", requireAdmin, requireJukeboxPlaybackAdmin, async (_req, res) => {
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

app.get("/api/admin/volume", requireAdmin, requireJukeboxPlaybackAdmin, async (_req, res) => {
  try {
    const volume = await mopidyRpc("core.mixer.get_volume");
    res.json({ volume: volume ?? 80 });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/admin/volume", requireAdmin, requireJukeboxPlaybackAdmin, async (req, res) => {
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

app.get("/api/admin/queue", requireAdmin, requireJukeboxQueueAdmin, async (_req, res) => {
  try {
    const tlTracks = await mopidyRpc("core.tracklist.get_tl_tracks");
    const queue = (tlTracks || []).map(mapQueueTrack);
    res.json({ queue });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete("/api/admin/queue/:tlid", requireAdmin, requireJukeboxQueueAdmin, async (req, res) => {
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

app.post("/api/admin/queue/clear", requireAdmin, requireJukeboxQueueAdmin, async (_req, res) => {
  try {
    await mopidyRpc("core.tracklist.clear");
    state.requestMetaByTlid.clear();
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/admin/queue/shuffle", requireAdmin, requireJukeboxQueueAdmin, async (_req, res) => {
  try {
    await randomizeQueuePreservingCurrent();
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/admin/queue/randomize", requireAdmin, requireJukeboxQueueAdmin, async (_req, res) => {
  try {
    await randomizeQueuePreservingCurrent();
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/admin/queue/move", requireAdmin, requireJukeboxQueueAdmin, async (req, res) => {
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

app.get("/api/admin/modes", requireAdmin, requireJukeboxPlaybackAdmin, async (_req, res) => {
  try {
    const [repeat] = await Promise.all([
      mopidyRpc("core.tracklist.get_repeat"),
    ]);
    res.json({ repeat: Boolean(repeat), random: false });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/admin/modes", requireAdmin, requireJukeboxPlaybackAdmin, async (req, res) => {
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
  if (!userHasPermission(staff, PERMISSIONS.REQUESTS_PORTAL_USE)) {
    res.status(403).json({ error: "This account does not have jukebox request access." });
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
      groups: getUserGroups(staff),
      permissions: getUserPermissions(staff),
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
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
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
    if (!userHasPermission(staff, PERMISSIONS.REQUESTS_QUEUE_ADD)) {
      res.status(403).json({ error: "This account cannot add songs to the queue." });
      return;
    }
    const maxPerDay = Math.max(1, Number(staff?.requestLimit || state.adminDb.staffDefaults?.requestLimit || MAX_PENDING_PER_USER));
    const pendingCount = staff ? getDailyRequestsUsed(staff.id) : await getPendingCountForToken(req.employeeToken);
    if (pendingCount >= maxPerDay) {
      res.status(429).json({
        error: `You reached your daily limit (${maxPerDay}) for today.`
      });
      return;
    }

    const tlTracks = await mopidyRpc("core.tracklist.get_tl_tracks");
    const alreadyQueued = (tlTracks || []).some((entry) => (entry.track?.uri || "") === uri);
    if (alreadyQueued) {
      res.status(409).json({ error: "That song is already in the queue." });
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
    if (!userHasPermission(req.staffAccount, PERMISSIONS.REQUESTS_VOTE_CAST)) {
      res.status(403).json({ error: "This account cannot vote on songs." });
      return;
    }
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

  // Derive the callback URL from the incoming request so it works regardless
  // of whether the user is on LAN (192.168.1.11), Tailscale (100.67.211.48),
  // or any other host. All derived URIs must be registered in Spotify Dashboard.
  const proto = req.headers["x-forwarded-proto"] || (req.socket.encrypted ? "https" : "http");
  const host = req.headers["x-forwarded-host"] || req.headers.host || "";
  const derivedRedirectUri = host ? `${proto}://${host}/auth/callback` : state.spotify.redirectUri;

  const oauthPending = {
    state: createAuthState(),
    redirectUri: derivedRedirectUri,
    returnPath: state.oauthReturnPath,
    expiresAt: Date.now() + 10 * 60 * 1000
  };

  state.oauthState = oauthPending.state;
  state.oauthDerivedRedirectUri = derivedRedirectUri;

  try {
    const dir = path.dirname(OAUTH_PENDING_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(OAUTH_PENDING_PATH, JSON.stringify(oauthPending), "utf8");
  } catch { /* non-fatal */ }

  const authorizeUrl = createAuthorizeUrl({
    clientId: state.spotify.clientId,
    redirectUri: derivedRedirectUri,
    state: oauthPending.state
  });

  res.redirect(authorizeUrl);
});

app.get("/auth/callback", async (req, res) => {
  try {
    // Recover pending OAuth state from disk in case the server restarted
    // between /auth/login and the Spotify callback.
    if (!state.oauthState && fs.existsSync(OAUTH_PENDING_PATH)) {
      try {
        const pending = JSON.parse(fs.readFileSync(OAUTH_PENDING_PATH, "utf8"));
        if (pending?.expiresAt > Date.now()) {
          state.oauthState = pending.state;
          state.oauthDerivedRedirectUri = pending.redirectUri;
          state.oauthReturnPath = pending.returnPath || "/";
        }
      } catch { /* non-fatal */ }
    }

    if (req.query.state !== state.oauthState) {
      res.status(400).send("Invalid OAuth state. Please try connecting again.");
      return;
    }

    if (!req.query.code) {
      res.status(400).send("Missing authorization code.");
      return;
    }

    const callbackUri = state.oauthDerivedRedirectUri || state.spotify.redirectUri;
    state.tokens = await exchangeCodeForToken({
      clientId: state.spotify.clientId,
      clientSecret: state.spotify.clientSecret,
      code: req.query.code,
      redirectUri: callbackUri
    });
    saveSpotifyTokens();

    // Clean up pending state file
    state.oauthState = null;
    state.oauthDerivedRedirectUri = null;
    try { if (fs.existsSync(OAUTH_PENDING_PATH)) fs.unlinkSync(OAUTH_PENDING_PATH); } catch { /* non-fatal */ }

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
  saveLocalQueue();
  res.status(201).json({ item, queueLength: state.localQueue.length });
});

app.delete("/api/queue/:id", (req, res) => {
  const before = state.localQueue.length;
  state.localQueue = state.localQueue.filter((item) => item.id !== req.params.id);
  const removed = before !== state.localQueue.length;
  if (removed) saveLocalQueue();
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

    saveLocalQueue();
    res.json({ ok: true, item });
  } catch (error) {
    state.localQueue.unshift(item);
    saveLocalQueue();
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
    const addedCount = Array.isArray(added) ? added.length : 0;
    if (addedCount === 0) {
      res.status(502).json({
        error: "No tracks from this playlist could be resolved by Mopidy. Check Spotify connection and retry.",
        playlistUri: uri,
        requested: uris.length,
        added: 0
      });
      return;
    }
    res.json({ ok: true, added: addedCount });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  loadSpotifyTokens();
  console.log(`Jukebox server running at ${BASE_URL}`);
});

// ── System config (timezone) ──────────────────────────────────────────────────

function loadSystemConfig() {
  try {
    if (!fs.existsSync(SYSTEM_CONFIG_PATH)) return;
    const text = fs.readFileSync(SYSTEM_CONFIG_PATH, "utf8");
    const config = JSON.parse(text);
    if (config.serverTimezone) {
      setActiveTimezone(config.serverTimezone);
    }
  } catch (err) {
    console.warn(`Failed to load system config: ${err.message}`);
  }
}

function saveSystemConfig() {
  const dir = path.dirname(SYSTEM_CONFIG_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(SYSTEM_CONFIG_PATH, JSON.stringify({ serverTimezone: getActiveTimezone() }, null, 2), "utf8");
}

app.get("/api/admin/settings/system", requireAdmin, (_req, res) => {
  const now = new Date();
  const tz = getActiveTimezone();
  res.json({
    ok: true,
    serverTimezone: tz,
    serverTime: now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: tz }),
    serverDate: now.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: tz })
  });
});

app.patch("/api/admin/settings/system", requireAdmin, (req, res) => {
  const { serverTimezone } = req.body || {};
  if (!serverTimezone) return res.status(400).json({ error: "serverTimezone is required." });
  try {
    setActiveTimezone(`${serverTimezone}`.trim());
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
  saveSystemConfig();
  const now = new Date();
  const tz = getActiveTimezone();
  res.json({
    ok: true,
    serverTimezone: tz,
    serverTime: now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: tz }),
    serverDate: now.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: tz })
  });
});

app.get("/api/admin/settings/email", requireAdmin, (_req, res) => {
  res.json({ ok: true, smtp: getSmtpStatus() });
});

app.patch("/api/admin/settings/email", requireAdmin, async (req, res) => {
  const body = req.body || {};

  const host = body.host !== undefined ? `${body.host || ""}`.trim() : `${process.env.SMTP_HOST || ""}`.trim();
  const rawPort = body.port !== undefined ? Number(body.port) : Number(process.env.SMTP_PORT || 587);
  const port = Number.isFinite(rawPort) ? Math.max(1, Math.min(65535, rawPort)) : 587;
  const secure = body.secure !== undefined
    ? Boolean(body.secure)
    : `${process.env.SMTP_SECURE || "false"}`.toLowerCase() === "true";
  const requireTls = body.requireTls !== undefined
    ? Boolean(body.requireTls)
    : `${process.env.SMTP_REQUIRE_TLS || "false"}`.toLowerCase() === "true";
  const user = body.user !== undefined ? `${body.user || ""}`.trim() : `${process.env.SMTP_USER || ""}`.trim();
  const pass = body.pass !== undefined ? `${body.pass || ""}` : `${process.env.SMTP_PASS || ""}`;
  const from = body.from !== undefined ? `${body.from || ""}`.trim() : `${process.env.SMTP_FROM || ""}`.trim();
  const replyTo = body.replyTo !== undefined ? `${body.replyTo || ""}`.trim() : `${process.env.SMTP_REPLY_TO || ""}`.trim();
  const pool = body.pool !== undefined
    ? Boolean(body.pool)
    : `${process.env.SMTP_POOL || "true"}`.toLowerCase() !== "false";

  if (!host) {
    res.status(400).json({ error: "SMTP host is required." });
    return;
  }
  if (!from || !isValidEmailUsername(from)) {
    res.status(400).json({ error: "SMTP from address must be a valid email." });
    return;
  }
  if (replyTo && !isValidEmailUsername(replyTo)) {
    res.status(400).json({ error: "SMTP reply-to address must be a valid email." });
    return;
  }

  process.env.SMTP_HOST = host;
  process.env.SMTP_PORT = `${port}`;
  process.env.SMTP_SECURE = secure ? "true" : "false";
  process.env.SMTP_REQUIRE_TLS = requireTls ? "true" : "false";
  process.env.SMTP_USER = user;
  process.env.SMTP_PASS = pass;
  process.env.SMTP_FROM = from;
  process.env.SMTP_REPLY_TO = replyTo;
  process.env.SMTP_POOL = pool ? "true" : "false";

  persistEnvSetting("SMTP_HOST", process.env.SMTP_HOST);
  persistEnvSetting("SMTP_PORT", process.env.SMTP_PORT);
  persistEnvSetting("SMTP_SECURE", process.env.SMTP_SECURE);
  persistEnvSetting("SMTP_REQUIRE_TLS", process.env.SMTP_REQUIRE_TLS);
  persistEnvSetting("SMTP_USER", process.env.SMTP_USER);
  persistEnvSetting("SMTP_PASS", process.env.SMTP_PASS);
  persistEnvSetting("SMTP_FROM", process.env.SMTP_FROM);
  persistEnvSetting("SMTP_REPLY_TO", process.env.SMTP_REPLY_TO);
  persistEnvSetting("SMTP_POOL", process.env.SMTP_POOL);

  resetSmtpTransport();

  const verifyNow = body.verifyNow === true;
  if (verifyNow) {
    try {
      await verifySmtpConnection();
    } catch (error) {
      res.status(400).json({
        error: `SMTP settings saved but verification failed: ${error.message || "Unknown error"}`,
        smtp: getSmtpStatus()
      });
      return;
    }
  }

  res.json({ ok: true, smtp: getSmtpStatus(), verified: verifyNow });
});

app.post("/api/admin/settings/email/verify", requireAdmin, async (_req, res) => {
  try {
    await verifySmtpConnection();
    res.json({ ok: true, smtp: getSmtpStatus() });
  } catch (error) {
    res.status(400).json({ error: error.message || "SMTP verification failed.", smtp: getSmtpStatus() });
  }
});

app.post("/api/admin/settings/email/test", requireAdmin, async (req, res) => {
  const to = `${req.body?.to || ""}`.trim().toLowerCase();
  if (!to || !isValidEmailUsername(to)) {
    res.status(400).json({ error: "A valid to address is required." });
    return;
  }

  const subject = `${req.body?.subject || "HSNBA SMTP test email"}`.trim().slice(0, 200) || "HSNBA SMTP test email";
  const bodyText = `${req.body?.message || ""}`.trim() || `SMTP test email sent at ${new Date().toISOString()} from ${BASE_URL}`;

  try {
    const result = await sendSystemEmail({
      to,
      subject,
      text: bodyText
    });
    res.json({ ok: true, ...result, smtp: getSmtpStatus() });
  } catch (error) {
    res.status(400).json({ error: error.message || "Failed to send test email.", smtp: getSmtpStatus() });
  }
});
