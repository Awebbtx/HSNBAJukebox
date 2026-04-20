const els = {
  logoutBtn: document.getElementById("logoutBtn"),
  metaText: document.getElementById("metaText"),
  tableWrap: document.getElementById("tableWrap"),
  monthSelect: document.getElementById("monthSelect"),
  yearInput: document.getElementById("yearInput"),
  runBtn: document.getElementById("runBtn")
};

const ASM_REPORT_BASE_URL = "https://us10d.sheltermanager.com";

function esc(value) {
  return `${value ?? ""}`
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderShelterCodeCell(code, animalId, asmAnimalUrl) {
  const safeCode = esc(code);
  if (!safeCode) return "";
  const href = asmAnimalUrl || (animalId ? `${ASM_REPORT_BASE_URL}/animal?id=${encodeURIComponent(animalId)}` : "");
  if (!href) return safeCode;
  return `<a href="${href}" target="_blank" rel="noopener noreferrer">${safeCode}</a>`;
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

function renderTable(rows, month, year) {
  if (!rows.length) {
    els.tableWrap.innerHTML = '<span style="color:var(--muted)">No adoption follow-up records found for the selected period.</span>';
    return;
  }

  const cards = rows.map((row) => {
    const codeHtml = renderShelterCodeCell(row.shelterCode, row.animalId, row.asmAnimalUrl);
    const ownerName = [row.ownerForenames, row.ownerSurname].filter(Boolean).join(" ") || row.ownerName || "";
    const titleHtml = `${esc(row.animalName)}${row.speciesName ? ` <span style="font-size:0.78em;font-weight:400;opacity:0.7">— ${esc(row.speciesName)}</span>` : ""}`;
    const phone = row.mobileTelephone || row.homeTelephone || row.workTelephone || "";
    return RC.card({
      title: titleHtml,
      chips: [
        RC.chip("Owner",   ownerName),
        RC.chip("Adopted", row.adoptionDate),
        RC.chip("",        phone),
      ],
      fields: [
        RC.field("Shelter Code",  codeHtml || row.shelterCode, { raw: !!codeHtml }),
        RC.field("Adoption Date", row.adoptionDate),
        RC.field("Neutered Date", row.neuteredDate),
        RC.field("Owner Name",    ownerName),
        RC.field("Address",       row.ownerAddress),
        RC.field("Town",          row.ownerTown),
        RC.field("County",        row.ownerCounty),
        RC.field("Postcode",      row.ownerPostcode),
        RC.field("Home Phone",    row.homeTelephone),
        RC.field("Mobile",        row.mobileTelephone),
        RC.field("Work Phone",    row.workTelephone),
        RC.field("Email",         row.emailAddress),
      ],
    });
  });

  els.tableWrap.innerHTML = RC.list(cards, rows.length);
}

async function runReport() {
  const month = els.monthSelect.value;
  const year = `${els.yearInput.value || ""}`.trim();

  if (!year || !/^\d{4}$/.test(year)) {
    els.metaText.textContent = "Please enter a valid 4-digit year.";
    return;
  }

  els.runBtn.disabled = true;
  els.metaText.textContent = "Loading report...";
  els.tableWrap.innerHTML = '<span style="color:var(--muted)">Loading...</span>';

  try {
    const data = await api(`/api/admin/reporting/adoption-followups?month=${encodeURIComponent(month)}&year=${encodeURIComponent(year)}`);
    if (data.available === false) {
      els.metaText.textContent = data.error || "Report unavailable.";
      els.tableWrap.innerHTML = "";
    } else {
      renderTable(data.rows || [], month, year);
      els.metaText.textContent = `Source: ${data.sourceMethod} | Rows: ${data.rowCount}`;
    }
  } catch (error) {
    els.metaText.textContent = error.message || "Failed to load Adoption Follow-Ups report.";
    els.tableWrap.innerHTML = "";
  } finally {
    els.runBtn.disabled = false;
  }
}

// Default to current month/year
(function setDefaults() {
  const now = new Date();
  els.monthSelect.value = String(now.getMonth() + 1);
  els.yearInput.value = String(now.getFullYear());
})();

els.runBtn?.addEventListener("click", runReport);

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
})();
