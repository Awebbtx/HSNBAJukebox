import { initAudioBar } from "/audio-bar.js";

initAudioBar();

const ALLOWED = new Set([
  "/home.html",
  "/requests.html",
  "/adoptable-stream.html",
  "/admin.html",
  "/admin-account.html",
  "/local-player.html"
]);

const frame = document.getElementById("contentFrame");
const navLinks = Array.from(document.querySelectorAll("[data-page]"));
const signInNavBtn = document.getElementById("signInNavBtn");
const adminNavBtn = document.getElementById("adminNavBtn");
const adminSessionUser = document.getElementById("adminSessionUser");
const myAccountNavBtn = document.getElementById("myAccountNavBtn");
const ADMIN_TOKEN_KEY = "jukebox.admin.token";
const EMPLOYEE_TOKEN_KEY = "jukebox.employee.token";

function normalizePage(rawPath) {
  const path = `${rawPath || ""}`.trim();
  if (ALLOWED.has(path)) {
    return path;
  }
  return "/home.html";
}

function setActiveLink(page) {
  navLinks.forEach((link) => {
    const on = link.dataset.page === page;
    link.classList.toggle("is-active", on);
  });
}

function setSignInNavMode(mode) {
  if (!signInNavBtn) return;
  const signOut = mode === "signout";
  signInNavBtn.dataset.authAction = signOut ? "signout" : "signin";
  signInNavBtn.textContent = signOut ? "Sign Out" : "Sign In";
}

async function refreshEmployeeSessionButton() {
  if (!signInNavBtn) return;
  const token = localStorage.getItem(EMPLOYEE_TOKEN_KEY) || "";
  if (!token) {
    setSignInNavMode("signin");
    return;
  }
  try {
    const res = await fetch("/api/requests/me", {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    if (!res.ok) {
      localStorage.removeItem(EMPLOYEE_TOKEN_KEY);
      setSignInNavMode("signin");
      return;
    }
    setSignInNavMode("signout");
  } catch {
    setSignInNavMode("signin");
  }
}

async function refreshAdminSessionUser() {
  if (!adminSessionUser) return;
  const token = sessionStorage.getItem(ADMIN_TOKEN_KEY) || "";
  if (!token) {
    adminSessionUser.hidden = true;
    if (adminNavBtn) adminNavBtn.hidden = true;
    if (myAccountNavBtn) myAccountNavBtn.hidden = true;
    adminSessionUser.textContent = "Not signed in";
    return;
  }
  try {
    const res = await fetch("/api/admin/account/me", {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    if (!res.ok) {
      adminSessionUser.hidden = true;
      if (adminNavBtn) adminNavBtn.hidden = true;
      if (myAccountNavBtn) myAccountNavBtn.hidden = true;
      adminSessionUser.textContent = "Not signed in";
      return;
    }
    const data = await res.json();
    const label = data.displayName || data.username || "Admin";
    adminSessionUser.textContent = `Signed in: ${label}`;
    adminSessionUser.hidden = false;
    if (adminNavBtn) adminNavBtn.hidden = false;
    if (myAccountNavBtn) myAccountNavBtn.hidden = false;
  } catch {
    adminSessionUser.hidden = true;
    if (adminNavBtn) adminNavBtn.hidden = true;
    if (myAccountNavBtn) myAccountNavBtn.hidden = true;
    adminSessionUser.textContent = "Not signed in";
  }
}

async function refreshSessionUi() {
  await Promise.all([
    refreshAdminSessionUser(),
    refreshEmployeeSessionButton()
  ]);
}

function loadPage(page, pushHistory = true) {
  const normalized = normalizePage(page);
  if (frame.dataset.page !== normalized) {
    frame.src = normalized;
    frame.dataset.page = normalized;
  }
  setActiveLink(normalized);

  if (pushHistory) {
    const params = new URLSearchParams(window.location.search);
    params.set("page", normalized);
    window.history.pushState({ page: normalized }, "", `/?${params.toString()}`);
  }

  refreshSessionUi();
}


navLinks.forEach((link) => {
  link.addEventListener("click", (event) => {
    if (link === signInNavBtn && signInNavBtn?.dataset?.authAction === "signout") {
      event.preventDefault();
      const token = localStorage.getItem(EMPLOYEE_TOKEN_KEY) || "";
      if (token) {
        fetch("/api/requests/session/logout", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` }
        }).catch(() => {});
      }
      localStorage.removeItem(EMPLOYEE_TOKEN_KEY);
      setSignInNavMode("signin");
      refreshSessionUi();
      return;
    }
    event.preventDefault();
    loadPage(link.dataset.page, true);
  });
});

window.addEventListener("popstate", () => {
  const params = new URLSearchParams(window.location.search);
  loadPage(params.get("page"), false);
});

window.addEventListener("focus", () => {
  refreshSessionUi();
});

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    refreshSessionUi();
  }
});

frame.addEventListener("load", () => {
  refreshSessionUi();
});

const initialParams = new URLSearchParams(window.location.search);
loadPage(initialParams.get("page"), false);
refreshSessionUi();
