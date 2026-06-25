import { NextResponse } from "next/server";
import { requireRealmAdmin } from "../../lib/api-auth";
import { keycloakAdminFetch } from "../../lib/keycloak";
import { getKeycloakError } from "../../lib/keycloak-users";
import { KEYCLOAK_BASE_URL, KEYCLOAK_REALM, KEYCLOAK_ADMIN_CLIENT_ID } from "../../lib/constants";
import { normalizeObjectTextFields } from "../../lib/english-normalizer";

export async function GET() {
  const unauthorized = await requireRealmAdmin();
  if (unauthorized) return unauthorized;

  try {
    const res = await keycloakAdminFetch("");
    if (!res.ok) throw new Error(await getKeycloakError(res, "Failed to fetch settings"));
    const realm = await res.json();

    return NextResponse.json({
      keycloakBaseUrl: KEYCLOAK_BASE_URL,
      realmName: KEYCLOAK_REALM,
      adminClientId: KEYCLOAK_ADMIN_CLIENT_ID,
      nextAuthUrl: process.env.NEXTAUTH_URL,
      enabled: Boolean(realm.enabled),
      displayName: realm.displayName || "",
      registrationAllowed: Boolean(realm.registrationAllowed),
      resetPasswordAllowed: Boolean(realm.resetPasswordAllowed),
      rememberMe: Boolean(realm.rememberMe),
      loginWithEmailAllowed: Boolean(realm.loginWithEmailAllowed),
      duplicateEmailsAllowed: Boolean(realm.duplicateEmailsAllowed),
      editUsernameAllowed: Boolean(realm.editUsernameAllowed),
      verifyEmail: Boolean(realm.verifyEmail),
    });
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to load settings" }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  const unauthorized = await requireRealmAdmin();
  if (unauthorized) return unauthorized;

  try {
    const body = normalizeObjectTextFields(await req.json(), ["displayName"]);
    const payload = {
      enabled: Boolean(body.enabled),
      displayName: body.displayName || "",
      registrationAllowed: Boolean(body.registrationAllowed),
      resetPasswordAllowed: Boolean(body.resetPasswordAllowed),
      rememberMe: Boolean(body.rememberMe),
      loginWithEmailAllowed: Boolean(body.loginWithEmailAllowed),
      duplicateEmailsAllowed: Boolean(body.duplicateEmailsAllowed),
      editUsernameAllowed: Boolean(body.editUsernameAllowed),
      verifyEmail: Boolean(body.verifyEmail),
    };

    const res = await keycloakAdminFetch("", { method: "PUT", body: JSON.stringify(payload) });
    if (!res.ok) throw new Error(await getKeycloakError(res, "Failed to update settings"));
    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to save settings" }, { status: 500 });
  }
}
