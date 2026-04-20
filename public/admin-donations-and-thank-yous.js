const els = {
  logoutBtn: document.getElementById("logoutBtn"),
  metaText: document.getElementById("metaText"),
  tableWrap: document.getElementById("tableWrap"),
  totalRow: document.getElementById("totalRow")
};

const ASM_REPORT_BASE_URL = "https://us10d.sheltermanager.com";

function esc(value) {
  return `${value ?? ""}`
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderOwnerCell(ownerName, ownerId) {
  const safeName = esc(ownerName);
  if (!safeName) return "";
  if (!ownerId) return safeName;
  const href = `${ASM_REPORT_BASE_URL}/person_donations?id=${encodeURIComponent(ownerId)}`;
  return `<a href="${href}" target="_blank" rel="noopener noreferrer">${safeName}</a>`;
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
    els.tableWrap.innerHTML = '<span style="color:var(--muted)">No donations found needing a thank you.</span>';
    els.totalRow.textContent = "";
    return;
  }

  const body = rows.map((row) => `
    <tr>
      <td>${renderOwnerCell(row.ownerName, row.ownerId)}</td>
      <td>${esc(row.paymentName)}</td>
      <td>${esc(row.donationName)}</td>
      <td>${esc(row.donation)}</td>
      <td>${esc(row.date)}</td>
      <td class="comment-cell">${esc(row.comments)}</td>
      <td>${esc(row.ownerAddress)}${row.ownerTown || row.ownerCounty || row.ownerPostcode ? `<br>${esc(row.ownerTown)}, ${esc(row.ownerCounty)} ${esc(row.ownerPostcode)}` : ""}</td>
      <td>${esc(row.emailAddress)}</td>
    </tr>
  `).join("");

  els.tableWrap.innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th>Owner</th>
          <th>Payment Type</th>
          <th>Donation Type</th>
          <th>Donation</th>
          <th>Date</th>
          <th>Comments</th>
          <th>Address</th>
          <th>Email</th>
        </tr>
      </thead>
      <tbody>${body}</tbody>
    </table>`;
  els.totalRow.textContent = `Total: ${rows.length} donation${rows.length !== 1 ? "s" : ""} need a thank you`;
}

async function loadReport() {
  els.metaText.textContent = "Loading report...";
  try {
    const data = await api("/api/admin/reporting/donations-and-thank-yous");
    renderTable(data.rows || []);
    els.metaText.textContent = data.available === false
      ? (data.error || "Report unavailable")
      : `Source: ${data.sourceMethod} | Rows: ${data.rowCount}`;
  } catch (error) {
    els.metaText.textContent = error.message || "Failed to load Donations and Thank Yous report.";
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
