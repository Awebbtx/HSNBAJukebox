import { initAudioBar } from "/audio-bar.js";

initAudioBar();

const ALLOWED = new Set([
  "/home.html",
  "/requests.html",
  "/adoptable-stream.html",
  "/admin.html",
  "/local-player.html"
]);

const frame = document.getElementById("contentFrame");
const navLinks = Array.from(document.querySelectorAll("[data-page]"));

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

const initialParams = new URLSearchParams(window.location.search);
loadPage(initialParams.get("page"), false);
