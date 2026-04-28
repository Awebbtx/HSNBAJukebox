const els = {
  logoutBtn: document.getElementById("logoutBtn"),
  fromDate: document.getElementById("fromDate"),
  toDate: document.getElementById("toDate"),
  runBtn: document.getElementById("runBtn"),
  metaText: document.getElementById("metaText"),
  hotspotsTable: document.getElementById("hotspotsTable"),
  districtOverlayToggle: document.getElementById("districtOverlayToggle"),
  districtOverlayMeta: document.getElementById("districtOverlayMeta"),
  displayOptionsToggle: document.getElementById("displayOptionsToggle"),
  displayOptionsPanel: document.getElementById("displayOptionsPanel"),
  districtColorControls: document.getElementById("districtColorControls"),
  saveDisplayDefaultsBtn: document.getElementById("saveDisplayDefaultsBtn"),
  resetDisplayOptionsBtn: document.getElementById("resetDisplayOptionsBtn"),
  districtGeoJsonUpload: document.getElementById("districtGeoJsonUpload"),
  uploadDistrictGeoJsonBtn: document.getElementById("uploadDistrictGeoJsonBtn"),
  districtUploadMeta: document.getElementById("districtUploadMeta"),
  displayOptionsMeta: document.getElementById("displayOptionsMeta"),
  hotspotBorderColor: document.getElementById("hotspotBorderColor"),
  hotspotFillColor: document.getElementById("hotspotFillColor"),
  districtTitleField: document.getElementById("districtTitleField"),
  districtTitleToggle: document.getElementById("districtTitleToggle")
};

let map;
let heatLayer;
let markerLayer;
let districtLayer;
let districtLayerLoadPromise;
let asmBaseUrl = "";
let latestHeatMapData = null;

const DEFAULT_DISTRICT_COLOR = "#4dd8ff";
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
const DEFAULT_HOTSPOT_BORDER = "#f5a623";
const DEFAULT_HOTSPOT_FILL = "#f06a6a";
const DISPLAY_DEFAULTS_STORAGE_KEY = "hsnba.ac.heatmap.display.defaults.v1";

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

const HOTSPOT_STYLE = {
  borderColor: DEFAULT_HOTSPOT_BORDER,
  fillColor: DEFAULT_HOTSPOT_FILL
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

function initMap() {
  if (map) return;
  map = L.map("acHeatMap", {
    center: [29.703, -98.124],
    zoom: 12,
    zoomControl: true
  });

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors"
  }).addTo(map);

  markerLayer = L.layerGroup().addTo(map);

  if (els.districtOverlayToggle?.checked) {
    ensureDistrictLayer();
  }
}

function getDistrictLabel(properties = {}) {
  if (DISTRICT_OVERLAY.titleField && DISTRICT_OVERLAY.titleField !== "auto") {
    const selected = properties[DISTRICT_OVERLAY.titleField];
    if (selected != null && `${selected}`.trim()) {
      return `${selected}`.trim();
    }
  }

  for (const key of DISTRICT_OVERLAY.fallbackNameKeys) {
    const value = properties[key];
    if (value != null && `${value}`.trim()) {
      return `${value}`.trim();
    }
  }
  return "District";
}

function setDistrictOverlayMeta(message) {
  if (els.districtOverlayMeta) {
    els.districtOverlayMeta.textContent = message || "";
  }
}

function setDistrictUploadMeta(message) {
  if (els.districtUploadMeta) {
    els.districtUploadMeta.textContent = message || "";
  }
}

function setDisplayOptionsMeta(message) {
  if (els.displayOptionsMeta) {
    els.displayOptionsMeta.textContent = message || "";
  }
}

function isHexColor(value) {
  return /^#[0-9a-f]{6}$/i.test(`${value || ""}`.trim());
}

function getBuiltInDisplayDefaults() {
  return {
    hotspotBorderColor: DEFAULT_HOTSPOT_BORDER,
    hotspotFillColor: DEFAULT_HOTSPOT_FILL,
    districtTitleField: "auto",
    districtTitleToggle: true,
    districtColors: {}
  };
}

function sanitizeDisplayDefaults(raw) {
  const defaults = getBuiltInDisplayDefaults();
  if (!raw || typeof raw !== "object") {
    return defaults;
  }

  const districtColors = {};
  for (const [key, value] of Object.entries(raw.districtColors || {})) {
    const normalizedKey = `${key || ""}`.trim();
    const normalizedColor = `${value || ""}`.trim();
    if (!normalizedKey || !isHexColor(normalizedColor)) continue;
    districtColors[normalizedKey] = normalizedColor;
  }

  const titleField = `${raw.districtTitleField || "auto"}`.trim() || "auto";
  return {
    hotspotBorderColor: isHexColor(raw.hotspotBorderColor) ? raw.hotspotBorderColor : defaults.hotspotBorderColor,
    hotspotFillColor: isHexColor(raw.hotspotFillColor) ? raw.hotspotFillColor : defaults.hotspotFillColor,
    districtTitleField: titleField,
    districtTitleToggle: Boolean(raw.districtTitleToggle),
    districtColors
  };
}

function getCurrentDisplayDefaults() {
  return sanitizeDisplayDefaults({
    hotspotBorderColor: HOTSPOT_STYLE.borderColor,
    hotspotFillColor: HOTSPOT_STYLE.fillColor,
    districtTitleField: DISTRICT_OVERLAY.titleField,
    districtTitleToggle: DISTRICT_OVERLAY.showTitle,
    districtColors: DISTRICT_OVERLAY.districtColors
  });
}

function applyDisplayDefaults(defaults, { rerenderMap = true } = {}) {
  const normalized = sanitizeDisplayDefaults(defaults);

  HOTSPOT_STYLE.borderColor = normalized.hotspotBorderColor;
  HOTSPOT_STYLE.fillColor = normalized.hotspotFillColor;
  DISTRICT_OVERLAY.showTitle = normalized.districtTitleToggle;
  DISTRICT_OVERLAY.titleField = normalized.districtTitleField;
  DISTRICT_OVERLAY.districtColors = { ...normalized.districtColors };

  if (els.hotspotBorderColor) els.hotspotBorderColor.value = normalized.hotspotBorderColor;
  if (els.hotspotFillColor) els.hotspotFillColor.value = normalized.hotspotFillColor;
  if (els.districtTitleToggle) els.districtTitleToggle.checked = normalized.districtTitleToggle;
  if (els.districtTitleField) els.districtTitleField.value = normalized.districtTitleField;

  renderDistrictColorControls();
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

function getDistrictKey(properties = {}) {
  for (const key of DISTRICT_OVERLAY.districtKeyKeys) {
    const value = properties[key];
    if (value != null && `${value}`.trim()) {
      return `${value}`.trim();
    }
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

function renderDistrictColorControls() {
  if (!els.districtColorControls) return;
  if (!DISTRICT_OVERLAY.districtOrder.length) {
    els.districtColorControls.innerHTML = "<span class=\"meta\">District colors will appear after overlay loads.</span>";
    return;
  }

  const controlsHtml = DISTRICT_OVERLAY.districtOrder.map((districtKey, index) => {
    const color = getDistrictColorByKey(districtKey, index);
    DISTRICT_OVERLAY.districtColors[districtKey] = color;
    return `
      <label class="district-color-control">
        <span>${districtKey}</span>
        <input
          type="color"
          value="${color}"
          data-district-key="${districtKey.replaceAll('"', '&quot;')}"
          aria-label="Color for district ${districtKey}"
        />
      </label>`;
  }).join("");

  els.districtColorControls.innerHTML = controlsHtml;
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
    const aIsNum = Number.isFinite(aNum);
    const bIsNum = Number.isFinite(bNum);
    if (aIsNum && bIsNum) return aNum - bNum;
    return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
  });
  DISTRICT_OVERLAY.districtOrder = keys;
}

function applyDistrictStyleAndTitle() {
  if (!districtLayer) return;

  districtLayer.setStyle((feature) => getDistrictStyle(feature));

  districtLayer.eachLayer((layer) => {
    const featureProps = layer.feature?.properties || {};
    const label = getDistrictLabel(featureProps);
    if (DISTRICT_OVERLAY.showTitle) {
      layer.bindPopup(`<strong>${label}</strong>`);
    } else {
      layer.unbindPopup();
    }
  });
}

function updateDisplayOptionsFromInputs() {
  DISTRICT_OVERLAY.showTitle = Boolean(els.districtTitleToggle?.checked);
  DISTRICT_OVERLAY.titleField = `${els.districtTitleField?.value || "auto"}`;

  HOTSPOT_STYLE.borderColor = `${els.hotspotBorderColor?.value || HOTSPOT_STYLE.borderColor}`;
  HOTSPOT_STYLE.fillColor = `${els.hotspotFillColor?.value || HOTSPOT_STYLE.fillColor}`;
}

function applyDisplayOptions() {
  updateDisplayOptionsFromInputs();
  applyDistrictStyleAndTitle();
  if (latestHeatMapData) {
    renderMap(latestHeatMapData);
  }
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
    if (!parsed.features.length) {
      throw new Error("GeoJSON has no features.");
    }

    const result = await api("/api/admin/reporting/gis-districts", {
      method: "POST",
      body: JSON.stringify({ geojson: parsed })
    });

    if (districtLayer && map?.hasLayer(districtLayer)) {
      map.removeLayer(districtLayer);
    }
    districtLayer = null;
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

async function ensureDistrictLayer() {
  if (!map) return;
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
      const geojson = await response.json();
      buildDistrictOrderFromGeoJson(geojson);
      renderDistrictColorControls();

      districtLayer = L.geoJSON(geojson, {
        style: (feature) => getDistrictStyle(feature),
        onEachFeature: (feature, layer) => {
          if (!DISTRICT_OVERLAY.showTitle) return;
          const label = getDistrictLabel(feature?.properties || {});
          layer.bindPopup(`<strong>${label}</strong>`);
        }
      });

      if (els.districtOverlayToggle?.checked) {
        districtLayer.addTo(map);
      }
      setDistrictOverlayMeta(`District overlay loaded from ${sourceUrl}`);
    } catch (error) {
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

function buildAsmLink(iid, code) {
  if (!asmBaseUrl || iid == null) return null;
  const href = `${asmBaseUrl}/incident?id=${encodeURIComponent(iid)}`;
  const label = code || `#${iid}`;
  return `<a href="${href}" target="_blank" rel="noopener noreferrer">${label}</a>`;
}

function buildAsmLinksHtml(incidents) {
  if (!asmBaseUrl || !incidents || !incidents.length) return "";
  if (incidents.length === 1) {
    return buildAsmLink(incidents[0].iid, incidents[0].code) || "";
  }
  const links = incidents
    .slice(0, 5)
    .map((inc) => buildAsmLink(inc.iid, inc.code))
    .filter(Boolean)
    .join(", ");
  const more = incidents.length > 5 ? ` <em>+${incidents.length - 5} more</em>` : "";
  return links + more;
}

function renderHotspotsTable(rows) {
  if (!rows.length) {
    els.hotspotsTable.innerHTML = '<span style="color:var(--muted)">No hotspot points were mapped for this range.</span>';
    return;
  }

  const hasLinks = asmBaseUrl && rows.some((r) => r.incidents && r.incidents.length);
  const header = hasLinks
    ? `<tr><th>#</th><th>Calls</th><th>Address</th><th>Incidents</th></tr>`
    : `<tr><th>#</th><th>Calls</th><th>Address</th></tr>`;

  const body = rows.map((row, idx) => {
    const linksHtml = hasLinks ? buildAsmLinksHtml(row.incidents || []) : "";
    const linkCell = hasLinks ? `<td>${linksHtml}</td>` : "";
    return `<tr><td>${idx + 1}</td><td>${row.count}</td><td>${row.address}</td>${linkCell}</tr>`;
  }).join("");

  els.hotspotsTable.innerHTML = `
    <table class="data-table">
      <thead>${header}</thead>
      <tbody>${body}</tbody>
    </table>`;
}

function renderMap(data) {
  latestHeatMapData = data;
  initMap();

  const points = data.points || [];
  const heatPoints = points.map((p) => [Number(p.lat), Number(p.lon), Math.max(0.2, Number(p.weight || 0))]);

  if (heatLayer) {
    map.removeLayer(heatLayer);
  }
  markerLayer.clearLayers();

  if (heatPoints.length) {
    heatLayer = L.heatLayer(heatPoints, {
      radius: 26,
      blur: 24,
      maxZoom: 16,
      minOpacity: 0.35
    }).addTo(map);

    const top = points.slice(0, 20);
    for (const p of top) {
      L.circleMarker([p.lat, p.lon], {
        radius: 4,
        color: HOTSPOT_STYLE.borderColor,
        weight: 1,
        fillColor: HOTSPOT_STYLE.fillColor,
        fillOpacity: 0.75
      })
        .bindPopup(() => {
          let html = `<strong>${p.count} calls</strong><br/>${p.address}`;
          const linksHtml = buildAsmLinksHtml(p.incidents || []);
          if (linksHtml) html += `<br/><small>${linksHtml}</small>`;
          return html;
        })
        .addTo(markerLayer);
    }

    const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lon]));
    if (bounds.isValid()) {
      map.fitBounds(bounds.pad(0.15));
    }
  }

  renderHotspotsTable(data.topHotspots || []);
  applyDistrictStyleAndTitle();
}

async function loadHeatMap() {
  const fromDate = `${els.fromDate?.value || ""}`.trim();
  const toDate = `${els.toDate?.value || ""}`.trim();
  if (!fromDate || !toDate) {
    els.metaText.textContent = "Select both From Date and To Date.";
    return;
  }

  els.runBtn.disabled = true;
  els.metaText.textContent = "Loading animal control heat map...";
  try {
    const params = new URLSearchParams({ fromDate, toDate });
    const data = await api(`/api/admin/reporting/animal-control-heatmap?${params.toString()}`);
    asmBaseUrl = data.asmBaseUrl || "";
    renderMap(data);
    els.metaText.textContent = data.available === false
      ? `${data.fromDate} to ${data.toDate} | ${data.error || "Animal Control data unavailable."}`
      : `${data.fromDate} to ${data.toDate} | Source: ${data.sourceMethod} | Calls: ${data.filteredRowCount} | Mapped Points: ${data.pointCount}`;
  } catch (error) {
    els.metaText.textContent = error.message || "Failed to load animal control heat map.";
    els.hotspotsTable.innerHTML = "";
  } finally {
    els.runBtn.disabled = false;
  }
}

els.runBtn?.addEventListener("click", loadHeatMap);
els.districtOverlayToggle?.addEventListener("change", handleDistrictOverlayToggle);
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

els.hotspotBorderColor?.addEventListener("input", applyDisplayOptions);
els.hotspotFillColor?.addEventListener("input", applyDisplayOptions);
els.districtTitleField?.addEventListener("change", applyDisplayOptions);
els.districtTitleToggle?.addEventListener("change", applyDisplayOptions);
els.saveDisplayDefaultsBtn?.addEventListener("click", saveCurrentAsDisplayDefaults);
els.resetDisplayOptionsBtn?.addEventListener("click", resetDisplayOptions);
els.uploadDistrictGeoJsonBtn?.addEventListener("click", uploadDistrictGeoJsonFile);
els.districtColorControls?.addEventListener("input", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) return;
  const districtKey = `${target.getAttribute("data-district-key") || ""}`.trim();
  if (!districtKey) return;
  DISTRICT_OVERLAY.districtColors[districtKey] = `${target.value || DEFAULT_DISTRICT_COLOR}`;
  applyDistrictStyleAndTitle();
});

els.logoutBtn?.addEventListener("click", async () => {
  try {
    await api("/api/admin/session/logout", { method: "POST" });
  } catch {
    // Navigate away even if logout fails.
  }
  window.location.replace("/reporting-login.html");
});

(async () => {
  const ok = await ensureAuth();
  if (!ok) return;
  updateDisplayOptionsFromInputs();
  const savedDefaults = loadSavedDisplayDefaults();
  if (savedDefaults) {
    applyDisplayDefaults(savedDefaults, { rerenderMap: false });
    setDisplayOptionsMeta("Saved display defaults loaded.");
  }
  renderDistrictColorControls();
  const now = new Date();
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
  els.fromDate.value = firstDay.toISOString().slice(0, 10);
  els.toDate.value = now.toISOString().slice(0, 10);
  await loadHeatMap();
  await handleDistrictOverlayToggle();
})();
