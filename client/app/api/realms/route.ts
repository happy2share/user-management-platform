import { ApiNextResponse as NextResponse } from "@/app/lib/api-response";
import { requireRealmAdmin } from "../../lib/api-auth";
import { keycloakAdminFetch } from "../../lib/keycloak";
import { normalizeObjectTextFields } from "../../i18n/english-normalizer";

export async function GET() {
  const unauthorized = await requireRealmAdmin();
  if (unauthorized) return unauthorized;

  try {
    const res = await keycloakAdminFetch("");

    if (!res.ok) {
      return NextResponse.json(
        { error: await res.text() },
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
      resetPasswordAllowed: realm.resetPasswordAllowed,
      rememberMe: realm.rememberMe,
      verifyEmail: realm.verifyEmail,
      bruteForceProtected: realm.bruteForceProtected,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch realm" },
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
        sslRequired: body.sslRequired || "external",
        registrationAllowed: Boolean(body.registrationAllowed),
        loginWithEmailAllowed: Boolean(body.loginWithEmailAllowed),
        duplicateEmailsAllowed: Boolean(body.duplicateEmailsAllowed),
        resetPasswordAllowed: Boolean(body.resetPasswordAllowed),
        rememberMe: Boolean(body.rememberMe),
        verifyEmail: Boolean(body.verifyEmail),
        bruteForceProtected: Boolean(body.bruteForceProtected),
      }),
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: await res.text() },
        { status: res.status },
      );
    }

    return NextResponse.json({ message: "Realm updated successfully" });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to update realm" },
      { status: 500 },
    );
  }
}
