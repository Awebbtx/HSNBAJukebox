const els = {
  logoutBtn: document.getElementById("logoutBtn"),
  districtCallsMonth: document.getElementById("districtCallsMonth"),
  districtCallsYear: document.getElementById("districtCallsYear"),
  districtCallsRunBtn: document.getElementById("districtCallsRunBtn"),
  districtCallsMeta: document.getElementById("districtCallsMeta"),
  districtCallsTable: document.getElementById("districtCallsTable"),
  callsByTypeFromDate: document.getElementById("callsByTypeFromDate"),
  callsByTypeToDate: document.getElementById("callsByTypeToDate"),
  callsByTypeRunBtn: document.getElementById("callsByTypeRunBtn"),
  callsByTypeMeta: document.getElementById("callsByTypeMeta"),
  callsByTypeTable: document.getElementById("callsByTypeTable")
};

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

function renderDistrictCalls(data) {
  const districts = data.districts || [];
  const monthLabel = new Date(Date.UTC(Number(data.year), Number(data.month) - 1, 1))
    .toLocaleString(undefined, { month: "long", year: "numeric" });

  els.districtCallsMeta.textContent = data.available === false
    ? `${monthLabel} | ${data.error || "Animal Control data unavailable."}`
    : `${monthLabel} | Source: ${data.sourceMethod} | Rows: ${data.rowCount}`;

  if (!districts.length) {
    els.districtCallsTable.innerHTML = `<span style="color:var(--muted)">${data.available === false ? (data.error || "Animal Control data unavailable.") : "No district call data found for this month."}</span>`;
    return;
  }

  const blocks = districts.map((district) => {
    const rows = (district.incidentTypes || []).map((item) => (
      `<tr><td style="text-align:right;width:60px">${item.count}</td><td>${item.label}</td></tr>`
    )).join("");

    return `
      <div style="margin-bottom:0.95rem">
        <div class="card-label" style="margin-bottom:0.35rem">${district.district} (${district.total})</div>
        <table class="report-table">
          <thead><tr><th style="width:70px">Count</th><th>Incident Type</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }).join("");

  els.districtCallsTable.innerHTML = blocks;
}

function formatShortDateTime(value) {
  const d = value ? new Date(value) : null;
  if (!d || Number.isNaN(d.getTime())) return "";
  return d.toLocaleString();
}

function renderCallsByType(data) {
  const groups = data.types || [];
  els.callsByTypeMeta.textContent = data.available === false
    ? `${data.fromDate} to ${data.toDate} | ${data.error || "Animal Control data unavailable."}`
    : `${data.fromDate} to ${data.toDate} | Source: ${data.sourceMethod} | Rows: ${data.rowCount}`;

  if (!groups.length) {
    els.callsByTypeTable.innerHTML = `<span style="color:var(--muted)">${data.available === false ? (data.error || "Animal Control data unavailable.") : "No call records found for this date range."}</span>`;
    return;
  }

  const groupBlocks = groups.map((group) => {
    const cards = (group.rows || []).map((row) => RC.card({
      title: RC.esc(formatShortDateTime(row.date)) + (row.incidentCode ? ` <span style="font-size:0.78em;font-weight:400;opacity:0.7">— ${RC.esc(row.incidentCode)}</span>` : ""),
      chips: [
        RC.chip("Caller", row.caller),
      ],
      fields: [
        RC.field("Address / Dispatch", row.dispatch),
        RC.field("Dispatched",         row.dispatched),
        RC.field("Completed",          row.completed),
        RC.field("Notes",              row.notes, { fullWidth: true }),
      ],
    }));
    return RC.group(`${group.incidentType}`, group.total, cards.join(""));
  });

  els.callsByTypeTable.innerHTML = groupBlocks.join("");
}

async function loadDistrictCalls() {
  const month = Number.parseInt(`${els.districtCallsMonth?.value || ""}`, 10);
  const year = Number.parseInt(`${els.districtCallsYear?.value || ""}`, 10);
  if (!Number.isFinite(month) || month < 1 || month > 12) {
    els.districtCallsMeta.textContent = "Month must be between 1 and 12.";
    return;
  }
  if (!Number.isFinite(year) || year < 2000 || year > 2100) {
    els.districtCallsMeta.textContent = "Year must be between 2000 and 2100.";
    return;
  }

  els.districtCallsRunBtn.disabled = true;
  els.districtCallsMeta.textContent = "Loading monthly district calls...";
  try {
    const params = new URLSearchParams({ month: `${month}`, year: `${year}` });
    const data = await api(`/api/admin/reporting/monthly-district-calls?${params.toString()}`);
    renderDistrictCalls(data);
  } catch (error) {
    els.districtCallsMeta.textContent = error.message || "Failed to load monthly district calls.";
    els.districtCallsTable.innerHTML = "";
  } finally {
    els.districtCallsRunBtn.disabled = false;
  }
}

async function loadCallsByType() {
  const fromDate = `${els.callsByTypeFromDate?.value || ""}`.trim();
  const toDate = `${els.callsByTypeToDate?.value || ""}`.trim();
  if (!fromDate || !toDate) {
    els.callsByTypeMeta.textContent = "Select both From Date and To Date.";
    return;
  }

  els.callsByTypeRunBtn.disabled = true;
  els.callsByTypeMeta.textContent = "Loading calls-by-type report...";
  try {
    const params = new URLSearchParams({ fromDate, toDate });
    const data = await api(`/api/admin/reporting/calls-by-type?${params.toString()}`);
    renderCallsByType(data);
  } catch (error) {
    els.callsByTypeMeta.textContent = error.message || "Failed to load calls-by-type report.";
    els.callsByTypeTable.innerHTML = "";
  } finally {
    els.callsByTypeRunBtn.disabled = false;
  }
}

els.districtCallsRunBtn?.addEventListener("click", loadDistrictCalls);
els.callsByTypeRunBtn?.addEventListener("click", loadCallsByType);

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
  const now = new Date();
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
  els.districtCallsMonth.value = String(now.getMonth() + 1);
  els.districtCallsYear.value = String(now.getFullYear());
  els.callsByTypeFromDate.value = firstDay.toISOString().slice(0, 10);
  els.callsByTypeToDate.value = now.toISOString().slice(0, 10);

  await loadDistrictCalls();
  await loadCallsByType();
})();
