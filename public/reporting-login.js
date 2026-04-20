const form = document.getElementById("loginForm");
const usernameInput = document.getElementById("usernameInput");
const passwordInput = document.getElementById("passwordInput");
const statusText = document.getElementById("statusText");
const loginBtn = document.getElementById("loginBtn");
const forgotPasswordBtn = document.getElementById("forgotPasswordBtn");

async function api(url, opts = {}) {
  const res = await fetch(url, {
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...(opts.headers || {})
    },
    ...opts
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(payload.error || `HTTP ${res.status}`);
  }
  return payload;
}

function setStatus(message, isError = false) {
  statusText.textContent = message || "";
  statusText.classList.toggle("error", Boolean(isError));
}

async function checkExistingSession() {
  try {
    await api("/api/admin/account/me");
    window.location.replace("/admin-reporting.html");
  } catch {
    // Not signed in yet.
  }
}

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const username = `${usernameInput?.value || ""}`.trim();
  const password = `${passwordInput?.value || ""}`;
  if (!username || !password) {
    setStatus("Username and password are required.", true);
    return;
  }

  loginBtn.disabled = true;
  setStatus("Signing in...");
  try {
    await api("/api/admin/session", {
      method: "POST",
      body: JSON.stringify({ username, password })
    });
    setStatus("Login successful. Redirecting...");
    window.location.replace("/admin-reporting.html");
  } catch (error) {
    setStatus(error.message || "Sign-in failed.", true);
  } finally {
    loginBtn.disabled = false;
  }
});

forgotPasswordBtn?.addEventListener("click", async () => {
  const username = `${usernameInput?.value || ""}`.trim();
  if (!username) {
    setStatus("Enter your email username, then click Forgot password again.", true);
    return;
  }

  forgotPasswordBtn.disabled = true;
  setStatus("Sending password reset email...");
  try {
    const result = await api("/api/account/password-reset-request", {
      method: "POST",
      body: JSON.stringify({ username })
    });
    setStatus(result.message || "If that account exists, a password reset email has been sent.");
  } catch (error) {
    setStatus(error.message || "Unable to request password reset.", true);
  } finally {
    forgotPasswordBtn.disabled = false;
  }
});

checkExistingSession();
