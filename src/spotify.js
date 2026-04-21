import crypto from "crypto";
import fetch from "node-fetch";

const spotifyAccountsBase = "https://accounts.spotify.com";
const spotifyApiBase = "https://api.spotify.com/v1";

const scopes = [
  "user-read-private",
  "user-read-email",
  "playlist-read-private",
  "playlist-read-collaborative",
  "user-top-read",
  "user-read-playback-state",
  "user-read-currently-playing",
  "user-modify-playback-state",
  "streaming"
];

export function createAuthState() {
  return crypto.randomBytes(16).toString("hex");
}

export function createAuthorizeUrl({ clientId, redirectUri, state }) {
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    scope: scopes.join(" "),
    state
  });

  return `${spotifyAccountsBase}/authorize?${params.toString()}`;
}

export async function exchangeCodeForToken({ clientId, clientSecret, code, redirectUri }) {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri
  });

  const authHeader = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const response = await fetch(`${spotifyAccountsBase}/api/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${authHeader}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body
  });

  const json = await response.json();
  if (!response.ok) {
    throw new Error(`Spotify token exchange failed: ${response.status} ${JSON.stringify(json)}`);
  }

  return withExpiry(json);
}

export async function refreshAccessToken({ clientId, clientSecret, refreshToken }) {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken
  });

  const authHeader = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const response = await fetch(`${spotifyAccountsBase}/api/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${authHeader}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body
  });

  const json = await response.json();
  if (!response.ok) {
    throw new Error(`Spotify refresh failed: ${response.status} ${JSON.stringify(json)}`);
  }

  return withExpiry({
    ...json,
    refresh_token: json.refresh_token ?? refreshToken
  });
}

function withExpiry(tokenPayload) {
  const expiresIn = Number(tokenPayload.expires_in ?? 3600);
  return {
    access_token: tokenPayload.access_token,
    token_type: tokenPayload.token_type,
    scope: tokenPayload.scope,
    refresh_token: tokenPayload.refresh_token,
    expires_in: expiresIn,
    expires_at: Date.now() + expiresIn * 1000
  };
}

export async function spotifyApiRequest({ accessToken, method = "GET", path, query, body }) {
  const url = new URL(`${spotifyApiBase}${path}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && `${value}`.length > 0) {
        url.searchParams.set(key, `${value}`);
      }
    }
  }

  const maxAttempts = 2;
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: body ? JSON.stringify(body) : undefined
    });

    if (response.status === 204) {
      return null;
    }

    const contentType = response.headers.get("content-type") || "";
    const payload = contentType.includes("application/json") ? await response.json() : await response.text();

    if (response.ok) {
      return payload;
    }

    if (response.status === 429 && attempt < maxAttempts) {
      const retryAfterSeconds = Number(response.headers.get("retry-after") || "0");
      const rawBackoffMs = Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
        ? Math.ceil(retryAfterSeconds * 1000)
        : Math.min(8000, 500 * (2 ** (attempt - 1)));
      const backoffMs = Math.min(rawBackoffMs, 2000);
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
      continue;
    }

    lastError = new Error(`Spotify API failed: ${response.status} ${JSON.stringify(payload)}`);
    break;
  }

  throw lastError || new Error("Spotify API failed: unknown error");
}
