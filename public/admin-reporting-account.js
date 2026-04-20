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

document.getElementById("logoutBtn")?.addEventListener("click", async () => {
  try { await api("/api/admin/session/logout", { method: "POST" }); } catch { /* ignore */ }
  window.location.replace("/reporting-login.html");
});

document.getElementById("saveProfileBtn")?.addEventListener("click", async () => {
  const displayName = `${document.getElementById("displayNameInput")?.value || ""}`.trim();
  if (!displayName) { toast("Display name is required.", true); return; }
  try {
    await api("/api/admin/account/profile", { method: "PATCH", body: JSON.stringify({ displayName }) });
    toast("Profile saved.");
    document.getElementById("accountStatusText").textContent =
      `Signed in as ${document.getElementById("usernameInput").value} · ${displayName}`;
  } catch (err) {
    toast(err.message || "Failed to save profile.", true);
  }
});

document.getElementById("savePasswordBtn")?.addEventListener("click", async () => {
  const currentPassword = `${document.getElementById("currentPasswordInput")?.value || ""}`;
  const newPassword = `${document.getElementById("newPasswordInput")?.value || ""}`;
  if (!currentPassword || !newPassword) { toast("Both password fields are required.", true); return; }
  try {
    await api("/api/admin/account/password", { method: "POST", body: JSON.stringify({ currentPassword, newPassword }) });
    toast("Password changed. Signing you out…");
    document.getElementById("currentPasswordInput").value = "";
    document.getElementById("newPasswordInput").value = "";
    setTimeout(async () => {
      try { await api("/api/admin/session/logout", { method: "POST" }); } catch { /* ignore */ }
      window.location.replace("/reporting-login.html");
    }, 1800);
  } catch (err) {
    toast(err.message || "Failed to change password.", true);
  }
});

(async () => {
  const account = await ensureAuth();
  if (!account) return;
  document.getElementById("usernameInput").value = account.username || "";
  document.getElementById("displayNameInput").value = account.displayName || "";
  document.getElementById("accountStatusText").textContent =
    `Signed in as ${account.username}${account.displayName ? ` · ${account.displayName}` : ""}`;
})();
