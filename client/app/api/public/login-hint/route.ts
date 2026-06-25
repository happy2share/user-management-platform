import { NextResponse } from "next/server";
import { keycloakAdminFetch } from "../../../lib/keycloak";
import { findUserByUsername, hasAppMfaConfigured } from "../../../lib/keycloak-users";
import { normalizeObjectTextFields } from "../../../lib/english-normalizer";

type KeycloakCredential = {
  type?: string;
};

async function hasNativeOtp(userId: string) {
  const response = await keycloakAdminFetch(
    `/users/${encodeURIComponent(userId)}/credentials`,
  );

  if (!response.ok) return false;
  const credentials = await response.json();

  return Array.isArray(credentials)
    ? credentials.some((credential: KeycloakCredential) => credential.type === "otp")
    : false;
}

export async function POST(req: Request) {
  try {
    const body = normalizeObjectTextFields(await req.json(), ["username"]);
    const username = body.username?.trim();

    if (!username) {
      return NextResponse.json({ mfaConfigured: false });
    }

    const user = await findUserByUsername(username);

    if (!user?.id) {
      return NextResponse.json({ mfaConfigured: false });
    }

    return NextResponse.json({
      mfaConfigured: hasAppMfaConfigured(user) || (await hasNativeOtp(user.id)),
    });
  } catch {
    return NextResponse.json({ mfaConfigured: false });
  }
}
