const els = {
  logoutBtn: document.getElementById("logoutBtn"),
  metaText: document.getElementById("metaText"),
  tableWrap: document.getElementById("tableWrap")
};

const ASM_REPORT_BASE_URL = "https://us10d.sheltermanager.com";

function escapeHtml(value) {
  return `${value ?? ""}`
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

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

function renderAnimalNameCell(rawValue) {
  const holder = document.createElement("div");
  holder.innerHTML = `${rawValue || ""}`;
  const anchor = holder.querySelector("a[href]");
  if (anchor) {
    const href = normalizeAsmHref(anchor.getAttribute("href"));
    const label = (anchor.textContent || "Open").trim() || "Open";
    if (href) {
      return `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`;
    }
    return escapeHtml(label);
  }
  const text = (holder.textContent || `${rawValue || ""}`).trim();
  return escapeHtml(text);
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

function renderReasonTable(group) {
  const body = (group.rows || []).map((row) => `
    <tr>
      <td>${renderAnimalNameCell(row.animalName)}</td>
      <td>${escapeHtml(row.holdDate || "")}</td>
      <td>${escapeHtml(row.animalAge || "")}</td>
      <td>${escapeHtml(row.daysOnShelter || "")}</td>
      <td>${escapeHtml(row.shortCode || "")}</td>
      <td>${escapeHtml(row.displayLocation || "")}</td>
      <td>${escapeHtml(row.weight || "")}</td>
      <td class="comment-cell">${escapeHtml(row.comments || "")}</td>
      <td>${escapeHtml(row.pic || "")}</td>
      <td>${escapeHtml(row.lastChangedDate || "")}</td>
    </tr>
  `).join("");

  return `
    <h3 class="reason-title">${group.reason} (${group.rows.length})</h3>
    <table class="data-table">
      <thead>
        <tr>
          <th>Animal Name</th>
          <th>Hold Date</th>
          <th>Age</th>
          <th>Days On Shelter</th>
          <th>Short Code</th>
          <th>Display Location</th>
          <th>Weight</th>
          <th>Pathway Plan</th>
          <th>Needs New Pic?</th>
          <th>Last Changed</th>
        </tr>
      </thead>
      <tbody>${body}</tbody>
    </table>`;
}

function renderTable(rows) {
  if (!rows.length) {
    els.tableWrap.innerHTML = '<span style="color:var(--muted)">No pathway planning records found.</span>';
    return;
  }

  const grouped = groupByReason(rows);
  els.tableWrap.innerHTML = grouped.map((group) => renderReasonTable(group)).join("\n");
  enforceAsmLinkBehavior(els.tableWrap);
}

async function loadReport() {
  els.metaText.textContent = "Loading report...";
  try {
    const data = await api("/api/admin/reporting/staff-weekly-pathway-planning");
    renderTable(data.rows || []);
    els.metaText.textContent = data.available === false
      ? (data.error || "Report unavailable")
      : `Source: ${data.sourceMethod} | Rows: ${data.rowCount}`;
  } catch (error) {
    els.metaText.textContent = error.message || "Failed to load Staff's Weekly Pathway Planning report.";
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
