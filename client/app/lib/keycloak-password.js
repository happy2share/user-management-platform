import { KEYCLOAK_TOKEN_URL } from "./constants";

export async function verifyPasswordWithKeycloak(username, password) {
  const clientId = process.env.KEYCLOAK_PASSWORD_CHECK_CLIENT_ID || "iam-password-check";
  const clientSecret = process.env.KEYCLOAK_PASSWORD_CHECK_CLIENT_SECRET || "";

  if (!clientSecret) {
    return {
      ok: false,
      status: 500,
      error:
        "KEYCLOAK_PASSWORD_CHECK_CLIENT_SECRET is missing. Add iam-password-check client secret to Next.js env and restart the app.",
    };
  }

  const body = new URLSearchParams();
  body.append("grant_type", "password");
  body.append("client_id", clientId);
  body.append("client_secret", clientSecret);
  body.append("username", username);
  body.append("password", password);
  body.append("scope", "openid profile email");

  const response = await fetch(KEYCLOAK_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: data.error_description || data.error || "Invalid username or password",
    };
  }

  return { ok: true, status: 200, error: "" };
}
