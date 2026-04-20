const els = {
  refreshBtn: document.getElementById("refreshBtn"),
  logoutBtn: document.getElementById("logoutBtn"),
  generatedAtText: document.getElementById("generatedAtText"),
  statusText: document.getElementById("statusText"),
  cacheText: document.getElementById("cacheText"),
  metricAdoptable: document.getElementById("metricAdoptable"),
  metricShelter: document.getElementById("metricShelter"),
  metricHeld: document.getElementById("metricHeld"),
  metricStray: document.getElementById("metricStray"),
  metricRecentAdoptions: document.getElementById("metricRecentAdoptions"),
  speciesChart: document.getElementById("speciesChart"),
  speciesInCareChart: document.getElementById("speciesInCareChart"),
  monthlyChart: document.getElementById("monthlyChart"),
  recentChart: document.getElementById("recentChart"),
  compositionChart: document.getElementById("compositionChart"),
  monthlyTable: document.getElementById("monthlyTable"),
  donationTicker: document.getElementById("donationTicker"),
  yearlyReviewsBox: document.getElementById("yearlyReviewsBox"),
  linkedDashboardCharts: document.getElementById("linkedDashboardCharts")
};

const chartState = {
  species: null,
  speciesInCare: null,
  monthly: null,
  recent: null,
  composition: null
};

let linkedDashboardChartState = [];
const API_TIMEOUT_MS = 20000;

const SPECIES_COLOR_MAP = {
  dog: "#4da3ff",
  dogs: "#4da3ff",
  cat: "#f5a623",
  cats: "#f5a623",
  rabbit: "#34c47c",
  rabbits: "#34c47c",
  bird: "#f06a6a",
  birds: "#f06a6a",
  guinea: "#8ed0ff",
  "guinea pig": "#8ed0ff",
  "guinea pigs": "#8ed0ff",
  ferret: "#d0d6de",
  ferrets: "#d0d6de",
  unknown: "#9aa9b5"
};

const SPECIES_FALLBACK_COLORS = ["#7cb342", "#26a69a", "#5c6bc0", "#ab47bc", "#ffa726", "#8d6e63"];

function getSpeciesColor(label, index) {
  const key = `${label || "Unknown"}`.trim().toLowerCase();
  return SPECIES_COLOR_MAP[key] || SPECIES_FALLBACK_COLORS[index % SPECIES_FALLBACK_COLORS.length];
}

async function api(url, opts = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  let response;
  try {
    response = await fetch(url, {
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        ...(opts.headers || {})
      },
      ...opts,
      signal: opts.signal || controller.signal
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("Request timed out while loading report data.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || `HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return payload;
}

function formatDateTime(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleString();
}

function formatMonthLabel(value) {
  const [y, m] = `${value || ""}`.split("-");
  const year = Number(y);
  const month = Number(m);
  if (!year || !month) return value;
  const date = new Date(Date.UTC(year, month - 1, 1));
  return date.toLocaleString(undefined, { month: "short", year: "2-digit" });
}

function setSummary(summary = {}) {
  els.metricAdoptable.textContent = `${summary.adoptableCount ?? "-"}`;
  els.metricShelter.textContent = `${summary.shelterCount ?? "-"}`;
  els.metricHeld.textContent = `${summary.heldCount ?? "-"}`;
  els.metricStray.textContent = `${summary.strayCount ?? "-"}`;
  els.metricRecentAdoptions.textContent = `${summary.recentAdoptionsCount ?? "-"}`;
}

function destroyCharts() {
  for (const key of Object.keys(chartState)) {
    chartState[key]?.destroy();
    chartState[key] = null;
  }
}

function destroyLinkedDashboardCharts() {
  linkedDashboardChartState.forEach((chart) => {
    try { chart.destroy(); } catch { /* ignore */ }
  });
  linkedDashboardChartState = [];
}

function stripHtml(value) {
  const str = `${value ?? ""}`;
  if (!str.includes("<")) return str;
  const tmp = document.createElement("div");
  tmp.innerHTML = str;
  return tmp.textContent || tmp.innerText || "";
}

function buildFieldReader(row) {
  const normalizedKeyMap = new Map();
  const lowerKeyMap = new Map();
  Object.entries(row || {}).forEach(([key, value]) => {
    lowerKeyMap.set(`${key}`.toLowerCase(), value);
    normalizedKeyMap.set(`${key}`.toLowerCase().replace(/[^a-z0-9]/g, ""), value);
  });

  const getRawField = (key) => {
    const direct = (row || {})[key];
    if (direct !== undefined && direct !== null) return direct;
    const normalizedKey = `${key}`.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (normalizedKeyMap.has(normalizedKey)) return normalizedKeyMap.get(normalizedKey);
    return lowerKeyMap.get(`${key}`.toLowerCase());
  };

  return {
    getField: (key) => stripHtml(getRawField(key))
  };
}

function aggregateFieldCounts(rows, fieldKey) {
  const counts = new Map();
  rows.forEach((row) => {
    const { getField } = buildFieldReader(row);
    const value = `${getField(fieldKey) ?? ""}`.trim();
    if (!value) return;
    counts.set(value, (counts.get(value) || 0) + 1);
  });
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  if (sorted.length <= 10) return sorted;
  const top = sorted.slice(0, 10);
  const otherCount = sorted.slice(10).reduce((sum, [, count]) => sum + count, 0);
  if (otherCount > 0) top.push(["Other", otherCount]);
  return top;
}

function getSlotConfig(report, slot) {
  const chartKey = slot === "left" ? "chartLeft" : "chartRight";
  const titleKey = slot === "left" ? "chartLeftTitle" : "chartRightTitle";
  const typeKey = slot === "left" ? "chartLeftType" : "chartRightType";
  const fields = Array.isArray(report.fields) ? report.fields : [];
  const field = fields.find((f) => f && f[chartKey]);
  if (!field) return null;
  const allowed = new Set(["bar", "line", "pie", "doughnut"]);
  const chartType = `${report[typeKey] || "bar"}`.trim().toLowerCase();
  return {
    slot,
    type: allowed.has(chartType) ? chartType : "bar",
    fieldKey: field.key,
    fieldLabel: field.label || field.key,
    title: `${report[titleKey] || ""}`.trim() || `${field.label || field.key}`.trim()
  };
}

async function loadLinkedReportDashboardCharts() {
  if (!els.linkedDashboardCharts) return;

  destroyLinkedDashboardCharts();
  els.linkedDashboardCharts.innerHTML = '<article class="card chart-card" data-layout-item data-layout-id="chart-linked-loading"><div class="card-label">LINKED REPORT CHARTS</div><span class="linked-dashboard-note">Loading linked report charts...</span></article>';

  let reports = [];
  try {
    const linked = await api("/api/admin/reporting/linked-reports");
    reports = (linked.reports || []).filter((r) => r && r.showChartsOnDashboard);
  } catch {
    els.linkedDashboardCharts.innerHTML = '<article class="card chart-card" data-layout-item data-layout-id="chart-linked-error"><div class="card-label">LINKED REPORT CHARTS</div><span class="linked-dashboard-note">Unable to load linked report definitions.</span></article>';
    return;
  }

  if (!reports.length) {
    els.linkedDashboardCharts.innerHTML = '<article class="card chart-card" data-layout-item data-layout-id="chart-linked-empty"><div class="card-label">LINKED REPORT CHARTS</div><span class="linked-dashboard-note">No linked reports are configured to show charts on dashboard.</span></article>';
    return;
  }

  const reportRows = [];
  for (const report of reports) {
    try {
      const data = await api(`/api/admin/reporting/linked-reports/${encodeURIComponent(report.id)}/data`);
      reportRows.push({ report, data });
    } catch (error) {
      reportRows.push({ report, data: { available: false, error: error.message || "Failed to load linked report." } });
    }
  }

  const blocks = [];
  reportRows.forEach(({ report, data }) => {
    const reportTitle = esc(report.title || "Linked Report");
    const slots = [getSlotConfig(report, "left"), getSlotConfig(report, "right")].filter(Boolean);

    if (!data.available) {
      blocks.push(`<article class="card chart-card" data-layout-item data-layout-id="chart-linked-${esc(report.id)}-error"><div class="card-label">${reportTitle} — CHARTS</div><span class="linked-dashboard-note">${esc(data.error || "Report unavailable.")}</span></article>`);
      return;
    }

    if (!slots.length) {
      blocks.push(`<article class="card chart-card" data-layout-item data-layout-id="chart-linked-${esc(report.id)}-empty"><div class="card-label">${reportTitle} — CHARTS</div><span class="linked-dashboard-note">No chart fields configured for this report.</span></article>`);
      return;
    }

    slots.forEach((slot) => {
      const canvasId = `linkedDashChart-${esc(report.id)}-${slot.slot}`;
      blocks.push(`<article class="card chart-card" data-layout-item data-layout-id="chart-linked-${esc(report.id)}-${slot.slot}"><div class="card-label">${reportTitle} — ${esc(slot.title)}</div><canvas id="${canvasId}" aria-label="${esc(slot.title)}"></canvas></article>`);
    });
  });

  els.linkedDashboardCharts.innerHTML = blocks.join("");

  const palette = ["#f5a623", "#f9c156", "#6cb2eb", "#5dd39e", "#f08a5d", "#9b88ff", "#f06292", "#4dd0e1", "#ffd166", "#8bc34a", "#90a4ae"];

  reportRows.forEach(({ report, data }) => {
    if (!data.available) return;
    const rows = Array.isArray(data.rows) ? data.rows : [];
    [getSlotConfig(report, "left"), getSlotConfig(report, "right")].filter(Boolean).forEach((slot) => {
      const canvas = document.getElementById(`linkedDashChart-${report.id}-${slot.slot}`);
      if (!canvas) return;
      const pairs = aggregateFieldCounts(rows, slot.fieldKey);
      if (!pairs.length) {
        canvas.outerHTML = `<div class="linked-dashboard-note">No values for ${esc(slot.fieldLabel)}.</div>`;
        return;
      }
      const labels = pairs.map(([label]) => label);
      const values = pairs.map(([, count]) => count);
      const chart = new Chart(canvas, {
        type: slot.type,
        data: {
          labels,
          datasets: [{
            label: slot.title,
            data: values,
            backgroundColor: slot.type === "line" ? "#f5a623" : palette,
            borderColor: slot.type === "line" ? "#f5a623" : palette,
            borderWidth: slot.type === "line" ? 2 : 1,
            tension: slot.type === "line" ? 0.25 : 0
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: slot.type === "pie" || slot.type === "doughnut", labels: { color: "#dceaf5" } }
          },
          scales: slot.type === "pie" || slot.type === "doughnut" ? {} : {
            x: { ticks: { color: "#9ab3c7" }, grid: { color: "rgba(255,255,255,0.06)" } },
            y: { ticks: { color: "#9ab3c7", precision: 0 }, grid: { color: "rgba(255,255,255,0.06)" }, beginAtZero: true }
          }
        }
      });
      linkedDashboardChartState.push(chart);
    });
  });
}

function renderCharts(data) {
  const speciesLabels = (data.species || []).map((item) => item.label || "Unknown");
  const speciesValues = (data.species || []).map((item) => Number(item.count || 0));
  const speciesColors = speciesLabels.map((label, i) => getSpeciesColor(label, i));

  chartState.species = new Chart(els.speciesChart, {
    type: "pie",
    data: {
      labels: speciesLabels,
      datasets: [{
        data: speciesValues,
        backgroundColor: speciesColors,
        borderColor: "rgba(7,17,27,0.9)",
        borderWidth: 1
      }]
    },
    options: {
      plugins: { legend: { labels: { color: "#dceaf5" } } }
    }
  });

  const inCareLabels = (data.speciesInCare || []).map((item) => item.label || "Unknown");
  const inCareValues = (data.speciesInCare || []).map((item) => Number(item.count || 0));
  const inCareColors = inCareLabels.map((label, i) => getSpeciesColor(label, i));
  chartState.speciesInCare = new Chart(els.speciesInCareChart, {
    type: "pie",
    data: {
      labels: inCareLabels,
      datasets: [{
        data: inCareValues,
        backgroundColor: inCareColors,
        borderColor: "rgba(7,17,27,0.9)",
        borderWidth: 1
      }]
    },
    options: {
      plugins: { legend: { labels: { color: "#dceaf5" } } }
    }
  });

  chartState.monthly = new Chart(els.monthlyChart, {
    type: "bar",
    data: {
      labels: (data.monthlyAdoptions?.labels || []).map(formatMonthLabel),
      datasets: [{
        label: "Adoptions",
        data: data.monthlyAdoptions?.values || [],
        backgroundColor: "rgba(245,166,35,0.65)",
        borderColor: "#f5a623",
        borderWidth: 1
      }]
    },
    options: {
      scales: {
        x: { ticks: { color: "#9ab3c7" }, grid: { color: "rgba(255,255,255,0.06)" } },
        y: { ticks: { color: "#9ab3c7", precision: 0 }, grid: { color: "rgba(255,255,255,0.06)" } }
      },
      plugins: { legend: { labels: { color: "#dceaf5" } } }
    }
  });

  const recentRaw = data.recentAdoptions || {};
  const recentPairs = (recentRaw.labels || [])
    .map((lbl, i) => ({ lbl, val: Number(recentRaw.values?.[i] || 0) }))
    .filter((p) => p.val > 0);
  chartState.recent = new Chart(els.recentChart, {
    type: "line",
    data: {
      labels: recentPairs.map((p) => p.lbl),
      datasets: [{
        label: "Adoptions",
        data: recentPairs.map((p) => p.val),
        tension: 0.25,
        fill: true,
        borderColor: "#34c47c",
        backgroundColor: "rgba(52,196,124,0.16)",
        pointRadius: 3
      }]
    },
    options: {
      scales: {
        x: { ticks: { display: false }, grid: { color: "rgba(255,255,255,0.06)" } },
        y: { ticks: { color: "#9ab3c7", precision: 0 }, grid: { color: "rgba(255,255,255,0.06)" } }
      },
      plugins: { legend: { labels: { color: "#dceaf5" } } }
    }
  });

  const summary = data.summary || {};
  chartState.composition = new Chart(els.compositionChart, {
    type: "bar",
    data: {
      labels: ["Adoptable", "In Shelter", "Stray", "Held"],
      datasets: [{
        label: "Count",
        data: [
          Number(summary.adoptableCount || 0),
          Number(summary.shelterCount || 0),
          Number(summary.strayCount || 0),
          Number(summary.heldCount || 0)
        ],
        backgroundColor: ["#f5a623", "#4da3ff", "#8ed0ff", "#d0d6de"],
        borderRadius: 5,
        borderSkipped: false
      }]
    },
    options: {
      indexAxis: "y",
      scales: {
        x: { ticks: { color: "#9ab3c7", precision: 0 }, grid: { color: "rgba(255,255,255,0.06)" } },
        y: { ticks: { color: "#dceaf5" }, grid: { display: false } }
      },
      plugins: { legend: { display: false } }
    }
  });
}

function renderMonthlyTable(data) {
  const labels = data.monthlyAdoptions?.labels || [];
  const values = data.monthlyAdoptions?.values || [];
  if (!labels.length) {
    els.monthlyTable.innerHTML = `<span style="color:var(--muted)">No data.</span>`;
    return;
  }
  const rows = labels.map((label, i) => {
    const [y, m] = `${label}`.split("-");
    const dateObj = new Date(Date.UTC(Number(y), Number(m) - 1, 1));
    const display = dateObj.toLocaleString(undefined, { month: "long", year: "numeric" });
    const count = Number(values[i] ?? 0);
    return `<tr><td>${display}</td><td>${count}</td></tr>`;
  }).reverse().join("");
  els.monthlyTable.innerHTML = `
    <table class="monthly-table">
      <thead><tr><th>Month</th><th style="text-align:right">Adoptions</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
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

async function loadOverview() {
  els.refreshBtn.disabled = true;
  els.generatedAtText.textContent = "Loading reporting data...";
  try {
    const data = await api("/api/admin/reporting/overview");
    setSummary(data.summary || {});
    destroyCharts();
    renderCharts(data);
    renderMonthlyTable(data);
    await loadLinkedReportDashboardCharts();
    els.generatedAtText.textContent = `Last updated: ${formatDateTime(data.generatedAt)}`;
    els.generatedAtText.dataset.generatedAt = data.generatedAt || "";
    const ageMin = Math.floor((data.cacheAgeSeconds || 0) / 60);
    els.cacheText.textContent = ageMin < 2 ? "Data is fresh." : `Snapshot is ${ageMin} min old \u2014 updates hourly.`;
    els.statusText.textContent = "Data sources loaded successfully.";
  } catch (error) {
    els.generatedAtText.textContent = "Failed to load reporting data.";
    els.statusText.textContent = error.message || "Unknown reporting error.";
    els.cacheText.textContent = "";
  } finally {
    els.refreshBtn.disabled = false;
  }
}

async function triggerRefresh() {
  els.refreshBtn.disabled = true;
  els.generatedAtText.textContent = "Requesting data refresh from ASM...";
  try {
    await api("/api/admin/reporting/refresh", { method: "POST" });
    // Poll until generatedAt is newer than now, or 90s timeout
    const startedAt = Date.now();
    const prevGeneratedAt = els.generatedAtText.dataset.generatedAt || "";
    const poll = async () => {
      if (Date.now() - startedAt > 90000) {
        await loadOverview();
        return;
      }
      try {
        const data = await api("/api/admin/reporting/overview");
        if (data.generatedAt && data.generatedAt !== prevGeneratedAt) {
          setSummary(data.summary || {});
          destroyCharts();
          renderCharts(data);
          renderMonthlyTable(data);
          await loadLinkedReportDashboardCharts();
          els.generatedAtText.textContent = `Last updated: ${formatDateTime(data.generatedAt)}`;
          els.generatedAtText.dataset.generatedAt = data.generatedAt;
          els.cacheText.textContent = "Refreshed just now.";
          els.statusText.textContent = "Data sources loaded successfully.";
          els.refreshBtn.disabled = false;
        } else {
          setTimeout(poll, 3000);
        }
      } catch {
        await loadOverview();
      }
    };
    setTimeout(poll, 3000);
  } catch (error) {
    els.generatedAtText.textContent = "Refresh request failed.";
    els.statusText.textContent = error.message || "Unknown error.";
    els.refreshBtn.disabled = false;
  }
}

els.refreshBtn?.addEventListener("click", triggerRefresh);

function esc(value) {
  return `${value ?? ""}`
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

async function loadDonationTicker() {
  if (!els.donationTicker) return;
  try {
    const data = await api("/api/admin/reporting/donations-and-thank-yous");
    const rows = (data.rows || []).filter((r) => r.ownerName);
    if (!rows.length) {
      els.donationTicker.innerHTML = '<span style="color:var(--muted);font-size:0.84rem">No donations pending thank yous.</span>';
      return;
    }
    const items = rows.map((r) => {
      const amount = r.donation ? `<span class="t-amount">$${esc(r.donation)}</span>` : "";
      return `<span class="ticker-item"><span class="t-name">${esc(r.ownerName)}</span>${amount}<span class="t-thanks">Thank you!</span></span>`;
    }).join("");
    const speed = Math.max(15, Math.min(60, rows.length * 4));
    els.donationTicker.innerHTML = `<span class="ticker-inner" style="animation-duration:${speed}s">${items}${items}</span>`;
  } catch {
    els.donationTicker.innerHTML = '<span style="color:var(--muted);font-size:0.84rem">Unable to load donations.</span>';
  }
}

async function loadYearlyReviewsUpcomingBox() {
  if (!els.yearlyReviewsBox) return;
  try {
    const data = await api("/api/admin/reporting/yearly-reviews-upcoming");
    const rows = data.rows || [];
    if (!rows.length) {
      els.yearlyReviewsBox.innerHTML = '<span style="color:var(--muted);font-size:0.84rem">No yearly reviews due this month.</span>';
      return;
    }

    const visibleRows = rows.slice(0, 8).map((row) => `
      <div class="mini-row">
        <span class="mini-name">${esc(row.ownerName)}</span>
        <span class="mini-date">${esc(row.value)}</span>
      </div>
    `).join("");

    const hiddenCount = Math.max(0, rows.length - 8);
    els.yearlyReviewsBox.innerHTML = `${visibleRows}
      <div class="mini-total">Total this month: ${rows.length}${hiddenCount ? ` (${hiddenCount} more)` : ""}</div>`;
  } catch {
    els.yearlyReviewsBox.innerHTML = '<span style="color:var(--muted);font-size:0.84rem">Unable to load yearly reviews.</span>';
  }
}


els.logoutBtn?.addEventListener("click", async () => {
  try {
    await api("/api/admin/session/logout", { method: "POST" });
  } catch {
    // Even if logout request fails, move to login page.
  }
  window.location.replace("/reporting-login.html");
});

(async () => {
  const ok = await ensureAuth();
  if (!ok) return;
  await Promise.all([loadOverview(), loadDonationTicker(), loadYearlyReviewsUpcomingBox()]);
})();
