// GIS Reports — dynamic ASM report mapper
// Shares GIS overlay logic with admin-animal-control-heatmap.js

const FILTER_DISTRICT_OUTSIDE = "__outside__";
const FILTER_OVERLAY_OUTSIDE_PREFIX = "__outside__:";

const els = {
  logoutBtn: document.getElementById("logoutBtn"),
  reportTitle: document.getElementById("reportTitle"),
  saveReportNameBtn: document.getElementById("saveReportNameBtn"),
  reportTitleCustomWrap: document.getElementById("reportTitleCustomWrap"),
  reportTitleCustom: document.getElementById("reportTitleCustom"),
  probeBtn: document.getElementById("probeBtn"),
  probeStatus: document.getElementById("probeStatus"),
  fieldMapSection: document.getElementById("fieldMapSection"),
  gisFieldList: document.getElementById("gisFieldList"),
  gisFieldAddSelect: document.getElementById("gisFieldAddSelect"),
  gisFieldAddBtn: document.getElementById("gisFieldAddBtn"),
  fromDate: document.getElementById("fromDate"),
  toDate: document.getElementById("toDate"),
  fromDateWrap: document.getElementById("fromDateWrap"),
  toDateWrap: document.getElementById("toDateWrap"),
  runBtn: document.getElementById("runBtn"),
  gisLoadingOverlay: document.getElementById("gisLoadingOverlay"),
  gisLoadingMessage: document.getElementById("gisLoadingMessage"),
  metaText: document.getElementById("metaText"),
  mapCard: document.getElementById("mapCard"),
  reportCard: document.getElementById("reportCard"),
  reportFilters: document.getElementById("reportFilters"),
  filterSearch: document.getElementById("filterSearch"),
  filterDistrict: document.getElementById("filterDistrict"),
  filterMapStatus: document.getElementById("filterMapStatus"),
  filterInViewOnly: document.getElementById("filterInViewOnly"),
  clearFiltersBtn: document.getElementById("clearFiltersBtn"),
  filterMeta: document.getElementById("filterMeta"),
  resultsReport: document.getElementById("resultsReport"),
  printReportBtn: document.getElementById("printReportBtn"),
  exportCsvBtn: document.getElementById("exportCsvBtn"),
  districtOverlayToggle: document.getElementById("districtOverlayToggle"),
  commissionerOverlayToggle: document.getElementById("commissionerOverlayToggle"),
  votingOverlayToggle: document.getElementById("votingOverlayToggle"),
  guadalupeOverlayToggle: document.getElementById("guadalupeOverlayToggle"),
  districtOverlayMeta: document.getElementById("districtOverlayMeta"),
  displayOptionsToggle: document.getElementById("displayOptionsToggle"),
  displayOptionsPanel: document.getElementById("displayOptionsPanel"),
  districtColorControls: document.getElementById("districtColorControls"),
  saveDisplayDefaultsBtn: document.getElementById("saveDisplayDefaultsBtn"),
  resetDisplayOptionsBtn: document.getElementById("resetDisplayOptionsBtn"),
  districtGeoJsonUpload: document.getElementById("districtGeoJsonUpload"),
  uploadDistrictGeoJsonBtn: document.getElementById("uploadDistrictGeoJsonBtn"),
  commissionerGeoJsonUpload: document.getElementById("commissionerGeoJsonUpload"),
  uploadCommissionerGeoJsonBtn: document.getElementById("uploadCommissionerGeoJsonBtn"),
  votingGeoJsonUpload: document.getElementById("votingGeoJsonUpload"),
  uploadVotingGeoJsonBtn: document.getElementById("uploadVotingGeoJsonBtn"),
  guadalupeGeoJsonUpload: document.getElementById("guadalupeGeoJsonUpload"),
  uploadGuadalupeGeoJsonBtn: document.getElementById("uploadGuadalupeGeoJsonBtn"),
  commissionerOptionsSection: document.getElementById("commissionerOptionsSection"),
  votingOptionsSection: document.getElementById("votingOptionsSection"),
  guadalupeOptionsSection: document.getElementById("guadalupeOptionsSection"),
  commissionerUploadSection: document.getElementById("commissionerUploadSection"),
  votingUploadSection: document.getElementById("votingUploadSection"),
  guadalupeUploadSection: document.getElementById("guadalupeUploadSection"),
  districtUploadMeta: document.getElementById("districtUploadMeta"),
  commissionerUploadMeta: document.getElementById("commissionerUploadMeta"),
  votingUploadMeta: document.getElementById("votingUploadMeta"),
  guadalupeUploadMeta: document.getElementById("guadalupeUploadMeta"),
  displayOptionsMeta: document.getElementById("displayOptionsMeta"),
  markerBorderColor: document.getElementById("markerBorderColor"),
  markerFillColor: document.getElementById("markerFillColor"),
  districtTitleField: document.getElementById("districtTitleField"),
  districtTitleToggle: document.getElementById("districtTitleToggle"),
  commissionerBorderColor: document.getElementById("commissionerBorderColor"),
  commissionerFillColor: document.getElementById("commissionerFillColor"),
  commissionerTitleField: document.getElementById("commissionerTitleField"),
  commissionerTitleToggle: document.getElementById("commissionerTitleToggle"),
  votingBorderColor: document.getElementById("votingBorderColor"),
  votingFillColor: document.getElementById("votingFillColor"),
  votingTitleField: document.getElementById("votingTitleField"),
  votingTitleToggle: document.getElementById("votingTitleToggle"),
  guadalupeBorderColor: document.getElementById("guadalupeBorderColor"),
  guadalupeFillColor: document.getElementById("guadalupeFillColor"),
  guadalupeTitleField: document.getElementById("guadalupeTitleField"),
  guadalupeTitleToggle: document.getElementById("guadalupeTitleToggle")
};

let map;
let baseTileLayer;
let markerLayer;
let districtLayer;
let districtLayerLoadPromise;
let districtGeoJsonData = null;
let commissionerLayer;
let commissionerLayerLoadPromise;
let commissionerGeoJsonData = null;
let votingLayer;
let votingLayerLoadPromise;
let votingGeoJsonData = null;
let guadalupeLayer;
let guadalupeLayerLoadPromise;
let guadalupeGeoJsonData = null;
let latestMapData = null;
let latestFilteredRecords = [];
let availableProbeFields = [];
let gisDragSrcRow = null;
let canSaveReportName = false;

const DEFAULT_DISTRICT_COLOR = "#4dd8ff";
const GIS_MIN_ZOOM = 10;
const DISTRICT_PALETTE = [
  "#4dd8ff",
  "#ff8a3d",
  "#70d46f",
  "#ffd166",
  "#c287ff",
  "#ff6f91",
  "#49dcb1",
  "#ffb703"
];
const DEFAULT_MARKER_BORDER = "#f5a623";
const DEFAULT_MARKER_FILL = "#f06a6a";
const MAP_RENDER_YIELD_MS = 60;
const DISPLAY_DEFAULTS_STORAGE_KEY = "hsnba.gis.reports.display.defaults.v1";
const GIS_SAVED_REPORTS_STORAGE_KEY = "hsnba.gis.saved.reports.v1";
const DEFAULT_SAVED_REPORTS = [
  "Cats TNR'd for Map",
  "Microchipped Non-shelter Animals",
  "Owner Requested End of Life Services"
];

const DISTRICT_OVERLAY = {
  fileUrl: "/GIS/City_Council_Districts.geojson",
  fallbackFileUrl: "/gis/city-council-districts.geojson",
  fallbackNameKeys: ["DISTRICT", "District", "district", "NAME", "Name", "name", "LABEL", "Label", "label"],
  districtKeyKeys: ["District", "DISTRICT", "district", "NAME", "Name", "name", "LABEL", "Label", "label"],
  districtColors: {},
  districtOrder: [],
  showTitle: true,
  titleField: "auto"
};

const COMMISSIONER_OVERLAY = {
  fileUrl: "/GIS/Commissioner_Precincts_Open_Data.geojson",
  fallbackFileUrl: "/gis/commissioner-precincts.geojson",
  fallbackNameKeys: ["Precinct", "PRECINCT", "PCT", "Name", "NAME", "LABEL", "label"],
  districtKeyKeys: ["Precinct", "PRECINCT", "PCT", "Name", "NAME", "LABEL", "label"],
  showTitle: true,
  titleField: "auto",
  borderColor: "#4b8fd9",
  fillColor: "#4b8fd9"
};

const VOTING_OVERLAY = {
  fileUrl: "/GIS/Voting_Precincts_Open_Data.geojson",
  fallbackFileUrl: "/gis/voting-precincts.geojson",
  fallbackNameKeys: ["Precinct", "PRECINCT", "PCT", "Name", "NAME", "LABEL", "label"],
  districtKeyKeys: ["Precinct", "PRECINCT", "PCT", "Name", "NAME", "LABEL", "label"],
  showTitle: true,
  titleField: "auto",
  borderColor: "#7f60d9",
  fillColor: "#7f60d9"
};

const GUADALUPE_OVERLAY = {
  fileUrl: "/gis/guadalupe-precincts.geojson",
  fallbackFileUrl: "/GIS/Precincts_guadalupe.geojson",
  fallbackNameKeys: ["PrecinctNumber", "Precinct", "PRECINCT", "PCT", "CommissionerName", "Name", "NAME", "label"],
  districtKeyKeys: ["PrecinctNumber", "Precinct", "PRECINCT", "PCT", "Name", "NAME", "label"],
  showTitle: true,
  titleField: "auto",
  borderColor: "#2ca58d",
  fillColor: "#2ca58d"
};

const MARKER_STYLE = {
  borderColor: DEFAULT_MARKER_BORDER,
  fillColor: DEFAULT_MARKER_FILL
};

async function api(url, opts = {}) {
  const response = await fetch(url, {
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...(opts.headers || {})
    },
    ...opts
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || `HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return payload;
}

async function ensureAuth() {
  try {
    await api("/api/admin/account/me");
  } catch (error) {
    if (error.status === 401 || error.status === 403) {
      window.location.replace("/reporting-login.html");
      return false;
    }
    throw error;
  }
  return true;
}

function esc(value) {
  if (window.RC?.esc) return window.RC.esc(value);
  return `${value ?? ""}`
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function isHexColor(value) {
  return /^#[0-9a-f]{6}$/i.test(`${value || ""}`.trim());
}

function stripHtml(value) {
  const str = `${value ?? ""}`;
  if (!str.includes("<")) return str;
  const tmp = document.createElement("div");
  tmp.innerHTML = str;
  return tmp.textContent || tmp.innerText || "";
}

function normalizeText(value) {
  return stripHtml(value)
    .replace(/\s+/g, " ")
    .trim();
}

function buildRowFieldReader(row) {
  const normalizedKeyMap = new Map();
  const lowerKeyMap = new Map();
  for (const [key, value] of Object.entries(row || {})) {
    const keyText = `${key || ""}`;
    lowerKeyMap.set(keyText.toLowerCase(), value);
    normalizedKeyMap.set(keyText.toLowerCase().replace(/[^a-z0-9]/g, ""), value);
  }

  const getRawField = (key) => {
    const direct = (row || {})[key];
    if (direct !== undefined && direct !== null) return direct;
    const normalizedKey = `${key}`.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (normalizedKeyMap.has(normalizedKey)) return normalizedKeyMap.get(normalizedKey);
    return lowerKeyMap.get(`${key}`.toLowerCase());
  };

  const getField = (key) => normalizeText(getRawField(key));
  return { getRawField, getField };
}

function toFriendlyFieldLabel(key) {
  return `${key || ""}`
    .replace(/_/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\b(id|url|asm|dob|tnr)\b/gi, (token) => token.toUpperCase())
    .replace(/\s+/g, " ")
    .trim();
}

function sanitizeReportNames(rawNames) {
  const seen = new Set();
  const result = [];
  for (const name of rawNames || []) {
    const value = `${name || ""}`.trim();
    if (!value) continue;
    const canonical = value.toLowerCase();
    if (seen.has(canonical)) continue;
    seen.add(canonical);
    result.push(value);
  }
  return result;
}

function loadSavedReportNames() {
  try {
    const raw = localStorage.getItem(GIS_SAVED_REPORTS_STORAGE_KEY);
    if (!raw) return [...DEFAULT_SAVED_REPORTS];
    const parsed = JSON.parse(raw);
    const merged = sanitizeReportNames([...(Array.isArray(parsed) ? parsed : []), ...DEFAULT_SAVED_REPORTS]);
    return merged.length ? merged : [...DEFAULT_SAVED_REPORTS];
  } catch {
    return [...DEFAULT_SAVED_REPORTS];
  }
}

function persistSavedReportNames(reportNames) {
  const normalized = sanitizeReportNames(reportNames);
  localStorage.setItem(GIS_SAVED_REPORTS_STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
}

function populateSavedReportDropdown({ selected = "" } = {}) {
  if (!els.reportTitle) return;
  const reportNames = loadSavedReportNames();
  const options = ['<option value=""> Add a report Here --> </option>', ...reportNames.map((name) => `<option value="${esc(name)}">${esc(name)}</option>`)];
  els.reportTitle.innerHTML = options.join("");
  if (selected && reportNames.some((name) => name.toLowerCase() === selected.toLowerCase())) {
    els.reportTitle.value = reportNames.find((name) => name.toLowerCase() === selected.toLowerCase()) || "";
  }
}

function setCanSaveReportName(value) {
  canSaveReportName = Boolean(value);
  if (els.saveReportNameBtn) {
    els.saveReportNameBtn.disabled = !canSaveReportName;
  }
}

function saveCurrentReportName() {
  if (!canSaveReportName) {
    els.probeStatus.textContent = "Load fields successfully before saving the report name.";
    return;
  }
  const reportName = `${els.reportTitleCustom?.value || ""}`.trim();
  if (!reportName) {
    els.probeStatus.textContent = "Enter a Report Name first.";
    return;
  }
  const saved = persistSavedReportNames([reportName, ...loadSavedReportNames()]);
  populateSavedReportDropdown({ selected: reportName });
  if (els.reportTitle) {
    const matched = saved.find((name) => name.toLowerCase() === reportName.toLowerCase()) || reportName;
    els.reportTitle.value = matched;
  }
  els.probeStatus.textContent = `Saved report name: ${reportName}`;
}

function getEffectiveReportTitle() {
  const manual = `${els.reportTitleCustom?.value || ""}`.trim();
  if (manual) return manual;
  return `${els.reportTitle?.value || ""}`.trim();
}

function getCurrentFieldConfig() {
  const fields = readGisFieldRows();
  const mappedAddressField = fields.find((field) => field.mappedAddress)?.key || "";
  const mappedDateField = fields.find((field) => field.mappedDate)?.key || "";
  const titleField = fields[0]?.key || "";
  return {
    sourceType: "json_report",
    reportTitle: getEffectiveReportTitle(),
    addressField: mappedAddressField,
    labelField: titleField,
    dateField: mappedDateField,
    fields
  };
}

function getCurrentReportHeading() {
  const { reportTitle } = getCurrentFieldConfig();
  return reportTitle || "ASM Saved Report";
}

function initMap() {
  if (map) return;
  map = L.map("gisMap", {
    center: [29.703, -98.124],
    zoom: 12,
    minZoom: GIS_MIN_ZOOM,
    zoomControl: true
  });

  baseTileLayer = L.tileLayer("/tile-proxy/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; <a href=\"https://www.openstreetmap.org/copyright\">OpenStreetMap</a> contributors",
    crossOrigin: "anonymous"
  }).addTo(map);

  markerLayer = L.layerGroup().addTo(map);

  map.on("moveend zoomend", () => {
    if (els.filterInViewOnly?.checked) {
      renderReportFromLatestData();
    }
  });

  if (els.districtOverlayToggle?.checked) {
    ensureDistrictLayer();
  }
}

function setDistrictOverlayMeta(message) {
  if (els.districtOverlayMeta) els.districtOverlayMeta.textContent = message || "";
}

function setDistrictUploadMeta(message) {
  if (els.districtUploadMeta) els.districtUploadMeta.textContent = message || "";
}

function setDisplayOptionsMeta(message) {
  if (els.displayOptionsMeta) els.displayOptionsMeta.textContent = message || "";
}

function getBuiltInDisplayDefaults() {
  return {
    markerBorderColor: DEFAULT_MARKER_BORDER,
    markerFillColor: DEFAULT_MARKER_FILL,
    districtTitleField: "auto",
    districtTitleToggle: true,
    districtColors: {},
    commissionerBorderColor: COMMISSIONER_OVERLAY.borderColor,
    commissionerFillColor: COMMISSIONER_OVERLAY.fillColor,
    commissionerTitleField: "auto",
    commissionerTitleToggle: true,
    votingBorderColor: VOTING_OVERLAY.borderColor,
    votingFillColor: VOTING_OVERLAY.fillColor,
    votingTitleField: "auto",
    votingTitleToggle: true,
    guadalupeBorderColor: GUADALUPE_OVERLAY.borderColor,
    guadalupeFillColor: GUADALUPE_OVERLAY.fillColor,
    guadalupeTitleField: "auto",
    guadalupeTitleToggle: true
  };
}

function sanitizeDisplayDefaults(raw) {
  const defaults = getBuiltInDisplayDefaults();
  if (!raw || typeof raw !== "object") return defaults;

  const districtColors = {};
  for (const [key, value] of Object.entries(raw.districtColors || {})) {
    const districtKey = `${key || ""}`.trim();
    const districtColor = `${value || ""}`.trim();
    if (!districtKey || !isHexColor(districtColor)) continue;
    districtColors[districtKey] = districtColor;
  }

  const titleField = `${raw.districtTitleField || "auto"}`.trim() || "auto";
  return {
    markerBorderColor: isHexColor(raw.markerBorderColor) ? raw.markerBorderColor : defaults.markerBorderColor,
    markerFillColor: isHexColor(raw.markerFillColor) ? raw.markerFillColor : defaults.markerFillColor,
    districtTitleField: titleField,
    districtTitleToggle: Boolean(raw.districtTitleToggle),
    districtColors,
    commissionerBorderColor: isHexColor(raw.commissionerBorderColor) ? raw.commissionerBorderColor : defaults.commissionerBorderColor,
    commissionerFillColor: isHexColor(raw.commissionerFillColor) ? raw.commissionerFillColor : defaults.commissionerFillColor,
    commissionerTitleField: `${raw.commissionerTitleField || "auto"}`.trim() || "auto",
    commissionerTitleToggle: raw.commissionerTitleToggle === undefined ? defaults.commissionerTitleToggle : Boolean(raw.commissionerTitleToggle),
    votingBorderColor: isHexColor(raw.votingBorderColor) ? raw.votingBorderColor : defaults.votingBorderColor,
    votingFillColor: isHexColor(raw.votingFillColor) ? raw.votingFillColor : defaults.votingFillColor,
    votingTitleField: `${raw.votingTitleField || "auto"}`.trim() || "auto",
    votingTitleToggle: raw.votingTitleToggle === undefined ? defaults.votingTitleToggle : Boolean(raw.votingTitleToggle),
    guadalupeBorderColor: isHexColor(raw.guadalupeBorderColor) ? raw.guadalupeBorderColor : defaults.guadalupeBorderColor,
    guadalupeFillColor: isHexColor(raw.guadalupeFillColor) ? raw.guadalupeFillColor : defaults.guadalupeFillColor,
    guadalupeTitleField: `${raw.guadalupeTitleField || "auto"}`.trim() || "auto",
    guadalupeTitleToggle: raw.guadalupeTitleToggle === undefined ? defaults.guadalupeTitleToggle : Boolean(raw.guadalupeTitleToggle)
  };
}

function getCurrentDisplayDefaults() {
  return sanitizeDisplayDefaults({
    markerBorderColor: MARKER_STYLE.borderColor,
    markerFillColor: MARKER_STYLE.fillColor,
    districtTitleField: DISTRICT_OVERLAY.titleField,
    districtTitleToggle: DISTRICT_OVERLAY.showTitle,
    districtColors: DISTRICT_OVERLAY.districtColors,
    commissionerBorderColor: COMMISSIONER_OVERLAY.borderColor,
    commissionerFillColor: COMMISSIONER_OVERLAY.fillColor,
    commissionerTitleField: COMMISSIONER_OVERLAY.titleField,
    commissionerTitleToggle: COMMISSIONER_OVERLAY.showTitle,
    votingBorderColor: VOTING_OVERLAY.borderColor,
    votingFillColor: VOTING_OVERLAY.fillColor,
    votingTitleField: VOTING_OVERLAY.titleField,
    votingTitleToggle: VOTING_OVERLAY.showTitle,
    guadalupeBorderColor: GUADALUPE_OVERLAY.borderColor,
    guadalupeFillColor: GUADALUPE_OVERLAY.fillColor,
    guadalupeTitleField: GUADALUPE_OVERLAY.titleField,
    guadalupeTitleToggle: GUADALUPE_OVERLAY.showTitle
  });
}

function applyDisplayDefaults(defaults, { rerenderMap = true } = {}) {
  const normalized = sanitizeDisplayDefaults(defaults);

  MARKER_STYLE.borderColor = normalized.markerBorderColor;
  MARKER_STYLE.fillColor = normalized.markerFillColor;
  DISTRICT_OVERLAY.showTitle = normalized.districtTitleToggle;
  DISTRICT_OVERLAY.titleField = normalized.districtTitleField;
  DISTRICT_OVERLAY.districtColors = { ...normalized.districtColors };
  COMMISSIONER_OVERLAY.borderColor = normalized.commissionerBorderColor;
  COMMISSIONER_OVERLAY.fillColor = normalized.commissionerFillColor;
  COMMISSIONER_OVERLAY.titleField = normalized.commissionerTitleField;
  COMMISSIONER_OVERLAY.showTitle = normalized.commissionerTitleToggle;
  VOTING_OVERLAY.borderColor = normalized.votingBorderColor;
  VOTING_OVERLAY.fillColor = normalized.votingFillColor;
  VOTING_OVERLAY.titleField = normalized.votingTitleField;
  VOTING_OVERLAY.showTitle = normalized.votingTitleToggle;
  GUADALUPE_OVERLAY.borderColor = normalized.guadalupeBorderColor;
  GUADALUPE_OVERLAY.fillColor = normalized.guadalupeFillColor;
  GUADALUPE_OVERLAY.titleField = normalized.guadalupeTitleField;
  GUADALUPE_OVERLAY.showTitle = normalized.guadalupeTitleToggle;

  if (els.markerBorderColor) els.markerBorderColor.value = normalized.markerBorderColor;
  if (els.markerFillColor) els.markerFillColor.value = normalized.markerFillColor;
  if (els.districtTitleToggle) els.districtTitleToggle.checked = normalized.districtTitleToggle;
  if (els.districtTitleField) els.districtTitleField.value = normalized.districtTitleField;
  if (els.commissionerBorderColor) els.commissionerBorderColor.value = normalized.commissionerBorderColor;
  if (els.commissionerFillColor) els.commissionerFillColor.value = normalized.commissionerFillColor;
  if (els.commissionerTitleField) els.commissionerTitleField.value = normalized.commissionerTitleField;
  if (els.commissionerTitleToggle) els.commissionerTitleToggle.checked = normalized.commissionerTitleToggle;
  if (els.votingBorderColor) els.votingBorderColor.value = normalized.votingBorderColor;
  if (els.votingFillColor) els.votingFillColor.value = normalized.votingFillColor;
  if (els.votingTitleField) els.votingTitleField.value = normalized.votingTitleField;
  if (els.votingTitleToggle) els.votingTitleToggle.checked = normalized.votingTitleToggle;
  if (els.guadalupeBorderColor) els.guadalupeBorderColor.value = normalized.guadalupeBorderColor;
  if (els.guadalupeFillColor) els.guadalupeFillColor.value = normalized.guadalupeFillColor;
  if (els.guadalupeTitleField) els.guadalupeTitleField.value = normalized.guadalupeTitleField;
  if (els.guadalupeTitleToggle) els.guadalupeTitleToggle.checked = normalized.guadalupeTitleToggle;

  populateCountyTitleFieldOptions("commissioner", { preferredValue: normalized.commissionerTitleField });
  populateCountyTitleFieldOptions("voting", { preferredValue: normalized.votingTitleField });
  populateCountyTitleFieldOptions("guadalupe", { preferredValue: normalized.guadalupeTitleField });

  renderDistrictColorControls();
  updateCountyOverlayOptionsVisibility();
  if (rerenderMap) {
    applyDisplayOptions();
  } else {
    updateDisplayOptionsFromInputs();
  }
}

function loadSavedDisplayDefaults() {
  try {
    const raw = localStorage.getItem(DISPLAY_DEFAULTS_STORAGE_KEY);
    if (!raw) return null;
    return sanitizeDisplayDefaults(JSON.parse(raw));
  } catch {
    return null;
  }
}

function saveCurrentAsDisplayDefaults() {
  updateDisplayOptionsFromInputs();
  const current = getCurrentDisplayDefaults();
  localStorage.setItem(DISPLAY_DEFAULTS_STORAGE_KEY, JSON.stringify(current));
  setDisplayOptionsMeta("Current display settings saved as defaults.");
}

function resetDisplayOptions() {
  const savedDefaults = loadSavedDisplayDefaults();
  if (savedDefaults) {
    applyDisplayDefaults(savedDefaults);
    setDisplayOptionsMeta("Display settings reset to saved defaults.");
    return;
  }
  applyDisplayDefaults(getBuiltInDisplayDefaults());
  setDisplayOptionsMeta("Display settings reset to built-in defaults.");
}

function getDistrictKey(properties = {}) {
  for (const key of DISTRICT_OVERLAY.districtKeyKeys) {
    const value = properties[key];
    if (value != null && `${value}`.trim()) return `${value}`.trim();
  }
  return "District";
}

function getDistrictLabel(properties = {}) {
  if (DISTRICT_OVERLAY.titleField && DISTRICT_OVERLAY.titleField !== "auto") {
    const selected = properties[DISTRICT_OVERLAY.titleField];
    if (selected != null && `${selected}`.trim()) return `${selected}`.trim();
  }
  for (const key of DISTRICT_OVERLAY.fallbackNameKeys) {
    const value = properties[key];
    if (value != null && `${value}`.trim()) return `${value}`.trim();
  }
  return "District";
}

function getDistrictColorByKey(key, index = 0) {
  const existing = DISTRICT_OVERLAY.districtColors[key];
  if (existing) return existing;
  return DISTRICT_PALETTE[index % DISTRICT_PALETTE.length] || DEFAULT_DISTRICT_COLOR;
}

function getDistrictStyle(feature) {
  const properties = feature?.properties || {};
  const districtKey = getDistrictKey(properties);
  const index = Math.max(0, DISTRICT_OVERLAY.districtOrder.indexOf(districtKey));
  const color = getDistrictColorByKey(districtKey, index);
  return {
    color,
    weight: 2,
    fillColor: color,
    fillOpacity: 0.06,
    opacity: 0.9
  };
}

function buildDistrictOrderFromGeoJson(geojson) {
  const set = new Set();
  const features = Array.isArray(geojson?.features) ? geojson.features : [];
  for (const feature of features) {
    const key = getDistrictKey(feature?.properties || {});
    if (key) set.add(key);
  }
  const keys = Array.from(set);
  keys.sort((a, b) => {
    const aNum = Number(a);
    const bNum = Number(b);
    if (Number.isFinite(aNum) && Number.isFinite(bNum)) return aNum - bNum;
    return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
  });
  DISTRICT_OVERLAY.districtOrder = keys;
}

function renderDistrictColorControls() {
  if (!els.districtColorControls) return;
  if (!DISTRICT_OVERLAY.districtOrder.length) {
    els.districtColorControls.innerHTML = '<span class="meta">District colors will appear after overlay loads.</span>';
    return;
  }

  const html = DISTRICT_OVERLAY.districtOrder.map((districtKey, index) => {
    const color = getDistrictColorByKey(districtKey, index);
    DISTRICT_OVERLAY.districtColors[districtKey] = color;
    return `<label class="district-color-control">
      <span>${esc(districtKey)}</span>
      <input
        type="color"
        value="${color}"
        data-district-key="${esc(districtKey)}"
        aria-label="Color for district ${esc(districtKey)}"
      />
    </label>`;
  }).join("");

  els.districtColorControls.innerHTML = html;
}

function applyDistrictStyleAndTitle() {
  if (!districtLayer) return;
  districtLayer.setStyle((feature) => getDistrictStyle(feature));
  districtLayer.eachLayer((layer) => {
    const featureProps = layer.feature?.properties || {};
    const label = getDistrictLabel(featureProps);
    if (DISTRICT_OVERLAY.showTitle) {
      layer.bindPopup(`<strong>${esc(label)}</strong>`);
    } else {
      layer.unbindPopup();
    }
  });
}

function getOverlayLabel(overlay, properties = {}) {
  const selectedField = `${overlay.titleField || "auto"}`.trim();
  if (selectedField && selectedField !== "auto") {
    const selected = properties[selectedField];
    if (selected != null && `${selected}`.trim()) return `${selected}`.trim();
  }
  for (const key of overlay.fallbackNameKeys || []) {
    const value = properties[key];
    if (value != null && `${value}`.trim()) return `${value}`.trim();
  }
  return "Area";
}

function getFeaturePropertyText(properties = {}, keys = []) {
  for (const key of keys) {
    const value = properties[key];
    if (value != null && `${value}`.trim()) return `${value}`.trim();
  }
  return "";
}

function collectOverlayPropertyKeys(geojson) {
  const keySet = new Set();
  for (const feature of geojson?.features || []) {
    const properties = feature?.properties;
    if (!properties || typeof properties !== "object") continue;
    for (const key of Object.keys(properties)) {
      const text = `${key || ""}`.trim();
      if (text) keySet.add(text);
    }
  }
  return [...keySet].sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
}

function populateCountyTitleFieldOptions(type, { preferredValue } = {}) {
  const runtime = getCountyOverlayRuntime(type);
  const selectEl = runtime.titleFieldSelect;
  if (!selectEl) return;

  const keys = collectOverlayPropertyKeys(runtime.getGeoJson());
  const selected = `${preferredValue ?? runtime.overlay.titleField ?? selectEl.value ?? "auto"}`.trim() || "auto";
  const normalizedSelected = selected.toLowerCase() === "auto" ? "auto" : selected;

  selectEl.innerHTML = "";
  const autoOption = document.createElement("option");
  autoOption.value = "auto";
  autoOption.textContent = "Auto (recommended)";
  selectEl.appendChild(autoOption);

  const known = new Set(["auto"]);
  for (const key of keys) {
    const option = document.createElement("option");
    option.value = key;
    option.textContent = key;
    selectEl.appendChild(option);
    known.add(key);
  }

  if (normalizedSelected !== "auto" && !known.has(normalizedSelected)) {
    const savedOption = document.createElement("option");
    savedOption.value = normalizedSelected;
    savedOption.textContent = `${normalizedSelected} (saved)`;
    selectEl.appendChild(savedOption);
  }

  selectEl.value = normalizedSelected;
  runtime.overlay.titleField = normalizedSelected;
}

function getCountyOverlayRuntime(type) {
  if (type === "commissioner") {
    return {
      overlay: COMMISSIONER_OVERLAY,
      getLayer: () => commissionerLayer,
      setLayer: (value) => { commissionerLayer = value; },
      getLoadPromise: () => commissionerLayerLoadPromise,
      setLoadPromise: (value) => { commissionerLayerLoadPromise = value; },
      getGeoJson: () => commissionerGeoJsonData,
      setGeoJson: (value) => { commissionerGeoJsonData = value; },
      toggle: els.commissionerOverlayToggle,
      uploadMeta: els.commissionerUploadMeta,
      uploadInput: els.commissionerGeoJsonUpload,
      titleFieldSelect: els.commissionerTitleField,
      uploadButton: els.uploadCommissionerGeoJsonBtn,
      uploadUrl: "/api/admin/reporting/gis-commissioner-districts",
      typeLabel: "Commissioner precinct"
    };
  }
  if (type === "guadalupe") {
    return {
      overlay: GUADALUPE_OVERLAY,
      getLayer: () => guadalupeLayer,
      setLayer: (value) => { guadalupeLayer = value; },
      getLoadPromise: () => guadalupeLayerLoadPromise,
      setLoadPromise: (value) => { guadalupeLayerLoadPromise = value; },
      getGeoJson: () => guadalupeGeoJsonData,
      setGeoJson: (value) => { guadalupeGeoJsonData = value; },
      toggle: els.guadalupeOverlayToggle,
      uploadMeta: els.guadalupeUploadMeta,
      uploadInput: els.guadalupeGeoJsonUpload,
      titleFieldSelect: els.guadalupeTitleField,
      uploadButton: els.uploadGuadalupeGeoJsonBtn,
      uploadUrl: "/api/admin/reporting/gis-guadalupe-precincts",
      typeLabel: "Guadalupe precinct"
    };
  }
  return {
    overlay: VOTING_OVERLAY,
    getLayer: () => votingLayer,
    setLayer: (value) => { votingLayer = value; },
    getLoadPromise: () => votingLayerLoadPromise,
    setLoadPromise: (value) => { votingLayerLoadPromise = value; },
    getGeoJson: () => votingGeoJsonData,
    setGeoJson: (value) => { votingGeoJsonData = value; },
    toggle: els.votingOverlayToggle,
    uploadMeta: els.votingUploadMeta,
    uploadInput: els.votingGeoJsonUpload,
    titleFieldSelect: els.votingTitleField,
    uploadButton: els.uploadVotingGeoJsonBtn,
    uploadUrl: "/api/admin/reporting/gis-voting-precincts",
    typeLabel: "Voting precinct"
  };
}

function updateCountyOverlayOptionsVisibility() {
  const showCommissioner = Boolean(els.commissionerOverlayToggle?.checked);
  const showVoting = Boolean(els.votingOverlayToggle?.checked);
  const showGuadalupe = Boolean(els.guadalupeOverlayToggle?.checked);
  els.commissionerOptionsSection?.toggleAttribute("hidden", !showCommissioner);
  els.votingOptionsSection?.toggleAttribute("hidden", !showVoting);
  els.guadalupeOptionsSection?.toggleAttribute("hidden", !showGuadalupe);
  els.commissionerUploadSection?.toggleAttribute("hidden", !showCommissioner);
  els.votingUploadSection?.toggleAttribute("hidden", !showVoting);
  els.guadalupeUploadSection?.toggleAttribute("hidden", !showGuadalupe);
}

function applyCountyOverlayStyle(type) {
  const runtime = getCountyOverlayRuntime(type);
  const layer = runtime.getLayer();
  if (!layer) return;
  const overlay = runtime.overlay;
  layer.setStyle({
    color: overlay.borderColor,
    weight: 2,
    fillColor: overlay.fillColor,
    fillOpacity: 0.05,
    opacity: 0.9
  });
  layer.eachLayer((child) => {
    const label = getOverlayLabel(overlay, child.feature?.properties || {});
    if (overlay.showTitle) {
      child.bindPopup(`<strong>${esc(label)}</strong>`);
    } else {
      child.unbindPopup();
    }
  });
}

async function ensureCountyOverlayLayer(type) {
  initMap();
  const runtime = getCountyOverlayRuntime(type);
  const existingLayer = runtime.getLayer();
  if (existingLayer) {
    if (runtime.toggle?.checked && !map.hasLayer(existingLayer)) {
      existingLayer.addTo(map);
    }
    return;
  }
  if (runtime.getLoadPromise()) {
    await runtime.getLoadPromise();
    return;
  }

  const promise = (async () => {
    try {
      const overlay = runtime.overlay;
      let response = await fetch(overlay.fileUrl, { credentials: "same-origin" });
      let sourceUrl = overlay.fileUrl;
      if (!response.ok && overlay.fallbackFileUrl) {
        const fallback = await fetch(overlay.fallbackFileUrl, { credentials: "same-origin" });
        if (fallback.ok) {
          response = fallback;
          sourceUrl = overlay.fallbackFileUrl;
        }
      }
      if (!response.ok) {
        throw new Error(`${runtime.typeLabel} overlay file not found at ${overlay.fileUrl}`);
      }

      const geojson = await response.json();
      runtime.setGeoJson(geojson);
  populateCountyTitleFieldOptions(type);
      const layer = L.geoJSON(geojson, {
        style: {
          color: overlay.borderColor,
          weight: 2,
          fillColor: overlay.fillColor,
          fillOpacity: 0.05,
          opacity: 0.9
        },
        onEachFeature: (feature, featureLayer) => {
          if (!overlay.showTitle) return;
          const label = getOverlayLabel(overlay, feature?.properties || {});
          featureLayer.bindPopup(`<strong>${esc(label)}</strong>`);
        }
      });

      runtime.setLayer(layer);
      if (runtime.toggle?.checked) {
        layer.addTo(map);
      }
      applyCountyOverlayStyle(type);
      if (latestMapData) {
        annotateMapDataWithSpatialOverlays(latestMapData);
        renderReportFromLatestData();
      }
      if (runtime.uploadMeta) {
        const featureCount = Array.isArray(geojson?.features) ? geojson.features.length : 0;
        const isVisible = !!(runtime.getLayer() && map && map.hasLayer(runtime.getLayer()));
        runtime.uploadMeta.textContent = `${runtime.typeLabel} overlay loaded from ${sourceUrl} (${featureCount} features, visible: ${isVisible ? "yes" : "no"})`;
      }
    } catch (error) {
      runtime.setGeoJson(null);
      runtime.setLayer(null);
      if (runtime.uploadMeta) {
        runtime.uploadMeta.textContent = error.message || `Failed to load ${runtime.typeLabel} overlay.`;
      }
    } finally {
      runtime.setLoadPromise(null);
    }
  })();

  runtime.setLoadPromise(promise);
  await promise;
}

async function handleCountyOverlayToggle(type) {
  const runtime = getCountyOverlayRuntime(type);
  initMap();
  updateCountyOverlayOptionsVisibility();
  if (!runtime.toggle?.checked) {
    const layer = runtime.getLayer();
    if (layer && map.hasLayer(layer)) {
      map.removeLayer(layer);
    }
    if (runtime.uploadMeta) {
      runtime.uploadMeta.textContent = `${runtime.typeLabel} overlay hidden (toggle off)`;
    }
    return;
  }
  await ensureCountyOverlayLayer(type);
  const layer = runtime.getLayer();
  if (layer && !map.hasLayer(layer)) {
    layer.addTo(map);
  }
  applyCountyOverlayStyle(type);
  if (runtime.uploadMeta && layer) {
    const featureCount = Array.isArray(runtime.getGeoJson()?.features) ? runtime.getGeoJson().features.length : 0;
    runtime.uploadMeta.textContent = `${runtime.typeLabel} overlay visible (${featureCount} features)`;
  }
}

async function uploadCountyOverlayFile(type) {
  const runtime = getCountyOverlayRuntime(type);
  const file = runtime.uploadInput?.files?.[0] || null;
  if (!file) {
    if (runtime.uploadMeta) runtime.uploadMeta.textContent = `Choose a ${runtime.typeLabel} .geojson file first.`;
    return;
  }

  if (runtime.uploadButton) runtime.uploadButton.disabled = true;
  if (runtime.uploadMeta) runtime.uploadMeta.textContent = `Uploading ${file.name}...`;

  try {
    const rawText = await file.text();
    const parsed = JSON.parse(rawText);
    if (!parsed || parsed.type !== "FeatureCollection" || !Array.isArray(parsed.features) || !parsed.features.length) {
      throw new Error("File must be a GeoJSON FeatureCollection with features.");
    }

    const result = await api(runtime.uploadUrl, {
      method: "POST",
      body: JSON.stringify({ geojson: parsed })
    });

    const existingLayer = runtime.getLayer();
    if (existingLayer && map?.hasLayer(existingLayer)) {
      map.removeLayer(existingLayer);
    }
    runtime.setLayer(null);
    runtime.setGeoJson(null);
    runtime.setLoadPromise(null);

    await ensureCountyOverlayLayer(type);
    applyCountyOverlayStyle(type);

    const featureCount = Number(result?.featureCount || parsed.features.length || 0);
    if (runtime.uploadMeta) runtime.uploadMeta.textContent = `${runtime.typeLabel} upload complete. ${featureCount} features loaded.`;
  } catch (error) {
    if (runtime.uploadMeta) runtime.uploadMeta.textContent = error.message || `Failed to upload ${runtime.typeLabel} GIS file.`;
  } finally {
    if (runtime.uploadButton) runtime.uploadButton.disabled = false;
  }
}

function updateDisplayOptionsFromInputs() {
  DISTRICT_OVERLAY.showTitle = Boolean(els.districtTitleToggle?.checked);
  DISTRICT_OVERLAY.titleField = `${els.districtTitleField?.value || "auto"}`;
  MARKER_STYLE.borderColor = `${els.markerBorderColor?.value || MARKER_STYLE.borderColor}`;
  MARKER_STYLE.fillColor = `${els.markerFillColor?.value || MARKER_STYLE.fillColor}`;
  COMMISSIONER_OVERLAY.borderColor = `${els.commissionerBorderColor?.value || COMMISSIONER_OVERLAY.borderColor}`;
  COMMISSIONER_OVERLAY.fillColor = `${els.commissionerFillColor?.value || COMMISSIONER_OVERLAY.fillColor}`;
  COMMISSIONER_OVERLAY.titleField = `${els.commissionerTitleField?.value || "auto"}`.trim() || "auto";
  COMMISSIONER_OVERLAY.showTitle = Boolean(els.commissionerTitleToggle?.checked);
  VOTING_OVERLAY.borderColor = `${els.votingBorderColor?.value || VOTING_OVERLAY.borderColor}`;
  VOTING_OVERLAY.fillColor = `${els.votingFillColor?.value || VOTING_OVERLAY.fillColor}`;
  VOTING_OVERLAY.titleField = `${els.votingTitleField?.value || "auto"}`.trim() || "auto";
  VOTING_OVERLAY.showTitle = Boolean(els.votingTitleToggle?.checked);
  GUADALUPE_OVERLAY.borderColor = `${els.guadalupeBorderColor?.value || GUADALUPE_OVERLAY.borderColor}`;
  GUADALUPE_OVERLAY.fillColor = `${els.guadalupeFillColor?.value || GUADALUPE_OVERLAY.fillColor}`;
  GUADALUPE_OVERLAY.titleField = `${els.guadalupeTitleField?.value || "auto"}`.trim() || "auto";
  GUADALUPE_OVERLAY.showTitle = Boolean(els.guadalupeTitleToggle?.checked);
}

function applyDisplayOptions() {
  updateDisplayOptionsFromInputs();
  updateCountyOverlayOptionsVisibility();
  applyDistrictStyleAndTitle();
  applyCountyOverlayStyle("commissioner");
  applyCountyOverlayStyle("voting");
  applyCountyOverlayStyle("guadalupe");
  if (latestMapData) renderMapPoints(latestMapData, { fitToBounds: false });
}

async function yieldToBrowser(delay = MAP_RENDER_YIELD_MS) {
  await new Promise((resolve) => window.setTimeout(resolve, delay));
}

async function waitForMapVisualReady(timeoutMs = 5000) {
  if (!map || !baseTileLayer) return;

  await new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      baseTileLayer.off("load", finish);
      clearTimeout(timer);
      resolve();
    };

    const timer = window.setTimeout(finish, timeoutMs);
    baseTileLayer.once("load", finish);

    // Force a relayout pass for Leaflet when map container visibility changes.
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        map.invalidateSize(true);
        const isLoading = typeof baseTileLayer.isLoading === "function" && baseTileLayer.isLoading();
        if (!isLoading) finish();
      });
    });
  });

  map.invalidateSize(true);
}

function setLoadingState(busy, message = "") {
  if (els.gisLoadingMessage && message) {
    els.gisLoadingMessage.textContent = message;
  }
  if (busy) {
    els.gisLoadingOverlay?.removeAttribute("hidden");
    document.body.setAttribute("aria-busy", "true");
    return;
  }
  els.gisLoadingOverlay?.setAttribute("hidden", "");
  document.body.removeAttribute("aria-busy");
}

function isPointInRing(point, ring) {
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const xi = Number(ring[i]?.[0]);
    const yi = Number(ring[i]?.[1]);
    const xj = Number(ring[j]?.[0]);
    const yj = Number(ring[j]?.[1]);
    const intersects = ((yi > y) !== (yj > y))
      && (x < ((xj - xi) * (y - yi)) / ((yj - yi) || Number.EPSILON) + xi);
    if (intersects) inside = !inside;
  }
  return inside;
}

function isPointInPolygon(point, polygon) {
  if (!Array.isArray(polygon) || !polygon.length) return false;
  if (!isPointInRing(point, polygon[0])) return false;
  for (let i = 1; i < polygon.length; i += 1) {
    if (isPointInRing(point, polygon[i])) return false;
  }
  return true;
}

function isPointInGeometry(point, geometry) {
  if (!geometry || !geometry.type) return false;
  if (geometry.type === "Polygon") {
    return isPointInPolygon(point, geometry.coordinates);
  }
  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.some((polygon) => isPointInPolygon(point, polygon));
  }
  return false;
}

function getDistrictInfoForLatLon(lat, lon) {
  const features = Array.isArray(districtGeoJsonData?.features) ? districtGeoJsonData.features : [];
  if (!features.length || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const point = [lon, lat];
  for (const feature of features) {
    if (!isPointInGeometry(point, feature?.geometry)) continue;
    const properties = feature?.properties || {};
    return {
      districtKey: getDistrictKey(properties),
      districtLabel: getDistrictLabel(properties),
      districtProperties: properties
    };
  }
  return null;
}

function getCountyOverlayInfoForLatLon(type, lat, lon) {
  const runtime = getCountyOverlayRuntime(type);
  const geojson = runtime.getGeoJson();
  const features = Array.isArray(geojson?.features) ? geojson.features : [];
  if (!features.length || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const point = [lon, lat];
  for (const feature of features) {
    if (!isPointInGeometry(point, feature?.geometry)) continue;
    const properties = feature?.properties || {};
    const key = getFeaturePropertyText(properties, runtime.overlay.districtKeyKeys || []);
    const label = getOverlayLabel(runtime.overlay, properties);
    return {
      key,
      label,
      properties
    };
  }
  return null;
}

function annotateMapDataWithSpatialOverlays(data) {
  if (!data || typeof data !== "object") return;

  const chooseOverlayValue = (serverValue, overlayValue, fallbackValue = "") => {
    const serverText = `${serverValue || ""}`.trim();
    const overlayText = `${overlayValue || ""}`.trim();
    const serverIsWeak = !serverText || /^outside\b|^unmapped\b/i.test(serverText);
    if (!serverIsWeak) return serverText;
    if (overlayText) return overlayText;
    return serverText || `${fallbackValue || ""}`.trim();
  };

  const districtPointCache = new Map();
  const commissionerPointCache = new Map();
  const votingPointCache = new Map();
  const guadalupePointCache = new Map();

  const resolveDistrict = (lat, lon) => {
    const key = `${Number(lat).toFixed(6)}|${Number(lon).toFixed(6)}`;
    if (!districtPointCache.has(key)) {
      districtPointCache.set(key, getDistrictInfoForLatLon(Number(lat), Number(lon)) || {
        districtKey: "",
        districtLabel: "Outside district overlay",
        districtProperties: null
      });
    }
    return districtPointCache.get(key);
  };

  const resolveCountyOverlay = (cache, type, lat, lon, defaultLabel) => {
    const key = `${Number(lat).toFixed(6)}|${Number(lon).toFixed(6)}`;
    if (!cache.has(key)) {
      cache.set(key, getCountyOverlayInfoForLatLon(type, Number(lat), Number(lon)) || {
        key: "",
        label: defaultLabel,
        properties: null
      });
    }
    return cache.get(key);
  };

  for (const point of data.points || []) {
    if (!Number.isFinite(Number(point.lat)) || !Number.isFinite(Number(point.lon))) continue;
    const district = resolveDistrict(point.lat, point.lon);
    const commissioner = resolveCountyOverlay(commissionerPointCache, "commissioner", point.lat, point.lon, "Outside commissioner overlay");
    const voting = resolveCountyOverlay(votingPointCache, "voting", point.lat, point.lon, "Outside voting overlay");
    const guadalupe = resolveCountyOverlay(guadalupePointCache, "guadalupe", point.lat, point.lon, "Outside guadalupe overlay");

    const serverDistrictKey = `${point.location?.cityCouncilDistrict || ""}`.trim();
    const serverDistrictLabel = `${point.location?.cityCouncilLabel || ""}`.trim();
    const serverCommissioner = `${point.location?.commissionerPrecinct || ""}`.trim();
    const serverVoting = `${point.location?.votingPrecinct || point.location?.addressPrecinct || ""}`.trim();
    const serverGuadalupe = `${point.location?.guadalupePrecinct || ""}`.trim();

    point.location = point.location || {};
    point.districtKey = serverDistrictKey || district?.districtKey || "";
    point.districtLabel = serverDistrictLabel || district?.districtLabel || "Outside district overlay";
    point.location.commissionerPrecinct = chooseOverlayValue(serverCommissioner, commissioner?.key || commissioner?.label || "", "Outside commissioner overlay");
    point.location.votingPrecinct = chooseOverlayValue(serverVoting, voting?.key || voting?.label || "", "Outside voting overlay");
    point.location.guadalupePrecinct = chooseOverlayValue(serverGuadalupe, guadalupe?.key || guadalupe?.label || "", "Outside guadalupe overlay");
  }

  for (const record of data.records || []) {
    record.location = record.location || {};

    if (!record.mapped || !Number.isFinite(Number(record.lat)) || !Number.isFinite(Number(record.lon))) {
      record.districtKey = "";
      record.districtLabel = "Unmapped";
      if (!`${record.location.commissionerPrecinct || ""}`.trim()) {
        record.location.commissionerPrecinct = "Unmapped";
      }
      if (!`${record.location.votingPrecinct || ""}`.trim()) {
        record.location.votingPrecinct = "Unmapped";
      }
      if (!`${record.location.guadalupePrecinct || ""}`.trim()) {
        record.location.guadalupePrecinct = "Unmapped";
      }
      continue;
    }

    const district = resolveDistrict(record.lat, record.lon);
    const commissioner = resolveCountyOverlay(commissionerPointCache, "commissioner", record.lat, record.lon, "Outside commissioner overlay");
    const voting = resolveCountyOverlay(votingPointCache, "voting", record.lat, record.lon, "Outside voting overlay");
    const guadalupe = resolveCountyOverlay(guadalupePointCache, "guadalupe", record.lat, record.lon, "Outside guadalupe overlay");

    const serverDistrictKey = `${record.location?.cityCouncilDistrict || ""}`.trim();
    const serverDistrictLabel = `${record.location?.cityCouncilLabel || ""}`.trim();
    const serverCommissioner = `${record.location?.commissionerPrecinct || ""}`.trim();
    const serverVoting = `${record.location?.votingPrecinct || record.location?.addressPrecinct || ""}`.trim();
    const serverGuadalupe = `${record.location?.guadalupePrecinct || ""}`.trim();

    record.districtKey = serverDistrictKey || district?.districtKey || "";
    record.districtLabel = serverDistrictLabel || district?.districtLabel || "Outside district overlay";
    record.location.commissionerPrecinct = chooseOverlayValue(serverCommissioner, commissioner?.key || commissioner?.label || "", "Outside commissioner overlay");
    record.location.votingPrecinct = chooseOverlayValue(serverVoting, voting?.key || voting?.label || "", "Outside voting overlay");
    record.location.guadalupePrecinct = chooseOverlayValue(serverGuadalupe, guadalupe?.key || guadalupe?.label || "", "Outside guadalupe overlay");
  }
}

async function ensureDistrictLayer() {
  initMap();
  if (districtLayer) {
    if (els.districtOverlayToggle?.checked && !map.hasLayer(districtLayer)) {
      districtLayer.addTo(map);
    }
    return;
  }
  if (districtLayerLoadPromise) {
    await districtLayerLoadPromise;
    return;
  }

  districtLayerLoadPromise = (async () => {
    try {
      let response = await fetch(DISTRICT_OVERLAY.fileUrl, { credentials: "same-origin" });
      let sourceUrl = DISTRICT_OVERLAY.fileUrl;
      if (!response.ok && DISTRICT_OVERLAY.fallbackFileUrl) {
        const fallbackResponse = await fetch(DISTRICT_OVERLAY.fallbackFileUrl, { credentials: "same-origin" });
        if (fallbackResponse.ok) {
          response = fallbackResponse;
          sourceUrl = DISTRICT_OVERLAY.fallbackFileUrl;
        }
      }
      if (!response.ok) {
        throw new Error(`District overlay file not found at ${DISTRICT_OVERLAY.fileUrl}`);
      }

      districtGeoJsonData = await response.json();
      buildDistrictOrderFromGeoJson(districtGeoJsonData);
      renderDistrictColorControls();

      districtLayer = L.geoJSON(districtGeoJsonData, {
        style: (feature) => getDistrictStyle(feature),
        onEachFeature: (feature, layer) => {
          if (!DISTRICT_OVERLAY.showTitle) return;
          const label = getDistrictLabel(feature?.properties || {});
          layer.bindPopup(`<strong>${esc(label)}</strong>`);
        }
      });

      if (els.districtOverlayToggle?.checked) {
        districtLayer.addTo(map);
      }
      setDistrictOverlayMeta(`District overlay loaded from ${sourceUrl}`);

      if (latestMapData) {
        annotateMapDataWithSpatialOverlays(latestMapData);
        renderReportFromLatestData();
      }
    } catch (error) {
      districtGeoJsonData = null;
      districtLayer = null;
      setDistrictOverlayMeta(error.message || "Failed to load district overlay.");
    } finally {
      districtLayerLoadPromise = null;
    }
  })();

  await districtLayerLoadPromise;
}

async function handleDistrictOverlayToggle() {
  initMap();
  if (!els.districtOverlayToggle?.checked) {
    if (districtLayer && map.hasLayer(districtLayer)) {
      map.removeLayer(districtLayer);
    }
    setDistrictOverlayMeta("District overlay hidden.");
    return;
  }
  await ensureDistrictLayer();
}

async function uploadDistrictGeoJsonFile() {
  const file = els.districtGeoJsonUpload?.files?.[0] || null;
  if (!file) {
    setDistrictUploadMeta("Choose a .geojson file first.");
    return;
  }

  els.uploadDistrictGeoJsonBtn.disabled = true;
  setDistrictUploadMeta(`Uploading ${file.name}...`);

  try {
    const rawText = await file.text();
    const parsed = JSON.parse(rawText);
    if (!parsed || parsed.type !== "FeatureCollection" || !Array.isArray(parsed.features)) {
      throw new Error("File must be valid GeoJSON FeatureCollection.");
    }
    if (!parsed.features.length) throw new Error("GeoJSON has no features.");

    const result = await api("/api/admin/reporting/gis-districts", {
      method: "POST",
      body: JSON.stringify({ geojson: parsed })
    });

    if (districtLayer && map?.hasLayer(districtLayer)) map.removeLayer(districtLayer);
    districtLayer = null;
    districtGeoJsonData = null;
    districtLayerLoadPromise = null;
    DISTRICT_OVERLAY.districtOrder = [];
    DISTRICT_OVERLAY.districtColors = {};
    renderDistrictColorControls();

    await ensureDistrictLayer();
    applyDisplayOptions();

    const featureCount = Number(result?.featureCount || parsed.features.length || 0);
    setDistrictUploadMeta(`GIS upload complete. ${featureCount} features loaded.`);
  } catch (error) {
    setDistrictUploadMeta(error.message || "Failed to upload GIS file.");
  } finally {
    els.uploadDistrictGeoJsonBtn.disabled = false;
  }
}

function createGisFieldRow(key, label, expanded, groupBy, mappedAddress, mappedDate) {
  const row = document.createElement("div");
  row.className = "gis-field-row";
  row.draggable = true;
  row.dataset.key = key;

  row.innerHTML = `
    <span class="gis-drag-handle" title="Drag to reorder">⠿</span>
    <span class="gis-field-key" title="${esc(key)}">${esc(key)}</span>
    <input class="gis-field-label" type="text" value="${esc(label)}" placeholder="Display label" />
    <label class="gis-field-toggle"><input type="checkbox" class="gis-field-expanded" ${expanded ? "checked" : ""} /> Expanded</label>
    <label class="gis-field-toggle"><input type="checkbox" class="gis-field-group-by" ${groupBy ? "checked" : ""} /> Group By</label>
    <label class="gis-field-toggle"><input type="checkbox" class="gis-field-mapped-address" ${mappedAddress ? "checked" : ""} /> Mapped Address</label>
    <label class="gis-field-toggle"><input type="checkbox" class="gis-field-mapped-date" ${mappedDate ? "checked" : ""} /> Mapped Date</label>
    <button class="gis-field-remove" type="button" title="Remove field">✕</button>
  `;

  row.addEventListener("dragstart", (event) => {
    gisDragSrcRow = row;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", key);
    row.style.opacity = "0.5";
  });
  row.addEventListener("dragend", () => {
    row.style.opacity = "";
    els.gisFieldList?.querySelectorAll(".gis-field-row").forEach((item) => item.classList.remove("drag-over"));
    gisDragSrcRow = null;
  });
  row.addEventListener("dragover", (event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    els.gisFieldList?.querySelectorAll(".gis-field-row").forEach((item) => item.classList.remove("drag-over"));
    row.classList.add("drag-over");
  });
  row.addEventListener("dragleave", () => row.classList.remove("drag-over"));
  row.addEventListener("drop", (event) => {
    event.preventDefault();
    row.classList.remove("drag-over");
    if (!gisDragSrcRow || gisDragSrcRow === row || !els.gisFieldList) return;
    const rows = [...els.gisFieldList.querySelectorAll(".gis-field-row")];
    const srcIndex = rows.indexOf(gisDragSrcRow);
    const targetIndex = rows.indexOf(row);
    if (srcIndex < targetIndex) row.after(gisDragSrcRow);
    else row.before(gisDragSrcRow);
  });

  row.querySelector(".gis-field-remove")?.addEventListener("click", () => {
    row.remove();
    refreshGisFieldAddOptions();
    updateDateFilterVisibility();
  });

  row.querySelector(".gis-field-group-by")?.addEventListener("change", (event) => {
    if (!event.target.checked || !els.gisFieldList) return;
    els.gisFieldList.querySelectorAll(".gis-field-group-by").forEach((checkbox) => {
      if (checkbox !== event.target) checkbox.checked = false;
    });
  });

  row.querySelector(".gis-field-mapped-address")?.addEventListener("change", (event) => {
    if (!event.target.checked || !els.gisFieldList) {
      return;
    }
    els.gisFieldList.querySelectorAll(".gis-field-mapped-address").forEach((checkbox) => {
      if (checkbox !== event.target) checkbox.checked = false;
    });
  });

  row.querySelector(".gis-field-mapped-date")?.addEventListener("change", (event) => {
    if (event.target.checked && els.gisFieldList) {
      els.gisFieldList.querySelectorAll(".gis-field-mapped-date").forEach((checkbox) => {
        if (checkbox !== event.target) checkbox.checked = false;
      });
    }
    updateDateFilterVisibility();
  });

  return row;
}

function readGisFieldRows() {
  return [...(els.gisFieldList?.querySelectorAll(".gis-field-row") || [])].map((row, index) => ({
    key: row.dataset.key || "",
    label: row.querySelector(".gis-field-label")?.value.trim() || row.dataset.key || "",
    expanded: row.querySelector(".gis-field-expanded")?.checked || false,
    groupBy: row.querySelector(".gis-field-group-by")?.checked || false,
    mappedAddress: row.querySelector(".gis-field-mapped-address")?.checked || false,
    mappedDate: row.querySelector(".gis-field-mapped-date")?.checked || false,
    order: index
  }));
}

function populateGisFieldList(fields) {
  if (!els.gisFieldList) return;
  els.gisFieldList.innerHTML = "";
  for (const field of fields) {
    els.gisFieldList.appendChild(createGisFieldRow(
      field.key,
      field.label || field.key,
      field.expanded,
      field.groupBy,
      field.mappedAddress,
      field.mappedDate
    ));
  }
  refreshGisFieldAddOptions();
  updateDateFilterVisibility();
}

function buildDefaultGisFields(fieldKeys) {
  const addressGuess = fieldKeys.find((field) => /address|addr|location/i.test(field)) || fieldKeys[0] || "";
  const dateGuess = fieldKeys.find((field) => /date|datetime|time/i.test(field)) || "";
  return fieldKeys.map((key, index) => ({
    key,
    label: toFriendlyFieldLabel(key),
    expanded: index > 2,
    groupBy: false,
    mappedAddress: key === addressGuess,
    mappedDate: Boolean(dateGuess) && key === dateGuess,
    order: index
  }));
}

function refreshGisFieldAddOptions() {
  if (!els.gisFieldAddSelect) return;
  const selectedKeys = new Set(readGisFieldRows().map((field) => field.key));
  const options = availableProbeFields.filter((field) => !selectedKeys.has(field));
  els.gisFieldAddSelect.innerHTML = `<option value="">Add removed field…</option>${options.map((field) => `<option value="${esc(field)}">${esc(field)}</option>`).join("")}`;
  els.gisFieldAddBtn.disabled = options.length === 0;
}

function updateDateFilterVisibility() {
  const hasDate = readGisFieldRows().some((field) => field.mappedDate);
  els.fromDateWrap?.toggleAttribute("hidden", !hasDate);
  els.toDateWrap?.toggleAttribute("hidden", !hasDate);
}

async function probeReportFields() {
  const reportTitle = getEffectiveReportTitle();

  if (!reportTitle) {
    els.probeStatus.textContent = "Select or enter a report title first.";
    return;
  }

  els.probeBtn.disabled = true;
  setCanSaveReportName(false);
  els.probeStatus.textContent = "Loading fields…";

  try {
    const params = new URLSearchParams({ sourceType: "json_report" });
    if (reportTitle) params.set("reportTitle", reportTitle);
    const data = await api(`/api/admin/reporting/gis-map-probe?${params.toString()}`);
    const fields = data.fields || [];
    if (!fields.length) {
      els.probeStatus.textContent = "No fields found. Check the report title.";
      return;
    }

    availableProbeFields = [...fields];
    const existingFields = readGisFieldRows();
    const existingMap = new Map(existingFields.map((field) => [field.key, field]));
    const mergedFields = fields.map((key, index) => {
      const existing = existingMap.get(key);
      if (existing) {
        return { ...existing, order: index };
      }
      return buildDefaultGisFields(fields).find((field) => field.key === key) || {
        key,
        label: toFriendlyFieldLabel(key),
        expanded: index > 2,
        groupBy: false,
        mappedAddress: false,
        mappedDate: false,
        order: index
      };
    });

    const hasMappedAddress = mergedFields.some((field) => field.mappedAddress);
    if (!hasMappedAddress && mergedFields.length) {
      const guess = mergedFields.find((field) => /address|addr|location/i.test(field.key)) || mergedFields[0];
      if (guess) guess.mappedAddress = true;
    }

    populateGisFieldList(mergedFields);

    els.fieldMapSection.removeAttribute("hidden");
    const probeWarning = `${data.warning || ""}`.trim();
    els.probeStatus.textContent = probeWarning
      ? `${fields.length} fields loaded (${data.sourceMethod || "fallback source"}). ${probeWarning}`
      : `${fields.length} fields loaded. Configure report fields and click Build Map.`;
    setCanSaveReportName(true);
  } catch (error) {
    setCanSaveReportName(false);
    els.probeStatus.textContent = error.message || "Failed to load fields.";
  } finally {
    els.probeBtn.disabled = false;
  }
}

function getUniquePointsFromRecords(records) {
  const unique = new Map();
  for (const record of records) {
    if (!record?.mapped || !Number.isFinite(Number(record.lat)) || !Number.isFinite(Number(record.lon))) continue;
    const asmAddress = `${record.asmAddress || record.address || ""}`.trim();
    const correctedAddress = `${record.correctedAddress || record.address || asmAddress}`.trim();
    const key = `${Number(record.lat).toFixed(6)}|${Number(record.lon).toFixed(6)}|${correctedAddress}`;
    if (!unique.has(key)) {
      unique.set(key, {
        lat: Number(record.lat),
        lon: Number(record.lon),
        asmAddress,
        correctedAddress,
        address: correctedAddress || asmAddress,
        label: record.label || "",
        districtKey: record.districtKey || `${record.location?.cityCouncilDistrict || ""}`.trim(),
        districtLabel: record.districtLabel || `${record.location?.cityCouncilLabel || ""}`.trim() || "Outside district overlay",
        location: record.location || {},
        recordCount: 1
      });
    } else {
      unique.get(key).recordCount += 1;
    }
  }
  return Array.from(unique.values());
}

function populateDistrictFilter(records) {
  if (!els.filterDistrict) return;
  const currentValue = els.filterDistrict.value;
  const options = [{ value: "", label: "All overlay areas" }];
  const seenDistrict = new Set();
  const seenCommissioner = new Set();
  const seenVoting = new Set();
  const seenGuadalupe = new Set();
  let hasDistrictOutside = false;
  let hasCommissionerOutside = false;
  let hasVotingOutside = false;
  let hasGuadalupeOutside = false;

  for (const districtKey of DISTRICT_OVERLAY.districtOrder) {
    const matching = records.find((record) => record.mapped && record.districtKey === districtKey);
    if (!matching) continue;
    seenDistrict.add(districtKey);
    options.push({ value: `district:${districtKey}`, label: `City Council: ${matching.districtLabel || districtKey}` });
  }

  for (const record of records) {
    if (!record.mapped) continue;
    const commissioner = `${record.location?.commissionerPrecinct || ""}`.trim();
    const voting = `${record.location?.votingPrecinct || ""}`.trim();
    const guadalupe = `${record.location?.guadalupePrecinct || ""}`.trim();

    if (!record.districtKey) {
      hasDistrictOutside = true;
    } else if (!seenDistrict.has(record.districtKey)) {
      seenDistrict.add(record.districtKey);
      options.push({ value: `district:${record.districtKey}`, label: `City Council: ${record.districtLabel || record.districtKey}` });
    }

    if (!commissioner || /^outside\b/i.test(commissioner)) {
      hasCommissionerOutside = true;
    } else if (!seenCommissioner.has(commissioner)) {
      seenCommissioner.add(commissioner);
      options.push({ value: `commissioner:${commissioner}`, label: `Commissioner: ${commissioner}` });
    }

    if (!voting || /^outside\b/i.test(voting)) {
      hasVotingOutside = true;
    } else if (!seenVoting.has(voting)) {
      seenVoting.add(voting);
      options.push({ value: `voting:${voting}`, label: `Voting: ${voting}` });
    }

    if (!guadalupe || /^outside\b/i.test(guadalupe)) {
      hasGuadalupeOutside = true;
    } else if (!seenGuadalupe.has(guadalupe)) {
      seenGuadalupe.add(guadalupe);
      options.push({ value: `guadalupe:${guadalupe}`, label: `Guadalupe: ${guadalupe}` });
    }
  }

  if (hasDistrictOutside) options.push({ value: `${FILTER_OVERLAY_OUTSIDE_PREFIX}district`, label: "Outside City Council overlay" });
  if (hasCommissionerOutside) options.push({ value: `${FILTER_OVERLAY_OUTSIDE_PREFIX}commissioner`, label: "Outside Commissioner overlay" });
  if (hasVotingOutside) options.push({ value: `${FILTER_OVERLAY_OUTSIDE_PREFIX}voting`, label: "Outside Voting overlay" });
  if (hasGuadalupeOutside) options.push({ value: `${FILTER_OVERLAY_OUTSIDE_PREFIX}guadalupe`, label: "Outside Guadalupe overlay" });

  els.filterDistrict.innerHTML = options.map((option) => `<option value="${esc(option.value)}">${esc(option.label)}</option>`).join("");
  if (options.some((option) => option.value === currentValue)) {
    els.filterDistrict.value = currentValue;
  }
}

function recordMatchesSearch(record, searchValue) {
  if (!searchValue) return true;
  const location = record.location || {};
  const haystack = [
    record.label,
    record.asmAddress,
    record.correctedAddress,
    record.address,
    record.districtLabel,
    location.city,
    location.county,
    location.cityCouncilDistrict,
    location.cityCouncilLabel,
    location.commissionerPrecinct,
    location.votingPrecinct,
    location.guadalupePrecinct,
    location.addressPrecinct,
    ...(record.row && typeof record.row === "object" ? Object.values(record.row) : [])
  ]
    .map((value) => normalizeText(value).toLowerCase())
    .join(" \n ");
  return haystack.includes(searchValue);
}

function filterRecords(records) {
  const searchValue = `${els.filterSearch?.value || ""}`.trim().toLowerCase();
  const districtValue = `${els.filterDistrict?.value || ""}`.trim();
  const mapStatus = `${els.filterMapStatus?.value || "all"}`.trim();
  const inViewOnly = Boolean(els.filterInViewOnly?.checked);
  const bounds = inViewOnly && map ? map.getBounds() : null;

  return records.filter((record) => {
    if (mapStatus === "mapped" && !record.mapped) return false;
    if (mapStatus === "unmapped" && record.mapped) return false;

    if (districtValue.startsWith(FILTER_OVERLAY_OUTSIDE_PREFIX)) {
      const outsideType = districtValue.slice(FILTER_OVERLAY_OUTSIDE_PREFIX.length);
      if (!record.mapped) return false;
      if (outsideType === "district" && record.districtKey) return false;
      if (outsideType === "commissioner" && `${record.location?.commissionerPrecinct || ""}`.trim() && !/^outside\b/i.test(`${record.location?.commissionerPrecinct || ""}`.trim())) return false;
      if (outsideType === "voting" && `${record.location?.votingPrecinct || ""}`.trim() && !/^outside\b/i.test(`${record.location?.votingPrecinct || ""}`.trim())) return false;
      if (outsideType === "guadalupe" && `${record.location?.guadalupePrecinct || ""}`.trim() && !/^outside\b/i.test(`${record.location?.guadalupePrecinct || ""}`.trim())) return false;
    } else if (districtValue.includes(":")) {
      const [overlayType, overlayValueRaw] = districtValue.split(":");
      const overlayValue = `${overlayValueRaw || ""}`.trim();
      if (!record.mapped) return false;
      if (overlayType === "district" && record.districtKey !== overlayValue) return false;
      if (overlayType === "commissioner" && `${record.location?.commissionerPrecinct || ""}`.trim() !== overlayValue) return false;
      if (overlayType === "voting" && `${record.location?.votingPrecinct || ""}`.trim() !== overlayValue) return false;
      if (overlayType === "guadalupe" && `${record.location?.guadalupePrecinct || ""}`.trim() !== overlayValue) return false;
    } else if (districtValue === FILTER_DISTRICT_OUTSIDE) {
      if (!record.mapped || record.districtKey) return false;
    } else if (districtValue) {
      if (record.districtKey !== districtValue) return false;
    }

    if (bounds && record.mapped) {
      if (!bounds.contains([Number(record.lat), Number(record.lon)])) return false;
    } else if (bounds && !record.mapped) {
      return false;
    }

    return recordMatchesSearch(record, searchValue);
  });
}

function buildCardTitle(record, fieldConfig) {
  const titleField = fieldConfig.fields?.[0]?.key || fieldConfig.labelField;
  const { getField } = buildRowFieldReader(record.row);
  const preferred = titleField ? getField(titleField) : "";
  return preferred || normalizeText(record.label) || normalizeText(record.correctedAddress) || normalizeText(record.asmAddress) || "(record)";
}

function buildReportCard(record, fieldConfig) {
  const title = buildCardTitle(record, fieldConfig);
  const { getField } = buildRowFieldReader(record.row);
  const asmAddress = normalizeText(record.asmAddress || record.address);
  const correctedAddress = normalizeText(record.correctedAddress || record.address || asmAddress);
  const location = record.location || {};
  const chips = [];
  const dateValue = fieldConfig.dateField ? getField(fieldConfig.dateField) : "";
  const configuredFields = Array.isArray(fieldConfig.fields) ? [...fieldConfig.fields].sort((a, b) => a.order - b.order) : [];
  if (record.districtLabel) {
    chips.push(window.RC.chip("District: ", record.districtLabel));
  }
  if (dateValue) {
    chips.push(window.RC.chip(`${toFriendlyFieldLabel(fieldConfig.dateField)}: `, dateValue));
  }
  if (correctedAddress && correctedAddress !== title) {
    chips.push(window.RC.chip("Corrected: ", correctedAddress));
  }
  chips.push(window.RC.chip("Map: ", record.mapped ? "Mapped" : "Unmapped"));
  if (location.votingPrecinct) {
    chips.push(window.RC.chip("Voting Precinct: ", location.votingPrecinct));
  }
  if (location.commissionerPrecinct) {
    chips.push(window.RC.chip("Commissioner Precinct: ", location.commissionerPrecinct));
  }
  if (location.guadalupePrecinct) {
    chips.push(window.RC.chip("Guadalupe Precinct: ", location.guadalupePrecinct));
  }

  const detailFields = [];
  detailFields.push(window.RC.field("ASM Address", asmAddress));
  detailFields.push(window.RC.field("Corrected GIS Address", correctedAddress));
  detailFields.push(window.RC.field("Address Match Source", record.mapSource || ""));
  detailFields.push(window.RC.field("District", record.districtLabel || ""));
  detailFields.push(window.RC.field("City", location.city || ""));
  detailFields.push(window.RC.field("County", location.county || ""));
  detailFields.push(window.RC.field("Commissioner Precinct", location.commissionerPrecinct || ""));
  detailFields.push(window.RC.field("Voting Precinct", location.votingPrecinct || ""));
  detailFields.push(window.RC.field("Guadalupe Precinct", location.guadalupePrecinct || ""));
  detailFields.push(window.RC.field("Address Precinct", location.addressPrecinct || ""));
  detailFields.push(window.RC.field("Map Status", record.mapped ? "Mapped" : "Unmapped"));
  if (record.mapped) {
    detailFields.push(window.RC.field("Latitude", `${Number(record.lat).toFixed(6)}`));
    detailFields.push(window.RC.field("Longitude", `${Number(record.lon).toFixed(6)}`));
  }

  for (const field of configuredFields) {
    const key = `${field.key || ""}`.trim();
    if (!key) continue;
    const text = getField(key);
    if (!text) continue;
    if (key === fieldConfig.addressField || key === fieldConfig.dateField) {
      continue;
    }
    if (field.expanded) {
      detailFields.push(window.RC.field(field.label || toFriendlyFieldLabel(key), text));
    } else if (text !== title) {
      chips.push(window.RC.chip(`${field.label || toFriendlyFieldLabel(key)}: `, text));
    }
  }

  return window.RC.card({
    title: esc(title),
    chips,
    fields: detailFields.filter(Boolean),
    toggle: "Details"
  });
}

function buildReportMarkup(records) {
  if (!window.RC) {
    return '<div class="report-body-empty">Report card renderer is not available.</div>';
  }
  if (!records.length) {
    return '<div class="report-body-empty">No rows match the current filters.</div>';
  }

  const fieldConfig = getCurrentFieldConfig();
  const groups = new Map();
  const groupField = fieldConfig.fields.find((field) => field.groupBy) || null;
  for (const record of records) {
    const { getField } = buildRowFieldReader(record.row);
    const configuredGroupValue = groupField ? getField(groupField.key) : "";
    const groupKey = configuredGroupValue || (record.mapped
      ? (record.districtLabel || "Outside district overlay")
      : "Unmapped");
    if (!groups.has(groupKey)) groups.set(groupKey, []);
    groups.get(groupKey).push(buildReportCard(record, fieldConfig));
  }

  const groupMarkup = Array.from(groups.entries()).map(([label, cards]) => window.RC.group(label, cards.length, cards.join("")));
  return window.RC.list(groupMarkup, records.length);
}

function renderReportFromLatestData() {
  if (!els.resultsReport) return;
  const records = Array.isArray(latestMapData?.records) ? latestMapData.records : [];
  populateDistrictFilter(records);

  if (!records.length) {
    latestFilteredRecords = [];
    els.resultsReport.innerHTML = '<div class="report-body-empty">No report rows have been loaded yet.</div>';
    if (els.filterMeta) els.filterMeta.textContent = "";
    return;
  }

  const filtered = filterRecords(records);
  latestFilteredRecords = filtered;
  els.resultsReport.innerHTML = buildReportMarkup(filtered);

  const mappedShown = filtered.filter((record) => record.mapped).length;
  const totalMapped = records.filter((record) => record.mapped).length;
  const inViewSuffix = els.filterInViewOnly?.checked ? " in current map view" : "";
  if (els.filterMeta) {
    els.filterMeta.textContent = `${filtered.length} of ${records.length} rows shown${inViewSuffix} · ${mappedShown} mapped rows shown · ${totalMapped} mapped total`;
  }
}

function renderMapPoints(data, { fitToBounds = true } = {}) {
  latestMapData = data;
  initMap();

  markerLayer.clearLayers();

  const points = data.points || [];
  if (points.length) {
    for (const point of points) {
      const correctedAddress = `${point.correctedAddress || point.address || ""}`.trim();
      const asmAddress = `${point.asmAddress || ""}`.trim();
      const title = point.label ? `<strong>${esc(point.label)}</strong><br/>` : "";
      const district = point.districtLabel ? `<div>${esc(point.districtLabel)}</div>` : "";
      const asmLine = asmAddress && correctedAddress && asmAddress !== correctedAddress
        ? `<div><small>ASM: ${esc(asmAddress)}</small></div>`
        : "";
      const precinctLine = point.location?.votingPrecinct
        ? `<div><small>Voting Precinct: ${esc(point.location.votingPrecinct)}</small></div>`
        : "";
      const commissionerLine = point.location?.commissionerPrecinct
        ? `<div><small>Commissioner Precinct: ${esc(point.location.commissionerPrecinct)}</small></div>`
        : "";
      const guadalupeLine = point.location?.guadalupePrecinct
        ? `<div><small>Guadalupe Precinct: ${esc(point.location.guadalupePrecinct)}</small></div>`
        : "";
      const count = point.recordCount > 1 ? `<div>${point.recordCount} records</div>` : "";
      L.circleMarker([Number(point.lat), Number(point.lon)], {
        radius: 6,
        color: MARKER_STYLE.borderColor,
        weight: 1.5,
        fillColor: MARKER_STYLE.fillColor,
        fillOpacity: 0.75
      })
        .bindPopup(`${title}${esc(correctedAddress || asmAddress)}${asmLine}${district}${commissionerLine}${precinctLine}${guadalupeLine}${count}`)
        .addTo(markerLayer);
    }

    if (fitToBounds) {
      const bounds = L.latLngBounds(points.map((point) => [Number(point.lat), Number(point.lon)]));
      if (bounds.isValid()) {
        map.fitBounds(bounds.pad(0.15));
      }
    }
  }

  applyDistrictStyleAndTitle();
  renderReportFromLatestData();
}

function buildPrintableReportHtml(records) {
  return buildReportMarkup(records).replace(/\shidden(?=[ >])/g, "");
}

function getFilteredRecordsForActions() {
  if (!latestMapData || !Array.isArray(latestMapData.records)) {
    return null;
  }
  return latestFilteredRecords.length
    ? latestFilteredRecords
    : filterRecords(latestMapData.records || []);
}

function csvEscape(value) {
  const text = `${value ?? ""}`.replace(/\r?\n/g, " ").trim();
  return /[",]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function exportCurrentReportCsv() {
  const filteredRecords = getFilteredRecordsForActions();
  if (!filteredRecords) {
    els.metaText.textContent = "Build the map first, then export CSV.";
    return;
  }
  if (!filteredRecords.length) {
    els.metaText.textContent = "No filtered rows to export.";
    return;
  }

  const fieldConfig = getCurrentFieldConfig();
  const configuredFields = Array.isArray(fieldConfig.fields)
    ? [...fieldConfig.fields].sort((a, b) => a.order - b.order)
    : [];
  const dynamicFields = configuredFields.filter((field) => `${field.key || ""}`.trim());

  const headers = [
    "Report Title",
    "Card Title",
    "Map Status",
    "ASM Address",
    "Corrected GIS Address",
    "District",
    "Commissioner Precinct",
    "Voting Precinct",
    "Guadalupe Precinct",
    "City",
    "County",
    "Address Precinct",
    "Latitude",
    "Longitude",
    ...dynamicFields.map((field) => field.label || toFriendlyFieldLabel(field.key))
  ];

  const rows = [headers.join(",")];
  for (const record of filteredRecords) {
    const { getField } = buildRowFieldReader(record.row || {});
    const location = record.location || {};
    const values = [
      getCurrentReportHeading(),
      buildCardTitle(record, fieldConfig),
      record.mapped ? "Mapped" : "Unmapped",
      normalizeText(record.asmAddress || record.address),
      normalizeText(record.correctedAddress || record.address || record.asmAddress),
      record.districtLabel || "",
      location.commissionerPrecinct || "",
      location.votingPrecinct || "",
      location.guadalupePrecinct || "",
      location.city || "",
      location.county || "",
      location.addressPrecinct || "",
      record.mapped ? Number(record.lat).toFixed(6) : "",
      record.mapped ? Number(record.lon).toFixed(6) : "",
      ...dynamicFields.map((field) => getField(field.key))
    ];
    rows.push(values.map(csvEscape).join(","));
  }

  const csv = `\uFEFF${rows.join("\n")}`;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const reportSlug = getCurrentReportHeading()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "gis-report";
  const stamp = new Date().toISOString().slice(0, 10);
  link.href = url;
  link.download = `${reportSlug}-${stamp}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  els.metaText.textContent = `Exported ${filteredRecords.length} row${filteredRecords.length === 1 ? "" : "s"} to CSV.`;
}

function openPrintReportWindow() {
  const filteredRecords = getFilteredRecordsForActions();
  if (!filteredRecords) {
    els.metaText.textContent = "Build the map first, then print the report.";
    return;
  }

  els.metaText.textContent = "Capturing map snapshot\u2026";
  const mapEl = document.getElementById("gisMap");
  if (window.html2canvas && mapEl) {
    window.html2canvas(mapEl, { useCORS: true, allowTaint: false, logging: false })
      .then(function(canvas) {
        const mapDataUrl = canvas.toDataURL("image/png");
        els.metaText.textContent = "";
        _launchPrintWindow(filteredRecords, mapDataUrl);
      })
      .catch(function() {
        els.metaText.textContent = "";
        _launchPrintWindow(filteredRecords, null);
      });
  } else {
    els.metaText.textContent = "";
    _launchPrintWindow(filteredRecords, null);
  }
}

function _launchPrintWindow(filteredRecords, mapDataUrl) {
  const printablePoints = getUniquePointsFromRecords(filteredRecords);
  const reportMarkup = buildPrintableReportHtml(filteredRecords);
  const reportTitle = getCurrentReportHeading();
  const reportSummary = `${filteredRecords.length} row${filteredRecords.length === 1 ? "" : "s"} shown \u00b7 ${printablePoints.length} mapped location${printablePoints.length === 1 ? "" : "s"}`;
  const reportHtmlData = JSON.stringify(reportMarkup).replace(/</g, "\\u003c");

  const mapSection = mapDataUrl
    ? `<img src="${mapDataUrl}" class="map-snapshot" alt="Map snapshot" />`
    : `<div class="print-empty">Map snapshot unavailable.</div>`;

  const printWindow = window.open("about:blank", "_blank", "width=1200,height=900");
  if (!printWindow) {
    els.metaText.textContent = "Popup blocked. Allow popups to print the report.";
    return;
  }

  const printHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${esc(reportTitle)} - Printable GIS Report</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;700&family=Sora:wght@400;700&display=swap" rel="stylesheet" />
    <link rel="stylesheet" href="/admin-report-cards.css" />
    <style>
      :root {
        --accent: #f5a623;
        --ink: #18212b;
        --muted: #5d6a78;
        --border: rgba(24, 33, 43, 0.15);
        --surf: #ffffff;
        --surf-hi: #f6f8fb;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        background: #eef2f6;
        color: var(--ink);
        font: 400 14px/1.45 "Outfit", sans-serif;
      }
      .print-shell {
        width: min(1100px, 94vw);
        margin: 0 auto;
        padding: 1rem 0 2rem;
      }
      .print-actions {
        position: sticky;
        top: 0;
        z-index: 10;
        display: flex;
        justify-content: flex-end;
        gap: 0.6rem;
        padding: 0.85rem 0;
        background: linear-gradient(180deg, rgba(238,242,246,0.98), rgba(238,242,246,0.88));
        backdrop-filter: blur(4px);
      }
      .print-btn {
        border: 1px solid rgba(24,33,43,0.16);
        border-radius: 999px;
        background: #fff;
        color: var(--ink);
        padding: 0.45rem 0.85rem;
        font: 600 0.9rem/1 "Outfit", sans-serif;
        cursor: pointer;
      }
      .report-card {
        background: #fff;
        border: 1px solid var(--border);
        border-radius: 16px;
        padding: 1rem 1rem 1.1rem;
        box-shadow: 0 12px 32px rgba(18, 26, 35, 0.08);
      }
      .report-head {
        display: flex;
        justify-content: space-between;
        gap: 1rem;
        align-items: flex-start;
        flex-wrap: wrap;
        margin-bottom: 0.85rem;
      }
      .report-head h1 {
        margin: 0;
        font: 700 1.6rem/1.15 "Sora", sans-serif;
      }
      .report-head p {
        margin: 0.3rem 0 0;
        color: var(--muted);
      }
      .summary-chip {
        display: inline-flex;
        align-items: center;
        gap: 0.35rem;
        padding: 0.35rem 0.7rem;
        border-radius: 999px;
        background: #fff4df;
        color: #8a5a00;
        font-size: 0.8rem;
        font-weight: 600;
      }
      .map-snapshot {
        width: 100%;
        height: 420px;
        object-fit: cover;
        border-radius: 12px;
        border: 1px solid var(--border);
        display: block;
        margin: 0.7rem 0 1rem;
      }
      .print-empty {
        color: var(--muted);
        padding: 0.5rem 0.1rem 0.2rem;
      }
      .rc-card {
        break-inside: avoid;
        background: #fff;
      }
      .rc-details {
        background: #fafbfd;
      }
      .rc-toggle,
      .rc-link-icon {
        display: none !important;
      }
      @media print {
        body { background: #fff; }
        .print-shell { width: auto; padding: 0; }
        .print-actions { display: none !important; }
        .report-card { box-shadow: none; border: 0; padding: 0; }
        .map-snapshot { height: 360px; }
      }
    </style>
  </head>
  <body>
    <div class="print-shell">
      <div class="print-actions">
        <button class="print-btn" type="button" onclick="window.print()">Print</button>
        <button class="print-btn" type="button" onclick="window.close()">Close</button>
      </div>
      <section class="report-card">
        <div class="report-head">
          <div>
            <h1>${esc(reportTitle)}</h1>
            <p>${esc(reportSummary)}</p>
            <p>${esc(els.filterMeta?.textContent || "")}</p>
          </div>
          <div class="summary-chip">GIS Report</div>
        </div>
        ${mapSection}
        <div id="printBody"></div>
      </section>
    </div>
    <script>
      const reportMarkup = ${reportHtmlData};
      document.getElementById("printBody").innerHTML = reportMarkup;
    </script>
  </body>
</html>`;

  try {
    printWindow.document.open();
    printWindow.document.write(printHtml);
    printWindow.document.close();
  } catch {
    // Fallback for browsers that restrict direct document writes in popups.
    const htmlBlob = new Blob([printHtml], { type: "text/html;charset=utf-8" });
    const htmlUrl = URL.createObjectURL(htmlBlob);
    printWindow.location.href = htmlUrl;
    window.setTimeout(() => URL.revokeObjectURL(htmlUrl), 60_000);
  }
}

async function runGisMap() {
  const fieldConfig = getCurrentFieldConfig();
  const { reportTitle, addressField, labelField, dateField } = fieldConfig;

  if (!reportTitle) {
    els.metaText.textContent = "Select or enter a report title first.";
    return;
  }
  if (!addressField) {
    els.metaText.textContent = "Choose one Mapped Address field first. Click Load Fields if you haven't already.";
    return;
  }
  if (!fieldConfig.fields.length) {
    els.metaText.textContent = "Load fields first so the report and map know which columns to use.";
    return;
  }

  const fromDate = `${els.fromDate?.value || ""}`.trim();
  const toDate = `${els.toDate?.value || ""}`.trim();

  els.runBtn.disabled = true;
  setLoadingState(true, "Geocoding addresses and preparing records. This can take a moment.");
  els.metaText.textContent = "Geocoding and building map…";

  els.mapCard?.removeAttribute("hidden");
  els.reportCard?.removeAttribute("hidden");
  els.reportFilters?.removeAttribute("hidden");
  initMap();

  try {
    const params = new URLSearchParams({ sourceType: "json_report", addressField });
    if (reportTitle) params.set("reportTitle", reportTitle);
    if (labelField) params.set("labelField", labelField);
    if (dateField) params.set("dateField", dateField);
    if (fromDate) params.set("fromDate", fromDate);
    if (toDate) params.set("toDate", toDate);

    const data = await api(`/api/admin/reporting/gis-map?${params.toString()}`);

    setLoadingState(true, "Data loaded. Resolving district and precinct overlays.");
    els.metaText.textContent = "Data loaded. Resolving GIS overlays…";
    await yieldToBrowser();

    try {
      await ensureDistrictLayer();
    } catch {
      // Keep report usable even if district overlay fails to load.
    }

    if (els.commissionerOverlayToggle?.checked) {
      await ensureCountyOverlayLayer("commissioner");
    }
    if (els.votingOverlayToggle?.checked) {
      await ensureCountyOverlayLayer("voting");
    }

    // Always load Guadalupe overlay for point-in-zone enrichment,
    // even when not currently visible as a map layer.
    await ensureCountyOverlayLayer("guadalupe");

    setLoadingState(true, "Rendering map points and report cards.");
    els.metaText.textContent = "Rendering map and report…";
    await yieldToBrowser();

    annotateMapDataWithSpatialOverlays(data);
    renderMapPoints(data);
    await handleDistrictOverlayToggle();
    await handleCountyOverlayToggle("commissioner");
    await handleCountyOverlayToggle("voting");
    await handleCountyOverlayToggle("guadalupe");
    await waitForMapVisualReady();

    const rowCount = Number(data.rowCount || 0);
    const pointCount = Number(data.pointCount || 0);
    const mappedRecordCount = Number(data.mappedRecordCount || 0);
    const unmappedRowCount = Number(data.unmappedRowCount || Math.max(0, rowCount - mappedRecordCount));
    const partialNote = unmappedRowCount > 0
      ? ` · ${unmappedRowCount} unmapped rows`
      : "";
    const sourceNote = `${data.warning || ""}`.trim();
    const baseMeta = `${rowCount} rows · ${mappedRecordCount} mapped rows · ${pointCount} mapped locations${partialNote}`;
    els.metaText.textContent = sourceNote
      ? `${baseMeta} · ${sourceNote}`
      : baseMeta;
  } catch (error) {
    latestMapData = null;
    latestFilteredRecords = [];
    els.metaText.textContent = error.message || "Failed to build map.";
    if (els.resultsReport) {
      els.resultsReport.innerHTML = '<div class="report-body-empty">Unable to load report rows.</div>';
    }
  } finally {
    els.runBtn.disabled = false;
    setLoadingState(false);
    if (map) map.invalidateSize(true);
  }
}

els.reportTitle?.addEventListener("change", () => {
  const selected = `${els.reportTitle?.value || ""}`.trim();
  if (selected && els.reportTitleCustom) {
    els.reportTitleCustom.value = selected;
  }
  els.fieldMapSection?.setAttribute("hidden", "");
  if (els.gisFieldList) els.gisFieldList.innerHTML = "";
  availableProbeFields = [];
  setCanSaveReportName(false);
  els.probeStatus.textContent = "";
});

els.reportTitleCustom?.addEventListener("input", () => {
  setCanSaveReportName(false);
});

els.gisFieldAddBtn?.addEventListener("click", () => {
  const key = `${els.gisFieldAddSelect?.value || ""}`.trim();
  if (!key || !els.gisFieldList) return;
  els.gisFieldList.appendChild(createGisFieldRow(key, toFriendlyFieldLabel(key), false, false, false, false));
  refreshGisFieldAddOptions();
});

els.gisFieldList?.addEventListener("input", () => {
  if (latestMapData) renderReportFromLatestData();
});

els.gisFieldList?.addEventListener("change", () => {
  updateDateFilterVisibility();
  if (latestMapData) renderReportFromLatestData();
});

els.probeBtn?.addEventListener("click", probeReportFields);
els.saveReportNameBtn?.addEventListener("click", saveCurrentReportName);
els.runBtn?.addEventListener("click", runGisMap);
els.districtOverlayToggle?.addEventListener("change", handleDistrictOverlayToggle);
els.commissionerOverlayToggle?.addEventListener("change", () => {
  handleCountyOverlayToggle("commissioner");
});
els.votingOverlayToggle?.addEventListener("change", () => {
  handleCountyOverlayToggle("voting");
});
els.guadalupeOverlayToggle?.addEventListener("change", () => {
  handleCountyOverlayToggle("guadalupe");
});

els.displayOptionsToggle?.addEventListener("click", () => {
  if (!els.displayOptionsPanel) return;
  const willOpen = els.displayOptionsPanel.hasAttribute("hidden");
  if (willOpen) {
    els.displayOptionsPanel.removeAttribute("hidden");
  } else {
    els.displayOptionsPanel.setAttribute("hidden", "");
  }
  els.displayOptionsToggle.setAttribute("aria-expanded", willOpen ? "true" : "false");
});

els.markerBorderColor?.addEventListener("input", applyDisplayOptions);
els.markerFillColor?.addEventListener("input", applyDisplayOptions);
els.districtTitleField?.addEventListener("change", applyDisplayOptions);
els.districtTitleToggle?.addEventListener("change", applyDisplayOptions);
els.commissionerBorderColor?.addEventListener("input", applyDisplayOptions);
els.commissionerFillColor?.addEventListener("input", applyDisplayOptions);
els.commissionerTitleField?.addEventListener("change", applyDisplayOptions);
els.commissionerTitleToggle?.addEventListener("change", applyDisplayOptions);
els.votingBorderColor?.addEventListener("input", applyDisplayOptions);
els.votingFillColor?.addEventListener("input", applyDisplayOptions);
els.votingTitleField?.addEventListener("change", applyDisplayOptions);
els.votingTitleToggle?.addEventListener("change", applyDisplayOptions);
els.guadalupeBorderColor?.addEventListener("input", applyDisplayOptions);
els.guadalupeFillColor?.addEventListener("input", applyDisplayOptions);
els.guadalupeTitleField?.addEventListener("change", applyDisplayOptions);
els.guadalupeTitleToggle?.addEventListener("change", applyDisplayOptions);
els.saveDisplayDefaultsBtn?.addEventListener("click", saveCurrentAsDisplayDefaults);
els.resetDisplayOptionsBtn?.addEventListener("click", resetDisplayOptions);
els.uploadDistrictGeoJsonBtn?.addEventListener("click", uploadDistrictGeoJsonFile);
els.uploadCommissionerGeoJsonBtn?.addEventListener("click", () => uploadCountyOverlayFile("commissioner"));
els.uploadVotingGeoJsonBtn?.addEventListener("click", () => uploadCountyOverlayFile("voting"));
els.uploadGuadalupeGeoJsonBtn?.addEventListener("click", () => uploadCountyOverlayFile("guadalupe"));

els.districtColorControls?.addEventListener("input", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) return;
  const districtKey = `${target.getAttribute("data-district-key") || ""}`.trim();
  if (!districtKey) return;
  DISTRICT_OVERLAY.districtColors[districtKey] = `${target.value || DEFAULT_DISTRICT_COLOR}`;
  applyDistrictStyleAndTitle();
});

for (const filterElement of [els.filterSearch, els.filterDistrict, els.filterMapStatus, els.filterInViewOnly]) {
  filterElement?.addEventListener("input", renderReportFromLatestData);
  filterElement?.addEventListener("change", renderReportFromLatestData);
}

els.clearFiltersBtn?.addEventListener("click", () => {
  if (els.filterSearch) els.filterSearch.value = "";
  if (els.filterDistrict) els.filterDistrict.value = "";
  if (els.filterMapStatus) els.filterMapStatus.value = "all";
  if (els.filterInViewOnly) els.filterInViewOnly.checked = false;
  renderReportFromLatestData();
});

els.printReportBtn?.addEventListener("click", openPrintReportWindow);
els.exportCsvBtn?.addEventListener("click", exportCurrentReportCsv);

els.logoutBtn?.addEventListener("click", async () => {
  try {
    await api("/api/admin/session/logout", { method: "POST" });
  } catch {
    // Navigate regardless.
  }
  window.location.replace("/reporting-login.html");
});

(async () => {
  const ok = await ensureAuth();
  if (!ok) return;

  populateSavedReportDropdown();
  if (els.reportTitleCustom && !els.reportTitleCustom.value) {
    els.reportTitleCustom.value = `${els.reportTitle?.value || ""}`.trim();
  }
  setCanSaveReportName(false);

  const savedDefaults = loadSavedDisplayDefaults();
  if (savedDefaults) {
    applyDisplayDefaults(savedDefaults, { rerenderMap: false });
    setDisplayOptionsMeta("Saved display defaults loaded.");
  } else {
    updateDisplayOptionsFromInputs();
  }
  renderDistrictColorControls();
  updateCountyOverlayOptionsVisibility();

  const now = new Date();
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
  if (els.fromDate) els.fromDate.value = firstDay.toISOString().slice(0, 10);
  if (els.toDate) els.toDate.value = now.toISOString().slice(0, 10);

  if (els.commissionerOverlayToggle?.checked) {
    await ensureCountyOverlayLayer("commissioner");
  }
  if (els.votingOverlayToggle?.checked) {
    await ensureCountyOverlayLayer("voting");
  }
  await ensureCountyOverlayLayer("guadalupe");
})();
