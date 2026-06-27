import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "../../../lib/auth";
import { KEYCLOAK_TOKEN_URL } from "../../../lib/constants";
import { getKeycloakError } from "../../../lib/keycloak-users";

type SessionWithRefresh = {
  refreshToken?: string;
};

export async function POST() {
  const session = (await getServerSession(authOptions)) as SessionWithRefresh | null;
  const refreshToken = session?.refreshToken;

  if (!refreshToken) {
    return NextResponse.json({ ok: true, message: "No Keycloak refresh token was present" });
  }

  const body = new URLSearchParams();
  body.append("client_id", process.env.KEYCLOAK_CLIENT_ID || "");
  body.append("refresh_token", refreshToken);

  if (process.env.KEYCLOAK_CLIENT_SECRET) {
    body.append("client_secret", process.env.KEYCLOAK_CLIENT_SECRET);
  }

  const response = await fetch(`${KEYCLOAK_TOKEN_URL.replace(/\/token$/, "/logout")}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });

  if (!response.ok) {
    return NextResponse.json(
      { ok: false, error: await getKeycloakError(response, "Failed to log out from Keycloak") },
      { status: response.status },
    );
  }

  return NextResponse.json({ ok: true });
}
