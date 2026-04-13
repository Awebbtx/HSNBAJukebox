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
const adminSessionUser = document.getElementById("adminSessionUser");
const myAccountNavBtn = document.getElementById("myAccountNavBtn");
const ADMIN_TOKEN_KEY = "jukebox.admin.token";

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

async function refreshAdminSessionUser() {
  if (!adminSessionUser) return;
  const token = sessionStorage.getItem(ADMIN_TOKEN_KEY) || "";
  if (!token) {
    adminSessionUser.hidden = true;
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
      if (myAccountNavBtn) myAccountNavBtn.hidden = true;
      adminSessionUser.textContent = "Not signed in";
      return;
    }
    const data = await res.json();
    const label = data.displayName || data.username || "Admin";
    adminSessionUser.textContent = `Signed in: ${label}`;
    adminSessionUser.hidden = false;
    if (myAccountNavBtn) myAccountNavBtn.hidden = false;
  } catch {
    adminSessionUser.hidden = true;
    if (myAccountNavBtn) myAccountNavBtn.hidden = true;
    adminSessionUser.textContent = "Not signed in";
  }
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

  refreshAdminSessionUser();
}


navLinks.forEach((link) => {
  link.addEventListener("click", (event) => {
    event.preventDefault();
    loadPage(link.dataset.page, true);
  });
});

window.addEventListener("popstate", () => {
  const params = new URLSearchParams(window.location.search);
  loadPage(params.get("page"), false);
});

window.addEventListener("focus", () => {
  refreshAdminSessionUser();
});

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    refreshAdminSessionUser();
  }
});

frame.addEventListener("load", () => {
  refreshAdminSessionUser();
});

const initialParams = new URLSearchParams(window.location.search);
loadPage(initialParams.get("page"), false);
refreshAdminSessionUser();
