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
let employeeSessionIsAdmin = false;

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
    employeeSessionIsAdmin = false;
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
      employeeSessionIsAdmin = false;
      setSignInNavMode("signin");
      return;
    }
    const data = await res.json().catch(() => ({}));
    employeeSessionIsAdmin = data?.isAdmin === true;
    setSignInNavMode("signout");
  } catch {
    employeeSessionIsAdmin = false;
    setSignInNavMode("signin");
  }
}

async function refreshAdminSessionUser() {
  const token = sessionStorage.getItem(ADMIN_TOKEN_KEY) || localStorage.getItem(ADMIN_TOKEN_KEY) || "";
  let hasAdminTokenSession = false;
  if (!token) {
    if (adminNavBtn) adminNavBtn.hidden = !employeeSessionIsAdmin;
    if (myAccountNavBtn) myAccountNavBtn.hidden = true;
    return;
  }
  try {
    const res = await fetch("/api/admin/account/me", {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    if (!res.ok) {
      sessionStorage.removeItem(ADMIN_TOKEN_KEY);
      localStorage.removeItem(ADMIN_TOKEN_KEY);
      if (adminNavBtn) adminNavBtn.hidden = !employeeSessionIsAdmin;
      if (myAccountNavBtn) myAccountNavBtn.hidden = true;
      return;
    }
    const data = await res.json();
    hasAdminTokenSession = true;
    if (adminNavBtn) adminNavBtn.hidden = false;
    if (myAccountNavBtn) myAccountNavBtn.hidden = false;
  } catch {
    sessionStorage.removeItem(ADMIN_TOKEN_KEY);
    localStorage.removeItem(ADMIN_TOKEN_KEY);
    if (adminNavBtn) adminNavBtn.hidden = !employeeSessionIsAdmin;
    if (myAccountNavBtn) myAccountNavBtn.hidden = true;
  }

  if (!hasAdminTokenSession && adminNavBtn) {
    adminNavBtn.hidden = !employeeSessionIsAdmin;
  }
}

async function refreshSessionUi() {
  await refreshEmployeeSessionButton();
  await refreshAdminSessionUser();
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
      frame.src = "/requests.html?_=" + Date.now();
      frame.dataset.page = "/requests.html";
      setActiveLink("/requests.html");
      refreshSessionUi();
      return;
    }
    if (link === signInNavBtn && signInNavBtn?.dataset?.authAction !== "signout") {
      event.preventDefault();
      const normalized = "/requests.html";
      frame.src = normalized;
      frame.dataset.page = normalized;
      setActiveLink(normalized);
      const params = new URLSearchParams(window.location.search);
      params.set("page", normalized);
      window.history.pushState({ page: normalized }, "", `/?${params.toString()}`);
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

window.addEventListener("message", (event) => {
  if (event.origin !== window.location.origin) return;
  if (event.data?.type === "jukebox-session-update") {
    refreshSessionUi();
  }
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
