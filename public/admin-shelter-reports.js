// admin-shelter-reports.js — Linked Reports management for the Shelter Reports page
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

function esc(v) {
  return `${v ?? ""}`.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ── State ─────────────────────────────────────────────────────────────────────

let editingId = null;   // null = creating new, string = editing existing
let dragSrcRow = null;  // currently dragged field row element

// ── Elements ──────────────────────────────────────────────────────────────────

const els = {
  list: document.getElementById("linkedReportsList"),
  addBtn: document.getElementById("addLinkedReportBtn"),
  dialog: document.getElementById("linkedReportDialog"),
  dialogTitle: document.getElementById("lrDialogTitle"),
  titleInput: document.getElementById("lrTitle"),
  descInput: document.getElementById("lrDescription"),
  asmTitleInput: document.getElementById("lrAsmTitle"),
  linkTemplateInput: document.getElementById("lrLinkTemplate"),
  linkLabelInput: document.getElementById("lrLinkLabel"),
  chartLeftTitleInput: document.getElementById("lrChartLeftTitle"),
  chartRightTitleInput: document.getElementById("lrChartRightTitle"),
  chartLeftTypeInput: document.getElementById("lrChartLeftType"),
  chartRightTypeInput: document.getElementById("lrChartRightType"),
  showChartsOnDashboardInput: document.getElementById("lrShowChartsOnDashboard"),
  timingHint: document.getElementById("lrTimingHint"),
  probeBtn: document.getElementById("lrProbeBtn"),
  probeStatus: document.getElementById("lrProbeStatus"),
  fieldsSection: document.getElementById("lrFieldsSection"),
  fieldList: document.getElementById("lrFieldList"),
  addFieldBtn: document.getElementById("lrAddFieldBtn"),
  saveBtn: document.getElementById("lrSaveBtn"),
  deleteBtn: document.getElementById("lrDeleteBtn"),
  cancelBtn: document.getElementById("lrCancelBtn"),
  statusMsg: document.getElementById("lrStatusMsg")
};

function mountAddButtonInTopControls() {
  if (!els.addBtn) return;
  const controls = document.querySelector(".layout-controls");
  if (!controls) return;

  els.addBtn.style.display = "";
  els.addBtn.classList.remove("btn-sm");
  els.addBtn.classList.add("layout-btn");
  els.addBtn.textContent = "+ Add Report";

  const resetBtn = controls.querySelector(".layout-reset-btn") || controls.lastElementChild;
  if (resetBtn) {
    controls.insertBefore(els.addBtn, resetBtn);
  } else {
    controls.appendChild(els.addBtn);
  }
}

// ── Field row helpers ──────────────────────────────────────────────────────────

function createFieldRow(key, label, expanded, groupBy, chartLeft, chartRight) {
  const row = document.createElement("div");
  row.className = "lr-field-row";
  row.draggable = true;
  row.dataset.key = key;

  row.innerHTML = `
    <span class="lr-drag-handle" title="Drag to reorder">⠿</span>
    <span class="lr-field-key" title="${esc(key)}">${esc(key)}</span>
    <input class="lr-field-label" type="text" value="${esc(label)}" placeholder="Display label" />
    <label class="lr-expanded-label"><input type="checkbox" class="lr-field-expanded" ${expanded ? "checked" : ""} /> Expanded</label>
    <label class="lr-expanded-label"><input type="checkbox" class="lr-field-group-by" ${groupBy ? "checked" : ""} /> Group By</label>
    <label class="lr-expanded-label"><input type="checkbox" class="lr-field-chart-left" ${chartLeft ? "checked" : ""} /> Chart L</label>
    <label class="lr-expanded-label"><input type="checkbox" class="lr-field-chart-right" ${chartRight ? "checked" : ""} /> Chart R</label>
    <button class="lr-field-remove" type="button" title="Remove field">✕</button>
  `;

  // Drag-and-drop
  row.addEventListener("dragstart", (e) => {
    dragSrcRow = row;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", key);
    row.style.opacity = "0.5";
  });
  row.addEventListener("dragend", () => {
    row.style.opacity = "";
    els.fieldList.querySelectorAll(".lr-field-row").forEach((r) => r.classList.remove("drag-over"));
    dragSrcRow = null;
  });
  row.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    els.fieldList.querySelectorAll(".lr-field-row").forEach((r) => r.classList.remove("drag-over"));
    row.classList.add("drag-over");
  });
  row.addEventListener("dragleave", () => row.classList.remove("drag-over"));
  row.addEventListener("drop", (e) => {
    e.preventDefault();
    row.classList.remove("drag-over");
    if (!dragSrcRow || dragSrcRow === row) return;
    const parent = els.fieldList;
    const rows = [...parent.querySelectorAll(".lr-field-row")];
    const srcIdx = rows.indexOf(dragSrcRow);
    const tgtIdx = rows.indexOf(row);
    if (srcIdx < tgtIdx) {
      row.after(dragSrcRow);
    } else {
      row.before(dragSrcRow);
    }
  });

  // Remove button
  row.querySelector(".lr-field-remove").addEventListener("click", () => row.remove());

  row.querySelector(".lr-field-group-by")?.addEventListener("change", (event) => {
    if (!event.target.checked) return;
    els.fieldList.querySelectorAll(".lr-field-group-by").forEach((checkbox) => {
      if (checkbox !== event.target) checkbox.checked = false;
    });
  });

  row.querySelector(".lr-field-chart-left")?.addEventListener("change", (event) => {
    if (!event.target.checked) return;
    els.fieldList.querySelectorAll(".lr-field-chart-left").forEach((checkbox) => {
      if (checkbox !== event.target) checkbox.checked = false;
    });
  });

  row.querySelector(".lr-field-chart-right")?.addEventListener("change", (event) => {
    if (!event.target.checked) return;
    els.fieldList.querySelectorAll(".lr-field-chart-right").forEach((checkbox) => {
      if (checkbox !== event.target) checkbox.checked = false;
    });
  });

  return row;
}

function readFieldRows() {
  return [...els.fieldList.querySelectorAll(".lr-field-row")].map((row, i) => ({
    key: row.dataset.key || "",
    label: row.querySelector(".lr-field-label")?.value.trim() || row.dataset.key || "",
    expanded: row.querySelector(".lr-field-expanded")?.checked || false,
    groupBy: row.querySelector(".lr-field-group-by")?.checked || false,
    chartLeft: row.querySelector(".lr-field-chart-left")?.checked || false,
    chartRight: row.querySelector(".lr-field-chart-right")?.checked || false,
    order: i
  }));
}

function populateFieldList(fields) {
  els.fieldList.innerHTML = "";
  for (const f of fields) {
    els.fieldList.appendChild(createFieldRow(f.key, f.label || f.key, f.expanded, f.groupBy, f.chartLeft, f.chartRight));
  }
}

function buildDefaultFields(fieldKeys) {
  return fieldKeys.map((key, i) => ({
    key,
    label: key.replace(/_/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2"),
    expanded: i > 2,
    groupBy: false,
    chartLeft: false,
    chartRight: false,
    order: i
  }));
}

function setTimingHint(hint) {
  if (!els.timingHint) return;
  if (!hint || !hint.label) {
    els.timingHint.textContent = "";
    return;
  }
  els.timingHint.textContent = `Timing hint: ${hint.label}. ${hint.description || ""}`.trim();
}

// ── Dialog ────────────────────────────────────────────────────────────────────

function openAddDialog() {
  editingId = null;
  els.dialogTitle.textContent = "Add Linked Report";
  els.titleInput.value = "";
  els.descInput.value = "";
  els.asmTitleInput.value = "";
  els.linkTemplateInput.value = "";
  els.linkLabelInput.value = "";
  els.chartLeftTitleInput.value = "";
  els.chartRightTitleInput.value = "";
  els.chartLeftTypeInput.value = "bar";
  els.chartRightTypeInput.value = "bar";
  els.showChartsOnDashboardInput.checked = false;
  setTimingHint(null);
  els.probeStatus.textContent = "";
  els.fieldList.innerHTML = "";
  els.fieldsSection.style.display = "none";
  els.deleteBtn.style.display = "none";
  els.statusMsg.textContent = "";
  els.dialog.showModal();
  els.titleInput.focus();
}

function openEditDialog(report) {
  editingId = report.id;
  els.dialogTitle.textContent = "Edit Linked Report";
  els.titleInput.value = report.title || "";
  els.descInput.value = report.description || "";
  els.asmTitleInput.value = report.asmReportTitle || "";
  els.linkTemplateInput.value = report.linkTemplate || "";
  els.linkLabelInput.value = report.linkLabel || "";
  els.chartLeftTitleInput.value = report.chartLeftTitle || "";
  els.chartRightTitleInput.value = report.chartRightTitle || "";
  els.chartLeftTypeInput.value = report.chartLeftType || "bar";
  els.chartRightTypeInput.value = report.chartRightType || "bar";
  els.showChartsOnDashboardInput.checked = Boolean(report.showChartsOnDashboard);
  setTimingHint(null);
  els.probeStatus.textContent = "";
  els.statusMsg.textContent = "";
  els.deleteBtn.style.display = "";
  if (Array.isArray(report.fields) && report.fields.length > 0) {
    populateFieldList(report.fields);
    els.fieldsSection.style.display = "";
  } else {
    els.fieldList.innerHTML = "";
    els.fieldsSection.style.display = "none";
  }
  els.dialog.showModal();
  els.titleInput.focus();
}

function closeDialog() {
  els.dialog.close();
  editingId = null;
}

// ── Probe ─────────────────────────────────────────────────────────────────────

async function probeFields() {
  const asmTitle = els.asmTitleInput.value.trim();
  if (!asmTitle) {
    els.probeStatus.textContent = "Enter the ASM report title first.";
    return;
  }
  els.probeBtn.disabled = true;
  els.probeStatus.textContent = "Probing ASM…";
  setTimingHint(null);
  try {
    const data = await api("/api/admin/reporting/linked-reports/probe", {
      method: "POST",
      body: JSON.stringify({ asmReportTitle: asmTitle })
    });
    if (!data.ok) {
      const retryHint = data.retryAt ? ` Retry after ${data.retryAt}.` : (data.waitSeconds ? ` Retry in about ${data.waitSeconds} seconds.` : "");
      els.probeStatus.textContent = `Probe failed: ${data.error || "Unknown error"}${retryHint}`;
      return;
    }
    if (!data.fieldKeys || !data.fieldKeys.length) {
      els.probeStatus.textContent = `Report "${asmTitle}" returned ${data.rowCount ?? 0} rows but no fields. Check the report title.`;
      return;
    }

    // Merge with existing field list — keep existing labels/expanded for known keys, add new ones
    const existing = readFieldRows();
    const existingMap = new Map(existing.map((f) => [f.key, f]));
    const merged = data.fieldKeys.map((key, i) => {
      const ex = existingMap.get(key);
      return ex ? { ...ex } : { key, label: key, expanded: i > 2, groupBy: false, chartLeft: false, chartRight: false, order: i };
    });
    populateFieldList(merged);
    els.fieldsSection.style.display = "";
    const sourceNote = data.fromPreset ? " (using mapped fields)" : (data.fromCache ? " (using cached fields)" : "");
    const warningNote = data.warning ? ` ${data.warning}` : "";
    setTimingHint(data.timingHint || null);
    els.probeStatus.textContent = `Found ${data.fieldKeys.length} fields from ${data.rowCount} rows${sourceNote}.${warningNote}`;
  } catch (err) {
    setTimingHint(null);
    els.probeStatus.textContent = `Error: ${err.message}`;
  } finally {
    els.probeBtn.disabled = false;
  }
}

// ── Save / Delete ─────────────────────────────────────────────────────────────

async function saveLinkedReport() {
  const title = els.titleInput.value.trim();
  const asmReportTitle = els.asmTitleInput.value.trim();
  const linkTemplate = els.linkTemplateInput.value.trim();
  const linkLabel = els.linkLabelInput.value.trim();
  if (!title) { els.statusMsg.textContent = "Display name is required."; return; }
  if (!asmReportTitle) { els.statusMsg.textContent = "ASM report title is required."; return; }

  const fields = readFieldRows();
  els.saveBtn.disabled = true;
  els.statusMsg.textContent = "Saving…";
  try {
    const body = {
      title,
      description: els.descInput.value.trim(),
      asmReportTitle,
      linkTemplate,
      linkLabel,
      chartLeftTitle: els.chartLeftTitleInput.value.trim(),
      chartRightTitle: els.chartRightTitleInput.value.trim(),
      chartLeftType: els.chartLeftTypeInput.value,
      chartRightType: els.chartRightTypeInput.value,
      showChartsOnDashboard: els.showChartsOnDashboardInput.checked,
      dateRangeEnabled: false,
      defaultFromDate: "",
      defaultToDate: "",
      fields
    };
    if (editingId) {
      await api(`/api/admin/reporting/linked-reports/${editingId}`, {
        method: "PATCH",
        body: JSON.stringify(body)
      });
    } else {
      await api("/api/admin/reporting/linked-reports", {
        method: "POST",
        body: JSON.stringify(body)
      });
    }
    closeDialog();
    await loadLinkedReports();
  } catch (err) {
    els.statusMsg.textContent = `Error: ${err.message}`;
  } finally {
    els.saveBtn.disabled = false;
  }
}

async function deleteLinkedReport() {
  if (!editingId) return;
  if (!confirm("Delete this linked report? This cannot be undone.")) return;
  els.deleteBtn.disabled = true;
  els.statusMsg.textContent = "Deleting…";
  try {
    await api(`/api/admin/reporting/linked-reports/${editingId}`, { method: "DELETE" });
    closeDialog();
    await loadLinkedReports();
  } catch (err) {
    els.statusMsg.textContent = `Error: ${err.message}`;
    els.deleteBtn.disabled = false;
  }
}

async function deleteLinkedReportById(id, title = "this linked report") {
  if (!id) return;
  if (!confirm(`Delete ${title}? This cannot be undone.`)) return;
  try {
    await api(`/api/admin/reporting/linked-reports/${id}`, { method: "DELETE" });
    if (editingId === id) {
      closeDialog();
    }
    await loadLinkedReports();
  } catch (err) {
    els.statusMsg.textContent = `Error: ${err.message}`;
  }
}

// ── Render list ───────────────────────────────────────────────────────────────

async function loadLinkedReports() {
  try {
    const data = await api("/api/admin/reporting/linked-reports");
    renderLinkedReports(data.reports || []);
  } catch (err) {
    if (els.list) {
      els.list.innerHTML = `<span style="color:var(--muted);font-size:0.88rem">Unable to load linked reports: ${esc(err.message)}</span>`;
    }
  }
}

function renderLinkedReports(reports) {
  if (!els.list) return;

  if (!reports.length) {
    els.list.innerHTML = `<span style="color:var(--muted);font-size:0.88rem;grid-column:1/-1">No linked reports yet. Click <strong>+ Add Linked Report</strong> to create one.</span>`;
    return;
  }
  els.list.innerHTML = reports.map((r) => `
    <div class="link-card" data-linked-report="1" style="display:grid;gap:0.35rem;position:relative" data-layout-item data-layout-id="linked-report-${esc(r.id)}">
      <div class="lr-card-actions">
        <button class="lr-card-action" type="button" data-edit-id="${esc(r.id)}" title="Edit report" aria-label="Edit report">✎</button>
        <button class="lr-card-action danger" type="button" data-delete-id="${esc(r.id)}" data-title="${esc(r.title)}" title="Delete report" aria-label="Delete report">✕</button>
      </div>
      <div>
        <a href="/admin-linked-report.html?id=${esc(r.id)}" style="text-decoration:none;color:inherit;flex:1">
          <h3>${esc(r.title)}</h3>
          ${r.description ? `<p>${esc(r.description)}</p>` : ""}
          <p style="font-size:0.8rem">ASM: <em>${esc(r.asmReportTitle)}</em> &middot; ${r.fields?.length ?? 0} fields</p>
          ${r.showChartsOnDashboard ? `<p style="font-size:0.76rem;color:var(--accent)">Dashboard charts: enabled</p>` : ""}
          ${r.linkTemplate ? `<p style="font-size:0.76rem">Row link: <em>${esc(r.linkTemplate)}</em></p>` : ""}
        </a>
      </div>
    </div>
  `).join("");

  els.list.querySelectorAll("[data-edit-id]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const report = reports.find((r) => r.id === btn.dataset.editId);
      if (report) openEditDialog(report);
    });
  });

  els.list.querySelectorAll("[data-delete-id]").forEach((btn) => {
    btn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      deleteLinkedReportById(btn.dataset.deleteId, btn.dataset.title || "this linked report");
    });
  });
}

// ── Event wiring ──────────────────────────────────────────────────────────────

els.addBtn?.addEventListener("click", openAddDialog);
els.probeBtn?.addEventListener("click", probeFields);
els.saveBtn?.addEventListener("click", saveLinkedReport);
els.deleteBtn?.addEventListener("click", deleteLinkedReport);
els.cancelBtn?.addEventListener("click", closeDialog);
// Only close on backdrop if mousedown also started on the backdrop (not a drag-out)
let backdropMousedownTarget = null;
els.dialog?.addEventListener("mousedown", (e) => {
  backdropMousedownTarget = e.target;
});
els.dialog?.addEventListener("click", (e) => {
  if (e.target === els.dialog && backdropMousedownTarget === els.dialog) closeDialog();
  backdropMousedownTarget = null;
});

// ── Boot ──────────────────────────────────────────────────────────────────────

mountAddButtonInTopControls();
setTimeout(mountAddButtonInTopControls, 0);
loadLinkedReports();
