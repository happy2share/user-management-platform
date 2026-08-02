import { KEYCLOAK_TOKEN_URL } from "./constants";
import { logError } from "./file-logger.mjs";

export async function verifyPasswordWithKeycloak(username, password) {
  const clientId = process.env.KEYCLOAK_PASSWORD_CHECK_CLIENT_ID || "iam-password-check";
  const clientSecret = process.env.KEYCLOAK_PASSWORD_CHECK_CLIENT_SECRET || "";

  if (!clientSecret) {
    void logError("Keycloak password-check client secret is missing", {
      operation: "keycloak.passwordCheck",
      clientId,
    });
    return {
      ok: false,
      status: 500,
      error: "Password verification is unavailable",
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
    signal: AbortSignal.timeout(10_000),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: data.error_description || data.error || "Invalid username or password",
    };
  }

  if (data.refresh_token) {
    const logoutBody = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: data.refresh_token,
    });
    const logoutUrl = KEYCLOAK_TOKEN_URL.replace(/\/token$/, "/logout");
    const logoutResponse = await fetch(logoutUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: logoutBody,
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });

    if (!logoutResponse.ok) {
      void logError("Keycloak password-check session cleanup failed", {
        operation: "keycloak.passwordCheck.cleanup",
        clientId,
        username,
        status: logoutResponse.status,
      });
    }
  }

  return { ok: true, status: 200, error: "" };
}
