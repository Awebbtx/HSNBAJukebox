const els = {
  logoutBtn: document.getElementById("logoutBtn"),
  metaText: document.getElementById("metaText"),
  tableWrap: document.getElementById("tableWrap")
};

const ASM_REPORT_BASE_URL = "https://us10d.sheltermanager.com";

function esc(value) {
  return `${value ?? ""}`
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderAnimalNameCell(rawValue) {
  const holder = document.createElement("div");
  holder.innerHTML = `${rawValue || ""}`;
  const anchor = holder.querySelector("a[href]");
  if (anchor) {
    try {
      const url = new URL(anchor.getAttribute("href"), ASM_REPORT_BASE_URL);
      if (/sheltermanager\.com$/i.test(url.hostname)) {
        url.protocol = "https:";
        url.hostname = "us10d.sheltermanager.com";
        url.port = "";
      }
      const label = (anchor.textContent || "Open").trim() || "Open";
      return `<a href="${esc(url.toString())}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>`;
    } catch {
      return esc((anchor.textContent || rawValue || "").trim());
    }
  }
  return esc((holder.textContent || `${rawValue || ""}`).trim());
}

function renderHoverTextCell(value) {
  const text = `${value ?? ""}`.trim();
  if (!text) return "";
  const safeText = esc(text);
  return `<span class="hover-note" title="${safeText}">${safeText}</span>`;
}

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

function groupByReason(rows) {
  const groups = new Map();
  for (const row of rows || []) {
    const reason = `${row.reason || "Uncategorized"}`.trim() || "Uncategorized";
    if (!groups.has(reason)) groups.set(reason, []);
    groups.get(reason).push(row);
  }
  return Array.from(groups.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([reason, reasonRows]) => {
      const sorted = [...reasonRows].sort((a, b) => Number(b.daysOnShelter || 0) - Number(a.daysOnShelter || 0));
      return { reason, rows: sorted };
    });
}

function renderReasonGroup(group) {
  const cards = (group.rows || []).map((row) => {
    const animalHtml = renderAnimalNameCell(row.animalName);
    const daysVal = row.daysOnShelter ? `${row.daysOnShelter} days` : "";
    return RC.card({
      title: animalHtml || RC.esc(row.animalName),
      chips: [
        RC.chip("Days",     daysVal),
        RC.chip("Code",     row.shortCode),
        RC.chip("Location", row.displayLocation),
      ],
      fields: [
        RC.field("Hold Date",        row.holdDate),
        RC.field("Age",              row.animalAge),
        RC.field("Weight",           row.weight),
        RC.field("Needs New Pic?",   row.pic),
        RC.field("Pathway Updated",  row.lastChangedDate),
        RC.field("Pathway Plan",     row.comments, { fullWidth: true }),
      ],
    });
  });
  return RC.group(group.reason, group.rows.length, cards.join(""));
}

function renderTable(rows) {
  if (!rows.length) {
    els.tableWrap.innerHTML = '<span style="color:var(--muted)">No pathway planning records found.</span>';
    return;
  }
  const grouped = groupByReason(rows);
  els.tableWrap.innerHTML = grouped.map((g) => renderReasonGroup(g)).join("\n");
}

async function loadReport() {
  els.metaText.textContent = "Loading report...";
  try {
    const data = await api("/api/admin/reporting/pathway-planning");
    renderTable(data.rows || []);
    els.metaText.textContent = data.available === false
      ? (data.error || "Report unavailable")
      : `Source: ${data.sourceMethod} | Rows: ${data.rowCount}`;
  } catch (error) {
    els.metaText.textContent = error.message || "Failed to load Pathway Planning report.";
    els.tableWrap.innerHTML = "";
  }
}

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
  await loadReport();
})();
