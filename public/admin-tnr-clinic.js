const els = {
  logoutBtn: document.getElementById("logoutBtn"),
  metaText: document.getElementById("metaText"),
  tableWrap: document.getElementById("tableWrap"),
  totalRow: document.getElementById("totalRow")
};

const ASM_REPORT_BASE_URL = "https://us10d.sheltermanager.com";
const ASM_SERVICE_IMAGE_BASE = "https://service.sheltermanager.com/asmservice";
const ASM_ACCOUNT = "hs0701";

function esc(value) {
  return `${value ?? ""}`
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function animalImageUrl(animalId) {
  if (!animalId) return "";
  return `${ASM_SERVICE_IMAGE_BASE}?account=${encodeURIComponent(ASM_ACCOUNT)}&method=animal_image&animalid=${encodeURIComponent(animalId)}`;
}

function renderAnimalLink(name, animalId) {
  const safeName = esc(name);
  if (!safeName) return "";
  if (!animalId) return safeName;
  const href = `${ASM_REPORT_BASE_URL}/animal?id=${encodeURIComponent(animalId)}`;
  return `<a href="${href}" target="_blank" rel="noopener noreferrer">${safeName}</a>`;
}

function renderShelterCodeCell(code, animalId) {
  const safeCode = esc(code);
  if (!safeCode) return "";
  if (!animalId) return safeCode;
  const href = `${ASM_REPORT_BASE_URL}/animal?id=${encodeURIComponent(animalId)}`;
  return `<a href="${href}" target="_blank" rel="noopener noreferrer">${safeCode}</a>`;
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

function renderTable(rows) {
  if (!rows.length) {
    els.tableWrap.innerHTML = '<span style="color:var(--muted)">No TNR clinic records found.</span>';
    els.totalRow.textContent = "";
    return;
  }

function renderTable(rows) {
  if (!rows.length) {
    els.tableWrap.innerHTML = '<span style="color:var(--muted)">No TNR clinic records found.</span>';
    els.totalRow.textContent = "";
    return;
  }

  const cards = rows.map((row) => {
    const imgUrl = animalImageUrl(row.animalId);
    const animalLinkHtml = renderAnimalLink(row.animalName, row.animalId);
    const codeHtml = renderShelterCodeCell(row.shelterCode, row.animalId);
    const placementParts = [row.ownerName, [row.ownerAddress, row.ownerTown].filter(Boolean).join(", ")].filter(Boolean);
    return RC.card({
      thumb: imgUrl || undefined,
      title: animalLinkHtml || RC.esc(row.animalName),
      chips: [
        RC.chip("Type",   row.animalType),
        RC.chip("Sex",    row.sex),
        RC.chip("Colour", row.baseColour),
        RC.chip("Entry",  row.mostRecentEntryDate),
        row.ready ? RC.chip("Altered", row.ready) : "",
      ],
      fields: [
        RC.field("Shelter Code",          codeHtml || row.shelterCode, { raw: !!codeHtml }),
        RC.field("Location",              row.displayLocation),
        RC.field("Location Found",        row.locationFound),
        RC.field("Comments",              row.animalComments,          { fullWidth: true }),
        RC.field("Placement Pending With", placementParts.join(" | "),  { fullWidth: true }),
        RC.field("Placement Notes",       row.placementNotes,           { fullWidth: true }),
      ],
    });
  });

  els.tableWrap.innerHTML = RC.list(cards, rows.length);
  els.totalRow.textContent = `Total Ferals: ${rows.length}`;
}

async function loadReport() {
  els.metaText.textContent = "Loading report...";
  try {
    const data = await api("/api/admin/reporting/tnr-clinic");
    renderTable(data.rows || []);
    els.metaText.textContent = data.available === false
      ? (data.error || "Report unavailable")
      : `Source: ${data.sourceMethod} | Rows: ${data.rowCount}`;
  } catch (error) {
    els.metaText.textContent = error.message || "Failed to load TNR Clinic report.";
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
