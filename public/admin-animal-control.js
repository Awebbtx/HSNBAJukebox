const els = {
  logoutBtn: document.getElementById("logoutBtn"),
  fromDate: document.getElementById("fromDate"),
  toDate: document.getElementById("toDate"),
  runBtn: document.getElementById("runBtn"),
  metaText: document.getElementById("metaText"),
  hotspotsTable: document.getElementById("hotspotsTable"),
  districtCallsMonth: document.getElementById("districtCallsMonth"),
  districtCallsYear: document.getElementById("districtCallsYear"),
  districtCallsRunBtn: document.getElementById("districtCallsRunBtn"),
  districtCallsMeta: document.getElementById("districtCallsMeta"),
  districtCallsTable: document.getElementById("districtCallsTable"),
  callsByTypeFromDate: document.getElementById("callsByTypeFromDate"),
  callsByTypeToDate: document.getElementById("callsByTypeToDate"),
  callsByTypeRunBtn: document.getElementById("callsByTypeRunBtn"),
  callsByTypeMeta: document.getElementById("callsByTypeMeta"),
  callsByTypeTable: document.getElementById("callsByTypeTable")
};

let map;
let heatLayer;
let markerLayer;

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
}

let asmBaseUrl = "";

function buildAsmLink(iid, code) {
  if (!asmBaseUrl || iid == null) return null;
  const href = `${asmBaseUrl}#animal_control?id=${iid}`;
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
        color: "#f5a623",
        weight: 1,
        fillColor: "#f06a6a",
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

function renderDistrictCalls(data) {
  const districts = data.districts || [];
  const monthLabel = new Date(Date.UTC(Number(data.year), Number(data.month) - 1, 1))
    .toLocaleString(undefined, { month: "long", year: "numeric" });

  els.districtCallsMeta.textContent = data.available === false
    ? `${monthLabel} | ${data.error || "Animal Control data unavailable."}`
    : `${monthLabel} | Source: ${data.sourceMethod} | Rows: ${data.rowCount}`;

  if (!districts.length) {
    els.districtCallsTable.innerHTML = `<span style="color:var(--muted)">${data.available === false ? (data.error || "Animal Control data unavailable.") : "No district call data found for this month."}</span>`;
    return;
  }

  const blocks = districts.map((district) => {
    const rows = (district.incidentTypes || []).map((item) => (
      `<tr><td style="text-align:right;width:60px">${item.count}</td><td>${item.label}</td></tr>`
    )).join("");
    return `
      <div style="margin-bottom:0.95rem">
        <div class="card-label" style="margin-bottom:0.35rem">${district.district} (${district.total})</div>
        <table class="report-table">
          <thead><tr><th style="width:70px">Count</th><th>Incident Type</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }).join("");

  els.districtCallsTable.innerHTML = blocks;
}

function formatShortDateTime(value) {
  const d = value ? new Date(value) : null;
  if (!d || Number.isNaN(d.getTime())) return "";
  return d.toLocaleString();
}

function renderCallsByType(data) {
  const groups = data.types || [];
  els.callsByTypeMeta.textContent = data.available === false
    ? `${data.fromDate} to ${data.toDate} | ${data.error || "Animal Control data unavailable."}`
    : `${data.fromDate} to ${data.toDate} | Source: ${data.sourceMethod} | Rows: ${data.rowCount}`;

  if (!groups.length) {
    els.callsByTypeTable.innerHTML = `<span style="color:var(--muted)">${data.available === false ? (data.error || "Animal Control data unavailable.") : "No call records found for this date range."}</span>`;
    return;
  }

  const blocks = groups.map((group) => {
    const rows = (group.rows || []).map((row) => `
      <tr>
        <td>${formatShortDateTime(row.date)}</td>
        <td>${row.incidentCode || ""}</td>
        <td>${row.caller || ""}</td>
        <td>${row.dispatch || ""}</td>
        <td>${row.notes || ""}</td>
        <td>${row.dispatched || ""}</td>
        <td>${row.completed || ""}</td>
      </tr>
    `).join("");
    return `
      <div style="margin-bottom:1rem">
        <div class="card-label" style="margin-bottom:0.35rem">${group.incidentType} — Total ${group.total}</div>
        <table class="report-table">
          <thead>
            <tr>
              <th>Date</th><th>Code</th><th>Caller</th><th>Address</th><th>Notes</th><th>Dispatched</th><th>Completed</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }).join("");

  els.callsByTypeTable.innerHTML = blocks;
}

async function loadDistrictCalls() {
  const month = Number.parseInt(`${els.districtCallsMonth?.value || ""}`, 10);
  const year = Number.parseInt(`${els.districtCallsYear?.value || ""}`, 10);
  if (!Number.isFinite(month) || month < 1 || month > 12) {
    els.districtCallsMeta.textContent = "Month must be between 1 and 12.";
    return;
  }
  if (!Number.isFinite(year) || year < 2000 || year > 2100) {
    els.districtCallsMeta.textContent = "Year must be between 2000 and 2100.";
    return;
  }
  els.districtCallsRunBtn.disabled = true;
  els.districtCallsMeta.textContent = "Loading monthly district calls...";
  try {
    const params = new URLSearchParams({ month: `${month}`, year: `${year}` });
    const data = await api(`/api/admin/reporting/monthly-district-calls?${params.toString()}`);
    renderDistrictCalls(data);
  } catch (error) {
    els.districtCallsMeta.textContent = error.message || "Failed to load monthly district calls.";
    els.districtCallsTable.innerHTML = "";
  } finally {
    els.districtCallsRunBtn.disabled = false;
  }
}

async function loadCallsByType() {
  const fromDate = `${els.callsByTypeFromDate?.value || ""}`.trim();
  const toDate = `${els.callsByTypeToDate?.value || ""}`.trim();
  if (!fromDate || !toDate) {
    els.callsByTypeMeta.textContent = "Select both From Date and To Date.";
    return;
  }
  els.callsByTypeRunBtn.disabled = true;
  els.callsByTypeMeta.textContent = "Loading calls-by-type report...";
  try {
    const params = new URLSearchParams({ fromDate, toDate });
    const data = await api(`/api/admin/reporting/calls-by-type?${params.toString()}`);
    renderCallsByType(data);
  } catch (error) {
    els.callsByTypeMeta.textContent = error.message || "Failed to load calls-by-type report.";
    els.callsByTypeTable.innerHTML = "";
  } finally {
    els.callsByTypeRunBtn.disabled = false;
  }
}

els.districtCallsRunBtn?.addEventListener("click", loadDistrictCalls);
els.callsByTypeRunBtn?.addEventListener("click", loadCallsByType);

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
  const now = new Date();
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
  els.fromDate.value = firstDay.toISOString().slice(0, 10);
  els.toDate.value = now.toISOString().slice(0, 10);

  if (els.districtCallsMonth) els.districtCallsMonth.value = String(now.getMonth() + 1);
  if (els.districtCallsYear) els.districtCallsYear.value = String(now.getFullYear());
  if (els.callsByTypeFromDate) els.callsByTypeFromDate.value = firstDay.toISOString().slice(0, 10);
  if (els.callsByTypeToDate) els.callsByTypeToDate.value = now.toISOString().slice(0, 10);

  await loadHeatMap();
  await loadDistrictCalls();
  await loadCallsByType();
})();
