const els = {
  logoutBtn: document.getElementById("logoutBtn"),
  metaText: document.getElementById("metaText"),
  tableWrap: document.getElementById("tableWrap"),
  totalRow: document.getElementById("totalRow")
};

function esc(value) {
  return `${value ?? ""}`
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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
    els.tableWrap.innerHTML = '<span style="color:var(--muted)">No yearly reviews due this month.</span>';
    els.totalRow.textContent = "";
    return;
  }

  const body = rows.map((row) => `
    <tr>
      <td>${esc(row.ownerName)}</td>
      <td>${esc(row.value)}</td>
    </tr>
  `).join("");

  els.tableWrap.innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th>Owner Name</th>
          <th>Value</th>
        </tr>
      </thead>
      <tbody>${body}</tbody>
    </table>`;

  els.totalRow.textContent = `Total: ${rows.length}`;
}

async function loadReport() {
  els.metaText.textContent = "Loading report...";
  try {
    const data = await api("/api/admin/reporting/yearly-reviews-upcoming");
    renderTable(data.rows || []);
    els.metaText.textContent = data.available === false
      ? (data.error || "Report unavailable")
      : `Source: ${data.sourceMethod} | Rows: ${data.rowCount}`;
  } catch (error) {
    els.metaText.textContent = error.message || "Failed to load Yearly Reviews Upcoming report.";
    els.tableWrap.innerHTML = "";
    els.totalRow.textContent = "";
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
