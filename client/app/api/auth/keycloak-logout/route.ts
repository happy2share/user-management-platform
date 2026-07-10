import { getToken } from "next-auth/jwt";
import type { NextRequest } from "next/server";
import { ApiNextResponse as NextResponse } from "@/app/lib/api-response";
import { logError } from "@/app/lib/file-logger.mjs";
import { KEYCLOAK_TOKEN_URL } from "../../../lib/constants";

type TokenWithRefresh = {
  refreshToken?: string;
};

export async function POST(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET }) as
    | TokenWithRefresh
    | null;
  const refreshToken = token?.refreshToken;

  if (!refreshToken) {
    return NextResponse.json({ ok: true, message: "No Keycloak refresh token was present" });
  }

  const body = new URLSearchParams();
  body.append("client_id", process.env.KEYCLOAK_CLIENT_ID || "");
  body.append("refresh_token", refreshToken);

  if (process.env.KEYCLOAK_CLIENT_SECRET) {
    body.append("client_secret", process.env.KEYCLOAK_CLIENT_SECRET);
  }

  let response: Response;
  try {
    response = await fetch(`${KEYCLOAK_TOKEN_URL.replace(/\/token$/, "/logout")}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    void logError("Keycloak logout request failed", {
      endpoint: "/api/auth/keycloak-logout",
      method: "POST",
      operation: "keycloak.logout",
      error,
    });
    return NextResponse.json(
      { ok: false, error: "Keycloak logout is unavailable" },
      { status: error instanceof DOMException && error.name === "TimeoutError" ? 504 : 502 },
    );
  }

  if (!response.ok) {
    void logError("Keycloak logout failed", {
      endpoint: "/api/auth/keycloak-logout",
      method: "POST",
      operation: "keycloak.logout",
      status: response.status,
    });
    return NextResponse.json(
      { ok: false, error: "Keycloak logout failed" },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true });
}
