import {
  KEYCLOAK_ADMIN_CLIENT_ID,
  KEYCLOAK_ADMIN_CLIENT_SECRET,
  KEYCLOAK_ADMIN_API,
  KEYCLOAK_TOKEN_URL,
} from "./constants.js";

let cachedAdminToken;
let cachedAdminTokenExpiresAt = 0;
let pendingAdminToken;

async function requestAdminAccessToken() {
  const body = new URLSearchParams();

  body.append("grant_type", "client_credentials");
  body.append("client_id", KEYCLOAK_ADMIN_CLIENT_ID);
  body.append("client_secret", KEYCLOAK_ADMIN_CLIENT_SECRET);

  const res = await fetch(KEYCLOAK_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Failed to get admin token: ${errorText}`);
  }

  const data = await res.json();
  if (!data.access_token) throw new Error("Keycloak admin token response was invalid");

  cachedAdminToken = data.access_token;
  cachedAdminTokenExpiresAt =
    Date.now() + Math.max(1, Number(data.expires_in || 60) - 30) * 1000;
  return cachedAdminToken;
}

export async function getAdminAccessToken() {
  if (cachedAdminToken && Date.now() < cachedAdminTokenExpiresAt) {
    return cachedAdminToken;
  }

  pendingAdminToken ??= requestAdminAccessToken().finally(() => {
    pendingAdminToken = undefined;
  });
  return pendingAdminToken;
}

export async function keycloakAdminFetch(path, options = {}) {
  async function send(token) {
    return fetch(`${KEYCLOAK_ADMIN_API}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
      cache: "no-store",
      signal: options.signal || AbortSignal.timeout(10_000),
    });
  }

  const token = await getAdminAccessToken();
  const response = await send(token);
  if (response.status !== 401) return response;

  if (cachedAdminToken === token) cachedAdminTokenExpiresAt = 0;
  return send(await getAdminAccessToken());
}

export async function keycloakAdminFetchAll(path, pageSize = 100) {
  const items = [];
  const separator = path.includes("?") ? "&" : "?";

  for (let first = 0; ; first += pageSize) {
    const response = await keycloakAdminFetch(
      `${path}${separator}first=${first}&max=${pageSize}`,
    );
    if (!response.ok) throw new Error((await response.text()) || "Keycloak list request failed");
    const page = await response.json();
    if (!Array.isArray(page)) throw new Error("Keycloak list response was invalid");
    items.push(...page);
    if (page.length < pageSize) return items;
  }
}
