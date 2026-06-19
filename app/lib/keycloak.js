import {
  KEYCLOAK_ADMIN_CLIENT_ID,
  KEYCLOAK_ADMIN_CLIENT_SECRET,
  KEYCLOAK_ADMIN_API,
  KEYCLOAK_TOKEN_URL,
} from "./constants";

export async function getAdminAccessToken() {
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
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Failed to get admin token: ${errorText}`);
  }

  const data = await res.json();
  return data.access_token;
}

export async function keycloakAdminFetch(path, options = {}) {
  const token = await getAdminAccessToken();

  const res = await fetch(`${KEYCLOAK_ADMIN_API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    cache: "no-store",
  });

  return res;
}
