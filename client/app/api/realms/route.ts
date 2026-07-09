import { NextResponse } from "next/server";
import { requireRealmAdmin } from "../../lib/api-auth";
import { keycloakAdminFetch } from "../../lib/keycloak";
import { getKeycloakError } from "../../lib/keycloak-users";
import { normalizeObjectTextFields } from "../../lib/english-normalizer";

export async function GET() {
  const unauthorized = await requireRealmAdmin();
  if (unauthorized) return unauthorized;

  try {
    const res = await keycloakAdminFetch("");

    if (!res.ok) {
      return NextResponse.json(
        { error: await getKeycloakError(res, "Failed to fetch realm") },
        { status: res.status },
      );
    }

    const realm = await res.json();

    return NextResponse.json({
      realm: realm.realm,
      displayName: realm.displayName || "",
      enabled: realm.enabled,
      sslRequired: realm.sslRequired,
      registrationAllowed: realm.registrationAllowed,
      loginWithEmailAllowed: realm.loginWithEmailAllowed,
      duplicateEmailsAllowed: realm.duplicateEmailsAllowed,
      editUsernameAllowed: realm.editUsernameAllowed,
      resetPasswordAllowed: realm.resetPasswordAllowed,
      rememberMe: realm.rememberMe,
      verifyEmail: realm.verifyEmail,
      bruteForceProtected: realm.bruteForceProtected,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: await getKeycloakError(err, "Failed to fetch realm") },
      { status: 500 },
    );
  }
}

export async function PUT(req: Request) {
  const unauthorized = await requireRealmAdmin();
  if (unauthorized) return unauthorized;

  try {
    const body = normalizeObjectTextFields(await req.json(), ["displayName"]);

    const res = await keycloakAdminFetch("", {
      method: "PUT",
      body: JSON.stringify({
        displayName: body.displayName,
        enabled: Boolean(body.enabled),
        registrationAllowed: Boolean(body.registrationAllowed),
        loginWithEmailAllowed: Boolean(body.loginWithEmailAllowed),
        duplicateEmailsAllowed: Boolean(body.duplicateEmailsAllowed),
        editUsernameAllowed: Boolean(body.editUsernameAllowed),
        resetPasswordAllowed: Boolean(body.resetPasswordAllowed),
        rememberMe: Boolean(body.rememberMe),
        verifyEmail: Boolean(body.verifyEmail),
        bruteForceProtected: Boolean(body.bruteForceProtected),
      }),
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: await getKeycloakError(res, "Failed to update realm") },
        { status: res.status },
      );
    }

    return NextResponse.json({ message: "Realm updated successfully" });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: await getKeycloakError(err, "Failed to update realm") },
      { status: 500 },
    );
  }
}
