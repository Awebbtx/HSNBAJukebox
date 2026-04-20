async function api(url, opts = {}) {
  const res = await fetch(url, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
    ...opts
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(payload.error || `HTTP ${res.status}`);
  return payload;
}

function esc(str) {
  return `${str ?? ""}`.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function toast(message, isError = false) {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = message;
  el.className = `toast${isError ? " error" : ""}`;
  el.style.opacity = "1";
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.style.opacity = "0"; }, 3500);
}

async function ensureAuth() {
  try {
    return await api("/api/admin/account/me");
  } catch {
    window.location.replace("/reporting-login.html");
    return null;
  }
}

const GROUP_OPTIONS = [
  { value: "user", label: "User" },
  { value: "jukebox-admin", label: "Jukebox admin" },
  { value: "reporting", label: "Reporting" },
  { value: "superadmin", label: "Superadmin" },
  { value: "global-admin", label: "Global admin" }
];

function normalizeGroup(group) {
  const normalized = `${group || ""}`.trim().toLowerCase();
  if (normalized === "admins" || normalized === "admin") return "global-admin";
  return normalized;
}

function normalizeGroups(groups) {
  return Array.from(new Set((Array.isArray(groups) ? groups : []).map(normalizeGroup).filter(Boolean)));
}

function renderGroupEditor(user) {
  const groups = normalizeGroups(user?.groups);
  return GROUP_OPTIONS.map((group) => `
    <label class="staff-perm-check">
      <input type="checkbox" data-group-value="${esc(group.value)}" ${groups.includes(group.value) ? "checked" : ""} />
      ${esc(group.label)}
    </label>
  `).join("");
}

async function loadStaff() {
  const statusText = document.getElementById("staffStatusText");
  const staffList = document.getElementById("staffList");
  try {
    const data = await api("/api/admin/account/users");
    const staff = data.users || [];
    if (statusText) statusText.textContent = `${staff.length} user account(s)`;
    if (!staffList) return;
    staffList.innerHTML = "";
    if (!staff.length) {
      const li = document.createElement("li");
      li.className = "req-item empty";
      li.textContent = "No user accounts yet";
      staffList.append(li);
      return;
    }

    const togglePermEditor = (userId, open) => {
      document.querySelectorAll(".staff-perm-editor").forEach(e => { e.hidden = true; });
      if (!open) return;
      const target = document.getElementById(`staff-perm-editor-${userId}`);
      if (target) target.hidden = false;
    };

    const saveGroups = async (item) => {
      const editor = document.getElementById(`staff-perm-editor-${item.id}`);
      if (!editor) return;
      const groups = Array.from(editor.querySelectorAll("input[data-group-value]:checked"))
        .map(input => normalizeGroup(input.getAttribute("data-group-value")));
      await api(`/api/admin/account/users/${item.id}/groups`, {
        method: "PATCH",
        body: JSON.stringify({ groups })
      });
    };

    for (const item of staff) {
      const li = document.createElement("li");
      li.className = "req-item";
      const initialsSource = `${item.displayName || item.username || "?"}`.trim();
      const initials = (initialsSource.slice(0, 1) || "?").toUpperCase();
      const groupBadges = normalizeGroups(item.groups).map(g => `<span class="badge">${esc(g)}</span>`).join("");
      li.innerHTML = `
        <div class="staff-user-row">
          <div class="staff-avatar">${esc(initials)}</div>
          <div class="staff-user-meta">
            <div class="staff-user-name">${esc(item.displayName || item.username)}${item.active ? "" : ' <span class="badge">inactive</span>'}</div>
            <div class="staff-user-email">${esc(item.username || "")}</div>
            <div class="staff-user-groups">${groupBadges}</div>
            <div class="staff-limit-row">
              <span class="meta">Daily request limit: ${Number(item.requestLimit || 1)}</span>
              <input class="staff-limit-input" data-action="limit" type="number" min="1" step="1" value="${Number(item.requestLimit || 1)}" title="Daily request limit" />
            </div>
            <div class="staff-perm-editor" id="staff-perm-editor-${esc(item.id)}" hidden>
              <div class="staff-perm-grid">${renderGroupEditor(item)}</div>
              <div class="staff-perm-actions">
                <button class="btn-sm" data-action="save-permissions" type="button">Save Permissions</button>
                <button class="btn-sm" data-action="cancel-permissions" type="button">Cancel</button>
              </div>
            </div>
          </div>
          <div class="staff-actions">
            <button class="btn-sm" data-action="edit-permissions" type="button">Edit Permissions</button>
            <button class="btn-sm" data-action="send-invite" type="button">Send Invite</button>
            <button class="btn-sm" data-action="send-reset" type="button">Email Reset</button>
            <button class="btn-sm" data-action="toggle" type="button">${item.active ? "Disable" : "Enable"}</button>
            <button class="btn-sm danger" data-action="delete" type="button">Delete</button>
          </div>
        </div>
      `;

      const limitInput = li.querySelector('[data-action="limit"]');
      let lastLimitValue = Number(item.requestLimit || 1);
      let applyingLimit = false;
      const applyLimit = async () => {
        if (!limitInput || applyingLimit) return;
        const nextLimit = Math.max(1, Number(limitInput.value || lastLimitValue));
        limitInput.value = `${nextLimit}`;
        if (nextLimit === lastLimitValue) return;
        applyingLimit = true;
        try {
          await api(`/api/admin/account/users/${item.id}`, { method: "PATCH", body: JSON.stringify({ requestLimit: nextLimit }) });
          lastLimitValue = nextLimit;
          await loadStaff();
          toast("User limit updated");
        } catch (e) {
          toast(e.message, true);
          limitInput.value = `${lastLimitValue}`;
        } finally { applyingLimit = false; }
      };
      limitInput.addEventListener("change", applyLimit);
      limitInput.addEventListener("blur", applyLimit);
      limitInput.addEventListener("keydown", async (e) => { if (e.key === "Enter") { e.preventDefault(); await applyLimit(); } });

      li.querySelector('[data-action="edit-permissions"]')?.addEventListener("click", () => togglePermEditor(item.id, true));
      li.querySelector('[data-action="cancel-permissions"]')?.addEventListener("click", () => togglePermEditor(item.id, false));
      li.querySelector('[data-action="save-permissions"]')?.addEventListener("click", async () => {
        try { await saveGroups(item); await loadStaff(); toast("Permissions updated"); }
        catch (e) { toast(e.message, true); }
      });
      li.querySelector('[data-action="toggle"]')?.addEventListener("click", async () => {
        try {
          await api(`/api/admin/account/users/${item.id}`, { method: "PATCH", body: JSON.stringify({ active: !item.active }) });
          await loadStaff();
          toast(`User ${item.active ? "disabled" : "enabled"}`);
        } catch (e) { toast(e.message, true); }
      });
      li.querySelector('[data-action="send-invite"]')?.addEventListener("click", async () => {
        try { await api(`/api/admin/account/users/${item.id}/send-invite`, { method: "POST" }); toast("Invite email sent"); }
        catch (e) { toast(e.message, true); }
      });
      li.querySelector('[data-action="send-reset"]')?.addEventListener("click", async () => {
        try { await api(`/api/admin/account/users/${item.id}/send-password-reset`, { method: "POST" }); toast("Password reset email sent"); }
        catch (e) { toast(e.message, true); }
      });
      li.querySelector('[data-action="delete"]')?.addEventListener("click", async () => {
        if (!window.confirm(`Delete user account "${item.displayName || item.username}"?`)) return;
        try { await api(`/api/admin/account/users/${item.id}`, { method: "DELETE" }); await loadStaff(); toast("User account deleted"); }
        catch (e) { toast(e.message, true); }
      });
      staffList.append(li);
    }
  } catch (e) {
    if (statusText) statusText.textContent = e.message;
  }
}

document.getElementById("createStaffBtn")?.addEventListener("click", async () => {
  const displayName = `${document.getElementById("staffDisplayNameInput")?.value || ""}`.trim();
  const username = `${document.getElementById("staffUsernameInput")?.value || ""}`.trim();
  const requestLimit = Math.max(1, Number(document.getElementById("staffLimitInput")?.value || 5));
  const groups = [];
  if (document.getElementById("staffGroupUser")?.checked) groups.push("user");
  if (document.getElementById("staffGroupJukeboxAdmin")?.checked) groups.push("jukebox-admin");
  if (document.getElementById("staffGroupReporting")?.checked) groups.push("reporting");
  if (document.getElementById("staffGroupSuperadmin")?.checked) groups.push("superadmin");
  if (document.getElementById("staffGroupGlobalAdmin")?.checked) groups.push("global-admin");

  if (!username) { toast("Email is required.", true); return; }

  try {
    const result = await api("/api/admin/account/users", {
      method: "POST",
      body: JSON.stringify({ username, displayName: displayName || username, groups, requestLimit, sendInvite: true })
    });
    toast(result?.invite?.sent
      ? `Created ${displayName || username} and sent invite.`
      : `Created ${displayName || username}. Invite not sent.`);
    document.getElementById("staffDisplayNameInput").value = "";
    document.getElementById("staffUsernameInput").value = "";
    document.getElementById("staffLimitInput").value = "";
    document.getElementById("staffGroupUser").checked = false;
    document.getElementById("staffGroupJukeboxAdmin").checked = false;
    document.getElementById("staffGroupReporting").checked = true;
    document.getElementById("staffGroupSuperadmin").checked = false;
    document.getElementById("staffGroupGlobalAdmin").checked = false;
    await loadStaff();
  } catch (err) {
    toast(err.message || "Failed to create user.", true);
  }
});

document.getElementById("logoutBtn")?.addEventListener("click", async () => {
  try { await api("/api/admin/session/logout", { method: "POST" }); } catch { /* ignore */ }
  window.location.replace("/reporting-login.html");
});

(async () => {
  await ensureAuth();
  await loadStaff();
})();
