const els = {
  accessTitle: document.getElementById("accessTitle"),
  accessSubtitle: document.getElementById("accessSubtitle"),
  accessForm: document.getElementById("accessForm"),
  passwordInput: document.getElementById("passwordInput"),
  passwordConfirmInput: document.getElementById("passwordConfirmInput"),
  savePasswordBtn: document.getElementById("savePasswordBtn"),
  accessMessage: document.getElementById("accessMessage")
};

function setMessage(message, kind = "") {
  if (!els.accessMessage) return;
  els.accessMessage.textContent = message;
  els.accessMessage.className = `access-message${kind ? ` ${kind}` : ""}`;
}

function readToken() {
  const params = new URLSearchParams(window.location.search);
  return `${params.get("token") || ""}`.trim();
}

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
    throw new Error(payload.error || `HTTP ${response.status}`);
  }
  return payload;
}

async function initialize() {
  const token = readToken();
  if (!token) {
    els.accessTitle.textContent = "Missing secure link token";
    els.accessSubtitle.textContent = "Request a new invite or password reset email.";
    setMessage("No token was provided.", "error");
    return;
  }

  try {
    const details = await api(`/api/account/action?token=${encodeURIComponent(token)}`);
    const actionLabel = details.action === "invite" ? "Finish your account invite" : "Reset your password";
    els.accessTitle.textContent = actionLabel;
    els.accessSubtitle.textContent = `${details.displayName || details.username} (${details.username})`;
    els.accessForm.hidden = false;
    setMessage(`Secure link verified. Expires at ${new Date(details.expiresAt).toLocaleString()}.`);

    els.accessForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const password = `${els.passwordInput.value || ""}`;
      const confirm = `${els.passwordConfirmInput.value || ""}`;
      if (password.length < 8) {
        setMessage("Password must be at least 8 characters.", "error");
        return;
      }
      if (password !== confirm) {
        setMessage("Passwords do not match.", "error");
        return;
      }

      els.savePasswordBtn.disabled = true;
      try {
        await api("/api/account/action/complete", {
          method: "POST",
          body: JSON.stringify({ token, password })
        });
        els.passwordInput.value = "";
        els.passwordConfirmInput.value = "";
        els.accessForm.hidden = true;
        setMessage("Password saved. You can now sign in from the admin or reporting login page.", "success");
      } catch (error) {
        setMessage(error.message || "Unable to complete this action.", "error");
      } finally {
        els.savePasswordBtn.disabled = false;
      }
    });
  } catch (error) {
    els.accessTitle.textContent = "Secure link unavailable";
    els.accessSubtitle.textContent = "Request a new invite or password reset email.";
    setMessage(error.message || "This link is invalid or expired.", "error");
  }
}

initialize();
