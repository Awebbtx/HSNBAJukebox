const els = {
  logoutBtn: document.getElementById("logoutBtn"),
  metaText: document.getElementById("metaText"),
  tableWrap: document.getElementById("tableWrap")
};

const ASM_REPORT_BASE_URL = "https://us10d.sheltermanager.com";

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
  return `${value || ""}`
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderShelterCodeCell(code, animalId) {
  const safeCode = esc(code);
  if (!safeCode) return "";
  if (!animalId) return safeCode;
  const href = `${ASM_REPORT_BASE_URL}/animal?id=${encodeURIComponent(animalId)}`;
  return `<a href="${href}" target="_blank" rel="noopener noreferrer">${safeCode}</a>`;
}

function renderTable(rows) {
  if (!rows.length) {
    els.tableWrap.innerHTML = '<span style="color:var(--muted)">No city daily in/out records found.</span>';
    return;
  }

  const cards = rows.map((row) => {
    const direction = `${row.outOrIn || ""}`.trim().toLowerCase();
    const dirBadge = direction === "in"  ? RC.badge("IN",  "in")
                   : direction === "out" ? RC.badge("OUT", "out")
                   : RC.badge(row.outOrIn, "type");
    const codeHtml = renderShelterCodeCell(row.shelterCode, row.animalId);
    return RC.card({
      title: `${RC.esc(row.animalName)}${dirBadge}`,
      chips: [
        RC.chip("Date",     row.theDate),
        RC.chip("Category", row.categoryName),
        RC.chip("Species",  row.speciesName),
      ],
      fields: [
        RC.field("Reason",         row.reason),
        RC.field("Shelter Code",   codeHtml || row.shelterCode, { raw: !!codeHtml }),
        RC.field("Identichip",     row.identichipNumber),
        RC.field("Animal Type",    row.animalTypeName),
        RC.field("Age",            row.animalAge),
        RC.field("Sex",            row.sexName),
        RC.field("Location Found", row.locationFound),
      ],
    });
  });

  els.tableWrap.innerHTML = RC.list(cards, rows.length);
}

async function loadReport() {
  els.metaText.textContent = "Loading report...";
  try {
    const data = await api("/api/admin/reporting/city-daily-in-out-staff");
    renderTable(data.rows || []);
    els.metaText.textContent = data.available === false
      ? (data.error || "Report unavailable")
      : `Source: ${data.sourceMethod} | Rows: ${data.rowCount}`;
  } catch (error) {
    els.metaText.textContent = error.message || "Failed to load City Daily In/Out report.";
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
