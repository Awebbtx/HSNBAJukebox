// admin-linked-report.js — viewer for a single linked report
"use strict";

async function api(url, opts = {}) {
  const response = await fetch(url, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
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

// ── Auth / logout ──────────────────────────────────────────────────────────────

const logoutBtn = document.getElementById("logoutBtn");
logoutBtn?.addEventListener("click", async () => {
  try { await api("/api/admin/session/logout", { method: "POST" }); } catch { /* ignore */ }
  window.location.replace("/reporting-login.html");
});

try {
  await api("/api/admin/account/me");
} catch (err) {
  if (err.status === 401 || err.status === 403) {
    window.location.replace("/reporting-login.html");
  }
}

// ── Elements ──────────────────────────────────────────────────────────────────

const titleEl   = document.getElementById("reportTitle");
const metaEl    = document.getElementById("metaText");
const bodyEl    = document.getElementById("reportBody");
const refreshBtn = document.getElementById("refreshBtn");
const DEFAULT_ASM_BASE_URL = "https://us10d.sheltermanager.com";

// ── ID from URL ───────────────────────────────────────────────────────────────

const reportId = new URLSearchParams(window.location.search).get("id") || "";

if (!reportId) {
  titleEl.textContent = "No report ID";
  metaEl.textContent = "Use the Shelter Reports page to open a linked report.";
  bodyEl.innerHTML = "";
  throw new Error("No id param");
}

function buildLinkedReportDataUrl() {
  return `/api/admin/reporting/linked-reports/${encodeURIComponent(reportId)}/data`;
}

// ── Render ────────────────────────────────────────────────────────────────────

/**
 * Given a linked report config and a raw row from ASM, produce an RC.card.
 * - fields[0] (lowest order) → title
 * - remaining non-expanded fields → RC.chip()
 * - expanded fields → RC.field() in the detail panel
 */
function buildAsmRowLink(report, row) {
  const template = `${report?.linkTemplate || ""}`.trim();
  const keyMap = new Map();
  for (const [k, v] of Object.entries(row || {})) {
    keyMap.set(`${k}`.toLowerCase(), v);
  }

  const getByAliases = (aliases) => aliases
    .map((k) => keyMap.get(`${k}`.toLowerCase()))
    .find((v) => `${v || ""}`.trim());

  const getTemplateValue = (rawKey) => {
    const key = `${rawKey || ""}`.trim();
    if (!key) return "";

    const direct = keyMap.get(key.toLowerCase());
    if (`${direct || ""}`.trim()) {
      return `${direct}`;
    }

    const normalizedWanted = key.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (normalizedWanted) {
      for (const [mapKey, value] of keyMap.entries()) {
        if (!`${value || ""}`.trim()) continue;
        if (mapKey.replace(/[^a-z0-9]/g, "") === normalizedWanted) {
          return `${value}`;
        }
      }
    }

    // If template asks for ID-style keys, prefer known animal-id variants.
    if (normalizedWanted === "id" || normalizedWanted === "animalid") {
      const animalIdValue = getByAliases(["animalid", "animal_id", "animal id", "id"]);
      if (`${animalIdValue || ""}`.trim()) {
        return `${animalIdValue}`;
      }
    }

    return "";
  };

  if (!template) {
    const directUrl = getByAliases(["asmanimalurl", "animalurl", "asmpersonurl", "personurl", "asmurl"]);

    if (directUrl) {
      const href = `${directUrl}`.trim();
      const label = report?.linkLabel ? RC.esc(report.linkLabel) : "Open in ASM";
      return `<a href="${RC.esc(href)}" target="_blank" rel="noopener noreferrer">${label}</a>`;
    }

    const animalId = getByAliases(["animalid", "animal_id", "animal id"]);
    const personId = getByAliases(["personid", "person_id", "person id"]);
    let href = "";

    if (`${animalId || ""}`.trim()) {
      href = `${DEFAULT_ASM_BASE_URL}/animal?id=${encodeURIComponent(`${animalId}`.trim())}`;
    } else if (`${personId || ""}`.trim()) {
      href = `${DEFAULT_ASM_BASE_URL}/person?id=${encodeURIComponent(`${personId}`.trim())}`;
    } else {
      return "";
    }

    const label = report?.linkLabel ? RC.esc(report.linkLabel) : "Open in ASM";
    return `<a href="${RC.esc(href)}" target="_blank" rel="noopener noreferrer">${label}</a>`;
  }

  const expanded = template.replace(/\{\{\s*([^}]+)\s*\}\}/g, (_m, key) => {
    const value = getTemplateValue(key);
    return value == null ? "" : `${value}`;
  }).trim();

  if (!expanded) return "";

  let href = expanded;
  if (/^\//.test(href)) {
    href = `${DEFAULT_ASM_BASE_URL}${href}`;
  } else if (/^(animal|person)\?id=/i.test(href)) {
    href = `${DEFAULT_ASM_BASE_URL}/${href}`;
  }
  if (!/^https?:\/\//i.test(href)) {
    return "";
  }

  try {
    const url = new URL(href, DEFAULT_ASM_BASE_URL);
    if (/sheltermanager\.com$/i.test(url.hostname)) {
      // Keep links on the known regional host for consistency.
      url.hostname = "us10d.sheltermanager.com";
    }
    href = url.toString();
  } catch {
    return "";
  }

  const label = report?.linkLabel ? RC.esc(report.linkLabel) : "Open in ASM";
  return `<a href="${RC.esc(href)}" target="_blank" rel="noopener noreferrer">${label}</a>`;
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
  for (const [k, v] of Object.entries(row || {})) {
    lowerKeyMap.set(`${k}`.toLowerCase(), v);
    normalizedKeyMap.set(`${k}`.toLowerCase().replace(/[^a-z0-9]/g, ""), v);
  }

  const getRawField = (key) => {
    const direct = (row || {})[key];
    if (direct !== undefined && direct !== null) return direct;
    const normalizedKey = `${key}`.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (normalizedKeyMap.has(normalizedKey)) return normalizedKeyMap.get(normalizedKey);
    return lowerKeyMap.get(`${key}`.toLowerCase());
  };

  const getField = (key) => stripHtml(getRawField(key));
  return { getRawField, getField };
}

function buildCard(report, fields, row, options = {}) {
  const { getField } = buildFieldReader(row);
  const hiddenKeys = new Set((options.hiddenKeys || []).map((key) => `${key || ""}`.trim()).filter(Boolean));

  const rowLink = buildAsmRowLink(report, row);
  const linkIcon = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M14 3h7v7h-2V6.41l-8.29 8.3-1.42-1.42 8.3-8.29H14V3zm5 16V11h2v10H3V3h10v2H5v14h14z"/></svg>';
  const headerAction = rowLink
    ? rowLink.replace("<a ", '<a class="rc-link-icon" aria-label="Open in ASM" title="Open in ASM" onclick="event.stopPropagation()" onkeydown="event.stopPropagation()" ').replace(/>[^<]*<\/a>$/, `>${linkIcon}</a>`)
    : "";
  if (!fields.length) {
    // No field config — just show key=value pairs
    const allKeys = Object.keys(row || {}).filter((key) => !hiddenKeys.has(key));
    const title = allKeys.length ? stripHtml(row[allKeys[0]] ?? "") : "(empty row)";
    const detailFields = allKeys.slice(1).map((k) => RC.field(k, stripHtml(row[k]))).filter(Boolean);
    return RC.card({ title: RC.esc(title), fields: detailFields, headerAction });
  }

  const sorted = [...fields].sort((a, b) => a.order - b.order);
  const visibleFields = sorted.filter((field) => !hiddenKeys.has(field.key));
  const titleField = visibleFields[0] || sorted[0];
  const titleValue = titleField ? (`${getField(titleField.key) ?? ""}`.trim() || "(blank)") : "(record)";

  const chips = visibleFields
    .slice(1)
    .filter((f) => !f.expanded)
    .map((f) => {
      const v = `${getField(f.key) ?? ""}`.trim();
      return v ? RC.chip(f.label ? `${f.label}: ` : "", v) : "";
    })
    .filter(Boolean);

  const detailFields = visibleFields
    .filter((f) => f.expanded)
    .map((f) => RC.field(f.label || f.key, getField(f.key)))
    .filter(Boolean);

  return RC.card({
    title: RC.esc(titleValue),
    chips,
    fields: detailFields,
    toggle: "Details",
    headerAction
  });
}

function buildGroupedCards(report, fields, rows) {
  const sortedFields = [...fields].sort((a, b) => a.order - b.order);
  const groupField = sortedFields.find((field) => field.groupBy);
  const hiddenKeys = groupField ? [groupField.key] : [];
  const cards = rows.map((row) => buildCard(report, fields, row, { hiddenKeys }));

  if (!groupField) {
    return RC.list(cards, rows.length);
  }

  const grouped = new Map();
  for (const row of rows) {
    const { getField } = buildFieldReader(row);
    const groupValue = `${getField(groupField.key) ?? ""}`.trim() || "(blank)";
    if (!grouped.has(groupValue)) grouped.set(groupValue, []);
    grouped.get(groupValue).push(buildCard(report, fields, row, { hiddenKeys }));
  }

  const groupSections = [...grouped.entries()]
    .map(([groupValue, groupCards]) => RC.group(groupValue, groupCards.length, groupCards.join("")));

  return RC.list(groupSections, rows.length);
}

let linkedReportCharts = [];

function destroyLinkedReportCharts() {
  for (const chart of linkedReportCharts) {
    try { chart.destroy(); } catch { /* ignore */ }
  }
  linkedReportCharts = [];
}

function aggregateFieldCounts(rows, fieldKey) {
  const counts = new Map();
  for (const row of rows) {
    const { getField } = buildFieldReader(row);
    const value = `${getField(fieldKey) ?? ""}`.trim();
    if (!value) continue;
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  if (sorted.length <= 10) {
    return sorted;
  }
  const head = sorted.slice(0, 10);
  const otherTotal = sorted.slice(10).reduce((sum, [, count]) => sum + count, 0);
  if (otherTotal > 0) head.push(["Other", otherTotal]);
  return head;
}

function getChartSlotConfig(report, fields, slot) {
  const chartKey = slot === "left" ? "chartLeft" : "chartRight";
  const titleKey = slot === "left" ? "chartLeftTitle" : "chartRightTitle";
  const typeKey = slot === "left" ? "chartLeftType" : "chartRightType";
  const slotField = fields.find((field) => field && field[chartKey]);
  if (!slotField) return null;

  const chartType = `${report?.[typeKey] || "bar"}`.trim().toLowerCase();
  const allowed = new Set(["bar", "line", "pie", "doughnut"]);
  const safeType = allowed.has(chartType) ? chartType : "bar";
  const label = `${report?.[titleKey] || ""}`.trim() || `${slotField.label || slotField.key}`.trim();

  return {
    slot,
    fieldKey: slotField.key,
    fieldLabel: slotField.label || slotField.key,
    title: label,
    type: safeType
  };
}

function buildLinkedChartMarkup(slotConfigs) {
  if (!slotConfigs.length) return "";
  return `<section class="linked-chart-grid">${slotConfigs.map((cfg) => `
    <article class="linked-chart-card" data-slot="${RC.esc(cfg.slot)}">
      <h3 class="linked-chart-title">${RC.esc(cfg.title)}</h3>
      <canvas id="linkedChart-${RC.esc(cfg.slot)}" class="linked-chart-canvas" aria-label="${RC.esc(cfg.title)}"></canvas>
      <div class="linked-chart-empty" id="linkedChartEmpty-${RC.esc(cfg.slot)}" style="display:none"></div>
    </article>
  `).join("")}</section>`;
}

function renderLinkedCharts(slotConfigs, rows) {
  destroyLinkedReportCharts();
  if (!slotConfigs.length) return;

  if (typeof Chart === "undefined") {
    slotConfigs.forEach((cfg) => {
      const empty = document.getElementById(`linkedChartEmpty-${cfg.slot}`);
      const canvas = document.getElementById(`linkedChart-${cfg.slot}`);
      if (canvas) canvas.style.display = "none";
      if (empty) {
        empty.style.display = "block";
        empty.textContent = "Chart library unavailable.";
      }
    });
    return;
  }

  const palette = [
    "#f5a623",
    "#f9c156",
    "#6cb2eb",
    "#5dd39e",
    "#f08a5d",
    "#9b88ff",
    "#f06292",
    "#4dd0e1",
    "#ffd166",
    "#8bc34a",
    "#90a4ae"
  ];

  slotConfigs.forEach((cfg) => {
    const canvas = document.getElementById(`linkedChart-${cfg.slot}`);
    const empty = document.getElementById(`linkedChartEmpty-${cfg.slot}`);
    if (!canvas) return;

    const pairs = aggregateFieldCounts(rows, cfg.fieldKey);
    if (!pairs.length) {
      canvas.style.display = "none";
      if (empty) {
        empty.style.display = "block";
        empty.textContent = `No non-blank values found for ${cfg.fieldLabel}.`;
      }
      return;
    }

    if (empty) empty.style.display = "none";
    canvas.style.display = "block";
    const labels = pairs.map(([label]) => label);
    const values = pairs.map(([, count]) => count);
    const ctx = canvas.getContext("2d");
    const datasetColor = cfg.type === "line" ? "#f5a623" : palette;
    const chart = new Chart(ctx, {
      type: cfg.type,
      data: {
        labels,
        datasets: [{
          label: cfg.title,
          data: values,
          backgroundColor: datasetColor,
          borderColor: cfg.type === "line" ? "#f5a623" : palette,
          borderWidth: cfg.type === "line" ? 2 : 1,
          tension: cfg.type === "line" ? 0.25 : 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: cfg.type === "pie" || cfg.type === "doughnut" }
        },
        scales: cfg.type === "pie" || cfg.type === "doughnut" ? {} : {
          y: { beginAtZero: true, ticks: { precision: 0 } }
        }
      }
    });
    linkedReportCharts.push(chart);
  });
}

async function loadReport() {
  titleEl.textContent = "Loading…";
  metaEl.textContent = "Fetching from Shelter Manager…";
  bodyEl.innerHTML = `<span style="color:var(--muted)">Loading…</span>`;
  refreshBtn.disabled = true;

  try {
    const data = await api(buildLinkedReportDataUrl());

    const report = data.report || {};
    const fields = Array.isArray(report.fields) ? report.fields : [];
    const rows = Array.isArray(data.rows) ? data.rows : [];

    titleEl.textContent = report.title || "Linked Report";
    document.title = `${report.title || "Linked Report"} — HSNBA Reporting`;

    if (!data.available) {
      metaEl.textContent = `Error: ${data.error || "Report unavailable."}`;
      bodyEl.innerHTML = `<p style="color:var(--muted)">${RC.esc(data.error || "Unable to load report data.")}</p>`;
      return;
    }

    const generatedAt = new Date().toLocaleString();
    metaEl.textContent = `${rows.length} row${rows.length === 1 ? "" : "s"} — ${data.sourceMethod || ""} — Generated ${generatedAt}`;

    const slotConfigs = [
      getChartSlotConfig(report, fields, "left"),
      getChartSlotConfig(report, fields, "right")
    ].filter(Boolean);

    if (!rows.length) {
      bodyEl.innerHTML = `${buildLinkedChartMarkup(slotConfigs)}<p style="color:var(--muted)">No rows returned by this report.</p>`;
      renderLinkedCharts(slotConfigs, rows);
      return;
    }

    bodyEl.innerHTML = `${buildLinkedChartMarkup(slotConfigs)}${buildGroupedCards(report, fields, rows)}`;
    renderLinkedCharts(slotConfigs, rows);
  } catch (err) {
    destroyLinkedReportCharts();
    metaEl.textContent = `Error: ${err.message}`;
    bodyEl.innerHTML = `<p style="color:var(--muted)">${RC.esc(err.message)}</p>`;
  } finally {
    refreshBtn.disabled = false;
  }
}

refreshBtn?.addEventListener("click", loadReport);
loadReport();
