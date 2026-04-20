const els = {
  logoutBtn: document.getElementById("logoutBtn"),
  metaText: document.getElementById("metaText"),
  tableWrap: document.getElementById("tableWrap")
};

const ASM_REPORT_BASE_URL = "https://us10d.sheltermanager.com";

function normalizeAsmHref(rawHref) {
  const href = `${rawHref || ""}`.trim();
  if (!href || /^javascript:/i.test(href)) return "";
  try {
    const url = new URL(href, ASM_REPORT_BASE_URL);
    if (/sheltermanager\.com$/i.test(url.hostname)) {
      url.protocol = "https:";
      url.hostname = "us10d.sheltermanager.com";
      url.port = "";
    }
    return url.toString();
  } catch {
    return href;
  }
}

function enforceAsmLinkBehavior(container) {
  if (!container) return;
  const anchors = container.querySelectorAll("a[href]");
  for (const anchor of anchors) {
    const normalizedHref = normalizeAsmHref(anchor.getAttribute("href"));
    if (normalizedHref) {
      anchor.setAttribute("href", normalizedHref);
    }
    if (/sheltermanager\.com/i.test(anchor.getAttribute("href") || "")) {
      anchor.setAttribute("target", "_blank");
      anchor.setAttribute("rel", "noopener noreferrer");
    }
  }
}

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
  return `${value ?? ""}`
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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
    els.tableWrap.innerHTML = '<span style="color:var(--muted)">No foster records found.</span>';
    return;
  }

  const cards = rows.map((row) => {
    const codeHtml = renderShelterCodeCell(row.shelterCode, row.animalId);
    const titleHtml = `${esc(row.animalName)}${codeHtml ? ` <span style="font-size:0.78em;font-weight:400;opacity:0.7">— ${codeHtml}</span>` : ""}`;
    return RC.card({
      title: titleHtml,
      chips: [
        RC.chip("Breed", row.breedName),
        RC.chip("Sex",   row.sex),
        RC.chip("Age",   row.animalAge),
      ],
      fields: [
        RC.field("Colour",        row.colour),
        RC.field("Date of Birth", row.dateOfBirth),
        RC.field("Shelter Code",  codeHtml || row.shelterCode, { raw: !!codeHtml }),
      ],
    });
  });

  els.tableWrap.innerHTML = RC.list(cards, rows.length);
  enforceAsmLinkBehavior(els.tableWrap);
}

async function loadReport() {
  els.metaText.textContent = "Loading report...";
  try {
    const data = await api("/api/admin/reporting/active-fosters-brief");
    renderTable(data.rows || []);
    els.metaText.textContent = data.available === false
      ? (data.error || "Report unavailable")
      : `Source: ${data.sourceMethod} | Rows: ${data.rowCount}`;
  } catch (error) {
    els.metaText.textContent = error.message || "Failed to load Active Fosters report.";
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
