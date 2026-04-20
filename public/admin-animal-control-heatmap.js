const els = {
  logoutBtn: document.getElementById("logoutBtn"),
  fromDate: document.getElementById("fromDate"),
  toDate: document.getElementById("toDate"),
  runBtn: document.getElementById("runBtn"),
  metaText: document.getElementById("metaText"),
  hotspotsTable: document.getElementById("hotspotsTable")
};

let map;
let heatLayer;
let markerLayer;
let asmBaseUrl = "";

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
  await loadHeatMap();
})();
